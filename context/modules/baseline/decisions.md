# Module Decisions: Baseline

## Durable Decisions
1. Auto-stage on advancement (ADR-002)
   - Why: Baseline must be committed alongside the lockfile change to maintain trust boundary integrity.
   - Consequence: `writeAndStage()` calls `git add` after writing. CLI must handle `git add` failures gracefully.

2. Packages keyed by name, not name@version
   - Why: A package can only exist once in the baseline (latest admitted version). Keying by name gives O(1) lookup and naturally handles version changes.
   - Consequence: The baseline is a map, not an array. Version changes overwrite the previous entry.

3. Lockfile hash for fast-path only
   - Why: Quick detection of "no changes at all" without parsing. But not authoritative — formatting changes produce different hashes.
   - Consequence: Hash match → skip parsing, exit early. Hash mismatch → full parse and delta.

## Deferred Decisions
- Baseline schema v2 for publisher identity (v0.2)
- `advance-baseline` CLI command for CI workflows (future)

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: baseline
