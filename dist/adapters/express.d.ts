import type { RuntimeMonitor } from "../runtime.js";
import { type ProblemAdapterOptions } from "./shared.js";
interface ExpressResponse {
    headersSent?: boolean;
    status(code: number): ExpressResponse;
    type?(contentType: string): ExpressResponse;
    json(body: unknown): unknown;
}
export declare function createExpressErrorMiddleware(monitor: RuntimeMonitor, options?: ProblemAdapterOptions): (error: unknown, request: unknown, response: ExpressResponse, next: (error: unknown) => void) => Promise<void>;
export {};
//# sourceMappingURL=express.d.ts.map