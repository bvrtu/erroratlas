import type { ConstructorSpec, EvidenceStep } from "../types.js";
import { type TypeScriptProjectResolution } from "./typescript-project.js";
export type StaticValue = string | number;
export type StaticValues = ReadonlyMap<string, StaticValue>;
export type StaticEvidence = ReadonlyMap<string, EvidenceStep[]>;
export interface TypeScriptStaticAnalysis {
    values: Map<string, StaticValue>;
    evidence: Map<string, EvidenceStep[]>;
}
export interface TypeScriptSource {
    filename: string;
    source: string;
}
export interface TypeScriptFactory {
    name: string;
    parameters: TypeScriptFactoryParameter[];
    arguments: string[];
    spec: ConstructorSpec;
    evidence: EvidenceStep[];
}
export interface TypeScriptFactoryParameter {
    kind: "identifier" | "object";
    local?: string;
    defaultValue?: string;
    properties?: TypeScriptFactoryProperty[];
}
export interface TypeScriptFactoryProperty {
    key: string;
    local: string;
    defaultValue?: string;
}
export declare const MAX_CROSS_FILE_HOPS = 2;
export declare function buildTypeScriptStaticValues(files: TypeScriptSource[], projectResolution?: TypeScriptProjectResolution | null): Map<string, Map<string, StaticValue>>;
export declare function buildTypeScriptStaticAnalysis(files: TypeScriptSource[], projectResolution?: TypeScriptProjectResolution | null): Map<string, TypeScriptStaticAnalysis>;
export declare function buildTypeScriptFactories(files: TypeScriptSource[], constructors: ConstructorSpec[], projectResolution?: TypeScriptProjectResolution | null): Map<string, Map<string, TypeScriptFactory>>;
export declare function collectLocalTypeScriptValues(filename: string, source: string): Map<string, StaticValue>;
export declare function collectLocalTypeScriptFactories(filename: string, source: string, constructors: ConstructorSpec[]): Map<string, TypeScriptFactory>;
export declare function evaluateStatic(expression: string, values: StaticValues): StaticValue | null;
export declare function objectExpressionProperties(expression: string): Map<string, string> | null;
//# sourceMappingURL=typescript-symbols.d.ts.map