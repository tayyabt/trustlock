# Code Review: task-065 — yarn lockfile parser and install-scripts null contract

## Summary
Clean, complete implementation of the yarn classic v1 and berry v2+ parser plus the C-NEW-1 scripts-rule null contract. All 11 acceptance criteria verified with live test runs. No stubs, no registry imports in `yarn.js`, no regressions in existing suites.

## Verdict
Approved

## Findings

No blocking findings. Two observations noted below (non-blocking).

### [OBS-1] `parsePackageJson` called twice per entry in `parseClassic`
- **Severity:** suggestion
- **Finding:** `src/lockfile/yarn.js:291–308` — `parseClassic` calls `parsePackageJson(packageJsonContent)` inside the final `.map()` lambda, once per entry, after `classifyDevProd` already parsed the same content. Negligible at runtime (package.json is small and JSON.parse is fast), but slightly redundant.
- **Proposed Judgment:** No change required. The inefficiency is benign; hoisting the call would be a minor clean-up for a future refactor cycle, not a review blocker.
- **Reference:** No AC or ADR affected.

### [OBS-2] `.lock` extension guard in `parser.js` is redundant for `package-lock.json`
- **Severity:** suggestion
- **Finding:** `src/lockfile/parser.js:74` — The condition `filename !== 'package-lock.json'` inside `filename.endsWith('.lock')` is always true because `package-lock.json` ends in `.json`, not `.lock`. The guard is harmless but dead.
- **Proposed Judgment:** No change required. The intent (handling `--lockfile` overrides for `.lock` files) is clear from comments. Remove during next cleanup pass if desired.
- **Reference:** Story § Entry Points note on `--lockfile` flag.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance — not required (F11 is parser-only; no new user-facing workflow)
- [x] Architecture compliance (ADR-004 router pattern; ADR-001 zero runtime deps; ADR-003 registry degradation)
- [x] Design compliance — not applicable (CLI-only, no UI)
- [x] Behavioral / interaction rule compliance (multi-specifier, `languageName: unknown` exclusion, C-NEW-1 null contract)
- [x] Integration completeness (parser.js → yarn.js callee wired; scripts.js C-NEW-1 inline; no deferred seams)
- [x] Pitfall avoidance — no module pitfall file present; no traps identified
- [x] Convention compliance (imports from models.js only; ESM export; no process.exit in yarn.js; consistent BFS guard with visited Set)
- [x] Test coverage (all ACs have direct test coverage; edge cases covered; regression suite green)
- [x] Code quality & documentation (design note honest; verification results match live run; no dead code)

## Acceptance Criteria Judgment
- AC: Multi-specifier header → one entry → PASS — `yarn.test.js` 30/30 pass; `parseLockfile(yarn-classic-v1.lock, null)` lodash deduplication test passes
- AC: `languageName: unknown` absent from results → PASS — `my-workspace` absent in berry v2 fixture test
- AC: dev/prod classification from package.json → PASS — direct prod `isDev: false`, direct dev `isDev: true`, transitive dev `isDev: true` (BFS), null pkg.json → all `isDev: false`
- AC: `built` absent → `hasInstallScripts: null` → PASS — `yarn-berry-v2.lock` lodash: null confirmed
- AC: `built: true` → `hasInstallScripts: true` → PASS — `yarn-berry-with-built.lock` sharp: true confirmed
- AC: No registry imports in `yarn.js` → PASS — `grep -r "src/registry" src/lockfile/yarn.js` returns empty (exit 1)
- AC: Scripts null + `hasScripts: true` → blocked → PASS — `scripts.test.js` C-NEW-1 block test passes
- AC: Scripts null + `hasScripts: false` → admitted → PASS — `scripts.test.js` C-NEW-1 admit test passes
- AC: Format detection: `__metadata` → berry → PASS — `yarn.test.js` format detection suite passes; inline berry content test passes
- AC: npm/pnpm paths unchanged → PASS — `parser.test.js` 16/16 pass; pnpm-v5.yaml and package-lock.json integration tests green
- AC: Module loads cleanly → PASS — `node --input-type=module -e "import './src/lockfile/yarn.js'"` exits 0

## Deferred Verification
- none

## Regression Risk
- Risk level: low
- Why: yarn branch is gated behind `filename === 'yarn.lock'` / `.lock` extension check — no execution path change for npm or pnpm inputs. `parser.test.js` (16 tests) and pnpm integration tests in `yarn.test.js` remain 100% green. The scripts rule change is additive: the pre-existing `null → skip` behavior is preserved when `registryData == null` (all callers not passing registry data see no behavior change).

## Integration / Boundary Judgment
- Boundary: `parser.js` → `yarn.js` callee (format detection + dispatch)
- Judgment: complete
- Notes: `parseYarn` import wired in `parser.js:13`; yarn branch in both `detectFormat` and `parseLockfile` reads `package.json` when path provided; `parseYarn(content, null)` correctly skips dev/prod classification.

- Boundary: `scripts.js` C-NEW-1 null contract (policy engine ↔ registry metadata object)
- Judgment: complete
- Notes: `registryData` parameter was already in the function signature; null-guard preserves ADR-003 degradation; fall-through to allowlist check is the same code path as `hasInstallScripts: true`.

## Test Results
- Command run: `node --test test/lockfile/yarn.test.js`
- Result: 30 pass, 0 fail

- Command run: `node --test test/policy/rules/scripts.test.js`
- Result: 15 pass, 0 fail

- Command run: `node --test test/lockfile/parser.test.js`
- Result: 16 pass, 0 fail

- Command run: `.burnish/check-no-stubs.sh`
- Result: check-no-stubs: OK

- Command run: `grep -r "src/registry" src/lockfile/yarn.js`
- Result: no output (empty — AC verified)

- Command run: `node --input-type=module -e "import './src/lockfile/yarn.js'"`
- Result: exits 0

## Context Updates Made
No context updates needed. No module guidance or pitfall files exist for the `lockfile` module; no reusable traps or rules emerged from this review that go beyond the current story scope and ADR-004 coverage.

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-065
- Branch: burnish/task-065-implement-yarn-lockfile-parser-and-install-scripts-null-contract

## Artifacts Referenced
- Story: `docs/stories/F11-S2-yarn-lockfile-parser-and-null-contract.md`
- Feature Brief: `docs/feature-briefs/F11-lockfile-parsers-pnpm-yarn.md`
- Design Note: `docs/design-notes/F11-S2-approach.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- ADR-003: `docs/adrs/ADR-003-registry-caching-and-offline-behavior.md`
- ADR-004: `docs/adrs/ADR-004-lockfile-parser-architecture.md`
