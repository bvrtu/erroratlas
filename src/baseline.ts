import { readFile } from "node:fs/promises";
import type { Diagnostic } from "./types.js";

export interface ErrorAtlasBaseline {
  schemaVersion: 1;
  generatedAt: string;
  fingerprints: string[];
}

export function buildBaseline(
  diagnostics: Diagnostic[],
  generatedAt = new Date().toISOString(),
): ErrorAtlasBaseline {
  return {
    schemaVersion: 1,
    generatedAt,
    fingerprints: diagnostics.map(diagnosticFingerprint).sort(),
  };
}

export async function readBaseline(
  filename: string,
): Promise<ErrorAtlasBaseline> {
  const value = JSON.parse(
    await readFile(filename, "utf8"),
  ) as ErrorAtlasBaseline;
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.fingerprints) ||
    value.fingerprints.some((fingerprint) => typeof fingerprint !== "string")
  ) {
    throw new Error(`${filename} is not a valid ErrorAtlas baseline.`);
  }
  return value;
}

export function filterBaselineDiagnostics(
  diagnostics: Diagnostic[],
  baseline: ErrorAtlasBaseline,
): Diagnostic[] {
  const remaining = new Map<string, number>();
  for (const fingerprint of baseline.fingerprints) {
    remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1);
  }
  return diagnostics.filter((diagnostic) => {
    const fingerprint = diagnosticFingerprint(diagnostic);
    const count = remaining.get(fingerprint) ?? 0;
    if (count <= 0) return true;
    remaining.set(fingerprint, count - 1);
    return false;
  });
}

export function diagnosticFingerprint(diagnostic: Diagnostic): string {
  return JSON.stringify([
    diagnostic.ruleId,
    diagnostic.code,
    diagnostic.location?.file ?? null,
    diagnostic.message,
  ]);
}
