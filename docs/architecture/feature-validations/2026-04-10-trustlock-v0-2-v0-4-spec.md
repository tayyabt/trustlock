# Feature Validation: 2026-04-10-trustlock-v0.2-v0.4-spec

## Verdict

**APPROVED with constraints** — no architectural blockers. All 9 features (F09–F17) are consistent with the system overview, data model, and ADRs (ADR-001 through ADR-006). Story breakdown may proceed with the constraints listed below. Four new constraints (C-NEW-1 through C-NEW-4) are binding on story breakdown in addition to the 12 carry-forward constraints from the spec review (C1–C12).

---

## Validated Scope

- Features: F09–F17 (9 features across Sprints 3–4)
- ADRs: ADR-001 through ADR-006 (all six; ADR-005 and ADR-006 written during task-045)
- Carry-forward constraints: C1–C12 (from `docs/architecture/spec-reviews/2026-04-10-trustlock-v0-2-v0-4-spec.md`)
- Product decisions: D1–D16 (from `docs/product-review/2026-04-10-trustlock-v0-2-v0-4-spec.md`)
- Replan: `docs/replanning/2026-04-10-trustlock-v0-2-v0-4-spec.md`
- Architecture artifacts: system-overview.md, data-model.md, ADR-001 through ADR-006

---

## Approved Boundaries

### Module Layering — Confirmed

The v0.2–v0.3 features extend the existing layer order without introducing violations or circular dependencies:

```
utils (F01, F09) 
  ↓
lockfile (F02, F11, F16.parsers) / registry (F03, F12, F16.pypi) / approvals (F05)
  ↓
baseline (F04, F12)
  ↓
policy (F06, F14, F15) / output (F07, F10, F13)
  ↓
cli (F08, F17)
```

- F09 (`paths.js`) is correctly positioned in utils — the lowest layer. All v0.2 stories depend on it.
- F10 (`output/terminal.js`, `output/json.js`, `utils/progress.js`) spans output and utils — both correct tiers.
- F11 (`lockfile/pnpm.js`, `lockfile/yarn.js`) is correctly in the lockfile layer.
- F12 (`registry/publisher.js`, `baseline/manager.js`, `registry/npm-registry.js`) spans registry and baseline — both correct tiers.
- F13 (`output/sarif.js`) is in the output layer — correct.
- F14 (`policy/builtin-profiles.js`, profile overlay in policy loader) is in the policy layer — correct.
- F15 (`policy/loader.js`, `policy/inherit.js`) is in the policy layer — correct.
- F16 (`lockfile/requirements.js`, `lockfile/uv.js`, `registry/pypi.js`) spans lockfile and registry — both correct tiers.
- F17 (`cli/commands/cross-audit.js`) is in the cli layer — correct; reads lockfile parsers and reads `.trustlockrc.json` directly (not via policy loader — see C-NEW-4).

No feature crosses upward through a lower layer. No circular dependency is introduced.

### ADR Compliance — Confirmed

| ADR | Feature(s) | Compliance |
|---|---|---|
| ADR-001 (zero runtime deps) | F11 pnpm YAML, F11 yarn custom format, F16 requirements.txt, F16 uv TOML | All parsers are hand-rolled using Node.js built-ins only. Confirmed in all four feature briefs. |
| ADR-002 (baseline advancement) | F12 (schema v2) | Lazy migration does not alter the all-or-nothing advancement rule. F12 brief and ADR-006 confirm: schema v2 entries are written only on advance, and advancement semantics are unchanged. |
| ADR-003 (registry caching) | F12, F16 | F12: publisher fetch uses existing cache-first path for `GET /{name}/{version}`. F16: pypi.js uses the same file-based cache with `pypi/{name}/{version}` key namespace to prevent collision. Both confirmed in briefs and spec review. |
| ADR-004 (lockfile parser architecture) | F11, F16 | pnpm.js, yarn.js, requirements.js, uv.js all slot into the format-detection router in `src/lockfile/index.js`. Format detection extends by lockfile filename (and `lockfileVersion` for pnpm; `__metadata` presence for yarn berry). Confirmed. |
| ADR-005 (policy config load order) | F14, F15 | F14 implements profile overlay and floor enforcement per the three-step merge order in ADR-005. F15 creates `loader.js` as the async entry point that owns the full merge sequence. C8 (ADR-005 is prerequisite) is satisfied. |
| ADR-006 (baseline schema migration) | F12 | Lazy migration, fetch only on changed packages, warn-never-block on null publisherAccount, cache-first for old-version fetch. All confirmed in F12 brief and AC. C9 (ADR-006 is prerequisite) is satisfied. |

### Carry-Forward Constraint Compliance — Confirmed

All 12 constraints from the architecture spec review are reflected in the feature briefs:

| Constraint | Feature | Reflection |
|---|---|---|
| C1 — F09 is blocking prerequisite | All F10–F14 | All Sprint 3 briefs list F09 as a dependency. |
| C2 — F12 is atomic (publisher.js + manager.js + npm-registry.js) | F12 | AC item 7 explicitly states the three components must ship as one story. |
| C3 — `--json` and `--sarif` are mutually exclusive | F10, F13 | F10 puts the mutual exclusion gate in `args.js`. F13 AC item 5 tests the error. |
| C4 — yarn parser reads package.json for dev/prod | F11 | AC item 5 confirms; PM assumptions note it. |
| C5 — no schema_version 1 backward compat | F10, F13 | F10 JSON output is schema_version 2 only. F13 edge case 10 calls for release notes. |
| C6 — org policy cache is standalone | F15 | AC item 8 explicitly tests cache path and confirms no routing through `registry/cache.js`. |
| C7 — PyPI attestation URL as named constant | F16 | AC item 6 includes a grep check confirming no hardcoded URL string literal. |
| C8 — ADR-005 prerequisite for F15 | F15 | ADR-005 is written and available. F15 brief confirms. |
| C9 — ADR-006 prerequisite for F12 | F12 | ADR-006 is written and available. F12 brief confirms. |
| C10 — pnpm workspace via importers only | F11 | AC item 2 confirms; PM assumptions note that `package.json` workspaces field is deferred. |
| C11 — built-in `relaxed` bypasses floor; user-defined does not | F14 | AC items 3–5 cover all three cases. |
| C12 — uv source.path excluded entirely | F16 | AC item 3 confirms; edge case 4 confirms. |

### Sprint Sequencing — Confirmed

**Sprint 3 (v0.2):**
- F09 must land first. F10, F11, F12, F14 are correctly blocked on F09 in all four briefs.
- F10 and F11 and F12 and F14 can proceed in parallel once F09 ships — correctly stated.
- F13 depends on F10's JSON schema v2 being stable — correctly stated.
- F14 must not couple its floor enforcement logic to `loader.js` (Sprint 4). F14 brief explicitly notes this decoupling requirement.

**Sprint 4 (v0.3):**
- F15 (`loader.js`) must land before any policy-touching v0.3 story — correctly stated. F16 and F17 are independent of F15.
- F16 is parallel with F15 once `registry/client.js` interface is stable — correctly stated.
- F17 is standalone with no dependency on F15 or F16 — correctly stated.

### Workflow Coverage — Confirmed

| Feature | Workflow Required | Coverage |
|---|---|---|
| F09 | No — CLI infrastructure change only | Existing command workflows cover the surface change (adding `--project-dir`). Correct. |
| F10 | Yes — blocked-approve and check-admit flows change | F10 brief lists `blocked-approve.md` and `check-admit.md` as requiring update. |
| F11 | No — parser change is invisible to user | Correct. |
| F12 | No — publisher-change block surfaces via F10's blocked-approve workflow | Correct. F10's workflow update covers the elevated `⚠` treatment. |
| F13 | No — CI-only output mode with no interactive flow | Correct. |
| F14 | No — config flag addition with no new interaction pattern | Correct. |
| F15 | Yes — org-policy-setup is a new admin flow | F15 brief documents `org-policy-setup` workflow. |
| F16 | No — parser change is invisible to user; init-onboarding workflow covers Python init identically to npm | Correct. |
| F17 | No — passive informational command with no side effects | Correct. |

### Preview Requirements — Confirmed

No features in F09–F17 require UI previews. All features are CLI-only. Preview task creation is not required for any Sprint 3 or Sprint 4 story.

---

## New Constraints for Story Breakdown

These constraints are additions to the C1–C12 carry-forward set. All are binding on the relevant story breakdown tasks.

### C-NEW-1: F11 yarn install scripts — lockfile parser must NOT import registry

**Applies to:** task-051 (F11 story breakdown)

The F11 brief states that when `dependenciesMeta[pkg].built` is absent from a yarn berry lockfile, the check "falls back to registry API (ADR-003 cache-first)". This registry fallback must NOT be implemented inside `src/lockfile/yarn.js`.

**Rationale:** Lockfile parsers (ADR-004) sit in the same layer as the registry client. Importing `src/registry/client.js` from within `src/lockfile/yarn.js` would create a same-layer cross-dependency that violates the data-layer peer isolation established in the v0.1 architecture. The lockfile module's job is to parse the lockfile and produce `ResolvedDependency[]`; it does not make network calls.

**Required pattern:** `yarn.js` sets `hasInstallScripts: null` for packages where `dependenciesMeta[pkg].built` is absent. The policy engine (F06, step 5a of the check flow), which already fetches registry metadata for every changed package, resolves `hasInstallScripts: null` using the registry-fetched metadata before applying the scripts rule. Story breakdown for F11 must confirm this pattern and update F06's scripts rule evaluation to handle `null` as "unknown, check registry metadata".

**AC addition required in F11 story:** `src/lockfile/yarn.js` does not import any module from `src/registry/`. The `null` value for `hasInstallScripts` is the contract signal to the policy engine.

### C-NEW-2: F14 profile overlay must be designed for clean composition with F15

**Applies to:** task-054 (F14 story breakdown)

F14 ships in Sprint 3 (synchronous) and F15 ships in Sprint 4 (async `loader.js`). F15 must incorporate F14's profile overlay logic without a full rewrite. To enable this, F14's implementation must export the floor enforcement logic and profile merge as standalone functions in `builtin-profiles.js` (or a peer module), so `loader.js` can import and call them in step 4 of the ADR-005 merge sequence.

**Specifically required from F14:**
- `src/policy/builtin-profiles.js` exports built-in profile constants AND the profile overlay function as named exports.
- Floor enforcement for profile overlay is a pure function: `applyProfileOverlay(mergedConfig, profileName, profiles, isBuiltin)` → returns the overlaid config or throws with the required error message.
- `check.js` (Sprint 3) calls this function directly. `loader.js` (Sprint 4) replaces that direct call by importing and calling the same exported function.

**AC addition required in F14 story:** Profile overlay and floor enforcement are exported as named functions from `builtin-profiles.js` (or an explicitly named policy utility). The implementation is callable from both `check.js` (Sprint 3) and `loader.js` (Sprint 4) without modification.

### C-NEW-3: F16 registry routing — ecosystem dispatch must be explicit

**Applies to:** task-056 (F16 story breakdown)

`src/registry/pypi.js` is a new adapter parallel to `src/registry/npm-registry.js`. The check flow (step 5a in system-overview.md) fetches registry metadata for each changed package. With F16, that step must dispatch to the correct adapter based on the package ecosystem.

**Required pattern:** The `ResolvedDependency` model (from F02) must include an `ecosystem: 'npm' | 'pypi'` field (or equivalent). The registry client facade (`registry/client.js`) routes to `npm-registry.js` or `pypi.js` based on this field. The file-based cache (ADR-003) is shared; cache key namespacing (`pypi/{name}/{version}`) handles collision prevention.

**AC addition required in F16 story:** (a) `ResolvedDependency` includes an `ecosystem` discriminant field. (b) `registry/client.js` dispatches to `pypi.js` for `ecosystem: 'pypi'` entries. (c) A test verifies that fetching a pypi package does not collide with an npm package of the same name and version in the cache.

### C-NEW-4: F17 must NOT call `loadPolicy()`

**Applies to:** task-057 (F17 story breakdown)

`trustlock audit --compare` reads `.trustlockrc.json` from each project directory to extract `scripts.allowlist` for the allowlist comparison section (D6). It must read the file directly using `fs.readFile` and parse the JSON — it must NOT call `loadPolicy()` (F15's async loader).

**Rationale:** `loadPolicy()` triggers the full async merge sequence: `extends` fetch (potentially a network call to a remote URL), repo merge, profile overlay, and floor enforcement. `audit --compare` is a passive read-only command that must not trigger network fetches for each compared directory. Calling `loadPolicy()` for N directories would introduce N potential remote fetches — contrary to the command's always-exit-0, no-side-effects contract.

**AC addition required in F17 story:** `cross-audit.js` reads `.trustlockrc.json` files directly via `fs.readFile`. `loadPolicy()` is not called. A test confirms that a directory with a malformed `extends` URL in `.trustlockrc.json` does not cause an error or network call during `--compare`.

---

## Gaps Flagged (Non-Blocking)

### G-NEW-1: Feature inventory document not updated to include F09–F17

`docs/feature-briefs/00-feature-inventory.md` was not updated by task-047. It still reflects only F01–F08 (date: 2026-04-08). The individual feature brief files (F09–F17) exist and are the authoritative source for story breakdown. The inventory file is documentation only.

**Required follow-up:** Any story breakdown task that references the inventory should use the individual feature brief files (F09–F17.md) as the authoritative source. The inventory document should be updated during or after story breakdown to include F09–F17 rows and the Sprint 3–4 summary from the replan doc.

### G-NEW-2: F13 `--quiet --sarif` interaction is unresolved

F13 edge case 7 notes that the `--quiet --sarif` interaction is an "implementation-time decision" with a PM assumption that `--quiet` takes precedence and suppresses SARIF output. This must not remain unresolved at story breakdown time — an undecided behavior in acceptance criteria creates a gap in CI integration tests.

**Required follow-up:** Story breakdown for F13 (task-053) must document the chosen behavior explicitly in the AC: either `--quiet` suppresses SARIF (SARIF consumers must not use `--quiet`) or `--quiet` does not suppress SARIF (stdout is clean SARIF even with `--quiet`). The PM assumption (suppress) is architecturally acceptable — it just must be explicit.

---

## Blocked Areas

None. No feature in F09–F17 requires a new ADR or an architecture revision. ADR-005 and ADR-006, written during task-045, cover all new patterns introduced in this feature set.

---

## Required Follow-Up

| Item | Owner | Binding on |
|---|---|---|
| C-NEW-1 (yarn install scripts — no registry import from lockfile module) | story breakdown (task-051) | F11 story AC |
| C-NEW-2 (F14 profile overlay exports for F15 composition) | story breakdown (task-054) | F14 story AC |
| C-NEW-3 (F16 ecosystem dispatch in registry/client.js) | story breakdown (task-056) | F16 story AC |
| C-NEW-4 (F17 must not call loadPolicy) | story breakdown (task-057) | F17 story AC |
| G-NEW-1 (feature inventory update) | any story breakdown task or housekeeping | documentation only |
| G-NEW-2 (F13 --quiet --sarif behavior must be explicit in AC) | story breakdown (task-053) | F13 story AC |

---

## Metadata
- Agent: architect-feature-validate
- Date: 2026-04-10
- Task: task-048
- Spec: 2026-04-10-trustlock-v0.2-v0.4-spec.md
- Features validated: F09–F17 (9 features, Sprints 3–4)
