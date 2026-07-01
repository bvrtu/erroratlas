import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import {
  assertAllowlistMatchesDataset,
  assertManifestV2MatchesDataset,
  assertManifestV2Policy,
  assertPrivacySafe,
  assertSummaryArtifactConsistent,
  assertSummaryConsistent,
} from "./lib/benchmark-validation.mjs";

const root = path.resolve(".");
const filenames = process.argv.slice(2);
const explicitFilenames = filenames.length > 0;
if (!explicitFilenames) {
  filenames.push("data/bvrtu-public-repo-audit.json");
  try {
    await readFile(path.join(root, "data/external-benchmark-v3.json"));
    filenames.push("data/external-benchmark-v3.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await readFile(path.join(root, "data/external-benchmark-v4.json"));
    filenames.push("data/external-benchmark-v4.json");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const benchmarkV4Schema = JSON.parse(
  await readFile(
    path.join(root, "data/schemas/benchmark-v4.schema.json"),
    "utf8",
  ),
);
ajv.addSchema(benchmarkV4Schema);
ajv.addSchema(benchmarkV4Schema, "benchmark-v4.schema.json");
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
const manifestV2 = JSON.parse(
  await readFile(path.join(root, "data/benchmark-manifest-v2.json"), "utf8"),
);
const manifestV2Schema = JSON.parse(
  await readFile(
    path.join(root, "data/schemas/benchmark-manifest-v2.schema.json"),
    "utf8",
  ),
);
validateWithSchema(
  manifestV2,
  manifestV2Schema,
  "data/benchmark-manifest-v2.json",
);
assertManifestV2Policy(manifestV2);

const datasetsByName = new Map();
for (const inputName of filenames) {
  const filename = path.resolve(inputName);
  const dataset = JSON.parse(await readFile(filename, "utf8"));
  datasetsByName.set(path.relative(root, filename), dataset);
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
  if (dataset.schemaVersion === 4)
    assertManifestV2MatchesDataset(manifestV2, dataset);
  process.stdout.write(
    `Benchmark validation passed: ${path.relative(root, filename)} (schema v${dataset.schemaVersion}).\n`,
  );
}
try {
  const summaryName = "data/external-benchmark-summary-v1.json";
  const summary = JSON.parse(
    await readFile(path.join(root, summaryName), "utf8"),
  );
  const summarySchema = JSON.parse(
    await readFile(
      path.join(root, "data/schemas/benchmark-summary-v1.schema.json"),
      "utf8",
    ),
  );
  validateWithSchema(summary, summarySchema, summaryName);
  assertPrivacySafe(summary);
  const sourceDataset = datasetsByName.get(summary.sourceDataset);
  if (!sourceDataset && !explicitFilenames) {
    throw new Error(
      `${summaryName} references a dataset that was not validated: ${summary.sourceDataset}`,
    );
  }
  if (sourceDataset) {
    assertSummaryArtifactConsistent(summary, sourceDataset);
    process.stdout.write(
      `Benchmark validation passed: ${summaryName} (summary schema v${summary.schemaVersion}).\n`,
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function validateWithSchema(value, schema, label) {
  const validate =
    (schema.$id ? ajv.getSchema(schema.$id) : undefined) ?? ajv.compile(schema);
  if (!validate(value)) {
    throw new Error(
      `${label} failed JSON Schema validation:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    );
  }
}
