# Architecture Spec Review: trustlock v0.2–v0.3 Spec

**Spec:** `specs/2026-04-10-trustlock-v0.2-v0.4-spec.md`
**Date:** 2026-04-10
**Reviewer:** architect-spec-review
**Status:** Approved with constraints

---

## Verdict

The spec is architecturally sound and can proceed to feature framing. Two new ADRs were written to resolve missing decisions that would otherwise block v0.3 story breakdown. No ARCH_REVISION is required. All constraints are carry-forward for PM.

---

## ADR Alignment

| ADR | Status | Notes |
|---|---|---|
| ADR-001 Zero Runtime Dependencies | **Aligned** | pnpm YAML and uv TOML parsers are hand-rolled as required. The ADR's v0.2 "reconsider" option is now closed — hand-roll is the decision. |
| ADR-002 Baseline Advancement | **Aligned** | Schema v2 migration (publisher identity) does not conflict with the all-or-nothing advance rule. No change to advancement semantics. |
| ADR-003 Registry Caching | **Aligned** | Publisher identity uses the same `GET /{name}/{version}` endpoint already cached per ADR-003. No new cache domain for package metadata. Org policy cache is separate (see ADR-005). |
| ADR-004 Lockfile Parser Architecture | **Aligned** | The spec explicitly anticipated adding `pnpm.js`, `yarn.js`, `requirements.js`, and `uv.js` to the router. Format detection branches extend cleanly. |
| ADR-005 Policy Config Load Order | **New — written this review** | Covers `extends` merge order, profile overlay, floor enforcement, async resolution, and org policy cache. Required before any policy-inheritance story. |
| ADR-006 Baseline Schema Migration | **New — written this review** | Covers lazy v1→v2 migration, publisher fetch during check, failure handling. Required before publisher-identity story breakdown. |

---

## Module Boundary Analysis

### New in v0.2 — no conflicts

- `src/lockfile/pnpm.js` — fits ADR-004 router. Scoped-package key-path decoding (`/@scope/name/version` in v5/v6, `@scope/name@version` in v9) requires careful string parsing; the spec is correct that general YAML is not needed.
- `src/lockfile/yarn.js` — fits ADR-004 router. Yarn `languageName: unknown` exclusion must be in the parser (not the policy engine), since it is a lockfile-format artifact.
- `src/registry/publisher.js` — wraps existing `registry/client.js` fetch; extracts `_npmUser.name` from the already-fetched version metadata object. No new HTTP endpoint.
- `src/output/sarif.js` — orthogonal to `terminal.js` and `json.js`. `--sarif` and `--json` are mutually exclusive (D5); enforced in `args.js`.
- `src/utils/paths.js` — resolves `projectRoot` and `gitRoot` at startup. This is the dependency root for all v0.2 work. Every command must call `paths.js` before any file or git operation.
- `src/utils/progress.js` — stderr only. `--json` stdout is unaffected. TTY detection via `process.stderr.isTTY`.

### Modified in v0.2 — required care

- `src/utils/git.js` — must accept explicit `gitRoot` parameter. The implicit cwd assumption must be removed from all git operations. All callers updated in the same change.
- `src/baseline/manager.js` — schema v2 migration (see ADR-006). The migration adds an async registry fetch during the delta phase — this fetch occurs *before* rule evaluation and uses the existing cache-first strategy.
- `src/registry/npm-registry.js` — must extract `publisherAccount` (`_npmUser.name`) from the existing version fetch response. No additional HTTP call. Field added to the returned metadata object.
- `src/output/terminal.js` — significant rewrite to grouped structure (blocked, admitted_with_approval, new_packages, admitted). The `publisher-change` elevated treatment (⚠ marker, Verify line) is hardcoded for that rule only.
- `src/output/json.js` — schema_version 2 only (D4). No backward compat shim.

### New in v0.3 — dependencies to note

- `src/policy/loader.js` — new async policy load entry point (see ADR-005). All commands must await this before evaluation.
- `src/policy/inherit.js` — `extends` URL fetch + cache at `.trustlock/.cache/org-policy.json`. Does NOT use `src/registry/cache.js` — standalone file-based cache.
- `src/policy/builtin-profiles.js` — built-in `strict` and `relaxed` constants.
- `src/registry/pypi.js` — new registry adapter. Cache key namespace must be `pypi/{name}/{version}` to avoid collision with npm cache entries. Attestation endpoint must not be hardcoded (see constraint C7 below).
- `src/cli/commands/cross-audit.js` — new command implementing `audit --compare`. Reads lockfiles and baselines only; no policy evaluation; always exits 0 (D6).

---

## Feasibility Assessment

### Confirmed feasible, no rework required

- pnpm YAML hand-rolled parser — scope is narrow and correctly defined.
- uv TOML hand-rolled parser — `[[package]]` array-of-tables and inline tables are achievable with line-by-line parsing.
- SARIF 2.1.0 output — structure is well-specified, all fields map directly to the existing CheckResult model.
- Policy profiles — shallow-merge semantics are simple; the complexity is in floor enforcement, which ADR-005 resolves.
- Cross-project audit — lockfile-read only, no policy evaluation; architecturally trivial.

### Confirmed feasible with noted implementation constraints

- **Publisher identity fetch** — uses existing version endpoint, no extra network call. Constraint: `npm-registry.js` must extract `_npmUser.name` in the same fetch that reads provenance data, not a separate call.
- **Remote `extends` fetch** — async at policy-load time. Constraint: the entire policy load must complete before delta computation. `loadPolicy` is async; all commands must `await` it.
- **Baseline schema v2 migration** — lazy migration (ADR-006). Constraint: for changed packages with null publisherAccount, fetch old version publisher before rule evaluation, not during.

### Items requiring implementation-time verification

- **PyPI attestation endpoint** — do not hardcode. The spec correctly defers to implementation-time PyPI API documentation check (PEP 740 / Simple API v1+json). `pypi.js` must use a named constant for the attestation endpoint, not a string literal.
- **yarn berry `dependenciesMeta[pkg].built: true`** — verify this is present in the lockfile vs. requiring a registry fallback. If the field is absent, fall back to registry API per spec; the registry fallback must still respect ADR-003 cache-first.

---

## Sequencing Constraints (for PM story breakdown)

### v0.2 — internal ordering

1. **`paths.js` (monorepo root resolution) is the blocking prerequisite.** All other v0.2 stories depend on `projectRoot`/`gitRoot`. Story for `paths.js` must complete (and all command callers updated) before any other v0.2 story ships.
2. **Output redesign and lockfile parsers are independent.** Once `paths.js` is done, terminal output rewrite and pnpm/yarn parsers can proceed in parallel.
3. **Publisher identity depends on baseline schema v2.** `publisher.js` and the migration in `manager.js` must be implemented together in one story — the migration and the comparison logic are coupled.
4. **SARIF depends on the new JSON output grouping.** `sarif.js` maps from the grouped CheckResult structure; implement after `json.js` schema_version 2 is stable.
5. **Policy profiles are self-contained after `args.js` gains `--profile`.** Can proceed in parallel with parser work once `args.js` is updated.

### v0.3 — cross-feature ordering

1. **`policy/loader.js` (ADR-005) must be integrated before any v0.3 feature that touches policy loading.** Python ecosystem work and cross-audit are independent of it, but `extends` and profiles story must ship first among policy stories.
2. **PyPI adapter is independent of policy inheritance.** Can proceed in parallel once the `registry/client.js` interface is stable.
3. **`cross-audit.js` is a standalone feature** with no dependencies on v0.3 policy or Python work. Can be framed earliest.

---

## Carry-Forward Constraints for PM

**C1 — v0.2 story prerequisite:** `paths.js` must be story-0 of v0.2. No other v0.2 story can close without it shipping first.

**C2 — Publisher identity is one story:** `publisher.js` + `manager.js` schema v2 migration + `npm-registry.js` `publisherAccount` extraction are a single atomic story. They must not be split across sprints.

**C3 — `--json` and `--sarif` are mutually exclusive:** Enforced in `args.js` (exit with `Cannot use --json and --sarif together.`). Must appear in the SARIF story acceptance criteria.

**C4 — yarn lockfile requires `package.json` read for dev/prod classification.** This is a new I/O input not in the v0.1 data flow. The yarn parser story must list `package.json` as an additional input alongside `yarn.lock`.

**C5 — No schema_version 1 backward compat (D4).** v0.2 release notes must document this breaking change. Any consumer of the JSON output must migrate to schema_version 2.

**C6 — Org policy cache is standalone.** `inherit.js` manages its own file at `.trustlock/.cache/org-policy.json`. It does NOT use `src/registry/cache.js`. Story acceptance criteria must verify the two cache paths are separate.

**C7 — PyPI attestation endpoint must not be hardcoded.** `pypi.js` must define the attestation URL as a named constant, not a string literal in a fetch call. Acceptance criteria must include a grep check confirming no hardcoded PyPI attestation URL.

**C8 — ADR-005 is a prerequisite for the `extends` policy inheritance story.** PM must not frame inheritance stories until ADR-005 is in the ADR index. (ADR-005 was written in this review and is now available.)

**C9 — ADR-006 is a prerequisite for the publisher identity story.** PM must not frame the publisher-identity story until ADR-006 is in the ADR index. (ADR-006 was written in this review and is now available.)

**C10 — pnpm workspace filtering in v0.2 is lockfile-level only (D7).** The pnpm parser reads `importers` section and filters by projectRoot match. No `package.json` workspaces field is read in v0.2. Story acceptance criteria must not include workspace auto-detection.

**C11 — Built-in `relaxed` profile bypasses floor enforcement; user-defined `relaxed` does not.** The floor check in ADR-005 must distinguish built-in profiles from user-defined profiles by source. Acceptance criteria for the profiles story must test both cases.

**C12 — `source.path` in uv.lock entries are excluded entirely** from admission checks and audit output (D3). The uv parser must mark these as `source: file` and the policy engine must skip `source: file` entries. Acceptance criteria must verify uv `source.path` entries produce no output.

---

## New ADRs Written

| ADR | Title | Why written |
|---|---|---|
| ADR-005 | Policy Config Load Order and Floor Enforcement | No existing ADR covered the three-layer merge order (`extends` → repo → profile), async resolution, floor enforcement semantics, or org policy cache isolation. Required before v0.3 story breakdown. |
| ADR-006 | Baseline Schema Migration Strategy | No existing ADR covered schema migration or the novel requirement to fetch old-version publisher metadata during a check run. Required before the publisher-identity story. |

---

## Metadata
- Agent: architect-spec-review
- Date: 2026-04-10
- Task: task-045
- Spec: 2026-04-10-trustlock-v0.2-v0.4-spec.md
