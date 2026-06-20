import type { RuntimeMonitor } from "../runtime.js";
import {
  problemFromError,
  traceIdFromRequest,
  type ProblemAdapterOptions,
} from "./shared.js";

interface ExpressResponse {
  headersSent?: boolean;
  status(code: number): ExpressResponse;
  type?(contentType: string): ExpressResponse;
  json(body: unknown): unknown;
}

export function createExpressErrorMiddleware(
  monitor: RuntimeMonitor,
  options: ProblemAdapterOptions = {},
) {
  return async (
    error: unknown,
    request: unknown,
    response: ExpressResponse,
    next: (error: unknown) => void,
  ): Promise<void> => {
    const traceId = traceIdFromRequest(request);
    const event = await monitor.captureException(error, {
      ...(traceId ? { traceId } : {}),
      handled: true,
      mechanism: "express",
    });
    if (!options.respondWithProblemDetails || response.headersSent) {
      next(error);
      return;
    }
    const problem = problemFromError(error, options);
    response.status(problem.status);
    response.type?.("application/problem+json");
    response.json(problem);
    if (traceId) {
      await monitor.markDelivered({
        traceId,
        channel: "http",
        ...(event.code ? { code: event.code } : {}),
        ...(event.status ? { status: event.status } : {}),
      });
    }
  };
}
