# Module Pitfalls: Policy

## Known Pitfalls
1. Approval-rule intersection edge case
   - Why it happens: An approval overrides specific rules (e.g., `["cooldown"]`). If a package is blocked by cooldown AND provenance, but the approval only covers cooldown, the package is still blocked. Easy to miss this partial-coverage case.
   - How to avoid it: The decision function must check that ALL error-severity findings have matching approval overrides, not just that any approval exists.

2. Registry data unavailable for some rules
   - Why it happens: Cooldown and provenance rules need registry data. If the registry is unreachable and no cache exists, these rules produce "skipped" warnings, not errors. A rule that would have blocked might silently pass.
   - How to avoid it: The engine must annotate check results with data quality indicators. The terminal output must surface "skipped" warnings prominently so developers know some checks didn't run.

3. Config validation gaps
   - Why it happens: `.depfencerc.json` is user-edited. Invalid override names in config (e.g., typo in `provenance.required_for` package names) silently do nothing.
   - How to avoid it: Validate config at load time. Warn on `required_for` packages that aren't in the lockfile (they might be transitive or misspelled).

## Regression Traps
- Changing rule evaluation order should not change results (rules are independent). If a test starts depending on order, the architecture is leaking.
- Adding a new rule must not change the behavior of existing rules. The engine collects findings from all rules, then decides.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: policy
