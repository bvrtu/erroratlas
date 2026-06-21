import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { format } from "prettier";
import {
  loadConfig,
  readCatalogIfPresent,
  scanProject,
} from "../dist/index.js";
import {
  buildBenchmarkDataset,
  renderBenchmarkMarkdown,
  repositoryMetrics,
} from "./lib/benchmark-dataset.mjs";
import {
  assertPrivacySafe,
  assertSummaryConsistent,
} from "./lib/benchmark-validation.mjs";

const exec = promisify(execFile);
const args = process.argv.slice(2);
const manifestName =
  valueAfter("--manifest") ?? "data/benchmark-allowlist.json";
const outputName = valueAfter("--output") ?? "data/external-benchmark-v3.json";
const markdownName = valueAfter("--markdown") ?? "docs/benchmark.md";
const printLicenseHashes = args.includes("--print-license-hashes");
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
      continue;
    }
    if (sha256 !== target.license.sha256) {
      throw new Error(
        `License hash mismatch for ${target.repository}: expected ${target.license.sha256}, received ${sha256}.`,
      );
    }
    const config = await loadConfig(repositoryRoot);
    config.include = target.include;
    const scan = await scanProject(repositoryRoot, config);
    const catalog = await readCatalogIfPresent(
      path.join(repositoryRoot, config.catalog),
    );
    repositories.push({
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
    });
    process.stdout.write(
      `${target.repository}: ${scan.filesScanned} files, ${scan.errors.length} occurrences\n`,
    );
  }

  if (!printLicenseHashes) {
    const dataset = buildBenchmarkDataset({
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
    await writeFile(
      path.resolve(markdownName),
      await format(renderBenchmarkMarkdown(dataset), { parser: "markdown" }),
    );
    process.stdout.write(`Wrote ${outputName} and ${markdownName}.\n`);
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
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
    throw new Error(`Commit mismatch for ${target.repository}.`);
  }
}

function validateManifest(value) {
  if (
    value.manifestVersion !== 1 ||
    !Array.isArray(value.repositories) ||
    !value.repositories.length
  ) {
    throw new Error("Unsupported or empty benchmark allowlist manifest.");
  }
  const repositories = new Set();
  for (const target of value.repositories) {
    if (repositories.has(target.repository))
      throw new Error(`Duplicate target: ${target.repository}`);
    repositories.add(target.repository);
    if (!/^[a-f0-9]{40}$/.test(target.commit))
      throw new Error(`Invalid commit: ${target.repository}`);
    if (!target.url.startsWith("https://github.com/"))
      throw new Error(`Invalid URL: ${target.repository}`);
    if (!Array.isArray(target.include) || !target.include.length)
      throw new Error(`Missing include rules: ${target.repository}`);
  }
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
}

function safeName(repository) {
  return repository.replaceAll("/", "--");
}
