# Review Artifact: task-030 — Implement Execution & Delta Rules

## Status
approved

## Verdict
**Approved**

### Reviewer Judgment
All four rule implementations are correct, self-contained pure functions matching the exact contract required by F06-S03. Every acceptance criterion is concretely verified by passing tests. No stubs, TODOs, or deferred behavior found in critical paths. Integration seam is explicit and complete for the owned side. ADR-001 (zero runtime deps) honored.

### Checks Performed
- [x] Correctness (each AC verified individually against test evidence)
- [x] Architecture compliance — ADR-001 zero runtime deps honored; pure Node.js ESM; no external imports
- [x] Behavioral rule compliance — warning-severity rules never use "error"; threshold hardcoded at 5; passive delta passthrough
- [x] Integration completeness — named `evaluate` export on all four rules; 4-arg + optional-5th contract matches engine seam
- [x] Pitfall avoidance — null-registry fallback in `scripts.js`; unknown source treated as safe in `sources.js`; undefined baseline handled in `new-dependency.js`
- [x] Convention compliance — kebab-case files, camelCase functions, UPPER_SNAKE_CASE constant, pure functions, ESM exports
- [x] Test coverage — 41 tests across 4 files: admit, block/warn, and edge cases all present
- [x] No stubs/placeholders — manual grep found zero TODO/FIXME/not-implemented patterns

### Reviewer Acceptance Criteria Judgment
- `scripts.js` blocks non-allowlisted package with install scripts → **PASS** — `scripts.test.js` 11/11
- `scripts.js` admits allowlisted packages → **PASS**
- `scripts.js` skipped when both hasInstallScripts null → **PASS** — `returns [] (not block) when both lockfile and registry hasInstallScripts are null`
- `scripts.js` npm v3 vs v1/v2 handling → **PASS** — precedence tests confirmed in both directions
- `sources.js` blocks git/file/non-registry URLs → **PASS** — `sources.test.js` 13/13
- `sources.js` admits standard npm registry including scoped packages → **PASS** — `admits scoped package from npm registry`
- `new-dependency.js` warning for null baseline → **PASS** — `new-dependency.test.js` 6/6
- `new-dependency.js` admits when baseline exists → **PASS** — empty-object baseline also covered
- `transitive-surprise.js` warning when count > 5 → **PASS** — `transitive-surprise.test.js` 11/11
- `transitive-surprise.js` admits when count ≤ 5 or no delta → **PASS** — exact threshold and missing delta both covered
- All four rules return correct Finding shape → **PASS** — shape assertion tests in all four test files

### Regression Risk
- Level: low
- All four rules are pure functions with no file I/O or side effects. No existing rule files were modified. Engine (F06-S04) does not exist yet, so no regression surface. Seam is stable.

### Integration / Boundary Judgment
- Boundary: `src/policy/rules/*.js` ← `engine.js` (F06-S04, not yet implemented)
- Judgment: complete for this story's owned side
- Notes: Named `evaluate` export with 4-arg + optional-5th contract. `models.js` is referenced in JSDoc types only (no runtime import) — correct since rules produce plain objects; full import wiring deferred to F06-S04.

### Context Updates
No context updates needed. Null-handling patterns are already captured in story edge cases and inline JSDoc.

### Artifacts Used for Judgment
- Story: `docs/stories/F06-S03-execution-and-delta-rules.md`
- Feature brief: `docs/feature-briefs/F06-policy-engine.md`
- Design note: `docs/design-notes/F06-S03-approach.md`
- ADR: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- Global conventions: `context/global/conventions.md`

### Reviewer Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-030
- Branch: burnish/task-030-implement-execution-delta-rules

---

## Outcome Summary
All four execution and delta rules implemented as pure `evaluate()` functions. All 41 unit tests pass. All required acceptance criteria verified.

## Delivery
- `src/policy/rules/scripts.js` — `execution:scripts` rule: allowlist check, npm v3 vs v1/v2 `hasInstallScripts` handling, null-registry skip
- `src/policy/rules/sources.js` — `execution:sources` rule: URL classification (registry/git/file/url), allow-list enforcement
- `src/policy/rules/new-dependency.js` — `delta:new-dependency` rule: null-baseline = new package = `severity: "warning"`
- `src/policy/rules/transitive-surprise.js` — `delta:transitive-surprise` rule: threshold hardcoded at 5, `delta.newTransitiveCount` field, 5th optional param

## Verification

| Test File | Tests | Pass | Fail |
|---|---|---|---|
| `test/policy/rules/scripts.test.js` | 11 | 11 | 0 |
| `test/policy/rules/sources.test.js` | 13 | 13 | 0 |
| `test/policy/rules/new-dependency.test.js` | 6 | 6 | 0 |
| `test/policy/rules/transitive-surprise.test.js` | 11 | 11 | 0 |
| **Total** | **41** | **41** | **0** |

## AC Check

| Acceptance Criterion | Result |
|---|---|
| `scripts.js`: blocks non-allowlisted package with install scripts | PASS |
| `scripts.js`: admits allowlisted package | PASS |
| `scripts.js`: returns [] when both null (skipped, not block) | PASS |
| `scripts.js`: npm v3 lockfile value takes precedence over registry | PASS |
| `sources.js`: blocks git/file/non-registry URLs | PASS |
| `sources.js`: admits standard npm registry URLs (incl. scoped) | PASS |
| `new-dependency.js`: warning for null baseline | PASS |
| `new-dependency.js`: admits when baseline exists | PASS |
| `transitive-surprise.js`: warning when > 5 | PASS |
| `transitive-surprise.js`: admits when ≤ 5 or no delta | PASS |
| All rules return correct Finding shape | PASS |

## Implementation Notes
- `transitive-surprise.js` uses an optional 5th `delta` parameter following the pattern established by `cooldown.js` (`now` param). This matches the story requirement that "the delta argument must carry the new-transitive count."
- All four rules are synchronous pure functions with zero file I/O.
- No stubs. No internal wiring deferred.
