# Changelog

All notable changes to this project will be documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.4.1] - 2026-06-20

### Added

- GitHub Action `openapi` input and a reproducible end-to-end catalog/OpenAPI/SARIF demo.
- CI enforcement for formatting and configured coverage thresholds.

### Changed

- Competitive positioning now documents complementary use with observability, OpenAPI diff, curated catalog, and framework Problem Details tools using primary references.

## [0.4.0] - 2026-06-20

### Added

- Bounded two-hop TypeScript/JavaScript resolution for re-exports, default imports, aliases, enum/object members, namespace imports, and factory chains.
- Migration-safe catalog schema v2 with RFC 9457 problem details and `application/problem+json` OpenAPI governance.
- Baseline files, net-new-only checks, and changed-file scanning with bounded reverse-import traversal.
- Catalog-aware source fixes with prefix policy, collision blocking, and dry-run rationale.
- Thin Express, Fastify, and Next.js runtime adapters with optional RFC 9457 responses.
- A versioned benchmark metric schema and privacy-safe local JSON query command.

### Changed

- Generated catalogs now use schema v2; schema v1 catalogs remain readable and retain authored descriptions and resolutions during regeneration.
- Unresolved thrown factory calls are reported as unstructured instead of silently omitted.

## [0.3.0] - 2026-06-20

### Added

- TypeScript/JavaScript API response extraction for Next.js, Express, and Fastify styles.
- Static literal resolution across local constants and relative named/namespace imports.
- Direct local factory-function resolution and lexical control-flow labels.
- OpenAPI/Swagger JSON and YAML comparison with missing, stale, and status-drift rules.
- Go, C#, and Kotlin language extractors.
- Optional runtime SDK with JSONL/HTTP transports, stack traces, handled state, and delivery correlation.
- `runtime-report`, `enrich`, and dry-run-first `fix` commands.

### Changed

- Error catalog occurrences now record `caught`, `rethrown`, `returned`, or `propagated` flow when known.
- Package verification covers the expanded CLI and clean consumer installation.

## [0.2.0] - 2026-06-20

### Added

- Java, Dart, and Swift AST language packs.
- Built-in Firebase `HttpsError` and Dart `FirebaseFunctionsException` profiles.
- Detection for generic exceptions with zero, one, or multiple constructor arguments.
- Message-variant catalogs for framework codes that legitimately map to several messages.
- A reproducible GitHub repository audit pipeline and privacy-safe public dataset export.

### Fixed

- Dotted constructors such as `functions.https.HttpsError` are now detected.
- Framework codes with allowed message variants no longer produce false duplicate-definition errors.
- Vitest no longer discovers tests inside isolated audit clones.

## [0.1.0] - 2026-06-20

### Added

- AST-based TypeScript, JavaScript, TSX, JSX, and Python scanning.
- Built-in profiles for common application errors, NestJS exceptions, and FastAPI `HTTPException`.
- Human-editable JSON catalogs with generated Markdown references.
- Drift rules for undocumented, stale, conflicting, changed, and unstructured errors.
- Console, JSON, Markdown, and SARIF output.
- GitHub Actions workflow and reusable composite action metadata.
