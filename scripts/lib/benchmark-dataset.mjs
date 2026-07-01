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

export function repositoryMetricsV4({
  scan,
  catalog,
  ecosystem,
  filesByLanguage,
  openapiDocumentCount,
  scanDurationMs,
}) {
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
  const apiResponseOccurrences = scan.errors.filter((error) =>
    isApiResponse(error),
  ).length;
  const occurrenceCount = scan.errors.length;
  const unsupportedPatternCategories = countBy(
    scan.diagnostics.filter(
      (diagnostic) => diagnostic.ruleId === "unstructured-error",
    ),
    (diagnostic) => diagnostic.ruleId,
  );

  return {
    filesScanned: scan.filesScanned,
    filesByLanguage,
    filesByEcosystem: scan.filesScanned
      ? { [ecosystem]: scan.filesScanned }
      : {},
    occurrenceCount,
    structuredOccurrences: structured.length,
    unstructuredOccurrences: unstructured.length,
    structuredRatio: ratio(structured.length, occurrenceCount),
    codeDensity: ratio(occurrenceCount, scan.filesScanned),
    uniqueStructuredIdentities: identities.size,
    documentedStructuredIdentities: documented,
    documentationCoverage: ratio(documented, identities.size),
    openapiDocumentCount,
    openapiDriftCount: null,
    problemDetailsOccurrences,
    problemDetailsCoverage: ratio(problemDetailsOccurrences, structured.length),
    baselineDebtCount: null,
    netNewDriftCount: null,
    confidenceDistribution: {
      proven: scan.errors.filter(
        (error) => error.evidence?.confidence === "proven",
      ).length,
      partial: structured.filter(
        (error) => error.evidence?.confidence !== "proven",
      ).length,
      unresolved: unstructured.length,
    },
    apiResponseOccurrences,
    scanDurationMs,
    statusFamilies: countBy(
      structured.filter((error) => error.status !== null),
      (error) => `${Math.floor(error.status / 100)}xx`,
    ),
    extractorLimitations: {
      ...(structured.length + unstructured.length === 0
        ? { "no-error-occurrences-detected": 1 }
        : {}),
      ...(unstructured.length ? { "unstructured-errors-present": 1 } : {}),
    },
    unsupportedPatternCategories,
    limitations: {
      "baseline-not-evaluated": 1,
      ...(openapiDocumentCount
        ? { "openapi-drift-not-evaluated": 1 }
        : { "openapi-not-present": 1 }),
      ...(catalog ? {} : { "catalog-not-present": 1 }),
      ...(scan.filesScanned ? {} : { "source-scan-not-configured": 1 }),
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

export function buildBenchmarkDatasetV4({
  manifest,
  toolVersion,
  repositories,
}) {
  const metrics = repositories.map((repository) => repository.metrics);
  const structuredOccurrences = sum(metrics, "structuredOccurrences");
  const unstructuredOccurrences = sum(metrics, "unstructuredOccurrences");
  const occurrenceCount = sum(metrics, "occurrenceCount");
  const uniqueStructuredIdentities = sum(metrics, "uniqueStructuredIdentities");
  const documentedStructuredIdentities = sum(
    metrics,
    "documentedStructuredIdentities",
  );
  const problemDetailsOccurrences = sum(metrics, "problemDetailsOccurrences");
  const ecosystems = countBy(
    repositories,
    (repository) => repository.ecosystem,
  );

  return {
    schemaVersion: 4,
    datasetVersion: manifest.datasetVersion,
    generatedAt: manifest.generatedAt,
    tool: { name: "erroratlas", version: toolVersion },
    license: "CC-BY-4.0",
    privacy: {
      scope:
        "allow-listed public repositories; aggregate metrics and public provenance only",
      excluded: [
        "source code",
        "raw repository file paths",
        "raw error messages",
        "raw error identities",
        "raw error codes",
        "raw scan payloads",
        "raw findings",
        "stack traces",
        "secrets",
        "tokens",
        "private repository metadata",
      ],
    },
    summary: {
      repositoryCount: repositories.length,
      ecosystemCount: Object.keys(ecosystems).length,
      filesScanned: sum(metrics, "filesScanned"),
      filesByLanguage: mergeMaps(metrics.map((row) => row.filesByLanguage)),
      filesByEcosystem: mergeMaps(metrics.map((row) => row.filesByEcosystem)),
      occurrenceCount,
      structuredOccurrences,
      unstructuredOccurrences,
      structuredRatio: ratio(structuredOccurrences, occurrenceCount),
      codeDensity: ratio(occurrenceCount, sum(metrics, "filesScanned")),
      uniqueStructuredIdentities,
      documentedStructuredIdentities,
      documentationCoverage: ratio(
        documentedStructuredIdentities,
        uniqueStructuredIdentities,
      ),
      openapiDocumentCount: sum(metrics, "openapiDocumentCount"),
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
      apiResponseOccurrences: sum(metrics, "apiResponseOccurrences"),
      scanDurationMs: sum(metrics, "scanDurationMs"),
      failureCount: repositories.filter((row) => row.status === "failed")
        .length,
      skipCount: repositories.filter((row) => row.status === "skipped").length,
      categories: countBy(repositories, (repository) => repository.category),
      ecosystems,
      statusFamilies: mergeMaps(metrics.map((row) => row.statusFamilies)),
      extractorLimitations: mergeMaps(
        metrics.map((row) => row.extractorLimitations),
      ),
      unsupportedPatternCategories: mergeMaps(
        metrics.map((row) => row.unsupportedPatternCategories),
      ),
      limitations: mergeMaps(metrics.map((row) => row.limitations)),
      perEcosystem: ecosystemSummary(repositories),
    },
    repositories,
  };
}

export function buildBenchmarkSummaryArtifact(dataset, sourceDataset) {
  return {
    schemaVersion: 1,
    datasetVersion: dataset.datasetVersion,
    generatedAt: dataset.generatedAt,
    sourceDataset,
    summary: dataset.summary,
  };
}

export function renderBenchmarkMarkdown(dataset) {
  if (dataset.schemaVersion === 4) return renderBenchmarkMarkdownV4(dataset);
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

function renderBenchmarkMarkdownV4(dataset) {
  const summary = dataset.summary;
  const lines = [
    "# External benchmark snapshot",
    "",
    `Dataset **${dataset.datasetVersion}** was produced by ErrorAtlas **${dataset.tool.version}** from ` +
      `**${summary.repositoryCount}** explicitly allow-listed public repositories pinned to exact commits.`,
    "",
    "This is an initial external benchmark expansion for reproducible validation, not an industry-wide benchmark or repository-quality ranking. Conservative extraction may leave findings partial or unresolved instead of guessing identities.",
    "",
    "## Aggregate metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Repositories | ${summary.repositoryCount} |`,
    `| Ecosystems | ${summary.ecosystemCount} |`,
    `| Files scanned | ${summary.filesScanned} |`,
    `| Occurrences | ${summary.occurrenceCount} |`,
    `| Structured occurrences | ${summary.structuredOccurrences} |`,
    `| Unstructured occurrences | ${summary.unstructuredOccurrences} |`,
    `| Structured ratio | ${percent(summary.structuredRatio)} |`,
    `| API response occurrences | ${summary.apiResponseOccurrences} |`,
    `| Problem Details coverage | ${percent(summary.problemDetailsCoverage)} |`,
    `| Documentation coverage | ${percent(summary.documentationCoverage)} |`,
    `| OpenAPI documents observed | ${summary.openapiDocumentCount} |`,
    `| Full scan duration | ${summary.scanDurationMs} ms |`,
    "",
    "## Ecosystem coverage",
    "",
    "| Ecosystem | Repositories | Files | Occurrences | Structured | Unstructured |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.perEcosystem).map(
      ([ecosystem, row]) =>
        `| ${ecosystem} | ${row.repositories} | ${row.filesScanned} | ${row.occurrenceCount} | ` +
        `${row.structuredOccurrences} | ${row.unstructuredOccurrences} |`,
    ),
    "",
    "## Repository coordinates",
    "",
    "| Repository | Category | Framework | Commit | License | Files | Occurrences | Structured | Unresolved |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |",
    ...dataset.repositories.map(
      (repository) =>
        `| [${repository.owner}/${repository.repo}](${repository.url}) | ${repository.category} | ` +
        `${repository.framework} | \`${repository.commit.slice(0, 12)}\` | ` +
        `${repository.licenseEvidence.spdxId} | ${repository.metrics.filesScanned} | ` +
        `${repository.metrics.occurrenceCount} | ${repository.metrics.structuredOccurrences} | ` +
        `${repository.metrics.confidenceDistribution.unresolved} |`,
    ),
    "",
    "## Interpretation and privacy",
    "",
    "The committed JSON contains public repository coordinates, pinned commits, license evidence, and aggregate counts only. It excludes raw source, raw repository paths, raw messages, identities, raw codes, raw findings, stack traces, secrets, tokens, and private metadata.",
    "",
    "OpenAPI, catalog, baseline, and net-new metrics remain `null` unless those artifacts are genuinely evaluated. No value is imputed. Full external cloning is manual; CI validates committed schemas, aggregate consistency, and privacy rules without network access.",
    "",
    "Reproduce the expanded snapshot with `npm run benchmark:external`, then run `npm run check:data`.",
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function ecosystemSummary(repositories) {
  const result = {};
  for (const repository of repositories) {
    const row = (result[repository.ecosystem] ??= {
      repositories: 0,
      filesScanned: 0,
      occurrenceCount: 0,
      structuredOccurrences: 0,
      unstructuredOccurrences: 0,
    });
    row.repositories += 1;
    row.filesScanned += repository.metrics.filesScanned;
    row.occurrenceCount += repository.metrics.occurrenceCount;
    row.structuredOccurrences += repository.metrics.structuredOccurrences;
    row.unstructuredOccurrences += repository.metrics.unstructuredOccurrences;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isApiResponse(error) {
  if (error.flow !== "returned") return false;
  return /^(NextResponse\.json\(\)|response\.|reply\.)/.test(error.constructor);
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
