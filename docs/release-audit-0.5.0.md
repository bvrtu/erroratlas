# ErrorAtlas 0.5.0 release audit

## Already true before this release

- Source-first extraction was the product's hard center, with conservative unstructured fallbacks.
- TypeScript/JavaScript supported bounded relative imports, re-exports, aliases, enum/object members, namespace imports, default imports, and factories.
- Catalog schema v2 already provided migration-safe RFC 9457 fields while schema v1 catalogs remained readable.
- Baselines, net-new diagnostics, changed-file scans, OpenAPI drift, dry-run-first catalog-aware fixes, runtime correlation, Express/Fastify/Next.js adapters, and a privacy-safe aggregate benchmark query were implemented and tested.
- The composite Action exposed baseline, OpenAPI, changed-file, and affected-import options.

## Stale or incomplete before this release

- TypeScript project aliases and declared workspace imports were intentionally unresolved, even when a local project config could prove their target.
- Immutable destructuring and object/default factory parameters were not represented in the bounded proof model.
- JSON scan results exposed normalized values but not the chain of evidence used to prove them.
- Current-scope and roadmap text still described the older two-hop extraction boundary.

## Changed in 0.5.0

- Added opt-in, project-root-confined TypeScript `baseUrl`, `paths`, local `extends`, and declared workspace package resolution.
- Shared the same resolver with incremental reverse-import traversal.
- Added conservative immutable object destructuring resolution.
- Added object arguments, default parameters, and one additional bounded factory-composition step.
- Added privacy-safe, machine-readable `proven`/`partial` evidence chains to detections, JSON output, and generated catalog occurrences.
- Added positive, negative, noise, boundary, CLI, and compatibility tests for the new behavior.
- Updated README, architecture, adoption, roadmap, changelog, package, Action examples, and issue metadata to one `0.5.0` product story.

## Exact intentional limits

- Project import resolution is disabled by default and accepts only a project-relative config path.
- `tsconfig` inheritance is local, root-confined, cycle-checked, and limited to four parent files. Package-based `extends` is rejected.
- Path aliases accept at most one wildcard per pattern or target. Ambiguous matches remain unresolved.
- Workspace resolution reads only root-declared workspaces and root-confined source targets. It does not emulate Node's package loader.
- Destructuring requires immutable, statically provable sources; rest, computed, mutable, and reassigned bindings remain unstructured.
- Factory composition is limited to three wrappers and static literal/object arguments without spreads, methods, or computed keys.
- Evidence confidence is categorical proof state, not a probabilistic score. Dynamic values remain `partial` and unstructured.

## Intentionally out of scope

- FastAPI companion packaging and an OpenTelemetry bridge.
- Hosted observability, ingestion storage, or framework response ownership.
- A public hosted benchmark API; the repository continues to ship only privacy-safe aggregate data and a local read-only query layer.
- Broad 1.0 extraction-confidence claims until the multi-language file fixture corpus described in the roadmap is complete.

## Version recommendation

`0.5.0` is appropriate: the release adds backward-compatible, user-visible extraction and evidence capabilities without changing existing catalog schema versions or default project-import behavior.

## Migration notes

No catalog migration is required. Existing configuration and schema v1/v2 catalogs remain valid. To opt in to project import resolution:

```json
{
  "typescript": {
    "resolveProjectImports": true,
    "tsconfig": "tsconfig.json"
  }
}
```

Generated catalog occurrences may now include an optional `evidence` object. Consumers that preserve unknown optional fields need no changes.
