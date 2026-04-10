# Design Approach: F10-S1 — TTY-aware progress counter utility

## Summary

Implement `src/utils/progress.js` as a standalone, pure-JS factory that writes
stderr progress to any writable stream. The module has no imports — not even
Node.js built-ins — satisfying ADR-001 completely. The factory returns a
`{ tick(n), done() }` object whose behavior forks once on `stream.isTTY` at
creation time, avoiding repeated TTY checks per tick.

## Key Design Decisions

1. **Single TTY branch at factory time** (not per tick): `isTTY` is read once
   when `createProgress` is called; the returned object is specialized for its
   mode. Avoids repeated property lookups and is easier to reason about.

2. **`total = 0` early return**: returns a frozen no-op object before any
   interval computation, preventing division by zero.

3. **Interval = `Math.ceil(total * 0.1)`**: matches the story spec exactly.
   For total ≤ 10 this produces interval = 1 (write on every tick). For larger
   totals, write at ~10% boundaries. Boundary detection uses
   `Math.floor(count / interval) > Math.floor(prev / interval)` so a jump of
   n > 1 can cross multiple boundaries and correctly emits once per crossing.

4. **Idempotent `done()` via `finished` flag**: a single shared `finished`
   boolean guards the write in both TTY and non-TTY done implementations.
   Second call is a strict no-op.

5. **No imports**: `stream.write()` is called directly; no `node:process`
   import needed because the stream is injected by the caller.

## Design Compliance

No design preview applies (utility module, no UI). ADR-001 enforced: zero
imports.

## Integration / Wiring

- **Callee-side (this story)**: full implementation of `src/utils/progress.js`
  with a stable named export `createProgress(total, stream)`.
- **Caller-side (deferred)**: F10-S4 owns wiring `createProgress` into
  `check.js` (when ≥5 packages need metadata fetch) and `init.js` (always).
  The seam is the `createProgress` export; F10-S4 needs no further API surface.
- The current implementation is correct as a standalone library without any
  command-side callers.

## Files to Create/Modify

- `src/utils/progress.js` — new; factory implementation (~55 lines)
- `src/utils/__tests__/progress.test.js` — new; full behavioral test suite

## Testing Approach

Uses Node.js built-in test runner (`node:test` + `node:assert/strict`).
A `makeStream(isTTY)` helper constructs a lightweight mock writable that
captures `write()` calls into a `chunks` array; `stream.isTTY` is set
directly. No external dependencies needed.

Test groups:
- **TTY mode**: verifies `\r` prefix, line format, `done()` newline
- **Non-TTY mode**: verifies interval logic, newline on each interval write
- **Zero-total**: verifies no writes from either `tick()` or `done()`
- **Idempotent done()**: verifies second call produces no additional output
- **Stdout isolation**: overrides `process.stdout.write` during a full cycle,
  asserts zero captures

## Acceptance Criteria / Verification Mapping

- AC: `createProgress(total, stream)` is the exported factory; returns `{ tick(n), done() }`
  → Verification: import and call in test; assert returned object shape
- AC: TTY path: each `tick()` rewrites same line with `\r`; `done()` writes final newline
  → Verification: `makeStream(true)`, multiple ticks, assert `\r` prefix; done asserts `\n`
- AC: Non-TTY path: progress line with `\n` at every ~10% interval; silent between
  → Verification: `makeStream(false)`, total=20 (interval=2), tick 20 times; assert writes at even ticks only
- AC: `tick()` is a no-op when total is 0
  → Verification: `createProgress(0, stream)`, tick, done; assert `stream.chunks.length === 0`
- AC: `done()` is safe to call multiple times (idempotent)
  → Verification: call done() twice; assert only one write
- AC: No stdout writes occur
  → Verification: override `process.stdout.write`; run full cycle; assert no captures
- AC: `src/utils/progress.js` does not import any module outside Node.js built-ins (ADR-001)
  → Verification: read file source; grep for `import`
- AC: Unit tests cover TTY rewrite, non-TTY interval logic, zero-total no-op, idempotent done()
  → Verification: `node --test src/utils/__tests__/progress.test.js` passes all

## Verification Results

*(populated after implementation)*

- AC: exported factory shape → PASS — test `createProgress returns object with tick and done`
- AC: TTY `\r` rewrite, done newline → PASS — test group `TTY mode`
- AC: Non-TTY interval logic → PASS — test group `non-TTY mode`
- AC: zero-total no-op → PASS — test `zero total is a complete no-op`
- AC: idempotent done() → PASS — test `done() is idempotent`
- AC: no stdout writes → PASS — test `does not write to stdout`
- AC: ADR-001 compliance (no imports) → PASS — `grep import src/utils/progress.js` returns 0 lines
- AC: test suite → PASS — `node --test src/utils/__tests__/progress.test.js`

## Story Run Log Update

### 2026-04-10 Developer: Implementation

- Created `src/utils/progress.js` (~55 lines, zero imports)
- Created `src/utils/__tests__/progress.test.js` (all ACs covered)
- Ran: `node --test src/utils/__tests__/progress.test.js` → all tests PASS
- Ran: `grep "^import" src/utils/progress.js` → 0 lines (ADR-001 ✓)

## Documentation Updates

None — no interface changes to public docs, no new env vars, no setup change.

## Deployment Impact

None. New file, zero dependencies, no configuration.

## Questions/Concerns

None. The story is precise and complete.

## Metadata

- Agent: developer
- Date: 2026-04-10
- Work Item: F10-S1 / task-060
- Work Type: story
- Branch: burnish/task-060-implement-tty-aware-progress-counter-utility
- ADR: ADR-001
- Design Preview: N/A
