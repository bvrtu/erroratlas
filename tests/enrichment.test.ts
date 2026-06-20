import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { scanProject } from "../src/scanner.js";
import {
  applySourceFixes,
  planSourceFixes,
  renderSourceFixes,
} from "../src/source-fixes.js";
import {
  applyCatalogDocumentation,
  suggestCatalogDocumentation,
} from "../src/suggestions.js";
import type { ErrorCatalog } from "../src/types.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("catalog documentation suggestions", () => {
  it("fills only empty fields with deterministic status-aware guidance", () => {
    const catalog: ErrorCatalog = {
      schemaVersion: 1,
      generatedAt: "2026-06-20T00:00:00.000Z",
      errors: [
        entry("AUTH_REQUIRED", "Authentication is required", 401),
        {
          ...entry("UPSTREAM_DOWN", "Upstream unavailable", 503),
          description: "Human-authored description.",
        },
      ],
    };

    const enriched = applyCatalogDocumentation(catalog);

    expect(enriched.errors[0]).toMatchObject({
      description: "Authentication is required.",
      resolution: "Authenticate and retry the request.",
    });
    expect(enriched.errors[1]).toMatchObject({
      description: "Human-authored description.",
      resolution:
        "Retry with backoff; if the problem persists, contact the service owner.",
    });
    expect(suggestCatalogDocumentation(enriched)).toEqual([]);
  });
});

describe("safe source fixes", () => {
  it("adds generated codes only to explicit API error response objects", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-fix-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    const filename = path.join(root, "src", "api.ts");
    await writeFile(
      filename,
      `
        function express(res) {
          res.status(404).json({ error: "User was not found" });
          res.status(200).json({ message: "Everything is fine" });
          res.status(500).json({ code: "EXISTING_CODE", error: "Existing" });
        }
        function next() {
          return NextResponse.json({
            message: "Payment was declined"
          }, { status: 402 });
        }
      `,
    );
    const config = await loadConfig(root);

    const fixes = await planSourceFixes(root, config);
    expect(fixes).toEqual([
      expect.objectContaining({ code: "USER_WAS_NOT_FOUND" }),
      expect.objectContaining({ code: "PAYMENT_WAS_DECLINED" }),
    ]);

    await applySourceFixes(root, fixes);
    const updated = await readFile(filename, "utf8");
    expect(updated).toContain(
      'res.status(404).json({ code: "USER_WAS_NOT_FOUND", error: "User was not found" })',
    );
    expect(updated).toContain('code: "PAYMENT_WAS_DECLINED",');
    expect(updated).toContain(
      'res.status(200).json({ message: "Everything is fine" })',
    );

    const scan = await scanProject(root, config);
    expect(scan.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "USER_WAS_NOT_FOUND",
        "EXISTING_CODE",
        "PAYMENT_WAS_DECLINED",
      ]),
    );
  });

  it("prefers catalog identities and applies a configured namespace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-fix-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      `${JSON.stringify({ fix: { codePrefix: "API" } })}\n`,
    );
    await writeFile(
      path.join(root, "erroratlas.catalog.json"),
      `${JSON.stringify({
        schemaVersion: 2,
        generatedAt: "2026-06-20T00:00:00.000Z",
        errors: [entry("USER_NOT_FOUND", "User was not found", 404)],
      })}\n`,
    );
    await writeFile(
      path.join(root, "src", "api.ts"),
      `
        res.status(404).json({ error: "User was not found" });
        res.status(402).json({ error: "Payment declined" });
      `,
    );

    const fixes = await planSourceFixes(root, await loadConfig(root));
    expect(fixes).toEqual([
      expect.objectContaining({
        code: "USER_NOT_FOUND",
        source: "catalog",
        safe: true,
      }),
      expect.objectContaining({
        code: "API_PAYMENT_DECLINED",
        source: "generated",
        safe: true,
      }),
    ]);
    expect(renderSourceFixes(fixes)).toContain("Rationale:");
    expect(renderSourceFixes(fixes)).toContain("Reuses catalog identity");
  });

  it("blocks catalog and intra-plan code collisions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "erroratlas-fix-"));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, "src"));
    await writeFile(
      path.join(root, "erroratlas.config.json"),
      `${JSON.stringify({ fix: { codePrefix: "API" } })}\n`,
    );
    await writeFile(
      path.join(root, "erroratlas.catalog.json"),
      `${JSON.stringify({
        schemaVersion: 2,
        generatedAt: "2026-06-20T00:00:00.000Z",
        errors: [entry("API_PAYMENT_DECLINED", "A different failure", 500)],
      })}\n`,
    );
    const filename = path.join(root, "src", "api.ts");
    const source = `
      res.status(402).json({ error: "Payment declined" });
      res.status(400).json({ error: "A-B" });
      res.status(400).json({ error: "A B" });
    `;
    await writeFile(filename, source);

    const fixes = await planSourceFixes(root, await loadConfig(root));
    expect(fixes).toHaveLength(3);
    expect(fixes.every((fix) => !fix.safe)).toBe(true);
    expect(renderSourceFixes(fixes)).toContain("blocked collisions: 3");

    await applySourceFixes(root, fixes);
    expect(await readFile(filename, "utf8")).toBe(source);
  });
});

function entry(code: string, message: string, status: number) {
  return {
    code,
    message,
    status,
    description: "",
    resolution: "",
    occurrences: [],
  };
}
