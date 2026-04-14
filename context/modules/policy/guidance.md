# Module Guidance: Policy

## Responsibilities
- Load and validate policy configuration from `.trustlockrc.json`
- Evaluate all policy rules against each changed dependency
- Intersect findings with valid approvals to determine final decision
- Produce `CheckResult[]` with decisions, findings, and generated approval commands

## Stable Rules
- Each rule is a pure function: `(dependency, baseline, registryData, policy) → Finding[]`
- Rules run independently — no rule depends on another rule's output
- Warning-severity findings never cause blocks
- Error-severity findings cause blocks unless covered by a valid approval
- All-or-nothing semantics: the engine reports aggregate pass/fail but does not decide advancement (CLI does)

## Usage Expectations
- The engine is called once per `check` or `audit` invocation
- It receives pre-loaded data (policy, baseline, approvals, registry data) — it does not load files itself
- It returns `CheckResult[]` — one per changed/added dependency
- Delta computation (added/changed/removed) happens in the baseline module, passed into the engine

## Integration Guidance
- CLI calls `engine.evaluate()` with all required data pre-loaded
- Output module formats the returned `CheckResult[]` — policy never formats
- Baseline module receives `CheckResult[]` to determine what to advance — policy never writes baseline
- To add a new rule: create a new file in `src/policy/rules/`, register it in the engine's rule list

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: policy
