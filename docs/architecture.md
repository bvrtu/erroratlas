# Architecture

ErrorAtlas separates detection, policy, and presentation so each can evolve independently.

```text
source files
    │
    ▼
AST language extractors ──► normalized error definitions
                                │
                                ├──► catalog generator ──► JSON + Markdown
                                │
committed catalog ──────────────┴──► drift analyzer ─────► console/JSON/SARIF
```

## Detection

The TypeScript and Python extractors use tree-sitter grammars through ast-grep. AST matching identifies thrown constructor calls; literal parsing is then limited to the matched argument nodes. This avoids false matches in comments, strings, snapshots, and unrelated objects.

Only values statically visible at the throw site are included in the catalog. A dynamic expression becomes `null` and produces an `unstructured-error` finding instead of a guessed value.

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
  "location": {
    "file": "src/users.ts",
    "line": 42,
    "column": 11,
    "endLine": 42,
    "endColumn": 86
  }
}
```

Descriptions and resolutions are not inferred from code. They are human-authored fields stored in the committed catalog and preserved across regeneration.

## Drift policy

The source code is authoritative for the code, static message, status, and occurrences. The catalog is authoritative for description and resolution. `erroratlas check` compares the two representations without modifying either.

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
