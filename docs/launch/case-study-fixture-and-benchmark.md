# Case study: earning trust before expanding recall

> Draft launch material. The measurements describe dataset `2026.06.21.1`; update or revalidate them before publication.

## Context

ErrorAtlas already supported nine language packs and deep TypeScript/JavaScript resolution, but most tests were inline strings and evidence was visible mainly in machine-readable catalog data. The public dataset covered only the maintainer's repositories. Those facts supported an MVP, not broad confidence claims.

## Work completed

A versioned file corpus now covers all nine language packs, successful and noisy response patterns, TypeScript re-exports/factories, RFC 9457 payloads, conflicting identities, and analysis beyond the supported bound. The corpus manifest labels expected identities, partial findings, and noise that must not be detected.

Evidence now follows a finding into generated Markdown and SARIF properties. A reviewer can see “proven via syntax → import → factory” or a partial syntax-only chain without exposing source text or literal values.

The external benchmark pipeline adds six public repositories across TypeScript, Python, Java, Go, C#, and Kotlin. Each target is explicitly allow-listed, pinned to a full commit, and tied to an SPDX identifier plus a SHA-256 license-file hash. Temporary checkouts are scanned; only aggregate metrics are published. JSON Schema, recursive privacy denial rules, and recomputed totals guard the output.

## Result

The snapshot scanned 261 files and found 23 error occurrences. None had an identity that ErrorAtlas's default profiles could prove, so all 23 remained partial. That result is not presented as a failure of the projects or proof that they lack structured errors. It is evidence that conservative defaults avoid converting unfamiliar patterns into false facts.

## Product decision

Do not broaden detection from benchmark examples alone. First add a named framework profile and paired positive/negative fixtures; then measure whether the benchmark changes without increasing noise. Precision remains the release gate.
