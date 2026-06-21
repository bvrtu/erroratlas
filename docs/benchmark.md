# External benchmark snapshot

Dataset **2026.06.21.1** was produced by ErrorAtlas **0.6.0** from **6** explicitly allow-listed public repositories pinned to exact commits.

This is a reproducibility and detector-boundary dataset, not a quality ranking. Zero structured detections can mean that a project uses patterns outside ErrorAtlas's conservative profiles; it does not mean the project has no error handling.

## Aggregate metrics

| Metric                   |  Value |
| ------------------------ | -----: |
| Files scanned            |    261 |
| Structured occurrences   |      0 |
| Unstructured occurrences |     23 |
| Structured ratio         |   0.0% |
| Code density             | 0.0881 |
| Documentation coverage   |    n/a |
| Problem Details coverage |    n/a |

## Repository coordinates

| Repository                                                                                                    | Category            | Commit         | License    | Files | Structured | Unstructured |
| ------------------------------------------------------------------------------------------------------------- | ------------------- | -------------- | ---------- | ----: | ---------: | -----------: |
| [w3tecch/express-typescript-boilerplate](https://github.com/w3tecch/express-typescript-boilerplate)           | typescript-node-api | `17727010f7f0` | MIT        |    59 |          0 |            3 |
| [1owkeyme/fastapi-clean-architecture-example](https://github.com/1owkeyme/fastapi-clean-architecture-example) | python-api          | `e317f7b7843e` | MIT        |   124 |          0 |            4 |
| [spring-guides/gs-rest-service](https://github.com/spring-guides/gs-rest-service)                             | java-spring         | `e9efc9dfa0ab` | Apache-2.0 |     3 |          0 |            0 |
| [benc-uk/go-rest-api](https://github.com/benc-uk/go-rest-api)                                                 | go-http             | `094fa3864d14` | MIT        |    16 |          0 |            9 |
| [SaraRasoulian/DotNet-WebAPI-Sample](https://github.com/SaraRasoulian/DotNet-WebAPI-Sample)                   | csharp-aspnet       | `f5a81cb4ce92` | MIT        |    32 |          0 |            3 |
| [ktorio/ktor-samples](https://github.com/ktorio/ktor-samples)                                                 | kotlin-server       | `c89f051e1183` | Apache-2.0 |    27 |          0 |            4 |

## Interpretation and privacy

The committed JSON contains repository coordinates, license evidence, and aggregate counts only. It excludes source, paths, messages, identities, raw findings, stack traces, and private metadata. OpenAPI, baselines, and catalogs are reported as not evaluated when they are absent; no value is imputed.

Reproduce with `npm run benchmark:external` after building. CI validates the committed snapshot against JSON Schema, privacy-field denial rules, and recomputed totals without making network calls.
