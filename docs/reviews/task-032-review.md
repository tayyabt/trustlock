# Code Review: task-032 — Implement Terminal Formatter

## Summary
Implementation is complete and correct. All three formatters are implemented as pure ES module exports, ANSI color constants are real (ADR-001 compliant), NO_COLOR and TERM=dumb suppression work correctly, approval command shell-escaping is real, and `formatHumanReadableTimestamp` is added to `time.js` as required. All 47 terminal tests and all 22 time utility tests pass. Two minor findings — neither blocks approval.

## Verdict
Approved

## Findings

### Finding 1: `formatHumanReadableTimestamp` has no direct tests in `time.test.js`
- **Severity:** suggestion
- **Finding:** `src/utils/time.js` now exports three functions but `test/utils/time.test.js` still imports and tests only `parseTimestamp` and `calculateAgeInHours`. The module-exports describe block does not verify `formatHumanReadableTimestamp`. The function is exercised indirectly through `test/output/terminal.test.js` (the `clears_at` test at line 275), which is sufficient for story AC coverage, but direct unit coverage in the owning module's test file is cleaner.
- **Proposed Judgment:** In a follow-on task or at the start of F07-S02, add 2–3 direct tests for `formatHumanReadableTimestamp` in `test/utils/time.test.js` (valid ISO string → correct format, invalid string → passthrough, timezone offset → UTC output). The design note's claim that "22 tests confirm the addition is non-breaking" is correct but slightly misleading — it confirms no regression, not direct coverage.
- **Reference:** Story F07-S01 AC: "Cooldown findings include the human-readable `clears_at` timestamp (D4) via `time.js`" — indirectly satisfied.

### Finding 2: `process.stdout.isTTY` not checked — piped output will be colored
- **Severity:** suggestion
- **Finding:** `isColorDisabled()` in `terminal.js:43` checks only `NO_COLOR` and `TERM=dumb`. When output is piped to a file or another command and neither env var is set, ANSI codes will appear in the pipe. The story explicitly scopes to NO_COLOR + TERM=dumb only, so this is not a story defect.
- **Proposed Judgment:** TTY detection (`process.stdout.isTTY`) should be added when F08 wires the CLI command handlers. The formatter is a pure string-returning function; the caller should check TTY and pass options (or set NO_COLOR) before invoking. Track this at F08 scope.
- **Reference:** `context/modules/output/pitfalls.md` Pitfall 1 — ANSI codes in piped output. Story F07-S01: "Not in scope: CLI wiring — owned by F08."

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [N/A] Workflow completeness / blocked-state guidance (feature brief: "Workflow Coverage: not required")
- [x] Architecture compliance (follows ADR-001: no runtime deps; respects module boundaries; pure leaf)
- [N/A] Design compliance (no UI/preview for CLI output feature)
- [x] Behavioral / interaction rule compliance (color mapping, NO_COLOR/TERM=dumb, empty results, multi-findings, approval commands)
- [x] Integration completeness (callee-side fully implemented; caller-side deferred to F08 as documented)
- [x] Pitfall avoidance (approval command escaping: correct single-quote wrapping; wide output: no dynamic padding)
- [x] Convention compliance (ES modules, camelCase functions, UPPER_SNAKE_CASE constants, kebab-case file names)
- [x] Test coverage (all 9 ACs have covering tests; 47 tests cover all edge cases from story)
- [x] Code quality & documentation (design note accurate; AuditReport shape JSDoc-documented; no dead code)

## Acceptance Criteria Judgment
- AC: `formatCheckResults(results)` returns colored string with per-package sections → **PASS** — tests: green/admitted (line 140), red/blocked (line 183), [block] tag (line 251), [warn] tag (line 262)
- AC: `formatCheckResults([])` returns "No dependency changes" → **PASS** — test at line 114
- AC: Cooldown findings include human-readable `clears_at` via `time.js` → **PASS** — test at line 275 verifies "April", "2026", "UTC" present and raw ISO string absent
- AC: Generated approval commands are real shell-escaped `dep-fence approve` strings → **PASS** — tests at lines 198, 221, 315; `shellEscape` uses single-quote wrapping with `'\''` idiom
- AC: `formatAuditReport(report)` returns stats + conditional heuristics → **PASS** — 11 tests in stats + heuristics suites; all 3 conditional suggestions verified
- AC: `formatStatusMessage(message)` returns plain-text with dim styling → **PASS** — tests at lines 78, 84
- AC: NO_COLOR suppresses ANSI → **PASS** — 4 tests (lines 374–408); zero `\x1b[` bytes confirmed for all three formatters
- AC: TERM=dumb suppresses ANSI → **PASS** — 3 tests (lines 419–446); zero `\x1b[` bytes confirmed for all three formatters
- AC: Unit tests cover admit, blocked, warn; empty; NO_COLOR; TERM=dumb; 0% provenance; long names; multi-findings; special chars → **PASS** — all cases have dedicated tests

## Deferred Verification
- Follow-up Verification Task: none
- If none: `none`

## Regression Risk
- Risk level: low
- Why: New pure leaf module with no I/O or side effects. `formatHumanReadableTimestamp` added additively to `time.js` — all 22 existing time utility tests still pass. Terminal formatter not yet called by any other module (F08 deferred), so no downstream callers can regress.

## Integration / Boundary Judgment
- Boundary: callee seam — `src/output/terminal.js` exports `formatCheckResults`, `formatAuditReport`, `formatStatusMessage`
- Judgment: complete (callee-side); deferred by design (caller-side)
- Notes: All three public functions are ES module exports with the exact signatures documented in the story. `DependencyCheckResult[]` and `AuditReport` input shapes are JSDoc-documented. CLI (F08) wiring is explicitly deferred and documented in the design note.

## Test Results
- Command run: `node --test test/output/terminal.test.js`
- Result: 47 tests, 47 pass, 0 fail
- Command run: `node --test test/utils/time.test.js`
- Result: 22 tests, 22 pass, 0 fail

## Context Updates Made
Updated `context/modules/output/pitfalls.md` to record that the F08 CLI wiring step should add `process.stdout.isTTY` detection — the formatter itself is pure (string-returning), so TTY checking belongs at the call site.

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-032
- Branch: burnish/task-032-implement-terminal-formatter
