import { randomUUID } from "node:crypto";
import type { RuntimeMonitor } from "../runtime.js";
import { problemFromError, type ProblemAdapterOptions } from "./shared.js";

export function withErrorAtlas<TArguments extends unknown[], TResult>(
  handler: (...args: TArguments) => Promise<TResult>,
  monitor: RuntimeMonitor,
  options: ProblemAdapterOptions = {},
): (...args: TArguments) => Promise<TResult | Response> {
  return async (...args: TArguments): Promise<TResult | Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const traceId = randomUUID();
      const event = await monitor.captureException(error, {
        traceId,
        handled: true,
        mechanism: "nextjs-route-handler",
      });
      if (!options.respondWithProblemDetails) throw error;
      const problem = problemFromError(error, options);
      await monitor.markDelivered({
        traceId,
        channel: "http",
        ...(event.code ? { code: event.code } : {}),
        ...(event.status ? { status: event.status } : {}),
      });
      return Response.json(problem, {
        status: problem.status,
        headers: { "content-type": "application/problem+json" },
      });
    }
  };
}
