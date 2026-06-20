# Positioning

ErrorAtlas governs error contracts from the place they originate: source code. Its differentiator is deterministic extraction plus reconciliation across source, a human-maintained catalog, OpenAPI/RFC 9457, and optional runtime evidence.

| Category                    | What it does well                                               | How ErrorAtlas differs                                                                                                                       |
| --------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Curated error catalogs      | Provides a deliberate taxonomy and good prose                   | ErrorAtlas discovers proven emitted errors and detects when the curated catalog no longer matches source. Human prose remains catalog-owned. |
| Framework problem libraries | Produces consistent RFC 9457 responses inside one framework     | ErrorAtlas is framework-neutral governance. Adapters are thin adoption helpers, not replacement exception frameworks.                        |
| OpenAPI diff tools          | Detects API document changes between revisions                  | ErrorAtlas compares documented error identities and problem details with source evidence, not only document-to-document structure.           |
| Runtime monitoring          | Captures production exceptions, stacks, and operational signals | ErrorAtlas begins before deployment and can correlate runtime events back to source contracts. It is not a hosted observability backend.     |
| Broad static analyzers      | Finds many classes of code defects                              | ErrorAtlas focuses narrowly on error identity, payload, status, documentation, and drift with conservative confidence rules.                 |

The hard center is deliberately small: prove error-contract facts from source with low false positives. Catalog generation, OpenAPI checks, RFC 9457 alignment, runtime events, adapters, and benchmark metrics exist to make that source evidence useful—not to dilute it into a generic platform.

## Why ErrorAtlas exists

For maintainers, it turns a stale error table into an enforceable contract. For adopters, it offers a baseline path that does not demand paying down every legacy warning before CI becomes useful. For recruiters and engineering leaders, the project demonstrates AST analysis, schema evolution, policy design, safe mutation, multi-platform packaging, and privacy-aware data engineering in one focused tool.
