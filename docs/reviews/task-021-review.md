# Code Review: task-021 Registry Client Facade with Degradation & Concurrency

## Summary
The implementation is clean, complete, and well-tested. All 17 acceptance-criteria test cases pass; the full 56-test registry suite also passes. No stubs, TODOs, or placeholder logic exist. ADR-001 (zero runtime dependencies) and ADR-003 (degradation hierarchy) are fully respected.

## Verdict
Approved

## Findings

No blocking findings. One low-priority observation:

### Minor: `scripts/check-no-stubs.sh` not present
- **Severity:** suggestion
- **Finding:** The reviewer skill calls `./scripts/check-no-stubs.sh`, which does not exist in the repo. Manual inspection confirmed no runtime stubs in `src/registry/client.js`.
- **Proposed Judgment:** Consider creating the script in a future maintenance task so the reviewer skill can automate this check. Not a blocker.
- **Reference:** reviewer-code skill step 13

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — N/A (infrastructure API, no UI workflows)
- [x] Architecture compliance (ADR-001 zero deps, ADR-003 degradation tiers, module layering from global architecture)
- [x] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (`noCache` writes-through, concurrency shared across all three methods, warning format matches story)
- [x] Integration completeness (real imports of `cache.js`, `npm-registry.js`, `provenance.js`; caller side deferred to F06/F08 per story spec)
- [x] Pitfall avoidance — no pre-existing module guidance/pitfalls; new pitfalls recorded in Context Updates below
- [x] Convention compliance (ES modules, camelCase functions, UPPER_SNAKE_CASE constants, no runtime deps, kebab-case filenames)
- [x] Test coverage (17 tests covering all 11 ACs plus edge cases: scoped names, noCache+fail, attestation stale null, real attestation data, concurrency drain)
- [x] Code quality & documentation (design note complete, no docs requiring update per design note)

## Acceptance Criteria Judgment
- AC: exports `createRegistryClient({ cacheDir, noCache })` returning `{ fetchPackageMetadata, getVersionMetadata, getAttestations }` → PASS — test "createRegistryClient returns the three public methods"; factory at `src/registry/client.js:70`
- AC: `fetchPackageMetadata(name)` returns full package data including `time` object → PASS — tests use `{ name, time: {...} }` fixture shapes
- AC: `getVersionMetadata(name, version)` returns version-specific data including `scripts` and `_npmUser` → PASS — test fixtures include both fields; same degradation path as fetchPackageMetadata
- AC: `getAttestations(name, version)` returns attestation data or `{ data: null, warnings: [] }` for no-attestation → PASS — test "getAttestations: 404 (no attestations) returns { data: null, warnings: [] }" at `client.test.js:219`
- AC: Fresh cache hit → no HTTP, no warning → PASS — three separate "fresh cache hit" tests, each asserting `fetchCalled = false` and `warnings: []`
- AC: Stale cache + successful refresh → fresh data, no warning, updates cache → PASS — test at `client.test.js:120`; asserts `cache.written[0].data === freshData`
- AC: Stale cache + failed refresh → stale data + `"stale registry data"` warning → PASS — three tests (fetchPackageMetadata, getVersionMetadata, getAttestations stale null)
- AC: No cache + failed fetch → `{ data: null, warnings: ["skipped: registry unreachable"] }` → PASS — tests at `client.test.js:189,202`
- AC: `noCache: true` bypasses cache read, fetches fresh, writes cache → PASS — test at `client.test.js:256`; asserts `cache.reads.length === 0` and `cache.written.length === 1`
- AC: Concurrency limiter caps at 10 parallel in-flight HTTP requests → PASS — test at `client.test.js:321`; asserts `inFlight === 10` after `setImmediate` tick and `peakInFlight === 10` after drain
- AC: Warning annotations are arrays of strings → PASS — test at `client.test.js:297`; asserts `Array.isArray` and each element `typeof === 'string'` for all three methods
- AC: `node --test test/registry/client.test.js` passes → PASS — 17/17 tests, 0 failures (verified live during review)

## Deferred Verification
- none

## Regression Risk
- Risk level: low
- Why: The client is a new file with no callers yet (F06 and F08 are deferred). Integration tests fully cover all degradation states with injected mocks. The semaphore is tested against a controlled 15-request burst with drain verification. Existing cache.js, npm-registry.js, and provenance.js tests continue to pass (56/56).

## Integration / Boundary Judgment
- Boundary: callee side — `src/registry/client.js` → `cache.js`, `npm-registry.js`, `provenance.js` (real imports, no stubs)
- Judgment: complete
- Notes: Caller side (policy engine F06, CLI commands F08) is correctly deferred per story spec. The `_value` envelope design correctly prevents `null` from being coerced to `{}` through the cache's object-spread write path (`client.js:176-190`).

## Test Results
- Command run: `node --test test/registry/client.test.js`
- Result: 17/17 pass — 0 failures
- Command run: `node --test test/registry/cache.test.js test/registry/npm-registry.test.js test/registry/provenance.test.js test/registry/client.test.js`
- Result: 56/56 pass — 0 failures

## Context Updates Made
File: `context/modules/registry/pitfalls.md` (new — see commit)
- Attestation null round-trips as `{}` without `_value` envelope. Fix: wrap before `cache.set`, unwrap after `cache.get`. Files: `src/registry/client.js:176-190`.
- `noCache: true` still writes to cache (write-through is intentional). Files: `src/registry/client.js:93-128`.
- Semaphore pre-increments for queued waiters in `release()` — avoid double-incrementing if adjusting. Files: `src/registry/client.js:22-44`.

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-021
- Branch: burnish/task-021-implement-registry-client-facade-with-degradation-and-concurrency
- ADRs cited: ADR-001 (`docs/adrs/ADR-001-zero-runtime-dependencies.md`), ADR-003 (`docs/adrs/ADR-003-registry-caching-and-offline-behavior.md`)
- Story cited: `docs/stories/F03-S03-registry-client-facade-with-degradation-and-concurrency.md`
- Design note cited: `docs/design-notes/F03-S03-approach.md`
- Global context cited: `context/global/conventions.md`, `context/global/architecture.md`
