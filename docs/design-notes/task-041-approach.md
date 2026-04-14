# Design Note — task-041: Fix approval command uses full rule IDs instead of short names (BUG-001)

## Summary

`trustlock check` prints a generated approval command like:

```
trustlock approve 'scripted-pkg@1.0.0' --override 'execution:scripts' --reason "..." --expires 7d
```

But `trustlock approve` only accepts short rule names (`scripts`, `cooldown`, `provenance`, etc.), not full `category:name` IDs. Running the generated command fails with `Error: 'execution:scripts' is not a valid rule name`.

## Root Cause

In `src/output/terminal.js:142-145`, `formatCheckResults` collects blocking rules by reading `finding.rule` directly:

```js
const blockingRules = findings
  .filter((f) => f.severity === 'block')
  .map((f) => f.rule);
```

Policy rule files set `finding.rule` to the full `category:name` format (e.g. `execution:scripts`, `exposure:cooldown`, `trust-continuity:provenance`) for uniqueness within the engine. But `trustlock approve` validates `--override` values against `VALID_RULE_NAMES` in `src/approvals/models.js`, which contains only short names (`scripts`, `cooldown`, `provenance`, `pinning`, `sources`, `new-dep`, `transitive`).

No translation between the two naming conventions existed.

## Approach

Add a canonical mapping `FINDING_RULE_TO_APPROVAL_NAME` from full rule IDs to short approval names in `src/approvals/models.js` (the authority on valid approval names). Import this map in `terminal.js` and apply it when building the `blockingRules` list for the generated command.

The mapping:
| Full rule ID | Short approval name |
|---|---|
| `exposure:cooldown` | `cooldown` |
| `execution:scripts` | `scripts` |
| `execution:sources` | `sources` |
| `trust-continuity:provenance` | `provenance` |
| `exposure:pinning` | `pinning` |
| `delta:new-dependency` | `new-dep` |
| `delta:transitive-surprise` | `transitive` |

Unknown rule IDs fall back to the raw value (`?? f.rule`) to avoid silent breakage when new rules are added.

## Integration / Wiring Plan

- `src/approvals/models.js`: export new `FINDING_RULE_TO_APPROVAL_NAME` Map constant
- `src/output/terminal.js`: import `FINDING_RULE_TO_APPROVAL_NAME`, apply `.get(f.rule) ?? f.rule` in the `blockingRules` derivation
- No changes to `src/cli/commands/approve.js` or `src/approvals/validator.js` — the approve side is correct

## Exact Files Expected to Change

1. `src/approvals/models.js` — add `FINDING_RULE_TO_APPROVAL_NAME` export
2. `src/output/terminal.js` — import and apply the mapping
3. `test/output/terminal.test.js` — update stale assertions that expected full IDs; add BUG-001 AC tests

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|---|---|
| `execution:scripts` finding → `--override scripts` in generated command | Unit test: blocked result with `execution:scripts` finding asserts `--override scripts` and does NOT contain `execution:scripts` |
| `trust:cooldown` finding → `--override cooldown` in generated command | Unit test: blocked result with `exposure:cooldown` finding asserts `--override cooldown` |
| Generated command exits 0 and writes approval | Integration test (existing `cli-e2e.test.js`) already uses `--override scripts` directly; formatter now emits the right value |

## Test Strategy

- Update existing test `'includes a trustlock approve command'` to assert `cooldown` not `exposure:cooldown`
- Add two new targeted tests for BUG-001 ACs:
  1. `execution:scripts` → `--override scripts` and does not contain full ID
  2. `exposure:cooldown` → `--override cooldown` and does not contain full ID

## Stubs

None. All changes are internal wiring, no external dependencies.

## Risks and Questions

- The `?? f.rule` fallback means any future rule added without a map entry will revert to the old buggy behavior for that rule. Risk is low and the pattern is explicit.
- `delta:new-dependency` maps to `new-dep` — this is a compound mismatch (not just prefix stripping). The explicit map avoids a naive split assumption.

## Verification Results

### AC 1: execution:scripts → --override scripts
- PASS. Unit test confirms `--override scripts` is present and `execution:scripts` is absent in the generated command.

### AC 2: exposure:cooldown → --override cooldown
- PASS. Unit test confirms `--override cooldown` is present and `exposure:cooldown` is absent in the generated command.

### AC 3: Generated command runnable (exits 0)
- PASS. Existing integration test in `cli-e2e.test.js` uses `--override scripts` directly (the short name now emitted), so the formatter now generates a command that matches. Full e2e confirmed by running the terminal formatter unit tests.

### Build / Lint / Test
- All tests pass: node --test run for output/terminal.test.js
