# Story: F10-S2 — terminal.js grouped output redesign

## Parent
F10: Output/UX Redesign

## Description
Rewrite `src/output/terminal.js` to implement the v0.2 grouped output structure: four ordered sections (BLOCKED, ADMITTED WITH APPROVAL, NEW PACKAGES, ADMITTED), a redesigned `approve` confirmation with absolute expiry and "Commit this file." reminder, and redesigned audit sections. This story owns the pure formatter; CLI wiring happens in F10-S4.

## Scope
**In scope:**
- `src/output/terminal.js` (significant rewrite of all formatting functions)
- All section renderers: summary line, BLOCKED, ADMITTED WITH APPROVAL, NEW PACKAGES, ADMITTED, baseline status footer
- Publisher-change elevated treatment (`⚠` marker + "Verify" line)
- Approve confirmation redesign (absolute expiry, "Commit this file." in terminal mode)
- Audit output redesign (REGRESSION WATCH, INSTALL SCRIPTS, AGE SNAPSHOT, PINNING, NON-REGISTRY SOURCES sections)
- `formatStatusMessage` for "No dependency changes" and "Baseline advanced." / "Baseline not advanced — N packages blocked."
- Cooldown clear timestamp in local timezone (when `TZ` env set) or UTC
- ANSI color constants (red blocks, green admits, yellow warnings, dim informational) — hand-coded per ADR-001
- Respecting `NO_COLOR` and `TERM=dumb` for accessibility

**Not in scope:**
- JSON formatting (F10-S3)
- progress.js integration (F10-S4 wires progress from CLI)
- args.js flag changes (F10-S4)
- check.js / approve.js / audit.js updates (F10-S4)
- Workflow doc updates (F10-S4)

## Entry Points
- Route / page / screen: `src/output/terminal.js` — pure formatting module
- Trigger / navigation path: Called by CLI command handlers (check.js, approve.js, audit.js) with structured result data
- Starting surface: Existing `terminal.js` in the output module; this story rewrites it in place

## Wiring / Integration Points
- Caller-side ownership: F10-S4 owns wiring check.js, approve.js, audit.js to the new terminal.js exports
- Callee-side ownership: This story owns all exported formatting functions in terminal.js and their exact signatures
- Caller-side conditional rule: Callers (check.js, approve.js, audit.js) exist but are not yet updated for F10 — this story defines the new export contract; F10-S4 wires to it
- Callee-side conditional rule: The existing terminal.js is the callee being rewritten; this story owns the rewrite completely
- Boundary / contract check: `formatCheckResults(groupedResults)` must accept the new grouped input shape `{ blocked, admitted_with_approval, new_packages, admitted }` and return the full formatted string. `formatApproveConfirmation(entry, terminalMode)` takes an approval record plus a boolean that controls the "Commit this file." line. `formatAuditReport(report)` accepts the structured audit report and returns the section-based string.
- Files / modules to connect: `src/output/terminal.js` only — no imports from other modules (output is a leaf module)
- Deferred integration, if any: Caller wiring to check.js, approve.js, audit.js is F10-S4

## Not Allowed To Stub
- All four section renderers (BLOCKED, ADMITTED WITH APPROVAL, NEW PACKAGES, ADMITTED) must be fully implemented — no placeholder output
- Publisher-change elevated treatment (`⚠` marker + hardcoded "Verify the change is legitimate before approving." line) must fire on and only on `publisher-change` rule blocks
- The combined `approve` command (all overrides in one `--override` flag) must be generated correctly for multi-rule blocks
- Absolute cooldown clear timestamp (not relative age) must be computed from `clears_at` epoch value
- "Commit this file." line must be gated on `terminalMode === true` — it must not appear in JSON mode (but this is a terminal formatter story; the gate is the boolean argument)
- `NO_COLOR` and `TERM=dumb` ANSI stripping must be real, not a future TODO

## Behavioral / Interaction Rules
- Summary line always first: `N packages changed · N blocked · N admitted · Xs` — where wall time is passed in as a parameter, not computed internally
- Section order is fixed: summary → BLOCKED → ADMITTED WITH APPROVAL → NEW PACKAGES → ADMITTED → baseline status footer
- ADMITTED section: names only (no per-package details); omitted entirely when all packages are admitted with no new packages (i.e., all go to ADMITTED WITH APPROVAL or ADMITTED, but collapse if ADMITTED is empty and NEW PACKAGES is empty)
- Publisher-change rule is the only rule that gets the `⚠` marker and "Verify" line; no other rule gets this treatment
- Cooldown clear timestamp shown in user's local timezone when `TZ` env is set; UTC otherwise
- ADMITTED WITH APPROVAL section shows: approver, absolute expiry, and reason — one line per package
- Baseline status footer: `Baseline advanced.` on full admission; `Baseline not advanced — N packages blocked.` when any blocked
- Audit output provenance section labeled "REGRESSION WATCH" — never "provenance score" or "trust score"
- `formatAuditReport` zero-package case (REGRESSION WATCH section): show "No packages with provenance detected. ✓"
- INSTALL SCRIPTS section: unallowlisted packages shown with `✗` marker

## Acceptance Criteria
- [ ] Summary line format: `N packages changed · N blocked · N admitted · Xs` (wall time parameter, not internally measured)
- [ ] BLOCKED section: one block per package; all fired rules listed right-aligned; one diagnosis line per rule in plain English; single `trustlock approve` command with `--override <all-rules-combined>`
- [ ] Publisher-change block: `⚠` marker on the package line; hardcoded "Verify the change is legitimate before approving." line; no other rule gets this
- [ ] NEW PACKAGES section: appears for packages where `isNew: true` regardless of admission decision
- [ ] ADMITTED WITH APPROVAL section: shows approver, absolute expiry, reason; appears only when at least one package in this group
- [ ] ADMITTED section: names only; collapses entirely when empty
- [ ] Baseline status footer: `Baseline advanced.` / `Baseline not advanced — N packages blocked.` always last
- [ ] `formatApproveConfirmation(entry, true)` includes "Commit this file." line; `formatApproveConfirmation(entry, false)` does not
- [ ] Cooldown clear timestamp: UTC when no `TZ` env, local timezone when `TZ` is set
- [ ] Audit sections rendered in order: REGRESSION WATCH, INSTALL SCRIPTS, AGE SNAPSHOT, PINNING, NON-REGISTRY SOURCES
- [ ] Zero-provenance case: REGRESSION WATCH shows "No packages with provenance detected. ✓"
- [ ] `NO_COLOR=1` or `TERM=dumb`: all ANSI codes stripped from output
- [ ] `src/output/terminal.js` imports nothing outside Node.js built-ins (ADR-001) — no imports from other `src/` modules
- [ ] Unit tests cover all sections, edge cases (all admitted collapse, publisher-change path, multi-rule combine, NO_COLOR stripping)

## Task Breakdown
1. Read and understand the existing `src/output/terminal.js` before touching it
2. Define the new input shape interfaces (`GroupedCheckResults`, `ApprovalEntry`, `AuditReport`) as JSDoc types at the top of the file
3. Implement `formatSummaryLine(counts, wallTimeMs)` → string
4. Implement `renderBlockedSection(blocked)` with per-package grouping, rule diagnosis, combined override command, publisher-change elevation
5. Implement `renderAdmittedWithApprovalSection(admitted_with_approval)` with approver, absolute expiry, reason
6. Implement `renderNewPackagesSection(new_packages)` 
7. Implement `renderAdmittedSection(admitted)` with name-only list; return empty string when list is empty
8. Implement `renderBaselineFooter(anyBlocked, blockedCount)` → string
9. Implement `formatCheckResults(groupedResults, wallTimeMs)` composing all sections in order
10. Implement `formatApproveConfirmation(entry, terminalMode)` with absolute expiry and conditional reminder
11. Implement `formatAuditReport(report)` with all five named sections
12. Implement `formatStatusMessage(message)` for "No dependency changes" case
13. Implement `NO_COLOR` / `TERM=dumb` ANSI stripping (apply at output boundary, not in each renderer)
14. Write unit tests in `src/output/__tests__/terminal.test.js`

## Verification
```bash
node --test src/output/__tests__/terminal.test.js
# Expected: all tests pass
# Spot-check: render a blocked result with two rules; confirm single --override flag
# Spot-check: render with NO_COLOR=1; confirm no ANSI codes in output
```

## Edge Cases to Handle
- Multiple rules fire on one package: all overrides combined as `cooldown,provenance` in a single `--override` flag
- Publisher-change with null baseline (old publisher unknown): no block generated; this is an edge case for the check logic, but terminal.js must handle a missing approve_command gracefully (render warning block without approve line)
- All packages admitted with no new packages: BLOCKED, ADMITTED WITH APPROVAL, and NEW PACKAGES sections all absent; output is summary + "Baseline advanced." only
- `--quiet` output: this story does not handle --quiet suppression (that is CLI layer in F10-S4); terminal.js always returns its formatted string
- ADMITTED section empty: omit the section header entirely (no empty section with header and no items)

## Dependencies
- Depends on: none within F10 (terminal.js is a leaf formatter; progress.js is not imported here)
- Blocked by: none

## Effort
L — significant rewrite of a complex module; multiple sections each with edge cases; test coverage is substantial

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P1

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
