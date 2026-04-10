# Workflow: blocked-approve

## Context
- Feature: F10 (v0.2 output redesign), F08 (original CLI commands)
- Goal: Developer encounters a blocked dependency, reads the new grouped output, understands why, copies the generated approve command, and re-commits successfully
- Actor(s)/Roles: Developer (encounters block), Code reviewer (reviews approval in PR)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - trustlock initialized and working
  - Lockfile has been modified with a dependency that violates policy
  - Git pre-commit hook is installed (or developer runs `trustlock check` manually)
  - Baseline exists and is current
- Required permissions:
  - File system write access (to write approval entry)
  - Git write access (approval file is committed alongside lockfile)
- Blocked prerequisites and guidance:
  - Must be initialized: if `.trustlockrc.json` or baseline missing, exit 2 with init guidance

## States And Steps
- Happy path:
  1. Developer runs `git commit` or `trustlock check`
  2. Tool resolves `projectRoot` and `gitRoot` via `paths.js` (v0.2)
  3. Tool loads policy (including remote `extends` if configured), baseline, and approvals
  4. Tool computes delta against baseline; fetches registry metadata for changed packages
  5. One or more packages blocked → tool prints summary line first:
     `3 packages changed  ·  2 blocked  ·  1 admitted  ·  1.8s`
  6. BLOCKED section appears:
     ```
       BLOCKED
       ──────────────────────────────────────────────────────────────
       axios 1.14.0 → 1.14.1                         cooldown · provenance
         Published 2h ago — policy requires 72h. Clears Thu Apr 10 02:21 UTC.
         Provenance present in 1.14.0, absent in 1.14.1.
         ▶  trustlock approve axios@1.14.1 --override cooldown,provenance --reason "..." --expires 7d
     ```
  7. Developer decides: wait for cooldown to clear, OR approve with justification
  8. If approving: developer copies the generated command, replaces `"..."` with a reason, runs it
  9. Tool validates inputs, records approval in `.trustlock/approvals.json`, prints:
     ```
     ✓  Approval recorded

        Package:   axios@1.14.1
        Overrides: cooldown, provenance
        Reason:    "Verified safe by team review"
        Approved:  tayyab
        Expires:   Sun Apr 17 2026 10:30 UTC  (7 days)

        .trustlock/approvals.json updated. Commit this file.
     ```
  10. Developer stages the approval file (`git add .trustlock/approvals.json`)
  11. Developer re-commits — hook runs again
  12. Package now appears in ADMITTED WITH APPROVAL section; baseline advances; commit succeeds
  13. PR reviewer sees the approval entry in the lockfile diff and reviews the justification

- Publisher-change path:
  1. Steps 1–5 same as above
  2. BLOCKED section shows elevated treatment:
     ```
       react 18.2.0 → 18.3.0                         publisher-change ⚠
         Publisher changed: fb → react-team
         Verify the change is legitimate before approving.
         ▶  trustlock approve react@18.3.0 --override publisher-change --reason "..." --expires 7d
     ```
  3. Developer investigates whether the publisher change is legitimate (out-of-band)
  4. Developer either approves (with reason) or reverts the upgrade

- Wait-for-cooldown path:
  1. Steps 1–6 same as above
  2. Developer decides to wait; cooldown clear timestamp is shown exactly: `Clears Thu Apr 10 02:21 UTC`
  3. After cooldown clears, developer re-runs `trustlock check` — cooldown rule passes; package admitted

- Multiple rules on one package:
  1. Package blocked for both cooldown and provenance
  2. Generated approve command combines all overrides: `--override cooldown,provenance`
  3. Developer runs the single command — both overrides covered in one approval record

- Error states:
  - `approve` for package not in lockfile: `Error: axios@1.14.1 not found in lockfile`
  - `approve` with invalid rule name: `Error: 'notarule' is not a valid rule name.`
  - `approve` with expiry exceeding max: `Error: Maximum expiry is 30 days`
  - Profile floor violation (if `--profile` active): `Profile "x" sets cooldown_hours=N, below base config minimum of M`
  - Org policy unreachable, no cache: `Error: could not fetch org policy from <url> and no cached copy exists.`

- Success outcome:
  - Blocked dependency has a scoped, time-limited, attributed approval
  - Commit succeeds with both the lockfile change and the approval entry
  - Approval visible in PR diff for code review

## Interaction And Messaging
- Controls:
  - `trustlock check [--profile <name>] [--project-dir <path>]` (triggers the block)
  - `trustlock approve <pkg>@<ver> --override <rules> --reason "..." [--expires <dur>] [--as <name>]`
- Feedback:
  - Summary line: always first — counts, wall time
  - BLOCKED section: grouped per package; one diagnosis line per fired rule; single approve command
  - Publisher-change: `⚠` marker and hardcoded "Verify the change is legitimate" line
  - Approve confirmation: absolute expiry timestamp; "Commit this file." reminder in terminal mode only
  - Re-check: ADMITTED WITH APPROVAL section with approver, expiry, and reason
- Next-step guidance:
  - After block: cooldown clear timestamp shows exactly when re-check will pass without approval
  - After approval: "Commit this file." — the approvals.json must ship in the same commit
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - `approve` writes one entry to `.trustlock/approvals.json`
  - Successful re-check advances baseline and stages it via `git add`
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: blocked packages show summary + reason + exact cooldown timestamp + single actionable approve command; after approval, ADMITTED WITH APPROVAL section appears; commit succeeds
- Metrics or acceptance signals: approval entry in `approvals.json` with correct overrides, expiry, and attribution; commit succeeds on re-run; code reviewer sees approval in PR diff

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- D9: "Commit this file." reminder emitted in terminal mode only — absent from `--json` output
- D14: Default approval expiry is 7 days — shown in the generated approve command as `--expires 7d`
- D15: Publisher-change with null baseline (old publisher unknown) — warning only, no block; no approve command generated
- All overrides for a blocked package are combined in a single `--override` flag on the generated command (v0.2 change from v0.1)
- C11: Built-in `relaxed` profile can lower cooldown without a floor violation; user-defined `relaxed` cannot
- C8/ADR-005: If `extends` is configured, org policy is loaded before any check run; floor enforcement applies to the merged config
