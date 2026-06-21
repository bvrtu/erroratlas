const FORBIDDEN_PUBLIC_FIELDS = new Set([
  "scan",
  "source",
  "message",
  "detail",
  "code",
  "file",
  "path",
  "location",
  "occurrences",
  "errors",
  "stack",
  "trace",
  "secret",
  "token",
  "password",
  "credential",
  "apikey",
  "privatekey",
  "privatemetadata",
  "errormessage",
  "errormessages",
  "errorcode",
  "errorcodes",
  "filepath",
  "filepaths",
  "rawfinding",
  "rawfindings",
]);
const SECRET_BEARING_FIELD_SUFFIXES = [
  "secret",
  "token",
  "password",
  "credential",
  "apikey",
  "privatekey",
  "privatemetadata",
];

export function assertPrivacySafe(value, key = "dataset") {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z]/g, "");
  if (
    FORBIDDEN_PUBLIC_FIELDS.has(normalizedKey) ||
    SECRET_BEARING_FIELD_SUFFIXES.some((suffix) =>
      normalizedKey.endsWith(suffix),
    )
  ) {
    throw new Error(`privacy-sensitive field is forbidden: ${key}`);
  }
  if (Array.isArray(value)) {
    for (const item of value) assertPrivacySafe(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [childKey, child] of Object.entries(value)) {
    assertPrivacySafe(child, childKey);
  }
}

export function assertSummaryConsistent(dataset) {
  if (dataset.schemaVersion === 2) return assertV2Summary(dataset);
  if (dataset.schemaVersion === 3) return assertV3Summary(dataset);
  throw new Error(
    `unsupported benchmark schema version: ${dataset.schemaVersion}`,
  );
}

export function assertAllowlistMatchesDataset(manifest, dataset) {
  assertEqual(
    dataset.datasetVersion,
    manifest.datasetVersion,
    "v3 datasetVersion",
  );
  assertEqual(dataset.generatedAt, manifest.generatedAt, "v3 generatedAt");
  assertEqual(
    dataset.repositories.length,
    manifest.repositories.length,
    "v3 target count",
  );
  const targets = new Map(
    manifest.repositories.map((target) => [target.repository, target]),
  );
  for (const repository of dataset.repositories) {
    const target = targets.get(repository.repository);
    if (!target)
      throw new Error(
        `v3 target is not allow-listed: ${repository.repository}`,
      );
    assertEqual(repository.url, target.url, `${repository.repository} url`);
    assertEqual(
      repository.commit,
      target.commit,
      `${repository.repository} commit`,
    );
    assertEqual(
      repository.category,
      target.category,
      `${repository.repository} category`,
    );
    assertEqual(
      repository.licenseEvidence.spdxId,
      target.license.spdxId,
      `${repository.repository} license SPDX`,
    );
    assertEqual(
      repository.licenseEvidence.sha256,
      target.license.sha256,
      `${repository.repository} license hash`,
    );
    assertEqual(
      repository.licenseEvidence.url,
      `${target.url}/blob/${target.commit}/${target.license.filename}`,
      `${repository.repository} license URL`,
    );
  }
}

function assertV2Summary(dataset) {
  const rows = dataset.repositories;
  const expected = {
    repositories: rows.length,
    scannedRepositories: rows.filter((row) => row.status === "scanned").length,
    failedRepositories: rows.filter((row) => row.status === "failed").length,
    filesScanned: sum(rows, "filesScanned"),
    structuredErrors: sum(rows, "structuredErrors"),
    unstructuredErrors: sum(rows, "unstructuredErrors"),
    uniqueStructuredCodes: sum(rows, "uniqueStructuredCodes"),
    documentedStructuredCodes: sum(rows, "documentedStructuredCodes"),
    statusFamilies: mergeMaps(rows.map((row) => row.statusFamilies)),
  };
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(dataset.summary[key], value, `v2 summary.${key}`);
  }
  assertEqual(
    dataset.summary.structuredRate,
    ratio(
      expected.structuredErrors,
      expected.structuredErrors + expected.unstructuredErrors,
    ),
    "v2 summary.structuredRate",
  );
  assertEqual(
    dataset.summary.codeDensity,
    ratio(
      expected.structuredErrors + expected.unstructuredErrors,
      expected.filesScanned,
    ),
    "v2 summary.codeDensity",
  );
  assertEqual(
    dataset.summary.documentationCoverage,
    ratio(expected.documentedStructuredCodes, expected.uniqueStructuredCodes),
    "v2 summary.documentationCoverage",
  );
}

function assertV3Summary(dataset) {
  const rows = dataset.repositories;
  const metrics = rows.map((row) => row.metrics);
  const structuredOccurrences = sum(metrics, "structuredOccurrences");
  const unstructuredOccurrences = sum(metrics, "unstructuredOccurrences");
  const uniqueStructuredIdentities = sum(metrics, "uniqueStructuredIdentities");
  const documentedStructuredIdentities = sum(
    metrics,
    "documentedStructuredIdentities",
  );
  const problemDetailsOccurrences = sum(metrics, "problemDetailsOccurrences");
  const expected = {
    repositories: rows.length,
    filesScanned: sum(metrics, "filesScanned"),
    structuredOccurrences,
    unstructuredOccurrences,
    uniqueStructuredIdentities,
    documentedStructuredIdentities,
    problemDetailsOccurrences,
    openapiDriftCount: nullableSum(metrics, "openapiDriftCount"),
    baselineDebtCount: nullableSum(metrics, "baselineDebtCount"),
    netNewDriftCount: nullableSum(metrics, "netNewDriftCount"),
    confidenceDistribution: mergeMaps(
      metrics.map((row) => row.confidenceDistribution),
    ),
    categories: countBy(rows.map((row) => row.category)),
    statusFamilies: mergeMaps(metrics.map((row) => row.statusFamilies)),
    limitations: mergeMaps(metrics.map((row) => row.limitations)),
  };
  for (const [key, value] of Object.entries(expected)) {
    assertEqual(dataset.summary[key], value, `v3 summary.${key}`);
  }
  assertEqual(
    dataset.summary.structuredRatio,
    ratio(
      structuredOccurrences,
      structuredOccurrences + unstructuredOccurrences,
    ),
    "v3 summary.structuredRatio",
  );
  assertEqual(
    dataset.summary.codeDensity,
    ratio(
      structuredOccurrences + unstructuredOccurrences,
      expected.filesScanned,
    ),
    "v3 summary.codeDensity",
  );
  assertEqual(
    dataset.summary.documentationCoverage,
    ratio(documentedStructuredIdentities, uniqueStructuredIdentities),
    "v3 summary.documentationCoverage",
  );
  assertEqual(
    dataset.summary.problemDetailsCoverage,
    ratio(problemDetailsOccurrences, structuredOccurrences),
    "v3 summary.problemDetailsCoverage",
  );
}

function nullableSum(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => value !== null);
  return values.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : round(numerator / denominator);
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function countBy(values) {
  return mergeMaps(values.map((value) => ({ [value]: 1 })));
}

function mergeMaps(maps) {
  const merged = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map ?? {})) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return Object.fromEntries(
    Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} is inconsistent: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}
