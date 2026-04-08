# Review Artifact: task-030 — Implement Execution & Delta Rules

## Status
ready_for_review

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
