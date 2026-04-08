# Review Artifact: task-019 — File-based Cache with TTL

## Status
Ready for review.

## Summary
Implemented `src/registry/cache.js` with a `createCache(cacheDir)` factory. The module provides `get(key, ttlMs)`, `set(key, data)`, and `invalidate(key)` methods backed by JSON files in the given cache directory.

## Verification
`node --test test/registry/cache.test.js` → **11 pass, 0 fail**

All 9 acceptance criteria PASS.

## Files Changed
- `src/registry/cache.js` — new, cache factory implementation
- `test/registry/cache.test.js` — new, 11 unit tests

## Implementation Notes
- Key encoding: `@scope/name` → `@scope%2fname` (slash-only replacement per spec example)
- Atomic write: temp file `<key>.json.tmp.<4-byte-hex>` then `fs.rename()`; temp file cleaned up on failure
- `_cachedAt` is stripped from the `data` returned by `get()` — it is an internal implementation detail
- `invalidate(key)` is implemented though not in the ACs; the story scope listed it and F03-S03 may use it for `--no-cache`
- Zero runtime dependencies: only `node:fs/promises`, `node:path`, `node:crypto`

## Design Note
`docs/design-notes/F03-S01-approach.md`
