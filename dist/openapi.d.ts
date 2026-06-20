import type { Diagnostic, ErrorCatalog } from "./types.js";
export interface OpenApiErrorContract {
    code: string;
    status: number | null;
    operation: string;
}
export declare function readOpenApiContract(filename: string): Promise<OpenApiErrorContract[]>;
export declare function compareCatalogWithOpenApi(catalog: ErrorCatalog, contract: OpenApiErrorContract[]): Diagnostic[];
//# sourceMappingURL=openapi.d.ts.map