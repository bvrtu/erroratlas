import { parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError } from "../types.js";
import { ensureDynamicLanguages } from "./languages.js";
import {
  detectedFromArguments,
  inferErrorFlow,
  literalString,
  toLocation,
} from "./shared.js";

export function extractSwiftErrors(input: {
  root: string;
  filename: string;
  source: string;
  constructors: ConstructorSpec[];
}): DetectedError[] {
  ensureDynamicLanguages();
  const tree = parse("swift", input.source).root();
  const errors: DetectedError[] = [];
  const specs = new Map(input.constructors.map((item) => [item.name, item]));
  const transfers = tree.findAll({
    rule: { kind: "control_transfer_statement" },
  });

  for (const node of transfers) {
    if (!node.children().some((child) => child.kind() === "throw_keyword")) {
      continue;
    }
    const expression = node
      .children()
      .find((child) => child.isNamed() && child.kind() !== "throw_keyword");
    if (!expression) continue;

    if (expression.kind() === "call_expression") {
      const callee = expression.children().find((child) => child.isNamed());
      const name = callee?.text() ?? "throw-expression";
      const args = expression.findAll({ rule: { kind: "value_argument" } });
      const spec = specs.get(name);
      if (spec) {
        errors.push(
          detectedFromArguments({
            root: input.root,
            filename: input.filename,
            node: expression,
            args,
            spec,
            language: "swift",
          }),
        );
      } else {
        errors.push(unstructured(input, expression, name, args));
      }
      continue;
    }

    errors.push(unstructured(input, expression, expression.text(), []));
  }

  return errors;
}

function unstructured(
  input: { root: string; filename: string },
  node: SgNode,
  constructor: string,
  args: SgNode[],
): DetectedError {
  return {
    code: null,
    message: literalString(args[0]?.text() ?? ""),
    status: null,
    constructor,
    language: "swift",
    structured: false,
    allowMessageVariants: false,
    flow: inferErrorFlow(node),
    location: toLocation(input.root, input.filename, node),
  };
}
