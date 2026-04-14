# Code Review: task-018 — npm Lockfile Parser (v1, v2, v3)

## Summary

Full implementation of the npm lockfile parser handling v1, v2, and v3 lockfile formats. All 13 acceptance criteria are concretely verified by 39 passing tests, including an end-to-end integration test through `parseLockfile()`. Router wiring is real. Zero runtime dependencies maintained. No stubs in critical paths.

## Verdict

Approved

## Findings

### isDev detection — dead ternary branch (suggestion)
- **Severity:** suggestion
- **Finding:** In `_parseV1` and `_parseV2V3` (`src/lockfile/npm.js` lines 55 and 109), the condition `devSet.has(name) && !directSet.has(name)` is structurally unreachable because `devOnlySet ⊆ directSet` — every package in devOnlySet is also in directSet by construction. The actual `isDev` determination always falls through to `entry.dev === true`.
- **Proposed Judgment:** No behavioral bug — npm reliably sets `dev: true` on devDependency entries in all lockfile versions, and all 39 tests pass. A future cleanup could remove the unreachable branch. Not a blocker.
- **Reference:** Story behavioral rule: "isDev flag is set by cross-referencing package.json devDependencies".

### scripts/check-no-stubs.sh and check-review-integrity.sh missing (suggestion)
- **Severity:** suggestion
- **Finding:** Both scripts are absent from the repo. Manual inspection of `src/lockfile/npm.js` confirms no stubs, TODOs, or placeholder behavior in any critical path.
- **Proposed Judgment:** Create these as project-level QA infrastructure in a future task.
- **Reference:** Reviewer skill infrastructure.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [N/A] Workflow completeness / blocked-state guidance (feature-brief: workflow coverage not required)
- [x] Architecture compliance (ADR-004 router pattern; ADR-001 zero runtime deps — only node built-ins and `./models.js`)
- [N/A] Design compliance (no UI, no preview required)
- [x] Behavioral / interaction rule compliance (hasInstallScripts null for v1/v2; isDev cross-reference; empty-lockfile guard)
- [x] Integration completeness (parser.js dispatches to parseNpm at line 108; integration test verifies end-to-end path)
- [N/A] Pitfall avoidance (no module pitfalls artifact bound — first lockfile parser story)
- [x] Convention compliance (ES modules, kebab-case file, camelCase functions, node built-ins only, no runtime deps)
- [x] Test coverage (all 13 AC have tests, all edge cases covered, 39/39 pass)
- [x] Code quality & documentation (no dead stubs, design note accurately records verification with outcomes)

## Acceptance Criteria Judgment
- AC: `parseNpm()` parses v1 fixture into `ResolvedDependency[]` with flattened nested deps → **PASS** — `v1: nested transitive dep (deep-transitive) is flattened`; 12 v1 tests total
- AC: `parseNpm()` parses v2 fixture preferring `packages` over `dependencies` → **PASS** — `v2: prefers packages map — lodash version is 4.17.21, not 4.0.0` explicit assertion
- AC: `parseNpm()` parses v3 fixture extracting `hasInstallScripts` → **PASS** — `v3: lodash has hasInstallScripts: false`; `v3: my-local-pkg has hasInstallScripts: true`
- AC: `hasInstallScripts` is `null` for v1 and v2 → **PASS** — all-entries loop checks in both v1 and v2 suites
- AC: Source type classification (registry/git/file/url) → **PASS** — 6 dedicated classification tests covering every branch
- AC: `directDependency` flag by package.json cross-reference → **PASS** — `transitive dep is not direct`; direct deps correctly flagged in all suites
- AC: `isDev` flag for devDependency-only packages → **PASS** — mocha/`@scope/dev-tool` tests in v1, v2, v3; `only-devDependencies` isolation test
- AC: Scoped packages (`@scope/name`) across all three versions → **PASS** — `@scope/dev-tool` and `@scope/transitive` tested across v1, v2, v3
- AC: Git and file deps with correct source types → **PASS** — my-git-pkg/my-local-pkg tested in all three version suites
- AC: No `resolved` field → `resolved: null` → **PASS** — `v1: dep with no resolved field gets resolved: null`; sourceType defaults to `"registry"`
- AC: Empty lockfile → `[]` → **PASS** — empty-deps and no-deps-key tests for v1, v2, v3
- AC: Integration: `parseLockfile(package-lock.json, package.json)` → **PASS** — integration test validates lodash shape and all-fields loop
- AC: `node --test test/lockfile/npm.test.js` passes → **PASS** — 39 pass, 0 fail (verified live)

## Deferred Verification
- none

## Regression Risk
- Risk level: low
- Why: `parser.js` and `models.js` were not modified. Changes are isolated to new `src/lockfile/npm.js`, new test file, and enriched fixtures. All 70 lockfile suite tests (parser + models + npm) pass.

## Integration / Boundary Judgment
- Boundary: `parser.js:108` → `parseNpm(lockfileContent, packageJsonContent)` in `npm.js`
- Judgment: complete
- Notes: `parser.js` imports and calls `parseNpm` unconditionally when `format === 'npm'`. Integration test verifies the full chain with real fixture files returning correct `ResolvedDependency[]`.

## Test Results
- Command: `node --test test/lockfile/npm.test.js` → **39 pass, 0 fail**
- Command: `node --test "test/lockfile/*.test.js"` → **70 pass, 0 fail** (models + parser + npm)

## Context Updates Made
No context updates needed. No module guidance or pitfalls artifacts were bound (`module_guidance_input_paths` and `module_pitfalls_input_paths` are empty — this is the first lockfile parser story). The dead-branch `isDev` observation should be captured as a module pitfall when `context/modules/lockfile/` artifacts are created.

## Artifacts Reviewed
- Story: `docs/stories/F02-S03-npm-lockfile-parser.md`
- Feature brief: `docs/feature-briefs/F02-lockfile-parsing.md`
- Design note: `docs/design-notes/F02-S03-approach.md`
- Source: `src/lockfile/npm.js`, `src/lockfile/parser.js`, `src/lockfile/models.js`
- Tests: `test/lockfile/npm.test.js`
- Fixtures: `test/fixtures/lockfiles/npm-v1.json`, `npm-v2.json`, `npm-v3.json`, `package.json`, `package-lock.json`
- ADRs: `ADR-001-zero-runtime-dependencies.md`, `ADR-004-lockfile-parser-architecture.md`

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-018
- Branch: burnish/task-018-implement-npm-lockfile-parser-v1-v2-v3
