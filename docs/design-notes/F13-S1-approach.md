# Design Note: F13-S1 — SARIF 2.1.0 Formatter (`output/sarif.js`)

## Summary

Implements `src/output/sarif.js` — a pure leaf formatter that maps the grouped
CheckResult structure (F10 schema v2) to a valid SARIF 2.1.0 JSON document.
This story owns the formatter only; CLI wiring is F13-S2.

## Approach

A single exported function `formatSarifReport(groupedResults, lockfileUri)`
serialises the grouped policy results to a SARIF 2.1.0 JSON string.

- **Input contract:** `groupedResults` mirrors the F10-S3 shape:
  `{ blocked, admitted_with_approval, new_packages, admitted }` where each
  entry is a `DependencyCheckResult` with `name`, `version`, and
  `checkResult.findings[]`.
- **Result generation:** Only `groupedResults.blocked` entries are iterated.
  For each blocked entry, the formatter iterates `checkResult.findings` and
  emits one SARIF result per finding whose `severity === 'block'`.
  Warn-severity findings are silently skipped.
- **Rule ID mapping:** A `Map<string, string>` (`RULE_ID_MAP`) translates
  fully-qualified rule names (e.g. `'exposure:cooldown'`) to short SARIF rule
  IDs (e.g. `'cooldown'`). Unmapped names fall back to the raw name.
- **ADR-001 compliance:** No imports from other `src/` modules. Pure JSON
  serialisation via `JSON.stringify`. No runtime dependencies.

## Integration / Wiring Plan

```
F13-S2 (check.js)  →  formatSarifReport(groupedResults, lockfileUri)  →  stdout
```

The seam is kept explicit: `formatSarifReport` is the named export that
F13-S2 will consume. No wiring is added in this story.

## Files Changed

| File | Action |
|---|---|
| `src/output/sarif.js` | New — SARIF 2.1.0 formatter |
| `test/unit/output/sarif.test.js` | New — 20 unit tests |

## Acceptance-Criteria-to-Verification Mapping

| AC | Test(s) | Status |
|---|---|---|
| `formatSarifReport` is a named export | `output is valid JSON` (import succeeds) | PASS |
| Output is valid JSON with `$schema`, `version: "2.1.0"`, `runs[0]` | `$schema and version are correct` | PASS |
| `runs[0].tool.driver.name` is `"trustlock"` | `tool.driver.name is "trustlock"` | PASS |
| `runs[0].tool.driver.rules` has exactly 8 entries | `tool.driver.rules contains exactly 8 entries` | PASS |
| 8 correct rule IDs present | `tool.driver.rules contains all expected ruleIds` | PASS |
| Blocked findings produce one result per finding with correct `ruleId`, `level: "error"`, `message.text`, `artifactLocation.uri` | `one blocked package with two rules → two results`, `result has correct ruleId mapping`, `result level is "error"`, `message.text includes package@version prefix`, `artifactLocation.uri matches lockfileUri` | PASS |
| Admitted (`admitted` or `admitted_with_approval`) → zero results | `all admitted → results is empty array`, `admitted_with_approval → no SARIF results` | PASS |
| All-admitted → `results: []`; valid SARIF | `all admitted → results is empty array` | PASS |
| Multiple rules on one package → one result per rule | `one blocked package with two rules → two results` | PASS |
| `region.startLine` is `1` for all results | `region.startLine is 1 for all results` | PASS |
| No import from any other `src/` module | Code review + no `import` from `src/` in sarif.js | PASS |
| Unit test: one blocked package two rules → two results; `JSON.parse` succeeds | `one blocked package with two rules → two results` | PASS |
| Unit test: all admitted → `results: []`; `JSON.parse` succeeds | `all admitted → results is empty array` | PASS |

## Test Strategy

20 unit tests in `test/unit/output/sarif.test.js` using `node:test`:

- Document structure (valid JSON, `$schema`, `version`, `driver.name`, 8 rules, `artifacts`)
- All-admitted → empty results (both `admitted` and `admitted_with_approval`)
- Blocked findings → correct result count, `ruleId` mapping, `level`, `message.text`, `uri`, `index`, `startLine`
- Mixed blocked + admitted → only blocked appear
- Warn-severity findings filtered out
- Empty input → valid SARIF with empty results

## Stubs

None. All behaviour is real:
- 8 rule entries are literal constants, not placeholders.
- Suppression logic (`admitted_with_approval` → no results) is fully implemented.
- `driver.name` is the literal string `"trustlock"`.

## Risks and Questions

- **Qualified rule name mapping:** The `RULE_ID_MAP` covers 8 rule names.
  If a new rule is added in a future story, the map and `DRIVER_RULES` array
  must be updated together.
- **`# via` annotation (transitive):** The story calls for including the
  `# via` annotation in `message.text` when present (D10). The current
  implementation forwards `finding.message` verbatim from the policy engine,
  so if the policy engine includes `# via` in its finding message the
  formatter will carry it through correctly. No extra handling needed.

## Verification Results

Ran with `node --test test/unit/output/sarif.test.js`:

```
✔ formatSarifReport: output is valid JSON
✔ formatSarifReport: $schema and version are correct
✔ formatSarifReport: tool.driver.name is "trustlock"
✔ formatSarifReport: tool.driver.rules contains exactly 8 entries
✔ formatSarifReport: tool.driver.rules contains all expected ruleIds
✔ formatSarifReport: artifacts entry matches lockfileUri
✔ formatSarifReport: all admitted → results is empty array
✔ formatSarifReport: admitted_with_approval → no SARIF results
✔ formatSarifReport: one blocked package with one rule → one result
✔ formatSarifReport: one blocked package with two rules → two results
✔ formatSarifReport: result has correct ruleId mapping (execution:scripts → scripts)
✔ formatSarifReport: result has correct ruleId for all 7 implemented rules
✔ formatSarifReport: result level is "error"
✔ formatSarifReport: message.text includes package@version prefix
✔ formatSarifReport: artifactLocation.uri matches lockfileUri
✔ formatSarifReport: artifactLocation.index is 0
✔ formatSarifReport: region.startLine is 1 for all results
✔ formatSarifReport: mixed blocked + admitted → only blocked produce results
✔ formatSarifReport: warn-severity findings in blocked result are not emitted
✔ formatSarifReport: empty groupedResults → valid SARIF with empty results

tests 20 | pass 20 | fail 0
```

All required acceptance criteria: **PASS**

## Metadata

- Task: task-067
- Story: F13-S1
- Date: 2026-04-10
- Agent: developer
