# Workflow: init-onboarding

## Context
- Feature: F08
- Goal: Developer initializes dep-fence in an existing npm project and gets a working trust baseline
- Actor(s)/Roles: Policy owner or developer (one-time setup per project)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - npm project with a `package-lock.json` in the working directory
  - `.dep-fence/` directory does NOT exist (D6)
  - Git repository initialized (needed for hook installation)
- Required permissions:
  - File system write access to project directory
- Blocked prerequisites and guidance:
  - If no lockfile exists: "No lockfile found. Run `npm install` first to generate package-lock.json."
  - If `.dep-fence/` exists: "dep-fence is already initialized. Delete `.dep-fence/` to reinitialize."

## States And Steps
- Happy path:
  1. Developer runs `dep-fence init`
  2. Tool detects `package-lock.json` and its version (v1/v2/v3)
  3. Tool creates `.depfencerc.json` with default policy
  4. Tool creates `.dep-fence/` directory structure: `approvals.json` (empty array), `.cache/`, `.gitignore`
  5. Tool parses lockfile, fetches registry metadata for provenance, builds trust profiles
  6. Tool writes `.dep-fence/baseline.json` with all current packages trusted
  7. Tool prints summary: "Baselined N packages. Detected npm lockfile vX."
  8. Developer optionally runs `dep-fence install-hook` to set up pre-commit hook
- Empty state:
  - Lockfile exists but has zero dependencies: baseline created with empty packages object, summary shows "Baselined 0 packages"
- Loading/async states:
  - Registry fetches during baseline creation may take seconds for large projects; no progress indicator in v0.1
- Error states:
  - No lockfile: exit 2, "No lockfile found" message
  - `.dep-fence/` exists: exit 2, "Already initialized" message
  - Unknown lockfile version: exit 2, "Unsupported npm lockfile version X"
  - Registry unreachable during init: baseline created with null provenance fields, warning printed
- Success outcome:
  - `.depfencerc.json`, `.dep-fence/baseline.json`, `.dep-fence/approvals.json` exist and are valid
  - Developer can immediately run `dep-fence check` or `dep-fence audit`

## Interaction And Messaging
- Controls: CLI command `dep-fence init [--trust-current] [--strict] [--no-baseline]`
- Feedback:
  - Success: summary with package count, lockfile format, and next-step suggestion ("Run `dep-fence install-hook` to add the pre-commit hook")
  - Error: specific error message with remediation guidance
- Next-step guidance: "Next: run `dep-fence install-hook` to enable the pre-commit hook, or `dep-fence audit` to see your dependency trust posture"
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - Creates `.depfencerc.json` in project root
  - Creates `.dep-fence/` directory with `baseline.json`, `approvals.json`, `.cache/`, `.gitignore`
  - Network calls to npm registry for provenance data during baseline creation
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: summary message printed, files created on disk
- Metrics or acceptance signals: `dep-fence check` runs successfully after init with no errors

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- `--strict` mode creates policy with provenance required for top 100 npm packages — useful for security-conscious teams
- `--no-baseline` skips baseline creation — useful if the team wants to run `dep-fence audit` first to understand their posture
- `--trust-current` is the default — trusts everything in the current lockfile
