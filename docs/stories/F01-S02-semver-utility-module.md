# Story: F01-S02 — Semver Utility Module

## Parent
F01: Project Scaffolding & Shared Utilities

## Description
Implement the semver subset utility that compares exact versions and detects range operators. This module is used by the lockfile parser (F02), baseline diff (F04), and policy engine (F06) — it must be correct and well-tested before any downstream feature can ship.

## Scope
**In scope:**
- `src/utils/semver.js`: parseVersion, compareVersions, isRangeOperator, detectRangeOperators
- Unit tests in `test/utils/semver.test.js` covering all happy paths and edge cases

**Not in scope:**
- Full semver range resolution (intersections, pre-release ordering) — not needed per PM assumption; lockfiles resolve to exact versions
- Package name parsing — semver utils operate on version strings only
- time.js and git.js — those are F01-S03

## Entry Points
- Route / page / screen: N/A — internal utility module, no direct user invocation
- Trigger / navigation path: Imported by other modules (`import { compareVersions } from '../utils/semver.js'`)
- Starting surface: Consumed by lockfile parser, baseline diff, and policy rules

## Wiring / Integration Points
- Caller-side ownership: Callers (lockfile parser, baseline, policy) will import from `src/utils/semver.js`. Those callers don't exist yet — the contract is the exported function signatures.
- Callee-side ownership: This story owns the full implementation. Exports: `parseVersion(str)`, `compareVersions(a, b)`, `isRangeOperator(str)`.
- Caller-side conditional rule: No callers exist yet. The seam is the module's public exports. F02, F04, F06 will wire to these when they land.
- Callee-side conditional rule: No caller to wire to yet — module is self-contained and tested in isolation.
- Boundary / contract check: Unit tests validate all exported functions. Import test validates the module loads as ES module.
- Files / modules to connect: `src/utils/semver.js` (standalone, no internal dependencies beyond Node.js built-ins)
- Deferred integration: Caller wiring deferred to F02 (lockfile), F04 (baseline), F06 (policy)

## Not Allowed To Stub
- `parseVersion` must return a real parsed object with major, minor, patch, preRelease, and buildMetadata fields
- `compareVersions` must return real -1/0/1 comparison results, not placeholder values
- `isRangeOperator` must detect all range operators: `^`, `~`, `*`, `>`, `>=`, `<`, `<=`, `||`, `x`, `X`
- All edge cases listed below must be handled, not deferred

## Behavioral / Interaction Rules
- `parseVersion` must reject invalid version strings by returning `null` (not throwing)
- `compareVersions` must ignore build metadata per semver spec (e.g., `1.0.0+build.1` equals `1.0.0`)
- Pre-release versions with hyphens (e.g., `1.0.0-beta.1`) must be parsed correctly — the hyphen is part of the pre-release, not a range operator
- Scoped package names (`@scope/name`) are not version strings — callers strip the name before calling. Semver utils do not need to handle `@`.

## Acceptance Criteria
- [ ] `src/utils/semver.js` exports `parseVersion`, `compareVersions`, `isRangeOperator`
- [ ] `parseVersion("1.2.3")` returns `{ major: 1, minor: 2, patch: 3, preRelease: null, buildMetadata: null }`
- [ ] `parseVersion("1.0.0-beta.1")` correctly parses pre-release identifier
- [ ] `parseVersion("1.0.0+build.123")` correctly parses and separates build metadata
- [ ] `parseVersion("")` and `parseVersion("not-a-version")` return `null`
- [ ] `compareVersions("1.0.0", "2.0.0")` returns `-1`; equal versions return `0`; build metadata is ignored in comparison
- [ ] `isRangeOperator("^1.0.0")` returns `true`; `isRangeOperator("1.0.0")` returns `false`
- [ ] All edge cases from the feature brief (pre-release hyphen, build metadata, empty string, invalid chars) have passing tests
- [ ] `node --test test/utils/semver.test.js` — all tests pass

## Task Breakdown
1. Create `src/utils/semver.js` with `parseVersion` function (regex-based version string parser)
2. Implement `compareVersions` using parsed version objects (major/minor/patch numeric comparison)
3. Implement `isRangeOperator` that checks for range operator prefixes
4. Create `test/utils/semver.test.js` with tests for happy path and all edge cases
5. Verify all tests pass

## Verification
```
node --test test/utils/semver.test.js
# Expected: all tests pass

node -e "import('./src/utils/semver.js').then(m => { console.assert(m.parseVersion('1.2.3').major === 1); console.assert(m.compareVersions('1.0.0','2.0.0') === -1); console.assert(m.isRangeOperator('^1.0.0') === true); console.log('OK') })"
# Expected: prints OK
```

## Edge Cases to Handle
- Pre-release versions (`1.0.0-beta.1`) — hyphen must not be mistaken for a range operator
- Build metadata (`1.0.0+build.123`) — must be ignored in version comparison
- Empty string — `parseVersion("")` returns `null`, does not crash
- Invalid characters (`1.0.0abc`, `v1.0.0`) — returns `null`
- Version strings with spaces (` 1.0.0 `) — trim and parse, or return `null`
- Very large version numbers (`999999.999999.999999`) — must handle without overflow

## Dependencies
- Depends on: F01-S01 (project skeleton and test harness)
- Blocked by: none

## Effort
M — Focused module with careful edge case handling and thorough test coverage.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
