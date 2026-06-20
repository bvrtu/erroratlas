import type { Diagnostic } from "./types.js";
export interface ErrorAtlasBaseline {
    schemaVersion: 1;
    generatedAt: string;
    fingerprints: string[];
}
export declare function buildBaseline(diagnostics: Diagnostic[], generatedAt?: string): ErrorAtlasBaseline;
export declare function readBaseline(filename: string): Promise<ErrorAtlasBaseline>;
export declare function filterBaselineDiagnostics(diagnostics: Diagnostic[], baseline: ErrorAtlasBaseline): Diagnostic[];
export declare function diagnosticFingerprint(diagnostic: Diagnostic): string;
//# sourceMappingURL=baseline.d.ts.map