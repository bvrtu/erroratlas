import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type RuntimeDeliveryChannel = "http" | "ui" | "queue" | "other";

interface RuntimeEventBase {
  schemaVersion: 1;
  id: string;
  occurredAt: string;
  service: string;
  environment: string;
  traceId: string | null;
}

export interface RuntimeExceptionEvent extends RuntimeEventBase {
  type: "exception";
  handled: boolean;
  mechanism: string;
  code: string | null;
  status: number | null;
  error: {
    name: string;
    message: string;
    stack: string | null;
  };
  tags: Record<string, string>;
}

export interface RuntimeDeliveryEvent extends RuntimeEventBase {
  type: "delivery";
  channel: RuntimeDeliveryChannel;
  code: string | null;
  status: number | null;
  tags: Record<string, string>;
}

export type RuntimeEvent = RuntimeExceptionEvent | RuntimeDeliveryEvent;

export interface RuntimeTransport {
  send(event: RuntimeEvent): Promise<void>;
}

export interface RuntimeMonitorOptions {
  service: string;
  environment?: string;
  transport: RuntimeTransport;
  includeStack?: boolean;
  onTransportError?: (error: Error, event: RuntimeEvent) => void;
}

export interface CaptureExceptionContext {
  traceId?: string;
  handled?: boolean;
  mechanism?: string;
  code?: string;
  status?: number;
  tags?: Record<string, string>;
}

export interface MarkDeliveredContext {
  traceId: string;
  channel?: RuntimeDeliveryChannel;
  code?: string;
  status?: number;
  tags?: Record<string, string>;
}

export interface RuntimeMonitor {
  captureException(
    input: unknown,
    context?: CaptureExceptionContext,
  ): Promise<RuntimeExceptionEvent>;
  markDelivered(context: MarkDeliveredContext): Promise<RuntimeDeliveryEvent>;
  installNodeHandlers(): () => void;
}

export interface RuntimeSummary {
  events: number;
  exceptions: number;
  handledExceptions: number;
  unhandledExceptions: number;
  deliveredExceptions: number;
  undeliveredExceptions: number;
  deliveryEvents: number;
  byCode: Record<string, number>;
  byMechanism: Record<string, number>;
}

export class JsonlRuntimeTransport implements RuntimeTransport {
  constructor(private readonly filename: string) {}

  async send(event: RuntimeEvent): Promise<void> {
    await mkdir(path.dirname(path.resolve(this.filename)), { recursive: true });
    await appendFile(this.filename, `${JSON.stringify(event)}\n`, "utf8");
  }
}

export class HttpRuntimeTransport implements RuntimeTransport {
  constructor(
    private readonly endpoint: string,
    private readonly headers: Record<string, string> = {},
  ) {}

  async send(event: RuntimeEvent): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", ...this.headers },
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(
        `Runtime event endpoint returned ${response.status} ${response.statusText}.`,
      );
    }
  }
}

export class MemoryRuntimeTransport implements RuntimeTransport {
  readonly events: RuntimeEvent[] = [];

  async send(event: RuntimeEvent): Promise<void> {
    this.events.push(event);
  }
}

export function createRuntimeMonitor(
  options: RuntimeMonitorOptions,
): RuntimeMonitor {
  const environment =
    options.environment ?? process.env.NODE_ENV ?? "development";
  const includeStack = options.includeStack !== false;

  async function captureException(
    input: unknown,
    context: CaptureExceptionContext = {},
  ): Promise<RuntimeExceptionEvent> {
    const error = normalizeError(input);
    const event: RuntimeExceptionEvent = {
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

  async function markDelivered(
    context: MarkDeliveredContext,
  ): Promise<RuntimeDeliveryEvent> {
    const event: RuntimeDeliveryEvent = {
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

  function installNodeHandlers(): () => void {
    const onUncaughtException = (error: Error) => {
      void captureException(error, {
        handled: false,
        mechanism: "uncaughtException",
      });
    };
    const onUnhandledRejection = (reason: unknown) => {
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

  async function safelySend(event: RuntimeEvent): Promise<void> {
    try {
      await options.transport.send(event);
    } catch (error) {
      options.onTransportError?.(normalizeError(error), event);
    }
  }

  return { captureException, markDelivered, installNodeHandlers };
}

export async function readRuntimeEvents(
  filename: string,
): Promise<RuntimeEvent[]> {
  const source = await readFile(filename, "utf8");
  return source
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const event = JSON.parse(line) as RuntimeEvent;
      if (
        event.schemaVersion !== 1 ||
        !["exception", "delivery"].includes(event.type)
      ) {
        throw new Error(
          `${filename}:${index + 1} is not a valid runtime event.`,
        );
      }
      return event;
    });
}

export function summarizeRuntimeEvents(events: RuntimeEvent[]): RuntimeSummary {
  const exceptions = events.filter(
    (event): event is RuntimeExceptionEvent => event.type === "exception",
  );
  const deliveries = events.filter(
    (event): event is RuntimeDeliveryEvent => event.type === "delivery",
  );
  const deliveredTraceIds = new Set(
    deliveries.map((event) => event.traceId).filter(Boolean),
  );
  const byCode: Record<string, number> = {};
  const byMechanism: Record<string, number> = {};
  for (const event of exceptions) {
    const code = event.code ?? "unstructured";
    byCode[code] = (byCode[code] ?? 0) + 1;
    byMechanism[event.mechanism] = (byMechanism[event.mechanism] ?? 0) + 1;
  }
  const deliveredExceptions = exceptions.filter(
    (event) => event.traceId !== null && deliveredTraceIds.has(event.traceId),
  ).length;
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

export function renderRuntimeSummary(summary: RuntimeSummary): string {
  return (
    [
      "Runtime error summary",
      `Events: ${summary.events}`,
      `Exceptions: ${summary.exceptions} (${summary.handledExceptions} handled, ${summary.unhandledExceptions} unhandled)`,
      `Delivery correlation: ${summary.deliveredExceptions} delivered, ${summary.undeliveredExceptions} undelivered`,
      `Codes: ${
        Object.entries(summary.byCode)
          .map(([code, count]) => `${code}=${count}`)
          .join(", ") || "none"
      }`,
    ].join("\n") + "\n"
  );
}

function normalizeError(input: unknown): Error {
  if (input instanceof Error) return input;
  if (typeof input === "string") return new Error(input);
  try {
    return new Error(JSON.stringify(input));
  } catch {
    return new Error(String(input));
  }
}

function readErrorCode(input: unknown): string | null {
  if (!isRecord(input)) return null;
  for (const key of ["code", "errorCode", "error_code"]) {
    if (typeof input[key] === "string") return input[key];
  }
  return null;
}

function readErrorStatus(input: unknown): number | null {
  if (!isRecord(input)) return null;
  for (const key of ["status", "statusCode", "status_code"]) {
    if (typeof input[key] === "number") return input[key];
  }
  return null;
}

function sortRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
