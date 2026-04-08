# Feature Inventory — dep-fence v0.1

This is the planning index for the current feature set.

## Features

| Feature ID | Title | Sprint | Dependencies | UI-Bearing | Preview Required | Notes |
|------------|-------|--------|--------------|------------|------------------|-------|
| F01 | Project Scaffolding & Shared Utilities | 1 | none | no | no | package.json, bin, utils (semver, time, git) |
| F02 | Lockfile Parsing (npm) | 1 | F01 | no | no | npm v1/v2/v3, common model, format detection |
| F03 | Registry Client & Caching | 1 | F01 | no | no | HTTP client, npm adapter, provenance, cache, offline degradation |
| F04 | Baseline Management | 1 | F01, F02 | no | no | read/write/create/advance baseline, delta, auto-stage |
| F05 | Approval Store & Validation | 1 | F01 | no | no | CRUD approvals, expiry, command generation |
| F06 | Policy Engine & Rules | 2 | F02, F03, F04, F05 | no | no | 7 rules, evaluation pipeline, all-or-nothing |
| F07 | Output Formatting | 2 | F01 | no | no | terminal (colored) + JSON formatters |
| F08 | CLI Commands, Integration & Documentation | 2 | F06, F07 | no | no | 6 commands, arg parsing, hook install, docs, examples |

## Sprint Summary
- Sprint 0: planning — feature boundaries, architecture validation, story breakdown
- Sprint 1: data foundation — independently testable infrastructure modules (lockfile, registry, baseline, approvals, utils)
- Sprint 2: policy, output, CLI — business logic, formatting, command integration, docs, examples; produces the shippable npm package

## Dependency Notes
- F02 (lockfile) and F03 (registry) are leaf data modules with no cross-dependency — can be built in parallel
- F04 (baseline) depends on F02 for the ResolvedDependency model and delta computation
- F05 (approvals) is a leaf module — no dependency on lockfile or registry
- F06 (policy) is the integration point: depends on all four data modules (F02, F03, F04, F05)
- F07 (output) is a leaf formatting module — depends only on shared utils from F01
- F08 (CLI) is the top-level wiring layer: depends on F06 and F07, transitively on everything
- Layer order: utils (F01) -> lockfile (F02) / registry (F03) / approvals (F05) -> baseline (F04) -> policy (F06) / output (F07) -> cli (F08)

## Metadata
- Agent: pm-feature-boundaries
- Date: 2026-04-08
