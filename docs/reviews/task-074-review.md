# Code Review: task-074 — Implement Python lockfile parsers (requirements.txt + uv.lock)

## Summary

Implementation is correct and complete. Both parsers are pure, hand-rolled, and return the correct `ResolvedDependency[]` with `ecosystem: 'pypi'`. All 148 tests in the full lockfile suite pass. AC11 explicit `ecosystem: 'npm'` assertions were added to `test/lockfile/npm.test.js` prior to this review and verified present. No open defects. No stubs or placeholders in critical paths. ADR-001 (zero runtime dependencies) and ADR-004 (router pattern) are fully observed.

## Verdict

Approved

## Findings

### AC11 — Explicit `ecosystem: 'npm'` assertions confirmed present in npm test

- **Severity:** info
- **Finding:** Confirmed `assert.equal(lodash.ecosystem, 'npm')` and a per-entry loop asserting `dep.ecosystem === 'npm'` are present in the "Integration — parseLockfile() with v3 fixture" block in `test/lockfile/npm.test.js:474,483`. 39/39 npm tests pass.
- **Reference:** Story AC11; `test/lockfile/npm.test.js` Integration test block.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually via live test run)
- [x] Workflow completeness / blocked-state guidance (no workflow requirement for this story)
- [x] Architecture compliance (follows ADR-001, ADR-004; router pattern; zero external dependencies; hand-rolled TOML subset)
- [x] Design compliance (no UI scope)
- [x] Behavioral / interaction rule compliance (PEP 508 normalization, via single/multi forms, source dispatch, pinned flag)
- [x] Integration completeness (parser.js router wires both new callees; ecosystem seam to F16-S2 correct)
- [x] Pitfall compliance (pitfalls.md updated with pitfalls #7 and #8; both relevant to this story)
- [x] Convention compliance (ESM imports, `node:test`, `assert/strict`, kebab-case files, camelCase functions)
- [x] Test coverage (21/21 requirements, 14/14 uv, 25/25 models, 16/16 parser, 39/39 npm, 33/33 pnpm = 148/148)
- [x] Code quality & documentation (pure functions, clear comments, no dead code, no stubs)
- [x] stub check (`check-no-stubs.sh` → OK)

## Acceptance Criteria Judgment

- AC1 (requirements-basic.txt exact pins → parseLockfile dispatches, returns correct entries) → PASS — test "AC1: parseLockfile dispatches to requirements parser via router" passes; `requests` entry correct.
- AC2 (PEP 508 normalization: Pillow→pillow, my_package→my-package) → PASS — 4 tests in "PEP 508 name normalization" describe block all pass; inline normalization confirmed.
- AC3 (hash lines stored as integrity) → PASS — `requests.integrity = 'sha256:58cd2187...'` verified.
- AC4 (URL requirement sourceType: url, name from left of @) → PASS — `direct-dep` entry has `sourceType: 'url'`, `resolved` set to HTTPS URL.
- AC5 (pip-compile # via captured; single and multi-package forms) → PASS — `certifi.via = 'requests'`; `requests.via = 'my-app, another-dep'`.
- AC6 (unpinned → pinned: false; no exit 2) → PASS — setuptools and all 6 range operators all return `pinned: false`.
- AC7 (uv-basic.lock registry entries → correct name, version, ecosystem, sourceType) → PASS — requests and certifi verified; router dispatch via temp file.
- AC8 (source.path → sourceType: file, present in output, not dropped) → PASS — `my-local-lib` present with `sourceType: 'file'`; policy engine boundary respected.
- AC9 (source.git → sourceType: git) → PASS — `my-git-dep` has `sourceType: 'git'`.
- AC10 (ecosystem: pypi on every entry from both parsers) → PASS — verified across all entries in both fixture files.
- AC11 (npm/pnpm parsers set ecosystem: npm; explicit parseLockfile npm-v3.json test) → PASS — explicit assertions present; 39/39 npm tests pass.
- AC12 (no registry imports in requirements.js or uv.js) → PASS — grep test in both test files passes; source confirmed clean.
- AC13 (import resolves without error) → PASS — `node --input-type=module -e "import './src/lockfile/requirements.js'"` and `uv.js` both resolve OK.
- AC14 (C-NEW-3: ecosystem field in models.js) → PASS — ECOSYSTEMS constant exported, `validateDependency` requires and validates ecosystem; 4 dedicated AC14 test cases pass.

## Deferred Verification

None.

## Regression Risk

- Risk level: low
- Why: Both new parsers are pure functions with no I/O. The `ecosystem` field addition is backwards-enforced by `validateDependency` — any parser that missed setting it would throw and fail its existing tests. All 148 tests pass, including full npm, pnpm, requirements, and uv suites. Router gains two filename branches, both integration-tested.

## Integration / Boundary Judgment

- Boundary: `src/lockfile/parser.js` → `requirements.js` / `uv.js` (new callees); `models.js` → ecosystem seam to F16-S2
- Judgment: complete
- Notes: Router dispatch wired and integration-tested. `ecosystem: 'pypi'` seam for F16-S2 correctly set on every entry. Deferred integration (`registry/client.js` dispatch on `ecosystem`) is F16-S2's responsibility, correctly documented.

## Test Results

- Command: `node --test test/lockfile/*.test.js`
- Result: 148/148 pass, 0 failures
- Breakdown: models 25/25, npm 39/39, pnpm 33/33, parser 16/16, requirements 21/21, uv 14/14

## Context Updates

`context/modules/lockfile/pitfalls.md` — pitfalls #7 and #8 added during this story's developer/review cycle:
- #7: `parseLockfile` npm format requires a non-null `packageJsonPath`; Python callers accept `null` safely.
- #8: New required model fields must be explicitly asserted in existing parser tests even when `validateDependency` enforces them implicitly.

## Metadata

- Agent: reviewer
- Date: 2026-04-11
- Task: task-074
- Branch: burnish/task-074-implement-python-lockfile-parsers-requirements-txt-uv-lock
- ADRs referenced: ADR-001-zero-runtime-dependencies.md, ADR-004-lockfile-parser-architecture.md
- Artifacts reviewed: docs/stories/F16-S1-python-lockfile-parsers.md, docs/design-notes/F16-S1-approach.md, docs/feature-briefs/F16-python-ecosystem.md, context/global/conventions.md, context/global/architecture.md, docs/adrs/ADR-001, docs/adrs/ADR-004, context/modules/lockfile/pitfalls.md
