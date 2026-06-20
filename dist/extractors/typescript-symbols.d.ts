export type StaticValue = string | number;
export type StaticValues = ReadonlyMap<string, StaticValue>;
export interface TypeScriptSource {
    filename: string;
    source: string;
}
export declare function buildTypeScriptStaticValues(files: TypeScriptSource[]): Map<string, Map<string, StaticValue>>;
export declare function collectLocalTypeScriptValues(filename: string, source: string): Map<string, StaticValue>;
export declare function evaluateStatic(expression: string, values: StaticValues): StaticValue | null;
//# sourceMappingURL=typescript-symbols.d.ts.map