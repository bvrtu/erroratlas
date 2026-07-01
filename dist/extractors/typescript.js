import path from "node:path";
import { Lang, parse } from "@ast-grep/napi";
import { detectedFromArguments, detectedFromArgumentTexts, inferErrorFlow, propertyStaticNumber, propertyStaticString, staticNumber, staticString, toLocation, } from "./shared.js";
import { collectLocalTypeScriptFactories, collectLocalTypeScriptValues, objectExpressionProperties, } from "./typescript-symbols.js";
export function extractTypeScriptErrors(input) {
    const language = /\.[jt]sx$/.test(input.filename)
        ? Lang.Tsx
        : Lang.TypeScript;
    const tree = parse(language, input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    const values = input.staticValues ??
        collectLocalTypeScriptValues(input.filename, input.source);
    for (const spec of input.constructors) {
        const matches = tree.findAll({
            rule: { pattern: `new ${spec.name}($$$ARGS)` },
        });
        for (const node of matches) {
            if (!node
                .ancestors()
                .some((ancestor) => ancestor.kind() === "throw_statement"))
                continue;
            const args = namedMatches(node, "ARGS");
            errors.push(withEvidence(detectedFromArguments({
                root: input.root,
                filename: input.filename,
                node,
                args,
                spec,
                language: "typescript",
                values,
            }), input, args.map((item) => item.text())));
        }
    }
    const thrown = tree.findAll({
        rule: { pattern: "throw new $CTOR($$$ARGS)" },
    });
    for (const node of thrown) {
        const constructor = node.getMatch("CTOR")?.text() ?? "Error";
        if (configured.has(constructor))
            continue;
        const args = namedMatches(node, "ARGS");
        errors.push(withEvidence({
            code: null,
            message: staticString(args[0]?.text() ?? "", values),
            status: null,
            constructor,
            language: "typescript",
            structured: false,
            allowMessageVariants: false,
            flow: inferErrorFlow(node),
            location: toLocation(input.root, input.filename, node),
        }, input, args.map((item) => item.text())));
    }
    errors.push(...extractFactoryThrows(input, tree, values), ...extractApiResponses(input, tree, values));
    return errors;
}
function extractFactoryThrows(input, tree, values) {
    const factories = input.factories ??
        collectLocalTypeScriptFactories(input.filename, tree.text(), input.constructors);
    const errors = [];
    const resolvedNodes = new Set();
    for (const node of tree.findAll({
        rule: { pattern: "throw $FACTORY($$$ARGS)" },
    })) {
        const name = node.getMatch("FACTORY")?.text();
        const factory = name ? factories.get(name) : undefined;
        if (!factory)
            continue;
        resolvedNodes.add(node.id());
        const callArguments = namedMatches(node, "ARGS").map((item) => item.text());
        const scopedValues = new Map(values);
        bindFactoryArguments(factory.parameters, callArguments, values, scopedValues);
        errors.push(withEvidence(detectedFromArgumentTexts({
            root: input.root,
            filename: input.filename,
            node,
            args: factory.arguments,
            spec: factory.spec,
            language: "typescript",
            values: scopedValues,
            constructorName: `${factory.name}()`,
        }), input, callArguments, factory.evidence));
    }
    for (const node of tree.findAll({
        rule: { pattern: "throw $FACTORY($$$ARGS)" },
    })) {
        if (resolvedNodes.has(node.id()))
            continue;
        const name = node.getMatch("FACTORY")?.text();
        if (!name || name === "new")
            continue;
        errors.push(withEvidence({
            code: null,
            message: null,
            status: null,
            constructor: `${name}()`,
            language: "typescript",
            structured: false,
            allowMessageVariants: false,
            flow: inferErrorFlow(node),
            location: toLocation(input.root, input.filename, node),
        }, input, []));
    }
    return errors;
}
function bindFactoryArguments(parameters, callArguments, values, scopedValues) {
    parameters.forEach((parameter, index) => {
        const argument = callArguments[index];
        if (parameter.kind === "identifier") {
            if (!parameter.local)
                return;
            const expression = argument ?? parameter.defaultValue;
            if (expression === undefined)
                return;
            const value = resolveValue(expression, values);
            if (value !== null)
                scopedValues.set(parameter.local, value);
            bindObjectAlias(parameter.local, expression, values, scopedValues);
            return;
        }
        const object = argument ? objectExpressionProperties(argument) : null;
        for (const property of parameter.properties ?? []) {
            const expression = object?.get(property.key) ??
                (argument && !object ? `${argument}.${property.key}` : undefined);
            const value = (expression === undefined ? null : resolveValue(expression, values)) ??
                (property.defaultValue === undefined
                    ? null
                    : resolveValue(property.defaultValue, values));
            if (value !== null)
                scopedValues.set(property.local, value);
        }
    });
}
function bindObjectAlias(local, expression, values, scopedValues) {
    const object = objectExpressionProperties(expression);
    if (object) {
        for (const [key, valueExpression] of object) {
            const value = resolveValue(valueExpression, values);
            if (value !== null)
                scopedValues.set(`${local}.${key}`, value);
        }
        return;
    }
    const prefix = `${expression.trim()}.`;
    for (const [name, value] of values) {
        if (name.startsWith(prefix)) {
            scopedValues.set(`${local}.${name.slice(prefix.length)}`, value);
        }
    }
}
function extractApiResponses(input, tree, values) {
    const errors = [];
    const seen = new Set();
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
            if (detected)
                addUnique(errors, seen, node, detected);
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
            if (detected)
                addUnique(errors, seen, node, detected);
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
            if (detected)
                addUnique(errors, seen, node, detected);
        }
    }
    return errors;
}
function responseDetection(input) {
    const code = propertyStaticString(input.body, ["code", "errorCode", "error_code"], input.values);
    const message = propertyStaticString(input.body, ["message", "detail", "title", "error"], input.values);
    const status = staticNumber(input.statusText, input.values) ??
        propertyStaticNumber(input.statusText, ["status", "statusCode", "status_code"], input.values) ??
        propertyStaticNumber(input.body, ["status", "statusCode", "status_code"], input.values);
    const explicitlyError = /["']?error["']?\s*:/.test(input.body);
    if (status !== null && status < 400)
        return null;
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
        evidence: basicEvidence(input.root, input.filename, input.constructor, code !== null),
    };
}
function problemDetails(body, values) {
    const type = propertyStaticString(body, ["type"], values);
    const title = propertyStaticString(body, ["title"], values);
    const detail = propertyStaticString(body, ["detail"], values);
    const instance = propertyStaticString(body, ["instance"], values);
    if ([type, title, detail, instance].every((value) => value === null))
        return {};
    const extensions = {};
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
        if (!key || reserved.has(key) || valueText === undefined)
            continue;
        const value = staticProblemValue(valueText, values);
        if (value !== undefined)
            extensions[key] = value;
    }
    return {
        problem: { type, title, detail, instance, extensions },
    };
}
function staticProblemValue(text, values) {
    const value = resolveValue(text, values);
    if (value !== null)
        return value;
    const normalized = text.trim();
    if (normalized === "true")
        return true;
    if (normalized === "false")
        return false;
    if (normalized === "null")
        return null;
    return undefined;
}
function namedMatches(node, name) {
    return node.getMultipleMatches(name).filter((item) => item.isNamed());
}
function resolveValue(text, values) {
    return staticString(text, values) ?? staticNumber(text, values);
}
function addUnique(errors, seen, node, detected) {
    const range = node.range();
    const key = `${range.start.index}:${range.end.index}`;
    if (seen.has(key))
        return;
    seen.add(key);
    errors.push(detected);
}
function withEvidence(error, input, expressions, extra = []) {
    const steps = [
        ...basicEvidence(input.root, input.filename, error.constructor, error.structured).steps,
        ...extra.map((step) => normalizeEvidenceStep(input.root, step)),
    ];
    for (const expression of expressions) {
        for (const step of input.staticEvidence?.get(expression.trim()) ?? []) {
            steps.push(normalizeEvidenceStep(input.root, step));
        }
    }
    return {
        ...error,
        evidence: {
            confidence: error.structured ? "proven" : "partial",
            steps: uniqueEvidence(steps),
        },
    };
}
function basicEvidence(root, filename, symbol, structured) {
    return {
        confidence: structured ? "proven" : "partial",
        steps: [
            {
                kind: "syntax",
                file: path.relative(root, filename).split(path.sep).join("/"),
                symbol,
            },
        ],
    };
}
function normalizeEvidenceStep(root, step) {
    const file = path.isAbsolute(step.file)
        ? path.relative(root, step.file).split(path.sep).join("/")
        : step.file.split(path.sep).join("/");
    return { ...step, file };
}
function uniqueEvidence(steps) {
    const seen = new Set();
    return steps.filter((step) => {
        const key = JSON.stringify(step);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=typescript.js.map