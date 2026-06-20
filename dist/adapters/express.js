import { problemFromError, traceIdFromRequest, } from "./shared.js";
export function createExpressErrorMiddleware(monitor, options = {}) {
    return async (error, request, response, next) => {
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
//# sourceMappingURL=express.js.map