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
    captureException(input: unknown, context?: CaptureExceptionContext): Promise<RuntimeExceptionEvent>;
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
export declare class JsonlRuntimeTransport implements RuntimeTransport {
    private readonly filename;
    constructor(filename: string);
    send(event: RuntimeEvent): Promise<void>;
}
export declare class HttpRuntimeTransport implements RuntimeTransport {
    private readonly endpoint;
    private readonly headers;
    constructor(endpoint: string, headers?: Record<string, string>);
    send(event: RuntimeEvent): Promise<void>;
}
export declare class MemoryRuntimeTransport implements RuntimeTransport {
    readonly events: RuntimeEvent[];
    send(event: RuntimeEvent): Promise<void>;
}
export declare function createRuntimeMonitor(options: RuntimeMonitorOptions): RuntimeMonitor;
export declare function readRuntimeEvents(filename: string): Promise<RuntimeEvent[]>;
export declare function summarizeRuntimeEvents(events: RuntimeEvent[]): RuntimeSummary;
export declare function renderRuntimeSummary(summary: RuntimeSummary): string;
export {};
//# sourceMappingURL=runtime.d.ts.map