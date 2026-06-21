# End-to-end demo

This fixture shows the complete ErrorAtlas loop with four errors extracted from TypeScript and Python.

```bash
npm run build
node dist/cli.js generate examples/demo
node dist/cli.js check examples/demo --openapi openapi.yaml
```

The source-first scan produces the committed [JSON catalog](erroratlas.catalog.json) and [Markdown reference](docs/errors.md). Open the Markdown and you can see a compact proof chain beside every occurrence; the JSON retains the complete categorical evidence without copying source text or error literals. The matching `openapi.yaml` check exits successfully.

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

The SARIF result properties also include ErrorAtlas confidence and evidence steps, so a reviewer can distinguish a proven identity from a deliberately partial finding without leaving code scanning.

## Five-minute source-change scenario

1. Run the clean check above: source, the human-owned catalog, and OpenAPI agree.
2. In `src/users.ts`, change `USER_NOT_FOUND` from status `404` to `410` without editing the catalog or OpenAPI.
3. Run the check as SARIF:

   ```bash
   node dist/cli.js check examples/demo \
     --openapi openapi.yaml \
     --format sarif \
     --output source-change.sarif
   ```

4. The command exits `1`. `status-drift` shows the catalog disagreement and `openapi-status-drift` shows the API-contract disagreement. Both SARIF results carry `erroratlasConfidence: proven` and the bounded evidence steps that justify the source fact.

The smoke test performs this mutation in a temporary copy, proves the failure/evidence, and deletes the copy. The committed demo remains clean.

Run `npm run test:demo` to prove the matching contract, source-change scenario, evidence properties, and committed SARIF sample remain reproducible.
