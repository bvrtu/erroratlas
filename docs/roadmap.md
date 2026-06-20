# Follow-up roadmap

These are release-sized, issue-ready tasks rather than open-ended TODOs.

## Milestone 0.5 — extraction confidence

1. Add TypeScript `paths`/workspace package resolution behind an explicit project-config flag; fixture monorepos must prove no package-boundary leakage.
2. Add destructured immutable object-member resolution; reject rest/spread, reassignment, and computed keys with negative fixtures.
3. Add factory composition for object arguments and default parameters while retaining the two-call bound.
4. Attach a machine-readable confidence/evidence chain to each normalized occurrence and surface it in JSON output.
5. Build a file-based fixture corpus for all nine supported languages, with framework-version labels and paired negative/noise cases for every extractor profile.

## Milestone 0.6 — adapters and runtime correlation

1. Package a FastAPI integration as a small Python companion with ASGI exception middleware, trace-ID extraction, redaction hooks, and contract tests against the runtime event schema.
2. Add Express/Fastify response-finish hooks that mark delivery without taking ownership of response rendering.
3. Add an OpenTelemetry bridge mapping trace/span IDs into ErrorAtlas events; no collector or storage coupling.
4. Add adapter integration matrices against supported framework majors.

## Milestone 0.7 — benchmark product

1. Publish a JSON Schema for dataset v2 and validate every release in CI.
2. Add dataset snapshots from explicitly allow-listed public repositories and record license provenance.
3. Publish the static aggregate query output on GitHub Pages with immutable dataset-version URLs.
4. Add trend deltas across dataset versions without retaining deleted raw metadata.

## Milestone 1.0 — governance stability

1. Stabilize catalog schema v2 and runtime schema v1 with compatibility fixtures.
2. Add signed baseline provenance and a review command that explains added/removed fingerprints.
3. Define deprecation policy, migration-note template, and support window.
4. Complete security/privacy review for runtime redaction and benchmark publication paths.
