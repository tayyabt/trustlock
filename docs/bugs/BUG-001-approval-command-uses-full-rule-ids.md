# Bug Report: BUG-001 Approval command in check output uses full rule IDs that `approve` does not accept

## Summary

When `dep-fence check` blocks a dependency, it prints a generated approval command for the user to run. The terminal formatter includes `--override 'execution:scripts'` (full rule IDs with the category prefix), but the `approve` command only accepts short rule names like `scripts`, `cooldown`, `provenance`, `source`, `pinning`. If a user copy-pastes the generated command, it fails with an "not a valid rule name" error.

This is a usability bug that breaks the core blocked-approve workflow documented in `docs/workflows/cli/blocked-approve.md`: the tool promises a "ready-to-copy shell command with correct flags" but the flag value is wrong.

## Expected Behavior

The generated approval command printed by `dep-fence check` should use the same short rule-name format accepted by `dep-fence approve`. For example:
```
dep-fence approve scripted-pkg@1.0.0 --override scripts --reason "..." --expires 7d
```

## Actual Behavior

The terminal formatter emits the full rule ID (e.g. `execution:scripts`) in the generated command:
```
dep-fence approve scripted-pkg@1.0.0 --override 'execution:scripts' --reason "..." --expires 7d
```
Running the generated command produces: `Error: 'execution:scripts' is not a valid rule name.`

## Reproduction

1. Initialize a dep-fence project: `dep-fence init`
2. Add a dependency with install scripts to `package-lock.json`
3. Run `dep-fence check` — output includes block reason and generated approval command with `--override 'execution:scripts'`
4. Copy-paste and run the generated command
5. Observe: `Error: 'execution:scripts' is not a valid rule name. Valid rules: cooldown, provenance, scripts, source, pinning`

## Scope / Environment

- CLI terminal output (`src/output/terminal.js` → approval command generation)
- `dep-fence approve` argument parsing (`src/cli/commands/approve.js` or `src/cli/args.js`)
- Affects all users who copy-paste the generated approval command after a block

## Evidence

- Noted in `docs/design-notes/F08-S6-approach.md` Risk 3: "The terminal formatter produces `--override 'execution:scripts'` (using full rule IDs) while the `approve` command accepts only short names like `scripts`."
- Integration test `approve + re-check` works around this by using `--override scripts` directly, not the generated command.

## Severity / User Impact

**Medium.** The primary user workflow (blocked-approve) includes copy-pasting the generated command. Users who follow the generated command verbatim will hit a confusing error with no guidance. Workaround: manually replace `execution:scripts` with `scripts` in the command. Every blocked user is affected.

## Duplicate Relationship

none

## Confirmation Snapshot

Filed during code review of task-039 (F08-S6 integration tests). The reviewer identified the discrepancy from the design note risk acknowledgment and the blocked-approve workflow contract.

## Behavioral / Interaction Rules

Per `docs/workflows/cli/blocked-approve.md` Interaction and Messaging:
- "Approval command: ready-to-copy shell command with correct flags"
- Generated command must be directly runnable without manual editing.

## Counterpart Boundary / Contract

Caller: terminal formatter generates the approval command string.
Callee: `dep-fence approve` parses `--override` values against a known short-name registry.
Contract violation: formatter uses full IDs; approve expects short names.

## Root-Cause Hypothesis

The terminal formatter likely sources rule IDs directly from policy `Finding` objects (which use the full `category:rule` format for uniqueness) rather than mapping them back to the short names that `approve` accepts.

## Acceptance Criteria

- `dep-fence check` output for a blocked `execution:scripts` finding includes `--override scripts` (not `--override 'execution:scripts'`) in the generated approval command
- `dep-fence check` output for a blocked `trust:cooldown` finding includes `--override cooldown` in the generated command
- Running the copy-pasted approval command exits 0 and writes the approval entry

## Verification

```bash
# In a project with scripted-pkg blocked:
dep-fence check | grep "dep-fence approve"
# Expected: --override scripts (no prefix)

# Copy-paste the generated command and run it — must exit 0
```

## Metadata

- Agent: bug-assistant
- Date: 2026-04-09
- Bug ID: BUG-001
- Related Feature or Story: F08-S6 (found during review), blocked-approve workflow
- Duplicate Of: none
- UI-Affecting: no
- Design Foundation: none
- Feature Preview: none
- Preview Notes: none
