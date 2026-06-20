import type { ErrorCatalog } from "./types.js";
export interface CatalogDocumentationSuggestion {
    code: string;
    description?: string;
    resolution?: string;
}
export declare function suggestCatalogDocumentation(catalog: ErrorCatalog): CatalogDocumentationSuggestion[];
export declare function applyCatalogDocumentation(catalog: ErrorCatalog, suggestions?: CatalogDocumentationSuggestion[]): ErrorCatalog;
export declare function renderCatalogSuggestions(suggestions: CatalogDocumentationSuggestion[]): string;
//# sourceMappingURL=suggestions.d.ts.map