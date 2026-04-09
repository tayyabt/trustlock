# Module Architecture: Registry

## Purpose
Fetch trust-relevant metadata from the npm registry. Provide caching with TTL and graceful offline degradation.

## Responsibilities
- Fetch full package metadata (publish times for cooldown checks)
- Fetch version-specific metadata (install scripts, publisher identity)
- Fetch attestations (SLSA provenance)
- Cache responses as JSON files with fetch timestamps
- Degrade gracefully: fresh cache → stale cache with warning → skipped with warning
- Respect `--no-cache` flag for fresh-only fetches
- Batch requests with concurrency limit (10 parallel)

## Entry Points
- `client.js:fetchPackageMetadata(name)` → full package metadata or cached/degraded result
- `npm-registry.js:getVersionMetadata(name, version)` → version-specific data
- `provenance.js:getAttestations(name, version)` → attestation data
- `cache.js:get(key)` / `cache.js:set(key, data)` — cache operations

## Dependencies
- Depends on: nothing (leaf module — uses `node:https` for HTTP)
- Used by: policy (for trust signal data)

## Allowed Interactions
- HTTP GET to `registry.npmjs.org` endpoints
- Read/write `.trustlock/.cache/` directory
- Return structured metadata to callers

## Forbidden Interactions
- Must NOT evaluate policy rules (just provides data)
- Must NOT modify baseline or approvals
- Must NOT call git operations

## Notes
- Cache key scheme: `{package}@{version}.json` for version data, `{package}.json` for full metadata, `{package}@{version}.attestations.json` for provenance
- Cache files include a `_cachedAt` timestamp for TTL checking
- HTTP client uses `node:https.get` with JSON parsing — no external dependencies
- Registry errors (HTTP 4xx/5xx, network timeout) are caught and trigger degradation, never thrown to caller

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: registry
