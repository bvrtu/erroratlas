import { readFile } from "node:fs/promises";
import { compareDiagnostics } from "./scanner.js";
import type {
  CatalogEntry,
  DetectedError,
  Diagnostic,
  ErrorCatalog,
  ScanResult,
} from "./types.js";

export function buildCatalog(
  errors: DetectedError[],
  previous: ErrorCatalog | null = null,
  generatedAt = new Date().toISOString(),
): ErrorCatalog {
  const previousByCode = new Map(
    previous?.errors.map((item) => [item.code, item]) ?? [],
  );
  const byCode = new Map<string, DetectedError[]>();

  for (const item of errors) {
    if (!item.code) continue;
    const group = byCode.get(item.code) ?? [];
    group.push(item);
    byCode.set(item.code, group);
  }

  const entries: CatalogEntry[] = [...byCode.entries()]
    .map(([code, definitions]) => {
      const first = definitions[0];
      const existing = previousByCode.get(code);
      const observedMessages = [
        ...new Set(
          definitions
            .map((definition) => definition.message)
            .filter((message): message is string => message !== null),
        ),
      ].sort();
      const variantsAllowed = definitions.every(
        (definition) => definition.allowMessageVariants,
      );
      const message =
        variantsAllowed && observedMessages.length > 1
          ? null
          : (first?.message ?? null);
      return {
        code,
        message,
        observedMessages,
        status: first?.status ?? null,
        description: existing?.description ?? "",
        resolution: existing?.resolution ?? "",
        ...(first?.problem ? { problem: first.problem } : {}),
        occurrences: definitions.map((item) => ({
          ...item.location,
          language: item.language,
          constructor: item.constructor,
          ...(item.flow ? { flow: item.flow } : {}),
          ...(item.evidence ? { evidence: item.evidence } : {}),
        })),
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));

  return {
    schemaVersion: 2,
    generatedAt,
    errors: entries,
  };
}

export async function readCatalog(filename: string): Promise<ErrorCatalog> {
  const parsed = JSON.parse(await readFile(filename, "utf8")) as ErrorCatalog;
  validateCatalog(parsed, filename);
  return parsed;
}

export async function readCatalogIfPresent(
  filename: string,
): Promise<ErrorCatalog | null> {
  try {
    return await readCatalog(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function compareWithCatalog(
  scan: ScanResult,
  catalog: ErrorCatalog,
): Diagnostic[] {
  const diagnostics = [...scan.diagnostics];
  const sourceCatalog = buildCatalog(scan.errors, null, catalog.generatedAt);
  const sourceByCode = new Map(
    sourceCatalog.errors.map((item) => [item.code, item]),
  );
  const catalogByCode = new Map(
    catalog.errors.map((item) => [item.code, item]),
  );

  for (const [code, source] of sourceByCode) {
    const documented = catalogByCode.get(code);
    const location = source.occurrences[0] ?? null;
    if (!documented) {
      diagnostics.push({
        ruleId: "undocumented-error",
        severity: "error",
        message: `${code} exists in source but is missing from the catalog.`,
        code,
        location,
      });
      continue;
    }
    const sourceMessages = normalizedMessages(source);
    const documentedMessages = normalizedMessages(documented);
    if (
      source.message !== documented.message ||
      !sameStrings(sourceMessages, documentedMessages)
    ) {
      diagnostics.push({
        ruleId: "message-drift",
        severity: "error",
        message: `${code} message changed from ${quote(documented.message)} to ${quote(source.message)}.`,
        code,
        location,
      });
    }
    if (source.status !== documented.status) {
      diagnostics.push({
        ruleId: "status-drift",
        severity: "error",
        message: `${code} status changed from ${documented.status ?? "none"} to ${source.status ?? "none"}.`,
        code,
        location,
      });
    }
    if (
      catalog.schemaVersion >= 2 &&
      canonicalProblem(source.problem) !== canonicalProblem(documented.problem)
    ) {
      diagnostics.push({
        ruleId: "problem-details-drift",
        severity: "error",
        message: `${code} RFC 9457 problem details differ between source and catalog.`,
        code,
        location,
      });
    }
    if (!documented.resolution.trim()) {
      diagnostics.push({
        ruleId: "missing-resolution",
        severity: "note",
        message: `${code} has no documented resolution.`,
        code,
        location,
      });
    }
  }

  for (const [code, documented] of catalogByCode) {
    if (sourceByCode.has(code)) continue;
    diagnostics.push({
      ruleId: "stale-error",
      severity: "warning",
      message: `${code} is cataloged but no longer exists in source.`,
      code,
      location: documented.occurrences[0] ?? null,
    });
  }

  return diagnostics.sort(compareDiagnostics);
}

function validateCatalog(value: ErrorCatalog, filename: string): void {
  if (![1, 2].includes(value.schemaVersion) || !Array.isArray(value.errors)) {
    throw new Error(`${filename} is not a valid ErrorAtlas catalog.`);
  }
  const codes = new Set<string>();
  for (const entry of value.errors) {
    if (!entry.code || codes.has(entry.code)) {
      throw new Error(
        `${filename} contains an empty or duplicate error code: ${entry.code}`,
      );
    }
    codes.add(entry.code);
  }
}

function canonicalProblem(value: CatalogEntry["problem"]): string {
  if (!value) return "";
  return JSON.stringify({
    type: value.type,
    title: value.title,
    detail: value.detail,
    instance: value.instance,
    extensions: Object.fromEntries(
      Object.entries(value.extensions).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  });
}

function quote(value: string | null): string {
  return value === null ? "none" : JSON.stringify(value);
}

function normalizedMessages(entry: CatalogEntry): string[] {
  return [
    ...new Set(
      entry.observedMessages ?? (entry.message ? [entry.message] : []),
    ),
  ].sort();
}

function sameStrings(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
