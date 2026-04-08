# Feature: F06 Policy Engine & Rules

## Summary
Core evaluation engine that loads policy configuration, orchestrates all 7 policy rules against dependency changes, integrates with approvals, and produces binary admit/block decisions.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Business logic engine — evaluation pipeline is deterministic and tested via unit tests with fixture data; the user-facing workflow coverage lives in F08 (CLI Commands)
- Target Sprint: 2
- Sprint Rationale: Depends on all four data modules (F02-F05) from sprint 1; this is the core business logic that makes dep-fence useful

## Description
This feature implements the policy module. The engine loads `.depfencerc.json`, validates it against defaults, then evaluates each changed dependency against all applicable rules. Each rule is a pure function that produces findings. Findings are intersected with valid approvals to produce a final decision: admitted, admitted_with_approval, or blocked.

The seven rules implemented:
1. **trust-continuity:provenance** — blocks on provenance regression (had attestation, lost it)
2. **exposure:cooldown** — blocks versions published less than `cooldown_hours` ago
3. **exposure:pinning** — blocks floating semver ranges in package.json when policy requires exact
4. **execution:scripts** — blocks packages with install scripts not in allowlist
5. **execution:sources** — blocks non-registry sources (git, http, file) when disallowed
6. **delta:new-dependency** — warns on new packages (informational, non-blocking)
7. **delta:transitive-surprise** — warns when a direct dep upgrade pulls in many new transitives

The engine enforces all-or-nothing semantics (D1): it reports aggregate pass/fail so the caller knows whether baseline advancement is safe.

## User-Facing Behavior
Not directly user-facing as a module. Results flow through the output module to the terminal or JSON output.

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. Empty delta (no changes) — engine short-circuits, returns empty results
2. Policy file missing — fail with exit 2 and clear error message
3. Policy file malformed JSON — fail with exit 2 and parse error
4. Unknown rule name in policy config — ignore gracefully (forward-compat for v0.2 rules)
5. Package in `provenance.required_for` that has never had provenance — blocks (required != regression)
6. Package with provenance in baseline but not yet fetched for current version (registry unreachable) — annotate as "skipped: registry unreachable," do not block
7. Cooldown clears_at calculation must be exact UTC timestamp (D4) — include in finding detail
8. Pinning check reads package.json, not lockfile — must load package.json separately
9. Install scripts: v3 lockfile has `hasInstallScripts`, v1/v2 needs registry fetch — must handle null gracefully
10. Transitive surprise threshold (default 5) — configurable in future but hardcoded for v0.1

## Acceptance Criteria
- [ ] `loadPolicy()` reads `.depfencerc.json` and merges with defaults for missing fields
- [ ] `evaluate()` runs all applicable rules against each changed dependency and returns `CheckResult[]`
- [ ] trust-continuity:provenance correctly detects provenance regression between baseline and current
- [ ] exposure:cooldown calculates age from publish time and includes `clears_at` timestamp in finding detail
- [ ] exposure:pinning reads package.json and detects range operators for production and dev dependencies
- [ ] execution:scripts blocks non-allowlisted packages with install scripts
- [ ] execution:sources blocks disallowed source types (git, http, file)
- [ ] delta:new-dependency produces warning-severity findings for packages not in baseline
- [ ] delta:transitive-surprise produces warning-severity findings when >5 new transitives from one direct dep upgrade
- [ ] Approval integration: valid approval changes decision from "blocked" to "admitted_with_approval"
- [ ] All-or-nothing: engine reports aggregate pass/fail for baseline advancement decision
- [ ] Unit tests for each rule: should-admit, should-block, should-admit-with-approval, expired-approval cases

## Dependencies
- F02 (lockfile — ResolvedDependency model)
- F03 (registry — metadata, provenance, install script data)
- F04 (baseline — TrustProfile for comparison, delta computation)
- F05 (approvals — override checking)

## Layering
- lockfile (F02) + registry (F03) + baseline (F04) + approvals (F05) -> policy engine

## Module Scope
- policy

## Complexity Assessment
- Modules affected: policy
- New patterns introduced: yes — rule-as-pure-function pattern, finding aggregation, approval intersection
- Architecture review needed: no (module arch already defines this)
- Design review needed: no

## PM Assumptions (if any)
- Rule evaluation order does not matter — all rules run independently. No short-circuit on first block.
- Warning-severity findings (new-dependency, transitive-surprise) never cause blocks regardless of approval state.
- Transitive surprise threshold of 5 is hardcoded for v0.1; making it configurable is deferred.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-dep-fence-full-spec.md
- Sprint: 2
