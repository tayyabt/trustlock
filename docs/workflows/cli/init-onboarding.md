# Workflow: init-onboarding

## Context
- Feature: F08
- Goal: Developer initializes trustlock in an existing npm project and gets a working trust baseline
- Actor(s)/Roles: Policy owner or developer (one-time setup per project)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - npm project with a `package-lock.json` in the working directory
  - `.trustlock/` directory does NOT exist (D6)
  - Git repository initialized (needed for hook installation)
- Required permissions:
  - File system write access to project directory
- Blocked prerequisites and guidance:
  - If no lockfile exists: "No lockfile found. Run `npm install` first to generate package-lock.json."
  - If `.trustlock/` exists: "trustlock is already initialized. Delete `.trustlock/` to reinitialize."

## States And Steps
- Happy path:
  1. Developer runs `trustlock init`
  2. Tool detects `package-lock.json` and its version (v1/v2/v3)
  3. Tool creates `.trustlockrc.json` with default policy
  4. Tool creates `.trustlock/` directory structure: `approvals.json` (empty array), `.cache/`, `.gitignore`
  5. Tool parses lockfile, fetches registry metadata for provenance, builds trust profiles
  6. Tool writes `.trustlock/baseline.json` with all current packages trusted
  7. Tool prints summary: "Baselined N packages. Detected npm lockfile vX."
  8. Developer optionally runs `trustlock install-hook` to set up pre-commit hook
- Empty state:
  - Lockfile exists but has zero dependencies: baseline created with empty packages object, summary shows "Baselined 0 packages"
- Loading/async states:
  - Registry fetches during baseline creation may take seconds for large projects; no progress indicator in v0.1
- Error states:
  - No lockfile: exit 2, "No lockfile found" message
  - `.trustlock/` exists: exit 2, "Already initialized" message
  - Unknown lockfile version: exit 2, "Unsupported npm lockfile version X"
  - Registry unreachable during init: baseline created with null provenance fields, warning printed
- Success outcome:
  - `.trustlockrc.json`, `.trustlock/baseline.json`, `.trustlock/approvals.json` exist and are valid
  - Developer can immediately run `trustlock check` or `trustlock audit`

## Interaction And Messaging
- Controls: CLI command `trustlock init [--trust-current] [--strict] [--no-baseline]`
- Feedback:
  - Success: summary with package count, lockfile format, and next-step suggestion ("Run `trustlock install-hook` to add the pre-commit hook")
  - Error: specific error message with remediation guidance
- Next-step guidance: "Next: run `trustlock install-hook` to enable the pre-commit hook, or `trustlock audit` to see your dependency trust posture"
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - Creates `.trustlockrc.json` in project root
  - Creates `.trustlock/` directory with `baseline.json`, `approvals.json`, `.cache/`, `.gitignore`
  - Network calls to npm registry for provenance data during baseline creation
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: summary message printed, files created on disk
- Metrics or acceptance signals: `trustlock check` runs successfully after init with no errors

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- `--strict` mode creates policy with provenance required for top 100 npm packages — useful for security-conscious teams
- `--no-baseline` skips baseline creation — useful if the team wants to run `trustlock audit` first to understand their posture
- `--trust-current` is the default — trusts everything in the current lockfile
