# Feature: F08 CLI Commands, Integration & Documentation

## Summary
Wire all modules into working CLI commands (init, check, approve, audit, clean-approvals, install-hook), implement argument parsing, integrate the pre-commit hook, and produce documentation and examples.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: required
- Workflow Rationale: This feature contains the three core user-facing flows: project initialization/onboarding, check-and-admit, and blocked-dependency-approve. These are multi-step CLI interactions with multiple outcomes (success, block, error) that benefit from explicit workflow documentation.
- Target Sprint: 2
- Sprint Rationale: Top-level integration layer — depends on policy engine (F06) and output (F07); this is the feature that makes trustlock a usable tool

## Description
This feature implements the CLI module: the main entry point (`index.js`), argument parser (`args.js`), and all six command handlers. Each command handler is a thin orchestration function: parse args, call module APIs, format output, set exit code.

**Commands:**
- `init` — detect lockfile, create `.trustlockrc.json`, create `.trustlock/` directory with approvals and cache, build initial baseline, print summary
- `check` — load policy/baseline/approvals, parse lockfile, compute delta, evaluate rules, format output, advance baseline on full admission (advisory mode only)
- `approve` — parse package@version, validate inputs, write approval entry, print confirmation
- `audit` — parse full lockfile, evaluate all packages against policy, print stats + heuristic suggestions
- `clean-approvals` — remove expired approvals, print counts
- `install-hook` — install or append trustlock check to `.git/hooks/pre-commit`

**Documentation:** README.md (project overview, quick start, examples), USAGE.md (full command reference), POLICY-REFERENCE.md (every config option), ARCHITECTURE.md (design decisions). Example configs and CI workflows (lefthook, Husky, GitHub Actions).

## User-Facing Behavior
This is the primary user-facing feature. Developers interact with trustlock exclusively through these commands. The quality of error messages, help text, and documentation determines adoption.

## UI Expectations (if applicable)
N/A — CLI tool terminal output.

## Primary Workflows
- Project initialization (init + install-hook)
- Check and admit (happy path dependency update)
- Blocked dependency with approval (block + approve + re-check)

## Edge Cases
1. `init` when `.trustlock/` already exists — must error (D6), suggest `--force` or manual delete
2. `init --force` — if implemented, must overwrite existing `.trustlock/` safely
3. `check` with no lockfile found — exit 2 with message listing expected filenames
4. `check` with no `.trustlockrc.json` — exit 2 with "run trustlock init first"
5. `check` with no changes — "No dependency changes" and exit 0
6. `approve` for package not in lockfile — reject with "package not found in lockfile"
7. `approve` with `--expires 365d` exceeding `max_expiry_days: 30` — cap or reject
8. `install-hook` when `.git/hooks/pre-commit` exists and already contains trustlock — don't duplicate
9. `install-hook --force` when pre-commit has custom content — warn before overwriting
10. Unknown command — print help text with available commands

## Acceptance Criteria
- [ ] `trustlock init` creates `.trustlockrc.json`, `.trustlock/` directory, `approvals.json`, `.cache/`, `.gitignore`, and `baseline.json` from current lockfile
- [ ] `trustlock check` evaluates changes, prints results (terminal or JSON), and advances baseline on full admission in advisory mode
- [ ] `trustlock check --enforce` exits 1 on any block and never advances baseline
- [ ] `trustlock check --dry-run` evaluates but does not write baseline
- [ ] `trustlock approve <pkg>@<ver> --override <rules> --reason <text>` writes a valid approval entry
- [ ] `trustlock audit` prints whole-tree trust posture with stats and heuristic suggestions
- [ ] `trustlock clean-approvals` removes expired entries and reports counts
- [ ] `trustlock install-hook` creates or appends to `.git/hooks/pre-commit` and makes it executable
- [ ] Exit codes: 0 (success/advisory), 1 (blocked + enforce), 2 (fatal error)
- [ ] README.md, USAGE.md, POLICY-REFERENCE.md exist with accurate content
- [ ] Example configs (production, relaxed) and CI workflows (GitHub Actions, lefthook, Husky) exist
- [ ] Integration tests: init -> check (admit) -> modify lockfile -> check (block) -> approve -> check (admit with approval)

## Dependencies
- F06 (policy engine — evaluation)
- F07 (output formatting — terminal and JSON)

## Layering
- policy (F06) + output (F07) -> cli (F08)
- Transitively depends on all sprint 1 features

## Module Scope
- cli

## Complexity Assessment
- Modules affected: cli (primary), touches all modules via integration
- New patterns introduced: yes — `node:util.parseArgs` wrapper, command routing pattern
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- `init --force` is a nice-to-have; the spec says `init` fails if `.trustlock/` exists (D6). If time allows, add `--force`; otherwise, the user deletes the directory manually.
- Documentation is written after the CLI is functional, as part of the same feature, not a separate feature.
- The Node.js built-in test runner (`node --test`) is used for integration tests.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-trustlock-full-spec.md
- Sprint: 2
