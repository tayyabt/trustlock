# Review Handoff: task-067 — SARIF 2.1.0 Formatter (`output/sarif.js`)

## Outcome

Implementation complete. All 20 unit tests pass. All required acceptance criteria verified PASS.

## Delivery Summary

| Artifact | Path |
|---|---|
| Formatter | `src/output/sarif.js` |
| Tests | `test/unit/output/sarif.test.js` |
| Design note | `docs/design-notes/F13-S1-approach.md` |

## What Was Built

`src/output/sarif.js` exports `formatSarifReport(groupedResults, lockfileUri)` —
a pure leaf SARIF 2.1.0 serialiser with no imports from other `src/` modules
(ADR-001 compliant). The formatter:

1. Declares all 8 policy rules as literal `DRIVER_RULES` constants.
2. Iterates `groupedResults.blocked` only — admitted and admitted_with_approval
   entries produce zero SARIF results.
3. Emits one `runs[0].results` entry per blocking finding (severity `'block'`),
   not per package.
4. Maps fully-qualified rule names to short SARIF rule IDs via `RULE_ID_MAP`.
5. Hard-codes `region.startLine: 1` and `level: "error"` per spec.

## Acceptance Criteria Status

All 13 story acceptance criteria: **PASS** (see design note for full mapping).

## Verification Command

```
node --test test/unit/output/sarif.test.js
# tests 20 | pass 20 | fail 0
```

## Notes for Reviewer

- The `# via` transitive annotation is handled by forwarding `finding.message`
  verbatim — if the policy engine includes the annotation the formatter carries
  it through without extra logic.
- CLI wiring (`check.js` --sarif flag) is deferred to F13-S2 (task-069).
- No stubs. No TODOs left in implementation scope.

## Metadata

- Task: task-067
- Story: F13-S1
- Date: 2026-04-10
- Agent: developer
