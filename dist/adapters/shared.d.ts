export interface ProblemAdapterOptions {
    respondWithProblemDetails?: boolean;
    problemTypeBase?: string;
    exposeDetail?: boolean;
}
export interface AdapterProblem {
    type: string;
    title: string;
    status: number;
    detail?: string;
    instance?: string;
    code?: string;
}
export declare function problemFromError(error: unknown, options?: ProblemAdapterOptions, instance?: string): AdapterProblem;
export declare function traceIdFromRequest(request: unknown): string | undefined;
//# sourceMappingURL=shared.d.ts.map