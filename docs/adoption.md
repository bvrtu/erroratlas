# Adoption

## Greenfield

```bash
npm install --save-dev erroratlas
npx erroratlas init
npx erroratlas generate
npx erroratlas enrich
npx erroratlas check
```

Commit `erroratlas.config.json`, `erroratlas.catalog.json`, and generated Markdown. Edit descriptions and resolutions in JSON; regeneration preserves them.

Monorepos can opt into deterministic project imports:

```json
{
  "typescript": {
    "resolveProjectImports": true,
    "tsconfig": "tsconfig.json"
  }
}
```

Only `baseUrl`/`paths` targets and packages declared by the root workspace are considered. Resolution never searches arbitrary dependencies or leaves the project root.

## Legacy repository with a baseline

Generate a catalog, review it, then record existing diagnostics:

```bash
npx erroratlas generate
npx erroratlas baseline --output .erroratlas/baseline.json
```

Set `"baseline": ".erroratlas/baseline.json"` in config. `check` now prints and fails only on net-new violations. Refresh a baseline only after reviewing the diff; it is an acceptance record, not an automatic suppression file.

For pull requests, create a changed-file list and scan bounded dependents:

```bash
git diff --name-only origin/main...HEAD > .erroratlas/changed-files.txt
npx erroratlas check --changed-files .erroratlas/changed-files.txt
```

Run a full check on the main branch or a schedule because dynamic imports, deleted files, and dependency edges beyond the bound can require global context.

## OpenAPI drift

Set `"openapi": "openapi.yaml"` or run:

```bash
npx erroratlas check --openapi openapi.yaml
```

For RFC 9457 APIs, describe error responses under `application/problem+json` and expose a static `code` extension with `const`, enum, or examples. See [RFC 9457 mapping](rfc9457.md).

The composite Action exposes the same contract path relative to its project `path`:

```yaml
- uses: bvrtu/erroratlas@v0.5.0
  with:
    path: .
    openapi: openapi.yaml
```

## Runtime correlation and adapters

Runtime is optional. Create a monitor and use a thin adapter:

```ts
import {
  createExpressErrorMiddleware,
  createRuntimeMonitor,
  JsonlRuntimeTransport,
} from "erroratlas";

const monitor = createRuntimeMonitor({
  service: "users-api",
  transport: new JsonlRuntimeTransport(".erroratlas/runtime.jsonl"),
});

app.use(
  createExpressErrorMiddleware(monitor, {
    respondWithProblemDetails: true,
    problemTypeBase: "https://api.example.com/problems",
    exposeDetail: false,
  }),
);
```

Fastify uses `createFastifyErrorHandler`; Next.js route handlers use `withErrorAtlas`. Problem responses are opt-in so adoption does not silently change application behavior.

```ts
fastify.setErrorHandler(
  createFastifyErrorHandler(monitor, { respondWithProblemDetails: true }),
);

export const GET = withErrorAtlas(loadUser, monitor, {
  respondWithProblemDetails: true,
});
```

A dependency-free FastAPI companion is intentionally deferred until it can be versioned and tested against the same runtime event schema; see the concrete 0.6 milestone in [the roadmap](roadmap.md).
