# Code Review: task-024 Implement Baseline Advancement and Auto-Staging

## Summary
Clean, correct implementation of `advanceBaseline()` and `writeAndStage()` in `src/baseline/manager.js`. All 7 acceptance criteria pass with direct test evidence (18/18 tests). ADR-001 and ADR-002 compliance is solid. Design note is honest and complete.

## Verdict
Approved

## Findings

### Observation: `_gitAdd` is called without `await` in `writeAndStage`
- **Severity:** suggestion
- **Finding:** `src/baseline/manager.js:167` — `_gitAdd('.trustlock/baseline.json')` is called without `await`. The real `gitAdd` is synchronous (`execSync`), so this is currently correct and the `try/catch` works. If a future caller passes an async override, errors would escape the `try/catch` silently.
- **Proposed Judgment:** No action required for v0.1 scope. The parameter is clearly marked `_gitAdd` (internal/test-only). Captured in module pitfalls below.
- **Reference:** `src/utils/git.js:44` — `export function gitAdd(filePath)` is synchronous.

### Observation: `scripts/check-no-stubs.sh` and `scripts/check-review-integrity.sh` are absent
- **Severity:** suggestion
- **Finding:** Neither script exists in the repo. Manual stub review was performed instead — no runtime stubs, placeholders, or TODO-driven behavior found in either new function.
- **Proposed Judgment:** No impact on verdict. Scripts may be scaffolded in a future task.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — internal data layer, no workflow coverage required per feature brief)
- [x] Architecture compliance (ADR-001 zero-deps: only `node:fs/promises`, `node:path`, project's own `git.js`; ADR-002 auto-stage: `gitAdd('.trustlock/baseline.json')` called)
- [x] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (D1/D3/D10 correctly delegated to caller; warning-not-throw on git failure as specified)
- [x] Integration completeness (caller seam F08 correctly deferred with explicit named exports; `gitAdd` wired now)
- [x] Pitfall avoidance (no existing module pitfalls file; manual check performed; new pitfall recorded below)
- [x] Convention compliance (atomic write via temp+rename, ISO 8601 UTC timestamps, 2-space JSON indentation, `process.stderr.write` for warnings)
- [x] Test coverage (18 tests: all 7 ACs + edge cases — version change, all-packages-removed, schema_version/created_at preservation)
- [x] Code quality & documentation (no dead code; design note complete with verification mapping; no doc updates required per story scope)

## Acceptance Criteria Judgment
- AC1: `advanceBaseline(baseline, admittedDeps, lockfileHash)` returns updated Baseline with merged packages, updated `lockfile_hash`, updated `updated_at` → **PASS** — "advanceBaseline returns updated baseline with new lockfile_hash and updated_at"; `src/baseline/manager.js:136-143`
- AC2: Newly admitted packages get fresh TrustProfile entries with current `admittedAt` → **PASS** — "advanceBaseline gives newly admitted packages a fresh TrustProfile"; `src/baseline/manager.js:126-134`
- AC3: Old baseline packages not in `admittedDeps` are silently removed → **PASS** — "advanceBaseline drops packages absent from admittedDeps"; algorithm iterates only `admittedDeps`; absent entries are never added to output
- AC4: Unchanged packages (same name+version) retain original TrustProfile → **PASS** — "advanceBaseline retains original TrustProfile for unchanged packages" uses `deepEqual` against the original profile object
- AC5: `writeAndStage` writes JSON to disk and calls `gitAdd('.trustlock/baseline.json')` → **PASS** — "writeAndStage writes JSON to disk and calls gitAdd" verifies file content, 2-space indentation, and `gitAddCalledWith === '.trustlock/baseline.json'`
- AC6: If `gitAdd` fails, warns and does not throw → **PASS** — "writeAndStage logs warning when gitAdd fails and does not throw" verifies stderr includes "Warning" and file is still written to disk
- AC7: Unit tests cover all required scenarios → **PASS** — 18 tests total; 9 new tests covering all 6 ACs plus edge cases (all packages removed, version change, schema_version/created_at preservation)

## Deferred Verification
- Follow-up Verification Task: none
- none

## Regression Risk
- Risk level: low
- Why: Purely additive — two new exports added to existing module. Pre-existing `createBaseline` and `readBaseline` tests still pass (9 passing). No existing call sites in the codebase — F08 caller deferred to sprint 2.

## Integration / Boundary Judgment
- Boundary: `writeAndStage` → `gitAdd` from `src/utils/git.js`
- Judgment: complete
- Notes: Import wired at `src/baseline/manager.js:21`. `gitAdd` is synchronous; the synchronous `try/catch` correctly wraps it. The `.trustlock/baseline.json` path is hardcoded per ADR-002. Caller seam (F08) explicitly documented as deferred in both story and design note.

## Test Results
- Command run: `node --test test/baseline/manager.test.js`
- Result: 18 pass, 0 fail

## Context Updates Made
- Add reusable pitfall to module context:
  File: `context/modules/baseline/pitfalls.md`
  Snippet: `- _gitAdd injection in writeAndStage is synchronous-only — the real gitAdd uses execSync. If writeAndStage is ever refactored to accept async overrides, the try/catch must use await or .catch(). Files: src/baseline/manager.js:160-171, src/utils/git.js:44.`

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-024
- Branch: burnish/task-024-implement-baseline-advancement-and-auto-staging
- Artifacts reviewed: docs/stories/F04-S03-baseline-advancement-and-auto-staging.md, docs/design-notes/F04-S03-approach.md, src/baseline/manager.js, test/baseline/manager.test.js, docs/adrs/ADR-001-zero-runtime-dependencies.md, docs/adrs/ADR-002-baseline-advancement-strategy.md, context/global/conventions.md, docs/feature-briefs/F04-baseline-management.md
