import dart from "@ast-grep/lang-dart";
import java from "@ast-grep/lang-java";
import python from "@ast-grep/lang-python";
import swift from "@ast-grep/lang-swift";
import { registerDynamicLanguage } from "@ast-grep/napi";
let registered = false;
export function ensureDynamicLanguages() {
    if (registered)
        return;
    registerDynamicLanguage({ dart, java, python, swift });
    registered = true;
}
//# sourceMappingURL=languages.js.map