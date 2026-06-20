import type { RuntimeMonitor } from "../runtime.js";
import { type ProblemAdapterOptions } from "./shared.js";
interface FastifyReply {
    code(status: number): FastifyReply;
    type?(contentType: string): FastifyReply;
    send(body: unknown): unknown;
}
export declare function createFastifyErrorHandler(monitor: RuntimeMonitor, options?: ProblemAdapterOptions): (error: unknown, request: unknown, reply: FastifyReply) => Promise<unknown>;
export {};
//# sourceMappingURL=fastify.d.ts.map