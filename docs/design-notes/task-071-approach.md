# Design Note: task-071 — Fix progress.test.js Location

## Summary

`src/utils/__tests__/progress.test.js` was placed inside the source tree,
violating the global convention that tests belong in `test/` mirroring source
structure. The file was originally created on the `task-060` branch but never
merged to `main`, so it does not exist in the current worktree at all. The fix
creates it in the correct location (`test/unit/utils/progress.test.js`) with
the corrected relative import path.

## Root Cause

The F10-S1 story's verification section and the task-060 output binding both
specified `src/utils/__tests__/progress.test.js`. The developer followed the
spec faithfully. The spec was wrong. The task-060 branch was never merged;
therefore the test file does not exist on `main` or this branch at all.

## Approach

1. Create `test/unit/utils/progress.test.js` from the test body recovered from
   commit `22c2af2` on the `burnish/task-060-...` branch.
2. Fix the import path: `'../progress.js'` → `'../../../src/utils/progress.js'`
   (matches the `paths.test.js` precedent in the same directory).
3. `src/utils/__tests__/` does not exist on this branch, so no deletion needed.
4. Verify all 22 tests pass via `node --test test/unit/utils/progress.test.js`.

## Files Expected to Change

| File | Action |
|------|--------|
| `test/unit/utils/progress.test.js` | Create (new file at correct location) |

## Stubs

None. `createProgress` is a real export from `src/utils/progress.js`.

## Acceptance-Criteria-to-Verification Mapping

| AC | Criterion | Verification |
|----|-----------|--------------|
| AC1 | Bug ACs satisfied — test at correct location | `test/unit/utils/progress.test.js` exists; `src/utils/__tests__/` absent |
| AC2 | Behavior preserved | all 22 tests pass |
| AC3 | Design note captures root cause | this document |

## Test Strategy

Run the test file directly with the Node.js built-in test runner:
```
node --test test/unit/utils/progress.test.js
```
Expected: 22 passing tests, 0 failures.

Also verify no stray test file exists in `src/utils/__tests__/`.

## Risks and Questions

- None. The test body is recovered verbatim from git history; only the import
  path changes.

---

## Verification Results

### AC1 — Test file at correct location, no stray file in source tree

- `test/unit/utils/progress.test.js`: **PRESENT** (created by this task)
- `src/utils/__tests__/`: **ABSENT** (never existed on this branch)
- Result: **PASS**

### AC2 — All 22 tests pass

```
node --test test/unit/utils/progress.test.js
tests 22 | pass 22 | fail 0 | duration_ms ~99
```
Result: **PASS**

### AC3 — Design note documents root cause

- Root cause section: present (see above)
- Result: **PASS**
