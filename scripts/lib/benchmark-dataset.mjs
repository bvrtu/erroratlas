export function repositoryMetrics(scan, catalog) {
  const structured = scan.errors.filter((error) => error.structured);
  const unstructured = scan.errors.filter((error) => !error.structured);
  const identities = new Set(
    structured.map((error) => error.code).filter(Boolean),
  );
  const catalogIdentities = new Set(
    catalog?.errors.map((entry) => entry.code) ?? [],
  );
  const documented = [...identities].filter((code) =>
    catalogIdentities.has(code),
  ).length;
  const problemDetailsOccurrences = structured.filter(
    (error) => error.problem,
  ).length;

  return {
    filesScanned: scan.filesScanned,
    structuredOccurrences: structured.length,
    unstructuredOccurrences: unstructured.length,
    structuredRatio: ratio(structured.length, scan.errors.length),
    codeDensity: ratio(scan.errors.length, scan.filesScanned),
    uniqueStructuredIdentities: identities.size,
    documentedStructuredIdentities: documented,
    documentationCoverage: ratio(documented, identities.size),
    openapiDriftCount: null,
    problemDetailsOccurrences,
    problemDetailsCoverage: ratio(problemDetailsOccurrences, structured.length),
    baselineDebtCount: null,
    netNewDriftCount: null,
    confidenceDistribution: {
      proven: scan.errors.filter(
        (error) => error.evidence?.confidence === "proven",
      ).length,
      partial: scan.errors.filter(
        (error) => error.evidence?.confidence !== "proven",
      ).length,
    },
    languages: countBy(scan.errors, (error) => error.language),
    statusFamilies: countBy(
      structured.filter((error) => error.status !== null),
      (error) => `${Math.floor(error.status / 100)}xx`,
    ),
    limitations: {
      "baseline-not-evaluated": 1,
      "openapi-not-evaluated": 1,
      ...(catalog ? {} : { "catalog-not-present": 1 }),
    },
  };
}

export function buildBenchmarkDataset({ manifest, toolVersion, repositories }) {
  const metrics = repositories.map((repository) => repository.metrics);
  const structuredOccurrences = sum(metrics, "structuredOccurrences");
  const unstructuredOccurrences = sum(metrics, "unstructuredOccurrences");
  const uniqueStructuredIdentities = sum(metrics, "uniqueStructuredIdentities");
  const documentedStructuredIdentities = sum(
    metrics,
    "documentedStructuredIdentities",
  );
  const problemDetailsOccurrences = sum(metrics, "problemDetailsOccurrences");

  return {
    schemaVersion: 3,
    datasetVersion: manifest.datasetVersion,
    generatedAt: manifest.generatedAt,
    tool: { name: "erroratlas", version: toolVersion },
    license: "CC-BY-4.0",
    privacy: {
      scope: "allow-listed public repositories; aggregates only",
      excluded: [
        "source code",
        "error messages",
        "error identities",
        "file paths",
        "raw scan payloads",
        "stack traces",
        "private repository metadata",
      ],
    },
    summary: {
      repositories: repositories.length,
      filesScanned: sum(metrics, "filesScanned"),
      structuredOccurrences,
      unstructuredOccurrences,
      structuredRatio: ratio(
        structuredOccurrences,
        structuredOccurrences + unstructuredOccurrences,
      ),
      codeDensity: ratio(
        structuredOccurrences + unstructuredOccurrences,
        sum(metrics, "filesScanned"),
      ),
      uniqueStructuredIdentities,
      documentedStructuredIdentities,
      documentationCoverage: ratio(
        documentedStructuredIdentities,
        uniqueStructuredIdentities,
      ),
      openapiDriftCount: nullableSum(metrics, "openapiDriftCount"),
      problemDetailsOccurrences,
      problemDetailsCoverage: ratio(
        problemDetailsOccurrences,
        structuredOccurrences,
      ),
      baselineDebtCount: nullableSum(metrics, "baselineDebtCount"),
      netNewDriftCount: nullableSum(metrics, "netNewDriftCount"),
      confidenceDistribution: mergeMaps(
        metrics.map((row) => row.confidenceDistribution),
      ),
      categories: countBy(repositories, (repository) => repository.category),
      statusFamilies: mergeMaps(metrics.map((row) => row.statusFamilies)),
      limitations: mergeMaps(metrics.map((row) => row.limitations)),
    },
    repositories,
  };
}

export function renderBenchmarkMarkdown(dataset) {
  const summary = dataset.summary;
  const lines = [
    "# External benchmark snapshot",
    "",
    `Dataset **${dataset.datasetVersion}** was produced by ErrorAtlas **${dataset.tool.version}** from ` +
      `**${summary.repositories}** explicitly allow-listed public repositories pinned to exact commits.`,
    "",
    "This is a reproducibility and detector-boundary dataset, not a quality ranking. Zero structured detections can mean that a project uses patterns outside ErrorAtlas's conservative profiles; it does not mean the project has no error handling.",
    "",
    "## Aggregate metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Files scanned | ${summary.filesScanned} |`,
    `| Structured occurrences | ${summary.structuredOccurrences} |`,
    `| Unstructured occurrences | ${summary.unstructuredOccurrences} |`,
    `| Structured ratio | ${percent(summary.structuredRatio)} |`,
    `| Code density | ${decimal(summary.codeDensity)} |`,
    `| Documentation coverage | ${percent(summary.documentationCoverage)} |`,
    `| Problem Details coverage | ${percent(summary.problemDetailsCoverage)} |`,
    "",
    "## Repository coordinates",
    "",
    "| Repository | Category | Commit | License | Files | Structured | Unstructured |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
    ...dataset.repositories.map(
      (repository) =>
        `| [${repository.repository}](${repository.url}) | ${repository.category} | ` +
        `\`${repository.commit.slice(0, 12)}\` | ${repository.licenseEvidence.spdxId} | ` +
        `${repository.metrics.filesScanned} | ${repository.metrics.structuredOccurrences} | ` +
        `${repository.metrics.unstructuredOccurrences} |`,
    ),
    "",
    "## Interpretation and privacy",
    "",
    "The committed JSON contains repository coordinates, license evidence, and aggregate counts only. It excludes source, paths, messages, identities, raw findings, stack traces, and private metadata. OpenAPI, baselines, and catalogs are reported as not evaluated when they are absent; no value is imputed.",
    "",
    "Reproduce with `npm run benchmark:external` after building. CI validates the committed snapshot against JSON Schema, privacy-field denial rules, and recomputed totals without making network calls.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function countBy(items, key) {
  return mergeMaps(items.map((item) => ({ [key(item)]: 1 })));
}

function mergeMaps(maps) {
  const result = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map ?? {})) {
      result[key] = (result[key] ?? 0) + value;
    }
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}

function nullableSum(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => value !== null);
  return values.length
    ? values.reduce((total, value) => total + value, 0)
    : null;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : round(numerator / denominator);
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function percent(value) {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function decimal(value) {
  return value === null ? "n/a" : value.toFixed(4);
}
