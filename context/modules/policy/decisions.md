# Module Decisions: Policy

## Durable Decisions
1. Rules are pure functions with no side effects
   - Why: Enables isolated testing, parallel evaluation, and easy addition of new rules
   - Consequence: Rules receive all data as arguments, never read files or call APIs directly

2. Warning-severity findings never block
   - Why: Warnings are informational signals (e.g., delta:new-dependency, delta:transitive-surprise). Blocking on warnings would create noise that developers learn to bypass.
   - Consequence: Only error-severity findings participate in the admit/block decision

3. Engine does not write files
   - Why: Separation of concerns. The engine evaluates and returns results. The CLI decides whether to advance baseline, format output, or set exit codes.
   - Consequence: Engine returns `CheckResult[]`. All side effects happen in CLI command handlers.

4. Ignore packages skip all evaluation
   - Why: `ignore_packages` in config means "dep-fence has no opinion on these." They don't appear in results.
   - Consequence: Ignored packages are filtered out before rule evaluation, not after.

## Deferred Decisions
- Publisher change detection rule (v0.2) — tracked in baseline but not enforced in v0.1
- Policy profiles (v0.2) — would change how config is loaded but not how rules evaluate

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: policy
