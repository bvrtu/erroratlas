import { parse } from "@ast-grep/napi";
import { ensureDynamicLanguages } from "./languages.js";
import { detectedFromArguments, inferErrorFlow, literalString, toLocation, } from "./shared.js";
export function extractGoErrors(input) {
    ensureDynamicLanguages();
    const tree = parse("go", input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    const covered = new Set();
    for (const spec of input.constructors) {
        for (const node of tree.findAll({
            rule: { pattern: `${spec.name}($$$ARGS)` },
        })) {
            if (!isErrorFlow(node))
                continue;
            covered.add(rangeKey(node));
            errors.push(detectedFromArguments({
                root: input.root,
                filename: input.filename,
                node,
                args: node
                    .getMultipleMatches("ARGS")
                    .filter((item) => item.isNamed()),
                spec,
                language: "go",
            }));
        }
    }
    for (const pattern of ["return $CTOR($$$ARGS)", "panic($CTOR($$$ARGS))"]) {
        for (const node of tree.findAll({ rule: { pattern } })) {
            const constructor = node.getMatch("CTOR")?.text() ?? "error";
            const call = node
                .findAll({ rule: { kind: "call_expression" } })
                .find((candidate) => candidate.text().startsWith(`${constructor}(`));
            if (configured.has(constructor) || (call && covered.has(rangeKey(call))))
                continue;
            const args = node
                .getMultipleMatches("ARGS")
                .filter((item) => item.isNamed());
            errors.push({
                code: null,
                message: literalString(args[0]?.text() ?? ""),
                status: null,
                constructor,
                language: "go",
                structured: false,
                allowMessageVariants: false,
                flow: inferErrorFlow(node),
                location: toLocation(input.root, input.filename, node),
            });
        }
    }
    return errors;
}
function isErrorFlow(node) {
    return node
        .ancestors()
        .some((ancestor) => ancestor.kind() === "return_statement" ||
        (ancestor.kind() === "call_expression" &&
            ancestor.text().trimStart().startsWith("panic(")));
}
function rangeKey(node) {
    const range = node.range();
    return `${range.start.index}:${range.end.index}`;
}
//# sourceMappingURL=go.js.map