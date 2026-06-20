import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve("examples/demo");
const cli = path.resolve("dist/cli.js");
const temporaryDirectory = await mkdtemp(
  path.join(tmpdir(), "erroratlas-demo-"),
);
const generatedSarif = path.join(temporaryDirectory, "openapi-drift.sarif");

try {
  const clean = await run(
    "check",
    root,
    "--openapi",
    "openapi.yaml",
    "--format",
    "json",
  );
  const cleanReport = JSON.parse(clean.stdout);
  assert(
    cleanReport.diagnostics.length === 0,
    "matching demo catalog and OpenAPI contract should have no diagnostics",
  );

  const drift = await runExpectingFailure(
    "check",
    root,
    "--openapi",
    "openapi-drift.yaml",
    "--format",
    "sarif",
    "--output",
    generatedSarif,
  );
  assert(drift.code === 1, "the intentionally drifted contract should fail");

  const generated = JSON.parse(await readFile(generatedSarif, "utf8"));
  const committed = JSON.parse(
    await readFile(path.join(root, "output", "openapi-drift.sarif"), "utf8"),
  );
  assert(
    JSON.stringify(generated) === JSON.stringify(committed),
    "the committed SARIF demo should match current ErrorAtlas output",
  );

  const ruleIds = generated.runs[0].results.map((result) => result.ruleId);
  assert(
    JSON.stringify(ruleIds) ===
      JSON.stringify([
        "openapi-stale-error",
        "openapi-undocumented-error",
        "openapi-status-drift",
      ]),
    "the drift demo should cover missing, status-drifted, and stale errors",
  );

  process.stdout.write(
    "Demo smoke test passed: catalog/OpenAPI alignment and reproducible SARIF drift.\n",
  );
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function run(...args) {
  return exec(process.execPath, [cli, ...args], { encoding: "utf8" });
}

async function runExpectingFailure(...args) {
  try {
    await run(...args);
    throw new Error("Command unexpectedly succeeded");
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return error;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
