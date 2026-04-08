# Review: task-028 — Implement Policy Config & Data Models (F06-S01)

## Status
Ready for review

## Handoff Summary
Implemented `src/policy/models.js` and `src/policy/config.js` as specified in F06-S01. All 6 acceptance criteria pass. 9 unit tests all pass.

## Deliverables
- `src/policy/models.js` — exports `PolicyConfig`, `Finding`, `CheckResult`, `DependencyCheckResult` shape definitions
- `src/policy/config.js` — exports `loadPolicy(configPath): Promise<PolicyConfig>` with DEFAULTS, deep merge, and `.exitCode = 2` error contract
- `test/policy/config.test.js` — 9 unit tests covering all AC scenarios
- `test/fixtures/policy/valid-full.json`, `valid-sparse.json`, `malformed.json` — test fixtures

## Verification
`node --test test/policy/config.test.js` — 9 pass, 0 fail

## Acceptance Criteria
- [x] `loadPolicy()` returns complete `PolicyConfig` with all fields populated (from file or defaults)
- [x] Missing file throws with `.exitCode = 2` and path in message
- [x] Malformed JSON throws with `.exitCode = 2` and parse error detail
- [x] Unknown rule names ignored — no error, no crash
- [x] `models.js` exports all four shapes with all required fields documented in comments
- [x] Unit tests cover: valid (all fields), valid (sparse), missing file, malformed JSON, unknown rule name

## Deferred Integration
CLI wiring (`src/cli/commands/check.js`) is intentionally deferred to F08 as specified in the story. The seam is explicit: `loadPolicy` is exported with a clear signature and error contract.

## Metadata
- Agent: developer
- Date: 2026-04-09
- Task: task-028
- Story: F06-S01
