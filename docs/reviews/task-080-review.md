# Code Review: task-080 Fix monorepo lockfile discovery — add --project-dir hint to no-lockfile error

## Summary

Clean, minimal bug fix. All four acceptance criteria pass. `detectMonorepoWorkspaces` is correctly scoped — it only returns paths, not message strings — and both `init.js` and `audit.js` assemble their own command-specific messages. No regressions introduced. Stub check clean.

## Verdict

Approved

## Findings

No blocking or warning findings. One informational observation noted below.

### [Informational] audit.js reads full lockfile content to detect presence

- **Severity:** suggestion
- **Finding:** `audit.js:69-73` uses `readFile` (reads full content) to detect whether the lockfile exists, then discards the content. Later, `parseLockfile` re-reads and parses the file.
- **Proposed Judgment:** No change required for this task. The inefficiency is minor (only triggered when lockfile present), and altering the detection pattern would exceed the bug's stated scope. Acceptable to leave as-is.
- **Reference:** BUG-003 scope: "The fix belongs in the error-handling path of `init.js` and `audit.js` where lockfile absence is detected." — no contract on detection method.

## Checks Performed

- [x] Correctness (each acceptance criterion verified individually)
- [ ] Workflow completeness / blocked-state guidance — not applicable (no workflow feature)
- [x] Architecture compliance (follows ADR-001 zero-deps, ADR-004 lockfile parser boundary)
- [ ] Design compliance — not applicable (no UI)
- [ ] Behavioral / interaction rule compliance — not applicable (error message text, verified via tests)
- [x] Integration completeness (caller/callee contract honored: `resolvePaths()` unchanged)
- [x] Pitfall avoidance (no module pitfalls registered; checked for cross-module import violations — none)
- [x] Convention compliance (naming, error handling, imports, file structure match existing patterns)
- [x] Test coverage (all four ACs have corresponding tests; workspace expansion edge cases exercised)
- [x] Code quality & documentation (no dead code; design note documents no docs update needed; no new flags or env vars)

## Acceptance Criteria Judgment

- AC1: `trustlock init` at monorepo root with no root lockfile → error includes `--project-dir` hint → **PASS** — `init.js:103-106` always appends hint; `monorepo-init.test.js` BUG-003 no-workspaces test passes.
- AC2: Root `package.json` has `"workspaces"` → error names workspace packages with `--project-dir` examples → **PASS** — `init.js:96-102` expands workspaces and names each; test verifies `apps/frontend` and `apps/backend` appear in stderr.
- AC3: Same AC1+AC2 for `trustlock audit` → **PASS** — `audit.js:79-93`; `monorepo-audit.test.js` both BUG-003 tests pass.
- AC4: Regression — test asserts error contains `--project-dir` hint when lockfile absent → **PASS** — new tests added in both `monorepo-init.test.js` and `monorepo-audit.test.js`.
- AC (pre-existing): `--project-dir` per-package workflow continues to work → **PASS** — `monorepo-init.test.js` AC1 and AC10 pass unchanged.

## Deferred Verification

none

## Regression Risk

- Risk level: low
- Why: Changes are confined to error-handling branches (`ENOENT` on lockfile lookup). The happy path (lockfile present) is never touched. `resolvePaths()` is unmodified. Pre-existing failures (`parseYarn`, `parseUv`, `F10-S4 args`, `AC2b`) confirmed to be identical on base branch via `git stash && npm test` comparison, as documented in design note.

## Integration / Boundary Judgment

- Boundary: `src/utils/paths.js` — `detectMonorepoWorkspaces` exported function
- Judgment: complete
- Notes: `resolvePaths()` contract is honored (not modified). New export `detectMonorepoWorkspaces` is consumed only by `init.js` and `audit.js` error paths. No registry, baseline, policy, or parser subsystem is touched.

## Test Results

- Command run: `npm test`
- Result: All BUG-003 tests pass. AC1 / AC10 monorepo-init regression tests pass. Pre-existing failures: `parseYarn` (classic/berry), `parseUv`, `F10-S4 args`, `AC2b baseline gitRoot` — all unrelated to this change and present on base branch.

## Context Updates Made

No context updates needed. (No module guidance or pitfall paths are registered for this task's module scope; no reusable trap emerged from this review that isn't already documented in the bug artifact itself.)

## Metadata

- Agent: reviewer
- Date: 2026-04-13
- Task: task-080
- Branch: burnish/task-080-fix-monorepo-lockfile-discovery-add-project-dir-hint-to-no-lockfile-error
