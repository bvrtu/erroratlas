export type SupportedLanguage = "typescript" | "python" | "java" | "dart" | "swift" | "go" | "csharp" | "kotlin";
export type Severity = "error" | "warning" | "note";
export type ErrorFlow = "propagated" | "caught" | "rethrown" | "returned";
export type ProblemExtensionValue = string | number | boolean | null;
export type EvidenceKind = "syntax" | "literal" | "local-alias" | "object-member" | "enum-member" | "destructured-member" | "relative-import" | "path-alias" | "base-url" | "workspace-import" | "re-export" | "wildcard-re-export" | "factory";
export interface EvidenceStep {
    kind: EvidenceKind;
    file: string;
    symbol?: string;
    source?: string;
}
export interface DetectionEvidence {
    confidence: "proven" | "partial";
    steps: EvidenceStep[];
}
export interface ProblemDetails {
    type: string | null;
    title: string | null;
    detail: string | null;
    instance: string | null;
    extensions: Record<string, ProblemExtensionValue>;
}
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
export interface FixPolicy {
    codePrefix: string | null;
}
export interface TypeScriptPolicy {
    resolveProjectImports: boolean;
    tsconfig: string;
}
export interface ErrorAtlasConfig {
    include: string[];
    exclude: string[];
    catalog: string;
    docs: string;
    openapi: string | null;
    baseline: string | null;
    fix: FixPolicy;
    typescript: TypeScriptPolicy;
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
    problem?: ProblemDetails;
    flow?: ErrorFlow;
    evidence?: DetectionEvidence;
    location: SourceLocation;
}
export interface CatalogOccurrence extends SourceLocation {
    language: SupportedLanguage;
    constructor: string;
    flow?: ErrorFlow;
    evidence?: DetectionEvidence;
}
export interface CatalogEntry {
    code: string;
    message: string | null;
    observedMessages?: string[];
    status: number | null;
    description: string;
    resolution: string;
    problem?: ProblemDetails;
    occurrences: CatalogOccurrence[];
}
export interface ErrorCatalog {
    schemaVersion: 1 | 2;
    generatedAt: string;
    errors: CatalogEntry[];
}
export interface Diagnostic {
    ruleId: "unstructured-error" | "duplicate-definition" | "undocumented-error" | "stale-error" | "message-drift" | "status-drift" | "problem-details-drift" | "missing-resolution" | "openapi-undocumented-error" | "openapi-stale-error" | "openapi-status-drift" | "openapi-problem-media-type" | "openapi-problem-details-drift" | "openapi-no-error-codes";
    severity: Severity;
    message: string;
    code: string | null;
    evidence?: DetectionEvidence;
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
    openapi?: string | null;
    baseline?: string | null;
    fix?: Partial<FixPolicy>;
    typescript?: Partial<TypeScriptPolicy>;
    failOn?: Exclude<Severity, "note">;
    useDefaultConstructors?: boolean;
    constructors?: Partial<Record<SupportedLanguage, ConstructorSpec[]>>;
}
//# sourceMappingURL=types.d.ts.map