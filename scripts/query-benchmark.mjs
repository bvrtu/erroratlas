import { readFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const repositoryIndex = args.indexOf("--repository");
const repository = repositoryIndex >= 0 ? args[repositoryIndex + 1] : null;
const positional = args.filter(
  (argument, index) =>
    !argument.startsWith("--") && index !== repositoryIndex + 1,
);
const filename = path.resolve(
  positional[0] ?? "data/bvrtu-public-repo-audit.json",
);
const dataset = JSON.parse(await readFile(filename, "utf8"));

if (
  ![1, 2].includes(dataset.schemaVersion) ||
  !Array.isArray(dataset.repositories)
) {
  throw new Error(
    `${filename} is not a supported ErrorAtlas benchmark dataset.`,
  );
}

const rows = repository
  ? dataset.repositories.filter((row) => row.repository === repository)
  : dataset.repositories;
if (repository && rows.length === 0) {
  throw new Error(`Repository not found in benchmark: ${repository}`);
}

const filesScanned = sum(rows, "filesScanned");
const structuredErrors = sum(rows, "structuredErrors");
const unstructuredErrors = sum(rows, "unstructuredErrors");
const totalErrors = structuredErrors + unstructuredErrors;
const uniqueStructuredCodes = sum(rows, "uniqueStructuredCodes");
const documentedStructuredCodes = sum(rows, "documentedStructuredCodes");
const statusFamilies = mergeCounts(rows, "statusFamilies", "statusCodes");

const result = {
  dataset: {
    schemaVersion: dataset.schemaVersion,
    generatedAt: dataset.generatedAt,
    tool: dataset.tool,
    license: dataset.license,
    privacy: dataset.privacy,
  },
  query: repository ? { repository } : { scope: "all repositories" },
  metrics: {
    repositories: rows.length,
    filesScanned,
    structuredErrors,
    unstructuredErrors,
    structuredRatio: ratio(structuredErrors, totalErrors),
    unstructuredRatio: ratio(unstructuredErrors, totalErrors),
    codeDensity: ratio(totalErrors, filesScanned),
    documentationCoverage: ratio(
      documentedStructuredCodes,
      uniqueStructuredCodes,
    ),
    statusFamilies,
  },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] ?? 0), 0);
}

function ratio(numerator, denominator) {
  return denominator
    ? Math.round((numerator / denominator) * 10_000) / 10_000
    : null;
}

function mergeCounts(items, preferredKey, fallbackKey) {
  const counts = {};
  for (const item of items) {
    if (item[preferredKey]) {
      for (const [family, count] of Object.entries(item[preferredKey])) {
        counts[family] = (counts[family] ?? 0) + count;
      }
      continue;
    }
    for (const [status, count] of Object.entries(item[fallbackKey] ?? {})) {
      const family = /^\d{3}$/.test(status)
        ? `${Math.floor(Number(status) / 100)}xx`
        : "unknown";
      counts[family] = (counts[family] ?? 0) + count;
    }
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}
