import path from "node:path";
import type { SgNode } from "@ast-grep/napi";
import type {
  ConstructorSpec,
  DetectedError,
  SourceLocation,
  SupportedLanguage,
} from "../types.js";

export function toLocation(
  root: string,
  filename: string,
  node: SgNode,
): SourceLocation {
  const range = node.range();
  return {
    file: path.relative(root, filename).split(path.sep).join("/"),
    line: range.start.line + 1,
    column: range.start.column + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.column + 1,
  };
}

export function literalString(text: string): string | null {
  const value = text.trim();
  if (value.length < 2) return null;
  const quote = value[0];
  if (quote !== value.at(-1) || !["'", '"', "`"].includes(quote ?? ""))
    return null;
  const body = value.slice(1, -1);
  if (quote === "`" && body.includes("${")) return null;
  if (
    (quote === "'" || quote === '"') &&
    /(^|[^\\])\{/.test(body) &&
    value.startsWith("f")
  ) {
    return null;
  }
  return body
    .replace(/\\([\\'"`])/g, "$1")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t");
}

export function literalNumber(text: string): number | null {
  const value = Number(text.trim());
  return Number.isFinite(value) ? value : null;
}

export function propertyString(text: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const match = text.match(
      new RegExp(
        `["']?${escaped}["']?\\s*[:=]\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`,
        "s",
      ),
    );
    if (match?.[2] !== undefined) return match[2].replace(/\\([\\'"`])/g, "$1");
  }
  return null;
}

export function propertyNumber(text: string, names: string[]): number | null {
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const match = text.match(
      new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*(\\d{3})\\b`),
    );
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

export function detectedFromArguments(input: {
  root: string;
  filename: string;
  node: SgNode;
  args: SgNode[];
  spec: ConstructorSpec;
  language: SupportedLanguage;
}): DetectedError {
  const { args, spec } = input;
  const objectText = args[0]?.text().trim() ?? "";
  const isObject = objectText.startsWith("{");
  const joinedArgs = args.map((item) => item.text()).join(", ");

  const code = isObject
    ? propertyString(objectText, ["code", "errorCode", "error_code"])
    : (readStringArgument(args, spec.codeArgument) ??
      propertyString(joinedArgs, ["code", "errorCode", "error_code"]));
  const message = isObject
    ? propertyString(objectText, ["message", "detail", "title"])
    : (readStringArgument(args, spec.messageArgument) ??
      propertyString(joinedArgs, ["message", "detail", "title"]));
  const status = isObject
    ? (propertyNumber(objectText, ["status", "statusCode", "status_code"]) ??
      spec.defaultStatus ??
      null)
    : (readNumberArgument(args, spec.statusArgument) ??
      propertyNumber(joinedArgs, ["status", "statusCode", "status_code"]) ??
      spec.defaultStatus ??
      null);

  return {
    code,
    message,
    status,
    constructor: spec.name,
    language: input.language,
    structured: code !== null,
    allowMessageVariants: spec.allowMessageVariants === true,
    location: toLocation(input.root, input.filename, input.node),
  };
}

function readStringArgument(
  args: SgNode[],
  index: number | undefined,
): string | null {
  if (index === undefined) return null;
  const text = args[index]?.text();
  return text === undefined ? null : literalString(text);
}

function readNumberArgument(
  args: SgNode[],
  index: number | undefined,
): number | null {
  if (index === undefined) return null;
  const text = args[index]?.text();
  if (text === undefined) return null;
  return (
    literalNumber(text) ??
    propertyNumber(text, ["status", "statusCode", "status_code"])
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
