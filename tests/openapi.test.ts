import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  compareCatalogWithOpenApi,
  readOpenApiContract,
} from "../src/openapi.js";
import type { ErrorCatalog } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("OpenAPI comparison", () => {
  it("reads YAML schemas, refs, enums, and response examples", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-openapi-"));
    temporaryDirectories.push(root);
    const filename = path.join(root, "openapi.yaml");
    await writeFile(
      filename,
      `
openapi: 3.1.0
paths:
  /users/{id}:
    get:
      responses:
        "404":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/UserError"
  /legacy:
    get:
      responses:
        "410":
          content:
            application/json:
              example:
                code: OLD_ERROR
                message: Gone
components:
  schemas:
    UserError:
      type: object
      properties:
        code:
          type: string
          enum: [USER_NOT_FOUND]
        message:
          type: string
`,
    );

    expect(await readOpenApiContract(filename)).toEqual([
      { code: "OLD_ERROR", status: 410, operation: "GET /legacy" },
      {
        code: "USER_NOT_FOUND",
        status: 404,
        operation: "GET /users/{id}",
      },
    ]);
  });

  it("reports missing, stale, and status-drifted OpenAPI errors", () => {
    const catalog: ErrorCatalog = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      errors: [entry("USER_NOT_FOUND", 410), entry("INTERNAL_FAILURE", 500)],
    };

    const diagnostics = compareCatalogWithOpenApi(catalog, [
      { code: "USER_NOT_FOUND", status: 404, operation: "GET /users/{id}" },
      { code: "OLD_ERROR", status: 410, operation: "GET /legacy" },
    ]);

    expect(diagnostics.map((item) => item.ruleId)).toEqual(
      expect.arrayContaining([
        "openapi-status-drift",
        "openapi-undocumented-error",
        "openapi-stale-error",
      ]),
    );
  });

  it("explains when a document has no machine-readable error codes", () => {
    expect(
      compareCatalogWithOpenApi(
        {
          schemaVersion: 1,
          generatedAt: "2026-06-20T00:00:00.000Z",
          errors: [],
        },
        [],
      ),
    ).toEqual([
      expect.objectContaining({
        ruleId: "openapi-no-error-codes",
        severity: "note",
      }),
    ]);
  });
});

function entry(code: string, status: number) {
  return {
    code,
    message: `${code} message`,
    status,
    description: "",
    resolution: "",
    occurrences: [
      {
        file: "src/api.ts",
        line: 1,
        column: 1,
        endLine: 1,
        endColumn: 10,
        language: "typescript" as const,
        constructor: "AppError",
      },
    ],
  };
}
