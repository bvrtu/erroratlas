import type { TypeScriptPolicy } from "../types.js";
export type TypeScriptImportResolutionKind = "relative-import" | "path-alias" | "base-url" | "workspace-import";
export interface ResolvedTypeScriptImport {
    filename: string;
    kind: TypeScriptImportResolutionKind;
}
interface AliasRule {
    pattern: string;
    prefix: string;
    suffix: string;
    targets: string[];
}
interface WorkspacePackage {
    name: string;
    root: string;
    manifest: Record<string, unknown>;
}
export interface TypeScriptProjectResolution {
    root: string;
    baseUrl: string | null;
    aliases: AliasRule[];
    workspaces: WorkspacePackage[];
}
export declare function loadTypeScriptProjectResolution(root: string, policy: TypeScriptPolicy): Promise<TypeScriptProjectResolution | null>;
export declare function resolveTypeScriptImport(filename: string, specifier: string, knownFiles: ReadonlySet<string>, project: TypeScriptProjectResolution | null): ResolvedTypeScriptImport | null;
export declare function typeScriptImportSpecifiers(source: string): string[];
export {};
//# sourceMappingURL=typescript-project.d.ts.map