export type SupportedLanguage = "typescript" | "python" | "java" | "dart" | "swift";
export type Severity = "error" | "warning" | "note";
export interface SourceLocation {
    file: string;
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
}
export interface ConstructorSpec {
    name: string;
    codeArgument?: number;
    messageArgument?: number;
    statusArgument?: number;
    defaultStatus?: number;
    allowMessageVariants?: boolean;
}
export interface ErrorAtlasConfig {
    include: string[];
    exclude: string[];
    catalog: string;
    docs: string;
    failOn: Exclude<Severity, "note">;
    constructors: Record<SupportedLanguage, ConstructorSpec[]>;
}
export interface DetectedError {
    code: string | null;
    message: string | null;
    status: number | null;
    constructor: string;
    language: SupportedLanguage;
    structured: boolean;
    allowMessageVariants: boolean;
    location: SourceLocation;
}
export interface CatalogOccurrence extends SourceLocation {
    language: SupportedLanguage;
    constructor: string;
}
export interface CatalogEntry {
    code: string;
    message: string | null;
    observedMessages?: string[];
    status: number | null;
    description: string;
    resolution: string;
    occurrences: CatalogOccurrence[];
}
export interface ErrorCatalog {
    schemaVersion: 1;
    generatedAt: string;
    errors: CatalogEntry[];
}
export interface Diagnostic {
    ruleId: "unstructured-error" | "duplicate-definition" | "undocumented-error" | "stale-error" | "message-drift" | "status-drift" | "missing-resolution";
    severity: Severity;
    message: string;
    code: string | null;
    location: SourceLocation | null;
}
export interface ScanResult {
    root: string;
    filesScanned: number;
    errors: DetectedError[];
    diagnostics: Diagnostic[];
}
export interface CheckResult extends ScanResult {
    catalogPath: string;
}
export interface RawConfig {
    include?: string[];
    exclude?: string[];
    catalog?: string;
    docs?: string;
    failOn?: Exclude<Severity, "note">;
    useDefaultConstructors?: boolean;
    constructors?: Partial<Record<SupportedLanguage, ConstructorSpec[]>>;
}
//# sourceMappingURL=types.d.ts.map