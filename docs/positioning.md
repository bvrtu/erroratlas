# Positioning

**Homepage one-liner:** Keep the errors your application emits and the error contract your API promises in sync—starting from source code.

ErrorAtlas governs error contracts from the place they originate: source code. Its hard center is deterministic extraction plus reconciliation across source, a human-maintained catalog, OpenAPI/RFC 9457, and optional runtime evidence.

Its differentiator is not “more detections.” It is reviewable proof: a finding can explain whether an identity came from a literal, immutable alias, bounded import/re-export chain, or factory—and it remains partial when that chain cannot be proven.

## What ErrorAtlas is—and is not

ErrorAtlas is a local, source-first governance tool. It proves static error identities and payload fields, generates a catalog without overwriting human prose, and reports source/catalog/OpenAPI drift in CI.

It is not a hosted observability backend, a replacement exception framework, a general API linter, or a document-to-document OpenAPI diff engine. Its runtime and framework adapters exist to correlate contracts, not to expand ErrorAtlas into those product categories.

The project is enterprise-oriented and pre-1.0: production-conscious and designed for CI adoption, but not yet a fully enterprise-ready product with a completed security review, support policy, and 1.0 compatibility guarantees.

## Category comparison

| Category                          | What established tools do better                                                                                                                                                                                                                                                                                                      | What ErrorAtlas does better                                                                                                             | Complementary use                                                                                                                       | ErrorAtlas position                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Curated error catalogs            | Deliberate taxonomy, editorial review, polished consumer prose, and support guidance. Stripe's [API error reference](https://docs.stripe.com/api/errors) is a public example of a maintained error vocabulary.                                                                                                                        | Discovers proven emitted errors and detects when a curated catalog no longer matches source. Human prose remains catalog-owned.         | Let maintainers own taxonomy and prose; let ErrorAtlas continuously test it against implementation.                                     | The executable verification layer for a curated error catalog.        |
| Framework problem libraries       | Native exception mapping, content negotiation, serialization, and framework lifecycle integration. Spring's [Problem Details support](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html) and [Zalando Problem](https://github.com/zalando/problem) are purpose-built for producing responses. | Governs identities and fields across frameworks and languages without requiring an application to replace its exception model.          | Use the framework library to render responses and ErrorAtlas to detect source/catalog/OpenAPI drift.                                    | Framework-neutral contract governance, not another response library.  |
| OpenAPI diff and governance tools | Deep comparison between two API documents, breaking-change classification, revision history, and broad OpenAPI rule coverage. [oasdiff](https://github.com/oasdiff/oasdiff) explicitly compares specifications and detects breaking changes.                                                                                          | Compares the current documented error identities, statuses, and proven Problem Details fields with source evidence.                     | Run oasdiff for spec-to-spec compatibility and ErrorAtlas for implementation-to-contract alignment.                                     | The source-to-error-contract check beside an OpenAPI diff tool.       |
| RFC 9457 ecosystem                | Defines and implements a standard wire format. [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) specifies `type`, `title`, `status`, `detail`, `instance`, extension members, and `application/problem+json`.                                                                                                                       | Tests whether proven source payloads, catalog entries, and OpenAPI descriptions agree; keeps `code` as an application extension.        | Adopt RFC 9457 for the wire format and ErrorAtlas for lifecycle governance.                                                             | Governance for Problem Details, not a competing error format.         |
| Runtime monitoring                | Production exception capture, grouping, alerting, tracing, dashboards, retention, and operational triage. Sentry's [issue details](https://docs.sentry.io/product/issues/issue-details/) and [trace explorer](https://docs.sentry.io/product/explore/traces/) illustrate that operational depth.                                      | Begins before deployment, finds static contract drift in pull requests, and does not require source or error text to leave the machine. | Use runtime monitoring for production behavior and ErrorAtlas for pre-merge contract integrity; optionally correlate trace identifiers. | A CI governance companion to observability, not a Sentry alternative. |

## Why not Sentry?

Use Sentry when the primary question is “what failed in production, how often, and for whom?” ErrorAtlas asks a different question: “which errors does this source prove can exist, and do the catalog and OpenAPI promise the same contract?” Runtime frequency cannot prove that an unobserved branch is impossible, while static extraction cannot replace production telemetry. Mature teams can use both.

## Why not oasdiff?

Use oasdiff when the primary question is “what changed between these two OpenAPI documents, and is it breaking?” ErrorAtlas does not attempt that breadth. It checks whether the current source implementation and current error documentation agree. Running both covers spec evolution and implementation drift without pretending they are the same problem.

## Why not a framework response library?

Use Spring `ProblemDetail`, Zalando Problem, or an equivalent framework library to construct and serialize consistent responses. ErrorAtlas does not take ownership of application exception classes, imports, or response lifecycles. It verifies the resulting contract across a polyglot codebase and keeps framework-specific choices decoupled from governance.

## Defensible differentiation

The hard center is deliberately small: prove error-contract facts from source with low false positives. Catalog generation, OpenAPI checks, RFC 9457 alignment, runtime events, adapters, and benchmark metrics exist to make that source evidence useful—not to dilute it into a generic platform.

The sharp positioning statement is:

> ErrorAtlas is a source-first error contract governance tool that proves which application errors exist, preserves the human documentation around them, and stops source, catalog, OpenAPI/RFC 9457, and runtime evidence from drifting apart.

## Why ErrorAtlas exists

For maintainers, it turns a stale error table into an enforceable contract. For adopters, it offers a baseline path that does not demand paying down every legacy warning before CI becomes useful. For recruiters and engineering leaders, the project demonstrates AST analysis, schema evolution, policy design, safe mutation, multi-platform packaging, and privacy-aware data engineering in one focused tool.
