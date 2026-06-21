# Architecture

ErrorAtlas is source-first. Static detection proves what a codebase emits; normalization, policy, runtime correlation, outputs, and adapters consume that evidence without changing detection semantics.

```text
source ──► language detectors ──► normalized definitions ──► catalog
                  │                       │                    │
                  │                       └──► drift policy ◄──┤
                  │                                  ▲        │
                  └── confidence diagnostics         └── OpenAPI / RFC 9457

runtime ──► monitor ──► transport ──► correlation report
framework ──► thin adapter ──────────┘
```

## Module boundaries

- `extractors/`: AST detection and bounded static proof. It does not decide CI severity or write files.
- `scanner.ts`: file selection, incremental affected-import traversal, normalization, and detection diagnostics.
- `catalog.ts`, `openapi.ts`, `baseline.ts`: contract policy. They consume normalized records and never parse source.
- `runtime.ts`: versioned events and application-owned transports. It has no dependency on static scanning.
- `adapters/`: thin framework-shaped wrappers around the runtime monitor and optional RFC 9457 responses.
- `reporters.ts`: console, Markdown, JSON, and SARIF presentation.
- `source-fixes.ts`: conservative edit planning and application; dry-run is the default.

## Confidence rules

ErrorAtlas records a value only when it is a literal or can be reached through a deterministic chain. TypeScript/JavaScript analysis supports:

- immutable local aliases, object members, and explicitly initialized enum members;
- immutable object destructuring with static keys and no rest/default/computed binding;
- relative named, default, and namespace imports;
- opt-in project-root-confined `baseUrl`/`paths` and declared workspace package imports;
- named re-exports and `export *` chains;
- at most two cross-file edges from use site to definition;
- direct factories and at most three factory-wrapper calls;
- factory object arguments, destructured parameters, and statically proven defaults;
- `.ts`, `.tsx`, `.js`, `.jsx`, and directory `index` resolution.

Project import resolution is disabled unless `typescript.resolveProjectImports` is true. Enabled resolution accepts JSONC config, local `extends` chains up to four files, single-wildcard path rules, `baseUrl`, and root `package.json` workspaces. Configs, targets, manifests, and resolved files must remain inside the ErrorAtlas project root. Package-based tsconfig presets, multiple-wildcard rules, undeclared packages, and ambiguous matches are rejected or left unresolved.

It intentionally does not evaluate computed properties, rest destructuring, mutable object members, reassigned bindings, function execution, conditional values, template interpolation, ambiguous wildcard exports, or chains beyond those bounds. Insufficient proof becomes `null`/unstructured and produces a diagnostic. It is never promoted to a fact.

Other language packs use AST-matched constructor and response profiles. They remain syntax-directed and do not claim whole-program symbol resolution.

Incremental scanning extracts only changed files and reverse importers up to the configured hop count. The full TypeScript source set is still indexed so selected files receive the same bounded proof as a full scan. Deletions and dynamic imports may require a full scan; CI should run one periodically.

## Normalized model and ownership

The normalized definition contains code, message, status, constructor, language, flow, location, and optional RFC 9457 problem details. Source owns machine facts. The committed catalog owns human-authored `description` and `resolution`. Regeneration preserves those fields.

Every scanner-produced occurrence includes an `evidence` object. `confidence` is `proven` when a static identity was established and `partial` when only the error occurrence was proven. Ordered steps describe syntax, literal, alias/member, import/re-export, and factory proof without storing source text or literal values. JSON and catalog output retain the full structured chain; Markdown renders a compact proof line; SARIF stores confidence and steps in result properties.

Catalog schema v2 adds optional `problem` and occurrence `evidence` data. Readers accept v1 and v2, and evidence remains optional for existing v2 files. A v1 catalog is not failed for missing problem fields; the next `generate` migrates it to v2 while preserving authored text.

## Policy and mutation

Catalog comparison detects source drift. OpenAPI comparison extracts proven codes and problem-detail fields from 4xx/5xx responses, local `$ref` targets, examples, enums, constants, and defaults.

Baselines store diagnostic fingerprints without source text. Matching is count-aware and line-independent; a second identical violation is still new.

`fix` edits only explicit TypeScript/JavaScript API response objects. It first reuses a unique catalog identity, then applies an optional namespace to a deterministic message-derived code. Catalog or intra-plan collisions are blocked. Exception classes, control flow, and imports are never rewritten.

## Runtime and privacy

Runtime collection is opt-in. JSONL remains local; HTTP transport uses only a caller-provided endpoint. Adapters capture exceptions and correlate deliveries, but do not provide storage, dashboards, alerting, tracing, or symbolication.

Benchmark publication accepts derived public-repository aggregates only. External targets are explicitly allow-listed, pinned to full commits, and tied to a recorded SPDX identifier plus a SHA-256 hash of the license file. The hash proves that reproduction used the reviewed license artifact; it does not perform legal license interpretation. The generator scans temporary checkouts, then discards them. Published data excludes source, paths, messages, identities, raw findings, stack traces, and private metadata. JSON Schema, forbidden-field checks, and independently recomputed totals run in CI.
