# Feature: F05 Approval Store & Validation

## Summary
Manage scoped, time-limited policy overrides. CRUD operations on `.trustlock/approvals.json`, expiry validation, scope matching, and approval command generation for blocked packages.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Data layer — approval operations are consumed by the policy engine and CLI commands, tested via unit tests
- Target Sprint: 1
- Sprint Rationale: Required by policy engine (sprint 2) for override checking during evaluation

## Description
This feature implements the approvals module. Approvals are stored as a JSON array in `.trustlock/approvals.json`. Each entry is scoped to a specific package@version, lists which policy rules it overrides, carries a reason string, is attributed to a person, and has an expiry timestamp.

The validator checks approval applicability: package+version match, override list intersection, and expiry. No wildcard approvals (D9) — the `overrides` array must explicitly list each bypassed rule. Approver identity comes from `git config user.name` or `--as` flag (D7).

The generator produces copy-pasteable `trustlock approve` commands for blocked packages, including the correct `--override` flags for the specific rules that blocked.

The cleaner removes expired entries from the file (`clean-approvals` command).

## User-Facing Behavior
Not directly user-facing as a module. The generated approval commands appear in terminal output when packages are blocked (via the output module).

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. No approvals file exists — treat as empty array (for `check`), error for `clean-approvals`
2. Approval for a package not in current lockfile — `approve` command rejects with clear error
3. Invalid override name (e.g., `--override notarule`) — `approve` command rejects with valid rule list
4. Expiry exceeds `max_expiry_days` from config — `approve` command caps at max
5. Approval expired but not yet cleaned — `check` skips expired approvals, never uses them
6. Multiple approvals for same package@version — most recent non-expired one wins
7. Approval overrides `cooldown` but package is also blocked for `scripts` — approval only covers cooldown, scripts still blocks
8. Duration string parsing — must handle "7d", "24h", "30d", "1d", reject invalid formats
9. Atomic file writes — write to temp file, rename, to prevent corruption on crash
10. Empty reason string when `require_reason: true` — must reject

## Acceptance Criteria
- [ ] `readApprovals()` loads approvals from file or returns empty array if file missing
- [ ] `writeApproval()` appends a valid entry to the approvals file atomically
- [ ] `findValidApproval()` matches package+version, checks overrides intersection, rejects expired
- [ ] `cleanExpired()` removes past-expiry entries and reports removed/remaining counts
- [ ] `generateApprovalCommand()` produces a correct, copy-pasteable CLI command for a blocked package
- [ ] No wildcard approvals: attempting to approve without `--override` is rejected
- [ ] Expiry enforcement: approval with expiry > `max_expiry_days` is capped or rejected
- [ ] Unit tests cover: valid approval, expired approval, partial override match, no approval, command generation

## Dependencies
- F01 (shared utilities — time.js for expiry calculation, git.js for approver identity)

## Layering
- Single layer: approvals (leaf module)

## Module Scope
- approvals

## Complexity Assessment
- Modules affected: approvals
- New patterns introduced: no — standard JSON file CRUD with validation
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- Approval file is a flat JSON array, not keyed by package. This is simple and sufficient for v0.1 project sizes. Performance optimization (indexing) deferred.
- `--as` flag is a CLI concern resolved in F08; the approvals module receives the resolved approver name.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-trustlock-full-spec.md
- Sprint: 1
