# Review Artifact: task-027 — Implement Approval Command Generator

## Status
Ready for review.

## Summary
Implemented `generateApprovalCommand(checkResult, policyConfig)` in `src/approvals/generator.js` and verified all acceptance criteria via `test/approvals/generator.test.js`.

## Delivery
- `src/approvals/generator.js` — new module, pure function, no internal imports
- `test/approvals/generator.test.js` — 13 unit tests, all pass
- `docs/design-notes/F05-S03-approach.md` — design note with AC mapping

## Verification
```
node test/approvals/generator.test.js
# tests 13, pass 13, fail 0
```

## Acceptance Criteria

| AC | Result |
|----|--------|
| `generateApprovalCommand` returns valid command string | PASS |
| Correct `package@version` (unscoped) | PASS |
| Correct `package@version` (scoped `@scope/pkg@1.0.0`) | PASS |
| One `--override` per blocking rule (single) | PASS |
| One `--override` per blocking rule (multi) | PASS |
| `--expires` included when `default_expiry` set | PASS |
| `--expires` omitted when no `default_expiry` | PASS |
| Multiple blocking rules → multiple `--override` flags | PASS |
| `node test/approvals/generator.test.js` all pass | PASS |

## Deferred Wiring
Output module (F07) will wire `generateApprovalCommand` on the caller side. Seam is explicit — the function is exported and ready.
