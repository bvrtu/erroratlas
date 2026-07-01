# Social launch drafts

> Draft launch material. Do not post until 0.6.0 is published and every release link is verified.

## LinkedIn post

I built ErrorAtlas because API documentation is usually strongest on the happy path—and weakest exactly where users need help: application errors.

ErrorAtlas is an open-source, source-first error-contract governance tool. It scans nine language packs, proves static error identities, preserves human-written catalog documentation, and reports drift against OpenAPI/RFC 9457 in CI.

The design constraint I care about most: if a dynamic value cannot be proven through a bounded chain, ErrorAtlas does not guess. The finding stays partial and includes a privacy-safe proof trail.

The repository now includes a file-based cross-language fixture corpus, Markdown/SARIF evidence, release consistency gates, and a reproducible aggregate benchmark over six public repositories with pinned commits and recorded license provenance. That benchmark found 23 error occurrences and zero proven structured identities under the default profiles—a useful, honest picture of the tool's current boundary rather than a flattering synthetic score.

It is not Sentry, not an exception framework, and not another OpenAPI diff tool. It is the layer that asks whether source, the human error catalog, and the API contract still agree.

Repository: https://github.com/bvrtu/erroratlas

#opensource #developerexperience #staticanalysis #typescript #python #api

## Short thread

1. Error contracts drift because their source of truth is split across code, docs, and OpenAPI. I built ErrorAtlas to start from the only place that can prove implementation facts: source.
2. It extracts conservatively. Literals, immutable aliases, bounded imports/re-exports, and bounded factories can become facts. Dynamic or ambiguous values stay partial—no optimistic guessing.
3. Human prose remains human-owned. Regenerating the catalog never overwrites descriptions or resolutions.
4. CI can catch source/catalog/OpenAPI/RFC 9457 drift, baseline existing debt, and show proof steps in Markdown or SARIF.
5. The new benchmark snapshot is intentionally aggregate-only and reproducible: six allow-listed repos, full commit pins, license hashes, JSON Schema, privacy denial rules. Current result: 261 files, 23 partial occurrences, zero proven identities.
6. That last number is not hidden. It is a product signal: expand profiles only when fixtures can preserve precision. https://github.com/bvrtu/erroratlas
