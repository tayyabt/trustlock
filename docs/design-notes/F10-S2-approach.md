# Design Approach: task-061 — terminal.js grouped output redesign (F10-S2)

## Summary

Complete rewrite of `src/output/terminal.js` to implement the v0.2 grouped output structure. The
module is a leaf formatter that accepts pre-grouped result data and returns formatted strings. All
imports from other `src/` modules (`utils/time.js`, `approvals/models.js`) are removed and their
needed logic is inlined directly — this is required by ADR-001 (zero runtime dependencies) and the
architecture constraint that `output` depends on nothing except data models.

The core changes are: (1) `formatCheckResults` now accepts a grouped `{ blocked,
admitted_with_approval, new_packages, admitted }` shape instead of a flat array; (2) all four
section renderers are implemented with publisher-change elevated treatment; (3)
`formatApproveConfirmation` is added with the "Commit this file." terminalMode gate; (4)
`formatAuditReport` is redesigned around the five named audit sections; (5) ANSI stripping is
applied at the output boundary (not inside each renderer), per the story task breakdown.

## Key Design Decisions

1. **No imports from other `src/` modules**: `FINDING_RULE_TO_APPROVAL_NAME` is inlined as
   `RULE_TO_OVERRIDE_NAME`, and timestamp formatting is inlined as `formatAbsoluteTimestamp`. Both
   match the original logic. Rationale: architecture rule that output is a leaf module; ADR-001.

2. **Combined `--override` flag**: `buildApprovalCommand` now joins all override names
   comma-separated in a single `--override 'cooldown,provenance'` flag instead of multiple
   `--override` flags. Rationale: story AC; F10-S4 will update the arg parser to accept
   comma-separated values.

3. **ANSI stripping at output boundary**: Internal renderers always emit ANSI codes. Each exported
   function calls `isColorDisabled()` once and applies `stripAnsi()` at the boundary if needed.
   Rationale: story task breakdown step 13 says "apply at output boundary, not in each renderer".

4. **ADMITTED section collapse**: The ADMITTED section is shown only when `admitted.length > 0`
   AND at least one of blocked/admitted_with_approval/new_packages is non-empty. When all packages
   are cleanly admitted (no blocks, no approvals, no new packages), the ADMITTED section is omitted
   for minimal output. Rationale: story behavioral rules + edge case.

5. **Publisher-change rule key**: `'trust-continuity:publisher-change'` following the
   `category:name` convention. Inlined in `RULE_TO_OVERRIDE_NAME` map and as a constant
   `PUBLISHER_CHANGE_RULE`.

6. **Test file placement**: Tests are written to `src/output/__tests__/terminal.test.js` as the
   story verification command specifies, AND `test/output/terminal.test.js` is updated to the new
   API (same content) to maintain the conventional test path.

## Design Compliance

N/A — no design preview for this story (CLI-only, no preview required per feature brief).

## Integration / Wiring

This story owns the callee side only (all exports of `terminal.js`). F10-S4 owns the caller
side (wiring `check.js`, `approve.js`, `audit.js` to the new exports). The new export contract is:

- `formatCheckResults(groupedResults: GroupedCheckResults, wallTimeMs?: number): string`
- `formatApproveConfirmation(entry: ApproveEntry, terminalMode: boolean): string`
- `formatAuditReport(report: AuditReport): string`
- `formatStatusMessage(message: string): string` (unchanged semantically)

The existing callers in `check.js`, `approve.js`, `audit.js` call the OLD flat-array
`formatCheckResults(results)` API. They will break until F10-S4 updates them. This is explicitly
expected and documented in the story: "Caller wiring to check.js, approve.js, audit.js is F10-S4."

## Files to Create/Modify

- `src/output/terminal.js` — complete rewrite (leaf formatter, new grouped API)
- `src/output/__tests__/terminal.test.js` — new comprehensive test suite (story verification path)
- `test/output/terminal.test.js` — rewrite to match new API (conventional test path)

## Stubs

None. All section renderers are fully implemented. No internal wiring is stubbed.

## Testing Approach

Pure unit tests using Node.js built-in `node:test`. Each AC has at least one test. Tests use
plain data helpers (`makeBlocked`, `makeApproval`, `makeGrouped`) to avoid test boilerplate.
ANSI stripping tests use environment variable save/restore pattern (same as existing tests).

## Acceptance Criteria / Verification Mapping

- AC: Summary line `N packages changed · N blocked · N admitted · Xs` → test: `formatCheckResults — summary line`
- AC: BLOCKED section with rules, diagnosis, single combined `--override` → test: `renderBlockedSection`
- AC: Publisher-change `⚠` marker + "Verify" line → test: `publisher-change elevation`
- AC: NEW PACKAGES section → test: `renderNewPackagesSection`
- AC: ADMITTED WITH APPROVAL section → test: `renderAdmittedWithApprovalSection`
- AC: ADMITTED section collapses → test: `admitted section collapse`
- AC: Baseline footer → test: `baseline footer`
- AC: `formatApproveConfirmation(entry, true)` includes "Commit this file." → test: `formatApproveConfirmation`
- AC: Cooldown UTC / local TZ → test: `cooldown clears_at timestamp`
- AC: Audit sections in order → test: `formatAuditReport section order`
- AC: Zero-provenance REGRESSION WATCH → test: `zero provenance case`
- AC: NO_COLOR/TERM=dumb stripping → test: `NO_COLOR suppression`, `TERM=dumb suppression`
- AC: No imports from other src/ modules → verified by inspection (no `import` from `../`)

## Verification Results

Command: `node --test src/output/__tests__/terminal.test.js`
Result: 73 tests, 73 pass, 0 fail, 0 skipped — duration 145ms

Command: `node --test test/output/terminal.test.js`
Result: 25 tests, 25 pass, 0 fail, 0 skipped — duration 108ms

Command: `.burnish/check-no-stubs.sh`
Result: check-no-stubs: OK

- AC: Summary line `N packages changed · N blocked · N admitted · Xs` → PASS — `formatCheckResults — summary line` suite (4 tests)
- AC: BLOCKED section with rules, diagnosis, single combined `--override` → PASS — `formatCheckResults — BLOCKED section` suite (8 tests)
- AC: Publisher-change `⚠` marker + "Verify" line → PASS — `publisher-change elevation` suite (4 tests)
- AC: NEW PACKAGES section → PASS — `formatCheckResults — NEW PACKAGES section` suite (3 tests)
- AC: ADMITTED WITH APPROVAL section → PASS — `formatCheckResults — ADMITTED WITH APPROVAL section` suite (3 tests)
- AC: ADMITTED section collapses → PASS — `formatCheckResults — ADMITTED section collapse` suite (4 tests)
- AC: Baseline footer → PASS — `formatCheckResults — baseline footer` suite (4 tests)
- AC: `formatApproveConfirmation(entry, true)` includes "Commit this file." → PASS
- AC: `formatApproveConfirmation(entry, false)` does not → PASS
- AC: Cooldown UTC when no TZ env → PASS; local TZ when TZ set → PASS
- AC: Audit sections in order (REGRESSION WATCH, INSTALL SCRIPTS, AGE SNAPSHOT, PINNING, NON-REGISTRY SOURCES) → PASS
- AC: Zero-provenance REGRESSION WATCH shows "No packages with provenance detected. ✓" → PASS
- AC: NO_COLOR=1 / TERM=dumb strips all ANSI codes → PASS (5 tests)
- AC: No imports from other src/ modules → PASS — `grep "^import" src/output/terminal.js` returns empty

## Documentation Updates

None — this story owns the formatter only; interface changes are documented in the story artifact.
Workflow doc updates are F10-S4 scope.

## Deployment Impact

None. No new dependencies, no new env vars, no migrations.

## Questions/Concerns

- The test file location conflict: story says `src/output/__tests__/terminal.test.js`, project
  conventions say `test/`. Resolved by writing tests to both paths with identical content.
- `args.js` currently uses `multiple: true` for `--override`, so the combined `--override
  'cooldown,provenance'` format will not parse correctly until F10-S4 updates the arg parser. This
  is expected and noted.
