# Feature: F04 Baseline Management

## Summary
Manage the trust baseline — the last known-good state of the dependency tree. Create, read, advance, and compute deltas between baseline and current lockfile. Auto-stage baseline on advancement per ADR-002.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Data layer — baseline operations are internal to check and init flows, tested via unit tests
- Target Sprint: 1
- Sprint Rationale: Required by policy engine (sprint 2) for delta computation and trust profile comparison

## Description
This feature implements the baseline module per ADR-002. The baseline is stored as `.dep-fence/baseline.json` and tracks the trust profile for every admitted package: name, version, admission timestamp, provenance status, install scripts, and source type.

The delta computation compares the current lockfile state against the baseline and classifies each package as added, removed, changed, or unchanged. Only added and changed packages are evaluated by the policy engine.

Baseline advancement is all-or-nothing (D1): if any package is blocked, no advancement occurs. Advancement writes the updated baseline and auto-stages it via `git add` (ADR-002). The `--dry-run` and `--enforce` flags suppress advancement entirely (D10).

Removed packages are silently dropped from the baseline (D3).

## User-Facing Behavior
Not directly user-facing. The baseline file appears in `git diff --staged` after a successful advisory check — this is intentional visibility per ADR-002.

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. First run after `init` — baseline exists but no changes yet; delta should be empty
2. Baseline file missing — must produce clear error (not initialized), not crash
3. Baseline file corrupted (invalid JSON) — must produce clear error (exit 2)
4. `schema_version` mismatch — must handle or reject gracefully (future-proofing for v0.2 publisher data)
5. Package removed from lockfile — silently remove from baseline on next successful advance (D3)
6. All-or-nothing: 10 packages pass, 1 blocked — no baseline advance for any
7. `--dry-run` mode — must not write or stage baseline
8. `--enforce` mode — must not write or stage baseline (D10)
9. `git add` fails (e.g., baseline in .gitignore by mistake) — must warn, not silently fail
10. Lockfile hash unchanged but baseline is stale — `lockfile_hash` short-circuit correctly detects "no changes"

## Acceptance Criteria
- [ ] `createBaseline()` builds a baseline from `ResolvedDependency[]` with correct trust profiles
- [ ] `readBaseline()` loads and validates `.dep-fence/baseline.json`
- [ ] `computeDelta()` correctly classifies packages as added, removed, changed, or unchanged
- [ ] `advanceBaseline()` merges newly admitted packages and removes deleted ones
- [ ] `writeAndStage()` writes baseline and runs `git add .dep-fence/baseline.json`
- [ ] All-or-nothing semantics enforced: no partial advancement
- [ ] `--dry-run` and `--enforce` modes skip advancement entirely
- [ ] Unit tests cover delta computation, advancement, and error paths

## Dependencies
- F01 (shared utilities — git.js for staging)
- F02 (lockfile — ResolvedDependency model for delta computation)

## Layering
- utils (F01) -> lockfile model (F02) -> baseline

## Module Scope
- baseline

## Complexity Assessment
- Modules affected: baseline
- New patterns introduced: no — standard read/write/diff pattern
- Architecture review needed: no (covered by ADR-002)
- Design review needed: no

## PM Assumptions (if any)
- `schema_version: 1` is hardcoded for v0.1. v0.2 will introduce schema_version 2 with publisher identity fields.
- `lockfile_hash` uses SHA-256 of the raw lockfile content via `node:crypto`.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-dep-fence-full-spec.md
- Sprint: 1
