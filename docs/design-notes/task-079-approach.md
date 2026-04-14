# Design Note: task-079 — Fix npm v2/v3 parser crash on workspace link entries

## Summary

`_parseV2V3` in `src/lockfile/npm.js` iterates every key in the `packages` map but only skips the root entry (`""`). npm v2/v3 lockfiles in workspace projects include synthetic `"link": true` entries for each workspace member (e.g. `"apps/frontend": { "link": true }`). These entries have no `version` field. When they reach `validateDependency`, it throws `"missing required field version"`, crashing both `init` and `audit` for any npm workspaces project.

## Root-Cause Hypothesis

`_parseV2V3` at `src/lockfile/npm.js:98-130` has one guard: `if (key === '') continue`. Workspace link entries are not under `node_modules/` and have `"link": true` with no `version`. The fix is to add a second guard immediately after the root-entry guard:

```js
if (entry.link === true) continue;
```

This matches the exact behavior specified in the bug report and the behavioral rule in BUG-002.

## Approach

Single-line guard added at `src/lockfile/npm.js` line 103 (after the `key === ''` guard). No other files require changes. No new abstraction needed.

## Integration / Wiring Plan

No caller changes needed. `parseNpm` and `parseLockfile` already compose correctly; the fix is entirely internal to `_parseV2V3`.

## Exact Files Expected to Change

- `src/lockfile/npm.js` — add `if (entry.link === true) continue;` guard
- `test/lockfile/npm.test.js` — add regression tests for v2 and v3 lockfiles containing link entries

## Acceptance-Criteria-to-Verification Mapping

| AC | Verification |
|----|-------------|
| `init`/`audit` complete without error on workspace lockfile | Unit test: `parseNpm` called with v2/v3 lockfile containing `link: true` entries — no throw |
| Workspace link entries not in parsed array | Assert result does not include `apps/frontend` or `apps/backend` |
| Non-link entries still parsed correctly | Existing fixture tests continue to pass |
| Regression: unit test for link entry excluded from results | New tests in `test/lockfile/npm.test.js` |

## Test Strategy

Two new inline describe blocks added to `test/lockfile/npm.test.js`:
- v2 lockfile with two `link: true` entries + one normal package: assert link entries absent, normal package present
- v3 lockfile same shape: assert same invariants

## Stubs

None.

## Risks and Questions

None. The fix is one line; the link entries are entirely structural metadata in the lockfile format, not packages to be audited.

## Verification Results

### AC1: `init`/`audit` complete without error on workspace lockfile
- Status: PASS
- Evidence: `parseNpm` no longer throws when called with a v2 or v3 lockfile containing `"link": true` entries.

### AC2: Workspace link entries not in parsed array
- Status: PASS
- Evidence: New tests assert `result.find(d => d.name === 'apps/frontend')` is undefined.

### AC3: Non-link entries still parsed correctly
- Status: PASS
- Evidence: All pre-existing fixture tests pass without modification.

### AC4: Regression test covers v2/v3 lockfile with link entry
- Status: PASS
- Evidence: Two new describe blocks in `test/lockfile/npm.test.js`.
