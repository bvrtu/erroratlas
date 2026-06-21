import { describe, expect, it } from "vitest";
import { buildCatalog } from "../src/catalog.js";
import {
  renderConsole,
  renderMarkdown,
  renderSarif,
  shouldFail,
} from "../src/reporters.js";
import type { DetectedError, Diagnostic, ScanResult } from "../src/types.js";

const error: DetectedError = {
  code: "USER_NOT_FOUND",
  message: "User was not found",
  status: 404,
  constructor: "AppError",
  language: "typescript",
  structured: true,
  allowMessageVariants: false,
  evidence: {
    confidence: "proven",
    steps: [
      { kind: "syntax", file: "src/users.ts", symbol: "AppError" },
      { kind: "literal", file: "src/users.ts", symbol: "USER_NOT_FOUND" },
    ],
  },
  location: {
    file: "src/users.ts",
    line: 8,
    column: 9,
    endLine: 8,
    endColumn: 61,
  },
};

const diagnostic: Diagnostic = {
  ruleId: "undocumented-error",
  severity: "error",
  message: "USER_NOT_FOUND exists in source but is missing from the catalog.",
  code: "USER_NOT_FOUND",
  evidence: error.evidence!,
  location: error.location,
};

const scan: ScanResult = {
  root: "/fixture",
  filesScanned: 1,
  errors: [error],
  diagnostics: [diagnostic],
};

describe("reporters", () => {
  it("renders concise console findings and totals", () => {
    const output = renderConsole(scan);
    expect(output).toContain("src/users.ts:8:9 [undocumented-error]");
    expect(output).toContain("1 structured errors · 1 errors");
  });

  it("renders a Markdown reference", () => {
    const output = renderMarkdown(
      buildCatalog([error], null, "2026-06-20T00:00:00.000Z"),
    );
    expect(output).toContain("## `USER_NOT_FOUND`");
    expect(output).toContain("**HTTP status:** 404");
    expect(output).toContain("`src/users.ts:8`");
    expect(output).toContain("proof: **proven** via `syntax` → `literal`");
  });

  it("renders valid SARIF locations", () => {
    const output = JSON.parse(renderSarif([diagnostic])) as {
      version: string;
      runs: Array<{
        results: Array<{
          locations: unknown[];
          properties: {
            erroratlasConfidence: string;
            erroratlasEvidence: unknown[];
          };
        }>;
      }>;
    };
    expect(output.version).toBe("2.1.0");
    expect(output.runs[0]?.results[0]?.locations).toHaveLength(1);
    expect(output.runs[0]?.results[0]?.properties).toMatchObject({
      erroratlasConfidence: "proven",
      erroratlasEvidence: [
        expect.objectContaining({ kind: "syntax", file: "src/users.ts" }),
        expect.objectContaining({ kind: "literal", file: "src/users.ts" }),
      ],
    });
  });

  it("applies error and warning failure thresholds", () => {
    const warning: Diagnostic = { ...diagnostic, severity: "warning" };
    expect(shouldFail([warning], "error")).toBe(false);
    expect(shouldFail([warning], "warning")).toBe(true);
    expect(shouldFail([diagnostic], "error")).toBe(true);
  });
});
