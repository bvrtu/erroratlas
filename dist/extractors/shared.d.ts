import type { SgNode } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError, ErrorFlow, SourceLocation, SupportedLanguage } from "../types.js";
import type { StaticValues } from "./typescript-symbols.js";
export declare function toLocation(root: string, filename: string, node: SgNode): SourceLocation;
export declare function literalString(text: string): string | null;
export declare function literalNumber(text: string): number | null;
export declare function propertyString(text: string, names: string[]): string | null;
export declare function propertyNumber(text: string, names: string[]): number | null;
export declare function staticString(text: string, values?: StaticValues): string | null;
export declare function staticNumber(text: string, values?: StaticValues): number | null;
export declare function propertyStaticString(text: string, names: string[], values?: StaticValues): string | null;
export declare function propertyStaticNumber(text: string, names: string[], values?: StaticValues): number | null;
export declare function detectedFromArguments(input: {
    root: string;
    filename: string;
    node: SgNode;
    args: SgNode[];
    spec: ConstructorSpec;
    language: SupportedLanguage;
    values?: StaticValues;
}): DetectedError;
export declare function detectedFromArgumentTexts(input: {
    root: string;
    filename: string;
    node: SgNode;
    args: string[];
    spec: ConstructorSpec;
    language: SupportedLanguage;
    values?: StaticValues;
    constructorName?: string;
    flow?: ErrorFlow;
}): DetectedError;
export declare function inferErrorFlow(node: SgNode): ErrorFlow;
//# sourceMappingURL=shared.d.ts.map