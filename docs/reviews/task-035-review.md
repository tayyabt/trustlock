# Review: task-035 — `check` Command Implementation

## Outcome
Implementation ready for review.

## Summary
Implemented `dep-fence check` — the core command that orchestrates the full evaluation pipeline.
Also created `src/policy/engine.js` (declared F06 dependency, absent from worktree).

## Scope Delivered
- `src/cli/commands/check.js` — full implementation replacing the stub
- `src/policy/engine.js` — policy orchestration layer (missing F06 artifact)
- `test/unit/cli/check.test.js` — 14 unit tests covering all acceptance criteria

## Verification
- `node --test test/unit/cli/check.test.js`: **14/14 pass**
- `node --test` (full suite): **434/434 pass**

## Acceptance Criteria Status
All required ACs are PASS. See design note for full mapping.

## Notes for Reviewer
- The policy engine (`src/policy/engine.js`) was absent despite being listed as a
  completed F06 dependency. It was created here with minimal scope: orchestration
  of the three existing rule files plus approval matching. No new rules, no new
  data models.
- The rules emit `severity: 'error'` but the data models specify `'block'`.
  The engine normalizes this. The rule files were not modified.
- Registry client injection (`_registryClient`) was added to `run()` to enable
  unit testing without real HTTP calls. The production code path is unchanged.
- `process.exit(2)` in `parseLockfile` is intentional (F02 design) — tests avoid
  triggering it by always providing valid lockfile fixtures.
