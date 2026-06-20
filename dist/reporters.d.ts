import type { Diagnostic, ErrorCatalog, ScanResult, Severity } from "./types.js";
export declare function renderConsole(result: ScanResult, diagnostics?: Diagnostic[]): string;
export declare function renderMarkdown(catalog: ErrorCatalog): string;
export declare function renderSarif(diagnostics: Diagnostic[]): string;
export declare function shouldFail(diagnostics: Diagnostic[], threshold: Exclude<Severity, "note">): boolean;
//# sourceMappingURL=reporters.d.ts.map