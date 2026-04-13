# Review Artifact: task-079 — Fix npm v2/v3 parser crash on workspace link entries

## Outcome

Ready for review. All required acceptance criteria pass.

## Summary

Added a one-line guard `if (entry.link === true) continue;` in `_parseV2V3` (`src/lockfile/npm.js`) immediately after the root-entry skip. This prevents workspace link entries (which have no `version` field) from reaching `validateDependency`, eliminating the crash.

Six regression tests added to `test/lockfile/npm.test.js` covering v2 and v3 lockfiles with link entries.

## Acceptance Criteria

| AC | Status |
|----|--------|
| `init`/`audit` complete without error on workspace lockfile | PASS |
| Workspace link entries not in parsed array | PASS |
| Non-link entries still parsed correctly | PASS |
| Regression unit test for link entry exclusion | PASS |

## Verification

- `node --test test/lockfile/npm.test.js` → 45 tests, 0 failures (6 new regression tests all green)
- Full `npm test` run: all npm-parser suites pass; other pre-existing failures are in unrelated modules (`args.js`, `parseYarn`, `parseUv`, `formatCheckResults`) and were present before this change

## Files Changed

- `src/lockfile/npm.js` — 4-line guard added at line 103
- `test/lockfile/npm.test.js` — 6 new regression tests in 2 describe blocks

## Design Note

`docs/design-notes/task-079-approach.md`
