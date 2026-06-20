import { parse } from "@ast-grep/napi";
import { ensureDynamicLanguages } from "./languages.js";
import { detectedFromArguments, inferErrorFlow, literalString, toLocation, } from "./shared.js";
export function extractCSharpErrors(input) {
    ensureDynamicLanguages();
    const tree = parse("csharp", input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    for (const spec of input.constructors) {
        for (const node of tree.findAll({
            rule: { pattern: `new ${spec.name}($$$ARGS)` },
        })) {
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
                language: "csharp",
            }));
        }
    }
    for (const node of tree.findAll({
        rule: { pattern: "throw new $CTOR($$$ARGS)" },
    })) {
        const constructor = node.getMatch("CTOR")?.text() ?? "Exception";
        if (configured.has(constructor))
            continue;
        const args = node
            .getMultipleMatches("ARGS")
            .filter((item) => item.isNamed());
        errors.push({
            code: null,
            message: literalString(args[0]?.text() ?? ""),
            status: null,
            constructor,
            language: "csharp",
            structured: false,
            allowMessageVariants: false,
            flow: inferErrorFlow(node),
            location: toLocation(input.root, input.filename, node),
        });
    }
    return errors;
}
//# sourceMappingURL=csharp.js.map