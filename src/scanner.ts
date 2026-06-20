import { readFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { extractPythonErrors } from "./extractors/python.js";
import { extractTypeScriptErrors } from "./extractors/typescript.js";
import type {
  DetectedError,
  Diagnostic,
  ErrorAtlasConfig,
  ScanResult,
} from "./types.js";

export async function scanProject(
  root: string,
  config: ErrorAtlasConfig,
): Promise<ScanResult> {
  const absoluteRoot = path.resolve(root);
  const files = await fg(config.include, {
    cwd: absoluteRoot,
    ignore: config.exclude,
    onlyFiles: true,
    unique: true,
    dot: false,
    followSymbolicLinks: false,
  });

  const detected = await Promise.all(
    files.sort().map(async (relativeFile) => {
      const filename = path.join(absoluteRoot, relativeFile);
      const source = await readFile(filename, "utf8");
      if (filename.endsWith(".py")) {
        return extractPythonErrors({
          root: absoluteRoot,
          filename,
          source,
          constructors: config.constructors.python,
        });
      }
      return extractTypeScriptErrors({
        root: absoluteRoot,
        filename,
        source,
        constructors: config.constructors.typescript,
      });
    }),
  );

  const errors = detected.flat().sort(compareDetectedErrors);
  return {
    root: absoluteRoot,
    filesScanned: files.length,
    errors,
    diagnostics: analyzeDetections(errors),
  };
}

export function analyzeDetections(errors: DetectedError[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = errors
    .filter((item) => !item.structured)
    .map((item) => ({
      ruleId: "unstructured-error",
      severity: "warning",
      message: `${item.constructor} has no static machine-readable error code.`,
      code: null,
      location: item.location,
    }));

  const byCode = new Map<string, DetectedError[]>();
  for (const item of errors) {
    if (!item.code) continue;
    const group = byCode.get(item.code) ?? [];
    group.push(item);
    byCode.set(item.code, group);
  }

  for (const [code, definitions] of byCode) {
    const messages = new Set(
      definitions.map((item) => item.message).filter(Boolean),
    );
    const statuses = new Set(
      definitions.map((item) => item.status).filter((item) => item !== null),
    );
    if (messages.size <= 1 && statuses.size <= 1) continue;
    diagnostics.push({
      ruleId: "duplicate-definition",
      severity: "error",
      message: `${code} has conflicting definitions (${messages.size} messages, ${statuses.size} statuses).`,
      code,
      location: definitions[1]?.location ?? definitions[0]?.location ?? null,
    });
  }

  return diagnostics.sort(compareDiagnostics);
}

export function compareDiagnostics(
  left: Diagnostic,
  right: Diagnostic,
): number {
  const leftFile = left.location?.file ?? "";
  const rightFile = right.location?.file ?? "";
  return (
    leftFile.localeCompare(rightFile) ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

function compareDetectedErrors(
  left: DetectedError,
  right: DetectedError,
): number {
  return (
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.location.column - right.location.column
  );
}
