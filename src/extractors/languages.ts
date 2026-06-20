import dart from "@ast-grep/lang-dart";
import csharp from "@ast-grep/lang-csharp";
import go from "@ast-grep/lang-go";
import java from "@ast-grep/lang-java";
import kotlin from "@ast-grep/lang-kotlin";
import python from "@ast-grep/lang-python";
import swift from "@ast-grep/lang-swift";
import { registerDynamicLanguage } from "@ast-grep/napi";

let registered = false;

export function ensureDynamicLanguages(): void {
  if (registered) return;
  registerDynamicLanguage({ csharp, dart, go, java, kotlin, python, swift });
  registered = true;
}
