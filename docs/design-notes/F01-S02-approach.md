# Design Note: F01-S02 — Semver Utility Module

## Summary
Implement `src/utils/semver.js` as a zero-dependency ES module exposing three pure functions: `parseVersion`, `compareVersions`, and `isRangeOperator`. Add comprehensive unit tests in `test/utils/semver.test.js` using the Node.js built-in test runner.

## Approach
Hand-roll a semver subset per ADR-001. No external libraries. The module covers:
- **`parseVersion(str)`** — regex-based parser returning `{ major, minor, patch, preRelease, buildMetadata }` or `null` for invalid input. Strips leading/trailing whitespace before parsing; rejects `v`-prefix and non-numeric version components.
- **`compareVersions(a, b)`** — compares two version strings numerically (major → minor → patch). Ignores build metadata per semver spec. Returns `-1`, `0`, or `1`. Pre-release versions sort before release per semver spec (e.g. `1.0.0-beta < 1.0.0`).
- **`isRangeOperator(str)`** — returns `true` if the string starts with or equals a range operator (`^`, `~`, `>`, `>=`, `<`, `<=`, `*`, `x`, `X`, `||`).

## Integration / Wiring Plan
This module is purely self-contained. No internal imports. Callers (F02 lockfile parser, F04 baseline diff, F06 policy engine) are not yet implemented — deferred to their respective tasks.

## Files Expected to Change
- **new** `src/utils/semver.js`
- **new** `test/utils/semver.test.js`

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| Exports `parseVersion`, `compareVersions`, `isRangeOperator` | Import test in test file |
| `parseVersion("1.2.3")` → `{ major:1, minor:2, patch:3, preRelease:null, buildMetadata:null }` | Unit test |
| `parseVersion("1.0.0-beta.1")` parses preRelease | Unit test |
| `parseVersion("1.0.0+build.123")` parses buildMetadata | Unit test |
| `parseVersion("")` and `parseVersion("not-a-version")` return `null` | Unit test |
| `compareVersions("1.0.0", "2.0.0")` → `-1`; equal → `0`; build metadata ignored | Unit test |
| `isRangeOperator("^1.0.0")` → `true`; `isRangeOperator("1.0.0")` → `false` | Unit test |
| Edge cases (pre-release hyphen, build metadata, empty, invalid chars) have passing tests | Unit tests |
| `node --test test/utils/semver.test.js` passes | Run verification command |

## Test Strategy
Single test file `test/utils/semver.test.js` using `node:test` and `node:assert`. Tests grouped by function. Covers all ACs plus edge cases from the story: spaces, `v`-prefix, very large numbers, `null`/`undefined` inputs, `compareVersions` with pre-release ordering.

## Risks and Questions
- Pre-release comparison ordering: semver spec says `1.0.0-alpha < 1.0.0`. Implementing per spec since downstream policy may depend on it. No story requirement explicitly says to skip this, but story also doesn't list it as a required AC. Will implement correctly rather than partially.
- Story says `isRangeOperator` must detect `||` — this is a multi-char operator so the check must handle it as a prefix/equality test, not just single-char prefix matching.

## Stubs
None. All functions are fully implemented in this story.

## Verification Results

| AC | Status | Evidence |
|---|---|---|
| Exports `parseVersion`, `compareVersions`, `isRangeOperator` | PASS | `module exports` describe block, 3 tests passing |
| `parseVersion("1.2.3")` → `{ major:1, minor:2, patch:3, preRelease:null, buildMetadata:null }` | PASS | `parses a simple version string` test |
| Pre-release parsing (`1.0.0-beta.1`) | PASS | `parses pre-release identifier` test |
| Build metadata parsing (`1.0.0+build.123`) | PASS | `parses build metadata` test |
| Invalid input returns `null` (empty string, `not-a-version`) | PASS | `returns null for empty string`, `returns null for non-version string` |
| `compareVersions("1.0.0","2.0.0")` → `-1`; equal → `0`; build metadata ignored | PASS | 3 dedicated tests |
| `isRangeOperator("^1.0.0")` → `true`; `isRangeOperator("1.0.0")` → `false` | PASS | 14 tests covering all operators |
| Edge case tests (pre-release hyphen, build metadata, empty, invalid chars) | PASS | 44 tests total, all pass |
| `node --test test/utils/semver.test.js` | PASS | 44 pass, 0 fail — `duration_ms 100` |
| ES module import check | PASS | `node -e "import('./src/utils/semver.js')..."` prints `OK` |
