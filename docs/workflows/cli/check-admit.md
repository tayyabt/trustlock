# Workflow: check-admit

## Context
- Feature: F10 (v0.2 output redesign), F08 (original CLI commands)
- Goal: Developer commits a dependency change and all packages pass policy — output is minimal, baseline advances automatically
- Actor(s)/Roles: Developer (on every commit with dependency changes)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - trustlock initialized (`.trustlockrc.json` and `.trustlock/baseline.json` exist)
  - Lockfile has been modified (e.g., `npm install axios@latest`, or pnpm/yarn equivalent)
  - Git working tree has the updated lockfile staged or about to be committed
- Required permissions:
  - File system read/write access
- Blocked prerequisites and guidance:
  - If not initialized: exit 2, `No .trustlockrc.json found. Run \`trustlock init\` first.`
  - If baseline missing: exit 2, `No baseline found. Run \`trustlock init\` first.`
  - If no git repo in ancestor chain: exit 2, `Error: not a git repository (or any parent directory)` (v0.2)

## States And Steps
- Happy path — all admitted (advisory mode):
  1. Developer runs `git commit` (triggers pre-commit hook) or manually runs `trustlock check`
  2. Tool resolves `projectRoot` and `gitRoot` via `paths.js` (v0.2)
  3. Tool loads policy (including remote `extends` if configured), baseline, and approvals
  4. Tool parses current lockfile and computes delta against baseline
  5. For changed packages: fetches registry metadata (cache-first); if ≥5 packages need fetch, progress counter fires on stderr
  6. All packages pass policy → all decisions are "admitted"
  7. Output:
     ```
     2 packages changed  ·  2 admitted  ·  0.9s
     Baseline advanced.
     ```
  8. Baseline updated; `git add .trustlock/baseline.json` staged automatically
  9. Exit 0 — commit proceeds

- New package added (admitted):
  1. Steps 1–6 same as above
  2. Output includes NEW PACKAGES section before ADMITTED section:
     ```
     1 package changed  ·  1 admitted  ·  0.8s

       NEW PACKAGES
       ──────────────────────────────────────────────────────────────
       uuid 9.0.0                                     admitted
         Published 8 months ago · no install scripts · no provenance

     Baseline advanced.
     ```

- Happy path — enforce mode (CI):
  1. CI runs `trustlock check --enforce [--sarif]`
  2. Same evaluation as above
  3. All packages pass → summary output, exit 0
  4. Baseline is NOT advanced (CI is read-only)
  5. If `--sarif`: SARIF 2.1.0 JSON emitted to stdout with empty `results[]`

- No changes:
  1. Tool computes delta, finds no changes
  2. Output: `No dependency changes since last baseline.`
  3. Exit 0 — no baseline update needed

- Monorepo path (v0.2):
  1. Developer runs `trustlock check --project-dir packages/backend`
  2. `paths.js` resolves `projectRoot = packages/backend/`, `gitRoot` found by walking up
  3. Reads `packages/backend/package-lock.json`, `packages/backend/.trustlockrc.json`
  4. Stages baseline to `packages/backend/.trustlock/baseline.json` via `gitRoot` git operations
  5. Same output structure as flat repo

- Loading/async states:
  - Progress counter fires on stderr when ≥5 packages need registry fetch (D1)
  - On TTY: single line rewritten with `\r`; on non-TTY: newlines at ~10% intervals
  - Progress does not appear on stdout; `--json` stdout remains clean

- Error states:
  - Config missing or malformed: exit 2 with specific error
  - Lockfile parse failure: exit 2 with descriptive error
  - Unknown lockfile version: exit 2 (consistent fail-hard behavior)
  - No git repo in ancestor chain: exit 2 with `Error: not a git repository (or any parent directory)`
  - Org policy unreachable, no cache: exit with `Error: could not fetch org policy from <url> and no cached copy exists.`
  - Org policy unreachable, cache present: stderr warning; check proceeds with cached policy

- Success outcome:
  - All dependency changes evaluated and admitted
  - Baseline updated to reflect newly trusted packages (advisory mode only)
  - Minimal output — absence of BLOCKED section is the success signal

## Interaction And Messaging
- Controls: `trustlock check [--enforce] [--sarif] [--json] [--quiet] [--profile <name>] [--project-dir <path>] [--lockfile <path>] [--no-cache]`
- Feedback:
  - Summary line always first: `N packages changed · N admitted · Xs`
  - NEW PACKAGES section when new packages appear (not version bumps)
  - ADMITTED section: names only, no per-package detail
  - Baseline status footer always last: `Baseline advanced.`
  - Progress counter on stderr (TTY-aware) when ≥5 packages need fetch (D1)
- Next-step guidance: none on success
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - Baseline advanced and staged via `git add` (advisory, non-dry-run, non-enforce only)
  - Registry cache files written for fetched responses
  - Org policy cache refreshed if TTL expired and remote reachable
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: summary line, optional NEW PACKAGES section, ADMITTED section (names only), "Baseline advanced." footer; exit 0
- Metrics or acceptance signals: `git diff --staged` shows baseline update; commit succeeds; no output on stdout when `--quiet` is used

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- `--dry-run`: evaluates everything but does not advance baseline — useful for testing policy changes
- `--quiet`: suppresses all stdout and stderr; only exit code communicates result
- `--json`: structured JSON output (schema_version 2); no progress counter on stdout; "Commit this file." reminder absent
- `--no-cache`: forces fresh registry fetches — useful when investigating a suspicious package
- `--profile <name>`: applies named policy overlay; floor enforcement applies
- v0.2 summary line format differs from v0.1 — now shows wall time and explicit admitted count
- C5: JSON consumers must migrate to schema_version 2; no v1 shim in v0.2+
