import { randomUUID } from "node:crypto";
import { problemFromError } from "./shared.js";
export function withErrorAtlas(handler, monitor, options = {}) {
    return async (...args) => {
        try {
            return await handler(...args);
        }
        catch (error) {
            const traceId = randomUUID();
            const event = await monitor.captureException(error, {
                traceId,
                handled: true,
                mechanism: "nextjs-route-handler",
            });
            if (!options.respondWithProblemDetails)
                throw error;
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
//# sourceMappingURL=next.js.map