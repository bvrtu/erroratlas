# ErrorAtlas benchmark datasets

ErrorAtlas ships two privacy-safe aggregate datasets:

- `bvrtu-public-repo-audit.json` is the backward-compatible schema v2 snapshot of public repositories owned by `bvrtu`.
- `external-benchmark-v3.json` is a cross-owner snapshot generated from six explicitly allow-listed public repositories pinned to full commits. Its generated summary is [docs/benchmark.md](../docs/benchmark.md).
- `external-benchmark-v4.json`, when present, is the v0.7.0 benchmark-foundation snapshot generated from `benchmark-manifest-v2.json`. It adds richer public provenance, ecosystem/category summaries, scan duration, OpenAPI artifact counts, and failure/skip categories while remaining aggregate-only.

Neither dataset is a security report or project-quality ranking. A zero structured count may mean that a repository uses patterns outside ErrorAtlas's conservative default profiles.

## Schema and validation

Published schemas live in `data/schemas/benchmark-v2.schema.json` and `benchmark-v3.schema.json`. `npm run check:data` validates each committed dataset against its schema, rejects forbidden fields recursively, and recomputes summary totals from repository rows.

Schema v3 records:

- dataset/tool version and deterministic generation time;
- repository URL, exact commit, category, and license evidence;
- files scanned and structured/unstructured occurrence ratios;
- code density, identity/documentation counts, and Problem Details coverage;
- status-family, language, confidence, and explicit not-evaluated limitation counts;
- nullable OpenAPI/baseline/net-new metrics rather than invented zeroes.

Schema v4 adds:

- explicit manifest-level repository identity, owner/repo, default branch, archived status, framework/category, reason for inclusion, scan profile, expected limitations, added date, and last verification date;
- public license provenance with SPDX ID, license name, license file, metadata source, and SHA-256 hash;
- files by language and ecosystem, occurrence count, proven/partial/unresolved confidence distribution, API response occurrence count, OpenAPI document count, scan duration, failure/skip counts, limitation categories, unsupported pattern categories, and per-ecosystem aggregates.

## Privacy contract

Published rows contain public reproducibility coordinates and aggregate counts only. Validation forbids source, paths, messages, error identities, raw scan payloads/findings, locations, stack traces, and private metadata—even when nested. The external generator uses temporary checkouts and removes them after aggregation.

Repository names, commits, and license URLs remain because they are necessary public provenance. The snapshot license is CC BY 4.0; upstream source remains under each repository's recorded license.

## Query

```bash
npm run dataset:query
npm run dataset:query -- data/external-benchmark-v3.json
npm run dataset:query -- data/external-benchmark-v3.json --repository benc-uk/go-rest-api
```

The static query layer reads committed JSON only. It never opens a clone or emits raw findings.

## Reproduce external v3

```bash
npm run benchmark:external
npm run check:data
```

`data/benchmark-allowlist.json` fixes the v3 dataset version, timestamp, target URLs, full commits, scan includes, SPDX identifiers, license filenames, and license SHA-256 hashes. `data/benchmark-manifest-v2.json` is the richer v0.7.0 manifest for v4 snapshots. Generation fails on a commit or license mismatch. Network access is needed only to reproduce external snapshots; CI validates committed results without network cloning.

To add or update a target, review its public status and recognized license, pin a full commit, run `npm run benchmark:external -- --print-license-hashes`, review the aggregate result, then update the manifest deliberately. Do not auto-follow default branches. For the legacy v3 snapshot, pass `--manifest data/benchmark-allowlist.json --output data/external-benchmark-v3.json`.

The manual GitHub Actions workflow `External benchmark` can run the full network benchmark through `workflow_dispatch`. It is intentionally not part of every pull request because cloning public repositories can be slow or flaky.

## Reproduce owner audit v2

```bash
npm run audit:github -- bvrtu work/github-audit
npm run dataset:publish -- \
  work/github-audit/audit-derived-public.json \
  data/bvrtu-public-repo-audit.json
```

The legacy audit requires authenticated GitHub CLI access. Its schema remains supported so existing dataset consumers are not broken.
