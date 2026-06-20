import type { Diagnostic, ErrorCatalog, ProblemDetails } from "./types.js";
export interface OpenApiErrorContract {
    code: string;
    status: number | null;
    operation: string;
    mediaType?: string;
    problem?: Partial<Pick<ProblemDetails, "type" | "title" | "detail" | "instance">>;
}
export declare function readOpenApiContract(filename: string): Promise<OpenApiErrorContract[]>;
export declare function compareCatalogWithOpenApi(catalog: ErrorCatalog, contract: OpenApiErrorContract[]): Diagnostic[];
//# sourceMappingURL=openapi.d.ts.map