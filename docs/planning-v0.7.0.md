# ErrorAtlas v0.7.0 planning

Prepared after the `v0.6.0` release on 2026-07-02.

## Goal

v0.7.0 should expand the external benchmark and use it for real-world validation of ErrorAtlas's conservative, source-first extraction model.

The milestone is about measurement, provenance, and regression fixtures. It is not a public-launch milestone.

## Explicitly out of scope

- No website or public launch.
- No hosted dashboard.
- No broad heuristic expansion from benchmark examples alone.
- No raw-source benchmark publishing.
- No new framework replacement layer.
- No claim that ErrorAtlas is enterprise-ready; it remains enterprise-oriented and pre-1.0.

## Target benchmark categories

- TypeScript: Express, Fastify, Next.js, NestJS.
- Python: FastAPI, Django REST Framework.
- Java: Spring and Spring Boot HTTP APIs.
- Go HTTP APIs.
- C# ASP.NET APIs.
- Kotlin: Ktor or Spring/Kotlin APIs.
- OpenAPI-heavy repositories.
- Error-catalog-like repositories.

## Benchmark rules

Every target must be reviewable before scanning:

- Repository is explicitly allow-listed.
- Repository is public and has a public license.
- Scan is pinned to a full commit SHA.
- SPDX license identifier is recorded.
- License-file SHA-256 hash is recorded.
- Dataset output is aggregate-only.
- Dataset output excludes raw source, raw paths, raw messages, raw error codes, stack traces, secrets, private metadata, and raw findings.
- Unknown or unsupported patterns remain unresolved/partial; do not infer identities without proof.

## Desired outputs

- Updated benchmark allowlist manifest.
- Updated aggregate benchmark snapshot.
- Human-readable benchmark summary.
- JSON Schema validation for every committed benchmark artifact.
- Recursive privacy validation for every committed benchmark artifact.
- Optional full benchmark workflow if runtime and GitHub Actions cost stay modest.
- Regression fixtures for every detector bug found during benchmark review.

## First implementation PR

The first v0.7.0 PR should establish the benchmark foundation rather than maximize repository count:

- keep the v0.6.0 v3 snapshot readable;
- add a richer manifest with public provenance, scan profiles, and excluded-candidate reasons;
- add an aggregate-only v4 snapshot and summary artifact;
- validate committed artifacts in normal CI without network cloning;
- keep full external benchmark generation manual or workflow-dispatch;
- avoid detector changes unless a bounded benchmark bug has a paired positive and negative fixture.

## Issue-sized tasks

1. Expand the allowlist with 2-3 repositories per target category.
2. Add license/provenance review notes for each allowlisted repository.
3. Run the benchmark generator against pinned commits and commit only aggregate output.
4. Add or update schemas if new aggregate fields are required.
5. Add privacy-validation negative tests for any newly denied field shapes.
6. Triage benchmark findings into detector gaps, documentation gaps, and intentional unsupported boundaries.
7. Convert every confirmed detector bug into a minimal positive fixture and paired negative/noise fixture.
8. Write a short benchmark interpretation note that avoids repository ranking and industry-wide claims.
9. Decide whether a full benchmark workflow is safe to run in CI or should remain a maintainer-only command.

## Definition of done

- At least one representative repository category is added beyond the v0.6.0 snapshot, with pinned commits and license hashes.
- All committed benchmark data passes schema and privacy validation.
- The benchmark summary is reproducible from committed data.
- No raw source, paths, messages, error codes, stack traces, secrets, private metadata, or raw findings are committed.
- Every extraction behavior change motivated by the benchmark has positive and negative fixtures.
- The release notes describe the benchmark as real-world validation data, not an industry-wide benchmark.
- CI remains green on Linux, macOS, and Windows across supported Node versions.
