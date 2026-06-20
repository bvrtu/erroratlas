#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Command, Option } from "commander";
import { buildCatalog, compareWithCatalog, CONFIG_FILE, defaultRawConfig, loadConfig, readCatalog, readCatalogIfPresent, renderConsole, renderMarkdown, renderSarif, scanProject, shouldFail, } from "./index.js";
const program = new Command();
program
    .name("erroratlas")
    .description("Keep application error contracts and documentation in sync.")
    .version("0.1.0");
program
    .command("init")
    .description("Create an ErrorAtlas configuration file")
    .argument("[path]", "project root", ".")
    .option("--force", "overwrite an existing configuration", false)
    .action(async (projectPath, options) => {
    const root = path.resolve(projectPath);
    const configPath = path.join(root, CONFIG_FILE);
    await mkdir(root, { recursive: true });
    if (!options.force && (await exists(configPath))) {
        throw new Error(`${CONFIG_FILE} already exists. Use --force to replace it.`);
    }
    await writeFile(configPath, `${JSON.stringify(defaultRawConfig(), null, 2)}\n`, "utf8");
    process.stdout.write(`Created ${path.relative(process.cwd(), configPath) || CONFIG_FILE}\n`);
});
program
    .command("scan")
    .description("Scan source files for application errors")
    .argument("[path]", "project root", ".")
    .addOption(formatOption())
    .option("-o, --output <file>", "write output to a file")
    .action(async (projectPath, options) => {
    const root = path.resolve(projectPath);
    const config = await loadConfig(root);
    const scan = await scanProject(root, config);
    const output = renderOutput(options.format, scan, scan.diagnostics);
    await emit(output, options.output, root);
});
program
    .command("generate")
    .description("Generate the JSON catalog and Markdown error reference")
    .argument("[path]", "project root", ".")
    .option("--catalog <file>", "override the configured catalog path")
    .option("--docs <file>", "override the configured Markdown path")
    .option("--no-markdown", "do not generate Markdown documentation")
    .action(async (projectPath, options) => {
    const root = path.resolve(projectPath);
    const config = await loadConfig(root);
    const scan = await scanProject(root, config);
    const catalogPath = path.resolve(root, options.catalog ?? config.catalog);
    const docsPath = path.resolve(root, options.docs ?? config.docs);
    if (shouldFail(scan.diagnostics, "error")) {
        process.stdout.write(renderConsole(scan));
        process.stderr.write("Catalog generation stopped because source definitions conflict.\n");
        process.exitCode = 1;
        return;
    }
    const previous = await readCatalogIfPresent(catalogPath);
    const catalog = buildCatalog(scan.errors, previous);
    await writeText(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    if (options.markdown)
        await writeText(docsPath, renderMarkdown(catalog));
    process.stdout.write(renderConsole(scan));
    process.stdout.write(`Generated ${relative(root, catalogPath)}` +
        (options.markdown ? ` and ${relative(root, docsPath)}` : "") +
        "\n");
});
program
    .command("check")
    .description("Fail when source errors and the committed catalog drift apart")
    .argument("[path]", "project root", ".")
    .addOption(formatOption())
    .option("-o, --output <file>", "write output to a file")
    .option("--catalog <file>", "override the configured catalog path")
    .addOption(new Option("--fail-on <severity>", "minimum failing severity").choices([
    "error",
    "warning",
]))
    .action(async (projectPath, options) => {
    const root = path.resolve(projectPath);
    const config = await loadConfig(root);
    const scan = await scanProject(root, config);
    const catalogPath = path.resolve(root, options.catalog ?? config.catalog);
    let catalog;
    try {
        catalog = await readCatalog(catalogPath);
    }
    catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`Catalog not found at ${relative(root, catalogPath)}. Run erroratlas generate first.`);
        }
        throw error;
    }
    const diagnostics = compareWithCatalog(scan, catalog);
    const output = renderOutput(options.format, scan, diagnostics);
    await emit(output, options.output, root);
    if (shouldFail(diagnostics, options.failOn ?? config.failOn))
        process.exitCode = 1;
});
program.parseAsync().catch((error) => {
    process.stderr.write(`ErrorAtlas: ${error.message}\n`);
    process.exitCode = 2;
});
function formatOption() {
    return new Option("-f, --format <format>", "output format")
        .choices(["console", "json", "markdown", "sarif"])
        .default("console");
}
function renderOutput(format, scan, diagnostics) {
    if (format === "json")
        return `${JSON.stringify({ ...scan, diagnostics }, null, 2)}\n`;
    if (format === "sarif")
        return renderSarif(diagnostics);
    if (format === "markdown")
        return renderMarkdown(buildCatalog(scan.errors));
    return renderConsole(scan, diagnostics);
}
async function emit(output, filename, root) {
    if (!filename) {
        process.stdout.write(output);
        return;
    }
    const target = path.resolve(root, filename);
    await writeText(target, output);
    process.stdout.write(`Wrote ${relative(root, target)}\n`);
}
async function writeText(filename, content) {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, content, "utf8");
}
async function exists(filename) {
    try {
        await readFile(filename);
        return true;
    }
    catch (error) {
        if (error.code === "ENOENT")
            return false;
        throw error;
    }
}
function relative(root, filename) {
    return path.relative(root, filename).split(path.sep).join("/") || ".";
}
//# sourceMappingURL=cli.js.map