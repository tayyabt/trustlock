# Code Review: task-068 — Implement SARIF CLI Wiring (`check.js` integration)

## Summary

Implementation is correct and complete. All 11 story acceptance criteria are met and independently verified by passing tests. The design note is transparent about the dependency gap (absorbed F13-S1 formatter, F10-S4 flags, and F09 `getRelativePath` because prerequisites were not landed), and the absorbed scope follows the respective story specs exactly. No stubs, no placeholders, 649/649 tests pass.

## Verdict

Approved

## Findings

### Justified scope expansion: absorbed prerequisite work (informational, not a defect)
- **Severity:** suggestion
- **Finding:** The story explicitly scopes out `args.js` changes (F10-S4) and `sarif.js` (F13-S1), stating they are pre-built. They were not. The design note documents the gap and the rationale for absorbing the work (anti-stub rule prohibits placeholders). The absorbed implementations are faithful to their respective story specs and the anti-stub rule supports this judgment. This is not a defect.
- **Proposed Judgment:** No change required. Future reviewer should be aware that task-063 (F10-S4) and task-067 (F13-S1) are now logically superseded by this task's implementation; those tasks should not re-implement the same functions if they run.
- **Reference:** Design note "Dependency Gap — Absorbed In-Scope"; F13-S2 story "Not in scope" section; anti-stub rule.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (N/A — CI-only output mode, no interactive workflow)
- [x] Architecture compliance (follows ADR-001 zero-runtime-deps; `sarif.js` is a pure leaf module; no external imports)
- [x] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (`--quiet` suppresses SARIF per G-NEW-2; `--json`/`--sarif` mutex enforced in args.js; terminal formatter not called when `--sarif` active)
- [x] Integration completeness (caller-side: `check.js` wires `formatSarifReport` + `getRelativePath`; callee-side: `sarif.js` contract honored; `args.js` mutex present)
- [x] Pitfall avoidance (no module pitfalls file present; no known pitfalls identified)
- [x] Convention compliance (ES modules, kebab-case files, camelCase functions, UPPER_SNAKE_CASE constants, `node:` prefix imports)
- [x] Test coverage (all 11 ACs have integration test coverage; formatter fully covered by 20 unit tests)
- [x] Code quality & documentation (design note complete, no dead code, `check-no-stubs.sh` → OK)

## Acceptance Criteria Judgment

- AC: `check.js` imports `formatSarifReport` from `../output/sarif.js` and calls it when `args.sarif === true` → **PASS** — `check.js:29` import; `check.js:179-192` output branch
- AC: `lockfileUri` is lockfile path relative to `projectRoot`, computed via `paths.js:getRelativePath` → **PASS** — `check.js:123`; `paths.js:24-26`; integration test "artifactLocation.uri is lockfile path relative to projectRoot"
- AC: `check --sarif` emits valid SARIF 2.1.0; exit 0 when all admitted → **PASS** — integration test "all admitted → valid SARIF, runs[0].results is empty, exit 0"
- AC: `check --sarif --enforce` blocked → SARIF on stdout, exit 1 → **PASS** — integration test "blocked packages → valid SARIF on stdout; exit 1"
- AC: `check --sarif --enforce` all admitted → SARIF on stdout, exit 0 → **PASS** — integration test "all admitted → valid SARIF on stdout; exit 0"
- AC: `check --quiet --sarif` → no SARIF on stdout; exit code unaffected → **PASS** — integration test "no SARIF written to stdout; exit code unaffected"
- AC: `check --json --sarif` → exits with mutex error, `check.js` never reaches formatter → **PASS** — integration test "exits 2 with mutex error; check.js never reaches formatter"
- AC: stdout = pure SARIF JSON; stderr = diagnostics only → **PASS** — integration test "stdout is pure SARIF JSON; stderr carries diagnostic output"
- AC: `args.js` not modified beyond adding 2 flags + mutex → **PASS** (with justified exception: flags were absorbed here because F10-S4 prerequisite was not landed; only `--sarif`, `--quiet`, and mutex guard were added)
- AC: Integration: blocked fixture → `runs[0].results.length >= 1` → **PASS** — integration test "blocked packages → valid SARIF 2.1.0 on stdout; exit 0 (advisory)"
- AC: Integration: all-admitted → `runs[0].results.length === 0` → **PASS** — integration test "all admitted → valid SARIF, runs[0].results is empty, exit 0"

## Deferred Verification

none

## Regression Risk
- Risk level: low
- Why: `check.js` output section is a new `else if (sarif)` branch that does not touch the existing `json` branch or the terminal formatter path. `args.js` adds two new boolean flags with defaults and a pre-parse mutex guard — existing flags are unmodified. `paths.js` adds a new exported function alongside the existing `resolvePaths` — no modification to existing behavior. All 649 existing tests continue to pass.

## Integration / Boundary Judgment
- Boundary: `check.js` → `sarif.js:formatSarifReport(groupedResults, lockfileUri)` and `check.js` → `paths.js:getRelativePath(lockfilePath, projectRoot)`
- Judgment: complete
- Notes: Both callee contracts are real implementations; integration tests spawn the CLI end-to-end and verify stdout/stderr/exit code. `args.js` mutex enforced before `check.js` runs; `check.js` trusts parsed args (no re-implementation of mutex gate in `check.js`).

## Test Results
- Command run: `node --test`
- Result: 649 pass, 0 fail (unit + integration, including 20 sarif unit tests and 9 sarif integration tests)

## Context Updates Made

No context updates needed. No module guidance or pitfalls files are present for the `cli` or `output` modules. No reusable traps emerged from this review that weren't already captured in the story or design note.

## Artifacts Cited
- Story: `docs/stories/F13-S2-sarif-cli-wiring.md` (control root)
- Feature brief: `docs/feature-briefs/F13-sarif-output.md` (control root)
- Design note: `docs/design-notes/F13-S2-approach.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- Global conventions: `context/global/conventions.md`

## Metadata
- Agent: reviewer
- Date: 2026-04-10
- Task: task-068
- Branch: burnish/task-068-implement-sarif-cli-wiring-check-js-integration
