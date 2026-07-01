import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import fg from "fast-glob";
import { format } from "prettier";
import {
  loadConfig,
  readCatalogIfPresent,
  scanProject,
} from "../dist/index.js";
import {
  buildBenchmarkDataset,
  buildBenchmarkDatasetV4,
  buildBenchmarkSummaryArtifact,
  renderBenchmarkMarkdown,
  repositoryMetrics,
  repositoryMetricsV4,
} from "./lib/benchmark-dataset.mjs";
import {
  assertPrivacySafe,
  assertSummaryConsistent,
} from "./lib/benchmark-validation.mjs";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const manifestName =
  valueAfter("--manifest") ?? "data/benchmark-manifest-v2.json";
const outputName = valueAfter("--output") ?? defaultOutputName(manifestName);
const markdownName = valueAfter("--markdown") ?? "docs/benchmark.md";
const summaryName =
  valueAfter("--summary") ?? "data/external-benchmark-summary-v1.json";
const printLicenseHashes = args.includes("--print-license-hashes");
const continueOnError = args.includes("--continue-on-error");
const root = path.resolve(".");
const manifest = JSON.parse(await readFile(path.resolve(manifestName), "utf8"));
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
);
validateManifest(manifest);

const workspace = await mkdtemp(
  path.join(tmpdir(), "erroratlas-external-benchmark-"),
);
try {
  const repositories = [];
  for (const target of manifest.repositories) {
    try {
      const row =
        manifest.manifestVersion === 1
          ? await scanV1Target(target)
          : await scanV2Target(target);
      if (row) repositories.push(row);
    } catch (error) {
      if (!continueOnError) throw error;
      repositories.push(failureRow(target, error));
      process.stderr.write(
        `${targetName(target)}: failed (${safeFailureCategory(error)})\n`,
      );
    }
  }

  if (!printLicenseHashes) {
    const dataset =
      manifest.manifestVersion === 1
        ? buildBenchmarkDataset({
            manifest,
            toolVersion: packageJson.version,
            repositories,
          })
        : buildBenchmarkDatasetV4({
            manifest,
            toolVersion: packageJson.version,
            repositories,
          });
    assertPrivacySafe(dataset);
    assertSummaryConsistent(dataset);
    await writeFile(
      path.resolve(outputName),
      `${JSON.stringify(dataset, null, 2)}\n`,
    );
    if (dataset.schemaVersion === 4) {
      const summary = buildBenchmarkSummaryArtifact(
        dataset,
        path.relative(root, path.resolve(outputName)),
      );
      assertPrivacySafe(summary);
      await writeFile(
        path.resolve(summaryName),
        `${JSON.stringify(summary, null, 2)}\n`,
      );
    }
    await writeFile(
      path.resolve(markdownName),
      await format(renderBenchmarkMarkdown(dataset), { parser: "markdown" }),
    );
    process.stdout.write(`Wrote ${outputName} and ${markdownName}.\n`);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}

async function scanV1Target(target) {
  const repositoryRoot = path.join(workspace, safeName(target.repository));
  await checkoutPinned(target, repositoryRoot);
  const licenseBytes = await readFile(
    path.join(repositoryRoot, target.license.filename),
  );
  const sha256 = createHash("sha256").update(licenseBytes).digest("hex");
  if (printLicenseHashes) {
    process.stdout.write(
      `${target.repository} ${target.license.filename} ${sha256}\n`,
    );
    return null;
  }
  if (sha256 !== target.license.sha256) {
    throw typedError(
      "license-mismatch",
      `License hash mismatch for ${target.repository}: expected ${target.license.sha256}, received ${sha256}.`,
    );
  }
  const config = await loadConfig(repositoryRoot);
  config.include = target.include;
  const scan = await scanProject(repositoryRoot, config);
  const catalog = await readCatalogIfPresent(
    path.join(repositoryRoot, config.catalog),
  );
  process.stdout.write(
    `${target.repository}: ${scan.filesScanned} files, ${scan.errors.length} occurrences\n`,
  );
  return {
    repository: target.repository,
    url: target.url,
    commit: target.commit,
    category: target.category,
    scannedAt: manifest.generatedAt,
    licenseEvidence: {
      spdxId: target.license.spdxId,
      url: `${target.url}/blob/${target.commit}/${target.license.filename}`,
      sha256,
    },
    metrics: repositoryMetrics(scan, catalog),
  };
}

async function scanV2Target(target) {
  validateTargetPolicy(target);
  const repositoryRoot = path.join(
    workspace,
    safeName(`${target.owner}/${target.repo}`),
  );
  await checkoutPinned(target, repositoryRoot);
  const licenseBytes = await readFile(
    path.join(repositoryRoot, target.license.licenseFile),
  );
  const sha256 = createHash("sha256").update(licenseBytes).digest("hex");
  if (printLicenseHashes) {
    process.stdout.write(
      `${target.owner}/${target.repo} ${target.license.licenseFile} ${sha256}\n`,
    );
    return null;
  }
  if (sha256 !== target.license.sha256) {
    throw typedError(
      "license-mismatch",
      `License hash mismatch for ${target.owner}/${target.repo}.`,
    );
  }

  const sourceIncludes = target.scanProfile.sourceIncludes;
  const sourceExcludes = target.scanProfile.sourceExcludes;
  const sourceFilesByLanguage = await countSourceFiles(
    repositoryRoot,
    sourceIncludes,
    sourceExcludes,
  );
  const openapiDocumentCount = await countMatchedFiles(
    repositoryRoot,
    target.scanProfile.openapiIncludes,
    [],
  );

  const started = Date.now();
  const scan = sourceIncludes.length
    ? await scanConfiguredSource(repositoryRoot, sourceIncludes, sourceExcludes)
    : { root: repositoryRoot, filesScanned: 0, errors: [], diagnostics: [] };
  const scanDurationMs = Date.now() - started;
  const catalog = sourceIncludes.length
    ? await readCatalogIfPresent(
        path.join(repositoryRoot, (await loadConfig(repositoryRoot)).catalog),
      )
    : null;
  const metrics = repositoryMetricsV4({
    scan,
    catalog,
    ecosystem: target.ecosystem,
    filesByLanguage: sourceFilesByLanguage,
    openapiDocumentCount,
    scanDurationMs,
  });
  process.stdout.write(
    `${target.owner}/${target.repo}: ${scan.filesScanned} files, ${scan.errors.length} occurrences\n`,
  );
  return {
    id: target.id,
    name: target.name,
    owner: target.owner,
    repo: target.repo,
    url: target.url,
    host: target.host,
    commit: target.commit,
    defaultBranch: target.defaultBranch,
    ecosystem: target.ecosystem,
    primaryLanguage: target.primaryLanguage,
    category: target.category,
    framework: target.framework,
    reason: target.reason,
    expectedLimitations: target.expectedLimitations,
    archived: target.archived,
    scannedAt: manifest.generatedAt,
    status: "scanned",
    licenseEvidence: {
      spdxId: target.license.spdxId,
      name: target.license.name,
      licenseFile: target.license.licenseFile,
      metadataSource: target.license.metadataSource,
      url: `${target.url}/blob/${target.commit}/${target.license.licenseFile}`,
      sha256,
    },
    metrics,
  };
}

async function scanConfiguredSource(repositoryRoot, include, exclude) {
  const config = await loadConfig(repositoryRoot);
  config.include = include;
  config.exclude = [...config.exclude, ...exclude];
  return scanProject(repositoryRoot, config);
}

async function countSourceFiles(repositoryRoot, include, exclude) {
  const files = await matchedFiles(repositoryRoot, include, exclude);
  const counts = {};
  for (const file of files) {
    const language = languageFromFilename(file);
    if (!language) continue;
    counts[language] = (counts[language] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  );
}

async function countMatchedFiles(repositoryRoot, include, exclude) {
  return (await matchedFiles(repositoryRoot, include, exclude)).length;
}

async function matchedFiles(repositoryRoot, include, exclude) {
  if (!include.length) return [];
  return fg(include, {
    cwd: repositoryRoot,
    ignore: exclude,
    onlyFiles: true,
    unique: true,
    dot: false,
    followSymbolicLinks: false,
  });
}

async function checkoutPinned(target, destination) {
  await exec("git", ["init", "--quiet", destination]);
  await exec("git", ["-C", destination, "remote", "add", "origin", target.url]);
  await exec(
    "git",
    [
      "-C",
      destination,
      "fetch",
      "--quiet",
      "--depth=1",
      "origin",
      target.commit,
    ],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  await exec("git", [
    "-C",
    destination,
    "checkout",
    "--quiet",
    "--detach",
    "FETCH_HEAD",
  ]);
  const actual = (
    await exec("git", ["-C", destination, "rev-parse", "HEAD"])
  ).stdout.trim();
  if (actual !== target.commit) {
    throw typedError(
      "commit-mismatch",
      `Commit mismatch for ${targetName(target)}.`,
    );
  }
}

function validateManifest(value) {
  if (
    ![1, 2].includes(value.manifestVersion) ||
    !Array.isArray(value.repositories)
  ) {
    throw new Error("Unsupported or empty benchmark allowlist manifest.");
  }
  const repositories = new Set();
  for (const target of value.repositories) {
    const name = targetName(target);
    if (repositories.has(name)) throw new Error(`Duplicate target: ${name}`);
    repositories.add(name);
    if (!/^[a-f0-9]{40}$/.test(target.commit))
      throw new Error(`Invalid commit: ${name}`);
    if (!target.url.startsWith("https://github.com/"))
      throw new Error(`Invalid URL: ${name}`);
    if (value.manifestVersion === 1) {
      if (!Array.isArray(target.include) || !target.include.length)
        throw new Error(`Missing include rules: ${name}`);
      continue;
    }
    validateTargetPolicy(target);
  }
}

function validateTargetPolicy(target) {
  if (target.host !== "github.com")
    throw new Error(`Unsupported host: ${targetName(target)}`);
  if (target.archived)
    throw new Error(`Archived target is not allowed: ${targetName(target)}`);
  if (!manifest.policy.allowedLicenses.includes(target.license.spdxId)) {
    throw new Error(
      `License is not allowed for ${targetName(target)}: ${target.license.spdxId}`,
    );
  }
  const profile = target.scanProfile;
  if (!profile.sourceIncludes.length && !profile.openapiIncludes.length) {
    throw new Error(`Missing scan profile: ${targetName(target)}`);
  }
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

function safeName(repository) {
  return repository.replaceAll("/", "--");
}

function targetName(target) {
  return target.repository ?? `${target.owner}/${target.repo}`;
}

function defaultOutputName(manifestName) {
  return manifestName.endsWith("benchmark-allowlist.json")
    ? "data/external-benchmark-v3.json"
    : "data/external-benchmark-v4.json";
}

function languageFromFilename(filename) {
  if (/\.[jt]sx?$/.test(filename)) {
    return filename.endsWith(".js") || filename.endsWith(".jsx")
      ? "javascript"
      : "typescript";
  }
  if (filename.endsWith(".py")) return "python";
  if (filename.endsWith(".java")) return "java";
  if (filename.endsWith(".go")) return "go";
  if (filename.endsWith(".cs")) return "csharp";
  if (filename.endsWith(".kt") || filename.endsWith(".kts")) return "kotlin";
  if (filename.endsWith(".dart")) return "dart";
  if (filename.endsWith(".swift")) return "swift";
  return null;
}

function failureRow(target, error) {
  if (manifest.manifestVersion === 1) throw error;
  const metrics = repositoryMetricsV4({
    scan: { root: "", filesScanned: 0, errors: [], diagnostics: [] },
    catalog: null,
    ecosystem: target.ecosystem,
    filesByLanguage: {},
    openapiDocumentCount: 0,
    scanDurationMs: 0,
  });
  return {
    id: target.id,
    name: target.name,
    owner: target.owner,
    repo: target.repo,
    url: target.url,
    host: target.host,
    commit: target.commit,
    defaultBranch: target.defaultBranch,
    ecosystem: target.ecosystem,
    primaryLanguage: target.primaryLanguage,
    category: target.category,
    framework: target.framework,
    reason: target.reason,
    expectedLimitations: target.expectedLimitations,
    archived: target.archived,
    scannedAt: manifest.generatedAt,
    status: "failed",
    failureCategory: safeFailureCategory(error),
    licenseEvidence: {
      spdxId: target.license.spdxId,
      name: target.license.name,
      licenseFile: target.license.licenseFile,
      metadataSource: target.license.metadataSource,
      url: `${target.url}/blob/${target.commit}/${target.license.licenseFile}`,
      sha256: target.license.sha256,
    },
    metrics,
  };
}

function typedError(category, message) {
  const error = new Error(message);
  error.category = category;
  return error;
}

function safeFailureCategory(error) {
  return [
    "checkout-failed",
    "commit-mismatch",
    "license-mismatch",
    "scan-failed",
    "unsupported-profile",
  ].includes(error?.category)
    ? error.category
    : "scan-failed";
}
