import { Lang, parse } from "@ast-grep/napi";
import { detectedFromArguments, literalString, toLocation } from "./shared.js";
export function extractTypeScriptErrors(input) {
    const language = /\.[jt]sx$/.test(input.filename)
        ? Lang.Tsx
        : Lang.TypeScript;
    const tree = parse(language, input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    for (const spec of input.constructors) {
        const matches = tree.findAll({
            rule: { pattern: `new ${spec.name}($$$ARGS)` },
        });
        for (const node of matches) {
            if (!node
                .ancestors()
                .some((ancestor) => ancestor.kind() === "throw_statement"))
                continue;
            errors.push(detectedFromArguments({
                root: input.root,
                filename: input.filename,
                node,
                args: node
                    .getMultipleMatches("ARGS")
                    .filter((item) => item.isNamed()),
                spec,
                language: "typescript",
            }));
        }
    }
    const thrown = tree.findAll({
        rule: { pattern: "throw new $CTOR($$$ARGS)" },
    });
    for (const node of thrown) {
        const constructor = node.getMatch("CTOR")?.text() ?? "Error";
        if (configured.has(constructor))
            continue;
        const args = node
            .getMultipleMatches("ARGS")
            .filter((item) => item.isNamed());
        const message = literalString(args[0]?.text() ?? "");
        errors.push({
            code: null,
            message,
            status: null,
            constructor,
            language: "typescript",
            structured: false,
            allowMessageVariants: false,
            location: toLocation(input.root, input.filename, node),
        });
    }
    return errors;
}
//# sourceMappingURL=typescript.js.map