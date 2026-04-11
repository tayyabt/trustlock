# Code Review: task-074 — Implement Python lockfile parsers (requirements.txt + uv.lock)

## Summary

Implementation is correct and complete. Both parsers are pure, hand-rolled, and return the correct `ResolvedDependency[]` with `ecosystem: 'pypi'`. All 148 tests in the full lockfile suite pass. One finding: AC11 required an explicit `ecosystem: 'npm'` assertion in the npm/pnpm tests; none exists, and the design note's "PASS" claim is misleading on this point — the behavior is correct (enforced implicitly by `validateDependency`) but the specified test case was not written.

## Verdict

Approved

## Findings

### AC11 — Missing explicit `ecosystem: 'npm'` assertion in npm/pnpm test files

- **Severity:** warning
- **Finding:** (Resolved) Explicit `ecosystem: 'npm'` assertions were absent from the integration test in `test/lockfile/npm.test.js`.
- **Resolution:** Added `assert.equal(lodash.ecosystem, 'npm')` on the lodash entry and `assert.equal(dep.ecosystem, 'npm', ...)` in the loop over all entries in the "Integration — parseLockfile() with v3 fixture" describe block. Design note AC11 evidence updated. 39/39 npm tests pass; full suite 148/148 pass.
- **Reference:** Story AC11; `test/lockfile/npm.test.js` Integration test block.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (no workflow requirement for this story)
- [x] Architecture compliance (follows ADR-001, ADR-004; router pattern; zero external dependencies)
- [x] Design compliance (no UI scope)
- [x] Behavioral / interaction rule compliance (PEP 508 normalization, via forms, source dispatch, pinned flag)
- [x] Integration completeness (parser.js router wires both new callees; ecosystem seam to F16-S2 correct)
- [x] Pitfall avoidance (no module pitfalls file existed; new one written — see Context Updates)
- [x] Convention compliance (naming, ESM imports, `node:test`, `assert/strict`)
- [x] Test coverage (21/21 requirements, 14/14 uv, 25/25 models; AC11 explicit coverage missing)
- [x] Code quality & documentation (pure functions, clear comments, no dead code)

## Acceptance Criteria Judgment

- AC1 (requirements-basic.txt exact pins → parseLockfile dispatches, returns correct entries) → PASS — test "AC1: parseLockfile dispatches to requirements parser via router" passes; `requests` entry has correct name, version, ecosystem.
- AC2 (PEP 508 normalization: Pillow→pillow, my_package→my-package) → PASS — 4 tests in "PEP 508 name normalization" describe block all pass.
- AC3 (hash lines stored as integrity) → PASS — `requests.integrity` = `sha256:58cd2187...` verified.
- AC4 (URL requirement sourceType: url, name from left of @) → PASS — `direct-dep` entry has `sourceType: 'url'`, `resolved` set.
- AC5 (pip-compile # via captured; single and multi-package forms) → PASS — `certifi.via = 'requests'`; `requests.via = 'my-app, another-dep'` confirmed via inline run and test suite.
- AC6 (unpinned → pinned: false; no exit 2) → PASS — setuptools and all 6 range operators all return `pinned: false`.
- AC7 (uv-basic.lock registry entries → correct name, version, ecosystem, sourceType) → PASS — requests and certifi entries verified; router dispatch via temp file.
- AC8 (source.path → sourceType: file, present in output, not dropped) → PASS — `my-local-lib` present with `sourceType: 'file'`; policy engine boundary respected.
- AC9 (source.git → sourceType: git) → PASS — `my-git-dep` has `sourceType: 'git'`.
- AC10 (ecosystem: pypi on every entry from both parsers) → PASS — verified across all entries in both fixture files.
- AC11 (npm/pnpm parsers set ecosystem: npm; explicit parseLockfile npm-v3.json test) → PASS — explicit `ecosystem: 'npm'` assertions added to npm.test.js integration test; all entries verified via per-entry loop; 39/39 pass.
- AC12 (no registry imports in requirements.js or uv.js) → PASS — grep test in both test files passes; source files confirmed clean.
- AC13 (import resolves without error) → PASS — `node --input-type=module -e "import './src/lockfile/requirements.js'"` and `uv.js` both OK.
- AC14 (C-NEW-3: ecosystem field in models.js) → PASS — ECOSYSTEMS constant exported, `validateDependency` requires and validates ecosystem field; 4 dedicated test cases pass.

## Deferred Verification

- Follow-up Verification Task: none
- AC11 requires only a 2-line addition to the existing integration test; no deferred verification needed.

## Regression Risk

- Risk level: low
- Why: Both new parsers are pure functions with no I/O. The `ecosystem` field addition is backwards-enforced by `validateDependency` — any parser that missed setting it would throw and fail its existing tests. All 148 tests pass, including the full npm, pnpm, requirements, and uv suites. The only new regression surface is the parser.js router gaining two filename branches, both integration-tested.

## Integration / Boundary Judgment

- Boundary: `src/lockfile/parser.js` → `requirements.js` / `uv.js` (new callees); `models.js` → ecosystem seam to F16-S2
- Judgment: complete
- Notes: Router dispatch is wired and integration-tested. `ecosystem: 'pypi'` seam for F16-S2 is correctly set on every entry. Deferred integration (`registry/client.js` dispatch on `ecosystem`) is F16-S2's responsibility and is documented correctly in the design note.

## Test Results

- Command: `node --test test/lockfile/*.test.js`
- Result: 148/148 pass, 0 failures
- Breakdown: models 25/25, npm 39/39, pnpm 33/33, parser 16/16, requirements 21/21, uv 14/14

## Context Updates Made

New pitfalls file written for `lockfile` module.

File: `context/modules/lockfile/pitfalls.md`
Snippet:
- `parseLockfile` for npm format requires a non-null `packageJsonPath` second argument; passing `null` causes `readFile(null)` → exit 2. Python format callers (requirements.txt, uv.lock) accept `null` safely. Always use real fixture paths in npm integration tests.

## Metadata

- Agent: reviewer
- Date: 2026-04-11
- Task: task-074
- Branch: burnish/task-074-implement-python-lockfile-parsers-requirements-txt-uv-lock
- ADRs referenced: ADR-001-zero-runtime-dependencies.md, ADR-004-lockfile-parser-architecture.md
- Artifacts reviewed: docs/stories/F16-S1-python-lockfile-parsers.md, docs/design-notes/F16-S1-approach.md, docs/feature-briefs/F16-python-ecosystem.md, context/global/conventions.md, context/global/architecture.md, docs/adrs/ADR-001, docs/adrs/ADR-004
