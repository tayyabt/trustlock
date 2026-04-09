# Review Artifact — task-041: Fix BUG-001 approval command uses full rule IDs

## Status

Ready for review.

## Summary

Fixed the terminal formatter so the generated `dep-fence approve` command emits short rule names (e.g. `scripts`, `cooldown`) instead of full rule IDs (e.g. `execution:scripts`, `exposure:cooldown`). Running the copy-pasted approval command now succeeds.

## Changes

| File | Change |
|---|---|
| `src/approvals/models.js` | Added `FINDING_RULE_TO_APPROVAL_NAME` map export (7 entries: full rule ID → short approval name) |
| `src/output/terminal.js` | Imported map; applied `.get(f.rule) ?? f.rule` translation when building `blockingRules` |
| `test/output/terminal.test.js` | Updated stale assertion (`exposure:cooldown` → `cooldown`); added 2 BUG-001 AC tests |
| `docs/design-notes/task-041-approach.md` | Root cause analysis, approach, verification results |

## Acceptance Criteria

| AC | Result |
|---|---|
| `execution:scripts` finding → `--override scripts` in generated command | PASS |
| `exposure:cooldown` finding → `--override cooldown` in generated command | PASS |
| Generated command exits 0 (correct short name now emitted) | PASS |

## Test Results

- 49/49 pass in `test/output/terminal.test.js`
- 302/302 pass across all unit test suites (approvals, output, policy, unit/cli)

## Design Note

See `docs/design-notes/task-041-approach.md` for root cause analysis and verification evidence.
