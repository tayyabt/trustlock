# Feature: F03 Registry Client & Caching

## Summary
Fetch trust-relevant metadata from the npm registry with file-based caching, TTL management, and graceful offline degradation per ADR-003.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Infrastructure data layer — HTTP client with deterministic degradation behavior, tested via unit tests with mocked responses
- Target Sprint: 1
- Sprint Rationale: Foundational data layer — policy rules for cooldown, provenance, and install scripts depend on registry metadata

## Description
This feature implements the registry module per ADR-003. The client fetches three types of data from the npm registry: full package metadata (includes publish times for cooldown), version-specific metadata (install scripts, publisher identity), and attestations (SLSA provenance).

All responses are cached as JSON files in `.dep-fence/.cache/` with fetch timestamps. Cache TTLs: version metadata 24h (immutable), full metadata 1h, attestations 1h. The degradation hierarchy is: fresh cache -> stale cache with warning annotation -> skipped with warning.

Requests are batched with a concurrency limit of 10 parallel fetches. The `--no-cache` flag bypasses cache entirely.

## User-Facing Behavior
Not directly user-facing. Called internally by the policy engine during `check`, `init` (for provenance during baseline creation), and `audit`.

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. Registry returns HTTP 404 for a package — must degrade gracefully, not crash
2. Registry returns HTTP 429 (rate limited) — must retry or degrade
3. Network timeout — must trigger degradation hierarchy
4. DNS resolution failure — must trigger degradation, not hang
5. Cache file corrupted (invalid JSON) — must treat as cache miss, not crash
6. Cache directory does not exist — must create it on first write
7. Scoped package names in URLs — `@scope/name` must be URL-encoded as `@scope%2fname`
8. Package with no attestations endpoint — provenance check returns "no attestation" cleanly
9. Very large package metadata (e.g., lodash with thousands of versions) — must handle without OOM
10. Concurrent cache writes for the same package — atomic write (temp + rename) prevents corruption

## Acceptance Criteria
- [ ] `fetchPackageMetadata(name)` returns full package data including `time` object for version publish dates
- [ ] `getVersionMetadata(name, version)` returns version-specific data including `scripts` and `_npmUser`
- [ ] `getAttestations(name, version)` returns attestation data or null
- [ ] Cache writes include `_cachedAt` timestamp; cache reads check TTL before returning
- [ ] Stale cache (past TTL) triggers refresh attempt; on failure, stale data returned with warning annotation
- [ ] Missing cache + no network returns null/skipped with warning annotation (never throws)
- [ ] `--no-cache` flag causes all fetches to bypass cache
- [ ] Concurrency limiter caps parallel requests at 10
- [ ] Unit tests cover fresh cache, stale cache, no cache, network failure, and malformed response scenarios

## Dependencies
- F01 (shared utilities)

## Layering
- Single layer: registry client (leaf module)

## Module Scope
- registry

## Complexity Assessment
- Modules affected: registry
- New patterns introduced: yes — file-based cache with TTL, concurrency limiter, degradation hierarchy
- Architecture review needed: no (covered by ADR-003)
- Design review needed: no

## PM Assumptions (if any)
- The npm registry's public API does not require authentication for read operations. Private registries are out of scope for v0.1.
- Concurrency limit of 10 is a sensible default. Not configurable in v0.1.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-dep-fence-full-spec.md
- Sprint: 1
