# Story: F03-S03 — Registry Client Facade with Degradation & Concurrency

## Parent
F03: Registry Client & Caching

## Description
Implement the registry client facade in `src/registry/client.js` that integrates the cache layer (S01) with the HTTP adapters (S02), applies the ADR-003 degradation hierarchy (fresh cache → stale cache with warning → skipped with warning), enforces the concurrency limit of 10 parallel fetches, and supports the `--no-cache` bypass flag. This is the public API surface consumed by the policy engine.

## Scope
**In scope:**
- `src/registry/client.js` — `createRegistryClient(options)` factory returning `fetchPackageMetadata(name)`, `getVersionMetadata(name, version)`, `getAttestations(name, version)`
- Degradation hierarchy per ADR-003
- Concurrency limiter (10 parallel requests)
- `--no-cache` flag support
- Warning annotation structure for stale/skipped results
- `test/registry/client.test.js` — integration tests with mocked cache and HTTP layers

**Not in scope:**
- Cache internals (S01 owns)
- HTTP request construction (S02 owns)
- Policy evaluation or baseline management

## Entry Points
- Route / page / screen: N/A (internal API, no UI)
- Trigger / navigation path: Imported by the policy engine (F06) during `check`, by `init` command (F08) for provenance during baseline creation, and by `audit` command (F08)
- Starting surface: `src/registry/client.js` is a new file created by this story

## Wiring / Integration Points
- Caller-side ownership: Policy engine (F06) and CLI commands (F08) will import `createRegistryClient()`. Callers do not exist yet — seam is the exported factory and its returned method signatures.
- Callee-side ownership: This story owns the integration of cache (S01) and HTTP adapters (S02). `createRegistryClient({ cacheDir, noCache })` returns the three public methods. Each method implements: check cache → if miss/stale, fetch via adapter → write cache → apply degradation → return result with optional warning annotation.
- Caller-side conditional rule: Callers (policy engine, CLI) do not exist yet. The exported contract is: `createRegistryClient(options) → { fetchPackageMetadata, getVersionMetadata, getAttestations }`. F06 and F08 stories will wire to this.
- Callee-side conditional rule: S01 (`cache.js`) and S02 (`npm-registry.js`, `provenance.js`) must exist. This story wires to them directly — no seam, real integration.
- Boundary / contract check: Integration tests verify the full degradation path by injecting mock cache and mock HTTP layers, asserting correct warning annotations at each tier.
- Files / modules to connect: `src/registry/client.js` (new) → `src/registry/cache.js` (S01), `src/registry/npm-registry.js` (S02), `src/registry/provenance.js` (S02)
- Deferred integration, if any: Wiring to policy engine deferred to F06. Wiring to CLI commands deferred to F08.

## Not Allowed To Stub
- Degradation hierarchy — must implement all three tiers (fresh → stale with warning → skipped with warning), not just cache-or-fetch
- Concurrency limiter — must enforce a real limit of 10 parallel in-flight requests, not unlimited
- Warning annotations — stale results must carry `{ stale: true, warning: "stale registry data" }`, skipped results must carry `{ skipped: true, warning: "skipped: registry unreachable" }`
- `--no-cache` bypass — when `noCache` is true, must skip cache read and always fetch fresh
- Real wiring to `cache.js`, `npm-registry.js`, and `provenance.js` — must import and call the real modules

## Behavioral / Interaction Rules
- Each public method returns `{ data, warnings }` where `warnings` is an array of strings (empty if fresh cache or fresh fetch)
- When `noCache` is true: skip cache read, always fetch, still write to cache (so subsequent non-noCache calls benefit)
- Concurrency limiter is shared across all three fetch methods within a single client instance — a batch of 20 `fetchPackageMetadata` calls and 5 `getAttestations` calls together respect the same pool of 10

## Acceptance Criteria
- [ ] `client.js` exports `createRegistryClient({ cacheDir, noCache })` returning `{ fetchPackageMetadata, getVersionMetadata, getAttestations }`
- [ ] `fetchPackageMetadata(name)` returns full package data including `time` object for version publish dates
- [ ] `getVersionMetadata(name, version)` returns version-specific data including `scripts` and `_npmUser`
- [ ] `getAttestations(name, version)` returns attestation data or `{ data: null, warnings: [] }` for packages without attestations
- [ ] Fresh cache hit: returns cached data, no warning, no HTTP request
- [ ] Stale cache + successful refresh: returns fresh data, no warning, updates cache
- [ ] Stale cache + failed refresh: returns stale data with `"stale registry data"` warning
- [ ] No cache + failed fetch: returns `{ data: null, warnings: ["skipped: registry unreachable"] }`
- [ ] `noCache: true` bypasses cache read, fetches fresh, writes result to cache
- [ ] Concurrency limiter caps at 10 parallel in-flight HTTP requests
- [ ] Warning annotations are arrays of strings on the returned result objects
- [ ] `node --test test/registry/client.test.js` passes

## Task Breakdown
1. Create `src/registry/client.js` with `createRegistryClient({ cacheDir, noCache })` factory
2. Implement the concurrency limiter (semaphore pattern: queue requests when 10 are in-flight)
3. Implement `fetchPackageMetadata(name)` with cache integration: check cache (1h TTL) → fetch if miss/stale → write cache → apply degradation
4. Implement `getVersionMetadata(name, version)` with cache integration (24h TTL for immutable version data)
5. Implement `getAttestations(name, version)` with cache integration (1h TTL)
6. Implement `--no-cache` bypass: skip cache read when `noCache` is true, still write results
7. Implement warning annotation structure on all returned results
8. Write `test/registry/client.test.js` covering: fresh cache hit, stale + refresh success, stale + refresh failure, no cache + fetch failure, noCache bypass, concurrency limit enforcement

## Verification
```
node --test test/registry/client.test.js
# Expected: all tests pass, no errors

node --test test/registry/
# Expected: all registry tests pass (S01 + S02 + S03)
```

## Edge Cases to Handle
- Stale cache + network failure — must return stale data with warning, not throw (ADR-003 tier 2)
- No cache + network failure — must return null with "skipped" warning, not throw (ADR-003 tier 3)
- `--no-cache` with network failure — must return null with "skipped" warning (no stale fallback since cache was bypassed on read)
- Concurrency burst — 50 simultaneous requests must queue, not fire all at once
- Attestation 404 is not an error — `getAttestations` returns `{ data: null, warnings: [] }` (normal state for packages without SLSA provenance)

## Dependencies
- Depends on: F03-S01 (cache layer), F03-S02 (HTTP adapters)
- Blocked by: none (S01 and S02 must be complete before this story starts)

## Effort
M — Integration logic, degradation state machine, concurrency limiter, comprehensive test matrix

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
