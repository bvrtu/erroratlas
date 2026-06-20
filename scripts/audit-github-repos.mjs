import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  loadConfig,
  readCatalogIfPresent,
  scanProject,
} from "../dist/index.js";

const exec = promisify(execFile);
const owner = process.argv[2];
const outputRoot = path.resolve(process.argv[3] ?? "work/github-audit");
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

if (!owner) {
  process.stderr.write(
    "Usage: npm run audit:github -- <owner> [output-directory]\n",
  );
  process.exit(2);
}

await mkdir(path.join(outputRoot, "repos"), { recursive: true });

const inventory = JSON.parse(
  (
    await exec(
      "gh",
      [
        "repo",
        "list",
        owner,
        "--limit",
        "500",
        "--json",
        [
          "nameWithOwner",
          "name",
          "isPrivate",
          "isFork",
          "isArchived",
          "primaryLanguage",
          "defaultBranchRef",
          "url",
          "diskUsage",
          "updatedAt",
          "visibility",
        ].join(","),
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    )
  ).stdout,
);

await writeJson(path.join(outputRoot, "inventory.json"), inventory);

const rawResults = await mapLimit(inventory, 3, auditRepository);
const derivedResults = rawResults.map(({ scan: _scan, ...result }) => result);
const publicResults = derivedResults.filter(
  (result) => result.visibility === "PUBLIC",
);

const generatedAt = new Date().toISOString();
const allDataset = buildDataset(generatedAt, owner, derivedResults);
const publicDataset = buildDataset(generatedAt, owner, publicResults);

await writeJson(path.join(outputRoot, "audit-raw.local.json"), {
  generatedAt,
  owner,
  repositories: rawResults,
});
await writeJson(
  path.join(outputRoot, "audit-derived-all.local.json"),
  allDataset,
);
await writeJson(
  path.join(outputRoot, "audit-derived-public.json"),
  publicDataset,
);

process.stdout.write(
  `Audited ${derivedResults.length} repositories: ` +
    `${allDataset.summary.filesScanned} files, ` +
    `${allDataset.summary.structuredErrors} structured errors, ` +
    `${allDataset.summary.unstructuredErrors} unstructured errors.\n`,
);
process.stdout.write(`Results: ${outputRoot}\n`);

async function auditRepository(repository) {
  const repositoryPath = path.join(outputRoot, "repos", repository.name);
  const defaultBranch = repository.defaultBranchRef?.name ?? "main";

  try {
    await cloneOrUpdate(repository.nameWithOwner, repositoryPath);
    const commit = (
      await exec("git", ["-C", repositoryPath, "rev-parse", "HEAD"])
    ).stdout.trim();
    const config = await loadConfig(repositoryPath);
    const scan = await scanProject(repositoryPath, config);
    const structured = scan.errors.filter((error) => error.structured);
    const unstructured = scan.errors.filter((error) => !error.structured);
    const structuredCodes = new Set(
      structured.map((error) => error.code).filter(Boolean),
    );
    const catalog = await readCatalogIfPresent(
      path.resolve(repositoryPath, config.catalog),
    );
    const documentedCodes = new Set(
      catalog?.errors
        .map((entry) => entry.code)
        .filter((code) => structuredCodes.has(code)) ?? [],
    );
    const statusFamilies = countBy(
      structured.filter((error) => error.status !== null),
      (error) => `${Math.floor(error.status / 100)}xx`,
    );

    process.stdout.write(
      `${repository.nameWithOwner}: ${scan.filesScanned} files, ` +
        `${structured.length} structured, ${unstructured.length} unstructured\n`,
    );

    return {
      repository: repository.nameWithOwner,
      url: repository.url,
      visibility: repository.visibility,
      primaryLanguage: repository.primaryLanguage?.name ?? null,
      defaultBranch,
      commit,
      updatedAt: repository.updatedAt,
      diskUsageKb: repository.diskUsage,
      isFork: repository.isFork,
      isArchived: repository.isArchived,
      status: "scanned",
      filesScanned: scan.filesScanned,
      structuredErrors: structured.length,
      unstructuredErrors: unstructured.length,
      structuredRate:
        scan.errors.length === 0
          ? null
          : round(structured.length / scan.errors.length),
      codeDensity:
        scan.filesScanned === 0
          ? null
          : round(scan.errors.length / scan.filesScanned),
      uniqueStructuredCodes: structuredCodes.size,
      documentedStructuredCodes: documentedCodes.size,
      documentationCoverage:
        structuredCodes.size === 0
          ? null
          : round(documentedCodes.size / structuredCodes.size),
      languages: countBy(scan.errors, (error) => error.language),
      constructors: countBy(scan.errors, (error) => error.constructor),
      statusCodes: countBy(
        structured.filter((error) => error.status !== null),
        (error) => String(error.status),
      ),
      statusFamilies,
      diagnostics: countBy(scan.diagnostics, (diagnostic) => diagnostic.ruleId),
      scan,
    };
  } catch (error) {
    const message = sanitizeError(error);
    process.stderr.write(`${repository.nameWithOwner}: ${message}\n`);
    return {
      repository: repository.nameWithOwner,
      url: repository.url,
      visibility: repository.visibility,
      primaryLanguage: repository.primaryLanguage?.name ?? null,
      defaultBranch,
      commit: null,
      updatedAt: repository.updatedAt,
      diskUsageKb: repository.diskUsage,
      isFork: repository.isFork,
      isArchived: repository.isArchived,
      status: "failed",
      error: message,
      filesScanned: 0,
      structuredErrors: 0,
      unstructuredErrors: 0,
      structuredRate: null,
      codeDensity: null,
      uniqueStructuredCodes: 0,
      documentedStructuredCodes: 0,
      documentationCoverage: null,
      languages: {},
      constructors: {},
      statusCodes: {},
      statusFamilies: {},
      diagnostics: {},
      scan: null,
    };
  }
}

async function cloneOrUpdate(nameWithOwner, target) {
  try {
    await stat(path.join(target, ".git"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await exec(
      "gh",
      [
        "repo",
        "clone",
        nameWithOwner,
        target,
        "--",
        "--depth=1",
        "--filter=blob:none",
        "--single-branch",
      ],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    return;
  }

  await exec("git", ["-C", target, "pull", "--ff-only"], {
    maxBuffer: 20 * 1024 * 1024,
  });
}

function buildDataset(generatedAt, datasetOwner, repositories) {
  return {
    schemaVersion: 2,
    generatedAt,
    owner: datasetOwner,
    tool: { name: "erroratlas", version: packageJson.version },
    summary: {
      repositories: repositories.length,
      scannedRepositories: repositories.filter(
        (repository) => repository.status === "scanned",
      ).length,
      failedRepositories: repositories.filter(
        (repository) => repository.status === "failed",
      ).length,
      filesScanned: sum(repositories, "filesScanned"),
      structuredErrors: sum(repositories, "structuredErrors"),
      unstructuredErrors: sum(repositories, "unstructuredErrors"),
      structuredRate: ratio(
        sum(repositories, "structuredErrors"),
        sum(repositories, "structuredErrors") +
          sum(repositories, "unstructuredErrors"),
      ),
      codeDensity: ratio(
        sum(repositories, "structuredErrors") +
          sum(repositories, "unstructuredErrors"),
        sum(repositories, "filesScanned"),
      ),
      uniqueStructuredCodes: sum(repositories, "uniqueStructuredCodes"),
      documentedStructuredCodes: sum(repositories, "documentedStructuredCodes"),
      documentationCoverage: ratio(
        sum(repositories, "documentedStructuredCodes"),
        sum(repositories, "uniqueStructuredCodes"),
      ),
      statusFamilies: mergeCounts(repositories, "statusFamilies"),
    },
    repositories,
  };
}

async function mapLimit(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, run),
  );
  return results;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = key(item);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sum(items, key) {
  return items.reduce((total, item) => total + item[key], 0);
}

function ratio(numerator, denominator) {
  return denominator === 0 ? null : round(numerator / denominator);
}

function mergeCounts(items, key) {
  const result = {};
  for (const item of items) {
    for (const [name, count] of Object.entries(item[key] ?? {})) {
      result[name] = (result[name] ?? 0) + count;
    }
  }
  return Object.fromEntries(
    Object.entries(result).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function round(value) {
  return Math.round(value * 10_000) / 10_000;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(outputRoot, "<audit-root>").slice(0, 500);
}

async function writeJson(filename, value) {
  await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
