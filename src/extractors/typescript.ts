import { Lang, parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type {
  ConstructorSpec,
  DetectedError,
  ProblemDetails,
  ProblemExtensionValue,
} from "../types.js";
import {
  detectedFromArguments,
  detectedFromArgumentTexts,
  inferErrorFlow,
  propertyStaticNumber,
  propertyStaticString,
  staticNumber,
  staticString,
  toLocation,
} from "./shared.js";
import {
  collectLocalTypeScriptFactories,
  collectLocalTypeScriptValues,
  type StaticValue,
  type StaticValues,
  type TypeScriptFactory,
} from "./typescript-symbols.js";

export function extractTypeScriptErrors(input: {
  root: string;
  filename: string;
  source: string;
  constructors: ConstructorSpec[];
  staticValues?: StaticValues;
  factories?: ReadonlyMap<string, TypeScriptFactory>;
}): DetectedError[] {
  const language = /\.[jt]sx$/.test(input.filename)
    ? Lang.Tsx
    : Lang.TypeScript;
  const tree = parse(language, input.source).root();
  const errors: DetectedError[] = [];
  const configured = new Set(input.constructors.map((item) => item.name));
  const values =
    input.staticValues ??
    collectLocalTypeScriptValues(input.filename, input.source);

  for (const spec of input.constructors) {
    const matches = tree.findAll({
      rule: { pattern: `new ${spec.name}($$$ARGS)` },
    });
    for (const node of matches) {
      if (
        !node
          .ancestors()
          .some((ancestor) => ancestor.kind() === "throw_statement")
      )
        continue;
      errors.push(
        detectedFromArguments({
          root: input.root,
          filename: input.filename,
          node,
          args: namedMatches(node, "ARGS"),
          spec,
          language: "typescript",
          values,
        }),
      );
    }
  }

  const thrown = tree.findAll({
    rule: { pattern: "throw new $CTOR($$$ARGS)" },
  });
  for (const node of thrown) {
    const constructor = node.getMatch("CTOR")?.text() ?? "Error";
    if (configured.has(constructor)) continue;
    const args = namedMatches(node, "ARGS");
    errors.push({
      code: null,
      message: staticString(args[0]?.text() ?? "", values),
      status: null,
      constructor,
      language: "typescript",
      structured: false,
      allowMessageVariants: false,
      flow: inferErrorFlow(node),
      location: toLocation(input.root, input.filename, node),
    });
  }

  errors.push(
    ...extractFactoryThrows(input, tree, values),
    ...extractApiResponses(input, tree, values),
  );

  return errors;
}

function extractFactoryThrows(
  input: {
    root: string;
    filename: string;
    constructors: ConstructorSpec[];
    factories?: ReadonlyMap<string, TypeScriptFactory>;
  },
  tree: SgNode,
  values: StaticValues,
): DetectedError[] {
  const factories =
    input.factories ??
    collectLocalTypeScriptFactories(
      input.filename,
      tree.text(),
      input.constructors,
    );

  const errors: DetectedError[] = [];
  const resolvedNodes = new Set<number>();
  for (const node of tree.findAll({
    rule: { pattern: "throw $FACTORY($$$ARGS)" },
  })) {
    const name = node.getMatch("FACTORY")?.text();
    const factory = name ? factories.get(name) : undefined;
    if (!factory) continue;
    resolvedNodes.add(node.id());
    const callArguments = namedMatches(node, "ARGS").map((item) => item.text());
    const scopedValues = new Map(values);
    factory.parameters.forEach((parameter, index) => {
      const argument = callArguments[index];
      if (argument === undefined) return;
      const value = resolveValue(argument, values);
      if (value !== null) scopedValues.set(parameter, value);
    });
    errors.push(
      detectedFromArgumentTexts({
        root: input.root,
        filename: input.filename,
        node,
        args: factory.arguments,
        spec: factory.spec,
        language: "typescript",
        values: scopedValues,
        constructorName: `${factory.name}()`,
      }),
    );
  }
  for (const node of tree.findAll({
    rule: { pattern: "throw $FACTORY($$$ARGS)" },
  })) {
    if (resolvedNodes.has(node.id())) continue;
    const name = node.getMatch("FACTORY")?.text();
    if (!name || name === "new") continue;
    errors.push({
      code: null,
      message: null,
      status: null,
      constructor: `${name}()`,
      language: "typescript",
      structured: false,
      allowMessageVariants: false,
      flow: inferErrorFlow(node),
      location: toLocation(input.root, input.filename, node),
    });
  }
  return errors;
}

function extractApiResponses(
  input: { root: string; filename: string },
  tree: SgNode,
  values: StaticValues,
): DetectedError[] {
  const errors: DetectedError[] = [];
  const seen = new Set<string>();

  for (const callee of ["NextResponse.json", "Response.json"]) {
    for (const node of tree.findAll({
      rule: { pattern: `${callee}($$$ARGS)` },
    })) {
      const args = namedMatches(node, "ARGS").map((item) => item.text());
      const body = args[0] ?? "";
      const options = args[1] ?? "";
      const detected = responseDetection({
        ...input,
        node,
        body,
        statusText: options,
        constructor: callee,
        values,
      });
      if (detected) addUnique(errors, seen, node, detected);
    }
  }

  const chains = [
    {
      pattern: "$RESPONSE.status($STATUS).json($BODY)",
      label: "response.status().json()",
    },
    {
      pattern: "$RESPONSE.status($STATUS).send($BODY)",
      label: "response.status().send()",
    },
    {
      pattern: "$RESPONSE.code($STATUS).send($BODY)",
      label: "reply.code().send()",
    },
  ];
  for (const chain of chains) {
    for (const node of tree.findAll({ rule: { pattern: chain.pattern } })) {
      const detected = responseDetection({
        ...input,
        node,
        body: node.getMatch("BODY")?.text() ?? "",
        statusText: node.getMatch("STATUS")?.text() ?? "",
        constructor: chain.label,
        values,
      });
      if (detected) addUnique(errors, seen, node, detected);
    }
  }

  for (const method of ["json", "send"]) {
    for (const node of tree.findAll({
      rule: { pattern: `$RESPONSE.${method}($BODY)` },
    })) {
      if (node.text().includes(".status(") || node.text().includes(".code("))
        continue;
      const detected = responseDetection({
        ...input,
        node,
        body: node.getMatch("BODY")?.text() ?? "",
        statusText: "",
        constructor: `response.${method}()`,
        values,
      });
      if (detected) addUnique(errors, seen, node, detected);
    }
  }

  return errors;
}

function responseDetection(input: {
  root: string;
  filename: string;
  node: SgNode;
  body: string;
  statusText: string;
  constructor: string;
  values: StaticValues;
}): DetectedError | null {
  const code = propertyStaticString(
    input.body,
    ["code", "errorCode", "error_code"],
    input.values,
  );
  const message = propertyStaticString(
    input.body,
    ["message", "detail", "title", "error"],
    input.values,
  );
  const status =
    staticNumber(input.statusText, input.values) ??
    propertyStaticNumber(
      input.statusText,
      ["status", "statusCode", "status_code"],
      input.values,
    ) ??
    propertyStaticNumber(
      input.body,
      ["status", "statusCode", "status_code"],
      input.values,
    );
  const explicitlyError = /["']?error["']?\s*:/.test(input.body);
  if (code === null && !explicitlyError && (status === null || status < 400)) {
    return null;
  }
  return {
    code,
    message,
    status,
    constructor: input.constructor,
    language: "typescript",
    structured: code !== null,
    allowMessageVariants: false,
    ...problemDetails(input.body, input.values),
    flow: "returned",
    location: toLocation(input.root, input.filename, input.node),
  };
}

function problemDetails(
  body: string,
  values: StaticValues,
): { problem?: ProblemDetails } {
  const type = propertyStaticString(body, ["type"], values);
  const title = propertyStaticString(body, ["title"], values);
  const detail = propertyStaticString(body, ["detail"], values);
  const instance = propertyStaticString(body, ["instance"], values);
  if ([type, title, detail, instance].every((value) => value === null))
    return {};

  const extensions: Record<string, ProblemExtensionValue> = {};
  const tree = parse(Lang.TypeScript, `const problem = ${body};`).root();
  const object = tree.find({ rule: { kind: "object" } });
  const reserved = new Set([
    "type",
    "title",
    "status",
    "detail",
    "instance",
    "code",
    "errorCode",
    "error_code",
    "message",
  ]);
  for (const pair of object
    ?.children()
    .filter((child) => child.kind() === "pair") ?? []) {
    const key = pair
      .field("key")
      ?.text()
      .replace(/^["']|["']$/g, "");
    const valueText = pair.field("value")?.text();
    if (!key || reserved.has(key) || valueText === undefined) continue;
    const value = staticProblemValue(valueText, values);
    if (value !== undefined) extensions[key] = value;
  }

  return {
    problem: { type, title, detail, instance, extensions },
  };
}

function staticProblemValue(
  text: string,
  values: StaticValues,
): ProblemExtensionValue | undefined {
  const value = resolveValue(text, values);
  if (value !== null) return value;
  const normalized = text.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "null") return null;
  return undefined;
}

function namedMatches(node: SgNode, name: string): SgNode[] {
  return node.getMultipleMatches(name).filter((item) => item.isNamed());
}

function resolveValue(text: string, values: StaticValues): StaticValue | null {
  return staticString(text, values) ?? staticNumber(text, values);
}

function addUnique(
  errors: DetectedError[],
  seen: Set<string>,
  node: SgNode,
  detected: DetectedError,
): void {
  const range = node.range();
  const key = `${range.start.index}:${range.end.index}`;
  if (seen.has(key)) return;
  seen.add(key);
  errors.push(detected);
}
