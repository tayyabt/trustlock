# Story: F10-S1 — TTY-aware progress counter utility

## Parent
F10: Output/UX Redesign

## Description
Create `src/utils/progress.js` — a TTY-aware stderr progress counter that the CLI wires into `check` (when ≥5 packages need metadata fetch) and `init` (always). This utility is the infrastructure that the CLI integration story (F10-S4) wires to commands; it has no dependency on any other F10 story.

## Scope
**In scope:**
- `src/utils/progress.js` (new file)
- Unit tests for progress counter behavior in TTY and non-TTY modes

**Not in scope:**
- Wiring into check.js or init.js (F10-S4 owns that)
- Any stdout output (progress is stderr-only)
- Interaction with terminal.js or json.js

## Entry Points
- Route / page / screen: `src/utils/progress.js` — standalone utility module
- Trigger / navigation path: Called by CLI commands (check.js, init.js) during registry metadata fetch loops
- Starting surface: New module; no existing entry point

## Wiring / Integration Points
- Caller-side ownership: F10-S4 owns wiring progress.js into check.js and init.js
- Callee-side ownership: This story owns the full implementation of `progress.js` as a named-export module
- Caller-side conditional rule: Caller (check.js, init.js) does not exist yet for F10 — this story exposes the contract; F10-S4 wires to it
- Callee-side conditional rule: No existing callee; this story creates the callee from scratch
- Boundary / contract check: `progress.js` exports a `createProgress(total, stream)` factory that returns `{ tick(n), done() }`. F10-S4 must be able to call `createProgress` with only `stderr` and `total` as inputs and get a working counter without further configuration
- Files / modules to connect: `src/utils/progress.js` only; wiring into commands is deferred
- Deferred integration, if any: CLI wiring is F10-S4. init.js TTY detection is F10-S4.

## Not Allowed To Stub
- TTY detection (`process.stderr.isTTY`) must be real — `\r` vs newline behavior must branch on the actual TTY state, not a mock flag
- The ~10% interval logic for non-TTY must be computed from `total`, not hardcoded
- `done()` must write a trailing newline when non-TTY (to avoid clobbering the last progress line)

## Behavioral / Interaction Rules
- On TTY: write `\rFetching metadata [N/total]` with a carriage return; no newline emitted until `done()`
- On non-TTY: write `Fetching metadata [N/total]\n` at ~10% intervals (every `Math.ceil(total * 0.1)` ticks)
- Never writes to stdout; only to the stream passed to the factory (always stderr in production)
- Does not affect `--json` stdout because it writes to a separate stream — this boundary is structural, not configurable
- Cooldown clear timestamp formatting is not in scope here (that is `terminal.js`)

## Acceptance Criteria
- [ ] `createProgress(total, stream)` is the exported factory; returns `{ tick(n), done() }`
- [ ] TTY path: each `tick()` call rewrites the same line with `\r`; `done()` writes a final newline
- [ ] Non-TTY path: progress line written with `\n` at every ~10% interval; silent between intervals
- [ ] `tick()` is a no-op when total is 0
- [ ] `done()` is safe to call multiple times (idempotent)
- [ ] No stdout writes occur (verified by capturing process.stdout in tests)
- [ ] `src/utils/progress.js` does not import any module outside of Node.js built-ins (ADR-001)
- [ ] Unit tests cover: TTY rewrite behavior, non-TTY interval logic, zero-total no-op, idempotent done()

## Task Breakdown
1. Create `src/utils/progress.js` with `createProgress(total, stream)` factory
2. Implement TTY branch: `\r` rewrite on each tick, newline on `done()`
3. Implement non-TTY branch: interval computation, newline writes at ~10% steps
4. Guard `tick()` for zero-total case; guard `done()` for idempotency
5. Write unit tests in `src/utils/__tests__/progress.test.js` covering all four behavioral rules

## Verification
```bash
node --test src/utils/__tests__/progress.test.js
# Expected: all tests pass
# Spot-check: progress line written to stderr stream; stdout capture shows zero writes
```

## Edge Cases to Handle
- `total = 0`: counter must be a no-op; no division by zero in interval computation
- `done()` called twice: second call must be silent
- Non-TTY with `total = 1`: at least one newline emitted (100% = first interval boundary)
- Non-TTY with `total = 3`: interval = Math.ceil(0.3) = 1, so every tick emits a line

## Dependencies
- Depends on: none within F10
- Blocked by: F09 (paths.js) must be done — but progress.js itself has no import dependency on F09; this story can proceed without F09 being merged

## Effort
S — new ~60-line utility with straightforward branching; test coverage is the bulk of the work

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P1

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
