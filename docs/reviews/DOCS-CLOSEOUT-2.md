# Docs Closeout: Sprint 2

## Summary

Sprint 2 ships dep-fence v0.1.0 — the complete, end-to-end implementation of the policy engine, all six CLI commands, both output formatters, the full integration test suite, and all user-facing documentation. All sprint-2 delivery tasks are marked `done`. One maintenance task (BUG-001 / task-041) remains in `ready` state and is carried into v0.1.1.

## Sprint 2 Delivered (task-028 – task-040)

| Task | Story | Outcome |
|------|-------|---------|
| task-028 | F06-S01 Policy Config & Data Models | Shipped — `src/policy/config.js`, `src/policy/decision.js` |
| task-029 | F06-S02 Trust & Exposure Rules | Shipped — cooldown, provenance, pinning rules |
| task-030 | F06-S03 Execution & Delta Rules | Shipped — scripts, sources, new-dep, transitive rules |
| task-031 | F06-S04 Engine Orchestration & Approval Integration | Shipped — `src/policy/engine.js` |
| task-032 | F07-S01 Terminal Formatter | Shipped — `src/output/terminal.js` |
| task-033 | F07-S02 JSON Formatter | Shipped — `src/output/json.js` |
| task-034 | F08-S1 CLI Scaffolding | Shipped — `src/cli/index.js`, `src/cli/args.js` |
| task-035 | F08-S2 check Command | Shipped — `src/cli/commands/check.js` |
| task-036 | F08-S3 approve Command | Shipped — `src/cli/commands/approve.js` |
| task-037 | F08-S4 init Command | Shipped — `src/cli/commands/init.js` |
| task-038 | F08-S5 audit, clean-approvals, install-hook | Shipped — `src/cli/commands/{audit,clean,install-hook}.js` |
| task-039 | F08-S6 End-to-End Integration Tests | Shipped — `test/integration/cli-e2e.test.js` (11/11 pass) |
| task-040 | F08-S7 Documentation and Example Files | Shipped — README, USAGE, POLICY-REFERENCE, ARCHITECTURE, examples/ |

## Sprint 2 Carry-Forward

| Task | Bug | Status | Scope |
|------|-----|--------|-------|
| task-041 | BUG-001 | `ready` | Terminal formatter emits full rule IDs in generated approval commands; `approve` accepts only short names. Medium severity usability bug in the blocked-approve workflow. Documented as known issue in CHANGELOG.md. |

## Docs Changes This Closeout

### Created
- **`OVERVIEW.md`** — Product overview, design rationale, trust signal table, operating modes, and key design constraints. Fills the gap between the user-facing README and the detailed ARCHITECTURE.md.
- **`CHANGELOG.md`** — v0.1.0 initial release entry covering all shipped capabilities across both sprints. Includes known issues section documenting BUG-001 with workaround.

### Verified accurate (no changes needed)
- **`README.md`** — Verified against task-040 review (all 3 workflows, 6 commands, all links). Accurate.
- **`USAGE.md`** — All flags verified against `src/cli/args.js`; error messages verified against source. Accurate.
- **`POLICY-REFERENCE.md`** — All 8 fields verified against `src/policy/config.js:DEFAULTS` and `src/cli/commands/approve.js:loadApprovalConfig`. Accurate.
- **`ARCHITECTURE.md`** — Module map, data flows, and data format examples all verified. Accurate.
- **`examples/configs/production.depfencerc.json`** — Valid JSON, strict policy settings. Accurate.
- **`examples/configs/relaxed.depfencerc.json`** — Valid JSON, annotated permissive settings. Accurate.
- **`examples/ci/github-actions.yml`** — Valid YAML, runs `dep-fence check --enforce` with Node >=18. Accurate.
- **`examples/ci/lefthook.yml`** — Valid YAML. Accurate.
- **`examples/ci/husky/.husky/pre-commit`** — Valid shell script (`bash -n` passes). Accurate.

## Known Issue Documented

**BUG-001** (`docs/bugs/BUG-001-approval-command-uses-full-rule-ids.md`): The terminal formatter uses `f.rule` directly (e.g. `execution:scripts`, `exposure:cooldown`, `trust:provenance`) when building the generated approval command, but `dep-fence approve --override` accepts only the short names (`scripts`, `cooldown`, `provenance`). Documented in `CHANGELOG.md` with workaround. Fix scheduled as task-041 (v0.1.1).

## Verification Basis

- task-040 review (`docs/reviews/task-040-review.md`): all 10 acceptance criteria pass; flags, defaults, and error messages cross-checked against source.
- task-039 review (`docs/reviews/task-039-review.md`): 11/11 integration test cases pass; full pipeline test confirms end-to-end behavior.
- `package.json` confirms: version `0.1.0`, Node engine `>=18.3`, zero runtime dependencies, `src/cli/index.js` as binary entry point.

## Metadata

- Agent: docs-closer
- Date: 2026-04-09
- Task: task-042
- Sprint: 2
