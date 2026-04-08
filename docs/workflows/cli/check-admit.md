# Workflow: check-admit

## Context
- Feature: F08
- Goal: Developer commits a dependency change and all packages pass policy — baseline advances automatically
- Actor(s)/Roles: Developer (on every commit with dependency changes)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - dep-fence initialized (`.depfencerc.json` and `.dep-fence/baseline.json` exist)
  - Lockfile has been modified (e.g., `npm install axios@latest` was run)
  - Git working tree has the updated lockfile staged or about to be committed
- Required permissions:
  - File system read/write access
- Blocked prerequisites and guidance:
  - If not initialized: exit 2, "No .depfencerc.json found. Run `dep-fence init` first."
  - If baseline missing: exit 2, "No baseline found. Run `dep-fence init` first."

## States And Steps
- Happy path (advisory mode — pre-commit hook or manual):
  1. Developer runs `git commit` (triggers pre-commit hook) or manually runs `dep-fence check`
  2. Tool loads policy, baseline, approvals, and parses current lockfile
  3. Tool computes delta: identifies added, changed, removed packages
  4. For each changed/added package, tool fetches registry metadata (cache-first) and evaluates all rules
  5. All packages pass policy → all decisions are "admitted"
  6. Tool prints summary: "2 packages admitted (axios 1.14.0 → 1.14.1, lodash added)"
  7. Tool advances baseline: writes updated `.dep-fence/baseline.json` and runs `git add` to stage it
  8. Exit 0 — commit proceeds
- Happy path (enforce mode — CI):
  1. CI runs `dep-fence check --enforce`
  2. Same evaluation as above
  3. All packages pass → tool prints summary, exit 0
  4. Baseline is NOT advanced (D10 — CI is read-only)
- No changes:
  1. Tool computes delta, finds no changes
  2. Prints "No dependency changes"
  3. Exit 0 — no baseline update needed
- Loading/async states:
  - Registry fetches may take 1-5 seconds depending on cache state and number of changes
- Error states:
  - Config missing/malformed: exit 2 with specific error
  - Lockfile parse failure: exit 2 with "Unsupported lockfile version" or parse error
  - Registry unreachable: registry-dependent checks emit warnings but do not block; local-only checks still evaluate
- Success outcome:
  - All dependency changes evaluated and admitted
  - Baseline updated to reflect newly trusted packages (advisory mode only)
  - Developer sees which packages were admitted and why

## Interaction And Messaging
- Controls: `dep-fence check [--enforce] [--json] [--dry-run] [--lockfile <path>] [--no-cache]`
- Feedback:
  - Per-package admit line with version change
  - Summary line: "N packages admitted"
  - Warnings for registry-degraded checks (if any)
- Next-step guidance: none needed on success
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - Baseline advanced and staged via `git add` (advisory, non-dry-run only)
  - Cache files written for registry responses
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: admit summary printed, baseline staged, exit 0
- Metrics or acceptance signals: `git diff --staged` shows baseline update; commit succeeds

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- `--dry-run` evaluates everything but does not advance baseline — useful for testing policy changes
- `--json` outputs structured JSON instead of colored terminal — useful for CI tooling
- `--no-cache` forces fresh registry fetches — useful when investigating a suspicious package
