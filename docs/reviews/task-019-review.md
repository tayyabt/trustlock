# Code Review: task-019 — Implement File-based Cache with TTL

## Summary
Implementation of `src/registry/cache.js` is complete and correct. All 9 acceptance criteria are satisfied, 11 tests pass, no stubs present, and the design note provides honest per-AC verification mapping. The module is ready to serve as the foundation for the ADR-003 degradation hierarchy.

## Verdict
Approved

## Findings

No blocking findings. One informational observation recorded below.

### `_cachedAt` stored as epoch ms (not ISO 8601 string)
- **Severity:** suggestion
- **Finding:** `src/registry/cache.js:54` stores `_cachedAt` as `Date.now()` (millisecond epoch integer). The global conventions (`context/global/conventions.md`) state "Timestamps are ISO 8601 UTC strings" for persisted data. However, `_cachedAt` is an internal cache implementation detail used exclusively for TTL arithmetic (`_cachedAt + ttlMs > Date.now()`), and is stripped before being returned to callers.
- **Proposed Judgment:** No change required. Using a numeric epoch is the only practical choice for TTL arithmetic. The conventions sentence targets user-facing persisted data (findings, baseline, approvals). This field never surfaces to callers or users.
- **Reference:** `context/global/conventions.md` — "Timestamps are ISO 8601 UTC strings"; story AC2; ADR-003 cache-first logic

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — N/A (internal cache layer, no UI or user-facing workflow)
- [x] Architecture compliance (follows ADR-001 zero-deps, ADR-003 cache contract)
- [ ] Design compliance — N/A (no UI)
- [x] Behavioral / interaction rule compliance (`get()` never throws, `set()` never throws)
- [x] Integration completeness (callee-side contract stable; caller F03-S03 deferred per story)
- [ ] Pitfall avoidance — no module pitfalls file present for registry module
- [x] Convention compliance (ES modules, kebab-case filename, camelCase functions, atomic writes)
- [x] Test coverage (all 9 ACs tested, plus `invalidate`, empty-file, concurrent-write edge cases)
- [x] Code quality & documentation (design note complete, no dead code, no stubs)

## Acceptance Criteria Judgment
- AC1: `createCache(cacheDir)` returns object with `get/set` → **PASS** — `export function createCache(cacheDir)` returns `{ get, set, invalidate }` at `cache.js:78`; verified by all test instantiations
- AC2: `set(key, data)` writes `{ ...data, _cachedAt }` atomically → **PASS** — `cache.js:54` spreads data with `_cachedAt: Date.now()`; writes to `.tmp.<hex>` then `fs.rename()`; test "set writes _cachedAt into the JSON file" reads raw file and confirms shape
- AC3: `get` returns `{ data, fresh: true }` within TTL → **PASS** — `cache.js:34`; test "set writes data and get returns fresh result within TTL" passes
- AC4: `get` returns `{ data, fresh: false }` past TTL → **PASS** — `cache.js:34` same expression evaluates false; test "get returns stale result when TTL is expired" (manual past `_cachedAt`) passes
- AC5: `get` returns `null` for missing file → **PASS** — ENOENT caught at `cache.js:36`; test "get returns null for a missing cache file" passes
- AC6: `get` returns `null` for corrupted JSON → **PASS** — `JSON.parse` throws caught at `cache.js:36`; tests "get returns null for a corrupted cache file" and "get does not throw when cache file is empty" both pass
- AC7: `set()` creates cache directory if missing → **PASS** — `mkdir(cacheDir, { recursive: true })` at `cache.js:56`; test "set creates cache directory if it does not exist" uses nested non-existent path and passes
- AC8: scoped key `@scope/name` → safe filename → **PASS** — `encodeKey` at `cache.js:10` replaces `/` with `%2f`; test "scoped package key @scope/name is encoded to a safe filename" reads `@babel%2fcore.json` directly and passes
- AC9: `node --test test/registry/cache.test.js` passes → **PASS** — 11 pass, 0 fail, confirmed by reviewer

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: Entirely new module with no pre-existing callers. The only regression risk is to F03-S03 (not yet implemented) if the exported contract changes. Contract is stable: `get(key, ttlMs) → { data, fresh } | null`, `set(key, data) → void`, `invalidate(key) → void`.

## Integration / Boundary Judgment
- Boundary: callee-side seam — `createCache` exported contract consumed by `client.js` (F03-S03)
- Judgment: complete for this story's scope
- Notes: Callee contract is fully specified and tested. Caller-side wiring is explicitly deferred to F03-S03 per the story's "Wiring / Integration Points" section. No integration gap exists within this story's ownership boundary.

## Test Results
- Command run: `node --test test/registry/cache.test.js`
- Result: 11 pass, 0 fail, 0 skip — duration 138ms

## Context Updates Made
No context updates needed. No reusable pitfalls or guidance emerged beyond what is already expressed in the story spec and ADR-003.

## Metadata
- Agent: reviewer
- Date: 2026-04-08
- Task: task-019
- Branch: burnish/task-019-implement-file-based-cache-with-ttl
- Artifacts reviewed: docs/stories/F03-S01-file-based-cache-with-ttl.md, docs/design-notes/F03-S01-approach.md, src/registry/cache.js, test/registry/cache.test.js, docs/adrs/ADR-001-zero-runtime-dependencies.md, docs/adrs/ADR-003-registry-caching-and-offline-behavior.md, context/global/conventions.md
