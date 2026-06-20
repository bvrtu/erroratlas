import type { ConstructorSpec } from "../types.js";
export type StaticValue = string | number;
export type StaticValues = ReadonlyMap<string, StaticValue>;
export interface TypeScriptSource {
    filename: string;
    source: string;
}
export interface TypeScriptFactory {
    name: string;
    parameters: string[];
    arguments: string[];
    spec: ConstructorSpec;
}
export declare const MAX_CROSS_FILE_HOPS = 2;
export declare function buildTypeScriptStaticValues(files: TypeScriptSource[]): Map<string, Map<string, StaticValue>>;
export declare function buildTypeScriptFactories(files: TypeScriptSource[], constructors: ConstructorSpec[]): Map<string, Map<string, TypeScriptFactory>>;
export declare function collectLocalTypeScriptValues(filename: string, source: string): Map<string, StaticValue>;
export declare function collectLocalTypeScriptFactories(filename: string, source: string, constructors: ConstructorSpec[]): Map<string, TypeScriptFactory>;
export declare function evaluateStatic(expression: string, values: StaticValues): StaticValue | null;
//# sourceMappingURL=typescript-symbols.d.ts.map