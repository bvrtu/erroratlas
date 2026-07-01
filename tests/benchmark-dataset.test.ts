import { describe, expect, it } from "vitest";
// These production scripts are intentionally plain ESM so they can run before TypeScript builds.
// @ts-expect-error no declaration file for the plain ESM benchmark helper
import * as benchmarkDataset from "../scripts/lib/benchmark-dataset.mjs";
// @ts-expect-error no declaration file for the plain ESM validation helper
import * as benchmarkValidation from "../scripts/lib/benchmark-validation.mjs";

const {
  buildBenchmarkDataset,
  buildBenchmarkDatasetV4,
  buildBenchmarkSummaryArtifact,
  repositoryMetrics,
  repositoryMetricsV4,
} = benchmarkDataset;
const { assertSummaryArtifactConsistent, assertSummaryConsistent } =
  benchmarkValidation;
const { assertPrivacySafe } = benchmarkValidation;

describe("external benchmark aggregation", () => {
  it("derives aggregate-only metrics without leaking error identities", () => {
    const metrics = repositoryMetrics(
      {
        filesScanned: 2,
        diagnostics: [],
        errors: [
          {
            structured: true,
            code: "SECRET_CODE",
            status: 404,
            language: "typescript",
            problem: { type: "about:blank" },
            evidence: { confidence: "proven" },
          },
          {
            structured: false,
            code: null,
            status: null,
            language: "typescript",
            evidence: { confidence: "partial" },
          },
        ],
      },
      null,
    );

    expect(metrics).toMatchObject({
      structuredOccurrences: 1,
      unstructuredOccurrences: 1,
      codeDensity: 1,
      uniqueStructuredIdentities: 1,
      problemDetailsCoverage: 1,
      confidenceDistribution: { proven: 1, partial: 1 },
    });
    expect(JSON.stringify(metrics)).not.toContain("SECRET_CODE");
  });

  it("builds totals that pass independent consistency validation", () => {
    const metrics = {
      filesScanned: 2,
      structuredOccurrences: 1,
      unstructuredOccurrences: 1,
      structuredRatio: 0.5,
      codeDensity: 1,
      uniqueStructuredIdentities: 1,
      documentedStructuredIdentities: 0,
      documentationCoverage: 0,
      openapiDriftCount: null,
      problemDetailsOccurrences: 0,
      problemDetailsCoverage: 0,
      baselineDebtCount: null,
      netNewDriftCount: null,
      confidenceDistribution: { proven: 1, partial: 1 },
      languages: { typescript: 2 },
      statusFamilies: { "4xx": 1 },
      limitations: { "catalog-not-present": 1 },
    };
    const dataset = buildBenchmarkDataset({
      manifest: {
        datasetVersion: "2026.06.21.1",
        generatedAt: "2026-06-21T00:00:00Z",
      },
      toolVersion: "0.6.0",
      repositories: [
        {
          repository: "example/api",
          category: "typescript-node-api",
          metrics,
        },
      ],
    });

    expect(() => assertSummaryConsistent(dataset)).not.toThrow();
    expect(dataset.summary).toMatchObject({
      filesScanned: 2,
      codeDensity: 1,
      documentationCoverage: 0,
    });
  });

  it("rejects privacy and secret-bearing fields independently of JSON Schema", () => {
    expect(() =>
      assertPrivacySafe({ nested: { message: "private error text" } }),
    ).toThrow(/privacy-sensitive field/);
    expect(() =>
      assertPrivacySafe({ nested: { accessToken: "must-not-publish" } }),
    ).toThrow(/privacy-sensitive field/);
    expect(() =>
      assertPrivacySafe({ metrics: { structuredOccurrences: 12 } }),
    ).not.toThrow();
  });

  it("builds v4 benchmark summaries from aggregate-only repository rows", () => {
    const metrics = repositoryMetricsV4({
      scan: {
        filesScanned: 2,
        diagnostics: [{ ruleId: "unstructured-error" }],
        errors: [
          {
            structured: true,
            code: "DO_NOT_LEAK",
            status: 404,
            language: "typescript",
            constructor: "NextResponse.json()",
            flow: "returned",
            problem: { type: "about:blank" },
            evidence: { confidence: "proven" },
          },
          {
            structured: false,
            code: null,
            status: null,
            language: "typescript",
            constructor: "Error",
            evidence: { confidence: "partial" },
          },
        ],
      },
      catalog: null,
      ecosystem: "typescript-javascript",
      filesByLanguage: { typescript: 2 },
      openapiDocumentCount: 1,
      scanDurationMs: 7,
    });
    const dataset = buildBenchmarkDatasetV4({
      manifest: {
        datasetVersion: "2026.07.02.1",
        generatedAt: "2026-07-02T00:00:00Z",
      },
      toolVersion: "0.6.0",
      repositories: [
        {
          id: "example-api",
          name: "api",
          owner: "example",
          repo: "api",
          url: "https://github.com/example/api",
          host: "github.com",
          commit: "a".repeat(40),
          defaultBranch: "main",
          ecosystem: "typescript-javascript",
          primaryLanguage: "typescript",
          category: "typescript-next",
          framework: "Next.js",
          reason: "fixture",
          expectedLimitations: ["no-committed-erroratlas-catalog"],
          archived: false,
          scannedAt: "2026-07-02T00:00:00Z",
          status: "scanned",
          licenseEvidence: {
            spdxId: "MIT",
            name: "MIT License",
            licenseFile: "LICENSE",
            metadataSource: "github-api",
            url: "https://github.com/example/api/blob/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/LICENSE",
            sha256: "b".repeat(64),
          },
          metrics,
        },
      ],
    });

    expect(() => assertSummaryConsistent(dataset)).not.toThrow();
    expect(JSON.stringify(dataset)).not.toContain("DO_NOT_LEAK");
    expect(dataset.summary).toMatchObject({
      repositoryCount: 1,
      ecosystemCount: 1,
      occurrenceCount: 2,
      apiResponseOccurrences: 1,
      openapiDocumentCount: 1,
      confidenceDistribution: { proven: 1, partial: 0, unresolved: 1 },
    });

    const summary = buildBenchmarkSummaryArtifact(
      dataset,
      "data/external-benchmark-v4.json",
    );
    expect(() =>
      assertSummaryArtifactConsistent(summary, dataset),
    ).not.toThrow();
  });
});
