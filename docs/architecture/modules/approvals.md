# Module Architecture: Approvals

## Purpose
Manage scoped, time-limited policy overrides. Read, create, validate, and clean approval entries.

## Responsibilities
- Read approvals from `.trustlock/approvals.json`
- Create new approval entries with validation (package exists in lockfile, valid override names, expiry within max)
- Validate approval applicability: match package+version, check overrides list, check expiry
- Clean expired approvals (remove entries past `expires` timestamp)
- Generate approval commands for blocked packages (for developer convenience)

## Entry Points
- `store.js:readApprovals(approvalsPath)` → `Approval[]`
- `store.js:writeApproval(approvalsPath, approval)` → appends to file
- `validator.js:findValidApproval(approvals, package, version, rule)` → `Approval | null`
- `validator.js:isExpired(approval)` → `boolean`
- `store.js:cleanExpired(approvalsPath)` → `{ removed: number, remaining: number }`
- `generator.js:generateApprovalCommand(checkResult, policyConfig)` → `string`

## Dependencies
- Depends on: nothing (leaf module — reads/writes files only)
- Used by: policy (for approval validation during evaluation), cli (for approve and clean-approvals commands)

## Allowed Interactions
- Read/write `.trustlock/approvals.json`
- Return approval data and validation results to callers

## Forbidden Interactions
- Must NOT evaluate policy rules (just answers "is there a valid approval for this?")
- Must NOT modify baseline
- Must NOT auto-clean during check (Q2: manual cleanup only)

## Notes
- No wildcard approvals (D9): `overrides` array must explicitly list each rule being bypassed
- Approver identity comes from `git config user.name` or `--as` flag (D7) — resolved by CLI, passed to store
- Approval file is a JSON array. Append = read array, push entry, rewrite file. Atomic via write-to-temp + rename.
- `check` reads approvals but never mutates them. `approve` creates entries. `clean-approvals` removes expired entries. Clear separation.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: approvals
