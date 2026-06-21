import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  assertAllowlistMatchesDataset,
  assertPrivacySafe,
  assertSummaryConsistent,
} from "./lib/benchmark-validation.mjs";

const root = path.resolve(".");
const filenames = process.argv.slice(2);
if (filenames.length === 0) {
  filenames.push("data/bvrtu-public-repo-audit.json");
  try {
    await readFile(path.join(root, "data/external-benchmark-v3.json"));
    filenames.push("data/external-benchmark-v3.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const manifest = JSON.parse(
  await readFile(path.join(root, "data/benchmark-allowlist.json"), "utf8"),
);
const manifestSchema = JSON.parse(
  await readFile(
    path.join(
      root,
      `data/schemas/benchmark-allowlist-v${manifest.manifestVersion}.schema.json`,
    ),
    "utf8",
  ),
);
validateWithSchema(manifest, manifestSchema, "data/benchmark-allowlist.json");
for (const inputName of filenames) {
  const filename = path.resolve(inputName);
  const dataset = JSON.parse(await readFile(filename, "utf8"));
  const schemaName = path.join(
    root,
    `data/schemas/benchmark-v${dataset.schemaVersion}.schema.json`,
  );
  const schema = JSON.parse(await readFile(schemaName, "utf8"));
  validateWithSchema(dataset, schema, path.relative(root, filename));
  assertPrivacySafe(dataset);
  assertSummaryConsistent(dataset);
  if (dataset.schemaVersion === 3)
    assertAllowlistMatchesDataset(manifest, dataset);
  process.stdout.write(
    `Benchmark validation passed: ${path.relative(root, filename)} (schema v${dataset.schemaVersion}).\n`,
  );
}

function validateWithSchema(value, schema, label) {
  const validate = ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(
      `${label} failed JSON Schema validation:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    );
  }
}
