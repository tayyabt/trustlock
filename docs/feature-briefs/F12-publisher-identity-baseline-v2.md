# Feature: [F12] Publisher Identity + Baseline Schema v2

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Introduces the `trust-continuity:publisher` rule, which blocks upgrades where the npm publishing account changes between versions. Requires storing `publisherAccount` in the baseline (schema v2) and a lazy v1→v2 migration strategy. `publisher.js`, `manager.js` schema v2 migration, and `npm-registry.js` field extraction are one atomic story (C2, ADR-006).

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Publisher-change blocks surface in the existing blocked-approve workflow (updated in F10). No new interaction pattern — the user receives a block, reads the elevated output with `⚠`, decides to investigate or approve. The workflow doc updated in F10 covers this. No standalone publisher-specific workflow artifact is needed.
- Target Sprint: 3
- Sprint Rationale: Publisher identity is a core v0.2 trust rule. Depends on F09 (paths.js) and on the existing registry client (F03) and baseline manager (F04). Independent of output redesign (F10) and lockfile parsers (F11); can proceed in parallel. ADR-006 is already written (task-045).

## Description

`src/registry/publisher.js` wraps the existing `registry/client.js` fetch to extract `_npmUser.name` from the already-fetched version metadata object. This is not a new HTTP endpoint — the field is present in the existing `GET /{name}/{version}` response (ADR-003). `npm-registry.js` must extract and return `publisherAccount` as part of its standard metadata object.

`src/baseline/manager.js` is updated to schema v2: `publisherAccount: string | null` is added to each Trust Profile object. `null` means the baseline entry pre-dates v2 (v1 migration). The migration is lazy: packages that are changing in the current check run trigger a fetch of the baseline version's `_npmUser.name` before rule evaluation. Packages not changing in the current run keep `publisherAccount: null` until they next change.

The blocking rule: if `provenance.block_on_publisher_change: true` (default true) and both old and new publishers are known and differ → block. If old publisher is `null` → warn only, record new publisher (D15).

## User-Facing Behavior

- On version upgrade where publisher changes: `publisher-change` rule fires; package appears in BLOCKED section with `⚠` marker and "Verify the change is legitimate before approving." (per F10's output redesign).
- On version upgrade where old publisher is `null` (first upgrade post-migration): stderr warning `Could not compare publisher — no prior record for this package`. Package not blocked. New publisher recorded.
- `_npmUser.name` is extracted in the same fetch that reads provenance data — no additional HTTP call per package.
- `publisherAccount` stored in baseline; visible if a user inspects `baseline.json` directly.
- `block_on_publisher_change: false` in policy config disables blocking (still warns and records).

## UI Expectations (if applicable)
N/A — CLI-only feature.

## Primary Workflows
- none

## Edge Cases
1. Package where publisher is `null` in old version (v1 baseline, not yet migrated): emit warning, record new publisher, no block (D15).
2. Package where publisher is `null` in both old and new (neither has ever been fetched): emit warning, no block.
3. Package where `_npmUser.name` is absent from registry response: treat as `null`; no block; warning.
4. `block_on_publisher_change: false` in config: rule fires, records publisher change, emits warning, does not block.
5. Registry fetch for baseline version fails (network error): treat as `null`; warn; do not block.
6. Publisher changes back to original account on next upgrade: rule fires again (new publisher != current baseline publisher); block or warn as per config.
7. v1 baseline entry for a package that is NOT changing in the current run: `publisherAccount` remains `null`; no migration triggered.
8. v1 baseline entry for a package that IS changing: fetch old-version publisher before rule evaluation (ADR-006); uses cache-first strategy.
9. pnpm/yarn packages: same `publisher.js` logic applies; npm registry endpoint is the same.
10. `block_on_publisher_change` key absent from config: defaults to `true`.

## Acceptance Criteria
- [ ] `npm-registry.js` extracts `_npmUser.name` from existing version fetch response; returned as `publisherAccount` in metadata object.
- [ ] `baseline/manager.js` schema v2: `publisherAccount` field present on all TrustProfile objects; `null` for unmigrated entries.
- [ ] For changed packages with v1 baseline entry: old-version publisher fetched before rule evaluation (ADR-006 lazy migration).
- [ ] Publisher change (both known, differ): package blocked with `publisher-change` rule; `⚠` in output (via F10 output contract).
- [ ] Old publisher null: stderr warning emitted; no block; new publisher recorded in baseline.
- [ ] `block_on_publisher_change: false`: no block; change recorded; warning emitted.
- [ ] `publisher.js` + `manager.js` + `npm-registry.js` changes shipped as a single story (C2); not split.
- [ ] No additional HTTP call per package beyond the existing `GET /{name}/{version}`.

## Dependencies
- F09 (paths.js)
- F03 (registry client — existing npm-registry.js to extract new field)
- F04 (baseline manager — schema v2 migration)
- ADR-006 (baseline schema migration strategy — prerequisite, already written in task-045)

## Layering
- `src/registry/publisher.js` (new) + `src/registry/npm-registry.js` (field extraction) + `src/baseline/manager.js` (schema v2 + lazy migration) — all in one atomic story (C2)

## Module Scope
- registry, baseline

## Complexity Assessment
- Modules affected: registry/publisher.js (new), registry/npm-registry.js (modified), baseline/manager.js (schema v2 + migration)
- New patterns introduced: yes — lazy schema migration triggered by changed-package check run
- Architecture review needed: no (ADR-006 covers the migration strategy)
- Design review needed: no

## PM Assumptions (if any)
- Publisher identity extraction uses `_npmUser.name` from the `GET /{name}/{version}` response — the same endpoint that already provides provenance data. No new endpoint.
- The v1→v2 migration is lazy (per ADR-006). A bulk migration job is not in scope.
- `publisherAccount: null` for old version + upgraded → warn, never block (D15). This is intentional to avoid false positives on first upgrade.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §3.3, §5.2
- Sprint: 3
