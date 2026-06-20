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
});
