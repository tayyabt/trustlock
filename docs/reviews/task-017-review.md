# Review Artifact: task-017 — Format Detection and Parser Router

## Status
Ready for review

## Implementation Summary
Implemented `src/lockfile/parser.js` with `detectFormat(lockfilePath)` and `parseLockfile(lockfilePath, packageJsonPath)` per ADR-004. Created a documented stub `src/lockfile/npm.js` as the seam for F02-S03. Added 15 unit tests covering all ACs.

## Files Delivered
### Source
- `src/lockfile/parser.js` — format detection and router
- `src/lockfile/npm.js` — seam stub for F02-S03

### Tests
- `test/lockfile/parser.test.js` — 15 tests, all passing
- `test/fixtures/lockfiles/npm-v1.json` — v1 fixture
- `test/fixtures/lockfiles/npm-v2.json` — v2 fixture
- `test/fixtures/lockfiles/npm-v3.json` — v3 fixture
- `test/fixtures/lockfiles/npm-v4-unknown.json` — unknown version fixture
- `test/fixtures/lockfiles/npm-no-version.json` — missing lockfileVersion fixture
- `test/fixtures/lockfiles/package.json` — companion package.json for dispatch tests

### Docs
- `docs/design-notes/F02-S02-approach.md`

## Verification
```
node --test test/lockfile/parser.test.js
ℹ tests 15  ℹ pass 15  ℹ fail 0
```

## Acceptance Criteria
| AC | Status |
|---|---|
| `detectFormat()` returns `{ format: "npm", version: 1/2/3 }` | PASS |
| Unknown version → exit 2 with exact message | PASS |
| `parseLockfile()` reads, detects, delegates to npm parser | PASS |
| Missing lockfile → exit 2 | PASS |
| Router imports and calls npm parser (end-to-end in F02-S03) | PASS (seam in place) |
| `node --test test/lockfile/parser.test.js` passes | PASS |

## Stubs
- `src/lockfile/npm.js` exports `parseNpm()` returning `[]`. This is the seam for F02-S03 (npm v1/v2/v3 parsing). Documented in design note.

## Notes for Reviewer
- `_detectFromParsed(parsed, filename)` is a private helper shared by both public functions to avoid reading the lockfile twice in `parseLockfile()`.
- `process.exit` mocking in tests follows a clean intercept pattern: replaces with a throw, saves/restores around each exit-2 test, with a module-level `afterEach` safety net.
- pnpm/yarn branches are explicitly not implemented (v0.2 scope per ADR-004).
