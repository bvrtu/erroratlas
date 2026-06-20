import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { literalNumber, literalString } from "./shared.js";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
export const MAX_CROSS_FILE_HOPS = 2;
const MAX_LOCAL_ALIAS_HOPS = 8;
const MAX_FACTORY_HOPS = 2;
export function buildTypeScriptStaticValues(files) {
    const symbols = collectProjectSymbols(files);
    return new Map([...symbols].map(([filename, file]) => [
        filename,
        materializeStaticValues(file, symbols),
    ]));
}
export function buildTypeScriptFactories(files, constructors) {
    const symbols = collectProjectSymbols(files);
    const constructorMap = new Map(constructors.map((constructor) => [constructor.name, constructor]));
    return new Map([...symbols].map(([filename, file]) => {
        const factories = new Map();
        for (const candidate of factoryCandidates(file, symbols)) {
            const resolved = resolveFactory(file, candidate, symbols, constructorMap, MAX_CROSS_FILE_HOPS, MAX_FACTORY_HOPS, new Set());
            if (resolved)
                factories.set(candidate, { ...resolved, name: candidate });
        }
        return [filename, factories];
    }));
}
export function collectLocalTypeScriptValues(filename, source) {
    return (buildTypeScriptStaticValues([{ filename, source }]).get(path.resolve(filename)) ?? new Map());
}
export function collectLocalTypeScriptFactories(filename, source, constructors) {
    return (buildTypeScriptFactories([{ filename, source }], constructors).get(path.resolve(filename)) ?? new Map());
}
export function evaluateStatic(expression, values) {
    const normalized = normalizeExpression(expression);
    return (literalString(normalized) ??
        literalNumberOrNull(normalized) ??
        values.get(normalized) ??
        null);
}
function collectProjectSymbols(files) {
    return new Map(files.map((file) => [path.resolve(file.filename), collectSymbols(file)]));
}
function collectSymbols(file) {
    const language = /\.[jt]sx$/.test(file.filename) ? Lang.Tsx : Lang.TypeScript;
    const tree = parse(language, file.source).root();
    const expressions = new Map();
    const exports = new Map();
    const wildcardExports = [];
    const imports = [];
    const factories = new Map();
    for (const node of tree.findAll({
        rule: { pattern: "const $NAME = $VALUE" },
    })) {
        const name = node.getMatch("NAME")?.text();
        const valueNode = node.getMatch("VALUE");
        if (!name || !valueNode)
            continue;
        expressions.set(name, valueNode.text());
        collectObjectMembers(name, valueNode, expressions);
        if (node.parent()?.kind() === "export_statement") {
            exports.set(name, { local: name });
        }
    }
    for (const node of tree.findAll({ rule: { kind: "enum_declaration" } })) {
        const name = node.field("name")?.text();
        if (!name)
            continue;
        for (const assignment of node.findAll({
            rule: { kind: "enum_assignment" },
        })) {
            const member = assignment.field("name")?.text();
            const value = assignment.field("value")?.text();
            if (member && value !== undefined)
                expressions.set(`${name}.${member}`, value);
        }
        if (node.parent()?.kind() === "export_statement") {
            exports.set(name, { local: name });
        }
    }
    collectFactories(tree, factories);
    for (const node of tree.findAll({ rule: { kind: "export_statement" } })) {
        parseExport(node.text(), exports, wildcardExports, expressions);
    }
    for (const node of tree.findAll({ rule: { kind: "import_statement" } })) {
        imports.push(...parseImports(node.text()));
    }
    return {
        filename: path.resolve(file.filename),
        expressions,
        exports,
        wildcardExports,
        imports,
        factories,
    };
}
function collectObjectMembers(name, valueNode, expressions) {
    const object = valueNode.kind() === "object"
        ? valueNode
        : valueNode.find({ rule: { kind: "object" } });
    if (!object)
        return;
    for (const pair of object
        .children()
        .filter((child) => child.kind() === "pair")) {
        const key = pair
            .field("key")
            ?.text()
            .replace(/^["']|["']$/g, "");
        const value = pair.field("value")?.text();
        if (key && value !== undefined)
            expressions.set(`${name}.${key}`, value);
    }
}
function collectFactories(tree, factories) {
    for (const pattern of [
        "function $FACTORY($$$PARAMS) { return new $CALLEE($$$ARGS); }",
        "function $FACTORY($$$PARAMS) { return $CALLEE($$$ARGS); }",
        "const $FACTORY = ($$$PARAMS) => new $CALLEE($$$ARGS)",
        "const $FACTORY = ($$$PARAMS) => $CALLEE($$$ARGS)",
    ]) {
        for (const node of tree.findAll({ rule: { pattern } })) {
            const name = node.getMatch("FACTORY")?.text();
            const callee = node.getMatch("CALLEE")?.text();
            if (!name || !callee)
                continue;
            factories.set(name, {
                parameters: namedMatches(node, "PARAMS").map((item) => item.text()),
                arguments: namedMatches(node, "ARGS").map((item) => item.text()),
                callee,
            });
        }
    }
}
function parseExport(statement, exports, wildcardExports, expressions) {
    const defaultDeclaration = statement.match(/^export\s+default\s+(?:async\s+)?(?:function|class)\s+([\w$]+)/)?.[1];
    if (defaultDeclaration)
        exports.set("default", { local: defaultDeclaration });
    const declaration = statement.match(/^export\s+(?:async\s+)?(?:function|class|enum)\s+([\w$]+)/)?.[1];
    if (declaration)
        exports.set(declaration, { local: declaration });
    const source = statement.match(/\bfrom\s+(["'])(.*?)\1/)?.[2];
    if (source?.startsWith(".") && /^export\s+\*/.test(statement.trim())) {
        wildcardExports.push(source);
        return;
    }
    const clause = statement.match(/^export\s*{([^}]+)}/s)?.[1];
    if (clause) {
        for (const item of clause.split(",")) {
            const match = item.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
            if (!match?.[1])
                continue;
            const exported = match[2] ?? match[1];
            exports.set(exported, source?.startsWith(".")
                ? { imported: match[1], source }
                : { local: match[1] });
        }
    }
    const defaultExpression = statement
        .match(/^export\s+default\s+([\s\S]+?);?$/)?.[1]
        ?.trim();
    if (defaultExpression && !/^(?:function|class)\b/.test(defaultExpression)) {
        const local = "__erroratlas_default__";
        expressions.set(local, defaultExpression.replace(/;$/, ""));
        exports.set("default", { local });
    }
}
function parseImports(statement) {
    const source = statement.match(/\bfrom\s+(["'])(.*?)\1/)?.[2];
    if (!source?.startsWith("."))
        return [];
    const bindings = [];
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
    if (namespace)
        bindings.push({ imported: "*", local: namespace, source });
    const beforeNamed = statement.match(/^import\s+([^\s,{*][\w$]*)\s*(?:,|\s+from)/)?.[1];
    if (beforeNamed) {
        bindings.push({ imported: "default", local: beforeNamed, source });
    }
    return bindings;
}
function materializeStaticValues(file, files) {
    const values = new Map();
    const candidates = new Set(file.expressions.keys());
    for (const binding of file.imports) {
        const importedFile = resolveImport(file.filename, binding.source, files);
        if (!importedFile)
            continue;
        if (binding.imported === "*") {
            for (const exported of enumerateExports(importedFile, files, MAX_CROSS_FILE_HOPS - 1, new Set())) {
                candidates.add(`${binding.local}.${exported}`);
            }
            continue;
        }
        for (const exported of enumerateExports(importedFile, files, MAX_CROSS_FILE_HOPS - 1, new Set())) {
            if (exported === binding.imported)
                candidates.add(binding.local);
            if (exported.startsWith(`${binding.imported}.`)) {
                candidates.add(`${binding.local}${exported.slice(binding.imported.length)}`);
            }
        }
    }
    for (const candidate of candidates) {
        const value = resolveStatic(file, candidate, files, MAX_CROSS_FILE_HOPS, MAX_LOCAL_ALIAS_HOPS, new Set());
        if (value !== null)
            values.set(candidate, value);
    }
    return values;
}
function resolveStatic(file, expression, files, crossFileHops, localHops, seen) {
    const normalized = normalizeExpression(expression);
    const literal = literalString(normalized) ?? literalNumberOrNull(normalized);
    if (literal !== null)
        return literal;
    if (localHops < 0)
        return null;
    const key = `${file.filename}:${normalized}:${crossFileHops}`;
    if (seen.has(key))
        return null;
    const nextSeen = new Set(seen).add(key);
    const localExpression = file.expressions.get(normalized);
    if (localExpression !== undefined) {
        return resolveStatic(file, localExpression, files, crossFileHops, localHops - 1, nextSeen);
    }
    for (const binding of file.imports) {
        if (crossFileHops <= 0)
            continue;
        const importedFile = resolveImport(file.filename, binding.source, files);
        if (!importedFile)
            continue;
        if (binding.imported === "*" &&
            normalized.startsWith(`${binding.local}.`)) {
            return resolveExportStatic(importedFile, normalized.slice(binding.local.length + 1), files, crossFileHops - 1, localHops, nextSeen);
        }
        if (binding.imported !== "*" &&
            (normalized === binding.local ||
                normalized.startsWith(`${binding.local}.`))) {
            return resolveExportStatic(importedFile, `${binding.imported}${normalized.slice(binding.local.length)}`, files, crossFileHops - 1, localHops, nextSeen);
        }
    }
    return null;
}
function resolveExportStatic(file, exportedPath, files, crossFileHops, localHops, seen) {
    const [base = "", ...suffixParts] = exportedPath.split(".");
    const suffix = suffixParts.length ? `.${suffixParts.join(".")}` : "";
    const binding = file.exports.get(base);
    if (binding?.local) {
        return resolveStatic(file, `${binding.local}${suffix}`, files, crossFileHops, localHops, seen);
    }
    if (binding?.source && binding.imported && crossFileHops > 0) {
        const target = resolveImport(file.filename, binding.source, files);
        return target
            ? resolveExportStatic(target, `${binding.imported}${suffix}`, files, crossFileHops - 1, localHops, seen)
            : null;
    }
    if (crossFileHops <= 0)
        return null;
    const matches = file.wildcardExports
        .map((source) => resolveImport(file.filename, source, files))
        .filter((target) => Boolean(target))
        .map((target) => resolveExportStatic(target, exportedPath, files, crossFileHops - 1, localHops, seen))
        .filter((value) => value !== null);
    return matches.length === 1 || new Set(matches).size === 1
        ? (matches[0] ?? null)
        : null;
}
function enumerateExports(file, files, crossFileHops, seen) {
    if (seen.has(file.filename))
        return new Set();
    const nextSeen = new Set(seen).add(file.filename);
    const names = new Set();
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
            if (!target)
                continue;
            for (const targetName of enumerateExports(target, files, crossFileHops - 1, nextSeen)) {
                if (targetName.startsWith(`${binding.imported}.`)) {
                    names.add(`${exported}${targetName.slice(binding.imported.length)}`);
                }
            }
        }
    }
    if (crossFileHops > 0) {
        for (const source of file.wildcardExports) {
            const target = resolveImport(file.filename, source, files);
            if (!target)
                continue;
            for (const name of enumerateExports(target, files, crossFileHops - 1, nextSeen)) {
                if (name !== "default")
                    names.add(name);
            }
        }
    }
    return names;
}
function factoryCandidates(file, files) {
    const candidates = new Set(file.factories.keys());
    for (const [alias, expression] of file.expressions) {
        if (/^[\w$]+(?:\.[\w$]+)*$/.test(normalizeExpression(expression))) {
            candidates.add(alias);
        }
    }
    for (const binding of file.imports) {
        const importedFile = resolveImport(file.filename, binding.source, files);
        if (!importedFile)
            continue;
        if (binding.imported === "*") {
            for (const name of enumerateExportedFactories(importedFile, files, MAX_CROSS_FILE_HOPS - 1, new Set())) {
                candidates.add(`${binding.local}.${name}`);
            }
        }
        else {
            candidates.add(binding.local);
        }
    }
    return candidates;
}
function resolveFactory(file, reference, files, constructors, crossFileHops, factoryHops, seen) {
    if (factoryHops < 0)
        return null;
    const key = `${file.filename}:${reference}:${crossFileHops}:${factoryHops}`;
    if (seen.has(key))
        return null;
    const nextSeen = new Set(seen).add(key);
    const raw = file.factories.get(reference);
    if (raw) {
        const spec = constructors.get(raw.callee);
        if (spec) {
            return {
                parameters: raw.parameters,
                arguments: raw.arguments,
                spec,
            };
        }
        const nested = resolveFactory(file, raw.callee, files, constructors, crossFileHops, factoryHops - 1, nextSeen);
        return nested ? composeFactory(raw, nested) : null;
    }
    const alias = file.expressions.get(reference);
    if (alias && /^[\w$]+(?:\.[\w$]+)*$/.test(normalizeExpression(alias))) {
        return resolveFactory(file, normalizeExpression(alias), files, constructors, crossFileHops, factoryHops - 1, nextSeen);
    }
    for (const binding of file.imports) {
        if (crossFileHops <= 0)
            continue;
        const target = resolveImport(file.filename, binding.source, files);
        if (!target)
            continue;
        if (binding.imported === "*" && reference.startsWith(`${binding.local}.`)) {
            return resolveExportedFactory(target, reference.slice(binding.local.length + 1), files, constructors, crossFileHops - 1, factoryHops, nextSeen);
        }
        if (binding.imported !== "*" && reference === binding.local) {
            return resolveExportedFactory(target, binding.imported, files, constructors, crossFileHops - 1, factoryHops, nextSeen);
        }
    }
    return null;
}
function resolveExportedFactory(file, exported, files, constructors, crossFileHops, factoryHops, seen) {
    const binding = file.exports.get(exported);
    if (binding?.local) {
        return resolveFactory(file, binding.local, files, constructors, crossFileHops, factoryHops, seen);
    }
    if (binding?.source && binding.imported && crossFileHops > 0) {
        const target = resolveImport(file.filename, binding.source, files);
        return target
            ? resolveExportedFactory(target, binding.imported, files, constructors, crossFileHops - 1, factoryHops, seen)
            : null;
    }
    if (crossFileHops <= 0)
        return null;
    const matches = file.wildcardExports
        .map((source) => resolveImport(file.filename, source, files))
        .filter((target) => Boolean(target))
        .map((target) => resolveExportedFactory(target, exported, files, constructors, crossFileHops - 1, factoryHops, seen))
        .filter((factory) => factory !== null);
    return matches.length === 1 ? (matches[0] ?? null) : null;
}
function enumerateExportedFactories(file, files, crossFileHops, seen) {
    if (seen.has(file.filename))
        return new Set();
    const nextSeen = new Set(seen).add(file.filename);
    const names = new Set();
    for (const [exported, binding] of file.exports) {
        if (binding.local && file.factories.has(binding.local))
            names.add(exported);
        if (binding.source && crossFileHops > 0)
            names.add(exported);
    }
    if (crossFileHops > 0) {
        for (const source of file.wildcardExports) {
            const target = resolveImport(file.filename, source, files);
            if (!target)
                continue;
            for (const name of enumerateExportedFactories(target, files, crossFileHops - 1, nextSeen)) {
                names.add(name);
            }
        }
    }
    return names;
}
function composeFactory(wrapper, nested) {
    const substitutions = new Map();
    nested.parameters.forEach((parameter, index) => {
        const argument = wrapper.arguments[index];
        if (argument !== undefined)
            substitutions.set(parameter, argument);
    });
    return {
        parameters: wrapper.parameters,
        arguments: nested.arguments.map((argument) => substitutions.get(argument.trim()) ?? argument),
        spec: nested.spec,
    };
}
function resolveImport(filename, source, files) {
    const base = path.resolve(path.dirname(filename), source);
    const candidates = [
        base,
        ...EXTENSIONS.map((extension) => `${base}${extension}`),
        ...EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
    ];
    return candidates.map((candidate) => files.get(candidate)).find(Boolean);
}
function namedMatches(node, name) {
    return node.getMultipleMatches(name).filter((item) => item.isNamed());
}
function normalizeExpression(expression) {
    let value = expression.trim();
    value = value.replace(/\s+as\s+const\s*$/, "");
    while (value.startsWith("(") && value.endsWith(")")) {
        value = value.slice(1, -1).trim();
    }
    return value;
}
function literalNumberOrNull(expression) {
    const text = expression.trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text))
        return null;
    return literalNumber(text);
}
//# sourceMappingURL=typescript-symbols.js.map