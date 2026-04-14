# Design Approach: F03-S01 File-based Cache with TTL

## Summary
Implement a file-based cache module (`src/registry/cache.js`) that wraps registry responses as JSON files with embedded `_cachedAt` timestamps. The module exports a `createCache(cacheDir)` factory returning `get(key, ttlMs)`, `set(key, data)`, and `invalidate(key)` methods. TTL freshness is computed at read time by comparing `_cachedAt + ttlMs` against `Date.now()`. Writes use atomic temp-file + rename to prevent corruption.

This is the foundational layer for the ADR-003 degradation hierarchy. The `client.js` in F03-S03 will import this cache and use `{ data, fresh }` to determine whether to use cached data directly or annotate findings as stale.

## Key Design Decisions

1. **`createCache(cacheDir)` factory pattern**: Returns an object with `get/set/invalidate` bound to the provided `cacheDir`. This lets callers inject different directories (e.g., real `.trustlock/.cache/` vs temp dir in tests) without global state.

2. **Key encoding via `/`→`%2f` replacement**: `@scope/name` → `@scope%2fname`. Only the forward slash is unsafe in filenames; `@` is safe. This is lighter than full `encodeURIComponent` and matches the spec example exactly.

3. **Atomic write via temp+rename**: Write to `<key>.json.tmp.<random-hex>` then `fs.rename()`. The random hex suffix prevents collisions between concurrent writes. If rename fails, silently cleanup the temp file.

4. **`_cachedAt` stripped from returned `data`**: The timestamp is an internal cache implementation detail. Callers receive `{ data, fresh }` where `data` is the original payload without `_cachedAt`.

5. **All errors swallowed gracefully**: `get()` catches both ENOENT and JSON parse errors and returns `null`. `set()` swallows all write errors. Cache is best-effort per ADR-003.

6. **Zero runtime dependencies**: Uses only `node:fs/promises`, `node:path`, and `node:crypto` — all built-in. ADR-001 compliant.

## Integration / Wiring
- **Callee-side (this story)**: Owns the exported contract: `get(key, ttlMs) → { data, fresh: boolean } | null`, `set(key, data) → void`, `invalidate(key) → void`.
- **Caller-side (deferred to F03-S03)**: `client.js` will import `createCache` and wire it around HTTP calls. F03-S03 owns that caller-side wiring.
- No callers exist yet; the seam is the exported function signatures and the documented `{ data, fresh }` return shape.

## Files to Create/Modify
- `src/registry/cache.js` — new file, `createCache` factory with `get/set/invalidate`
- `test/registry/cache.test.js` — new file, unit tests covering all ACs

## Testing Approach
Using `node:test` (built-in). Tests use real `tmp` directories via `os.tmpdir()` + `mkdtemp`. No mocking needed since the module has no external dependencies. To simulate stale cache, write a file directly with a past `_cachedAt` value rather than sleeping.

## Acceptance Criteria / Verification Mapping
- AC1: `createCache(cacheDir)` returns object with `get/set` → Verification: import and inspect exported shape
- AC2: `set(key, data)` writes `{ ...data, _cachedAt }` atomically → Verification: test writes a file and reads it back raw
- AC3: `get` returns `{ data, fresh: true }` within TTL → Verification: `cache.test.js` fresh-hit test
- AC4: `get` returns `{ data, fresh: false }` past TTL → Verification: `cache.test.js` stale-hit test (manual past timestamp)
- AC5: `get` returns `null` for missing file → Verification: `cache.test.js` miss test
- AC6: `get` returns `null` for corrupted JSON → Verification: `cache.test.js` corrupt test
- AC7: `set()` creates cache directory if missing → Verification: `cache.test.js` dir-creation test
- AC8: scoped package key `@scope/name` → safe filename → Verification: `cache.test.js` scoped-key test
- AC9: `node --test test/registry/cache.test.js` passes → Verification: full test run

## Verification Results
Command: `node --test test/registry/cache.test.js`
Result: 11 pass, 0 fail, 0 skip

- AC1: PASS — `createCache(cacheDir)` returns object with `get/set/invalidate`; verified by import and all test instantiations
- AC2: PASS — `set writes _cachedAt into the JSON file` test reads raw file and confirms `{ ...data, _cachedAt }` shape; atomic write via temp+rename confirmed in source
- AC3: PASS — `set writes data and get returns fresh result within TTL` test passes
- AC4: PASS — `get returns stale result when TTL is expired` test passes (manual past `_cachedAt`)
- AC5: PASS — `get returns null for a missing cache file` test passes
- AC6: PASS — `get returns null for a corrupted cache file` test passes; also `get does not throw when cache file is empty` covers empty file case
- AC7: PASS — `set creates cache directory if it does not exist` test passes (nested path `does/not/exist`)
- AC8: PASS — `scoped package key @scope/name is encoded to a safe filename` test verifies file is written as `@babel%2fcore.json` and `get()` resolves via same key
- AC9: PASS — `node --test test/registry/cache.test.js` → 11 pass, 0 fail

## Documentation Updates
None — no changes to setup, interfaces documented externally, or operator workflow.

## Deployment Impact
None — new internal module, no env vars, no dependencies, no CI changes.

## Questions/Concerns
- `invalidate(key)` is listed in-scope in the story description but has no explicit AC. Implemented for completeness as F03-S03 may need it for `--no-cache` support.
- Concurrent-write test verifies no corruption but cannot deterministically prove rename atomicity; OS-level guarantee is relied upon.

## Stubs
None — all logic is real: `Date.now()`, TTL comparison, atomic write, directory creation, and key encoding are all implemented.
