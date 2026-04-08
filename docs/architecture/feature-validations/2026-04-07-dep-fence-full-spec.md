# Feature Validation: 2026-04-07-dep-fence-full-spec

## Verdict

**APPROVED** — no architectural blockers. All 8 features (F01–F08) are consistent with the system overview, data model, and ADRs. Story breakdown may proceed with the constraints listed below.

## Validated Scope

- Features: F01–F08 (8 features across 2 sprints)
- ADRs: ADR-001 (zero deps), ADR-002 (baseline advancement), ADR-003 (registry caching), ADR-004 (lockfile parser)
- Workflows: init-onboarding, check-admit, blocked-approve
- Architecture artifacts: system-overview.md, data-model.md

## Approved Boundaries

### Module Layering — Confirmed
The feature boundaries respect the declared layer order:
```
utils (F01) -> lockfile (F02) / registry (F03) / approvals (F05) -> baseline (F04) -> policy (F06) / output (F07) -> cli (F08)
```
No feature crosses a layer boundary or introduces a circular dependency. F02, F03, and F05 are true leaf modules with no cross-dependencies — they can be built and tested in parallel.

### ADR Compliance — Confirmed
- ADR-001: All features use only Node.js built-ins. F01 implements semver subset and ANSI constants manually. F03 uses `node:https`. No runtime dependencies introduced.
- ADR-002: F04 implements all-or-nothing advancement (D1) with auto-staging via `git add`. F08 enforces D10 (CI read-only) via `--enforce` flag.
- ADR-003: F03 implements cache-first with TTL and three-tier degradation (fresh → stale → skipped). Cache directory gitignored (D8).
- ADR-004: F02 implements router pattern (`parser.js`) with format-specific parser (`npm.js`). Common model in `models.js`. Fail-hard on unknown versions (Q1).

### Data Model Alignment — Confirmed
- `ResolvedDependency` (data-model.md) produced by F02, consumed by F04 and F06.
- `TrustProfile` and `Baseline` owned by F04.
- `Approval` owned by F05.
- `CheckResult` and `DependencyDelta` owned by F06.
- `PolicyConfig` loaded by F06.
- No entity is split across feature boundaries. Each entity has a single owning feature.

### Sprint Sequencing — Confirmed
- Sprint 1 (F01–F05): all data-layer modules with no upward dependencies. Can begin immediately.
- Sprint 2 (F06–F08): policy, output, and CLI. All sprint 2 features correctly depend on sprint 1 outputs.
- F06 and F07 can be built in parallel within sprint 2 (no cross-dependency).

### Workflow Coverage — Confirmed
- All three workflows (init-onboarding, check-admit, blocked-approve) map to F08 and correctly reference upstream modules.
- Workflow data flows match the system overview data flow descriptions.
- No workflow references a module outside the declared feature boundaries.

### Preview Requirements — Confirmed
No features require UI previews. All features are CLI-only with terminal/JSON output. Preview task creation is not needed.

## Constraints for Story Breakdown

These constraints must be preserved during story breakdown to maintain architectural integrity.

### C1: F02 models.js must ship in the first F02 story
`ResolvedDependency` (defined in `src/lockfile/models.js`) is imported by F04 (delta computation) and F06 (evaluation pipeline). The first F02 story must deliver the model definition so that F04 work can begin without waiting for parser implementation to complete.

### C2: F06 pinning rule requires package.json loading
The pinning rule (exposure:pinning) reads `package.json` to detect range operators — it does not use the lockfile for this check (F06 edge case #8). This is not in any other feature's scope. F06 stories must include `package.json` loading as part of the pinning rule story, not assume it comes from another module.

### C3: F08 init command is a cross-cutting integration point
The `init` command touches F02 (lockfile parsing), F03 (provenance fetching for baseline), F04 (baseline creation), and F05 (approvals file initialization). Story breakdown must sequence the init command story after all sprint 1 modules are complete. It cannot be partially implemented against incomplete sprint 1 features.

### C4: System overview diagram layout vs. actual layering
The system overview diagram places the Output layer visually below the data modules (Lockfile, Registry, Baseline, Approvals). This is a layout choice, not a dependency declaration. The actual dependency is: CLI depends on Output; Output depends only on Utils (F01). Story breakdown should not read the diagram as implying data→output dependencies.

## Gap Flagged (Non-Blocking)

### G1: init command flag scope — PM decision needed
The `init-onboarding` workflow documents three flags (`--trust-current`, `--strict`, `--no-baseline`) that do not appear in F08's acceptance criteria. Story breakdown must reconcile this:
- If in scope: add acceptance criteria and size stories accordingly.
- If deferred: note them as v0.2 and remove from workflow doc or mark as future.

This is a PM scoping decision, not an architectural concern. It does not block story breakdown from starting — the PM can resolve this during or before story breakdown for the init command story.

## Blocked Areas

None.

## Required Follow-Up

- PM to resolve G1 (init flag scope) before or during F08 story breakdown.

## Metadata
- Agent: architect
- Date: 2026-04-08
- Task: task-004
- Spec: 2026-04-07-dep-fence-full-spec
