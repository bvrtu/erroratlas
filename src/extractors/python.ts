import { parse } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError } from "../types.js";
import { ensureDynamicLanguages } from "./languages.js";
import {
  detectedFromArguments,
  literalString,
  propertyNumber,
  propertyString,
  toLocation,
} from "./shared.js";

export function extractPythonErrors(input: {
  root: string;
  filename: string;
  source: string;
  constructors: ConstructorSpec[];
}): DetectedError[] {
  ensureDynamicLanguages();
  const tree = parse("python", input.source).root();
  const errors: DetectedError[] = [];
  const configured = new Set(input.constructors.map((item) => item.name));

  for (const spec of input.constructors) {
    const matches = tree.findAll({
      rule: { pattern: `${spec.name}($$$ARGS)` },
    });
    for (const node of matches) {
      if (
        !node
          .ancestors()
          .some((ancestor) => ancestor.kind() === "raise_statement")
      )
        continue;
      const args = node
        .getMultipleMatches("ARGS")
        .filter((item) => item.isNamed());
      const detected = detectedFromArguments({
        root: input.root,
        filename: input.filename,
        node,
        args,
        spec,
        language: "python",
      });

      if (spec.name === "HTTPException") {
        const argumentText = args.map((item) => item.text()).join(", ");
        detected.status =
          propertyNumber(argumentText, ["status_code", "status"]) ??
          detected.status;
        detected.code = propertyString(argumentText, [
          "code",
          "error_code",
          "errorCode",
        ]);
        detected.message =
          propertyString(argumentText, ["message", "detail", "title"]) ??
          detected.message;
        detected.structured = detected.code !== null;
      }

      errors.push(detected);
    }
  }

  const raised = tree.findAll({ rule: { pattern: "raise $CTOR($$$ARGS)" } });
  for (const node of raised) {
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
      language: "python",
      structured: false,
      allowMessageVariants: false,
      location: toLocation(input.root, input.filename, node),
    });
  }

  return errors;
}
