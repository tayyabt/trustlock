# Story: F03-S01 — File-based Cache with TTL

## Parent
F03: Registry Client & Caching

## Description
Implement the cache layer in `src/registry/cache.js` that stores registry responses as JSON files with fetch timestamps, checks TTLs on read, and performs atomic writes. This is the foundation for the degradation hierarchy defined in ADR-003 — all registry data flows through this cache before reaching callers.

## Scope
**In scope:**
- `src/registry/cache.js` — `get(key, ttlMs)`, `set(key, data)`, `invalidate(key)`, cache directory management
- `test/registry/cache.test.js` — unit tests for all cache operations

**Not in scope:**
- HTTP fetching (S02)
- Degradation logic or concurrency limiting (S03)
- Policy evaluation or baseline management

## Entry Points
- Route / page / screen: N/A (internal cache layer, no UI)
- Trigger / navigation path: Imported by `client.js` (F03-S03) to wrap registry HTTP calls
- Starting surface: `src/registry/cache.js` is a new file created by this story

## Wiring / Integration Points
- Caller-side ownership: `client.js` (F03-S03) will import `get()` and `set()`. Caller does not exist yet — seam is the exported function signatures.
- Callee-side ownership: This story owns the cache read/write/TTL logic. `get(key, ttlMs)` returns `{ data, fresh }` or `null`. `set(key, data)` writes atomically with `_cachedAt` timestamp.
- Caller-side conditional rule: Caller (`client.js`) does not exist yet. The exported contract is: `get(key, ttlMs) → { data, fresh: boolean } | null`, `set(key, data) → void`. F03-S03 will wire to this.
- Callee-side conditional rule: No callers exist yet. Exports must be stable for S03 integration.
- Boundary / contract check: Unit tests verify `get()` returns `{ data, fresh: true }` for within-TTL, `{ data, fresh: false }` for expired-TTL, and `null` for missing cache.
- Files / modules to connect: `src/registry/cache.js` (new)
- Deferred integration, if any: Integration with HTTP client deferred to F03-S03.

## Not Allowed To Stub
- `_cachedAt` timestamp injection — must be real `Date.now()` value written into cached JSON
- TTL checking logic — must compare `_cachedAt + ttlMs` against current time, not a passthrough
- Atomic write — must write to temp file then rename, not direct write to final path
- Cache directory creation — must create `.dep-fence/.cache/` if it does not exist on first write

## Behavioral / Interaction Rules
- `get()` must never throw — corrupted JSON (invalid parse) returns `null` (treated as cache miss)
- `set()` must never throw — write failures are silently swallowed (cache is best-effort)

## Acceptance Criteria
- [ ] `cache.js` exports `createCache(cacheDir)` that returns an object with `get(key, ttlMs)` and `set(key, data)` methods
- [ ] `set(key, data)` writes `{ ...data, _cachedAt: <timestamp> }` to `<cacheDir>/<key>.json` using atomic temp-file + rename
- [ ] `get(key, ttlMs)` returns `{ data, fresh: true }` when `_cachedAt + ttlMs > Date.now()`
- [ ] `get(key, ttlMs)` returns `{ data, fresh: false }` when `_cachedAt + ttlMs <= Date.now()` (stale)
- [ ] `get(key, ttlMs)` returns `null` when cache file does not exist
- [ ] `get(key, ttlMs)` returns `null` when cache file contains invalid JSON (corrupted)
- [ ] `set()` creates the cache directory if it does not exist
- [ ] Cache key encoding handles scoped packages: `@scope/name` becomes a safe filename (e.g., `@scope%2fname.json`)
- [ ] `node --test test/registry/cache.test.js` passes

## Task Breakdown
1. Create `src/registry/cache.js` with `createCache(cacheDir)` factory returning `get()` and `set()` methods
2. Implement atomic write in `set()`: write to `<key>.json.tmp`, then `fs.rename()` to `<key>.json`
3. Implement TTL check in `get()`: parse JSON, compare `_cachedAt + ttlMs` vs `Date.now()`
4. Implement safe filename encoding for cache keys (handle `@scope/name` → URL-encoded path)
5. Add error handling: corrupted JSON → return null, write failure → swallow
6. Write `test/registry/cache.test.js` covering: fresh hit, stale hit, miss, corrupted file, directory auto-creation, scoped package keys, concurrent writes

## Verification
```
node --test test/registry/cache.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Cache file corrupted (invalid JSON) — treat as cache miss, not crash (feature brief edge case #5)
- Cache directory does not exist — create on first write (feature brief edge case #6)
- Scoped package names — `@scope/name` must produce a valid filename (feature brief edge case #7)
- Concurrent cache writes for same package — atomic write (temp + rename) prevents corruption (feature brief edge case #10)

## Dependencies
- Depends on: F01 (shared utilities — project structure must exist)
- Blocked by: none

## Effort
M — Atomic file writes, TTL logic, safe filename encoding, comprehensive error handling

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
