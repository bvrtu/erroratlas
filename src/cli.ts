#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Command, Option } from "commander";
import {
  buildCatalog,
  buildBaseline,
  compareWithCatalog,
  CONFIG_FILE,
  defaultRawConfig,
  loadConfig,
  readCatalog,
  readCatalogIfPresent,
  renderConsole,
  renderMarkdown,
  renderSarif,
  compareCatalogWithOpenApi,
  filterBaselineDiagnostics,
  readOpenApiContract,
  readBaseline,
  readRuntimeEvents,
  renderRuntimeSummary,
  summarizeRuntimeEvents,
  applyCatalogDocumentation,
  applySourceFixes,
  planSourceFixes,
  renderCatalogSuggestions,
  renderSourceFixes,
  suggestCatalogDocumentation,
  scanProject,
  shouldFail,
} from "./index.js";
import type { Diagnostic, ErrorCatalog, ScanResult } from "./types.js";

const program = new Command();
const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

program
  .name("erroratlas")
  .description("Keep application error contracts and documentation in sync.")
  .version(packageJson.version);

program
  .command("init")
  .description("Create an ErrorAtlas configuration file")
  .argument("[path]", "project root", ".")
  .option("--force", "overwrite an existing configuration", false)
  .action(async (projectPath: string, options: { force: boolean }) => {
    const root = path.resolve(projectPath);
    const configPath = path.join(root, CONFIG_FILE);
    await mkdir(root, { recursive: true });
    if (!options.force && (await exists(configPath))) {
      throw new Error(
        `${CONFIG_FILE} already exists. Use --force to replace it.`,
      );
    }
    await writeFile(
      configPath,
      `${JSON.stringify(defaultRawConfig(), null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `Created ${path.relative(process.cwd(), configPath) || CONFIG_FILE}\n`,
    );
  });

program
  .command("scan")
  .description("Scan source files for application errors")
  .argument("[path]", "project root", ".")
  .addOption(formatOption())
  .option("-o, --output <file>", "write output to a file")
  .action(
    async (
      projectPath: string,
      options: { format: OutputFormat; output?: string },
    ) => {
      const root = path.resolve(projectPath);
      const config = await loadConfig(root);
      const scan = await scanProject(root, config);
      const output = renderOutput(options.format, scan, scan.diagnostics);
      await emit(output, options.output, root);
    },
  );

program
  .command("runtime-report")
  .description("Summarize locally collected ErrorAtlas runtime events")
  .argument("[file]", "JSONL runtime event file", ".erroratlas/runtime.jsonl")
  .addOption(
    new Option("-f, --format <format>", "output format")
      .choices(["console", "json"])
      .default("console"),
  )
  .option("-o, --output <file>", "write output to a file")
  .action(
    async (
      filename: string,
      options: { format: "console" | "json"; output?: string },
    ) => {
      const absolute = path.resolve(filename);
      const summary = summarizeRuntimeEvents(await readRuntimeEvents(absolute));
      const output =
        options.format === "json"
          ? `${JSON.stringify(summary, null, 2)}\n`
          : renderRuntimeSummary(summary);
      await emit(output, options.output, process.cwd());
    },
  );

program
  .command("generate")
  .description("Generate the JSON catalog and Markdown error reference")
  .argument("[path]", "project root", ".")
  .option("--catalog <file>", "override the configured catalog path")
  .option("--docs <file>", "override the configured Markdown path")
  .option("--no-markdown", "do not generate Markdown documentation")
  .action(
    async (
      projectPath: string,
      options: { catalog?: string; docs?: string; markdown: boolean },
    ) => {
      const root = path.resolve(projectPath);
      const config = await loadConfig(root);
      const scan = await scanProject(root, config);
      const catalogPath = path.resolve(root, options.catalog ?? config.catalog);
      const docsPath = path.resolve(root, options.docs ?? config.docs);
      if (shouldFail(scan.diagnostics, "error")) {
        process.stdout.write(renderConsole(scan));
        process.stderr.write(
          "Catalog generation stopped because source definitions conflict.\n",
        );
        process.exitCode = 1;
        return;
      }
      const previous = await readCatalogIfPresent(catalogPath);
      const catalog = buildCatalog(scan.errors, previous);

      await writeText(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
      if (options.markdown) await writeText(docsPath, renderMarkdown(catalog));

      process.stdout.write(renderConsole(scan));
      process.stdout.write(
        `Generated ${relative(root, catalogPath)}` +
          (options.markdown ? ` and ${relative(root, docsPath)}` : "") +
          "\n",
      );
    },
  );

program
  .command("enrich")
  .description("Suggest or apply deterministic catalog documentation")
  .argument("[path]", "project root", ".")
  .option("--catalog <file>", "override the configured catalog path")
  .option("--write", "write suggestions into empty catalog fields", false)
  .action(
    async (
      projectPath: string,
      options: { catalog?: string; write: boolean },
    ) => {
      const root = path.resolve(projectPath);
      const config = await loadConfig(root);
      const catalogPath = path.resolve(root, options.catalog ?? config.catalog);
      const catalog = await readCatalog(catalogPath);
      const suggestions = suggestCatalogDocumentation(catalog);
      process.stdout.write(renderCatalogSuggestions(suggestions));
      if (options.write && suggestions.length > 0) {
        await writeText(
          catalogPath,
          `${JSON.stringify(
            applyCatalogDocumentation(catalog, suggestions),
            null,
            2,
          )}\n`,
        );
        process.stdout.write(
          `Updated ${suggestions.length} catalog entries in ${relative(root, catalogPath)}.\n`,
        );
      } else if (!options.write && suggestions.length > 0) {
        process.stdout.write("Run with --write to apply these suggestions.\n");
      }
    },
  );

program
  .command("fix")
  .description(
    "Preview or apply safe machine-code additions to API error responses",
  )
  .argument("[path]", "project root", ".")
  .option("--write", "apply the proposed source changes", false)
  .action(async (projectPath: string, options: { write: boolean }) => {
    const root = path.resolve(projectPath);
    const config = await loadConfig(root);
    const fixes = await planSourceFixes(root, config);
    process.stdout.write(renderSourceFixes(fixes));
    if (options.write && fixes.length > 0) {
      await applySourceFixes(root, fixes);
      process.stdout.write(
        `Applied ${fixes.filter((fix) => fix.safe).length} safe source fixes.\n`,
      );
    } else if (!options.write && fixes.length > 0) {
      process.stdout.write("Run with --write to apply these source changes.\n");
    }
  });

program
  .command("baseline")
  .description(
    "Record existing drift so CI can fail only on net-new violations",
  )
  .argument("[path]", "project root", ".")
  .option("-o, --output <file>", "baseline file path")
  .option("--catalog <file>", "override the configured catalog path")
  .option("--openapi <file>", "compare against an OpenAPI or Swagger document")
  .action(
    async (
      projectPath: string,
      options: { output?: string; catalog?: string; openapi?: string },
    ) => {
      const root = path.resolve(projectPath);
      const config = await loadConfig(root);
      const { diagnostics } = await collectCheckDiagnostics(
        root,
        config,
        options.catalog,
        options.openapi,
      );
      const target = path.resolve(
        root,
        options.output ?? config.baseline ?? ".erroratlas/baseline.json",
      );
      const baseline = buildBaseline(diagnostics);
      await writeText(target, `${JSON.stringify(baseline, null, 2)}\n`);
      process.stdout.write(
        `Recorded ${baseline.fingerprints.length} existing diagnostics in ${relative(root, target)}.\n`,
      );
    },
  );

program
  .command("check")
  .description("Fail when source errors and the committed catalog drift apart")
  .argument("[path]", "project root", ".")
  .addOption(formatOption())
  .option("-o, --output <file>", "write output to a file")
  .option("--catalog <file>", "override the configured catalog path")
  .option("--openapi <file>", "compare against an OpenAPI or Swagger document")
  .option("--baseline <file>", "hide diagnostics recorded in a baseline")
  .option(
    "--changed <files...>",
    "scan changed files plus bounded reverse import dependents",
  )
  .option("--changed-files <file>", "read newline-delimited changed files")
  .option(
    "--affected-import-hops <count>",
    "maximum reverse-import traversal depth",
    parseNonnegativeInteger,
    2,
  )
  .addOption(
    new Option("--fail-on <severity>", "minimum failing severity").choices([
      "error",
      "warning",
    ]),
  )
  .action(
    async (
      projectPath: string,
      options: {
        format: OutputFormat;
        output?: string;
        catalog?: string;
        openapi?: string;
        baseline?: string;
        changed?: string[];
        changedFiles?: string;
        affectedImportHops: number;
        failOn?: "error" | "warning";
      },
    ) => {
      const root = path.resolve(projectPath);
      const config = await loadConfig(root);
      const changedFiles = await resolveChangedFiles(root, options);
      const { scan, diagnostics: allDiagnostics } =
        await collectCheckDiagnostics(
          root,
          config,
          options.catalog,
          options.openapi,
          changedFiles,
          options.affectedImportHops,
        );
      let diagnostics = allDiagnostics;
      const baselineFile = options.baseline ?? config.baseline;
      if (baselineFile) {
        diagnostics = filterBaselineDiagnostics(
          diagnostics,
          await readBaseline(path.resolve(root, baselineFile)),
        );
      }
      const output = renderOutput(options.format, scan, diagnostics);
      await emit(output, options.output, root);
      if (shouldFail(diagnostics, options.failOn ?? config.failOn))
        process.exitCode = 1;
    },
  );

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(`ErrorAtlas: ${(error as Error).message}\n`);
  process.exitCode = 2;
});

type OutputFormat = "console" | "json" | "markdown" | "sarif";

function formatOption(): Option {
  return new Option("-f, --format <format>", "output format")
    .choices(["console", "json", "markdown", "sarif"])
    .default("console");
}

function renderOutput(
  format: OutputFormat,
  scan: ScanResult,
  diagnostics: Diagnostic[],
): string {
  if (format === "json")
    return `${JSON.stringify({ ...scan, diagnostics }, null, 2)}\n`;
  if (format === "sarif") return renderSarif(diagnostics);
  if (format === "markdown") return renderMarkdown(buildCatalog(scan.errors));
  return renderConsole(scan, diagnostics);
}

async function emit(
  output: string,
  filename: string | undefined,
  root: string,
): Promise<void> {
  if (!filename) {
    process.stdout.write(output);
    return;
  }
  const target = path.resolve(root, filename);
  await writeText(target, output);
  process.stdout.write(`Wrote ${relative(root, target)}\n`);
}

async function writeText(filename: string, content: string): Promise<void> {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, content, "utf8");
}

async function exists(filename: string): Promise<boolean> {
  try {
    await readFile(filename);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function relative(root: string, filename: string): string {
  return path.relative(root, filename).split(path.sep).join("/") || ".";
}

function compareDiagnosticsForCli(left: Diagnostic, right: Diagnostic): number {
  const leftFile = left.location?.file ?? "";
  const rightFile = right.location?.file ?? "";
  return (
    leftFile.localeCompare(rightFile) ||
    (left.location?.line ?? 0) - (right.location?.line ?? 0) ||
    left.ruleId.localeCompare(right.ruleId)
  );
}

async function collectCheckDiagnostics(
  root: string,
  config: Awaited<ReturnType<typeof loadConfig>>,
  catalogOverride?: string,
  openapiOverride?: string,
  changedFiles?: string[],
  affectedImportHops = 2,
): Promise<{ scan: ScanResult; diagnostics: Diagnostic[] }> {
  const incremental = Boolean(changedFiles?.length);
  const scan = await scanProject(
    root,
    config,
    changedFiles?.length ? { changedFiles, affectedImportHops } : {},
  );
  const catalogPath = path.resolve(root, catalogOverride ?? config.catalog);
  let catalog: ErrorCatalog;
  try {
    catalog = await readCatalog(catalogPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Catalog not found at ${relative(root, catalogPath)}. Run erroratlas generate first.`,
      );
    }
    throw error;
  }

  const diagnostics = compareWithCatalog(scan, catalog).filter(
    (diagnostic) => !incremental || diagnostic.ruleId !== "stale-error",
  );
  const openapi = openapiOverride ?? config.openapi;
  if (openapi) {
    const changedCodes = new Set(
      scan.errors
        .map((error) => error.code)
        .filter((code): code is string => code !== null),
    );
    const openapiDiagnostics = compareCatalogWithOpenApi(
      buildCatalog(scan.errors, null, catalog.generatedAt),
      await readOpenApiContract(path.resolve(root, openapi)),
    ).filter(
      (diagnostic) =>
        !incremental ||
        (diagnostic.code !== null && changedCodes.has(diagnostic.code)),
    );
    diagnostics.push(...openapiDiagnostics);
    diagnostics.sort(compareDiagnosticsForCli);
  }
  return { scan, diagnostics };
}

async function resolveChangedFiles(
  root: string,
  options: { changed?: string[]; changedFiles?: string },
): Promise<string[] | undefined> {
  const changed = [...(options.changed ?? [])];
  if (options.changedFiles) {
    changed.push(
      ...(await readFile(path.resolve(root, options.changedFiles), "utf8"))
        .split(/\r?\n/)
        .map((filename) => filename.trim())
        .filter(Boolean),
    );
  }
  return changed.length ? [...new Set(changed)] : undefined;
}

function parseNonnegativeInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("affected import hops must be a non-negative integer");
  }
  return parsed;
}
