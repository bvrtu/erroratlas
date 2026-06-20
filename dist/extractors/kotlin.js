import { parse } from "@ast-grep/napi";
import { ensureDynamicLanguages } from "./languages.js";
import { detectedFromArguments, inferErrorFlow, literalString, toLocation, } from "./shared.js";
export function extractKotlinErrors(input) {
    ensureDynamicLanguages();
    const tree = parse("kotlin", input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    for (const spec of input.constructors) {
        for (const node of tree.findAll({
            rule: { pattern: `${spec.name}($$$ARGS)` },
        })) {
            if (!node
                .ancestors()
                .some((ancestor) => ancestor.kind() === "jump_expression" &&
                ancestor.text().trimStart().startsWith("throw ")))
                continue;
            errors.push(detectedFromArguments({
                root: input.root,
                filename: input.filename,
                node,
                args: node
                    .getMultipleMatches("ARGS")
                    .filter((item) => item.isNamed()),
                spec,
                language: "kotlin",
            }));
        }
    }
    for (const node of tree.findAll({
        rule: { pattern: "throw $CTOR($$$ARGS)" },
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
            language: "kotlin",
            structured: false,
            allowMessageVariants: false,
            flow: inferErrorFlow(node),
            location: toLocation(input.root, input.filename, node),
        });
    }
    return errors;
}
//# sourceMappingURL=kotlin.js.map