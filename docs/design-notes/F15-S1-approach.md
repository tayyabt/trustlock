# Design Approach: F15-S1 — policy/inherit.js: extends resolution, fetch, cache, and deep-merge

## Summary

Create `src/policy/inherit.js` as the leaf module for all `extends` resolution logic. It exports two named functions: `resolveExtends(extendsValue, configFilePath, cacheDir)` (returns the base policy pre-merge) and `mergePolicy(base, repo)` (performs the deep-merge with floor enforcement). `loader.js` (F15-S2) will call both. The module uses only `node:https`, `node:http`, `node:fs/promises`, `node:path`, and `node:os` — no runtime dependencies (ADR-001) and no imports from `src/registry/` (C6 compliance).

The implementation follows ADR-005 Option 1 semantics exactly: two-pass sequential merge with eager floor checks. `resolveExtends` handles URL detection, remote fetch, 1-hour cache TTL, stale-cache fallback, chained-extends stripping, and local path reads. `mergePolicy` implements scalar override with floor check, array union, and object deep-merge in a single recursive pass.

## Key Design Decisions

1. **Two named exports (`resolveExtends` + `mergePolicy`)**: The story requires both resolution and merge semantics in this module. `resolveExtends` returns a pre-merge `PolicyObject`; `mergePolicy` is a pure function the caller (loader.js S2) applies. Separating them makes each independently testable. ADR-005 §merge-semantics.

2. **`node:https` + `node:http` for fetch**: ADR-001 mandates zero runtime dependencies. The test mock server runs on `http://`, so both modules are needed. HTTPS is used for production remote URLs; HTTP handles the test server.

3. **Cache write after strip + parse**: Chained `extends` is stripped and the warning emitted _before_ writing the cache, so the cached policy never contains the discarded `extends` key. Subsequent reads from fresh cache do not re-trigger the warning.

4. **`mergePolicy` recursive only one level for objects**: ADR-005 specifies "one-level deep merge — profile/repo keys override base keys". Nested objects (`provenance`, `scripts`, `sources`, `pinning`, `approvals`, `transitive`) are merged one level deep. Deeper nesting falls through as scalar.

5. **Floor check key name for nested fields**: For a nested numeric field (e.g., `transitive.max_new`), the error message uses the nested key name (e.g., `max_new`). This matches the spec's field={value} format at the leaf level.

6. **Test runner is `node --test`**: The story verification command references jest, but jest is not installed; the project uses `node --test`. Tests are written for `node:test` + `node:assert/strict` to match the existing pattern in `test/policy/config.test.js`.

## Design Compliance

No UI or design artifacts — this is a pure library module. No deviations.

## Integration / Wiring

- **Callee-side (this task)**: `src/policy/inherit.js` exports `resolveExtends` and `mergePolicy`. These are the only public API.
- **Caller-side (deferred to F15-S2)**: `loader.js` does not exist yet. The seam is explicit: `inherit.js` exports its contract; `loader.js` imports and calls it. No stubs needed on the callee side.
- **Cache isolation (C6)**: Org policy cache is written to `{cacheDir}/org-policy.json`. `src/registry/cache.js` is never imported. Cache path is injected as a parameter so tests use a temp directory.
- **Error surfacing**: All fatal errors throw with `exitCode = 2`. The CLI's `main().catch()` handler (or loader.js's future handler) surfaces them. Warnings are written directly to `process.stderr`.

## Files to Create/Modify

- `src/policy/inherit.js` (new) — resolveExtends, mergePolicy, all fetch/cache/merge/floor logic
- `test/policy/inherit.test.js` (new) — 14 test cases covering all ACs

## Testing Approach

All tests use `node:test` and `node:assert/strict`. HTTP tests use a local `node:http.createServer` mock — no real network calls. Each test uses a `mkdtemp` temp directory so cache state is isolated. stderr is captured by temporarily replacing `process.stderr.write`.

Test groups:
1. `mergePolicy` unit tests (no I/O): scalar override, floor enforcement, array union, object deep-merge, nested floor enforcement.
2. `resolveExtends` local path tests: happy path, no-cache-write verification, not-found error, chained extends.
3. `resolveExtends` remote URL tests (mock HTTP server): fresh cache (no HTTP call), stale+reachable (refresh), stale+unreachable (warning), no-cache+unreachable (error), non-JSON (parse error), chained extends.

## Acceptance Criteria / Verification Mapping

- AC1 — exports `resolveExtends` named async function → module import test
- AC2 — no `src/registry` import → `grep -r "src/registry" src/policy/inherit.js` → no output
- AC3 — local path reads relative to configFilePath, no cache written → local-path happy path test
- AC4 — fresh cache → no HTTP call → mock server request count stays 0
- AC5 — stale cache + reachable → cache refreshed with new `fetched_at` → stale+reachable test
- AC6 — stale cache + unreachable → stale cache used, stderr warning with timestamp → stale+unreachable test
- AC7 — no cache + unreachable → error containing URL → no-cache+unreachable test
- AC8 — scalar merge: repo wins → `mergePolicy({cooldown_hours:72},{cooldown_hours:96})` → `96`
- AC9 — floor enforcement → `mergePolicy({cooldown_hours:72},{cooldown_hours:24})` → throws with exact message
- AC10 — array union → `mergePolicy({scripts:{allowlist:['build']}},{scripts:{allowlist:['test']}})` → `['build','test']`
- AC11 — object deep-merge → provenance merge test
- AC12 — chained extends stripped + stderr warning → chained-extends test (local and remote)
- AC13 — non-JSON → error naming URL → non-JSON test
- AC14 — local path not found → error with path → not-found test

## Verification Results

Command: `node --test test/policy/inherit.test.js` — 25/25 PASS

- AC1 — exports `resolveExtends` as named async → PASS — module import + function call in all remote/local tests
- AC2 — no `src/registry` import → PASS — `grep -r "src/registry" src/policy/inherit.js` → no output (exit 1)
- AC3 — local path, no cache written → PASS — "does not write cache file for local path" test verifies stat() throws on cache path
- AC4 — fresh cache, no HTTP call → PASS — "fresh cache (<1h)" test: requestCount stays 0
- AC5 — stale+reachable, cache refreshed → PASS — "stale cache + server reachable" test: requestCount=1, cache file updated with new fetched_at
- AC6 — stale+unreachable, stale cache + warning → PASS — stderr includes "Warning: could not reach policy URL, using cached copy from <timestamp>"
- AC7 — no cache + unreachable, error with URL → PASS — rejects with exitCode=2, message includes URL and "no cached copy exists"
- AC8 — scalar merge, repo wins → PASS — `mergePolicy({cooldown_hours:72},{cooldown_hours:96})` → 96
- AC9 — floor enforcement, exact message → PASS — `mergePolicy({cooldown_hours:72},{cooldown_hours:24})` throws exact message
- AC10 — array union → PASS — `scripts.allowlist:['build']` + `['test']` → `['build','test']`; org entry preserved
- AC11 — object deep-merge → PASS — `provenance:{required_for:['*']}` + `{block_on_publisher_change:false}` → both keys present
- AC12 — chained extends stripped + warning → PASS — both local and remote variants; stderr contains warning; extends key absent from result and cache
- AC13 — non-JSON, parse error with URL → PASS — rejects with exitCode=2, message includes URL
- AC14 — local path not found, error with path → PASS — rejects with exitCode=2, message includes path

Full suite: 728 tests total, 34 failures — all pre-existing (output/terminal color tests, args.js F10-S4 tests). Zero new failures introduced.

## Story Run Log Update

### 2026-04-11 developer: Implementation complete
- Reviewed story F15-S1, feature brief F15, ADR-005, ADR-001, global conventions
- Identified test runner as `node --test` (jest not installed, package.json uses `node --test`)
- Created `src/policy/inherit.js` (resolveExtends + mergePolicy + helpers)
- Created `test/policy/inherit.test.js` (25 tests, all PASS)
- `grep -r "src/registry" src/policy/inherit.js` → no output (C6 compliant)
- `.burnish/check-no-stubs.sh` → OK
- 34 pre-existing failures in suite (output/terminal, args.js); 0 new failures

## Documentation Updates

None — `inherit.js` is a new internal module. No public-facing docs, ENV vars, or CLI interfaces change in this story.

## Deployment Impact

None — new internal module. No new dependencies.

## Questions/Concerns

- The story's verification command uses jest (`node_modules/.bin/jest`), but jest is not installed. Tests are written for `node --test` instead, which matches the existing project test infrastructure.
- `mergePolicy` is tested in isolation; integration with `loader.js` (F15-S2) deferred.

## Metadata

- Agent: developer
- Date: 2026-04-11
- Work Item: F15-S1 / task-072
- Work Type: story
- Branch: burnish/task-072-implement-policy-inherit-js-extends-resolution-fetch-cache-and-deep-merge
- ADR: ADR-005, ADR-001
- Design Preview: none
- Design Notes Source: none
