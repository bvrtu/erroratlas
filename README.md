# ErrorAtlas

[![CI](https://github.com/bvrtu/erroratlas/actions/workflows/ci.yml/badge.svg)](https://github.com/bvrtu/erroratlas/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/erroratlas)](https://www.npmjs.com/package/erroratlas)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Keep the errors your application throws and the errors your documentation promises in sync.**

ErrorAtlas is a source-first error-contract governance tool. Its AST-powered CLI proves which application errors and API error responses exist in TypeScript, JavaScript, Python, Java, Dart, Swift, Go, C#, and Kotlin; then keeps a human-editable catalog, OpenAPI/RFC 9457, CI, and optional runtime evidence aligned with that source truth.

It is not Sentry, not oasdiff, and not merely a framework response formatter. See [positioning](docs/positioning.md) for the complementary boundaries.

**The 10-second version:** ErrorAtlas scans source, records only error facts it can prove, preserves the explanations humans wrote, and fails CI when source, catalog, or OpenAPI stops agreeing. Every finding can show its bounded proof chain.

```text
✖ src/users.ts:42:11 [undocumented-error] USER_SUSPENDED exists in source but is missing from the catalog.
⚠ src/payments.py:18:5 [unstructured-error] ValueError has no static machine-readable error code.

Scanned 38 files · 17 structured errors · 1 error · 1 warning · 0 notes
```

## What ErrorAtlas is—and is not

ErrorAtlas is a local CLI and library for proving error-contract facts from source, preserving human-owned catalog documentation, and detecting drift against that catalog and OpenAPI. It is designed to run before merge and can optionally correlate those contracts with runtime events.

It is not a hosted monitoring service, a general-purpose static analyzer, an OpenAPI revision diff engine, or a framework that takes over exception handling. Dynamic values remain unstructured unless the bounded resolver can prove them.

ErrorAtlas is an enterprise-oriented, pre-1.0 tool designed for CI adoption—not a fully enterprise-ready product. Its support policy, security review, and compatibility guarantees are still being matured toward 1.0.

## Why ErrorAtlas?

API references usually document success paths well. Application-specific errors are often maintained in a separate table—or not documented at all. That table quietly becomes stale as the code changes.

ErrorAtlas makes the error contract executable:

- **Discover:** find thrown errors, direct factories, static constants, and API error responses with syntax trees.
- **Document:** generate JSON and Markdown, with deterministic description and resolution suggestions.
- **Protect:** detect source/catalog/OpenAPI drift in pull requests.
- **Observe:** optionally collect runtime exceptions, stack traces, handled state, and user-delivery correlation.
- **Integrate:** emit console, JSON, Markdown, and SARIF output.
- **Stay private:** scan locally without uploading source code or error messages.

For maintainers, this turns a stale error table into an enforceable contract. For legacy adopters, baseline mode makes rollout incremental. For recruiters and engineering leaders, the repository demonstrates AST analysis, safe schema evolution, conservative mutation, multi-platform packaging, and privacy-aware data engineering.

## Quick start

ErrorAtlas requires Node.js 20 or newer.

```bash
npm install --save-dev erroratlas
npx erroratlas init
npx erroratlas generate
npx erroratlas enrich
```

Add descriptions and resolutions to `erroratlas.catalog.json`, then regenerate the Markdown reference:

```bash
npx erroratlas generate
npx erroratlas check
```

See the generated [demo error catalog](examples/demo/docs/errors.md) and its [JSON source](examples/demo/erroratlas.catalog.json).
The [end-to-end demo](examples/demo/README.md) also includes a matching OpenAPI contract and a committed SARIF drift sample.

## What it recognizes

Zero configuration covers common positional and object-style error constructors.

```ts
throw new AppError("USER_NOT_FOUND", "The requested user was not found", {
  status: 404,
});

throw new NotFoundException({
  code: "USER_NOT_FOUND",
  message: "The requested user was not found",
});
```

```python
raise AppError("PAYMENT_DECLINED", "The payment was declined", 402)

raise HTTPException(
    status_code=404,
    detail={"code": "USER_NOT_FOUND", "message": "User was not found"},
)
```

```java
throw new ApiException("USER_NOT_FOUND", "The requested user was not found");
```

```dart
throw AppException('USER_NOT_FOUND', 'The requested user was not found');
```

```swift
throw APIError.notFound("The requested user was not found")
```

It also reports errors without a static machine-readable code:

```ts
throw new Error("Database unavailable");
```

Dynamic codes or messages are intentionally reported as unstructured. ErrorAtlas only records values it can prove from source.

TypeScript and JavaScript scans also recognize proven local aliases, enum/object members, default/named/namespace imports, re-export chains, bounded factory wrappers, and common API response styles:

```ts
return NextResponse.json(
  { code: "USER_NOT_FOUND", message: "User was not found" },
  { status: 404 },
);

res.status(401).json({ code: "AUTH_REQUIRED", message: "Sign in" });
reply.code(503).send({ errorCode: "UPSTREAM_DOWN", error: "Retry later" });
```

Basic lexical flow is recorded as `caught`, `rethrown`, `returned`, or `propagated` for each occurrence.
JSON scan and catalog occurrences include a machine-readable `evidence` chain. Markdown shows a compact proof summary, while SARIF carries the same confidence and steps in result properties. Evidence records only mechanics—such as syntax, alias, import, re-export, or factory steps—and never embeds source text or literal error values.

## Commands

### `erroratlas init [path]`

Create `erroratlas.config.json`. Existing files are never overwritten unless `--force` is passed.

### `erroratlas scan [path]`

Discover errors without comparing them to a catalog.

```bash
erroratlas scan --format console
erroratlas scan --format json --output scan.json
erroratlas scan --format sarif --output erroratlas.sarif
```

### `erroratlas generate [path]`

Create or refresh the JSON catalog and Markdown reference. Existing `description` and `resolution` fields are preserved.

```bash
erroratlas generate
erroratlas generate --catalog docs/errors.json --docs docs/errors.md
erroratlas generate --no-markdown
```

### `erroratlas check [path]`

Compare the current source with the committed catalog. The command exits with `1` when drift meets the configured severity threshold and `2` for configuration or runtime errors.

```bash
erroratlas check
erroratlas check --fail-on warning
erroratlas check --format sarif --output erroratlas.sarif
erroratlas check --openapi openapi.yaml
```

### `erroratlas enrich [path]`

Preview deterministic descriptions and status-aware resolution guidance for empty catalog fields. Human-authored content is never replaced.

```bash
erroratlas enrich
erroratlas enrich --write
```

### `erroratlas fix [path]`

Preview catalog-aware source edits for explicit TypeScript/JavaScript API response objects. Existing catalog identities win; new identities follow optional prefix policy, and collisions are blocked with a rationale. Source files change only with `--write`.

```bash
erroratlas fix
erroratlas fix --write
```

### `erroratlas baseline [path]`

Record accepted existing diagnostics so `check` can show and fail only on net-new violations.

```bash
erroratlas baseline --output .erroratlas/baseline.json
erroratlas check --baseline .erroratlas/baseline.json
git diff --name-only origin/main...HEAD > .erroratlas/changed-files.txt
erroratlas check --changed-files .erroratlas/changed-files.txt
```

### `erroratlas runtime-report [file]`

Summarize collected JSONL runtime events, including handled/unhandled counts and whether an exception trace was correlated with a user-facing delivery event.

```bash
erroratlas runtime-report .erroratlas/runtime.jsonl
erroratlas runtime-report events.jsonl --format json
```

## Configuration

`erroratlas.config.json` is deliberately small and portable:

```json
{
  "include": ["src/**/*.{ts,tsx,js,jsx,py,java,dart,swift,go,cs,kt,kts}"],
  "exclude": ["**/*.test.ts", "**/test_*.py"],
  "catalog": "erroratlas.catalog.json",
  "docs": "docs/errors.md",
  "openapi": "openapi.yaml",
  "baseline": ".erroratlas/baseline.json",
  "failOn": "error",
  "fix": { "codePrefix": "API" },
  "typescript": {
    "resolveProjectImports": false,
    "tsconfig": "tsconfig.json"
  },
  "useDefaultConstructors": true,
  "constructors": {
    "typescript": [
      {
        "name": "ServiceError",
        "codeArgument": 0,
        "messageArgument": 1,
        "statusArgument": 2
      }
    ],
    "python": [
      {
        "name": "ServiceError",
        "codeArgument": 0,
        "messageArgument": 1,
        "statusArgument": 2
      }
    ],
    "java": [],
    "dart": [],
    "swift": [],
    "go": [],
    "csharp": [],
    "kotlin": []
  }
}
```

Custom constructors override a default constructor with the same name. Dotted names such as `errors.ServiceError` are supported.

Built-in profiles cover common application errors, NestJS HTTP exceptions, Firebase `HttpsError`, FastAPI/Starlette `HTTPException`, Spring `ResponseStatusException`, Dart `FirebaseFunctionsException`, and conventional Go/C#/Kotlin application exceptions. Unknown exception constructors are still reported as unstructured errors.

Set `openapi` to `null` when OpenAPI comparison is not needed. Both OpenAPI/Swagger JSON and YAML are supported.

`baseline` is optional. `fix.codePrefix` must be an uppercase namespace such as `API` or `PAYMENTS`; it affects only new deterministic suggestions.

`typescript.resolveProjectImports` is deliberately `false` by default. When enabled, ErrorAtlas reads the project-relative JSONC `tsconfig`, resolves declared `baseUrl`/`paths`, and maps package names from root `workspaces`. Targets must stay inside the scan root and resolve to scanned source files; undeclared packages remain unresolved.

## GitHub Actions

After the first generated catalog is committed:

```yaml
name: Error catalog

on: [pull_request]

jobs:
  erroratlas:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: bvrtu/erroratlas@v0.6.0
        with:
          path: .
          fail-on: error
          openapi: openapi.yaml
```

`openapi`, `baseline`, `changed-files`, and `affected-import-hops` are optional Action inputs. Paths are resolved from `path`. SARIF output can be uploaded to GitHub code scanning so findings appear inline on pull requests. A complete workflow lives at [`.github/workflows/erroratlas.yml`](.github/workflows/erroratlas.yml).

## Rules

| Rule                            | Default severity | Meaning                                           |
| ------------------------------- | ---------------- | ------------------------------------------------- |
| `undocumented-error`            | error            | A source error is missing from the catalog.       |
| `message-drift`                 | error            | The static message differs from the catalog.      |
| `status-drift`                  | error            | The HTTP status differs from the catalog.         |
| `problem-details-drift`         | error            | Proven RFC 9457 fields differ from the catalog.   |
| `duplicate-definition`          | error            | One code has conflicting source definitions.      |
| `stale-error`                   | warning          | A catalog entry no longer exists in source.       |
| `unstructured-error`            | warning          | A thrown error has no static code.                |
| `missing-resolution`            | note             | An error has no human-authored resolution.        |
| `openapi-undocumented-error`    | error            | A source code is missing from OpenAPI responses.  |
| `openapi-status-drift`          | error            | Source and OpenAPI HTTP statuses differ.          |
| `openapi-problem-media-type`    | error            | A source problem is not exposed as problem+json.  |
| `openapi-problem-details-drift` | error            | Proven RFC 9457 fields differ from OpenAPI.       |
| `openapi-stale-error`           | warning          | OpenAPI documents a code not found in source.     |
| `openapi-no-error-codes`        | note             | OpenAPI exposes no static error codes to compare. |

## Runtime monitoring

Runtime collection is optional and explicit. The default JSONL transport stays local; the HTTP transport sends events only to the endpoint you configure.

```ts
import { createRuntimeMonitor, JsonlRuntimeTransport } from "erroratlas";

const monitor = createRuntimeMonitor({
  service: "payments-api",
  environment: process.env.NODE_ENV ?? "development",
  transport: new JsonlRuntimeTransport(".erroratlas/runtime.jsonl"),
});

const removeGlobalHandlers = monitor.installNodeHandlers();

try {
  await chargeCard();
} catch (error) {
  await monitor.captureException(error, {
    traceId: requestId,
    handled: true,
    mechanism: "http-handler",
  });
  await monitor.markDelivered({
    traceId: requestId,
    channel: "http",
    code: "PAYMENT_DECLINED",
    status: 402,
  });
}
```

The runtime SDK records exception name/message/stack, machine code/status when available, handled state, mechanism, environment, service, tags, and trace correlation. Transport failures are isolated from application behavior.

Thin `createExpressErrorMiddleware`, `createFastifyErrorHandler`, and `withErrorAtlas` adapters reduce integration work. RFC 9457 response rendering is opt-in, so capture-only adoption does not silently change framework behavior. See [adoption examples](docs/adoption.md).

## Current scope

Static resolution covers TypeScript/JavaScript immutable aliases, immutable destructured object members, object/enum members, named/default/namespace imports, re-exports, and bounded factory chains with object arguments and defaults. Cross-file proof is capped at two edges and factory composition at three wrappers. `tsconfig` paths and declared workspace packages are opt-in. Ambiguous, dynamic, mutated, undeclared package, or deeper values remain unstructured. Control-flow labels are lexical; ErrorAtlas does not claim a whole-program CFG. Exact boundaries are in [architecture](docs/architecture.md).

Runtime monitoring is an embeddable SDK and local/HTTP event format, not a hosted Sentry replacement: ErrorAtlas does not provide a managed dashboard, alert routing, retention, symbolication service, or distributed trace backend. The safe fixer currently adds codes only to explicit TypeScript/JavaScript API response objects; it does not rewrite exception types or imports.

The repository also contains versioned, privacy-safe [benchmark data](data/README.md). The initial external v3 snapshot scans six explicitly allow-listed public repositories pinned to commits, records SPDX and license-file hashes, and publishes aggregate metrics only. It found 23 error occurrences whose identities remained unresolved—useful evidence of ErrorAtlas's conservative boundary, not an industry-wide benchmark or project-quality ranking. Query either snapshot locally with `npm run dataset:query`. Raw messages, identities, paths, source, and private metadata are excluded.

## Further reading

- [Architecture and confidence boundaries](docs/architecture.md)
- [RFC 9457 mapping and migration](docs/rfc9457.md)
- [Greenfield, baseline, OpenAPI, and runtime adoption](docs/adoption.md)
- [Competitive positioning](docs/positioning.md)
- [External benchmark snapshot](docs/benchmark.md)
- [Trust-first implementation audit](docs/audit-current-state.md)
- [Issue-sized follow-up roadmap](docs/roadmap.md)
- [0.6.0 release-candidate audit and exact limitations](docs/release-audit-0.6.0.md)

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports should follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
