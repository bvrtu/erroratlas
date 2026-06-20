import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export class JsonlRuntimeTransport {
    filename;
    constructor(filename) {
        this.filename = filename;
    }
    async send(event) {
        await mkdir(path.dirname(path.resolve(this.filename)), { recursive: true });
        await appendFile(this.filename, `${JSON.stringify(event)}\n`, "utf8");
    }
}
export class HttpRuntimeTransport {
    endpoint;
    headers;
    constructor(endpoint, headers = {}) {
        this.endpoint = endpoint;
        this.headers = headers;
    }
    async send(event) {
        const response = await fetch(this.endpoint, {
            method: "POST",
            headers: { "content-type": "application/json", ...this.headers },
            body: JSON.stringify(event),
        });
        if (!response.ok) {
            throw new Error(`Runtime event endpoint returned ${response.status} ${response.statusText}.`);
        }
    }
}
export class MemoryRuntimeTransport {
    events = [];
    async send(event) {
        this.events.push(event);
    }
}
export function createRuntimeMonitor(options) {
    const environment = options.environment ?? process.env.NODE_ENV ?? "development";
    const includeStack = options.includeStack !== false;
    async function captureException(input, context = {}) {
        const error = normalizeError(input);
        const event = {
            schemaVersion: 1,
            id: randomUUID(),
            type: "exception",
            occurredAt: new Date().toISOString(),
            service: options.service,
            environment,
            traceId: context.traceId ?? null,
            handled: context.handled ?? true,
            mechanism: context.mechanism ?? "manual",
            code: context.code ?? readErrorCode(input),
            status: context.status ?? readErrorStatus(input),
            error: {
                name: error.name,
                message: error.message,
                stack: includeStack ? (error.stack ?? null) : null,
            },
            tags: context.tags ?? {},
        };
        await safelySend(event);
        return event;
    }
    async function markDelivered(context) {
        const event = {
            schemaVersion: 1,
            id: randomUUID(),
            type: "delivery",
            occurredAt: new Date().toISOString(),
            service: options.service,
            environment,
            traceId: context.traceId,
            channel: context.channel ?? "http",
            code: context.code ?? null,
            status: context.status ?? null,
            tags: context.tags ?? {},
        };
        await safelySend(event);
        return event;
    }
    function installNodeHandlers() {
        const onUncaughtException = (error) => {
            void captureException(error, {
                handled: false,
                mechanism: "uncaughtException",
            });
        };
        const onUnhandledRejection = (reason) => {
            void captureException(reason, {
                handled: false,
                mechanism: "unhandledRejection",
            });
        };
        process.on("uncaughtExceptionMonitor", onUncaughtException);
        process.on("unhandledRejection", onUnhandledRejection);
        return () => {
            process.off("uncaughtExceptionMonitor", onUncaughtException);
            process.off("unhandledRejection", onUnhandledRejection);
        };
    }
    async function safelySend(event) {
        try {
            await options.transport.send(event);
        }
        catch (error) {
            options.onTransportError?.(normalizeError(error), event);
        }
    }
    return { captureException, markDelivered, installNodeHandlers };
}
export async function readRuntimeEvents(filename) {
    const source = await readFile(filename, "utf8");
    return source
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line, index) => {
        const event = JSON.parse(line);
        if (event.schemaVersion !== 1 ||
            !["exception", "delivery"].includes(event.type)) {
            throw new Error(`${filename}:${index + 1} is not a valid runtime event.`);
        }
        return event;
    });
}
export function summarizeRuntimeEvents(events) {
    const exceptions = events.filter((event) => event.type === "exception");
    const deliveries = events.filter((event) => event.type === "delivery");
    const deliveredTraceIds = new Set(deliveries.map((event) => event.traceId).filter(Boolean));
    const byCode = {};
    const byMechanism = {};
    for (const event of exceptions) {
        const code = event.code ?? "unstructured";
        byCode[code] = (byCode[code] ?? 0) + 1;
        byMechanism[event.mechanism] = (byMechanism[event.mechanism] ?? 0) + 1;
    }
    const deliveredExceptions = exceptions.filter((event) => event.traceId !== null && deliveredTraceIds.has(event.traceId)).length;
    return {
        events: events.length,
        exceptions: exceptions.length,
        handledExceptions: exceptions.filter((event) => event.handled).length,
        unhandledExceptions: exceptions.filter((event) => !event.handled).length,
        deliveredExceptions,
        undeliveredExceptions: exceptions.length - deliveredExceptions,
        deliveryEvents: deliveries.length,
        byCode: sortRecord(byCode),
        byMechanism: sortRecord(byMechanism),
    };
}
export function renderRuntimeSummary(summary) {
    return ([
        "Runtime error summary",
        `Events: ${summary.events}`,
        `Exceptions: ${summary.exceptions} (${summary.handledExceptions} handled, ${summary.unhandledExceptions} unhandled)`,
        `Delivery correlation: ${summary.deliveredExceptions} delivered, ${summary.undeliveredExceptions} undelivered`,
        `Codes: ${Object.entries(summary.byCode)
            .map(([code, count]) => `${code}=${count}`)
            .join(", ") || "none"}`,
    ].join("\n") + "\n");
}
function normalizeError(input) {
    if (input instanceof Error)
        return input;
    if (typeof input === "string")
        return new Error(input);
    try {
        return new Error(JSON.stringify(input));
    }
    catch {
        return new Error(String(input));
    }
}
function readErrorCode(input) {
    if (!isRecord(input))
        return null;
    for (const key of ["code", "errorCode", "error_code"]) {
        if (typeof input[key] === "string")
            return input[key];
    }
    return null;
}
function readErrorStatus(input) {
    if (!isRecord(input))
        return null;
    for (const key of ["status", "statusCode", "status_code"]) {
        if (typeof input[key] === "number")
            return input[key];
    }
    return null;
}
function sortRecord(record) {
    return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=runtime.js.map