import type { ConstructorSpec, DetectedError } from "../types.js";
import { type StaticEvidence, type StaticValues, type TypeScriptFactory } from "./typescript-symbols.js";
export declare function extractTypeScriptErrors(input: {
    root: string;
    filename: string;
    source: string;
    constructors: ConstructorSpec[];
    staticValues?: StaticValues;
    staticEvidence?: StaticEvidence;
    factories?: ReadonlyMap<string, TypeScriptFactory>;
}): DetectedError[];
//# sourceMappingURL=typescript.d.ts.map