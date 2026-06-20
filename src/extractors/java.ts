import { parse } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError } from "../types.js";
import { ensureDynamicLanguages } from "./languages.js";
import { detectedFromArguments, literalString, toLocation } from "./shared.js";

export function extractJavaErrors(input: {
  root: string;
  filename: string;
  source: string;
  constructors: ConstructorSpec[];
}): DetectedError[] {
  ensureDynamicLanguages();
  const tree = parse("java", input.source).root();
  const errors: DetectedError[] = [];
  const configured = new Set(input.constructors.map((item) => item.name));

  for (const spec of input.constructors) {
    const matches = tree.findAll({
      rule: { pattern: `new ${spec.name}($$$ARGS)` },
    });
    for (const node of matches) {
      if (
        !node
          .ancestors()
          .some((ancestor) => ancestor.kind() === "throw_statement")
      ) {
        continue;
      }
      errors.push(
        detectedFromArguments({
          root: input.root,
          filename: input.filename,
          node,
          args: node
            .getMultipleMatches("ARGS")
            .filter((item) => item.isNamed()),
          spec,
          language: "java",
        }),
      );
    }
  }

  const thrown = tree.findAll({
    rule: { pattern: "throw new $CTOR($$$ARGS)" },
  });
  for (const node of thrown) {
    const constructor = node.getMatch("CTOR")?.text() ?? "Exception";
    if (configured.has(constructor)) continue;
    const args = node
      .getMultipleMatches("ARGS")
      .filter((item) => item.isNamed());
    errors.push({
      code: null,
      message: literalString(args[0]?.text() ?? ""),
      status: null,
      constructor,
      language: "java",
      structured: false,
      allowMessageVariants: false,
      location: toLocation(input.root, input.filename, node),
    });
  }

  return errors;
}
