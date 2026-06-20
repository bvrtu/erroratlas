import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = await mkdtemp(path.join(tmpdir(), "erroratlas-cli-"));
const cli = path.resolve("dist/cli.js");

try {
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "src", "service.ts"),
    'throw new AppError("SERVICE_DOWN", "Service is unavailable", { status: 503 });\n',
  );

  const generated = await run("generate", root);
  assert(
    generated.stdout.includes("1 structured errors"),
    "generate should find one error",
  );

  const catalog = JSON.parse(
    await readFile(path.join(root, "erroratlas.catalog.json"), "utf8"),
  );
  assert(
    catalog.errors[0].code === "SERVICE_DOWN",
    "generate should write the detected code",
  );
  assert(
    await readFile(path.join(root, "docs", "errors.md"), "utf8"),
    "generate should write Markdown",
  );

  const clean = await run("check", root, "--format", "json");
  assert(
    JSON.parse(clean.stdout).diagnostics.length === 1,
    "empty resolution should be a note",
  );

  await writeFile(
    path.join(root, "openapi.yaml"),
    `openapi: 3.1.0
paths:
  /service:
    get:
      responses:
        "502":
          content:
            application/json:
              example:
                code: SERVICE_DOWN
                message: Service is unavailable
`,
  );
  const openapiDrift = await runExpectingFailure(
    "check",
    root,
    "--openapi",
    "openapi.yaml",
    "--format",
    "json",
  );
  assert(
    JSON.parse(openapiDrift.stdout).diagnostics.some(
      (item) => item.ruleId === "openapi-status-drift",
    ),
    "OpenAPI comparison should report status drift",
  );

  await writeFile(
    path.join(root, "src", "service.ts"),
    'throw new AppError("SERVICE_DOWN", "Upstream service failed", { status: 503 });\n',
  );
  const drift = await runExpectingFailure("check", root, "--format", "json");
  assert(drift.code === 1, "catalog drift should exit with code 1");
  assert(
    JSON.parse(drift.stdout).diagnostics.some(
      (item) => item.ruleId === "message-drift",
    ),
    "catalog drift should report message-drift",
  );

  await writeFile(
    path.join(root, "src", "response.ts"),
    'res.status(404).json({ error: "User was not found" });\n',
  );
  const fixPreview = await run("fix", root);
  assert(
    fixPreview.stdout.includes("USER_WAS_NOT_FOUND"),
    "fix should preview a generated response code",
  );
  await run("fix", root, "--write");
  assert(
    (await readFile(path.join(root, "src", "response.ts"), "utf8")).includes(
      'code: "USER_WAS_NOT_FOUND"',
    ),
    "fix --write should add the generated response code",
  );

  await run("generate", root);
  await run("enrich", root, "--write");
  const enriched = JSON.parse(
    await readFile(path.join(root, "erroratlas.catalog.json"), "utf8"),
  );
  assert(
    enriched.errors.every((item) => item.description && item.resolution),
    "enrich --write should fill empty documentation fields",
  );

  const runtimeFile = path.join(root, "runtime.jsonl");
  await writeFile(
    runtimeFile,
    `${JSON.stringify({
      schemaVersion: 1,
      id: "event-1",
      type: "exception",
      occurredAt: "2026-06-20T00:00:00.000Z",
      service: "smoke",
      environment: "test",
      traceId: null,
      handled: false,
      mechanism: "unhandledRejection",
      code: null,
      status: null,
      error: { name: "Error", message: "Failed", stack: null },
      tags: {},
    })}\n`,
  );
  const runtimeReport = await run(
    "runtime-report",
    runtimeFile,
    "--format",
    "json",
  );
  assert(
    JSON.parse(runtimeReport.stdout).unhandledExceptions === 1,
    "runtime-report should summarize collected events",
  );

  process.stdout.write(
    "CLI smoke test passed: catalog, OpenAPI, fixes, enrichment, and runtime reporting.\n",
  );
} finally {
  await rm(root, { recursive: true, force: true });
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
