# Draft release notes — ErrorAtlas 0.6.0

> Draft launch material. This describes the current unreleased candidate; it is not a publication announcement.

## Highlights

- **Reviewable evidence everywhere:** Markdown renders compact proof chains and SARIF carries structured confidence/evidence properties.
- **Trust-first fixtures:** a file-based corpus covers all nine language packs plus cross-file, collision, boundary, RFC 9457, and false-positive cases.
- **Benchmark v3:** six public repositories with recorded license provenance are pinned to commits and scanned through a reproducible aggregate-only pipeline.
- **Stronger release gates:** package metadata, docs, demo evidence, schemas, privacy rules, coverage, package smoke tests, and generated examples are checked before packing.
- **Lower noise:** proven 2xx/3xx responses are no longer treated as errors because a success payload happens to contain a `code` field.

## Compatibility

No catalog or runtime schema was broken. Catalog v1 remains readable; v2 evidence fields remain optional. CLI defaults and exit codes are unchanged. Benchmark v3 is additive, and the local query command continues to support v1/v2 snapshots.

## Benchmark interpretation

The first external snapshot scanned 261 files and reported 23 partial occurrences with zero proven identities under default profiles. This is a detector-boundary measurement, not a repository ranking. ErrorAtlas will broaden profiles only behind positive and negative fixtures that preserve precision.

## Upgrade

Update the development dependency and keep the catalog committed. Existing users do not need a catalog migration. Teams consuming SARIF may optionally read `erroratlasConfidence` and `erroratlasEvidence` result properties.
