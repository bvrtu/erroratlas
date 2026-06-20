# ErrorAtlas public repository audit dataset

`bvrtu-public-repo-audit.json` contains derived ErrorAtlas measurements from public repositories owned by `bvrtu`.

The dataset intentionally excludes source code, error messages, machine-readable error codes, file paths, and every piece of private repository metadata. Each row is tied to a public repository and commit so the measurement can be reproduced.

## Reproduce

```bash
npm run audit:github -- bvrtu work/github-audit
npm run dataset:publish -- \
  work/github-audit/audit-derived-public.json \
  data/bvrtu-public-repo-audit.json
```

The first command requires authenticated GitHub CLI access to enumerate repositories. The publish step refuses input containing non-public repositories or raw scan results.

## Interpretation

- `filesScanned` counts files in languages supported by that ErrorAtlas version after default exclusions.
- `structuredErrors` counts throw/raise sites with a static machine-readable code.
- `unstructuredErrors` counts throw/raise sites without such a code.
- A zero-error repository may have no throw/raise sites, may use return-value error handling, or may rely on unsupported framework patterns. It is not automatically “better documented.”

## License

The dataset is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
