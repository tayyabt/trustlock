# Module Architecture: Policy

## Purpose
Core evaluation engine. Loads policy configuration, orchestrates rule evaluation against dependency changes, integrates with approvals, and produces admit/block decisions.

## Responsibilities
- Load and validate `.trustlockrc.json` configuration
- Evaluate all applicable policy rules against each changed dependency
- Intersect findings with valid approvals to determine final decision
- Produce `CheckResult[]` with decisions, findings, and generated approval commands
- Enforce all-or-nothing semantics (D1) — report aggregate pass/fail

## Entry Points
- `engine.js:evaluate(delta, policy, baseline, approvals, registryData)` → `CheckResult[]`
- `config.js:loadPolicy(configPath)` → `PolicyConfig`
- `decision.js:decide(findings, approvals)` → `"admitted" | "admitted_with_approval" | "blocked"`

## Dependencies
- Depends on: lockfile (for `ResolvedDependency` model), registry (for metadata/provenance data), baseline (for `TrustProfile` comparison), approvals (for override checking)
- Used by: cli (commands call the engine)

## Allowed Interactions
- Read policy config from filesystem
- Call registry client to fetch metadata for changed packages
- Read baseline and approvals via their respective module APIs
- Return `CheckResult[]` to caller — never writes files directly

## Forbidden Interactions
- Must NOT write baseline (that's baseline module's job, triggered by CLI)
- Must NOT write approvals (that's approvals module's job)
- Must NOT format output (that's output module's job)
- Must NOT call git operations directly

## Notes
- Each rule in `src/policy/rules/` is a pure function: `(dependency, baseline, registryData, policy) → Finding[]`
- The engine orchestrates: load data → compute delta → evaluate rules per dependency → apply approvals → decide
- Rule evaluation order doesn't matter — all rules run independently, findings are collected, then decisions are made
- Warning-severity findings never cause blocks regardless of approval state

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: policy
