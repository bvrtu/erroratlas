# ErrorAtlas

**Keep the errors your application throws and the errors your documentation promises in sync.**

ErrorAtlas is an AST-powered CLI and GitHub Action that discovers application errors in TypeScript and Python, generates a human-editable error catalog, and fails CI when code and documentation drift apart.

```text
✖ src/users.ts:42:11 [undocumented-error] USER_SUSPENDED exists in source but is missing from the catalog.
⚠ src/payments.py:18:5 [unstructured-error] ValueError has no static machine-readable error code.

Scanned 38 files · 17 structured errors · 1 error · 1 warning · 0 notes
```

## Why ErrorAtlas?

API references usually document success paths well. Application-specific errors are often maintained in a separate table—or not documented at all. That table quietly becomes stale as the code changes.

ErrorAtlas makes the error contract executable:

- **Discover:** find structured and unstructured errors with syntax trees, not repository-wide regular expressions.
- **Document:** generate JSON as the source of truth and Markdown for people.
- **Protect:** detect undocumented, stale, conflicting, or changed errors in pull requests.
- **Integrate:** emit console, JSON, Markdown, and SARIF output.
- **Stay private:** scan locally without uploading source code or error messages.

## Quick start

ErrorAtlas requires Node.js 20 or newer.

```bash
npm install --save-dev github:bvrtu/erroratlas#v0.1.0
npx erroratlas init
npx erroratlas generate
```

An npm registry release is planned; the GitHub install above is available today.

Add descriptions and resolutions to `erroratlas.catalog.json`, then regenerate the Markdown reference:

```bash
npx erroratlas generate
npx erroratlas check
```

See the generated [demo error catalog](examples/demo/docs/errors.md) and its [JSON source](examples/demo/erroratlas.catalog.json).

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

It also reports errors without a static machine-readable code:

```ts
throw new Error("Database unavailable");
```

Dynamic codes or messages are intentionally reported as unstructured. ErrorAtlas only records values it can prove from source.

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
```

## Configuration

`erroratlas.config.json` is deliberately small and portable:

```json
{
  "include": ["src/**/*.{ts,tsx,js,jsx,py}"],
  "exclude": ["**/*.test.ts", "**/test_*.py"],
  "catalog": "erroratlas.catalog.json",
  "docs": "docs/errors.md",
  "failOn": "error",
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
    ]
  }
}
```

Custom constructors override a default constructor with the same name. Dotted names such as `errors.ServiceError` are supported.

Built-in TypeScript profiles include `AppError`, `ApiError`, `DomainError`, `HttpError`, and common NestJS HTTP exceptions. Built-in Python profiles include `AppError`, `ApiError`, `DomainError`, and FastAPI/Starlette `HTTPException`.

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
      - uses: bvrtu/erroratlas@v0.1.0
        with:
          path: .
          fail-on: error
```

SARIF output can be uploaded to GitHub code scanning so findings appear inline on pull requests. A complete workflow lives at [`.github/workflows/erroratlas.yml`](.github/workflows/erroratlas.yml).

## Rules

| Rule                   | Default severity | Meaning                                      |
| ---------------------- | ---------------- | -------------------------------------------- |
| `undocumented-error`   | error            | A source error is missing from the catalog.  |
| `message-drift`        | error            | The static message differs from the catalog. |
| `status-drift`         | error            | The HTTP status differs from the catalog.    |
| `duplicate-definition` | error            | One code has conflicting source definitions. |
| `stale-error`          | warning          | A catalog entry no longer exists in source.  |
| `unstructured-error`   | warning          | A thrown error has no static code.           |
| `missing-resolution`   | note             | An error has no human-authored resolution.   |

## Current scope

The first release focuses on errors constructed directly inside `throw` and `raise` statements. It does not yet perform data-flow analysis, resolve imported constants, or inspect errors created through arbitrary factory functions. Those boundaries keep findings deterministic and false positives low.

## Roadmap

- Error factory-function profiles and constant resolution
- Go, Java, and C# language packs
- OpenAPI error-response comparison
- Pull-request annotations without separate SARIF setup
- An opt-in, source-free Error Contract Benchmark dataset and public API

See [the architecture](docs/architecture.md) for design decisions and the planned benchmark data model.

## Contributing

Issues and pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports should follow [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
