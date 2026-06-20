# ErrorAtlas public repository audit dataset

`bvrtu-public-repo-audit.json` contains derived ErrorAtlas measurements from public repositories owned by `bvrtu`. Dataset schema v2 adds documentation coverage, code density, and status-family aggregates; the query command remains backward-compatible with v1 snapshots.

## Privacy contract

Published rows contain repository-level public metadata and aggregate counts only. Publication excludes source code, file paths, error messages, machine-readable error codes, raw scan payloads, and all private repository metadata. The sanitizer refuses a non-public row or any row containing `scan`.

Repository names and commit SHAs are retained because they are public reproducibility coordinates. A repository’s results should not be interpreted as a security or quality ranking.

## Schema

Top-level fields are `schemaVersion`, `generatedAt`, `owner`, `tool`, `summary`, `repositories`, `license`, and `privacy`.

Each successful v2 repository row exposes:

| Field                                                      | Meaning                                                                             |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `filesScanned`                                             | Eligible files after versioned include/exclude rules                                |
| `structuredErrors`, `unstructuredErrors`, `structuredRate` | Detected sites grouped by proven static identity                                    |
| `codeDensity`                                              | All detected sites divided by files scanned                                         |
| `uniqueStructuredCodes`                                    | Count of distinct proven identities; identities themselves are excluded             |
| `documentedStructuredCodes`, `documentationCoverage`       | Distinct identities present in that repository’s configured catalog and their ratio |
| `statusFamilies`                                           | Aggregate `4xx`, `5xx`, or other proven status families                             |
| `languages`, `constructors`, `statusCodes`, `diagnostics`  | Aggregate count maps without source locations or text                               |

Null ratios mean the denominator is zero, not that a zero score was observed. A zero-error repository may use unsupported patterns or contain no eligible sites.

## Query

The read-only static query layer returns privacy-safe aggregates:

```bash
npm run dataset:query
npm run dataset:query -- --repository bvrtu/erroratlas
npm run dataset:query -- path/to/dataset.json
```

It exposes files scanned, structured/unstructured ratios, documentation coverage, status-family distribution, and code density. It never opens repository clones or raw scan data.

## Reproduce

```bash
npm run audit:github -- bvrtu work/github-audit
npm run dataset:publish -- \
  work/github-audit/audit-derived-public.json \
  data/bvrtu-public-repo-audit.json
```

The audit requires authenticated GitHub CLI access. Every row records the public commit and ErrorAtlas version used. Re-running later may differ when repositories or detector rules change.

## License

The dataset is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
