import type { DetectedError, Diagnostic, ErrorAtlasConfig, ScanResult } from "./types.js";
export declare function scanProject(root: string, config: ErrorAtlasConfig): Promise<ScanResult>;
export declare function analyzeDetections(errors: DetectedError[]): Diagnostic[];
export declare function compareDiagnostics(left: Diagnostic, right: Diagnostic): number;
//# sourceMappingURL=scanner.d.ts.map