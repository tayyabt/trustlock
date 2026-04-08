# Review: task-018 — npm Lockfile Parser (v1, v2, v3)

## Status
ready_for_review

## Summary

Implements the full npm lockfile parser in `src/lockfile/npm.js`, replacing the F02-S02 stub. Handles all three npm lockfile formats (v1, v2, v3), source type classification, and direct/dev dependency detection via package.json cross-reference. Wires into the existing `parser.js` router. All 13 acceptance criteria pass.

## Delivered Files

| File | Change |
|------|--------|
| `src/lockfile/npm.js` | Full implementation (was stub) |
| `test/lockfile/npm.test.js` | New — 39 unit + integration tests |
| `test/fixtures/lockfiles/npm-v1.json` | Enriched with real package entries |
| `test/fixtures/lockfiles/npm-v2.json` | Enriched with real package entries + conflicting `dependencies` to prove `packages` preference |
| `test/fixtures/lockfiles/npm-v3.json` | Enriched with `hasInstallScripts` fields |
| `test/fixtures/lockfiles/package.json` | Enriched with `dependencies` and `devDependencies` |
| `test/fixtures/lockfiles/package-lock.json` | New — v3 fixture named for router detection (integration test) |

## Verification

```
node --test test/lockfile/npm.test.js
# 39 pass, 0 fail

node --test "test/lockfile/*.test.js"
# 70 pass, 0 fail (models + parser + npm)
```

## Acceptance Criteria

All 13 criteria: PASS. See design note at `docs/design-notes/F02-S03-approach.md` for full mapping.

## Notes for Reviewer

- v1 devDependency detection uses `entry.dev === true` (set by npm in v1 lockfiles) in addition to cross-referencing `package.json`. This is the correct v1 behavior.
- v2 `packages` preference is explicitly tested: the fixture has `lodash@4.0.0` in the backward-compat `dependencies` map, while `packages` has `lodash@4.17.21`. The test asserts 4.17.21 is returned.
- `hasInstallScripts` on a v3 entry without the field returns `null` (not `false`) — consistent with the "unavailable" signal documented in ADR-004.
- No changes to `parser.js` or `models.js` — the stub seam in `npm.js` was the only missing piece.
