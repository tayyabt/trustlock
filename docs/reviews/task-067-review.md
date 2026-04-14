# Review: task-067 — SARIF 2.1.0 Formatter (`output/sarif.js`)

## Verdict

**Approved**

All story acceptance criteria met. 20/20 unit tests pass. No stubs. ADR-001 compliant.

---

## Artifacts Reviewed

| Artifact | Path |
|---|---|
| Story | `docs/stories/F13-S1-sarif-2-1-0-formatter.md` |
| Feature Brief | `docs/feature-briefs/F13-sarif-output.md` |
| Design Note | `docs/design-notes/F13-S1-approach.md` |
| Source | `src/output/sarif.js` |
| Tests | `test/unit/output/sarif.test.js` |
| ADR | `docs/adrs/ADR-001-zero-runtime-dependencies.md` |
| Conventions | `context/global/conventions.md` |

---

## Acceptance Criteria Judgment

| # | AC | Verdict | Evidence |
|---|---|---|---|
| 1 | `formatSarifReport(groupedResults, lockfileUri)` exported as named export | PASS | Export declaration at `sarif.js:128`; import succeeds in 20 tests |
| 2 | Output is valid JSON with `$schema`, `version: "2.1.0"`, `runs[0]` | PASS | Tests: `output is valid JSON`, `$schema and version are correct` — all pass |
| 3 | `runs[0].tool.driver.name` is `"trustlock"` | PASS | Literal string at `sarif.js:173`; test `tool.driver.name is "trustlock"` |
| 4 | `runs[0].tool.driver.rules` has exactly 8 entries with correct IDs | PASS | `DRIVER_RULES` at `sarif.js:44-85`; tests confirm count and all 8 IDs |
| 5 | Each blocked finding → one result with correct `ruleId`, `level: "error"`, `message.text`, `artifactLocation.uri` | PASS | Tests: `one blocked package with two rules → two results`, `result level is "error"`, `message.text includes package@version prefix`, `artifactLocation.uri matches lockfileUri` |
| 6 | `admitted` and `admitted_with_approval` → zero results | PASS | Only `groupedResults.blocked` iterated (`sarif.js:133`); tests confirm both suppression cases |
| 7 | All-admitted → `results: []`; valid SARIF | PASS | Test `all admitted → results is empty array` |
| 8 | Multiple rules on one package → one result per rule | PASS | Test `one blocked package with two rules → two results` |
| 9 | `region.startLine` is `1` for all results | PASS | Literal `1` at `sarif.js:156`; test `region.startLine is 1 for all results` |
| 10 | No import from any other `src/` module (ADR-001) | PASS | No `import` statements in `sarif.js`; `check-no-stubs.sh` OK |
| 11 | Unit test: one blocked package two rules → two results; `JSON.parse` succeeds | PASS | Test `one blocked package with two rules → two results` |
| 12 | Unit test: all admitted → `results: []`; `JSON.parse` succeeds | PASS | Test `all admitted → results is empty array` |

All 12 story acceptance criteria: **PASS**

---

## Test Results

```
node --test test/unit/output/sarif.test.js
tests 20 | pass 20 | fail 0 | duration_ms 102.778625
```

All 20 tests green. No failures, no skips, no todos.

---

## Code Quality Assessment

**Implementation (`src/output/sarif.js`):**

- Pure function with no side effects. No runtime dependencies. No imports.
- `DRIVER_RULES` is a literal array of constants — not stubs. All 8 rule objects have correct `id`, `name`, and `shortDescription.text`.
- `RULE_ID_MAP` maps all 8 fully-qualified rule names to their short SARIF IDs. The `publisher-change` entry (`trust-continuity:publisher-change` → `publisher-change`) is intentionally included for forward compatibility; the rule is not yet implemented in the policy engine but its SARIF shape is registered.
- Warn-severity findings correctly skipped (`finding.severity !== 'block'` guard at `sarif.js:139`).
- `# via` transitive annotation forwarded verbatim from `finding.message` — correct per story D10 callout.
- Output format: 2-space indented JSON via `JSON.stringify(document, null, 2)`.

**Tests (`test/unit/output/sarif.test.js`):**

- 20 tests across: document structure, admission suppression, blocked-finding result shape, ruleId mapping (7 implemented rules), mixed input, warn-severity filtering, and empty-input edge case.
- Test title "result has correct ruleId for all 7 implemented rules" correctly omits `publisher-change` since the policy engine rule is not yet active — intentional and documented.
- Helper fixtures `blockedResult()` / `admittedResult()` cleanly represent the F10-S3 contract shape.

---

## Architecture and ADR Compliance

- **ADR-001 (Zero Runtime Dependencies):** Fully compliant. `sarif.js` has zero `import` statements. `JSON.stringify` is the only serialisation primitive used.
- **Conventions:** Named export (not default), camelCase function, UPPER_SNAKE_CASE constants, kebab-case filename — all per `context/global/conventions.md`.
- **Leaf-module boundary:** No cross-module imports. The caller seam (`F13-S2 check.js` → `formatSarifReport`) is explicit and well-documented in the design note.

---

## Integration Completeness

- **Callee-side (this story):** Complete. `formatSarifReport(groupedResults, lockfileUri)` is the stable exported contract. Input shape matches F10-S3 `groupedResults`.
- **Caller-side (F13-S2):** Deferred per scope. `check.js` wiring is F13-S2 (task-069). No stubs left in this story to bridge the gap.

---

## Regression Risk

Low. Formatter is a pure function with no side effects, no file I/O, no shared state. Future changes to the policy engine's `Finding` schema or the addition of new rules require updating both `DRIVER_RULES` and `RULE_ID_MAP` together — this risk is noted in the design note.

---

## Stubs Check

`check-no-stubs.sh`: **OK** — no runtime stubs, placeholders, or TODO-driven behavior.

---

## Design Note Assessment

Honest and complete. Verification section matches the actual test run. AC-to-test mapping is accurate. Stubs section confirms none present. No misrepresented verification.

---

## Metadata

- Task: task-067
- Story: F13-S1
- Reviewer: reviewer-code
- Date: 2026-04-10
- Verdict: **Approved**
