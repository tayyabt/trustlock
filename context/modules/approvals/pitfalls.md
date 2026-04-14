# Module Pitfalls: Approvals

## Known Pitfalls
1. Approval covers wrong version
   - Why it happens: Developer approves `axios@1.14.1` but then upgrades to `axios@1.14.2`. The approval doesn't match. Developer is confused because they "already approved axios."
   - How to avoid it: Clear error messaging: "Approval exists for axios@1.14.1, but current version is 1.14.2. Create a new approval for axios@1.14.2."

2. Approval for package not in lockfile
   - Why it happens: Developer creates approval before running `npm install`, or typos the package name.
   - How to avoid it: `approve` command validates that the package@version exists in the current lockfile before writing.

3. Multiple approvals for same package
   - Why it happens: Developer approves, then approves again with different overrides. Both entries exist in the array.
   - How to avoid it: During validation, find ALL valid approvals for a package+version and union their overrides. Don't just use the first match.

4. Time zone confusion in expiry
   - Why it happens: Developer thinks "7 days" means 7 days local time, but expiry is calculated in UTC.
   - How to avoid it: Always display expiry in UTC. The `approved_at` and `expires` fields are both UTC ISO 8601.

## Regression Traps
- Adding new override rule names (v0.2) must update validation to accept them. Invalid override names should fail at approve time, not silently pass.
- Changing the approvals file format requires migration or a schema version field.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: approvals
