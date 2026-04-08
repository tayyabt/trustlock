# Design Approach: F03-S03 Registry Client Facade with Degradation & Concurrency

## Summary
Implement `src/registry/client.js` — a facade that wires `cache.js` (S01) and the HTTP adapters `npm-registry.js`/`provenance.js` (S02) together into the three public methods consumed by the policy engine. The implementation adds a shared concurrency semaphore (max 10 in-flight HTTP requests), a `withDegradation` helper encoding the ADR-003 three-tier hierarchy, and `--no-cache` bypass behaviour.

All three public methods (`fetchPackageMetadata`, `getVersionMetadata`, `getAttestations`) share a single `withDegradation` path. The only special case is `getAttestations`: because `provenance.js` legitimately returns `null` for packages with no SLSA attestation, the cache envelope wraps attestation results in `{ _value: data }` so that `null` round-trips through the JSON file cache without being silently coerced to `{}`.

## Key Design Decisions

1. **Dependency injection via factory options** (`_cache`, `_fetchFullMetadata`, `_fetchVersionMetadata`, `_fetchAttestations`): Allows tests to inject mock objects without a separate mock library, following the same pattern used in `http.js` (`_https`). Production callers pass no injections and the real modules are used. ADR-001 prohibits test libraries from appearing in runtime code, so injection is the only clean seam.

2. **Semaphore with queue** — `active` counter + queue of resolve callbacks: When `active < 10`, increment and proceed. When at limit, push a resolver into the queue; `release()` increments `active` for the next waiter and resolves its promise. This prevents over-incrementing and is race-free within Node's single-threaded event loop.

3. **`_value` envelope for attestation cache entries**: `cache.set` spreads its `data` argument into `{ ...data, _cachedAt }`. If `data` is `null`, the spread is `{}` and the round-tripped value would be `{}`. Wrapping as `{ _value: null }` or `{ _value: {...} }` before caching and unwrapping after reading preserves the `null` return that `provenance.js` uses to signal "no attestation" (normal for most packages).

4. **Cache keys by method**:
   - `fetchPackageMetadata(name)` → `name` (e.g., `lodash`) — 1h TTL
   - `getVersionMetadata(name, version)` → `${name}@${version}` — 24h TTL
   - `getAttestations(name, version)` → `attestations:${name}@${version}` — 1h TTL
   Keys are distinct across method namespaces; cache.js handles `/` encoding for scoped names.

5. **`noCache` writes through**: When `noCache: true`, cache reads are skipped but successful fetches are still written to cache. This matches the story spec and means a subsequent non-noCache run gets the fresh data.

## Integration / Wiring

Callee-side (owned by this story): `client.js` imports and calls `createCache` (S01), `fetchFullMetadata`/`fetchVersionMetadata` (S02 npm-registry), and `fetchAttestations` (S02 provenance). All four are real modules — no stubs.

Caller-side (deferred): Policy engine (F06) and CLI commands (F08) will call `createRegistryClient(options)`. These callers do not exist yet. The exported factory and method signatures constitute the contract.

## Files to Create/Modify
- `src/registry/client.js` — new file; registry client facade
- `test/registry/client.test.js` — new file; integration tests with injected mocks

## Testing Approach
All tests use `node:test`. The cache and HTTP layers are injected as mock objects. No real network or disk I/O in the client tests (cache.js and npm-registry.js have their own test suites covering those layers). Tests cover:
1. Fresh cache hit — no HTTP call, empty warnings
2. Stale cache + successful refresh — new data returned, cache written, empty warnings
3. Stale cache + failed refresh — stale data returned, `"stale registry data"` warning
4. No cache + failed fetch — `{ data: null, warnings: ["skipped: registry unreachable"] }`
5. `noCache: true` bypass — cache.get never called, fetch succeeds, cache.set called
6. `noCache: true` + failed fetch — `{ data: null, warnings: ["skipped: registry unreachable"] }`
7. Attestation 404 (null return from fetchAttestations) — `{ data: null, warnings: [] }`
8. Attestation stale fallback — stale data (null or real) returned with warning
9. Concurrency limiter — 15 simultaneous calls, only 10 in-flight at peak
10. Warning annotations are arrays of strings

## Acceptance Criteria / Verification Mapping
- AC: exports `createRegistryClient` returning `{ fetchPackageMetadata, getVersionMetadata, getAttestations }` → test: "createRegistryClient returns the three public methods"
- AC: `fetchPackageMetadata` returns full package data including `time` → test: fresh-cache-hit and stale-refresh-success scenarios
- AC: `getVersionMetadata` returns version data including `scripts` and `_npmUser` → test: same degradation path, different key
- AC: `getAttestations` returns attestation data or `{ data: null, warnings: [] }` → test: attestation-404-returns-null scenario
- AC: Fresh cache hit → no HTTP, no warning → test case 1
- AC: Stale cache + successful refresh → fresh data, no warning → test case 2
- AC: Stale cache + failed refresh → stale data + `"stale registry data"` warning → test case 3
- AC: No cache + failed fetch → `{ data: null, warnings: ["skipped: registry unreachable"] }` → test case 4
- AC: `noCache: true` bypasses cache read, fetches fresh, writes cache → test case 5
- AC: Concurrency capped at 10 → test case 9
- AC: Warnings are arrays of strings → asserted in every test
- AC: `node --test test/registry/client.test.js` passes → run below

## Verification Results
- AC: exports `createRegistryClient` returning `{ fetchPackageMetadata, getVersionMetadata, getAttestations }` → PASS — test: "createRegistryClient returns the three public methods"
- AC: `fetchPackageMetadata` returns full package data including `time` → PASS — test: fresh-cache-hit and stale-refresh-success scenarios
- AC: `getVersionMetadata` returns version data including `scripts` and `_npmUser` → PASS — test: "getVersionMetadata: fresh cache hit…" and stale-refresh
- AC: `getAttestations` returns attestation data or `{ data: null, warnings: [] }` for no-attestation → PASS — test: "getAttestations: 404 (no attestations) returns { data: null, warnings: [] }"
- AC: Fresh cache hit → no HTTP, no warning → PASS — tests: "fresh cache hit" for all three methods
- AC: Stale cache + successful refresh → fresh data, no warning, updates cache → PASS — test: "stale cache + successful refresh returns fresh data, updates cache"
- AC: Stale cache + failed refresh → stale data + `"stale registry data"` warning → PASS — tests: "stale cache + failed refresh" for fetchPackageMetadata, getVersionMetadata, getAttestations
- AC: No cache + failed fetch → `{ data: null, warnings: ["skipped: registry unreachable"] }` → PASS — tests: "no cache + failed fetch" for fetchPackageMetadata and getVersionMetadata
- AC: `noCache: true` bypasses cache read, fetches fresh, writes cache → PASS — test: "noCache: true bypasses cache read, fetches fresh, writes result to cache"
- AC: Concurrency capped at 10 → PASS — test: "concurrency limiter caps in-flight requests at 10" (peakInFlight asserted == 10)
- AC: Warnings are arrays of strings → PASS — test: "warnings are always arrays of strings"
- AC: `node --test test/registry/client.test.js` passes → PASS — 17/17 tests, 0 failures
- Full registry suite: `node --test test/registry/cache.test.js test/registry/npm-registry.test.js test/registry/provenance.test.js test/registry/client.test.js` → PASS — 56/56 tests

## Story Run Log Update
### 2026-04-09 developer: Implementation
- Implemented `src/registry/client.js` with `createRegistryClient` factory
- Implemented concurrency semaphore (10 in-flight limit)
- Implemented `withDegradation` helper (ADR-003 three-tier hierarchy)
- Added `_value` envelope for attestation null round-trip via cache
- Written `test/registry/client.test.js` with 10 test scenarios

## Documentation Updates
None — no new env vars, interfaces, or operator workflow changes.

## Deployment Impact
None.

## Questions/Concerns
None — spec is clear.

## Stubs
None — all integrations are real (cache.js, npm-registry.js, provenance.js called directly).

## Metadata
- Agent: developer
- Date: 2026-04-09
- Work Item: F03-S03 / task-021
- Work Type: story
- Branch: burnish/task-021-implement-registry-client-facade-with-degradation-and-concurrency
- ADR: ADR-003, ADR-001
