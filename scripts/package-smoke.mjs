import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const projectRoot = process.cwd();
const { version: packageVersion } = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const root = await mkdtemp(path.join(tmpdir(), "erroratlas-package-"));
const packDir = path.join(root, "pack");
const consumerDir = path.join(root, "consumer");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  await mkdir(packDir);
  await mkdir(consumerDir);

  const packed = await run(
    npm,
    ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir],
    projectRoot,
  );
  const [{ filename }] = JSON.parse(packed.stdout);
  const tarball = path.join(packDir, filename);

  await writeFile(
    path.join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "erroratlas-package-smoke",
        version: "1.0.0",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(consumerDir, "example.ts"),
    'throw new AppError("PAYMENT_DECLINED", "Payment was declined", 402);\n',
  );

  await run(
    npm,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    consumerDir,
  );

  const cli = path.join(
    consumerDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "erroratlas.cmd" : "erroratlas",
  );
  const version = await run(cli, ["--version"], consumerDir);
  assert(
    version.stdout.trim() === packageVersion,
    `installed CLI version should be ${packageVersion}`,
  );

  await run(
    cli,
    [
      "generate",
      ".",
      "--catalog",
      "error-catalog.json",
      "--docs",
      "error-catalog.md",
    ],
    consumerDir,
  );

  const catalog = JSON.parse(
    await readFile(path.join(consumerDir, "error-catalog.json"), "utf8"),
  );
  assert(
    catalog.errors[0]?.code === "PAYMENT_DECLINED",
    "installed CLI should generate a catalog from consumer source",
  );
  assert(
    (
      await readFile(path.join(consumerDir, "error-catalog.md"), "utf8")
    ).includes("PAYMENT_DECLINED"),
    "installed CLI should generate Markdown",
  );

  const imported = await run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import("erroratlas").then((m) => { if (!m.scanProject) process.exit(1); });',
    ],
    consumerDir,
  );
  assert(imported.stderr === "", "package entry point should be importable");

  process.stdout.write(
    "Package smoke test passed: tarball install, CLI, catalog generation, and ESM import.\n",
  );
} finally {
  await rm(root, { recursive: true, force: true });
}

function run(command, args, cwd) {
  return exec(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, npm_config_dry_run: "false" },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
