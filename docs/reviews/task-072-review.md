# Review: task-072 — policy/inherit.js: extends resolution, fetch, cache, and deep-merge

## Status
Ready for review

## Summary

Implements `src/policy/inherit.js` (new module, F15-S1). All 14 acceptance criteria verified PASS. 25 new unit tests, all passing. No regressions in the existing suite.

## Deliverables

| Artifact | Path |
|---|---|
| Source | `src/policy/inherit.js` |
| Tests | `test/policy/inherit.test.js` |
| Design note | `docs/design-notes/F15-S1-approach.md` |

## Acceptance Criteria Outcomes

| AC | Description | Result |
|---|---|---|
| AC1 | `resolveExtends` exported as named async function | PASS |
| AC2 | No `src/registry` import (C6) | PASS — grep returns no output |
| AC3 | Local path read relative to `.trustlockrc.json`; no cache written | PASS |
| AC4 | Fresh cache (<1h) → no HTTP call | PASS — mock server requestCount=0 |
| AC5 | Stale cache + reachable → cache refreshed | PASS — new `fetched_at` in cache |
| AC6 | Stale cache + unreachable → stale used, stderr warning | PASS |
| AC7 | No cache + unreachable → error with URL | PASS |
| AC8 | Scalar merge: repo wins (`cooldown_hours: 96` over `72`) | PASS |
| AC9 | Floor enforcement: exact `Policy error:` message | PASS |
| AC10 | Array union: `["build"] + ["test"] → ["build","test"]`; org entries preserved | PASS |
| AC11 | Object deep-merge: `provenance` keys merged correctly | PASS |
| AC12 | Chained extends stripped + stderr warning | PASS — local and remote variants |
| AC13 | Non-JSON response → parse error with URL | PASS |
| AC14 | Local path not found → error with path | PASS |

## Verification Command

```
node --test test/policy/inherit.test.js
# 25/25 PASS

grep -r "src/registry" src/policy/inherit.js
# no output (exit 1) — C6 compliant
```

## Integration Notes

- `loader.js` (F15-S2) is the intended caller. The seam is explicit: `resolveExtends` + `mergePolicy` are exported with their full contracts. S2 can import and wire without any changes to `inherit.js`.
- No wiring changes to existing commands or modules in this story.

## Notes for Reviewer

- Test runner is `node --test`, not jest (jest is not installed; `package.json` uses `node --test`).
- 34 pre-existing test failures in the full suite (output/terminal color tests, args.js F10-S4 tests); none are in this story's scope.
- The `mergeNestedObject` helper is intentionally not exported — it is an implementation detail used only by `mergePolicy`.
