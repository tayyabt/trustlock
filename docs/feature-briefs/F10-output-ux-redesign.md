# Feature: [F10] Output/UX Redesign

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

The v0.1 output mirrors the internal data model. This feature redesigns all terminal and JSON output around user jobs: what to do next, what is blocked, why, and how to unblock it. It also upgrades the JSON format to schema_version 2 and introduces `--quiet` mode. This is the most user-visible change in v0.2.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: required
- Workflow Rationale: The blocked-approve and check-admit flows are the primary daily interactions with trustlock. Both change significantly in v0.2: new grouped output structure, new ADMITTED WITH APPROVAL section, publisher-change elevated treatment with `⚠` marker, "Commit this file" reminder for approve, absolute cooldown timestamps instead of ages. These are blocked-prerequisite flows per the skill marking criteria. Existing workflow docs (`blocked-approve.md`, `check-admit.md`) must be updated to reflect the v0.2 output contract.
- Target Sprint: 3
- Sprint Rationale: Core user-facing change for v0.2. Depends on F09 (paths.js) but is independent of the parser and publisher work. JSON schema v2 must stabilise here before F13 (SARIF) can be framed.

## Description

The redesign restructures terminal output into four ordered sections: BLOCKED, ADMITTED WITH APPROVAL, NEW PACKAGES, ADMITTED. The summary line always appears first. Admitted packages collapse to a minimal list. The blocked section shows one line per rule (plain English), and a single ready-to-run `approve` command combining all overrides for that package.

The JSON output moves from a flat `results[]` array to grouped keys matching the terminal structure: `blocked`, `admitted_with_approval`, `admitted`, `new_packages`. `schema_version` increments to 2. The `approve_command` field is always present on blocked entries. No schema_version 1 backward-compatibility shim (D4, C5).

The `trustlock approve` confirmation output is redesigned: absolute expiry timestamp, "Commit this file" reminder in terminal mode only (D9), and a clean structured summary of the recorded approval.

Progress counter (from §1.2) is in scope for `init` and `check` — this feature covers `progress.js` integration. The counter fires on `check` when ≥5 packages need metadata fetch (D1) and on every `init` fetch.

## User-Facing Behavior

- **Summary line:** always first — `3 packages changed · 2 blocked · 1 admitted · 1.8s`. If no changes: `No dependency changes since last baseline.` then exit 0 with no further output.
- **BLOCKED section:** each blocked package shows `name old → new` with rule names right-aligned; one diagnosis line per fired rule in plain English; a single `trustlock approve` command with all overrides combined.
- **Publisher change elevated treatment:** `⚠` marker and hardcoded "Verify the change is legitimate before approving." line — applies only to `publisher-change` rule.
- **NEW PACKAGES section:** new packages (first appearance, not a version bump) listed separately regardless of admission decision.
- **ADMITTED WITH APPROVAL section:** packages admitted via approval show approver, expiry, and reason.
- **ADMITTED section:** intentionally minimal — names only.
- **Baseline status footer:** always last — `Baseline advanced.` or `Baseline not advanced — N packages blocked.`
- **`trustlock approve` confirmation:** absolute expiry date+time, "Commit this file." reminder in terminal mode only.
- **`--quiet` flag:** suppresses all output; only exit code communicates result.
- **Progress counter:** stderr only; `\r` rewrite on TTY; newlines at ~10% intervals on non-TTY; does not affect `--json` stdout.
- **`trustlock audit` output:** redesigned around "REGRESSION WATCH", "INSTALL SCRIPTS", "AGE SNAPSHOT", "PINNING", "NON-REGISTRY SOURCES" sections; provenance always framed as regression watch, never as a score.
- **JSON `schema_version: 2`:** grouped structure matching terminal. No v1 shim.

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- blocked-approve: developer commits a dependency change that is blocked, reads the new grouped output, runs the generated approve command, re-commits successfully
- check-admit: developer commits a dependency change that is fully admitted; output is minimal, baseline advances

## Edge Cases
1. Multiple rules fire on one package — all overrides combined in a single `--override` flag on the approve command.
2. Package blocked for publisher-change with null baseline (C2) — warning only, not block (D15); no approve command generated.
3. All packages admitted with no new packages — output collapses to summary + "Baseline advanced." only.
4. `--quiet` with `--enforce`: no output, exit 0 (all pass) or exit 1 (any block).
5. `--json` mode: "Commit this file" reminder omitted (D9); `approve_command` field still present on blocked entries.
6. Progress counter when `check` fetches fewer than 5 packages — counter not shown (D1).
7. Non-TTY stderr (`isTTY: false`) — newlines at ~10% intervals, not carriage-return rewrites.
8. `trustlock audit` with no packages under SLSA regression watch — REGRESSION WATCH section shows "No packages with provenance detected. ✓" (no packages to watch is fine).
9. `trustlock audit` with unallowlisted install scripts — INSTALL SCRIPTS section shows the unallowlisted package with `✗` marker.
10. Cooldown clear timestamp shown in user's local timezone when `TZ` env is set; UTC otherwise.

## Acceptance Criteria
- [ ] Summary line always first; format matches spec §2.2 exactly.
- [ ] Blocked section groups per package; all overrides in one `--override`; diagnosis in plain English.
- [ ] Publisher-change blocks show `⚠` marker and "Verify" line; no other rule gets this treatment.
- [ ] NEW PACKAGES section appears for first-appearance packages regardless of decision.
- [ ] ADMITTED WITH APPROVAL section appears between BLOCKED and ADMITTED when approvals cover any package.
- [ ] Admitted section is names-only; collapses entirely when all admitted with no new packages.
- [ ] Baseline status footer always last.
- [ ] `trustlock approve` confirmation shows absolute expiry; "Commit this file." in terminal mode only.
- [ ] `--quiet` produces zero output on stdout and stderr.
- [ ] Progress counter goes to stderr; `--json` stdout is clean (no progress lines).
- [ ] JSON output: `schema_version: 2`, grouped keys, `approve_command` always present on blocked entries.
- [ ] `trustlock audit` output matches §2.4 section structure; provenance section includes contextual ecosystem note.
- [ ] `--no-cache` flag behavior unchanged (D16).

## Dependencies
- F09 (paths.js — all commands must resolve roots before formatting)
- F07 (output formatting base — terminal.js and json.js are revised here)
- F08 (CLI commands — check.js, audit.js, approve.js are revised here)
- F13 (SARIF) depends on this feature's JSON schema v2 being stable

## Layering
- `src/utils/progress.js` (new) → `src/output/terminal.js` (rewrite) → `src/output/json.js` (schema v2 rewrite) → `src/cli/commands/check.js`, `audit.js`, `approve.js` (updated), `src/cli/args.js` (--quiet, --profile flags)

## Module Scope
- output, cli, utils

## Complexity Assessment
- Modules affected: output/terminal.js (significant rewrite), output/json.js (schema v2), utils/progress.js (new), cli/commands/check.js, audit.js, approve.js, cli/args.js
- New patterns introduced: yes — grouped output model, progress counter, absolute timestamp formatting
- Architecture review needed: no (covered by spec review)
- Design review needed: no

## PM Assumptions (if any)
- `--json` and `--sarif` mutual exclusion is enforced in args.js here (D5, C3); the SARIF formatter (F13) depends on this gate already existing.
- The "Commit this file" reminder fires only in terminal mode per D9; no config option to suppress it.
- Progress counter threshold for `check` is exactly ≥5 packages (D1).

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §1.2, §2.1–2.7, §5.2
- Sprint: 3
