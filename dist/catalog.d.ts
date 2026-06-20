import type { DetectedError, Diagnostic, ErrorCatalog, ScanResult } from "./types.js";
export declare function buildCatalog(errors: DetectedError[], previous?: ErrorCatalog | null, generatedAt?: string): ErrorCatalog;
export declare function readCatalog(filename: string): Promise<ErrorCatalog>;
export declare function readCatalogIfPresent(filename: string): Promise<ErrorCatalog | null>;
export declare function compareWithCatalog(scan: ScanResult, catalog: ErrorCatalog): Diagnostic[];
//# sourceMappingURL=catalog.d.ts.map