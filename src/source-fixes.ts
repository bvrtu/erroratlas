import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { Lang, parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type { ErrorAtlasConfig } from "./types.js";
import { propertyNumber, propertyString } from "./extractors/shared.js";

export interface SourceFix {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  insertionIndex: number;
  insertion: string;
}

export async function planSourceFixes(
  root: string,
  config: ErrorAtlasConfig,
): Promise<SourceFix[]> {
  const absoluteRoot = path.resolve(root);
  const files = await fg(config.include, {
    cwd: absoluteRoot,
    ignore: config.exclude,
    onlyFiles: true,
    unique: true,
    dot: false,
    followSymbolicLinks: false,
  });
  const fixes = (
    await Promise.all(
      files
        .filter((file) => /\.[jt]sx?$/.test(file))
        .sort()
        .map(async (relativeFile) => {
          const filename = path.join(absoluteRoot, relativeFile);
          const source = await readFile(filename, "utf8");
          return planTypeScriptFileFixes(absoluteRoot, filename, source);
        }),
    )
  ).flat();
  return fixes.sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line,
  );
}

export async function applySourceFixes(
  root: string,
  fixes: SourceFix[],
): Promise<void> {
  const absoluteRoot = path.resolve(root);
  const byFile = new Map<string, SourceFix[]>();
  for (const fix of fixes) {
    const group = byFile.get(fix.file) ?? [];
    group.push(fix);
    byFile.set(fix.file, group);
  }
  for (const [relativeFile, fileFixes] of byFile) {
    const filename = path.join(absoluteRoot, relativeFile);
    let source = await readFile(filename, "utf8");
    for (const fix of fileFixes.sort(
      (left, right) => right.insertionIndex - left.insertionIndex,
    )) {
      source =
        source.slice(0, fix.insertionIndex) +
        fix.insertion +
        source.slice(fix.insertionIndex);
    }
    await writeFile(filename, source, "utf8");
  }
}

export function renderSourceFixes(fixes: SourceFix[]): string {
  if (fixes.length === 0) return "No safe source fixes found.\n";
  return `${[
    `Safe source fixes: ${fixes.length}`,
    "",
    ...fixes.map(
      (fix) =>
        `${fix.file}:${fix.line}:${fix.column} add code ${fix.code} for ${JSON.stringify(fix.message)}`,
    ),
  ].join("\n")}\n`;
}

function planTypeScriptFileFixes(
  root: string,
  filename: string,
  source: string,
): SourceFix[] {
  const language = /\.[jt]sx$/.test(filename) ? Lang.Tsx : Lang.TypeScript;
  const tree = parse(language, source).root();
  const fixes: SourceFix[] = [];
  const seen = new Set<string>();

  for (const callee of ["NextResponse.json", "Response.json"]) {
    for (const node of tree.findAll({
      rule: { pattern: `${callee}($$$ARGS)` },
    })) {
      const args = namedMatches(node, "ARGS");
      const body = args[0];
      if (!body) continue;
      const status = propertyNumber(args[1]?.text() ?? "", [
        "status",
        "statusCode",
      ]);
      addFix(root, filename, body, status, fixes, seen);
    }
  }

  for (const pattern of [
    "$RESPONSE.status($STATUS).json($BODY)",
    "$RESPONSE.status($STATUS).send($BODY)",
    "$RESPONSE.code($STATUS).send($BODY)",
  ]) {
    for (const node of tree.findAll({ rule: { pattern } })) {
      const body = node.getMatch("BODY");
      if (!body) continue;
      const statusText = node.getMatch("STATUS")?.text() ?? "";
      const status = /^\d{3}$/.test(statusText.trim())
        ? Number(statusText)
        : null;
      addFix(root, filename, body, status, fixes, seen);
    }
  }

  return fixes;
}

function addFix(
  root: string,
  filename: string,
  body: SgNode,
  status: number | null,
  fixes: SourceFix[],
  seen: Set<string>,
): void {
  const text = body.text();
  if (!text.trimStart().startsWith("{")) return;
  if (/["']?(?:code|errorCode|error_code)["']?\s*:/.test(text)) return;
  const message = propertyString(text, ["error", "message", "detail", "title"]);
  if (!message || (status !== null && status < 400)) return;
  const code = toErrorCode(message);
  if (!code) return;
  const range = body.range();
  const key = `${range.start.index}:${range.end.index}`;
  if (seen.has(key)) return;
  seen.add(key);
  const insertion = insertionForObject(text, code);
  const location = range.start;
  fixes.push({
    file: path.relative(root, filename).split(path.sep).join("/"),
    line: location.line + 1,
    column: location.column + 1,
    code,
    message,
    insertionIndex: range.start.index + insertion.offset,
    insertion: insertion.text,
  });
}

function insertionForObject(
  objectText: string,
  code: string,
): { offset: number; text: string } {
  const multiline = objectText.match(/^\{\r?\n([ \t]*)/);
  if (multiline) {
    const indent = multiline[1] ?? "";
    return {
      offset: multiline[0].length,
      text: `code: ${JSON.stringify(code)},\n${indent}`,
    };
  }
  return {
    offset: objectText.indexOf("{") + 1,
    text: ` code: ${JSON.stringify(code)},`,
  };
}

function toErrorCode(message: string): string | null {
  const code = message
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z\d]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
  return code || null;
}

function namedMatches(node: SgNode, name: string): SgNode[] {
  return node.getMultipleMatches(name).filter((item) => item.isNamed());
}
