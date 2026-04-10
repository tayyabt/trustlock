# Replan Report: trustlock v0.2–v0.3 Spec

**Spec:** `specs/2026-04-10-trustlock-v0.2-v0.4-spec.md`
**Date:** 2026-04-10
**Author:** PM (pm-replan skill)
**Status:** Binding

---

## Context

v0.1 shipped and closed cleanly at end of Sprint 2 (task-043). This replan activates the v0.2–v0.3 spec, which introduces: v0.1 bug fixes (monorepo, progress counter, SLSA framing), a full output/UX redesign, pnpm/yarn lockfile parsers, publisher identity detection, SARIF output, policy profiles (v0.2), Python ecosystem parsers, PyPI adapter, policy inheritance, and cross-project audit (v0.3).

The architecture spec review (task-045) approved the spec with no revision required. Two new ADRs (ADR-005, ADR-006) were written and are available. All 12 carry-forward constraints (C1–C12) are binding on story breakdown.

---

## PRESERVE

### All v0.1 planning and delivery tasks: task-001 through task-043

Every sprint 0–2 task is done. Nothing is in flight. No changes.

| Range | Count | Status |
|---|---|---|
| task-001 – task-012 | 12 | done — planning (product review, arch foundation, feature bounds, story breakdowns) |
| task-013 – task-040 | 28 | done — delivery (all F01–F08 stories) |
| task-041 | 1 | done — bug fix BUG-001 |
| task-042 – task-043 | 2 | done — Sprint 2 docs closeout + sprint closeout |
| task-044 – task-045 | 2 | done — v0.2–v0.3 replan pipeline (product review, arch spec review) |

### Architecture decisions and ADRs

ADR-001 through ADR-006 are all preserved. ADR-005 (Policy Config Load Order) and ADR-006 (Baseline Schema Migration) were written during task-045 and are prerequisites for story breakdown of their respective features.

### Feature inventory document: v0.1 section preserved

`docs/feature-briefs/00-feature-inventory.md` retains F01–F08 rows unchanged. The document is revised below (F09–F17 added).

---

## REVISE

### Feature inventory: add v0.2–v0.3 features (F09–F17)

`docs/feature-briefs/00-feature-inventory.md` must be revised by task-047 (PM_FEATURE_BOUNDARIES) to add the new feature table rows and sprint summary for Sprints 3–4.

**New feature set:**

| Feature ID | Title | Sprint | Arch constraint | v0.2 or v0.3 |
|---|---|---|---|---|
| F09 | Monorepo Root Resolution & CLI Path Flags | 3 | C1 (blocking prerequisite for all v0.2) | v0.2 |
| F10 | Output/UX Redesign | 3 | depends on F09 | v0.2 |
| F11 | Lockfile Parsers: pnpm + yarn | 3 | depends on F09; parallel with F10; C4, C10 | v0.2 |
| F12 | Publisher Identity + Baseline Schema v2 | 3 | depends on F09; atomic with ADR-006; C2 | v0.2 |
| F13 | SARIF Output | 3 | depends on F10 (JSON schema v2 stable); C3, C5 | v0.2 |
| F14 | Policy Profiles | 3 | parallel with parser work once args.js updated; C11 | v0.2 |
| F15 | Policy Config Load Order & Org Policy Inheritance | 4 | ADR-005 prerequisite; C6, C8 | v0.3 |
| F16 | Python Ecosystem: Parsers + PyPI Adapter | 4 | parallel with F15; C7, C12 | v0.3 |
| F17 | Cross-Project Audit | 4 | standalone; no policy evaluation (D6) | v0.3 |

### Sprint structure

- **Sprint 3** — v0.2: F09 (must land first), then F10 + F11 + F12 + F14 in parallel, then F13 after F10 JSON schema v2 is stable.
- **Sprint 4** — v0.3: F15 (policy loader must land before any policy-touching story), F16 (parallel with F15 once registry/client.js interface is stable), F17 (standalone, no policy dependency).

---

## CANCEL

No tasks cancelled. Nothing in flight.

---

## CREATE

The following tasks are required as immediate downstream work. Tasks beyond PM_STORY_BREAKDOWN are not pre-created here — they will be created by each story breakdown task.

### task-047: PM_FEATURE_BOUNDARIES — v0.2–v0.3 features

**Type:** PM_FEATURE_BOUNDARIES
**Sprint:** 3
**Depends on:** task-046 (this task)
**Inputs:**
- spec: `specs/2026-04-10-trustlock-v0.2-v0.4-spec.md`
- product_review: `docs/product-review/2026-04-10-trustlock-v0-2-v0-4-spec.md`
- spec_review: `docs/architecture/spec-reviews/2026-04-10-trustlock-v0-2-v0-4-spec.md`
- existing_inventory: `docs/feature-briefs/00-feature-inventory.md`

**Outputs:**
- updated feature inventory: `docs/feature-briefs/00-feature-inventory.md` (revised F09–F17 added)
- feature briefs: `docs/feature-briefs/F09-monorepo-root-resolution.md` through `docs/feature-briefs/F17-cross-project-audit.md`

**Scope:** Define the 9 features (F09–F17) with dependencies, sprint assignment, module scope, UI-bearing flag, and dependency notes. Observe all C1–C12 constraints from the architecture spec review.

### task-048: ARCH_FEATURE_VALIDATE — v0.2–v0.3 features

**Type:** ARCH_FEATURE_VALIDATE
**Sprint:** 3
**Depends on:** task-047
**Inputs:**
- feature_inventory: `docs/feature-briefs/00-feature-inventory.md` (post task-047 revision)
- feature_briefs: `docs/feature-briefs/F09-*.md` through `docs/feature-briefs/F17-*.md`
- spec: `specs/2026-04-10-trustlock-v0.2-v0.4-spec.md`
- spec_review: `docs/architecture/spec-reviews/2026-04-10-trustlock-v0-2-v0-4-spec.md`

**Outputs:**
- feature validation: `docs/architecture/feature-validations/2026-04-10-trustlock-v0-2-v0-4-spec.md`

**Scope:** Validate feature boundaries against ADR-001 through ADR-006. Confirm C1–C12 constraints are reflected in feature scopes. Flag any feature that would require a new ADR or revision.

### task-049 through task-057: PM_STORY_BREAKDOWN — one per feature

**Type:** PM_STORY_BREAKDOWN (×9)
**Sprint:** 3 (F09–F14) / 4 (F15–F17)
**Depends on:** task-048 (all)

| Task ID | Feature | Module scope |
|---|---|---|
| task-049 | F09 — Monorepo Root Resolution & CLI Path Flags | utils |
| task-050 | F10 — Output/UX Redesign | output |
| task-051 | F11 — Lockfile Parsers: pnpm + yarn | lockfile |
| task-052 | F12 — Publisher Identity + Baseline Schema v2 | registry, baseline |
| task-053 | F13 — SARIF Output | output |
| task-054 | F14 — Policy Profiles | policy |
| task-055 | F15 — Policy Config Load Order & Org Policy Inheritance | policy |
| task-056 | F16 — Python Ecosystem: Parsers + PyPI Adapter | lockfile, registry |
| task-057 | F17 — Cross-Project Audit | cli |

**Inputs per task:** the corresponding feature brief, the spec sections that cover the feature, the spec review constraints for that feature's module, and the architecture ADR set.

**Outputs per task:** story list (story IDs and titles), individual story files at `docs/stories/F{N}-S{N}-*.md`.

---

## Arch Constraints Binding on Story Breakdown

All constraints from the architecture spec review carry directly into story breakdown. Constraint reference for each story breakdown task:

| Constraint | Applies to | Required in acceptance criteria |
|---|---|---|
| C1 | F09 story | paths.js ships before any other v0.2 story closes |
| C2 | F12 story | publisher.js + manager.js schema v2 + npm-registry.js publisherAccount are a single atomic story |
| C3 | F13 story | --json and --sarif are mutually exclusive; enforced in args.js |
| C4 | F11 story | yarn parser reads package.json for dev/prod classification |
| C5 | F13 story | No schema_version 1 backward compat; release notes document breaking change |
| C6 | F15 story | org policy cache at .trustlock/.cache/org-policy.json, separate from registry/cache.js |
| C7 | F16 story | PyPI attestation URL is a named constant, not a string literal; grep check in AC |
| C8 | F15 story | ADR-005 available before framing (it is — written in task-045) |
| C9 | F12 story | ADR-006 available before framing (it is — written in task-045) |
| C10 | F11 story | pnpm workspace filtering via importers section only; no package.json workspaces read |
| C11 | F14 story | built-in relaxed bypasses floor enforcement; user-defined relaxed does not |
| C12 | F16 story | uv source.path entries excluded entirely; verified in AC |

---

## Product Decisions Binding on Story Breakdown

From the product review (D1–D16), the following are non-obvious and must appear explicitly in story acceptance criteria:

| Decision | Applies to | Story requirement |
|---|---|---|
| D1 | F09/F10 | check progress counter fires at ≥5 packages needing metadata fetch |
| D2 | F11/F16 | Dev deps subject to all admission rules identically |
| D3, C12 | F16 | uv source.path excluded from checks and audit output |
| D4, C5 | F10/F13 | schema_version 2 only; no v1 shim |
| D5, C3 | F13 | --json and --sarif mutually exclusive; error exit |
| D6 | F17 | audit --compare: lockfile read only, no policy evaluation, always exits 0 |
| D7, C10 | F11 | pnpm workspace = importer-key matching only, not package.json workspaces |
| D9 | F10 | "Commit this file" reminder: terminal mode only, not --json |
| D10 | F16 | pip-compile # via annotation → message.text enrichment; ruleId = transitive |
| D11 | n/a | trustlock clean deferred to v0.4; do not include in any v0.2–v0.3 story |
| D12 | F14 | relaxed profile: reduces cooldown below 72h default and does not require provenance |
| D15 | F12 | publisher null + upgrade: warn, never block; record new publisher |

---

## Dependency Graph (v0.2)

```
F09 (paths.js) ─────────────────────────────────── blocking prerequisite
    │
    ├── F10 (output redesign) ─── F13 (SARIF, needs JSON schema v2 stable)
    │
    ├── F11 (pnpm/yarn parsers) ─ parallel with F10
    │
    ├── F12 (publisher identity + baseline v2) ─ parallel with F10/F11
    │
    └── F14 (policy profiles) ─── parallel with F11/F12 once args.js updated
```

## Dependency Graph (v0.3)

```
F15 (policy loader + inheritance) ─ must land before any policy-touching v0.3 story
F16 (Python parsers + PyPI) ──────── parallel with F15 once registry/client.js stable
F17 (cross-project audit) ────────── standalone, no dependency on F15 or F16
```

---

## Out-of-Scope Confirmations

The following are explicitly deferred beyond v0.3 and must not appear in any story breakdown for Sprints 3–4:

- Cargo / crates.io — v0.4
- `trustlock diff`, `trustlock why` — v0.4
- CycloneDX SBOM generation — v0.4
- Shell completions and man page — v0.4
- `trustlock clean` command — v0.4+ (D11)
- GitHub App / PR bot — not in scope
- Automatic allowlist curation — not in scope
- Go modules (go.sum) — v0.5+
- `.npmrc` / private registry support — deferred
- Workspace auto-detection from `package.json` workspaces field — v0.3 (noted in spec §3.6 as v0.3; do not include in v0.2 stories)
- Hosted trust intelligence API — v0.5+

---

## Metadata

- Agent: pm-replan
- Date: 2026-04-10
- Task: task-046
- Spec: 2026-04-10-trustlock-v0.2-v0.4-spec.md
