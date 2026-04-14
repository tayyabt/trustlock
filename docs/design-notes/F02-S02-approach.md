# Design Note: F02-S02 — Format Detection and Parser Router

## Summary
Implement `src/lockfile/parser.js` with `detectFormat(lockfilePath)` and `parseLockfile(lockfilePath, packageJsonPath)` per ADR-004. The router auto-detects npm lockfile format by filename and `lockfileVersion`, fails hard (exit 2) on unrecognized versions, and delegates to the npm parser. Tests cover v1/v2/v3 detection, unknown versions, missing lockfiles, and router dispatch.

## Approach

### detectFormat(lockfilePath)
- Reads the lockfile with `node:fs/promises` → exit 2 if file missing
- Parses JSON → exit 2 if invalid JSON
- Checks filename: `package-lock.json` → npm path; anything else → exit 2 (pnpm/yarn deferred to v0.2)
- Reads `lockfileVersion` field: 1/2/3 → returns `{ format: "npm", version: N }`; null/missing/other → exit 2 with "Unsupported npm lockfile version X. trustlock supports v1, v2, v3."

### parseLockfile(lockfilePath, packageJsonPath)
- Reads lockfile once, parses JSON, uses a shared `_detectFromParsed(parsed, filename)` helper (to avoid double file-reads)
- Reads `packageJsonPath` (needed for `directDependency` flags in npm parser)
- Delegates to `parseNpm(lockfileContent, packageJsonContent)` from `./npm.js`

### Private helper: `_detectFromParsed(parsed, filename)`
Both `detectFormat()` and `parseLockfile()` use this helper to avoid reading the file twice in `parseLockfile()`. The helper owns the version-check logic and exit-2 behavior.

## Integration / Wiring Plan
- `src/lockfile/parser.js` imports `parseNpm` from `./npm.js`
- `npm.js` does not yet exist (F02-S03). A documented stub is created in `src/lockfile/npm.js` returning `[]` so the router is testable and the import seam is real.
- CLI callers do not exist (F08). `parseLockfile` export contract is the seam.

## Files Expected to Change
| File | Action |
|---|---|
| `src/lockfile/parser.js` | Create — router with `detectFormat` and `parseLockfile` |
| `src/lockfile/npm.js` | Create — documented stub (placeholder for F02-S03) |
| `test/lockfile/parser.test.js` | Create — unit tests |
| `test/fixtures/lockfiles/npm-v1.json` | Create — v1 fixture |
| `test/fixtures/lockfiles/npm-v2.json` | Create — v2 fixture |
| `test/fixtures/lockfiles/npm-v3.json` | Create — v3 fixture |
| `test/fixtures/lockfiles/npm-v4-unknown.json` | Create — unknown version fixture |
| `test/fixtures/lockfiles/npm-no-version.json` | Create — missing lockfileVersion fixture |
| `test/fixtures/lockfiles/package.json` | Create — test package.json for dispatch tests |

## Acceptance Criteria to Verification Mapping
| AC | Verification |
|---|---|
| `detectFormat()` returns `{ format: "npm", version: 1/2/3 }` | Tests: detectFormat with v1/v2/v3 fixture files |
| Unknown version → exit 2 with message | Tests: detectFormat with v4 and missing-version fixtures; process.exit mock captures code and message |
| `parseLockfile()` reads, detects, delegates | Tests: parseLockfile with valid v2 fixture; stub parseNpm returns [] |
| Missing lockfile → exit 2 | Tests: detectFormat and parseLockfile with nonexistent path |
| Router imports and calls npm parser | Wired via import in parser.js; stub verifiable in tests; end-to-end in F02-S03 |
| `node --test test/lockfile/parser.test.js` passes | Run during verification |

## Test Strategy
- Node.js built-in `node:test` runner (no external test framework)
- `process.exit` is mocked in each exit-2 test by replacing it temporarily, capturing the exit code, then restoring — the mocked exit throws so async code aborts
- `console.error` is silenced during exit-2 tests to keep test output clean
- Fixtures are small hand-crafted JSON files in `test/fixtures/lockfiles/`

## Stubs Documented
- `src/lockfile/npm.js` — exports `parseNpm(lockfileContent, packageJsonContent)` returning `[]`. This is a seam placeholder for F02-S03. It is a true external dependency from the perspective of this story (the module is explicitly deferred per the story spec). The stub allows the router's import wiring and dispatch path to be exercised in tests.

## Risks and Questions
- `process.exit` mocking in node:test: standard pattern, works fine for async functions that call exit immediately. The mock throws so the async function rejects rather than calling real exit.
- No risks on implementation — the logic is straightforward per ADR-004.

## Revision Scope
N/A — initial implementation.

---

## Verification Results

### 2026-04-08 Developer: Implementation

```
node --test test/lockfile/parser.test.js
ℹ tests 15
ℹ pass 15
ℹ fail 0
ℹ duration_ms 113
```

#### AC: `detectFormat()` returns `{ format: "npm", version: 1/2/3 }`
- Status: PASS — tests: "returns { format: npm, version: 1/2/3 } for lockfileVersion 1/2/3"

#### AC: Unknown version → exit 2 with message "Unsupported npm lockfile version X. trustlock supports v1, v2, v3."
- Status: PASS — tests: "exit 2 for lockfileVersion 4 with exact error message", "exit 2 when lockfileVersion field is missing"

#### AC: `parseLockfile()` reads, detects, delegates to npm parser
- Status: PASS — tests: dispatch suite (v1/v2/v3 return arrays via stub); end-to-end through real npm.js deferred to F02-S03

#### AC: Missing lockfile → exit 2 with descriptive error
- Status: PASS — tests: "exit 2 when lockfile path does not exist" (detectFormat + parseLockfile)

#### AC: Router imports and calls the npm parser module
- Status: PASS (seam in place) — parser.js imports parseNpm from ./npm.js; end-to-end in F02-S03

#### AC: `node --test test/lockfile/parser.test.js` passes
- Status: PASS — 15/15 tests pass, 0 failures
