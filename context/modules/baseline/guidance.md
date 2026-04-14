# Module Guidance: Baseline

## Responsibilities
- Read/write `.trustlock/baseline.json`
- Create initial baseline during `init`
- Compute dependency delta (added, removed, changed, unchanged)
- Advance baseline on full admission with auto-staging

## Stable Rules
- Baseline only advances when ALL changed dependencies are admitted (D1)
- Advancement only happens in advisory mode, never enforce or dry-run (D10)
- Removed dependencies are silently dropped from baseline on next advance (D3)
- Baseline file is auto-staged (`git add`) after write (ADR-002)
- `schema_version` field must be checked on read — future-proof for migration

## Usage Expectations
- Read once per `check` invocation
- Delta computed once and passed to policy engine
- Written at most once per `check` (on full admission)
- Created once during `init`

## Integration Guidance
- Policy engine calls `computeDelta()` to get the set of dependencies to evaluate
- CLI calls `advanceBaseline()` after successful evaluation, passing admitted results
- CLI calls `writeAndStage()` to persist the advancement
- Lockfile parser output feeds directly into `createBaseline()` during init

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: baseline
