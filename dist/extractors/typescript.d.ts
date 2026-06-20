import type { ConstructorSpec, DetectedError } from "../types.js";
import { type StaticValues } from "./typescript-symbols.js";
export declare function extractTypeScriptErrors(input: {
    root: string;
    filename: string;
    source: string;
    constructors: ConstructorSpec[];
    staticValues?: StaticValues;
}): DetectedError[];
//# sourceMappingURL=typescript.d.ts.map