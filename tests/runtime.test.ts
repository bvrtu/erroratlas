import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRuntimeMonitor,
  JsonlRuntimeTransport,
  MemoryRuntimeTransport,
  readRuntimeEvents,
  summarizeRuntimeEvents,
} from "../src/runtime.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("runtime monitoring", () => {
  it("records exceptions and correlates user-facing delivery by trace id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-runtime-"));
    temporaryDirectories.push(root);
    const filename = path.join(root, "events.jsonl");
    const monitor = createRuntimeMonitor({
      service: "payments-api",
      environment: "test",
      transport: new JsonlRuntimeTransport(filename),
    });
    const error = Object.assign(new Error("Payment was declined"), {
      code: "PAYMENT_DECLINED",
      status: 402,
    });

    await monitor.captureException(error, {
      traceId: "trace-delivered",
      handled: true,
      mechanism: "express-middleware",
    });
    await monitor.markDelivered({
      traceId: "trace-delivered",
      channel: "http",
      code: "PAYMENT_DECLINED",
      status: 402,
    });
    await monitor.captureException(new Error("Background failure"), {
      traceId: "trace-undelivered",
      handled: false,
      mechanism: "unhandledRejection",
    });

    const events = await readRuntimeEvents(filename);
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      type: "exception",
      service: "payments-api",
      code: "PAYMENT_DECLINED",
      status: 402,
    });
    expect(summarizeRuntimeEvents(events)).toMatchObject({
      exceptions: 2,
      handledExceptions: 1,
      unhandledExceptions: 1,
      deliveredExceptions: 1,
      undeliveredExceptions: 1,
      deliveryEvents: 1,
      byCode: { PAYMENT_DECLINED: 1, unstructured: 1 },
    });
  });

  it("does not crash the application when a transport fails", async () => {
    const onTransportError = vi.fn();
    const monitor = createRuntimeMonitor({
      service: "users-api",
      transport: {
        send: async () => {
          throw new Error("collector unavailable");
        },
      },
      onTransportError,
    });

    await expect(
      monitor.captureException(new Error("Original")),
    ).resolves.toMatchObject({
      type: "exception",
    });
    expect(onTransportError).toHaveBeenCalledOnce();
  });

  it("supports in-memory collection for adapters and tests", async () => {
    const transport = new MemoryRuntimeTransport();
    const monitor = createRuntimeMonitor({ service: "demo", transport });
    await monitor.markDelivered({ traceId: "trace-1", channel: "ui" });
    expect(transport.events).toEqual([
      expect.objectContaining({ type: "delivery", channel: "ui" }),
    ]);
  });
});
