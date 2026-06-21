# Website-ready homepage copy

> Draft launch material. Not published; review benchmark numbers and release links after 0.6.0 is released.

## Hero

**Your error contract starts in source. Keep everything else honest.**

ErrorAtlas proves which application errors exist, preserves the documentation humans wrote, and catches drift across source, catalogs, OpenAPI/RFC 9457, and optional runtime events.

Primary CTA: **Run the demo**

Secondary CTA: **See how proof works**

Trust line: Local-first · nine language packs · dry-run-first fixes · no guessed dynamic identities

## The problem

Success responses usually have a schema. Application errors often have a stale table, scattered exception classes, and OpenAPI examples that stopped matching months ago. Runtime monitoring tells you what happened in production; it cannot prove that an unobserved branch does not exist.

## The ErrorAtlas loop

1. **Prove from source.** AST detectors extract only literals and bounded deterministic chains. Unresolved values remain partial.
2. **Preserve human context.** Catalog regeneration keeps authored descriptions and resolutions intact.
3. **Govern drift.** CI compares source with the catalog and OpenAPI/Problem Details, with baseline mode for existing debt.
4. **Explain the finding.** JSON, Markdown, and SARIF expose a privacy-safe proof chain without embedding source or literal values.

## Why teams can trust it

- File-based fixtures cover TypeScript/JavaScript, Python, Java, Dart, Swift, Go, C#, and Kotlin.
- Cross-file analysis is deliberately bounded; insufficient proof becomes a diagnostic, never a fabricated fact.
- The benchmark pipeline uses allow-listed public repositories pinned to commits, verifies license hashes, and publishes aggregates only.
- Source mutation is opt-in and dry-run-first; human catalog prose is never overwritten.

## What it is not

ErrorAtlas is not hosted observability, not a framework replacement, and not a spec-to-spec OpenAPI diff engine. Use those tools for production operations, response rendering, and API revision comparison. Use ErrorAtlas to keep implementation and the error contract aligned before merge.

## Closing CTA

**Turn the error table into an executable contract.**

`npm install --save-dev erroratlas`
