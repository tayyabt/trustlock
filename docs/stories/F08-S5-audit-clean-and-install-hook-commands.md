# Story: F08-S5 — `audit`, `clean-approvals`, and `install-hook` Commands

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Implement the three remaining command handlers: `audit` (whole-tree trust posture scan), `clean-approvals` (expired approval removal), and `install-hook` (pre-commit hook installation). These are lighter commands that complete the F08 command surface.

## Scope
**In scope:**
- `src/cli/commands/audit.js` — full implementation: parse full lockfile, evaluate all packages against policy, print stats + heuristic suggestions
- `src/cli/commands/clean.js` — full implementation: load approvals, remove expired entries, write back, print counts
- `src/cli/commands/install-hook.js` — full implementation: create or append `dep-fence check` to `.git/hooks/pre-commit`, make executable
- `install-hook` flag: `--force` (overwrite pre-existing hook content after warning)
- `audit` exits 0 always (informational, no enforcement)
- `clean-approvals` exits 0 always

**Not in scope:**
- `check`, `approve`, `init` — separate stories
- SARIF or structured JSON output for `audit` (v0.2)
- Scheduled or automated `clean-approvals` triggering (user runs it manually or via CI; Q2 resolved as manual-only)

## Entry Points
- Route / page / screen: `dep-fence audit`, `dep-fence clean-approvals`, `dep-fence install-hook [--force]`
- Trigger / navigation path: Manual on-demand (`audit`, `clean-approvals`); once-per-clone setup (`install-hook`)
- Starting surface: `src/cli/index.js` routes each command → respective handler

## Wiring / Integration Points
- Caller-side ownership: `index.js` already routes to stubs (F08-S1); this story replaces all three stubs — no changes to `index.js`
- Callee-side ownership: Each handler wires to its upstream modules:
  - `audit.js` → `src/lockfile/parser.js` (F02), `src/registry/client.js` (F03), `src/policy/engine.js` (F06), `src/output/terminal.js` (F07)
  - `clean.js` → `src/approvals/store.js` (F05) — `readApprovals()`, `writeApprovals(filtered)`, `isExpired(entry)`
  - `install-hook.js` → `node:fs/promises`, `node:child_process` (`chmod +x`)
- Caller-side conditional rule: `index.js` already exists; replace stubs, no router changes
- Callee-side conditional rule: F02, F03, F05, F06, F07 are all complete; wire to real APIs
- Boundary / contract check: Run each command against a real initialized project in unit tests using fixtures
- Files / modules to connect: `audit.js` → parser + registry + policy engine + terminal formatter; `clean.js` → approvals store; `install-hook.js` → fs + child_process
- Deferred integration: End-to-end test deferred to F08-S6

## Not Allowed To Stub
- `audit.js` lockfile parser — must be real
- `audit.js` policy engine evaluation — must be real (all packages evaluated, not sampled)
- `clean.js` approvals store write-back — must be real; expired entries must actually be removed from the file
- `install-hook.js` filesystem write — must create/modify `.git/hooks/pre-commit` on disk
- `install-hook.js` executable permission — must call `chmod +x .git/hooks/pre-commit`

## Behavioral / Interaction Rules
**audit:**
- Evaluates every package in the lockfile against all policy rules (not just the delta)
- Output includes: total package count, per-rule violation counts, packages with flagged heuristics (e.g., new with no provenance, pinned in lockfile but ranged in package.json), and suggested approval commands for any currently blocked packages
- Registry unreachable: registry-dependent checks show "warning: registry unavailable" per affected package; does not exit 2
- Exit 0 always (informational)

**clean-approvals:**
- Removes entries where `expiresAt` is before the current time
- Prints: `"Removed N expired approval(s). N active approval(s) remain."`
- If no expired approvals: `"No expired approvals found."`
- Exit 0 always

**install-hook:**
- If `.git/hooks/pre-commit` does not exist: create it with shebang + `dep-fence check` line, `chmod +x`
- If `.git/hooks/pre-commit` exists and already contains `dep-fence check`: print "Hook already installed." and exit 0 (no duplicate, edge case #8)
- If `.git/hooks/pre-commit` exists without `dep-fence check` and without `--force`: append `dep-fence check` to existing content; do NOT overwrite
- If `.git/hooks/pre-commit` exists with custom content and `--force`: warn "Overwriting existing pre-commit hook." then overwrite with fresh hook file (edge case #9)
- Exit 0 on success, exit 2 on filesystem error

## Acceptance Criteria
- [ ] `dep-fence audit` prints stats: total packages, per-rule issue counts, flagged packages with heuristic suggestions
- [ ] `dep-fence audit` exits 0 always (even with policy violations)
- [ ] `dep-fence clean-approvals` removes expired entries from `approvals.json` and prints counts
- [ ] `dep-fence clean-approvals` with no expired entries prints "No expired approvals found." and exits 0
- [ ] `dep-fence install-hook` creates `.git/hooks/pre-commit` with `dep-fence check` and makes it executable
- [ ] `dep-fence install-hook` when hook already contains `dep-fence check`: prints "Hook already installed." without duplicating (edge case #8)
- [ ] `dep-fence install-hook` when hook exists without dep-fence: appends without overwriting existing content
- [ ] `dep-fence install-hook --force` when hook has custom content: warns and overwrites (edge case #9)

## Task Breakdown
1. Implement `src/cli/commands/audit.js` — full lockfile scan + policy evaluation + stats output
2. Implement `src/cli/commands/clean.js` — read approvals, filter expired, write back, print counts
3. Implement `src/cli/commands/install-hook.js` — hook detection, create/append/overwrite logic, chmod
4. Write unit tests for `audit` (stats correctness, registry-degraded path)
5. Write unit tests for `clean` (removes expired, preserves active, no-op when none expired)
6. Write unit tests for `install-hook` (all four states: no hook, already installed, append, force-overwrite)

## Verification
```bash
node src/cli/index.js audit
# Expected: stats output, exit 0

node src/cli/index.js clean-approvals
# Expected: "Removed N expired approval(s). N active approval(s) remain." or "No expired approvals found."

node src/cli/index.js install-hook
# Expected: hook file created; ls -la .git/hooks/pre-commit shows executable

node src/cli/index.js install-hook
# Expected (second run): "Hook already installed." — no duplication

node --test test/unit/cli/audit.test.js
node --test test/unit/cli/clean.test.js
node --test test/unit/cli/install-hook.test.js
# Expected: all tests pass
```

## Edge Cases to Handle
- `audit` with registry unreachable: warn per package, continue, exit 0
- `clean-approvals` with no expired entries: "No expired approvals found.", exit 0
- `install-hook` when hook already contains `dep-fence check`: no duplicate (edge case #8)
- `install-hook --force` with custom hook content: warn before overwriting (edge case #9)
- `install-hook` without a `.git/` directory: exit 2 with "Not a git repository"

## Dependencies
- Depends on: F08-S1 (routing stubs must exist)
- Blocked by: F02 (lockfile parser), F03 (registry client), F05 (approvals store), F06 (policy engine), F07 (output formatters)

## Effort
M — three commands, but each is relatively narrow; install-hook has the most branching logic

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P1

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
Format:
### [ISO date] [Agent]: [Action]
[Details]
-->
