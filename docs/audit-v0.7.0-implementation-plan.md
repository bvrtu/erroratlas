# ErrorAtlas v0.7.0 implementation plan

Prepared for the first v0.7.0 issue-sized PR after the successful `v0.6.0` release.

## What v0.6.0 already shipped

- Source-first, proof-based extraction remains the product center.
- A file-based fixture corpus covers all nine advertised language surfaces and includes confidence/noise/boundary cases.
- The demo, Markdown output, and SARIF output expose compact proof evidence without embedding source text or literal values.
- `prepack` and `verify` run the release-critical checks: formatting, typecheck, release consistency, benchmark data validation, coverage, build, CLI, demo, and package smoke.
- Benchmark schema v3, a small allowlist, license hash checks, a six-repository aggregate-only external snapshot, and `npm run check:data` privacy/schema validation exist.
- The v0.6.0 benchmark is useful as a detector-boundary snapshot, but it is intentionally not broad enough to be called an industry benchmark.

## What this first v0.7.0 PR should implement now

- Add a richer benchmark manifest model with explicit repository identity, license/provenance, ecosystem, framework/category, scan profile, limitations, and verification dates.
- Add a new benchmark snapshot schema that can preserve the richer public provenance while publishing only aggregate metrics.
- Improve the benchmark runner so it validates pinned commits, public/permissive license metadata, license hashes, manifest schema, safe scan profiles, and explicit failure records.
- Expand the external benchmark set modestly, prioritizing reviewability over size.
- Add schema/privacy tests for the new manifest and snapshot shapes.
- Generate a new aggregate-only snapshot and benchmark summary from the richer model.
- Keep full external cloning out of default CI; CI should validate committed artifacts and use deterministic tests.

## Out of scope for this PR

- Website, public launch, social copy, hosted dashboards, or public benchmark site.
- npm publish, GitHub tag, or GitHub Release.
- Broad extraction heuristics based only on benchmark examples.
- New language packs, OpenTelemetry, Sentry-like observability, or adapter/runtime expansion.
- Enterprise-ready wording or industry-wide benchmark claims.

## Risks and mitigations

- **License risk:** only include public repositories with clear MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, or ISC-style licenses. Record SPDX ID, license name, metadata source, license file, and SHA-256 hash; fail generation on mismatches.
- **Privacy risk:** committed data must remain aggregate-only. Strengthen recursive validation against raw source snippets, paths, messages, error identities, stack traces, secrets, private metadata, and non-aggregate occurrence arrays.
- **Reproducibility risk:** pin every repository to a full commit SHA, verify `HEAD` after checkout, and keep default branches as metadata only.
- **CI-time risk:** default CI should validate schemas, privacy, committed snapshots, and small mocked/sample data only. Full network benchmark generation remains manual or workflow-dispatch.
- **Overclaiming risk:** docs should say “initial external benchmark expansion,” “allow-listed public repositories,” and “not an industry-wide benchmark yet.”
- **Detector-noise risk:** unsupported patterns remain partial/unresolved. Any bounded detector fix found during benchmarking needs paired positive and negative fixtures; otherwise document it as a limitation.
