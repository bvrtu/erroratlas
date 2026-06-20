# End-to-end demo

This fixture shows the complete ErrorAtlas loop with four errors extracted from TypeScript and Python.

```bash
npm run build
node dist/cli.js generate examples/demo
node dist/cli.js check examples/demo --openapi openapi.yaml
```

The source-first scan produces the committed [JSON catalog](erroratlas.catalog.json) and [Markdown reference](docs/errors.md). The matching `openapi.yaml` check exits successfully.

To see contract drift, run the intentionally mismatched contract:

```bash
node dist/cli.js check examples/demo \
  --openapi openapi-drift.yaml \
  --format sarif \
  --output output/openapi-drift.sarif
```

That command deliberately exits with status `1`. Its committed [SARIF sample](output/openapi-drift.sarif) contains three independently useful findings:

- `PAYMENT_DECLINED` exists in source/catalog but is absent from OpenAPI.
- `USER_NOT_FOUND` is `404` in source/catalog but `410` in OpenAPI.
- `OLD_ERROR` remains in OpenAPI but no longer exists in source/catalog.

Run `npm run test:demo` to prove that the matching contract stays clean and the committed SARIF sample remains reproducible.
