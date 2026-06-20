import { parse } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError } from "../types.js";
import { ensureDynamicLanguages } from "./languages.js";
import { detectedFromArguments, literalString, toLocation } from "./shared.js";

export function extractDartErrors(input: {
  root: string;
  filename: string;
  source: string;
  constructors: ConstructorSpec[];
}): DetectedError[] {
  ensureDynamicLanguages();
  const tree = parse("dart", input.source).root();
  const errors: DetectedError[] = [];
  const configured = new Set(input.constructors.map((item) => item.name));
  const coveredRanges = new Set<string>();

  for (const spec of input.constructors) {
    const matches = tree.findAll({
      rule: { pattern: `throw ${spec.name}($$$ARGS)` },
    });
    for (const node of matches) {
      coveredRanges.add(rangeKey(node));
      errors.push(
        detectedFromArguments({
          root: input.root,
          filename: input.filename,
          node,
          args: node
            .getMultipleMatches("ARGS")
            .filter((item) => item.isNamed()),
          spec,
          language: "dart",
        }),
      );
    }
  }

  const calls = tree.findAll({ rule: { pattern: "throw $CTOR($$$ARGS)" } });
  for (const node of calls) {
    if (coveredRanges.has(rangeKey(node))) continue;
    const constructor = node.getMatch("CTOR")?.text() ?? "Exception";
    if (configured.has(constructor)) continue;
    const args = node
      .getMultipleMatches("ARGS")
      .filter((item) => item.isNamed());
    coveredRanges.add(rangeKey(node));
    errors.push({
      code: null,
      message: literalString(args[0]?.text() ?? ""),
      status: null,
      constructor,
      language: "dart",
      structured: false,
      allowMessageVariants: false,
      location: toLocation(input.root, input.filename, node),
    });
  }

  const thrown = tree.findAll({ rule: { kind: "throw_expression" } });
  for (const node of thrown) {
    if (coveredRanges.has(rangeKey(node))) continue;
    const expression = node
      .text()
      .replace(/^throw\s+/, "")
      .trim();
    errors.push({
      code: null,
      message: null,
      status: null,
      constructor: expression.split("(", 1)[0] || "throw-expression",
      language: "dart",
      structured: false,
      allowMessageVariants: false,
      location: toLocation(input.root, input.filename, node),
    });
  }

  return errors;
}

function rangeKey(node: {
  range(): { start: { index: number }; end: { index: number } };
}): string {
  const range = node.range();
  return `${range.start.index}:${range.end.index}`;
}
