import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { scanProject } from "../src/scanner.js";
import type { SupportedLanguage } from "../src/types.js";

const fixtures = path.resolve("tests/fixtures");

interface CorpusManifest {
  schemaVersion: 1;
  filesScanned: number;
  structuredCodes: string[];
  unstructuredByLanguage: Partial<Record<SupportedLanguage, number>>;
  noiseCodes: string[];
  profiles: Array<{ language: string }>;
}

describe("file-based extraction corpus", () => {
  it("proves structured identities and preserves dynamic cases across all language packs", async () => {
    const root = path.join(fixtures, "corpus");
    const manifest = JSON.parse(
      await readFile(path.join(root, "manifest.json"), "utf8"),
    ) as CorpusManifest;
    const result = await scanProject(root, await loadConfig(root));
    const structured = result.errors.filter((error) => error.structured);
    const unstructured = result.errors.filter((error) => !error.structured);

    expect(result.filesScanned).toBe(manifest.filesScanned);
    expect(manifest.profiles.map((profile) => profile.language).sort()).toEqual(
      [
        "csharp",
        "dart",
        "go",
        "java",
        "javascript",
        "kotlin",
        "python",
        "swift",
        "typescript",
      ],
    );
    expect(structured.map((error) => error.code)).toEqual(
      manifest.structuredCodes,
    );
    expect(countByLanguage(unstructured)).toEqual(
      manifest.unstructuredByLanguage,
    );
    expect(result.errors).toHaveLength(25);
    expect(result.diagnostics).toHaveLength(14);

    for (const error of structured) {
      expect(error.evidence).toEqual(
        expect.objectContaining({ confidence: "proven" }),
      );
      expect(error.evidence?.steps.length).toBeGreaterThan(0);
    }
    for (const error of unstructured) {
      expect(error.code).toBeNull();
      expect(error.evidence).toEqual(
        expect.objectContaining({ confidence: "partial" }),
      );
    }
    for (const noiseCode of manifest.noiseCodes) {
      expect(result.errors.some((error) => error.code === noiseCode)).toBe(
        false,
      );
    }
  });

  it("keeps re-exported factories and RFC 9457 responses reviewable", async () => {
    const root = path.join(fixtures, "corpus");
    const result = await scanProject(root, await loadConfig(root));
    const factory = result.errors.find((error) => error.code === "TS_FACTORY");
    const problem = result.errors.find((error) => error.code === "TS_PROBLEM");

    expect(factory?.evidence?.steps.map((step) => step.kind)).toEqual([
      "syntax",
      "relative-import",
      "re-export",
      "factory",
    ]);
    expect(problem).toMatchObject({
      status: 404,
      problem: {
        type: "https://example.test/problems/user-missing",
        title: "User missing",
        detail: "No user exists for this identifier",
        extensions: { retryable: false },
      },
    });
  });

  it("reports conflicting definitions from separate source files", async () => {
    const root = path.join(fixtures, "conflict");
    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toHaveLength(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        ruleId: "duplicate-definition",
        code: "SHARED_CONFLICT",
        severity: "error",
      }),
    ]);
  });

  it("keeps over-bound imports and factories partial instead of guessing", async () => {
    const root = path.join(fixtures, "boundary");
    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toHaveLength(2);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ constructor: "AppError" }),
        expect.objectContaining({ constructor: "four()" }),
      ]),
    );
    for (const error of result.errors) {
      expect(error).toMatchObject({
        code: null,
        structured: false,
        evidence: { confidence: "partial" },
      });
    }
  });
});

function countByLanguage(
  errors: Array<{ language: SupportedLanguage }>,
): Partial<Record<SupportedLanguage, number>> {
  const counts: Partial<Record<SupportedLanguage, number>> = {};
  for (const error of errors) {
    counts[error.language] = (counts[error.language] ?? 0) + 1;
  }
  return counts;
}
