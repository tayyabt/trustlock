# Module Decisions: Approvals

## Durable Decisions
1. Approvals are immutable once written
   - Why: Approvals go through code review as committed JSON. Editing after the fact undermines the review trail.
   - Consequence: No "update approval" command. To change an approval, let it expire and create a new one.

2. Multiple approvals for same package are valid
   - Why: A developer might approve cooldown bypass, then later also approve provenance bypass. Both should count.
   - Consequence: Validation unions overrides from all valid (non-expired, matching) approvals for a package+version.

3. Validation at creation time, not just evaluation time
   - Why: Catching typos and invalid override names early saves developer time.
   - Consequence: `approve` validates package exists in lockfile, override names are valid rule names, expiry is within max.

## Deferred Decisions
- none

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: approvals
