import { describe, expect, it } from "vitest";
import { buildCatalog, compareWithCatalog } from "../src/catalog.js";
import { analyzeDetections } from "../src/scanner.js";
import type { DetectedError, ErrorCatalog, ScanResult } from "../src/types.js";

const baseError: DetectedError = {
  code: "USER_NOT_FOUND",
  message: "User was not found",
  status: 404,
  constructor: "AppError",
  language: "typescript",
  structured: true,
  allowMessageVariants: false,
  location: {
    file: "src/users.ts",
    line: 4,
    column: 11,
    endLine: 4,
    endColumn: 72,
  },
};

describe("catalog generation", () => {
  it("groups occurrences and preserves human-authored fields", () => {
    const previous: ErrorCatalog = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      errors: [
        {
          code: "USER_NOT_FOUND",
          message: "Old message",
          status: 404,
          description: "The requested user does not exist.",
          resolution: "Verify the user identifier.",
          occurrences: [],
        },
      ],
    };

    const catalog = buildCatalog(
      [
        baseError,
        { ...baseError, location: { ...baseError.location, line: 9 } },
      ],
      previous,
      "2026-06-20T00:00:00.000Z",
    );

    expect(catalog.errors).toHaveLength(1);
    expect(catalog.errors[0]).toMatchObject({
      code: "USER_NOT_FOUND",
      message: "User was not found",
      description: "The requested user does not exist.",
      resolution: "Verify the user identifier.",
    });
    expect(catalog.errors[0]?.occurrences).toHaveLength(2);
    expect(catalog.schemaVersion).toBe(2);
  });

  it("adds problem details without overwriting v1 human documentation", () => {
    const problem = {
      type: "https://example.com/problems/user-not-found",
      title: "User not found",
      detail: "User was not found",
      instance: null,
      extensions: { retryable: false },
    };
    const catalog = buildCatalog([{ ...baseError, problem }], {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      errors: [
        {
          code: "USER_NOT_FOUND",
          message: "User was not found",
          status: 404,
          description: "Human description",
          resolution: "Human resolution",
          occurrences: [],
        },
      ],
    });

    expect(catalog).toMatchObject({
      schemaVersion: 2,
      errors: [
        {
          description: "Human description",
          resolution: "Human resolution",
          problem,
        },
      ],
    });
  });
});

describe("catalog drift", () => {
  it("reports undocumented, stale, message, and status changes", () => {
    const errors: DetectedError[] = [
      baseError,
      {
        ...baseError,
        code: "PAYMENT_DECLINED",
        message: "Payment was declined",
        status: 402,
        location: { ...baseError.location, file: "src/payments.ts" },
      },
    ];
    const scan: ScanResult = {
      root: "/fixture",
      filesScanned: 2,
      errors,
      diagnostics: analyzeDetections(errors),
    };
    const catalog: ErrorCatalog = {
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      errors: [
        {
          code: "USER_NOT_FOUND",
          message: "Old user message",
          status: 400,
          description: "",
          resolution: "",
          occurrences: [],
        },
        {
          code: "STALE_ERROR",
          message: "No longer used",
          status: 500,
          description: "",
          resolution: "Restart the application.",
          occurrences: [],
        },
      ],
    };

    const diagnostics = compareWithCatalog(scan, catalog);
    expect(diagnostics.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining([
        "message-drift",
        "status-drift",
        "missing-resolution",
        "undocumented-error",
        "stale-error",
      ]),
    );
  });

  it("detects conflicting source definitions", () => {
    const diagnostics = analyzeDetections([
      baseError,
      { ...baseError, message: "Different", status: 410 },
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        ruleId: "duplicate-definition",
        severity: "error",
      }),
    ]);
  });

  it("allows framework-declared message variants and records each message", () => {
    const definitions: DetectedError[] = [
      {
        ...baseError,
        code: "internal",
        message: "Notification delivery failed",
        constructor: "functions.https.HttpsError",
        allowMessageVariants: true,
      },
      {
        ...baseError,
        code: "internal",
        message: "News loading failed",
        constructor: "functions.https.HttpsError",
        allowMessageVariants: true,
      },
    ];

    expect(analyzeDetections(definitions)).toEqual([]);
    expect(buildCatalog(definitions).errors[0]).toMatchObject({
      code: "internal",
      message: null,
      observedMessages: ["News loading failed", "Notification delivery failed"],
    });
  });

  it("compares problem details only after a catalog migrates to schema v2", () => {
    const scan: ScanResult = {
      root: "/fixture",
      filesScanned: 1,
      errors: [
        {
          ...baseError,
          problem: {
            type: "https://example.com/problems/user-not-found",
            title: "User not found",
            detail: "User was not found",
            instance: null,
            extensions: {},
          },
        },
      ],
      diagnostics: [],
    };
    const legacy = buildCatalog([baseError]);
    legacy.schemaVersion = 1;
    expect(compareWithCatalog(scan, legacy)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "problem-details-drift" }),
      ]),
    );

    legacy.schemaVersion = 2;
    expect(compareWithCatalog(scan, legacy)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "problem-details-drift" }),
      ]),
    );
  });
});
