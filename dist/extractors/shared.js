import path from "node:path";
export function toLocation(root, filename, node) {
    const range = node.range();
    return {
        file: path.relative(root, filename).split(path.sep).join("/"),
        line: range.start.line + 1,
        column: range.start.column + 1,
        endLine: range.end.line + 1,
        endColumn: range.end.column + 1,
    };
}
export function literalString(text) {
    const value = text.trim();
    if (value.length < 2)
        return null;
    const quote = value[0];
    if (quote !== value.at(-1) || !["'", '"', "`"].includes(quote ?? ""))
        return null;
    const body = value.slice(1, -1);
    if (quote === "`" && body.includes("${"))
        return null;
    if ((quote === "'" || quote === '"') &&
        /(^|[^\\])\{/.test(body) &&
        value.startsWith("f")) {
        return null;
    }
    return body
        .replace(/\\([\\'"`])/g, "$1")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t");
}
export function literalNumber(text) {
    const value = Number(text.trim());
    return Number.isFinite(value) ? value : null;
}
export function propertyString(text, names) {
    for (const name of names) {
        const escaped = escapeRegExp(name);
        const match = text.match(new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*(["'\`])((?:\\\\.|(?!\\1).)*)\\1`, "s"));
        if (match?.[2] !== undefined)
            return match[2].replace(/\\([\\'"`])/g, "$1");
    }
    return null;
}
export function propertyNumber(text, names) {
    for (const name of names) {
        const escaped = escapeRegExp(name);
        const match = text.match(new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*(\\d{3})\\b`));
        if (match?.[1])
            return Number(match[1]);
    }
    return null;
}
export function staticString(text, values = new Map()) {
    const literal = literalString(text);
    if (literal !== null)
        return literal;
    const value = values.get(text.trim());
    return typeof value === "string" ? value : null;
}
export function staticNumber(text, values = new Map()) {
    const trimmed = text.trim();
    const literal = /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)
        ? literalNumber(trimmed)
        : null;
    if (literal !== null)
        return literal;
    const value = values.get(trimmed);
    return typeof value === "number" ? value : null;
}
export function propertyStaticString(text, names, values = new Map()) {
    const literal = propertyString(text, names);
    if (literal !== null)
        return literal;
    for (const name of names) {
        const escaped = escapeRegExp(name);
        const match = text.match(new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*([A-Z_a-z$][\\w$]*(?:\\.[A-Z_a-z$][\\w$]*)*)`));
        if (match?.[1]) {
            const value = values.get(match[1]);
            if (typeof value === "string")
                return value;
        }
    }
    return null;
}
export function propertyStaticNumber(text, names, values = new Map()) {
    const literal = propertyNumber(text, names);
    if (literal !== null)
        return literal;
    for (const name of names) {
        const escaped = escapeRegExp(name);
        const match = text.match(new RegExp(`["']?${escaped}["']?\\s*[:=]\\s*([A-Z_a-z$][\\w$]*(?:\\.[A-Z_a-z$][\\w$]*)*)`));
        if (match?.[1]) {
            const value = values.get(match[1]);
            if (typeof value === "number")
                return value;
        }
    }
    return null;
}
export function detectedFromArguments(input) {
    return detectedFromArgumentTexts({
        ...input,
        args: input.args.map((item) => item.text()),
    });
}
export function detectedFromArgumentTexts(input) {
    const { args, spec } = input;
    const values = input.values ?? new Map();
    const objectText = args[0]?.trim() ?? "";
    const isObject = objectText.startsWith("{");
    const joinedArgs = args.join(", ");
    const code = isObject
        ? propertyStaticString(objectText, ["code", "errorCode", "error_code"], values)
        : (readStringArgument(args, spec.codeArgument, values) ??
            propertyStaticString(joinedArgs, ["code", "errorCode", "error_code"], values));
    const message = isObject
        ? propertyStaticString(objectText, ["message", "detail", "title", "error"], values)
        : (readStringArgument(args, spec.messageArgument, values) ??
            propertyStaticString(joinedArgs, ["message", "detail", "title", "error"], values));
    const status = isObject
        ? (propertyStaticNumber(objectText, ["status", "statusCode", "status_code"], values) ??
            spec.defaultStatus ??
            null)
        : (readNumberArgument(args, spec.statusArgument, values) ??
            propertyStaticNumber(joinedArgs, ["status", "statusCode", "status_code"], values) ??
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
export function inferErrorFlow(node) {
    let insideCatch = false;
    for (const ancestor of node.ancestors()) {
        const kind = String(ancestor.kind());
        if (kind === "return_statement")
            return "returned";
        if (["catch_clause", "except_clause", "catch_block"].includes(kind)) {
            insideCatch = true;
        }
        if (["try_statement", "try_expression", "do_statement"].includes(kind)) {
            if (insideCatch)
                return "rethrown";
            const hasHandler = ancestor
                .children()
                .some((child) => ["catch_clause", "except_clause", "catch_block"].includes(String(child.kind())));
            if (hasHandler)
                return "caught";
        }
        if ([
            "function_declaration",
            "function_definition",
            "method_declaration",
            "arrow_function",
            "lambda_expression",
        ].includes(kind)) {
            break;
        }
    }
    return "propagated";
}
function readStringArgument(args, index, values) {
    if (index === undefined)
        return null;
    const text = args[index];
    return text === undefined ? null : staticString(text, values);
}
function readNumberArgument(args, index, values) {
    if (index === undefined)
        return null;
    const text = args[index];
    if (text === undefined)
        return null;
    return (staticNumber(text, values) ??
        propertyStaticNumber(text, ["status", "statusCode", "status_code"], values));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//# sourceMappingURL=shared.js.map