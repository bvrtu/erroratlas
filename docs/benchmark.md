# External benchmark snapshot

Dataset **2026.07.02.1** was produced by ErrorAtlas **0.6.0** from **11** explicitly allow-listed public repositories pinned to exact commits.

This is an initial external benchmark expansion for reproducible validation, not an industry-wide benchmark or repository-quality ranking. Conservative extraction may leave findings partial or unresolved instead of guessing identities.

## Aggregate metrics

| Metric                     |  Value |
| -------------------------- | -----: |
| Repositories               |     11 |
| Ecosystems                 |      7 |
| Files scanned              |    335 |
| Occurrences                |     36 |
| Structured occurrences     |      0 |
| Unstructured occurrences   |     36 |
| Structured ratio           |   0.0% |
| API response occurrences   |      0 |
| Problem Details coverage   |    n/a |
| Documentation coverage     |    n/a |
| OpenAPI documents observed |      1 |
| Full scan duration         | 233 ms |

## Ecosystem coverage

| Ecosystem             | Repositories | Files | Occurrences | Structured | Unstructured |
| --------------------- | -----------: | ----: | ----------: | ---------: | -----------: |
| csharp                |            1 |    32 |           3 |          0 |            3 |
| go                    |            1 |    16 |           9 |          0 |            9 |
| java                  |            1 |     3 |           0 |          0 |            0 |
| kotlin                |            1 |    27 |           4 |          0 |            4 |
| openapi               |            1 |     0 |           0 |          0 |            0 |
| python                |            2 |   146 |           7 |          0 |            7 |
| typescript-javascript |            4 |   111 |          13 |          0 |           13 |

## Repository coordinates

| Repository                                                                                                    | Category           | Framework             | Commit         | License    | Files | Occurrences | Structured | Unresolved |
| ------------------------------------------------------------------------------------------------------------- | ------------------ | --------------------- | -------------- | ---------- | ----: | ----------: | ---------: | ---------: |
| [w3tecch/express-typescript-boilerplate](https://github.com/w3tecch/express-typescript-boilerplate)           | typescript-express | Express               | `17727010f7f0` | MIT        |    59 |           3 |          0 |          3 |
| [fastify/example](https://github.com/fastify/example)                                                         | javascript-fastify | Fastify               | `30c7870a4aa4` | MIT        |     7 |           0 |          0 |          0 |
| [eurovalidate/nextjs-vat-validation](https://github.com/eurovalidate/nextjs-vat-validation)                   | typescript-next    | Next.js               | `5a419066c504` | MIT        |     3 |           3 |          0 |          3 |
| [notiz-dev/nestjs-prisma-starter](https://github.com/notiz-dev/nestjs-prisma-starter)                         | typescript-nestjs  | NestJS                | `225e5a906865` | MIT        |    42 |           7 |          0 |          7 |
| [1owkeyme/fastapi-clean-architecture-example](https://github.com/1owkeyme/fastapi-clean-architecture-example) | python-fastapi     | FastAPI               | `e317f7b7843e` | MIT        |   124 |           4 |          0 |          4 |
| [erdem/DRF-TDD-example](https://github.com/erdem/DRF-TDD-example)                                             | python-drf         | Django REST Framework | `50d014512045` | MIT        |    22 |           3 |          0 |          3 |
| [spring-guides/gs-rest-service](https://github.com/spring-guides/gs-rest-service)                             | java-spring        | Spring Web            | `e9efc9dfa0ab` | Apache-2.0 |     3 |           0 |          0 |          0 |
| [benc-uk/go-rest-api](https://github.com/benc-uk/go-rest-api)                                                 | go-http            | net/http              | `094fa3864d14` | MIT        |    16 |           9 |          0 |          9 |
| [SaraRasoulian/DotNet-WebAPI-Sample](https://github.com/SaraRasoulian/DotNet-WebAPI-Sample)                   | csharp-aspnet      | ASP.NET Core          | `f5a81cb4ce92` | MIT        |    32 |           3 |          0 |          3 |
| [ktorio/ktor-samples](https://github.com/ktorio/ktor-samples)                                                 | kotlin-ktor        | Ktor                  | `c89f051e1183` | Apache-2.0 |    27 |           4 |          0 |          4 |
| [Redocly/museum-openapi-example](https://github.com/Redocly/museum-openapi-example)                           | openapi-spec       | OpenAPI               | `2770b2b2e598` | MIT        |     0 |           0 |          0 |          0 |

## Interpretation and privacy

The committed JSON contains public repository coordinates, pinned commits, license evidence, and aggregate counts only. It excludes raw source, raw repository paths, raw messages, identities, raw codes, raw findings, stack traces, secrets, tokens, and private metadata.

OpenAPI, catalog, baseline, and net-new metrics remain `null` unless those artifacts are genuinely evaluated. No value is imputed. Full external cloning is manual; CI validates committed schemas, aggregate consistency, and privacy rules without network access.

Reproduce the expanded snapshot with `npm run benchmark:external`, then run `npm run check:data`.
