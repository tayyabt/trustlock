# Story: F08-S3 — `approve` Command

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Implement `trustlock approve <pkg>@<ver>` — the command a developer runs after being blocked by `check`. This story wires the CLI approve handler to the approvals store and validator, completing the callee side of the blocked-approve workflow.

## Scope
**In scope:**
- `src/cli/commands/approve.js` — full implementation (replace stub from F08-S1)
- Argument parsing: `<pkg>@<ver>` positional, `--override <rules>`, `--reason <text>`, `--expires <duration>`, `--as <name>`
- Input validation: package exists in lockfile, override names are valid rule names, expiry within `max_expiry_days`, reason present when `require_reason: true`
- Calling approvals store `appendApproval(entry)` (F05-S01)
- Calling approvals validator `validateApproval(entry, policy, lockfile)` (F05-S02)
- Getting approver identity from `git config user.name` or `--as` flag (D7)
- Printing confirmation with expiry date

**Not in scope:**
- Checking evaluation or re-checking — `check` handles that
- Writing to baseline
- Generating the approval command (that is F05-S03, consumed by check output)

## Entry Points
- Route / page / screen: `trustlock approve <pkg>@<ver> --override <rules> --reason <text> [--expires <dur>] [--as <name>]`
- Trigger / navigation path: Developer manually runs after seeing a block from `trustlock check`
- Starting surface: `src/cli/index.js` routes `approve` → `commands/approve.js`

## Wiring / Integration Points
- Caller-side ownership: `index.js` already routes to the approve stub (F08-S1); this story replaces the stub — no changes to `index.js` needed
- Callee-side ownership: This story owns wiring to:
  - `src/lockfile/parser.js` (F02): `parseLockfile()` — to validate package exists
  - `src/approvals/store.js` (F05): `readApprovals()`, `appendApproval(entry)`
  - `src/approvals/validator.js` (F05): `validateApproval(entry, policy, lockfile)`
  - `src/utils/git.js` (F01): `getGitUserName()` — for approver identity (D7)
- Caller-side conditional rule: Caller (`index.js`) already exists; wire callee to it now (stub replacement)
- Callee-side conditional rule: All upstream modules exist (F01, F02, F05); wire to real APIs now
- Boundary / contract check: Verify that `approvals.json` contains the correctly shaped entry after `approve` runs
- Files / modules to connect: `approve.js` → lockfile parser, approvals store, approvals validator, git utils
- Deferred integration: Re-check flow deferred to F08-S6 integration tests

## Not Allowed To Stub
- Lockfile parser call — must be real; package existence check must be live against the actual lockfile
- Approvals store `appendApproval` — must be real; must write to `.trustlock/approvals.json`
- Approvals validator — must be real; invalid inputs must be rejected before writing
- Git user name resolution — must call real `git config user.name` (not hardcoded)

## Behavioral / Interaction Rules
- **D7 (approver identity):** Use `git config user.name`; fall back to `--as` if provided; `--as` always takes precedence
- **D9 (no wildcard approvals):** `--override` is required; "approve all" is not valid; must name specific rule names
- Expiry capping: if `--expires` exceeds `max_expiry_days` in policy, reject with specific error message (do not silently cap)
- `require_reason` default: true; if `require_reason: false` in policy, `--reason` is optional
- Confirmation output: `"Approved <pkg>@<ver> (overrides: <rules>). Expires: <ISO-datetime>Z"`
- Error messages must be specific (see error states in blocked-approve workflow):
  - Package not in lockfile: `"Error: <pkg>@<ver> not found in lockfile"`
  - Invalid override: `"Error: '<name>' is not a valid rule name. Valid rules: cooldown, provenance, scripts, source, pinning"`
  - Expiry exceeds max: `"Error: Maximum expiry is <N> days (configured in .trustlockrc.json)"`
  - Missing reason: `"Error: --reason is required (configure require_reason: false to disable)"`

## Acceptance Criteria
- [ ] `trustlock approve axios@1.14.1 --override cooldown --reason "ok"` writes a valid approval entry to `.trustlock/approvals.json`
- [ ] Approval entry has: `package`, `version`, `overrides` (array), `reason`, `approvedAt` (ISO), `expiresAt` (ISO), `approvedBy` (from git config)
- [ ] `--as <name>` overrides `git config user.name` for `approvedBy`
- [ ] Package not in lockfile exits with error message (exit 2)
- [ ] Invalid `--override` value exits with error listing valid rule names (exit 2)
- [ ] `--expires` exceeding `max_expiry_days` exits with error (exit 2)
- [ ] Missing `--reason` when `require_reason: true` exits with error (exit 2)
- [ ] Approval file is appended (not overwritten) when approvals already exist

## Task Breakdown
1. Implement `src/cli/commands/approve.js` — parse `<pkg>@<ver>` positional argument
2. Load current lockfile and validate package exists
3. Load policy config for `max_expiry_days` and `require_reason`
4. Call approvals validator with entry + policy + lockfile
5. Resolve approver identity: `git config user.name` or `--as`
6. Call approvals store `appendApproval(entry)`
7. Print confirmation with expiry date
8. Write unit tests for all error states and the happy path

## Verification
```bash
# Setup: trustlock initialized project with a lockfile containing axios@1.14.1
node src/cli/index.js approve axios@1.14.1 --override cooldown --reason "testing"
# Expected: "Approved axios@1.14.1 (overrides: cooldown). Expires: <date>Z"

node -e "const a = JSON.parse(require('fs').readFileSync('.trustlock/approvals.json')); console.log(a.slice(-1)[0])"
# Expected: last approval entry has correct shape

node src/cli/index.js approve notreal@0.0.1 --override cooldown --reason "x"; echo $?
# Expected: "Error: notreal@0.0.1 not found in lockfile", exits 2

node --test test/unit/cli/approve.test.js
# Expected: all tests pass
```

## Edge Cases to Handle
- Package not in lockfile: exit 2, specific error
- Invalid override rule name: exit 2, list valid names
- `--expires` exceeding `max_expiry_days`: exit 2, show configured max
- Missing `--reason` when required: exit 2
- No `git config user.name` set and no `--as`: exit 2 with "Cannot determine approver identity. Set git config user.name or use --as"
- Append to existing approvals (not overwrite)

## Dependencies
- Depends on: F08-S1 (routing stub must exist)
- Blocked by: F01 (git utils), F02 (lockfile parser), F05 (approvals store + validator) — all must be done

## Effort
M — straightforward validation + write, several error states

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P0

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
Format:
### [ISO date] [Agent]: [Action]
[Details]
-->
