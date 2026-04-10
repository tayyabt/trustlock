# Review: task-063 — F10-S4 CLI Integration, Args Flags, and Workflow Updates

## Verdict

**Approved**

## Artifacts Used for Judgment

- Story: `docs/stories/F10-S4-cli-integration-and-workflow-updates.md`
- Feature brief: `docs/feature-briefs/F10-output-ux-redesign.md` (via task-051 worktree)
- Design note: `docs/design-notes/F10-S4-approach.md`
- Source files: `src/cli/args.js`, `src/cli/commands/check.js`, `src/cli/commands/approve.js`, `src/cli/commands/audit.js`, `src/cli/commands/init.js`, `src/utils/progress.js`, `src/output/terminal.js`, `src/output/json.js`
- Test files: `src/cli/__tests__/args.test.js`, `src/cli/__tests__/check.integration.test.js`, `test/unit/cli/check.test.js`, `test/unit/cli/approve.test.js`, `test/unit/cli/audit.test.js`, `test/integration/cli-e2e.test.js`
- Workflow docs: `docs/workflows/cli/blocked-approve.md`, `docs/workflows/cli/check-admit.md`
- ADRs: ADR-001 (zero runtime dependencies), ADR-002 (baseline advancement), ADR-005 (policy config)
- Architecture: `context/global/architecture.md`, `context/global/conventions.md`

## Acceptance Criteria Judgment

| AC | Description | Verdict | Evidence |
|----|-------------|---------|----------|
| AC1 | `args.js` exports `--quiet` and `--sarif` (boolean); no `--profile` | PASS | `args.test.js` 8/8 pass; `--profile` throws TypeError |
| AC2 | `--json` + `--sarif` → exit 2 with mutex message | PASS | `args.test.js` mutex test; `process.exit(2)` + stderr message verified |
| AC3 | `check.js` routes to terminal formatter by default; json formatter when `--json` | PASS | IT3 passes; check.js:291 (terminal), check.js:278 (json) |
| AC4 | `createProgress(count, stderr)` called when count ≥ 5 and !quiet | PASS | IT4 (4 pkgs, no progress); IT5 (5 pkgs, progress); check.js:166–168 |
| AC5 | `--quiet` suppresses all stdout and stderr | PASS | IT2 (admitted), IT2b (blocked + --enforce); check.js:267 `if (!quiet)` guard |
| AC6 | `approve.js` calls `formatApproveConfirmation(entry, !flags.json)` | PASS | IT6 (terminal mode, "Commit this file." present); IT7 (json mode, absent); approve.js:251–264 |
| AC7 | `audit.js` calls `formatAuditReport(report)` from correct formatter | PASS | `audit.test.js` 10/10; audit.js:215–219 json/terminal branch |
| AC8 | `init.js` calls `createProgress` always (no threshold) | PASS | init.js:156; `init.test.js` 16/16 |
| AC9 | `--no-cache` behavior unchanged | PASS | `check.test.js` 14/14; no-cache path untouched at check.js:51 |
| AC10 | e2e `trustlock check` produces v0.2 grouped output | PASS | IT1; `cli-e2e.test.js` 11/11 |
| AC11 | `--quiet` produces zero output (e2e) | PASS | IT2, IT2b pass |
| AC12 | `--json` produces schema_version 2 | PASS | IT3, IT3b pass |
| AC13 | `approve` produces v0.2 confirmation with "Commit this file." | PASS | IT6, IT7 pass |
| AC14 | Workflow docs updated: `blocked-approve.md` and `check-admit.md` reflect v0.2 | PASS | Both docs updated with absolute timestamps, grouped sections, single approve command |
| AC15 | Integration threshold test: 4 pkgs → no progress; 5 pkgs → progress | PASS | IT4, IT5 pass |

**Total: 15/15 PASS**

## Test Verification

All tests ran against the actual implementation with no mocking of the callee formatters:

```
node --test src/cli/__tests__/args.test.js           → 8/8 pass
node --test src/cli/__tests__/check.integration.test.js → 9/9 pass
node --test test/unit/cli/check.test.js test/unit/cli/approve.test.js test/unit/cli/audit.test.js → 38/38 pass
node --test test/integration/cli-e2e.test.js         → 11/11 pass
```

## Code Quality Observations

- **Wall time correctness**: `startTime = Date.now()` is captured on line 43 before policy load, per story spec. `wallTimeMs` computed at line 264 after grouping.
- **Single grouping loop**: check.js builds `terminalGrouped` and `jsonGrouped` simultaneously in one pass over `results[]` — no duplicate iteration.
- **`admitted_with_approval` lookup**: Uses `a.package === r.name && a.version === r.version && new Date(a.expires_at) > now` — matches engine pattern.
- **`--quiet` error paths**: Fatal error paths (exit 2) still write to stderr even with `--quiet`. This is correct: story spec scopes `--quiet` to suppress pass/fail output, not fatal configuration errors. Edge cases spec (`--quiet + --enforce`) confirms this — IT2b validates blocked+quiet+enforce correctly.
- **SARIF branch shape**: `sarifGrouped` in check.js passes original `DependencyCheckResult` shape with `entry.checkResult.findings`. This is the contract F13 built against and all SARIF tests pass.
- **ADR-001 compliance**: `progress.js`, `terminal.js`, `json.js` all have zero runtime dependencies. All logic is inlined.

## Regression Risk

Low. The callee modules (progress.js, terminal.js, json.js) brought in from dependency task branches have independent test coverage. The CLI wiring respects existing `--no-cache`, `--enforce`, `--dry-run`, and `--lockfile` flag paths. All 11 e2e tests cover the full pipeline.

## Integration Completeness

- **Caller-side**: All four command handlers wired to correct callees with correct signatures.
- **Callee-side**: `formatCheckResults`, `formatApproveConfirmation`, `formatAuditReport`, `createProgress` all called with correct argument shapes.
- **F13 gate**: `--sarif` flag and `--json`/`--sarif` mutex gate are in place. F13 can depend on these without modification.

## Minor Finding (Non-Blocking)

`check-admit.md` example output shows `No dependency changes since last baseline.` while the actual code output is `No dependency changes` (no "since last baseline" suffix). This is a documentation imprecision in the example string only; it does not affect any AC or integration contract.

## Design Note Quality

Design note accurately describes all seven key design decisions, maps each AC to a test command, and records verification results with specific test IDs. No dishonest claims. Stubs section: "None."

## Summary

Implementation is correct, complete, and well-tested. All 15 acceptance criteria verified with automated tests. No stubs, no placeholders, no deferred behavior in critical paths. The story's behavioral rules (quiet suppression, progress threshold, terminalMode gating, mutex exit) are all implemented faithfully and covered by dedicated test cases.
