# Architecture

ErrorAtlas separates static detection, contract policy, runtime collection, and presentation so each can evolve independently.

```text
source files ──► AST extractors ──► normalized error definitions
                                          │
                                          ├──► catalog ──► JSON + Markdown
committed catalog ─────────────────────────┤
OpenAPI / Swagger ──► contract extractor ──┴──► drift policy ──► console/JSON/SARIF

application runtime ──► runtime monitor ──► JSONL or explicit HTTP transport
                                                   │
                                                   └──► delivery correlation report
```

## Detection

All language extractors use tree-sitter grammars through ast-grep. AST matching identifies thrown/returned constructors and supported response calls; literal parsing is then limited to matched argument or object nodes. This avoids false matches in comments, strings, snapshots, and unrelated objects.

TypeScript/JavaScript builds a bounded symbol index for immutable literals in the current file and relative imports. It also resolves direct local factory wrappers. Values outside those deterministic boundaries become `null` and produce an `unstructured-error` finding instead of a guess.

## Normalized model

Every detection becomes the same language-independent record:

```json
{
  "code": "USER_NOT_FOUND",
  "message": "The requested user was not found",
  "status": 404,
  "constructor": "AppError",
  "language": "typescript",
  "structured": true,
  "flow": "propagated",
  "location": {
    "file": "src/users.ts",
    "line": 42,
    "column": 11,
    "endLine": 42,
    "endColumn": 86
  }
}
```

Descriptions and resolutions are human-editable fields stored in the committed catalog and preserved across regeneration. `erroratlas enrich` can fill empty fields with deterministic, status-aware suggestions but never replaces authored text.

## Drift policy

The source code is authoritative for the code, static message, status, and occurrences. The catalog is authoritative for description and resolution. `erroratlas check` compares the two representations without modifying either.

When configured, OpenAPI is a third contract surface. ErrorAtlas extracts static codes from 4xx/5xx response examples, enums, constants, and defaults (including local `$ref` targets), then detects source codes absent from OpenAPI, stale OpenAPI codes, and HTTP status drift.

## Runtime model

The optional runtime SDK emits versioned `exception` and `delivery` events. Exception events contain service/environment, error name/message/stack, code/status when present, handled state, mechanism, tags, and an optional trace ID. Delivery events use the same trace ID to state that an error reached an HTTP, UI, queue, or custom boundary.

Transports are application-owned. JSONL is local by default; HTTP requires an explicit endpoint. Transport failures are swallowed after invoking an optional error callback so monitoring cannot take down the monitored application. Error messages and stacks can contain sensitive data, so production users should control retention, redaction, and endpoint access.

The runtime layer does not yet provide hosted storage, alerting, symbolication, or distributed tracing. Its event schema and transport interface are designed so those can be added without coupling them to the static analyzer.

## Safe mutation

`erroratlas fix` is dry-run-first. The initial fixer only adds a generated `code` property to explicit TypeScript/JavaScript API error response objects with static messages. It does not replace exception classes, insert imports, or rewrite control flow. `erroratlas enrich --write` changes only empty catalog documentation fields.

## Benchmark dataset

The planned Error Contract Benchmark will publish derived, source-free measurements from opt-in and permissively licensed repositories. It will not redistribute source code or private error text.

Proposed row-level schema:

| Field                    | Type      | Description                                                |
| ------------------------ | --------- | ---------------------------------------------------------- |
| `repository`             | string    | Public repository URL.                                     |
| `commit`                 | string    | Audited commit SHA.                                        |
| `scanned_at`             | timestamp | Scan time in UTC.                                          |
| `language`               | enum      | Language extractor used.                                   |
| `files_scanned`          | integer   | Number of eligible source files.                           |
| `structured_errors`      | integer   | Errors with static machine-readable codes.                 |
| `unstructured_errors`    | integer   | Thrown errors without static codes.                        |
| `documented_errors`      | integer   | Codes present in the repository catalog.                   |
| `conflicting_codes`      | integer   | Codes with inconsistent definitions.                       |
| `documentation_coverage` | number    | Documented structured errors divided by structured errors. |
| `license_spdx`           | string    | Repository license at scan time.                           |

The first API can remain a static, versioned JSON/Parquet release with a tiny read-only HTTP layer. This keeps the dataset reproducible before adding infrastructure.
