import path from "node:path";
import type { SgNode } from "@ast-grep/napi";
import type {
  ConstructorSpec,
  DetectedError,
  ErrorFlow,
  SourceLocation,
  SupportedLanguage,
} from "../types.js";
import type { StaticValues } from "./typescript-symbols.js";

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

export function staticString(
  text: string,
  values: StaticValues = new Map(),
): string | null {
  const literal = literalString(text);
  if (literal !== null) return literal;
  const value = values.get(text.trim());
  return typeof value === "string" ? value : null;
}

export function staticNumber(
  text: string,
  values: StaticValues = new Map(),
): number | null {
  const trimmed = text.trim();
  const literal = /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)
    ? literalNumber(trimmed)
    : null;
  if (literal !== null) return literal;
  const value = values.get(trimmed);
  return typeof value === "number" ? value : null;
}

export function propertyStaticString(
  text: string,
  names: string[],
  values: StaticValues = new Map(),
): string | null {
  const literal = propertyString(text, names);
  if (literal !== null) return literal;
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const match = text.match(
      new RegExp(
        `["']?${escaped}["']?\\s*[:=]\\s*([A-Z_a-z$][\\w$]*(?:\\.[A-Z_a-z$][\\w$]*)*)`,
      ),
    );
    if (match?.[1]) {
      const value = values.get(match[1]);
      if (typeof value === "string") return value;
    }
  }
  return null;
}

export function propertyStaticNumber(
  text: string,
  names: string[],
  values: StaticValues = new Map(),
): number | null {
  const literal = propertyNumber(text, names);
  if (literal !== null) return literal;
  for (const name of names) {
    const escaped = escapeRegExp(name);
    const match = text.match(
      new RegExp(
        `["']?${escaped}["']?\\s*[:=]\\s*([A-Z_a-z$][\\w$]*(?:\\.[A-Z_a-z$][\\w$]*)*)`,
      ),
    );
    if (match?.[1]) {
      const value = values.get(match[1]);
      if (typeof value === "number") return value;
    }
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
  values?: StaticValues;
}): DetectedError {
  return detectedFromArgumentTexts({
    ...input,
    args: input.args.map((item) => item.text()),
  });
}

export function detectedFromArgumentTexts(input: {
  root: string;
  filename: string;
  node: SgNode;
  args: string[];
  spec: ConstructorSpec;
  language: SupportedLanguage;
  values?: StaticValues;
  constructorName?: string;
  flow?: ErrorFlow;
}): DetectedError {
  const { args, spec } = input;
  const values = input.values ?? new Map();
  const objectText = args[0]?.trim() ?? "";
  const isObject = objectText.startsWith("{");
  const joinedArgs = args.join(", ");

  const code = isObject
    ? propertyStaticString(
        objectText,
        ["code", "errorCode", "error_code"],
        values,
      )
    : (readStringArgument(args, spec.codeArgument, values) ??
      propertyStaticString(
        joinedArgs,
        ["code", "errorCode", "error_code"],
        values,
      ));
  const message = isObject
    ? propertyStaticString(
        objectText,
        ["message", "detail", "title", "error"],
        values,
      )
    : (readStringArgument(args, spec.messageArgument, values) ??
      propertyStaticString(
        joinedArgs,
        ["message", "detail", "title", "error"],
        values,
      ));
  const status = isObject
    ? (propertyStaticNumber(
        objectText,
        ["status", "statusCode", "status_code"],
        values,
      ) ??
      spec.defaultStatus ??
      null)
    : (readNumberArgument(args, spec.statusArgument, values) ??
      propertyStaticNumber(
        joinedArgs,
        ["status", "statusCode", "status_code"],
        values,
      ) ??
      spec.defaultStatus ??
      null);

  return {
    code,
    message,
    status,
    constructor: input.constructorName ?? spec.name,
    language: input.language,
    structured: code !== null,
    allowMessageVariants: spec.allowMessageVariants === true,
    flow: input.flow ?? inferErrorFlow(input.node),
    location: toLocation(input.root, input.filename, input.node),
  };
}

export function inferErrorFlow(node: SgNode): ErrorFlow {
  let insideCatch = false;
  for (const ancestor of node.ancestors()) {
    const kind = String(ancestor.kind());
    if (kind === "return_statement") return "returned";
    if (["catch_clause", "except_clause", "catch_block"].includes(kind)) {
      insideCatch = true;
    }
    if (["try_statement", "try_expression", "do_statement"].includes(kind)) {
      if (insideCatch) return "rethrown";
      const hasHandler = ancestor
        .children()
        .some((child) =>
          ["catch_clause", "except_clause", "catch_block"].includes(
            String(child.kind()),
          ),
        );
      if (hasHandler) return "caught";
    }
    if (
      [
        "function_declaration",
        "function_definition",
        "method_declaration",
        "arrow_function",
        "lambda_expression",
      ].includes(kind)
    ) {
      break;
    }
  }
  return "propagated";
}

function readStringArgument(
  args: string[],
  index: number | undefined,
  values: StaticValues,
): string | null {
  if (index === undefined) return null;
  const text = args[index];
  return text === undefined ? null : staticString(text, values);
}

function readNumberArgument(
  args: string[],
  index: number | undefined,
  values: StaticValues,
): number | null {
  if (index === undefined) return null;
  const text = args[index];
  if (text === undefined) return null;
  return (
    staticNumber(text, values) ??
    propertyStaticNumber(text, ["status", "statusCode", "status_code"], values)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
