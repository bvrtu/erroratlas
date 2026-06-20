import { problemFromError, traceIdFromRequest, } from "./shared.js";
export function createFastifyErrorHandler(monitor, options = {}) {
    return async (error, request, reply) => {
        const traceId = traceIdFromRequest(request);
        const event = await monitor.captureException(error, {
            ...(traceId ? { traceId } : {}),
            handled: true,
            mechanism: "fastify",
        });
        if (!options.respondWithProblemDetails)
            throw error;
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
//# sourceMappingURL=fastify.js.map