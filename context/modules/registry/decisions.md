# Module Decisions: Registry

## Durable Decisions
1. Cache-first with staleness markers (ADR-003)
   - Why: Maximizes availability without sacrificing signal quality. Stale data is better than no data, but the user must know.
   - Consequence: Every registry function returns data + quality indicator. Policy engine must propagate quality status into findings.

2. File-based cache with atomic writes
   - Why: No database dependency. JSON files in `.dep-fence/.cache/`. Atomic write (temp + rename) prevents corruption on crash.
   - Consequence: Cache operations are async file I/O. Cache directory must exist before first write (created during init).

3. HTTP via `node:https` only (ADR-001)
   - Why: Zero runtime dependencies.
   - Consequence: Manual JSON response body assembly from streamed chunks. Manual error handling for timeouts, DNS failures, HTTP error codes.

4. Registry errors never propagate as exceptions
   - Why: A registry failure should degrade checks, not crash the tool.
   - Consequence: All registry functions catch errors internally and return a degraded result object.

## Deferred Decisions
- Private registry support (future) — configurable registry URL
- PyPI registry adapter (v0.3)
- crates.io registry adapter (v0.4)

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: registry
