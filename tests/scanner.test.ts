import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { scanProject } from "../src/scanner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("project scanner", () => {
  it("scans supported files and honors default exclusions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "node_modules", "ignored"), {
      recursive: true,
    });
    await writeFile(
      path.join(root, "src", "service.ts"),
      'throw new AppError("SERVICE_DOWN", "Service is unavailable", { status: 503 });\n',
    );
    await writeFile(
      path.join(root, "src", "ignored.test.ts"),
      'throw new Error("test");\n',
    );
    await writeFile(
      path.join(root, "node_modules", "ignored", "index.js"),
      'throw new Error("dependency");\n',
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.filesScanned).toBe(1);
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "SERVICE_DOWN", status: 503 }),
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("resolves literals imported from relative TypeScript modules", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "codes.ts"),
      `
        export const ERROR_CODE = "IMPORTED_FAILURE";
        export const ERROR_MESSAGE = "Imported failure";
        export const ERROR_STATUS = 502;
      `,
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { ERROR_CODE, ERROR_MESSAGE, ERROR_STATUS as STATUS } from "./codes";
        throw new AppError(ERROR_CODE, ERROR_MESSAGE, STATUS);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "IMPORTED_FAILURE",
        message: "Imported failure",
        status: 502,
        structured: true,
      }),
    ]);
  });

  it("resolves two-hop re-exports, defaults, aliases, members, and factories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "contracts.ts"),
      `
        export const ProblemCodes = { NotFound: "USER_NOT_FOUND" } as const;
        export enum HttpStatus { NotFound = 404 }
        const DEFAULT_DETAIL = "User was not found";
        export default DEFAULT_DETAIL;
        export function makeProblem(code, detail, status) {
          return new AppError(code, detail, status);
        }
      `,
    );
    await writeFile(
      path.join(root, "src", "index.ts"),
      `
        export {
          ProblemCodes as Codes,
          HttpStatus,
          default as DEFAULT_DETAIL,
          makeProblem,
        } from "./contracts";
      `,
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import * as Contracts from "./index";
        import DEFAULT_DETAIL from "./contracts";
        const CODE = Contracts.Codes.NotFound;
        const createNotFound = (detail) =>
          Contracts.makeProblem(CODE, detail, Contracts.HttpStatus.NotFound);
        throw createNotFound(DEFAULT_DETAIL);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        message: "User was not found",
        status: 404,
        constructor: "createNotFound()",
        structured: true,
      }),
    ]);
    expect(result.errors[0]?.evidence?.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "relative-import" }),
        expect.objectContaining({ kind: "re-export" }),
        expect.objectContaining({ kind: "factory" }),
      ]),
    );
  });

  it("does not guess through more than two cross-file hops", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "leaf.ts"),
      'export const CODE = "TOO_FAR";\n',
    );
    await writeFile(
      path.join(root, "src", "level-two.ts"),
      'export { CODE } from "./leaf";\n',
    );
    await writeFile(
      path.join(root, "src", "level-one.ts"),
      'export { CODE } from "./level-two";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "./level-one";
        throw new AppError(CODE, "Unproven code", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toEqual([
      expect.objectContaining({
        code: null,
        structured: false,
        evidence: expect.objectContaining({ confidence: "partial" }),
      }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ ruleId: "unstructured-error" }),
    ]);
  });

  it("resolves a proven value through a two-edge export-star barrel", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "codes.ts"),
      'export const CODE = "BARREL_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "src", "index.ts"),
      'export * from "./codes";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "./index";
        throw new AppError(CODE, "Barrel failure", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: "BARREL_FAILURE", structured: true }),
    ]);
  });

  it("does not guess when export-star barrels expose conflicting values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "first.ts"),
      'export const CODE = "FIRST_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "src", "second.ts"),
      'export const CODE = "SECOND_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "src", "index.ts"),
      'export * from "./first";\nexport * from "./second";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "./index";
        throw new AppError(CODE, "Ambiguous failure", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));

    expect(result.errors).toEqual([
      expect.objectContaining({ code: null, structured: false }),
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ ruleId: "unstructured-error" }),
    ]);
  });

  it("resolves immutable destructured object members", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        const ErrorContract = {
          NotFound: "DESTRUCTURED_NOT_FOUND",
          Status: 404,
        } as const;
        const { NotFound: CODE, Status } = ErrorContract;
        throw new AppError(CODE, "Destructured", Status);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "DESTRUCTURED_NOT_FOUND",
        status: 404,
        structured: true,
      }),
    ]);
  });

  it("rejects mutable, rest, computed, and reassigned destructuring", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        const Mutable = { Code: "MUTABLE_CODE" };
        const { Code: MUTABLE } = Mutable;
        const Frozen = { Code: "FROZEN_CODE", Other: "OTHER" } as const;
        const { Code: REST, ...remaining } = Frozen;
        const key = "Code";
        const { [key]: COMPUTED } = Frozen;
        let { Code: REASSIGNED } = Frozen;
        REASSIGNED = "CHANGED";

        throw new AppError(MUTABLE, "Mutable", 500);
        throw new AppError(REST, "Rest", 500);
        throw new AppError(COMPUTED, "Computed", 500);
        throw new AppError(REASSIGNED, "Reassigned", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toHaveLength(4);
    expect(result.errors.every((error) => error.code === null)).toBe(true);
    expect(
      result.diagnostics.every(
        (diagnostic) => diagnostic.ruleId === "unstructured-error",
      ),
    ).toBe(true);
  });

  it("resolves object factory arguments, defaults, and three bounded wrappers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        function makeProblem({ code, detail: message = "Fallback", status = 500 }) {
          return new AppError(code, message, status);
        }
        function withCode(detail, status) {
          return makeProblem({ code: "DEEP_FACTORY", detail, status });
        }
        function notFound(detail = "User missing") {
          return withCode(detail, 404);
        }
        function publicFailure() {
          return notFound();
        }

        throw makeProblem({ code: "DEFAULT_FACTORY", detail: "Default status" });
        throw publicFailure();
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "DEFAULT_FACTORY",
        message: "Default status",
        status: 500,
      }),
      expect.objectContaining({
        code: "DEEP_FACTORY",
        message: "User missing",
        status: 404,
      }),
    ]);
    const deep = result.errors.find((error) => error.code === "DEEP_FACTORY");
    expect(
      deep?.evidence?.steps.filter((step) => step.kind === "factory"),
    ).toHaveLength(4);
  });

  it("does not compose factories beyond three wrappers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        const base = (code) => new AppError(code, "Too deep", 500);
        const one = (code) => base(code);
        const two = (code) => one(code);
        const three = (code) => two(code);
        const four = (code) => three(code);
        throw four("TOO_DEEP");
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({ code: null, structured: false }),
    ]);
  });

  it("incrementally scans changed files and bounded reverse importers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "src", "codes.ts"),
      'export const CODE = "SERVICE_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "./codes";
        export function run() {
          throw new AppError(CODE, "Service failed", 503);
        }
      `,
    );
    await writeFile(
      path.join(root, "src", "controller.ts"),
      `
        import { run } from "./service";
        export function handle() {
          run();
          throw new AppError("CONTROLLER_FAILURE", "Controller failed", 500);
        }
      `,
    );
    await writeFile(
      path.join(root, "src", "unrelated.ts"),
      'throw new AppError("UNRELATED", "Unrelated", 500);\n',
    );

    const result = await scanProject(root, await loadConfig(root), {
      changedFiles: ["src/codes.ts"],
      affectedImportHops: 2,
    });

    expect(result.filesScanned).toBe(3);
    expect(result.errors.map((error) => error.code)).toEqual([
      "CONTROLLER_FAILURE",
      "SERVICE_FAILURE",
    ]);
  });
});
