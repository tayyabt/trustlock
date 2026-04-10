# Workflow: org-policy-setup

## Context
- Feature: F15 (Policy Config Load Order & Org Policy Inheritance)
- Goal: Tech lead publishes an org-level policy JSON and repo teams configure `extends` in their `.trustlockrc.json` to inherit and floor-enforce it
- Actor(s)/Roles: Tech lead / security owner (publishes org policy), Developer (adds `extends` to repo config, verifies it loads)
- Preview Path (if any): none

## Preconditions
- Required data/state:
  - Org has a URL (HTTPS endpoint) or a shared repo path for the org policy JSON
  - Individual repos already have trustlock initialized (`.trustlockrc.json` exists)
  - The org policy JSON is valid JSON that follows the `.trustlockrc.json` schema (subset)
- Required permissions:
  - Tech lead: write access to the org policy URL or shared path
  - Developer: write access to repo `.trustlockrc.json`
- Blocked prerequisites and guidance:
  - Requires F15 to ship (v0.3)
  - Org policy URL must be accessible from CI and developer machines
  - trustlock version ≥ v0.3 must be installed

## States And Steps
- Happy path (URL-based org policy):
  1. Tech lead authors the org policy JSON:
     ```json
     { "cooldown_hours": 72, "provenance": { "block_on_publisher_change": true } }
     ```
  2. Tech lead publishes it at a stable, content-addressed URL (e.g., `https://your-org.internal/trustlock-policy.json`)
  3. Developer adds `extends` to `.trustlockrc.json`:
     ```json
     { "extends": "https://your-org.internal/trustlock-policy.json", "cooldown_hours": 96 }
     ```
  4. Developer runs `trustlock check` — tool fetches org policy, merges with repo config:
     - `cooldown_hours: 96` (repo value, above org minimum of 72 — allowed)
     - `provenance.block_on_publisher_change: true` (inherited from org)
  5. Org policy cached at `.trustlock/.cache/org-policy.json` with timestamp
  6. Check runs normally; merged policy applied

- Happy path (local path-based org policy):
  1. Org policy JSON lives in a shared monorepo location (e.g., `../../org-policy/.trustlockrc.json`)
  2. Developer adds `extends` pointing to the relative path:
     ```json
     { "extends": "../../org-policy/.trustlockrc.json" }
     ```
  3. `inherit.js` resolves the path relative to the `.trustlockrc.json` location
  4. No caching for local paths — file read on every run

- Floor enforcement path:
  1. Org policy requires `cooldown_hours: 72`
  2. Developer sets `cooldown_hours: 24` in `.trustlockrc.json`
  3. `trustlock check` exits with:
     `Policy error: repo config sets cooldown_hours=24, below org minimum of 72. Repos may only tighten org policy.`
  4. Developer must raise `cooldown_hours` to 72 or above

- Remote unreachable, cache present:
  1. Org policy URL is temporarily unreachable (network issue)
  2. `.trustlock/.cache/org-policy.json` exists from a previous run
  3. Tool emits stderr warning: `Warning: could not reach policy URL, using cached copy from <timestamp>`
  4. Check runs with cached policy — correct behavior for transient network issues

- Remote unreachable, no cache:
  1. Org policy URL unreachable AND no cached copy exists (first run or cache cleared)
  2. Tool exits: `Error: could not fetch org policy from <url> and no cached copy exists.`
  3. Developer must restore network access or configure a local `extends` fallback

- Chained `extends` in org policy:
  1. Fetched org policy contains its own `extends` key
  2. Tool emits stderr warning: `Warning: chained extends in org policy is not supported. Ignoring.`
  3. Check proceeds with the fetched policy's direct config (chained `extends` ignored)

- Error states:
  - `extends` URL returns non-JSON: exit 2 with parse error
  - Repo config floor violation: exit 2 with `Policy error: ...`
  - Local `extends` path not found: exit 2 with `Error: extends path not found: <path>`

- Success outcome:
  - All repos in the org load and apply the org policy floor
  - Floor violations surface immediately at check-run time
  - Network failures with existing cache are handled transparently with a warning

## Interaction And Messaging
- Controls:
  - Tech lead: edits org policy JSON at the URL/path
  - Developer: adds `extends` key to `.trustlockrc.json` with URL or relative path
  - `trustlock check` (consumes `extends` transparently at runtime)
- Feedback:
  - On first successful load: no special output — org policy loads silently
  - On remote unreachable + cache: stderr warning with timestamp of cached copy
  - On floor violation: error exit with exact key, repo value, org minimum
  - On chained `extends`: stderr warning, check continues
- Next-step guidance:
  - After floor violation: "Raise `<key>` to at least `<org minimum>` in your `.trustlockrc.json`."
  - After remote unreachable + no cache: "Restore network access to `<url>` or use a local `extends` path."
- Navigation/redirects: N/A (CLI)
- Keyboard/accessibility: N/A (CLI)

## Side Effects
- Data mutations:
  - `.trustlock/.cache/org-policy.json` written/refreshed on URL-based `extends` fetch
  - No other mutations from policy load
- Notifications / webhooks: none

## Success Criteria
- Visible outcome: `trustlock check` runs without error; org policy values are reflected in check behavior (e.g., `cooldown_hours: 96` blocks packages that base 72h would pass if repo is stricter; org `block_on_publisher_change: true` applies across all repos)
- Metrics or acceptance signals: `.trustlock/.cache/org-policy.json` exists and matches fetched policy; floor violations surface at check time; cached-fallback warning appears on network failure

## Shared UI
- Shared design preview path(s): none
- Notes on shared components: none

## Notes
- Security note from spec §4.4: the policy URL is trusted at the same level as `.trustlockrc.json` — treat it as code. Prefer content-addressed URLs; do not point to a `latest` endpoint that changes without review.
- Cache TTL is 1 hour (hard-coded, not configurable).
- Only one level of `extends` inheritance is supported. Chains are ignored.
- Array values (e.g., `scripts.allowlist`, `ignore_packages`) are unioned: repo entries add to org entries; repo cannot remove org entries.
- Object values are deep-merged; scalar values use repo value with floor enforcement against org minimum.
- C6: Org policy cache path (`.trustlock/.cache/org-policy.json`) is separate from `src/registry/cache.js`; verified in acceptance criteria.
- ADR-005 defines the exact merge order: `extends` base → repo config → `--profile` overlay; floors checked at each step.
