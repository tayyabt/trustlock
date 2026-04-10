# Story: F10-S4 — CLI integration, args flags, and workflow updates

## Parent
F10: Output/UX Redesign

## Description
Wire all F10 output work into the CLI layer: add `--quiet` and `--sarif` flags to `args.js` with the `--json`/`--sarif` mutual exclusion gate (C-NEW-5); update `check.js` to route through the new grouped formatters and wire `progress.js`; update `approve.js` to use the new confirmation formatter; update `audit.js` to use the new audit formatter; and update `blocked-approve.md` and `check-admit.md` workflow docs to reflect v0.2 output. This story must land after F10-S1, F10-S2, and F10-S3 are complete.

## Scope
**In scope:**
- `src/cli/args.js` — add `--quiet` (boolean), `--sarif` (boolean); add `--json`/`--sarif` mutual exclusion gate; do NOT add `--profile` (F14 owns that, C-NEW-5)
- `src/cli/commands/check.js` — wire grouped `CheckResult[]` into new `formatCheckResults`; wire progress.js for ≥5-package fetches; respect `--quiet` (suppress all output); route `--json` to json.js, default to terminal.js
- `src/cli/commands/approve.js` — wire new `formatApproveConfirmation(entry, terminalMode)` with `terminalMode = !flags.json`
- `src/cli/commands/audit.js` — wire new `formatAuditReport(report)` from terminal.js or json.js
- `src/cli/commands/init.js` — wire progress.js for all init fetches (always, no threshold)
- `docs/workflows/cli/blocked-approve.md` — update to reflect v0.2 output contract
- `docs/workflows/cli/check-admit.md` — update to reflect v0.2 output contract

**Not in scope:**
- `--profile` flag in args.js (F14 owns this per C-NEW-5)
- SARIF output formatting (F13 owns the formatter; this story adds the `--sarif` flag and the mutex gate that F13 depends on)
- progress.js implementation (F10-S1)
- terminal.js formatting implementation (F10-S2)
- json.js formatting implementation (F10-S3)

## Entry Points
- Route / page / screen: `src/cli/commands/check.js`, `approve.js`, `audit.js`, `init.js`, `src/cli/args.js`
- Trigger / navigation path: `trustlock check`, `trustlock approve`, `trustlock audit`, `trustlock init`
- Starting surface: Existing CLI command handlers; this story wires the new formatters and flags into them

## Wiring / Integration Points
- Caller-side ownership: This story is the caller that wires the new formatters (terminal.js, json.js) and progress.js into CLI command handlers
- Callee-side ownership: F10-S1 (progress.js), F10-S2 (terminal.js), F10-S3 (json.js) are the callees; all must exist before this story begins
- Caller-side conditional rule: terminal.js (F10-S2) and json.js (F10-S3) exist and export their new signatures — wire to them now
- Callee-side conditional rule: progress.js (F10-S1) exists and exports `createProgress(total, stream)` — wire it now
- Boundary / contract check: `check.js` must call `createProgress(total, process.stderr)` when `total >= 5` and `!flags.quiet`; must call `formatCheckResults(groupedResults, wallTimeMs)` from terminal.js (or json.js when `--json`); must call `createProgress` on every init fetch regardless of count
- Files / modules to connect: `args.js` ↔ `check.js`, `approve.js`, `audit.js`, `init.js`; `check.js` → `progress.js`, `terminal.js`, `json.js`; `approve.js` → `terminal.js`; `audit.js` → `terminal.js`
- Deferred integration, if any: F13 (SARIF formatter) will be wired to the `--sarif` gate added here; this story adds the gate but does not implement the SARIF formatter

## Not Allowed To Stub
- `--quiet` suppression must be real: when `--quiet` is active, zero bytes written to stdout AND stderr (no progress counter, no output)
- `--json`/`--sarif` mutual exclusion gate must be real and in `args.js`: `if (flags.json && flags.sarif) { console.error('Cannot use --json and --sarif together.'); process.exit(2); }` — this gate must exist before F13 is built because F13 AC item 5 tests it
- Progress counter in check.js must branch on `total >= 5` (D1): below the threshold, `createProgress` must not be called (no output)
- Progress counter in init.js: always call `createProgress` regardless of total (init always shows progress)
- `terminalMode` boolean in `approve.js` must correctly gate the "Commit this file." line: `terminalMode = !flags.json` (not a hardcoded true)
- Grouped check results passed to formatters must match the `{ blocked, admitted_with_approval, new_packages, admitted }` shape that F10-S2 and F10-S3 export — no re-mapping or reshaping at the CLI layer

## Behavioral / Interaction Rules
- `--quiet` behavior: when `--quiet` active, skip all writes to stdout and stderr; exit code still communicates pass/fail; progress counter is also suppressed
- `--json` and `--sarif` are mutually exclusive (D5): hard error exit 2 with message `Cannot use --json and --sarif together.`
- `--sarif` flag exists in args.js after this story; it is a passthrough for F13; no SARIF output produced here
- Progress counter threshold for `check`: exactly `>= 5` packages need metadata fetch (D1); not "more than 5"
- Progress counter for `init`: always; no threshold; fires on every init registry fetch
- Wall time passed to `formatCheckResults` must be measured from the start of `check` execution (before policy load), not just the registry fetch phase
- Baseline status footer wording comes from terminal.js (F10-S2); check.js passes the result shape that terminal.js needs — check.js does not format the footer itself
- `--enforce` mode: check.js must not call `writeAndStage` on success; exit 1 on any block (this is pre-existing behavior, but must be preserved after wiring the new formatters)

## Acceptance Criteria
- [ ] `args.js` exports `--quiet` (boolean) and `--sarif` (boolean) flags; does NOT export `--profile` (reserved for F14)
- [ ] `args.js` gate: `--json` + `--sarif` together → exit 2 with `Cannot use --json and --sarif together.`
- [ ] `check.js` routes to `terminal.js:formatCheckResults` by default; routes to `json.js:formatCheckResults` when `--json`
- [ ] `check.js` calls `createProgress(fetchCount, process.stderr)` when `fetchCount >= 5` and `!flags.quiet`; progress not called below threshold
- [ ] `check.js` suppresses all output when `--quiet` is active (no stdout, no stderr)
- [ ] `approve.js` calls `formatApproveConfirmation(entry, !flags.json)` — "Commit this file." appears in terminal mode only (D9)
- [ ] `audit.js` calls `formatAuditReport(report)` from terminal.js (or json.js when `--json`)
- [ ] `init.js` calls `createProgress(totalPackages, process.stderr)` on every init fetch (no threshold)
- [ ] `--no-cache` behavior unchanged (D16) — no regression in cache bypass logic
- [ ] End-to-end: `trustlock check` on a repo with a blocked dep produces the v0.2 grouped output with summary line, BLOCKED section, and baseline footer
- [ ] End-to-end: `trustlock check --quiet` produces zero output on stdout and stderr; exit code is still correct
- [ ] End-to-end: `trustlock check --json` produces schema_version 2 JSON with grouped keys
- [ ] End-to-end: `trustlock approve axios@1.14.1 --override cooldown --reason "test"` produces v0.2 confirmation with absolute expiry and "Commit this file." reminder
- [ ] Workflow docs updated: `blocked-approve.md` and `check-admit.md` reflect v0.2 output contract (new section structure, absolute timestamps, single approve command)
- [ ] Integration test: `check.js` with 4 packages needing fetch — no progress counter; with 5 packages — progress counter appears on stderr

## Task Breakdown
1. Read `src/cli/args.js` to understand current flag set before modifying
2. Add `--quiet` and `--sarif` boolean flags to args.js; add `--json`/`--sarif` mutex guard (exit 2 with error message); do NOT add `--profile`
3. Read `src/cli/commands/check.js` to understand current structure before modifying
4. Update check.js: wire `terminal.js:formatCheckResults` and `json.js:formatCheckResults`; add `--quiet` suppression; wire `progress.js:createProgress` with `>= 5` threshold guard; pass wall time from process start
5. Read `src/cli/commands/approve.js`; update to call `formatApproveConfirmation(entry, !flags.json)`
6. Read `src/cli/commands/audit.js`; update to call `formatAuditReport(report)` from the correct formatter
7. Read `src/cli/commands/init.js`; wire `createProgress` with no threshold (always fires during init fetch)
8. Update `docs/workflows/cli/blocked-approve.md` to match v0.2 output (grouped sections, absolute timestamps, single approve command, ADMITTED WITH APPROVAL on re-check)
9. Update `docs/workflows/cli/check-admit.md` to match v0.2 output (summary line format, NEW PACKAGES section, minimal ADMITTED section, baseline footer)
10. Write integration tests for end-to-end check flow in advisory, --quiet, --json, and --enforce modes

## Verification
```bash
node --test src/cli/__tests__/check.integration.test.js
# Expected: all integration tests pass

node --test src/cli/__tests__/args.test.js
# Expected: --quiet/--sarif flags present; --json+--sarif mutex produces exit 2

# Manual spot-check (requires a test fixture repo with a blocked dep):
node bin/trustlock.js check
# Expected: v0.2 grouped output with summary line, BLOCKED section, baseline footer

node bin/trustlock.js check --quiet
# Expected: zero output; exit code 0 (admitted) or 1 (blocked with --enforce)

node bin/trustlock.js check --json | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log(d.schema_version)"
# Expected: 2

node bin/trustlock.js check --json --sarif
# Expected: exit 2 with "Cannot use --json and --sarif together."
```

## Edge Cases to Handle
- `--quiet` + `--enforce`: no output, exit 0 (all pass) or exit 1 (any block)
- `--json` mode: progress counter must not appear on stdout; stderr is also suppressed (progress goes to stderr, and --json does not suppress stderr by default — only --quiet suppresses stderr too); verify progress goes only to stderr
- Non-TTY stderr (`isTTY: false`): progress uses newline mode, not `\r` rewrite — this is handled inside progress.js (F10-S1); check.js passes `process.stderr` and progress.js detects the TTY state
- `check` with exactly 5 packages: progress fires (threshold is `>= 5`)
- `check` with 4 packages: progress does not fire
- Cooldown clear timestamp in user's local timezone: computed by terminal.js (F10-S2) from the `clears_at` epoch; check.js passes the epoch value

## Dependencies
- Depends on: F10-S1 (progress.js must exist), F10-S2 (terminal.js new exports must exist), F10-S3 (json.js schema v2 must exist)
- Blocked by: none beyond F10-S1, F10-S2, F10-S3 task completion

## Effort
M — wiring work is well-scoped; the formatters are already implemented; main work is the integration tests and workflow doc updates

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P3

---

## Run Log

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
