import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import type { SgNode } from "@ast-grep/napi";
import type { ConstructorSpec, EvidenceKind, EvidenceStep } from "../types.js";
import { literalNumber, literalString } from "./shared.js";
import {
  resolveTypeScriptImport,
  type TypeScriptProjectResolution,
} from "./typescript-project.js";

export type StaticValue = string | number;
export type StaticValues = ReadonlyMap<string, StaticValue>;
export type StaticEvidence = ReadonlyMap<string, EvidenceStep[]>;

export interface TypeScriptStaticAnalysis {
  values: Map<string, StaticValue>;
  evidence: Map<string, EvidenceStep[]>;
}

export interface TypeScriptSource {
  filename: string;
  source: string;
}

export interface TypeScriptFactory {
  name: string;
  parameters: TypeScriptFactoryParameter[];
  arguments: string[];
  spec: ConstructorSpec;
  evidence: EvidenceStep[];
}

export interface TypeScriptFactoryParameter {
  kind: "identifier" | "object";
  local?: string;
  defaultValue?: string;
  properties?: TypeScriptFactoryProperty[];
}

export interface TypeScriptFactoryProperty {
  key: string;
  local: string;
  defaultValue?: string;
}

interface ImportBinding {
  local: string;
  imported: string;
  source: string;
}

interface ExportBinding {
  local?: string;
  imported?: string;
  source?: string;
}

interface RawFactory {
  parameters: TypeScriptFactoryParameter[];
  arguments: string[];
  callee: string;
}

interface FileSymbols {
  filename: string;
  expressions: Map<string, string>;
  expressionKinds: Map<string, EvidenceKind>;
  exports: Map<string, ExportBinding>;
  wildcardExports: string[];
  imports: ImportBinding[];
  factories: Map<string, RawFactory>;
  projectResolution: TypeScriptProjectResolution | null;
}

export const MAX_CROSS_FILE_HOPS = 2;
const MAX_LOCAL_ALIAS_HOPS = 8;
const MAX_FACTORY_HOPS = 3;

export function buildTypeScriptStaticValues(
  files: TypeScriptSource[],
  projectResolution: TypeScriptProjectResolution | null = null,
): Map<string, Map<string, StaticValue>> {
  return new Map(
    [...buildTypeScriptStaticAnalysis(files, projectResolution)].map(
      ([filename, analysis]) => [filename, analysis.values],
    ),
  );
}

export function buildTypeScriptStaticAnalysis(
  files: TypeScriptSource[],
  projectResolution: TypeScriptProjectResolution | null = null,
): Map<string, TypeScriptStaticAnalysis> {
  const symbols = collectProjectSymbols(files, projectResolution);
  return new Map(
    [...symbols].map(([filename, file]) => [
      filename,
      materializeStaticAnalysis(file, symbols),
    ]),
  );
}

export function buildTypeScriptFactories(
  files: TypeScriptSource[],
  constructors: ConstructorSpec[],
  projectResolution: TypeScriptProjectResolution | null = null,
): Map<string, Map<string, TypeScriptFactory>> {
  const symbols = collectProjectSymbols(files, projectResolution);
  const constructorMap = new Map(
    constructors.map((constructor) => [constructor.name, constructor]),
  );

  return new Map(
    [...symbols].map(([filename, file]) => {
      const factories = new Map<string, TypeScriptFactory>();
      for (const candidate of factoryCandidates(file, symbols)) {
        const resolved = resolveFactory(
          file,
          candidate,
          symbols,
          constructorMap,
          MAX_CROSS_FILE_HOPS,
          MAX_FACTORY_HOPS,
          new Set(),
        );
        if (resolved)
          factories.set(candidate, { ...resolved, name: candidate });
      }
      return [filename, factories];
    }),
  );
}

export function collectLocalTypeScriptValues(
  filename: string,
  source: string,
): Map<string, StaticValue> {
  return (
    buildTypeScriptStaticValues([{ filename, source }]).get(
      path.resolve(filename),
    ) ?? new Map()
  );
}

export function collectLocalTypeScriptFactories(
  filename: string,
  source: string,
  constructors: ConstructorSpec[],
): Map<string, TypeScriptFactory> {
  return (
    buildTypeScriptFactories([{ filename, source }], constructors).get(
      path.resolve(filename),
    ) ?? new Map()
  );
}

export function evaluateStatic(
  expression: string,
  values: StaticValues,
): StaticValue | null {
  const normalized = normalizeExpression(expression);
  return (
    literalString(normalized) ??
    literalNumberOrNull(normalized) ??
    values.get(normalized) ??
    null
  );
}

function collectProjectSymbols(
  files: TypeScriptSource[],
  projectResolution: TypeScriptProjectResolution | null,
): Map<string, FileSymbols> {
  return new Map(
    files.map((file) => [
      path.resolve(file.filename),
      collectSymbols(file, projectResolution),
    ]),
  );
}

function collectSymbols(
  file: TypeScriptSource,
  projectResolution: TypeScriptProjectResolution | null,
): FileSymbols {
  const language = /\.[jt]sx$/.test(file.filename) ? Lang.Tsx : Lang.TypeScript;
  const tree = parse(language, file.source).root();
  const expressions = new Map<string, string>();
  const expressionKinds = new Map<string, EvidenceKind>();
  const exports = new Map<string, ExportBinding>();
  const wildcardExports: string[] = [];
  const imports: ImportBinding[] = [];
  const factories = new Map<string, RawFactory>();

  for (const node of tree.findAll({
    rule: { pattern: "const $NAME = $VALUE" },
  })) {
    const nameNode = node.getMatch("NAME");
    const valueNode = node.getMatch("VALUE");
    if (!nameNode || !valueNode) continue;
    if (nameNode.kind() === "object_pattern") {
      collectDestructuredMembers(
        nameNode,
        valueNode,
        expressions,
        expressionKinds,
      );
      continue;
    }
    const name = nameNode.text();
    if (!/^[$A-Z_a-z][$\w]*$/.test(name)) continue;
    expressions.set(name, valueNode.text());
    expressionKinds.set(name, "local-alias");
    collectObjectMembers(name, valueNode, expressions, expressionKinds);
    if (node.parent()?.kind() === "export_statement") {
      exports.set(name, { local: name });
    }
  }

  for (const node of tree.findAll({ rule: { kind: "enum_declaration" } })) {
    const name = node.field("name")?.text();
    if (!name) continue;
    for (const assignment of node.findAll({
      rule: { kind: "enum_assignment" },
    })) {
      const member = assignment.field("name")?.text();
      const value = assignment.field("value")?.text();
      if (member && value !== undefined)
        expressions.set(`${name}.${member}`, value);
      if (member && value !== undefined)
        expressionKinds.set(`${name}.${member}`, "enum-member");
    }
    if (node.parent()?.kind() === "export_statement") {
      exports.set(name, { local: name });
    }
  }

  collectFactories(tree, factories);

  for (const node of tree.findAll({ rule: { kind: "export_statement" } })) {
    parseExport(
      node.text(),
      exports,
      wildcardExports,
      expressions,
      expressionKinds,
    );
  }

  for (const node of tree.findAll({ rule: { kind: "import_statement" } })) {
    imports.push(...parseImports(node.text()));
  }

  return {
    filename: path.resolve(file.filename),
    expressions,
    expressionKinds,
    exports,
    wildcardExports,
    imports,
    factories,
    projectResolution,
  };
}

function collectObjectMembers(
  name: string,
  valueNode: SgNode,
  expressions: Map<string, string>,
  expressionKinds: Map<string, EvidenceKind>,
): void {
  const immutable = /\bas\s+const\s*$/.test(valueNode.text().trim());
  const frozen = /^Object\.freeze\s*\(/.test(valueNode.text().trim());
  if (!immutable && !frozen) return;
  const object =
    valueNode.kind() === "object"
      ? valueNode
      : valueNode.find({ rule: { kind: "object" } });
  if (!object) return;
  for (const pair of object
    .children()
    .filter((child) => child.kind() === "pair")) {
    const key = pair
      .field("key")
      ?.text()
      .replace(/^["']|["']$/g, "");
    const value = pair.field("value")?.text();
    if (key && value !== undefined) {
      expressions.set(`${name}.${key}`, value);
      expressionKinds.set(`${name}.${key}`, "object-member");
    }
  }
}

function collectDestructuredMembers(
  pattern: SgNode,
  valueNode: SgNode,
  expressions: Map<string, string>,
  expressionKinds: Map<string, EvidenceKind>,
): void {
  const source = normalizeExpression(valueNode.text());
  const inline = objectExpressionProperties(source);
  if (!inline && !/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/.test(source)) {
    return;
  }
  const properties = destructuredProperties(pattern);
  if (!properties) return;
  for (const property of properties) {
    const expression = inline?.get(property.key) ?? `${source}.${property.key}`;
    if (expression !== undefined) {
      expressions.set(property.local, expression);
      expressionKinds.set(property.local, "destructured-member");
    }
  }
}

function collectFactories(
  tree: SgNode,
  factories: Map<string, RawFactory>,
): void {
  for (const pattern of [
    "function $FACTORY($$$PARAMS) { return new $CALLEE($$$ARGS); }",
    "function $FACTORY($$$PARAMS) { return $CALLEE($$$ARGS); }",
    "const $FACTORY = ($$$PARAMS) => new $CALLEE($$$ARGS)",
    "const $FACTORY = ($$$PARAMS) => $CALLEE($$$ARGS)",
  ]) {
    for (const node of tree.findAll({ rule: { pattern } })) {
      const name = node.getMatch("FACTORY")?.text();
      const callee = node.getMatch("CALLEE")?.text();
      if (!name || !callee) continue;
      const parameters = namedMatches(node, "PARAMS").map(
        parseFactoryParameter,
      );
      if (parameters.some((parameter) => parameter === null)) continue;
      factories.set(name, {
        parameters: parameters.filter(
          (parameter): parameter is TypeScriptFactoryParameter =>
            parameter !== null,
        ),
        arguments: namedMatches(node, "ARGS").map((item) => item.text()),
        callee,
      });
    }
  }
}

function parseExport(
  statement: string,
  exports: Map<string, ExportBinding>,
  wildcardExports: string[],
  expressions: Map<string, string>,
  expressionKinds: Map<string, EvidenceKind>,
): void {
  const defaultDeclaration = statement.match(
    /^export\s+default\s+(?:async\s+)?(?:function|class)\s+([\w$]+)/,
  )?.[1];
  if (defaultDeclaration) exports.set("default", { local: defaultDeclaration });

  const declaration = statement.match(
    /^export\s+(?:async\s+)?(?:function|class|enum)\s+([\w$]+)/,
  )?.[1];
  if (declaration) exports.set(declaration, { local: declaration });

  const source = statement.match(/\bfrom\s+(["'])(.*?)\1/)?.[2];
  if (source && /^export\s+\*/.test(statement.trim())) {
    wildcardExports.push(source);
    return;
  }

  const clause = statement.match(/^export\s*{([^}]+)}/s)?.[1];
  if (clause) {
    for (const item of clause.split(",")) {
      const match = item.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (!match?.[1]) continue;
      const exported = match[2] ?? match[1];
      exports.set(
        exported,
        source ? { imported: match[1], source } : { local: match[1] },
      );
    }
  }

  const defaultExpression = statement
    .match(/^export\s+default\s+([\s\S]+?);?$/)?.[1]
    ?.trim();
  if (defaultExpression && !/^(?:function|class)\b/.test(defaultExpression)) {
    const local = "__erroratlas_default__";
    expressions.set(local, defaultExpression.replace(/;$/, ""));
    expressionKinds.set(local, "local-alias");
    exports.set("default", { local });
  }
}

function parseImports(statement: string): ImportBinding[] {
  const source = statement.match(/\bfrom\s+(["'])(.*?)\1/)?.[2];
  if (!source) return [];
  const bindings: ImportBinding[] = [];
  const named = statement.match(/import\s*{([^}]+)}/s)?.[1];
  if (named) {
    for (const item of named.split(",")) {
      const match = item.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (match?.[1]) {
        bindings.push({
          imported: match[1],
          local: match[2] ?? match[1],
          source,
        });
      }
    }
  }
  const namespace = statement.match(/import\s+\*\s+as\s+([\w$]+)/)?.[1];
  if (namespace) bindings.push({ imported: "*", local: namespace, source });

  const beforeNamed = statement.match(
    /^import\s+([^\s,{*][\w$]*)\s*(?:,|\s+from)/,
  )?.[1];
  if (beforeNamed) {
    bindings.push({ imported: "default", local: beforeNamed, source });
  }
  return bindings;
}

function materializeStaticAnalysis(
  file: FileSymbols,
  files: Map<string, FileSymbols>,
): TypeScriptStaticAnalysis {
  const values = new Map<string, StaticValue>();
  const evidence = new Map<string, EvidenceStep[]>();
  const candidates = new Set(file.expressions.keys());

  for (const binding of file.imports) {
    const importedFile = resolveImport(file.filename, binding.source, files);
    if (!importedFile) continue;
    if (binding.imported === "*") {
      for (const exported of enumerateExports(
        importedFile,
        files,
        MAX_CROSS_FILE_HOPS - 1,
        new Set(),
      )) {
        candidates.add(`${binding.local}.${exported}`);
      }
      continue;
    }
    for (const exported of enumerateExports(
      importedFile,
      files,
      MAX_CROSS_FILE_HOPS - 1,
      new Set(),
    )) {
      if (exported === binding.imported) candidates.add(binding.local);
      if (exported.startsWith(`${binding.imported}.`)) {
        candidates.add(
          `${binding.local}${exported.slice(binding.imported.length)}`,
        );
      }
    }
  }

  for (const candidate of candidates) {
    const resolved = resolveStatic(
      file,
      candidate,
      files,
      MAX_CROSS_FILE_HOPS,
      MAX_LOCAL_ALIAS_HOPS,
      new Set(),
    );
    if (resolved !== null) {
      values.set(candidate, resolved.value);
      evidence.set(candidate, resolved.evidence);
    }
  }
  return { values, evidence };
}

interface ResolvedStatic {
  value: StaticValue;
  evidence: EvidenceStep[];
}

function resolveStatic(
  file: FileSymbols,
  expression: string,
  files: Map<string, FileSymbols>,
  crossFileHops: number,
  localHops: number,
  seen: Set<string>,
): ResolvedStatic | null {
  const normalized = normalizeExpression(expression);
  const literal = literalString(normalized) ?? literalNumberOrNull(normalized);
  if (literal !== null) {
    return {
      value: literal,
      evidence: [{ kind: "literal", file: file.filename }],
    };
  }
  if (localHops < 0) return null;
  const key = `${file.filename}:${normalized}:${crossFileHops}`;
  if (seen.has(key)) return null;
  const nextSeen = new Set(seen).add(key);

  const localExpression = file.expressions.get(normalized);
  if (localExpression !== undefined) {
    const resolved = resolveStatic(
      file,
      localExpression,
      files,
      crossFileHops,
      localHops - 1,
      nextSeen,
    );
    return resolved
      ? {
          value: resolved.value,
          evidence: [
            {
              kind: file.expressionKinds.get(normalized) ?? "local-alias",
              file: file.filename,
              symbol: normalized,
            },
            ...resolved.evidence,
          ],
        }
      : null;
  }

  for (const binding of file.imports) {
    if (crossFileHops <= 0) continue;
    const imported = resolveImportWithKind(
      file.filename,
      binding.source,
      files,
    );
    if (!imported) continue;
    const importedFile = imported.file;
    if (
      binding.imported === "*" &&
      normalized.startsWith(`${binding.local}.`)
    ) {
      const resolved = resolveExportStatic(
        importedFile,
        normalized.slice(binding.local.length + 1),
        files,
        crossFileHops - 1,
        localHops,
        nextSeen,
      );
      return prependImportEvidence(resolved, file, binding, imported.kind);
    }
    if (
      binding.imported !== "*" &&
      (normalized === binding.local ||
        normalized.startsWith(`${binding.local}.`))
    ) {
      const resolved = resolveExportStatic(
        importedFile,
        `${binding.imported}${normalized.slice(binding.local.length)}`,
        files,
        crossFileHops - 1,
        localHops,
        nextSeen,
      );
      return prependImportEvidence(resolved, file, binding, imported.kind);
    }
  }
  return null;
}

function resolveExportStatic(
  file: FileSymbols,
  exportedPath: string,
  files: Map<string, FileSymbols>,
  crossFileHops: number,
  localHops: number,
  seen: Set<string>,
): ResolvedStatic | null {
  const [base = "", ...suffixParts] = exportedPath.split(".");
  const suffix = suffixParts.length ? `.${suffixParts.join(".")}` : "";
  const binding = file.exports.get(base);
  if (binding?.local) {
    return resolveStatic(
      file,
      `${binding.local}${suffix}`,
      files,
      crossFileHops,
      localHops,
      seen,
    );
  }
  if (binding?.source && binding.imported && crossFileHops > 0) {
    const target = resolveImportWithKind(file.filename, binding.source, files);
    const resolved = target
      ? resolveExportStatic(
          target.file,
          `${binding.imported}${suffix}`,
          files,
          crossFileHops - 1,
          localHops,
          seen,
        )
      : null;
    return prependReExportEvidence(resolved, file, binding.source, false);
  }

  if (crossFileHops <= 0) return null;
  const matches = file.wildcardExports
    .map((source) => ({
      source,
      target: resolveImportWithKind(file.filename, source, files),
    }))
    .filter(
      (
        item,
      ): item is {
        source: string;
        target: { file: FileSymbols; kind: EvidenceKind };
      } => Boolean(item.target),
    )
    .map(({ source, target }) =>
      prependReExportEvidence(
        resolveExportStatic(
          target.file,
          exportedPath,
          files,
          crossFileHops - 1,
          localHops,
          seen,
        ),
        file,
        source,
        true,
      ),
    )
    .filter((value): value is ResolvedStatic => value !== null);
  return matches.length === 1 ||
    new Set(matches.map((item) => item.value)).size === 1
    ? (matches[0] ?? null)
    : null;
}

function enumerateExports(
  file: FileSymbols,
  files: Map<string, FileSymbols>,
  crossFileHops: number,
  seen: Set<string>,
): Set<string> {
  if (seen.has(file.filename)) return new Set();
  const nextSeen = new Set(seen).add(file.filename);
  const names = new Set<string>();
  for (const [exported, binding] of file.exports) {
    names.add(exported);
    if (binding.local) {
      for (const expression of file.expressions.keys()) {
        if (expression.startsWith(`${binding.local}.`)) {
          names.add(`${exported}${expression.slice(binding.local.length)}`);
        }
      }
    }
    if (binding.source && binding.imported && crossFileHops > 0) {
      const target = resolveImport(file.filename, binding.source, files);
      if (!target) continue;
      for (const targetName of enumerateExports(
        target,
        files,
        crossFileHops - 1,
        nextSeen,
      )) {
        if (targetName.startsWith(`${binding.imported}.`)) {
          names.add(`${exported}${targetName.slice(binding.imported.length)}`);
        }
      }
    }
  }
  if (crossFileHops > 0) {
    for (const source of file.wildcardExports) {
      const target = resolveImport(file.filename, source, files);
      if (!target) continue;
      for (const name of enumerateExports(
        target,
        files,
        crossFileHops - 1,
        nextSeen,
      )) {
        if (name !== "default") names.add(name);
      }
    }
  }
  return names;
}

function factoryCandidates(
  file: FileSymbols,
  files: Map<string, FileSymbols>,
): Set<string> {
  const candidates = new Set(file.factories.keys());
  for (const [alias, expression] of file.expressions) {
    if (/^[\w$]+(?:\.[\w$]+)*$/.test(normalizeExpression(expression))) {
      candidates.add(alias);
    }
  }
  for (const binding of file.imports) {
    const importedFile = resolveImport(file.filename, binding.source, files);
    if (!importedFile) continue;
    if (binding.imported === "*") {
      for (const name of enumerateExportedFactories(
        importedFile,
        files,
        MAX_CROSS_FILE_HOPS - 1,
        new Set(),
      )) {
        candidates.add(`${binding.local}.${name}`);
      }
    } else {
      candidates.add(binding.local);
    }
  }
  return candidates;
}

function resolveFactory(
  file: FileSymbols,
  reference: string,
  files: Map<string, FileSymbols>,
  constructors: Map<string, ConstructorSpec>,
  crossFileHops: number,
  factoryHops: number,
  seen: Set<string>,
): Omit<TypeScriptFactory, "name"> | null {
  if (factoryHops < 0) return null;
  const key = `${file.filename}:${reference}:${crossFileHops}:${factoryHops}`;
  if (seen.has(key)) return null;
  const nextSeen = new Set(seen).add(key);
  const raw = file.factories.get(reference);
  if (raw) {
    const spec = constructors.get(raw.callee);
    if (spec) {
      return {
        parameters: raw.parameters,
        arguments: raw.arguments,
        spec,
        evidence: [{ kind: "factory", file: file.filename, symbol: reference }],
      };
    }
    const nested = resolveFactory(
      file,
      raw.callee,
      files,
      constructors,
      crossFileHops,
      factoryHops - 1,
      nextSeen,
    );
    if (!nested) return null;
    const composed = composeFactory(raw, nested);
    return {
      ...composed,
      evidence: [
        { kind: "factory", file: file.filename, symbol: reference },
        ...composed.evidence,
      ],
    };
  }

  const alias = file.expressions.get(reference);
  if (alias && /^[\w$]+(?:\.[\w$]+)*$/.test(normalizeExpression(alias))) {
    return resolveFactory(
      file,
      normalizeExpression(alias),
      files,
      constructors,
      crossFileHops,
      factoryHops - 1,
      nextSeen,
    );
  }

  for (const binding of file.imports) {
    if (crossFileHops <= 0) continue;
    const target = resolveImport(file.filename, binding.source, files);
    if (!target) continue;
    if (binding.imported === "*" && reference.startsWith(`${binding.local}.`)) {
      const resolved = resolveExportedFactory(
        target,
        reference.slice(binding.local.length + 1),
        files,
        constructors,
        crossFileHops - 1,
        factoryHops,
        nextSeen,
      );
      return prependFactoryImportEvidence(
        resolved,
        file,
        binding,
        resolveImportKind(file.filename, binding.source, files),
      );
    }
    if (binding.imported !== "*" && reference === binding.local) {
      const resolved = resolveExportedFactory(
        target,
        binding.imported,
        files,
        constructors,
        crossFileHops - 1,
        factoryHops,
        nextSeen,
      );
      return prependFactoryImportEvidence(
        resolved,
        file,
        binding,
        resolveImportKind(file.filename, binding.source, files),
      );
    }
  }
  return null;
}

function resolveExportedFactory(
  file: FileSymbols,
  exported: string,
  files: Map<string, FileSymbols>,
  constructors: Map<string, ConstructorSpec>,
  crossFileHops: number,
  factoryHops: number,
  seen: Set<string>,
): Omit<TypeScriptFactory, "name"> | null {
  const binding = file.exports.get(exported);
  if (binding?.local) {
    return resolveFactory(
      file,
      binding.local,
      files,
      constructors,
      crossFileHops,
      factoryHops,
      seen,
    );
  }
  if (binding?.source && binding.imported && crossFileHops > 0) {
    const target = resolveImport(file.filename, binding.source, files);
    const resolved = target
      ? resolveExportedFactory(
          target,
          binding.imported,
          files,
          constructors,
          crossFileHops - 1,
          factoryHops,
          seen,
        )
      : null;
    return prependFactoryReExportEvidence(
      resolved,
      file,
      binding.source,
      false,
    );
  }
  if (crossFileHops <= 0) return null;
  const matches = file.wildcardExports
    .map((source) => ({
      source,
      target: resolveImport(file.filename, source, files),
    }))
    .filter((item): item is { source: string; target: FileSymbols } =>
      Boolean(item.target),
    )
    .map(({ source, target }) =>
      prependFactoryReExportEvidence(
        resolveExportedFactory(
          target,
          exported,
          files,
          constructors,
          crossFileHops - 1,
          factoryHops,
          seen,
        ),
        file,
        source,
        true,
      ),
    )
    .filter(
      (factory): factory is Omit<TypeScriptFactory, "name"> => factory !== null,
    );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function enumerateExportedFactories(
  file: FileSymbols,
  files: Map<string, FileSymbols>,
  crossFileHops: number,
  seen: Set<string>,
): Set<string> {
  if (seen.has(file.filename)) return new Set();
  const nextSeen = new Set(seen).add(file.filename);
  const names = new Set<string>();
  for (const [exported, binding] of file.exports) {
    if (binding.local && file.factories.has(binding.local)) names.add(exported);
    if (binding.source && crossFileHops > 0) names.add(exported);
  }
  if (crossFileHops > 0) {
    for (const source of file.wildcardExports) {
      const target = resolveImport(file.filename, source, files);
      if (!target) continue;
      for (const name of enumerateExportedFactories(
        target,
        files,
        crossFileHops - 1,
        nextSeen,
      )) {
        names.add(name);
      }
    }
  }
  return names;
}

function composeFactory(
  wrapper: RawFactory,
  nested: Omit<TypeScriptFactory, "name">,
): Omit<TypeScriptFactory, "name"> {
  const substitutions = factorySubstitutions(
    nested.parameters,
    wrapper.arguments,
  );
  return {
    parameters: wrapper.parameters,
    arguments: nested.arguments.map((argument) =>
      substituteFactoryArgument(argument, substitutions),
    ),
    spec: nested.spec,
    evidence: nested.evidence,
  };
}

function parseFactoryParameter(
  node: SgNode,
): TypeScriptFactoryParameter | null {
  const pattern = node.field("pattern") ?? node;
  const defaultValue = node.field("value")?.text();
  if (pattern.kind() === "identifier") {
    return {
      kind: "identifier",
      local: pattern.text(),
      ...(defaultValue !== undefined ? { defaultValue } : {}),
    };
  }
  if (pattern.kind() !== "object_pattern" || defaultValue !== undefined) {
    return null;
  }
  const properties = destructuredProperties(pattern, true);
  return properties ? { kind: "object", properties } : null;
}

function destructuredProperties(
  pattern: SgNode,
  allowDefaults = false,
): TypeScriptFactoryProperty[] | null {
  const properties: TypeScriptFactoryProperty[] = [];
  for (const child of pattern.children().filter((item) => item.isNamed())) {
    if (child.kind() === "shorthand_property_identifier_pattern") {
      properties.push({ key: child.text(), local: child.text() });
      continue;
    }
    if (child.kind() === "object_assignment_pattern") {
      if (!allowDefaults) return null;
      const local = child.field("left")?.text();
      const defaultValue = child.field("right")?.text();
      if (!local || defaultValue === undefined) return null;
      properties.push({ key: local, local, defaultValue });
      continue;
    }
    if (child.kind() !== "pair_pattern") return null;
    const keyNode = child.field("key");
    const valueNode = child.field("value");
    const key = staticPropertyName(keyNode);
    if (!key || !valueNode) return null;
    if (valueNode.kind() === "identifier") {
      properties.push({ key, local: valueNode.text() });
      continue;
    }
    if (valueNode.kind() === "assignment_pattern" && allowDefaults) {
      const local = valueNode.field("left")?.text();
      const defaultValue = valueNode.field("right")?.text();
      if (!local || defaultValue === undefined) return null;
      properties.push({ key, local, defaultValue });
      continue;
    }
    return null;
  }
  return properties.length ? properties : null;
}

function factorySubstitutions(
  parameters: TypeScriptFactoryParameter[],
  arguments_: string[],
): Map<string, string> {
  const substitutions = new Map<string, string>();
  parameters.forEach((parameter, index) => {
    const argument = arguments_[index];
    if (parameter.kind === "identifier") {
      const value = argument ?? parameter.defaultValue;
      if (parameter.local && value !== undefined) {
        substitutions.set(parameter.local, value);
      }
      return;
    }
    const properties = argument
      ? objectExpressionProperties(argument)
      : new Map<string, string>();
    for (const property of parameter.properties ?? []) {
      const value =
        properties?.get(property.key) ??
        (argument && !properties ? `${argument}.${property.key}` : undefined) ??
        property.defaultValue;
      if (value !== undefined) substitutions.set(property.local, value);
    }
  });
  return substitutions;
}

function substituteFactoryArgument(
  argument: string,
  substitutions: Map<string, string>,
): string {
  const normalized = normalizeExpression(argument);
  const direct = substitutions.get(normalized);
  if (direct !== undefined) return direct;
  const member = normalized.match(/^([$A-Z_a-z][$\w]*)\.([$A-Z_a-z][$\w]*)$/);
  if (!member?.[1] || !member[2]) return argument;
  const replacement = substitutions.get(member[1]);
  if (!replacement) return argument;
  const properties = objectExpressionProperties(replacement);
  return properties?.get(member[2]) ?? `${replacement}.${member[2]}`;
}

function prependImportEvidence(
  resolved: ResolvedStatic | null,
  file: FileSymbols,
  binding: ImportBinding,
  kind: EvidenceKind,
): ResolvedStatic | null {
  return resolved
    ? {
        value: resolved.value,
        evidence: [
          {
            kind,
            file: file.filename,
            symbol: binding.local,
            source: binding.source,
          },
          ...resolved.evidence,
        ],
      }
    : null;
}

function prependReExportEvidence(
  resolved: ResolvedStatic | null,
  file: FileSymbols,
  source: string,
  wildcard: boolean,
): ResolvedStatic | null {
  return resolved
    ? {
        value: resolved.value,
        evidence: [
          {
            kind: wildcard ? "wildcard-re-export" : "re-export",
            file: file.filename,
            source,
          },
          ...resolved.evidence,
        ],
      }
    : null;
}

function prependFactoryImportEvidence(
  resolved: Omit<TypeScriptFactory, "name"> | null,
  file: FileSymbols,
  binding: ImportBinding,
  kind: EvidenceKind,
): Omit<TypeScriptFactory, "name"> | null {
  return resolved
    ? {
        ...resolved,
        evidence: [
          {
            kind,
            file: file.filename,
            symbol: binding.local,
            source: binding.source,
          },
          ...resolved.evidence,
        ],
      }
    : null;
}

function prependFactoryReExportEvidence(
  resolved: Omit<TypeScriptFactory, "name"> | null,
  file: FileSymbols,
  source: string,
  wildcard: boolean,
): Omit<TypeScriptFactory, "name"> | null {
  return resolved
    ? {
        ...resolved,
        evidence: [
          {
            kind: wildcard ? "wildcard-re-export" : "re-export",
            file: file.filename,
            source,
          },
          ...resolved.evidence,
        ],
      }
    : null;
}

export function objectExpressionProperties(
  expression: string,
): Map<string, string> | null {
  const normalized = normalizeExpression(expression);
  if (!normalized.startsWith("{") || !normalized.endsWith("}")) return null;
  const tree = parse(Lang.TypeScript, `const __value = ${normalized};`).root();
  const object = tree.find({ rule: { kind: "object" } });
  if (!object) return null;
  const properties = new Map<string, string>();
  for (const child of object.children().filter((item) => item.isNamed())) {
    if (child.kind() === "shorthand_property_identifier") {
      properties.set(child.text(), child.text());
      continue;
    }
    if (child.kind() !== "pair") return null;
    const key = staticPropertyName(child.field("key"));
    const value = child.field("value")?.text();
    if (!key || value === undefined || properties.has(key)) return null;
    properties.set(key, value);
  }
  return properties;
}

function staticPropertyName(node: SgNode | null | undefined): string | null {
  if (!node) return null;
  if (["property_identifier", "identifier"].includes(String(node.kind()))) {
    return node.text();
  }
  const text = node.text();
  return literalString(text);
}

function resolveImport(
  filename: string,
  source: string,
  files: Map<string, FileSymbols>,
): FileSymbols | undefined {
  return resolveImportWithKind(filename, source, files)?.file;
}

function resolveImportKind(
  filename: string,
  source: string,
  files: Map<string, FileSymbols>,
): EvidenceKind {
  return (
    resolveImportWithKind(filename, source, files)?.kind ?? "relative-import"
  );
}

function resolveImportWithKind(
  filename: string,
  source: string,
  files: Map<string, FileSymbols>,
): { file: FileSymbols; kind: EvidenceKind } | undefined {
  const project = files.get(path.resolve(filename))?.projectResolution ?? null;
  const resolved = resolveTypeScriptImport(
    filename,
    source,
    new Set(files.keys()),
    project,
  );
  const file = resolved ? files.get(resolved.filename) : undefined;
  return resolved && file ? { file, kind: resolved.kind } : undefined;
}

function namedMatches(node: SgNode, name: string): SgNode[] {
  return node.getMultipleMatches(name).filter((item) => item.isNamed());
}

function normalizeExpression(expression: string): string {
  let value = expression.trim();
  value = value.replace(/\s+as\s+const\s*$/, "");
  while (value.startsWith("(") && value.endsWith(")")) {
    value = value.slice(1, -1).trim();
  }
  return value;
}

function literalNumberOrNull(expression: string): number | null {
  const text = expression.trim();
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text)) return null;
  return literalNumber(text);
}
