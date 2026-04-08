# Review Handoff: task-024 — F04-S03 Baseline Advancement and Auto-Staging

## Status
Ready for review.

## Summary
Implemented `advanceBaseline()` and `writeAndStage()` in `src/baseline/manager.js` per story F04-S03. All 7 acceptance criteria pass. 18 unit tests pass (9 existing, 9 new).

## What Was Implemented

### `advanceBaseline(baseline, admittedDeps, lockfileHash)`
Merges a full set of resolved dependencies into an existing baseline:
- Packages with same name+version → retain original TrustProfile (preserving `admittedAt`, `provenanceStatus`)
- New packages or version changes → fresh TrustProfile (current timestamp, `provenanceStatus: 'unknown'`)
- Old baseline entries absent from `admittedDeps` → silently dropped (D3)
- Returns updated baseline with `updated_at` and new `lockfile_hash`

### `writeAndStage(baseline, baselinePath, [opts])`
Atomic write (temp file + rename per conventions) + auto-staging:
- Writes 2-space-indented JSON to `baselinePath`
- Calls `gitAdd('.dep-fence/baseline.json')` (ADR-002 hardcoded path)
- On `gitAdd` failure: writes `"Warning: could not auto-stage baseline file\n"` to stderr, does not throw

## Files Changed
- `src/baseline/manager.js` — added `advanceBaseline`, `writeAndStage`, updated imports
- `test/baseline/manager.test.js` — 9 new tests covering all ACs and edge cases

## Key Design Decisions
- `admittedDeps` is the full current lockfile dep set (not just delta). Removals are detected by absence from this set.
- `_gitAdd` dependency injection via optional 3rd parameter for unit testability (underscore prefix marks internal use).
- `updated_at` field added on advancement; `created_at` preserved from original baseline.

## Verification
```
node --test test/baseline/manager.test.js
# 18 pass, 0 fail
```

## Deferred Integration
CLI check command (F08) will call `advanceBaseline` then `writeAndStage`. The seam is explicit via named exports. Caller is responsible for mode guards (D1, D10).

## No Stubs
- `advanceBaseline` performs real package merging
- `writeAndStage` does real atomic file I/O
- `gitAdd` injection is test-only; production path uses the real `gitAdd` from `src/utils/git.js`
