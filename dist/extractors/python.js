import python from "@ast-grep/lang-python";
import { parse, registerDynamicLanguage } from "@ast-grep/napi";
import { detectedFromArguments, literalString, propertyNumber, propertyString, toLocation, } from "./shared.js";
let registered = false;
function ensurePythonRegistered() {
    if (registered)
        return;
    registerDynamicLanguage({ python });
    registered = true;
}
export function extractPythonErrors(input) {
    ensurePythonRegistered();
    const tree = parse("python", input.source).root();
    const errors = [];
    const configured = new Set(input.constructors.map((item) => item.name));
    for (const spec of input.constructors) {
        const matches = tree.findAll({
            rule: { pattern: `${spec.name}($$$ARGS)` },
        });
        for (const node of matches) {
            if (!node
                .ancestors()
                .some((ancestor) => ancestor.kind() === "raise_statement"))
                continue;
            const args = node
                .getMultipleMatches("ARGS")
                .filter((item) => item.isNamed());
            const detected = detectedFromArguments({
                root: input.root,
                filename: input.filename,
                node,
                args,
                spec,
                language: "python",
            });
            if (spec.name === "HTTPException") {
                const argumentText = args.map((item) => item.text()).join(", ");
                detected.status =
                    propertyNumber(argumentText, ["status_code", "status"]) ??
                        detected.status;
                detected.code = propertyString(argumentText, [
                    "code",
                    "error_code",
                    "errorCode",
                ]);
                detected.message =
                    propertyString(argumentText, ["message", "detail", "title"]) ??
                        detected.message;
                detected.structured = detected.code !== null;
            }
            errors.push(detected);
        }
    }
    const raised = tree.findAll({ rule: { pattern: "raise $CTOR($MESSAGE)" } });
    for (const node of raised) {
        const constructor = node.getMatch("CTOR")?.text() ?? "Exception";
        if (configured.has(constructor))
            continue;
        errors.push({
            code: null,
            message: literalString(node.getMatch("MESSAGE")?.text() ?? ""),
            status: null,
            constructor,
            language: "python",
            structured: false,
            location: toLocation(input.root, input.filename, node),
        });
    }
    return errors;
}
//# sourceMappingURL=python.js.map