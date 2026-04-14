# Bug: progress.test.js placed in src/utils/__tests__/ instead of test/unit/utils/

## Summary
`src/utils/__tests__/progress.test.js` was placed inside the source tree, violating the global convention that tests go in `test/` mirroring source structure (`test/unit/utils/`).

## Root Cause
The F10-S1 story's verification section and the task-060 output binding both explicitly specified `src/utils/__tests__/progress.test.js`. The developer followed the spec faithfully. The spec was incorrect.

## Expected Behavior
Test file should be at `test/unit/utils/progress.test.js`, consistent with:
- `test/unit/utils/paths.test.js` (existing precedent)
- Global conventions: "Tests in `test/` mirroring source structure (unit/, integration/)"

## Steps to Reproduce
1. Open `src/utils/__tests__/progress.test.js`
2. Compare to `test/unit/utils/paths.test.js`
3. Note the inconsistency

## Impact
- Test discovery scripts targeting `test/` will miss `progress.test.js`
- New contributors will be confused by split test locations
- Future module tests may follow the wrong pattern

## Fix
Move `src/utils/__tests__/progress.test.js` → `test/unit/utils/progress.test.js`.
Remove the now-empty `src/utils/__tests__/` directory.
Verify `node --test test/unit/utils/progress.test.js` still passes all 22 tests.

## Source
Identified in task-060 code review (F10-S1 progress counter utility).

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Sprint: 3
- Priority: low
