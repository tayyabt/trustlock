# Design Note: F05-S03 — Approval Command Generator

## Summary
Implement `generateApprovalCommand(checkResult, policyConfig)` in `src/approvals/generator.js`. This is a pure string-formatting function — no I/O, no imports from other internal modules. It produces a copy-pasteable `dep-fence approve` CLI invocation for a blocked package.

## Approach
Single exported function that:
1. Formats `package@version` correctly, handling scoped packages (e.g. `@scope/pkg@1.0.0`)
2. Appends one `--override <rule>` per entry in `checkResult.blockingRules`
3. Appends `--expires <duration>` only when `policyConfig.default_expiry` is truthy

Scoped package handling: a scoped name begins with `@`. The `@version` suffix must be appended to the full package name, not just the scope. E.g., `@scope/pkg` + `1.0.0` → `@scope/pkg@1.0.0`. This is a simple string concatenation — no splitting required.

## Integration / Wiring Plan
- **Callee-side** (this story): Export `generateApprovalCommand` from `src/approvals/generator.js` as a named ES module export.
- **Caller-side** (F07, deferred): Output module will import and call this function when rendering blocked package results.
- No internal module imports — function operates on plain data shapes only.

## Exact Files Expected to Change
- `src/approvals/generator.js` — new file (the implementation)
- `test/approvals/generator.test.js` — new file (unit tests)

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|----|--------------|
| `generateApprovalCommand(checkResult, policyConfig)` returns a valid command string | Test: basic invocation returns string starting with `dep-fence approve` |
| Correct `package@version` (handles scoped packages) | Test: scoped package `@scope/pkg@1.0.0` in output |
| One `--override <rule>` per blocking rule | Test: single-rule and multi-rule cases |
| `--expires <duration>` when `policyConfig.default_expiry` is set | Test: with default_expiry present |
| Omits `--expires` when no default expiry | Test: policyConfig.default_expiry absent/falsy |
| Multiple blocking rules → multiple `--override` flags | Test: two-rule case produces two `--override` segments |
| Unit tests cover all specified cases | `node test/approvals/generator.test.js` |

## Test Strategy
Use `node:test` + `node:assert/strict` (matching existing test files). Cover:
- Single rule block (unscoped package)
- Multi-rule block
- Scoped package name
- With `default_expiry` set
- Without `default_expiry`

## Risks and Questions
- None — purely additive, no I/O, no dependencies.

## Stubs
None — no external dependencies to stub.

## Verification Results

### 2026-04-09 Developer

```
node test/approvals/generator.test.js
```

| AC | Result |
|----|--------|
| Returns valid command string | PASS |
| Correct package@version (unscoped) | PASS |
| Correct package@version (scoped) | PASS |
| One --override per blocking rule (single) | PASS |
| One --override per blocking rule (multi) | PASS |
| --expires when default_expiry set | PASS |
| Omits --expires when no default_expiry | PASS |
| Multiple blocking rules → multiple --override flags | PASS |
| node test/approvals/generator.test.js passes | PASS |
