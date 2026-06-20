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

describe("opt-in TypeScript project resolution", () => {
  it("resolves JSONC tsconfig paths and their incremental importers", async () => {
    const root = await project();
    await mkdir(path.join(root, "packages", "contracts", "src"), {
      recursive: true,
    });
    await mkdir(path.join(root, "apps", "api", "src"), { recursive: true });
    await writeFile(
      path.join(root, "tsconfig.json"),
      `{
        // ErrorAtlas intentionally accepts ordinary JSONC tsconfig files.
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@contracts/*": ["packages/contracts/src/*"],
          },
        },
      }`,
    );
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      JSON.stringify({
        include: ["**/*.ts"],
        typescript: {
          resolveProjectImports: true,
          tsconfig: "tsconfig.json",
        },
      }),
    );
    await writeFile(
      path.join(root, "packages", "contracts", "src", "errors.ts"),
      `
        export const CODE = "PATH_ALIAS_FAILURE";
        export const STATUS = 502;
      `,
    );
    await writeFile(
      path.join(root, "apps", "api", "src", "service.ts"),
      `
        import { CODE, STATUS } from "@contracts/errors";
        throw new AppError(CODE, "Path alias failed", STATUS);
      `,
    );

    const config = await loadConfig(root);
    const full = await scanProject(root, config);
    expect(full.errors).toEqual([
      expect.objectContaining({
        code: "PATH_ALIAS_FAILURE",
        status: 502,
        structured: true,
        evidence: {
          confidence: "proven",
          steps: expect.arrayContaining([
            expect.objectContaining({
              kind: "syntax",
              file: "apps/api/src/service.ts",
            }),
            expect.objectContaining({
              kind: "path-alias",
              source: "@contracts/errors",
            }),
            expect.objectContaining({
              kind: "literal",
              file: "packages/contracts/src/errors.ts",
            }),
          ]),
        },
      }),
    ]);

    const incremental = await scanProject(root, config, {
      changedFiles: ["packages/contracts/src/errors.ts"],
      affectedImportHops: 1,
    });
    expect(incremental.filesScanned).toBe(2);
    expect(incremental.errors).toEqual([
      expect.objectContaining({ code: "PATH_ALIAS_FAILURE" }),
    ]);
  });

  it("resolves only explicitly declared workspace packages", async () => {
    const root = await project();
    await mkdir(path.join(root, "packages", "contracts", "src"), {
      recursive: true,
    });
    await mkdir(path.join(root, "apps", "api"), { recursive: true });
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ private: true, workspaces: ["packages/*"] }),
    );
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: {} }),
    );
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      JSON.stringify({
        include: ["**/*.ts"],
        typescript: { resolveProjectImports: true },
      }),
    );
    await writeFile(
      path.join(root, "packages", "contracts", "package.json"),
      JSON.stringify({
        name: "@demo/contracts",
        exports: { "./codes": "./src/codes.ts" },
      }),
    );
    await writeFile(
      path.join(root, "packages", "contracts", "src", "codes.ts"),
      'export const CODE = "WORKSPACE_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "apps", "api", "service.ts"),
      `
        import { CODE } from "@demo/contracts/codes";
        throw new AppError(CODE, "Workspace failed", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "WORKSPACE_FAILURE", structured: true }),
    ]);
  });

  it("resolves a root-confined baseUrl inherited from a local config", async () => {
    const root = await project();
    await mkdir(path.join(root, "config"));
    await mkdir(path.join(root, "shared"));
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "config", "base.json"),
      `{
        "compilerOptions": {
          "baseUrl": "..",
        },
      }`,
    );
    await writeFile(
      path.join(root, "tsconfig.json"),
      `{
        "extends": "./config/base.json",
      }`,
    );
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      JSON.stringify({
        include: ["**/*.ts"],
        typescript: { resolveProjectImports: true },
      }),
    );
    await writeFile(
      path.join(root, "shared", "codes.ts"),
      'export const CODE = "BASE_URL_FAILURE";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "shared/codes";
        throw new AppError(CODE, "Base URL failed", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "BASE_URL_FAILURE",
        structured: true,
        evidence: expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({
              kind: "base-url",
              source: "shared/codes",
            }),
          ]),
        }),
      }),
    ]);
  });

  it("keeps project imports disabled by default", async () => {
    const root = await project();
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { paths: { "@app/*": ["src/*"] } },
      }),
    );
    await writeFile(
      path.join(root, "src", "codes.ts"),
      'export const CODE = "SHOULD_NOT_RESOLVE";\n',
    );
    await writeFile(
      path.join(root, "src", "service.ts"),
      `
        import { CODE } from "@app/codes";
        throw new AppError(CODE, "Disabled", 500);
      `,
    );

    const result = await scanProject(root, await loadConfig(root));
    expect(result.errors).toEqual([
      expect.objectContaining({ code: null, structured: false }),
    ]);
  });

  it("rejects path targets and config paths outside the project", async () => {
    const root = await project();
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: { paths: { "@outside/*": ["../outside/*"] } },
      }),
    );
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      JSON.stringify({
        typescript: { resolveProjectImports: true },
      }),
    );

    await expect(scanProject(root, await loadConfig(root))).rejects.toThrow(
      "must stay inside the ErrorAtlas project root",
    );

    await writeFile(
      path.join(root, "erroratlas.config.json"),
      JSON.stringify({ typescript: { tsconfig: "../tsconfig.json" } }),
    );
    await expect(loadConfig(root)).rejects.toThrow(
      "must be a non-empty project-relative path",
    );
  });
});

async function project(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "erroratlas-project-"));
  temporaryDirectories.push(root);
  return root;
}
