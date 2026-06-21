# Follow-up roadmap

Each item is sized to become one focused issue or pull request. Milestones describe intent, not promises of hosted services.

## Next patch — consistency, documentation, and bug fixes

1. Add a release script that compares the npm tarball, GitHub Action bundle, changelog section, and annotated tag before maintainers publish.
2. Add paired `2xx`/`3xx`/`4xx` response fixtures for every supported TypeScript response style and preserve the “proven success is not an error” invariant.
3. Add generated-document snapshot checks that prove human catalog prose survives repeated `generate` and schema migration passes.
4. Document a benchmark target review checklist covering license changes, repository deletion, and commit replacement.

## Next minor — benchmark and fixture maturity

1. Expand each language corpus with two real framework-version profiles and one negative/noise fixture; record framework and parser versions in the manifest.
2. Add opt-in benchmark profiles for committed OpenAPI, catalog, and baseline files so those metrics are populated only when artifacts genuinely exist.
3. Add dataset-to-dataset trend comparison keyed by immutable target/commit coordinates; never retain removed raw findings.
4. Publish immutable JSON and generated summary pages through GitHub Pages, with CI deploying only schema/privacy-validated artifacts.

## Following minor — adapters, runtime, and OpenTelemetry

1. Package a FastAPI companion with ASGI exception capture, trace-ID extraction, redaction hooks, and contract tests against runtime schema v1.
2. Add Express and Fastify response-finish helpers that correlate delivery without taking ownership of application rendering.
3. Add an OpenTelemetry bridge that maps trace/span IDs into ErrorAtlas runtime events without bundling a collector or backend.
4. Test Express, Fastify, Next.js, and FastAPI adapters against declared framework-major matrices and publish exact compatibility tables.

## 1.0 — stability and enterprise adoption

1. Freeze catalog schema v2 and runtime schema v1 compatibility guarantees with golden fixtures and a documented deprecation window.
2. Add signed baseline provenance and a review command explaining added, removed, and count-changed fingerprints.
3. Complete a threat model and privacy review for runtime redaction, HTTP transport, benchmark publication, and third-party Action execution.
4. Publish migration templates, support policy, governance model, and an enterprise pilot guide based on evidence from real adopters.
