import { describe, expect, it, vi } from "vitest";
import { createExpressErrorMiddleware } from "../src/adapters/express.js";
import { createFastifyErrorHandler } from "../src/adapters/fastify.js";
import { withErrorAtlas } from "../src/adapters/next.js";
import {
  createRuntimeMonitor,
  MemoryRuntimeTransport,
} from "../src/runtime.js";

function fixture() {
  const transport = new MemoryRuntimeTransport();
  const monitor = createRuntimeMonitor({ service: "api", transport });
  const error = Object.assign(new Error("User was not found"), {
    code: "USER_NOT_FOUND",
    status: 404,
  });
  return { transport, monitor, error };
}

describe("runtime adapters", () => {
  it("captures and correlates an Express problem response", async () => {
    const { transport, monitor, error } = fixture();
    const response = {
      status: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();
    await createExpressErrorMiddleware(monitor, {
      respondWithProblemDetails: true,
      exposeDetail: true,
      problemTypeBase: "https://api.example.com/problems",
    })(error, { id: "req-1" }, response, next);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.type).toHaveBeenCalledWith("application/problem+json");
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "USER_NOT_FOUND", status: 404 }),
    );
    expect(next).not.toHaveBeenCalled();
    expect(transport.events.map((event) => event.type)).toEqual([
      "exception",
      "delivery",
    ]);
  });

  it("provides a Fastify-compatible problem handler", async () => {
    const { monitor, error } = fixture();
    const reply = {
      code: vi.fn().mockReturnThis(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnValue("sent"),
    };
    await expect(
      createFastifyErrorHandler(monitor, { respondWithProblemDetails: true })(
        error,
        { id: "req-2" },
        reply,
      ),
    ).resolves.toBe("sent");
    expect(reply.code).toHaveBeenCalledWith(404);
  });

  it("wraps Next.js route handlers without changing the default throw behavior", async () => {
    const { transport, monitor, error } = fixture();
    const captureOnly = withErrorAtlas(async () => {
      throw error;
    }, monitor);
    await expect(captureOnly()).rejects.toBe(error);

    const aligned = withErrorAtlas(
      async () => {
        throw error;
      },
      monitor,
      { respondWithProblemDetails: true },
    );
    const response = await aligned();
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
    expect(
      transport.events.filter((event) => event.type === "delivery"),
    ).toHaveLength(1);
  });
});
