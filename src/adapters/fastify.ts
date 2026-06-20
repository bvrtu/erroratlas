import type { RuntimeMonitor } from "../runtime.js";
import {
  problemFromError,
  traceIdFromRequest,
  type ProblemAdapterOptions,
} from "./shared.js";

interface FastifyReply {
  code(status: number): FastifyReply;
  type?(contentType: string): FastifyReply;
  send(body: unknown): unknown;
}

export function createFastifyErrorHandler(
  monitor: RuntimeMonitor,
  options: ProblemAdapterOptions = {},
) {
  return async (
    error: unknown,
    request: unknown,
    reply: FastifyReply,
  ): Promise<unknown> => {
    const traceId = traceIdFromRequest(request);
    const event = await monitor.captureException(error, {
      ...(traceId ? { traceId } : {}),
      handled: true,
      mechanism: "fastify",
    });
    if (!options.respondWithProblemDetails) throw error;
    const problem = problemFromError(error, options);
    reply.code(problem.status);
    reply.type?.("application/problem+json");
    const result = reply.send(problem);
    if (traceId) {
      await monitor.markDelivered({
        traceId,
        channel: "http",
        ...(event.code ? { code: event.code } : {}),
        ...(event.status ? { status: event.status } : {}),
      });
    }
    return result;
  };
}
