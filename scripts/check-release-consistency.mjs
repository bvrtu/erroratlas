import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const packageJson = await readJson("package.json");
const packageLock = await readJson("package-lock.json");
const version = packageJson.version;

assert(
  typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version),
  "package.json must contain a stable semantic version",
);
assert(
  packageLock.version === version,
  "package-lock.json version must match package.json",
);
assert(
  packageLock.packages?.[""]?.version === version,
  "package-lock.json root package version must match package.json",
);

await requireText(
  "CHANGELOG.md",
  new RegExp(`^## \\[${escapeRegex(version)}\\] - \\d{4}-\\d{2}-\\d{2}$`, "m"),
  `a dated ${version} changelog section`,
);
await requireText(
  "README.md",
  `bvrtu/erroratlas@v${version}`,
  `the current Action tag v${version}`,
);
await requireText(
  "docs/adoption.md",
  `bvrtu/erroratlas@v${version}`,
  `the current Action tag v${version}`,
);
await requireText(
  ".github/ISSUE_TEMPLATE/bug.yml",
  `placeholder: ${version}`,
  `the current bug-report version ${version}`,
);

const releaseAudit = `docs/release-audit-${version}.md`;
await access(path.join(root, releaseAudit));

const demoCatalog = await readJson("examples/demo/erroratlas.catalog.json");
assert(demoCatalog.schemaVersion === 2, "demo catalog must use schema v2");
assert(
  Array.isArray(demoCatalog.errors) && demoCatalog.errors.length > 0,
  "demo catalog must contain generated errors",
);
for (const entry of demoCatalog.errors) {
  assert(
    Array.isArray(entry.occurrences) && entry.occurrences.length > 0,
    `demo catalog entry ${entry.code} must have occurrences`,
  );
  for (const occurrence of entry.occurrences) {
    assert(
      ["proven", "partial"].includes(occurrence.evidence?.confidence) &&
        Array.isArray(occurrence.evidence?.steps) &&
        occurrence.evidence.steps.length > 0,
      `demo occurrence ${entry.code} must expose evidence`,
    );
  }
}

const externalBenchmark = await readJson("data/external-benchmark-v3.json");
assert(
  externalBenchmark.tool?.version === version,
  "external benchmark tool version must match package.json",
);
await requireText(
  "docs/benchmark.md",
  `ErrorAtlas **${version}**`,
  `the benchmark generator version ${version}`,
);

const fixtureExtensions = new Set(
  (await filesUnder("tests/fixtures/corpus/src")).map((filename) =>
    path.extname(filename),
  ),
);
for (const extension of [
  ".ts",
  ".js",
  ".py",
  ".java",
  ".dart",
  ".swift",
  ".go",
  ".cs",
  ".kt",
]) {
  assert(
    fixtureExtensions.has(extension),
    `file-based fixture corpus must contain ${extension}`,
  );
}

const fixtureManifest = await readJson("tests/fixtures/corpus/manifest.json");
const fixtureLanguages = new Set(
  fixtureManifest.profiles?.map((profile) => profile.language),
);
for (const language of [
  "typescript",
  "javascript",
  "python",
  "java",
  "dart",
  "swift",
  "go",
  "csharp",
  "kotlin",
]) {
  assert(
    fixtureLanguages.has(language),
    `file-based fixture corpus must label ${language}`,
  );
}

for (const required of [
  "data/benchmark-allowlist.json",
  "data/external-benchmark-v3.json",
  "docs/benchmark.md",
  "docs/launch/homepage-copy.md",
  "docs/launch/release-notes-next.md",
]) {
  await access(path.join(root, required));
}

process.stdout.write(
  `Release consistency passed for ErrorAtlas ${version}: metadata, docs, demo evidence, and nine language surfaces agree.\n`,
);

async function readJson(filename) {
  return JSON.parse(await readFile(path.join(root, filename), "utf8"));
}

async function requireText(filename, expected, description) {
  const value = await readFile(path.join(root, filename), "utf8");
  const found =
    typeof expected === "string"
      ? value.includes(expected)
      : expected.test(value);
  assert(found, `${filename} must contain ${description}`);
}

async function filesUnder(relativeDirectory) {
  const { readdir } = await import("node:fs/promises");
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile()) files.push(filename);
    }
  }
  await visit(path.join(root, relativeDirectory));
  return files;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Release consistency: ${message}.`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
