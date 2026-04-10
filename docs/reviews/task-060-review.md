# Review: task-060 — Implement TTY-aware progress counter utility

## Status
Ready for review

## Story
F10-S1: TTY-aware progress counter utility

## Summary

`src/utils/progress.js` is implemented as a zero-import factory module.
`createProgress(total, stream)` returns a `{ tick(n), done() }` object whose
behavior is specialized at construction time based on `stream.isTTY`.

All 8 acceptance criteria are verified PASS. 22 unit tests pass.

## Delivery

| Artifact | Path |
|---|---|
| Source | `src/utils/progress.js` |
| Tests | `src/utils/__tests__/progress.test.js` |
| Design note | `docs/design-notes/F10-S1-approach.md` |

## Acceptance Criteria

| # | Criterion | Result |
|---|---|---|
| AC1 | `createProgress(total, stream)` exported; returns `{ tick(n), done() }` | PASS |
| AC2 | TTY: each tick rewrites line with `\r`; done() writes `\n` | PASS |
| AC3 | Non-TTY: line with `\n` at ~10% interval; silent between | PASS |
| AC4 | `tick()` is a no-op when total is 0 | PASS |
| AC5 | `done()` is idempotent (safe to call multiple times) | PASS |
| AC6 | No stdout writes | PASS |
| AC7 | No imports outside Node.js built-ins (ADR-001) | PASS |
| AC8 | Tests cover TTY rewrite, non-TTY interval, zero-total, idempotent done() | PASS |

## Verification Commands

```
node --test src/utils/__tests__/progress.test.js
# → 22 pass, 0 fail

grep "^import" src/utils/progress.js | wc -l
# → 0
```

## Notes for Reviewer

- Zero imports in `progress.js` — entirely self-contained.
- TTY branch forked once at factory time (not per tick) for efficiency.
- `done()` idempotency: shared `finished` flag guards both TTY and non-TTY done.
- Non-TTY interval detection uses `Math.floor(count / interval) > Math.floor(prev / interval)` — handles `n > 1` tick increments correctly.
- F10-S4 owns wiring `createProgress` into `check.js` and `init.js`; this story exposes the stable contract only.
