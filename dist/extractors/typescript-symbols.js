import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { literalNumber, literalString } from "./shared.js";
const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
export function buildTypeScriptStaticValues(files) {
    const symbols = new Map(files.map((file) => [path.resolve(file.filename), collectSymbols(file)]));
    for (let iteration = 0; iteration < files.length + 2; iteration += 1) {
        let changed = false;
        for (const file of symbols.values()) {
            for (const binding of file.imports) {
                const importedFile = resolveImport(file.filename, binding.source, symbols);
                if (!importedFile)
                    continue;
                if (binding.imported === "*") {
                    for (const [exported, local] of importedFile.exports) {
                        const value = importedFile.values.get(local);
                        if (value !== undefined) {
                            changed =
                                setValue(file.values, `${binding.local}.${exported}`, value) ||
                                    changed;
                        }
                    }
                    continue;
                }
                const exportedLocal = importedFile.exports.get(binding.imported);
                const value = exportedLocal
                    ? importedFile.values.get(exportedLocal)
                    : undefined;
                if (value !== undefined) {
                    changed = setValue(file.values, binding.local, value) || changed;
                }
            }
            for (const [name, expression] of file.expressions) {
                const value = evaluateStatic(expression, file.values);
                if (value !== null)
                    changed = setValue(file.values, name, value) || changed;
            }
        }
        if (!changed)
            break;
    }
    return new Map([...symbols].map(([filename, file]) => [filename, file.values]));
}
export function collectLocalTypeScriptValues(filename, source) {
    return (buildTypeScriptStaticValues([{ filename, source }]).get(path.resolve(filename)) ?? new Map());
}
export function evaluateStatic(expression, values) {
    return (literalString(expression) ??
        literalNumberOrNull(expression) ??
        values.get(expression.trim()) ??
        null);
}
function collectSymbols(file) {
    const language = /\.[jt]sx$/.test(file.filename) ? Lang.Tsx : Lang.TypeScript;
    const tree = parse(language, file.source).root();
    const expressions = new Map();
    const exports = new Map();
    const imports = [];
    const values = new Map();
    for (const node of tree.findAll({
        rule: { pattern: "const $NAME = $VALUE" },
    })) {
        const name = node.getMatch("NAME")?.text();
        const expression = node.getMatch("VALUE")?.text();
        if (!name || expression === undefined)
            continue;
        expressions.set(name, expression);
        const value = evaluateStatic(expression, values);
        if (value !== null)
            values.set(name, value);
        if (node.parent()?.kind() === "export_statement")
            exports.set(name, name);
    }
    for (const node of tree.findAll({ rule: { kind: "export_statement" } })) {
        const match = node.text().match(/^export\s*{([^}]+)}/s);
        if (!match?.[1])
            continue;
        for (const item of match[1].split(",")) {
            const binding = item.trim().match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
            if (binding?.[1])
                exports.set(binding[2] ?? binding[1], binding[1]);
        }
    }
    for (const node of tree.findAll({ rule: { kind: "import_statement" } })) {
        imports.push(...parseImports(node.text()));
    }
    return {
        filename: path.resolve(file.filename),
        expressions,
        exports,
        imports,
        values,
    };
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
    return bindings;
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
function setValue(values, name, value) {
    if (values.get(name) === value)
        return false;
    values.set(name, value);
    return true;
}
function literalNumberOrNull(expression) {
    const text = expression.trim();
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(text))
        return null;
    return literalNumber(text);
}
//# sourceMappingURL=typescript-symbols.js.map