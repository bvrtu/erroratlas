import type { DetectedError, Diagnostic, ErrorAtlasConfig, ScanResult } from "./types.js";
export interface ScanOptions {
    changedFiles?: string[];
    affectedImportHops?: number;
}
export declare function scanProject(root: string, config: ErrorAtlasConfig, options?: ScanOptions): Promise<ScanResult>;
export declare function analyzeDetections(errors: DetectedError[]): Diagnostic[];
export declare function compareDiagnostics(left: Diagnostic, right: Diagnostic): number;
//# sourceMappingURL=scanner.d.ts.map