# ErrorAtlas 0.6.0 release-candidate audit

> Candidate audit written before publication. After `v0.6.0` is released, treat the GitHub Release and npm registry entry as the canonical publication record.

## Candidate scope

- Add a reviewable file fixture corpus across all nine advertised language surfaces, including positive, dynamic, noise, conflict, bounded import/factory, API response, and RFC 9457 cases.
- Carry categorical proof evidence into generated Markdown and SARIF diagnostic properties.
- Stop proven `2xx` and `3xx` responses from becoming errors solely because their payload contains a `code` field.
- Make `verify` and `prepack` enforce the same format, type, release consistency, benchmark privacy/schema, coverage, build, CLI, demo, and package checks.
- Add benchmark schema v3, a pinned allowlist, license provenance, aggregate-only external data, and a generated human summary.

## Compatibility and migration

This candidate is backward-compatible. Catalog schemas v1 and v2 remain readable, existing configuration defaults and CLI exit codes are unchanged, and SARIF evidence is additive under result properties. Benchmark v3 is additive; the query command continues to read v1 and v2 datasets.

No catalog or configuration migration is required.

## Privacy and provenance

The external snapshot contains repository URLs, full commits, categories, scan timestamps, recorded SPDX identifiers, license-file SHA-256 hashes, and aggregate counts only. JSON Schema rejects unknown fields; a separate recursive validator rejects source, paths, messages, identities, raw findings, stack traces, private metadata, and secret-bearing fields. Summary totals and allowlist coordinates are recomputed and compared in CI.

The license hash proves that reproduction used the reviewed license file. ErrorAtlas does not provide legal license interpretation.

## Exact limitations

- TypeScript/JavaScript has the deepest bounded cross-file proof; other packs remain syntax-directed.
- The external snapshot is an initial detector-boundary dataset, not an industry benchmark or repository-quality ranking.
- OpenAPI, catalog, and baseline metrics remain `null` when those artifacts are not evaluated; no result is imputed.
- Runtime adapters remain correlation helpers, not hosted observability.
- Whole-program control flow, hosted dashboards, new language packs, broad runtime changes, and speculative enrichment are out of scope.

## Why 0.6.0

The change is minor because it adds backward-compatible, user-visible proof output and a new benchmark data product while fixing detection noise. It does not remove or reinterpret existing catalog fields or CLI behavior.

## Release state

At candidate freeze, the PR was ready to merge after CI and maintainer review. Publishing to npm, creating `v0.6.0`, and creating a GitHub Release were intentionally deferred until post-merge verification.
