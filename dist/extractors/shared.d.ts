import type { SgNode } from "@ast-grep/napi";
import type { ConstructorSpec, DetectedError, SourceLocation, SupportedLanguage } from "../types.js";
export declare function toLocation(root: string, filename: string, node: SgNode): SourceLocation;
export declare function literalString(text: string): string | null;
export declare function literalNumber(text: string): number | null;
export declare function propertyString(text: string, names: string[]): string | null;
export declare function propertyNumber(text: string, names: string[]): number | null;
export declare function detectedFromArguments(input: {
    root: string;
    filename: string;
    node: SgNode;
    args: SgNode[];
    spec: ConstructorSpec;
    language: SupportedLanguage;
}): DetectedError;
//# sourceMappingURL=shared.d.ts.map