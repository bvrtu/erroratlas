# Interview talking points

> Draft launch material. Validate examples against the final 0.6.0 commit before external use.

## Thirty-second explanation

ErrorAtlas is a source-first governance tool for application error contracts. It statically proves error identities and payload facts, preserves a human-maintained catalog, and checks that source, OpenAPI/RFC 9457, and optional runtime events do not drift. The key engineering choice is bounded proof over broad heuristics: unresolved values stay partial and carry an evidence chain.

## Architecture decisions worth discussing

- **Decoupled pipeline:** language extraction, normalization, policy, runtime, reporting, adapters, and mutation have separate ownership.
- **Proof model:** categorical evidence records mechanics rather than source text or literal values; this makes findings explainable and privacy-safe.
- **Schema evolution:** catalog v2 adds Problem Details without breaking v1 readers or overwriting authored prose.
- **Adoption:** baselines and changed-file traversal let legacy repositories fail only on net-new drift.
- **Safe mutation:** the fixer reuses catalog taxonomy, detects collisions, explains rationale, and writes only when requested.
- **Data engineering:** benchmark targets are allow-listed and commit-pinned; license content is hashed; published output is aggregate-only and independently validated.

## Tradeoffs and honest limitations

- Other language packs are syntax-directed; TypeScript/JavaScript has the deepest bounded cross-file analysis.
- Lexical flow labels are not a whole-program control-flow graph.
- The benchmark currently measures detector boundaries, not industry quality, and does not populate OpenAPI/baseline metrics when those artifacts are absent.
- Runtime adapters correlate events but do not provide storage, alerting, or a hosted backend.

## Strong demonstration path

Show the demo source, generated catalog, and Markdown proof line. Then introduce an OpenAPI drift and open the SARIF result. Finish with the boundary fixture: a chain beyond the documented hop limit stays unstructured. That sequence demonstrates value, explainability, and restraint in under five minutes.
