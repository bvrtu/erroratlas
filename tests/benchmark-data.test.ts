import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);

describe("benchmark data validation", () => {
  it("validates the committed dataset against schema, privacy, and totals", async () => {
    const result = await run("data/bvrtu-public-repo-audit.json");
    expect(result.stdout).toContain("schema v2");
  });

  it("queries a schema v3 snapshot passed as the first positional argument", async () => {
    const result = await exec(process.execPath, [
      "scripts/query-benchmark.mjs",
      "data/external-benchmark-v3.json",
    ]);
    const output = JSON.parse(result.stdout);
    expect(output.dataset.schemaVersion).toBe(3);
    expect(output.metrics.repositories).toBe(6);
    expect(output.metrics.filesScanned).toBe(261);
  });

  it("rejects privacy-sensitive fields even when nested", async () => {
    const dataset = await currentDataset();
    dataset.repositories[0].message = "must never be published";
    const filename = await temporaryDataset(dataset);
    await expect(run(filename)).rejects.toThrow();
  });

  it("rejects aggregate totals that do not match repository rows", async () => {
    const dataset = await currentDataset();
    dataset.summary.filesScanned += 1;
    const filename = await temporaryDataset(dataset);
    await expect(run(filename)).rejects.toThrow(/summary\.filesScanned/);
  });

  it("rejects schema-valid provenance that differs from the allowlist", async () => {
    const dataset = JSON.parse(
      await readFile("data/external-benchmark-v3.json", "utf8"),
    );
    dataset.repositories[0].commit = "0".repeat(40);
    const filename = await temporaryDataset(dataset);
    await expect(run(filename)).rejects.toThrow(/commit is inconsistent/);
  });
});

async function run(filename: string) {
  return exec(process.execPath, ["scripts/check-benchmark-data.mjs", filename]);
}

async function currentDataset(): Promise<any> {
  return JSON.parse(
    await readFile("data/bvrtu-public-repo-audit.json", "utf8"),
  );
}

async function temporaryDataset(dataset: unknown): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "erroratlas-benchmark-"));
  const filename = path.join(root, "dataset.json");
  await writeFile(filename, `${JSON.stringify(dataset, null, 2)}\n`);
  return filename;
}
