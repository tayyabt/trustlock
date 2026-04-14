# Review: task-073 — F15-S2 policy/loader.js async entry point and command wiring

## Verdict
**Approved**

## Reviewer
Burnish reviewer-code skill — 2026-04-11

## Artifacts Reviewed
- Story: `docs/stories/F15-S2-loader-async-entry-command-wiring.md`
- Feature brief: `docs/feature-briefs/F15-policy-config-load-order.md`
- Design note: `docs/design-notes/F15-S2-approach.md`
- ADR: `docs/adrs/ADR-005-policy-config-load-order-and-floor-enforcement.md`
- ADR: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- Workflow: `docs/workflows/cli/org-policy-setup.md`
- Source: `src/policy/loader.js`, `src/cli/commands/check.js`, `src/cli/commands/audit.js`, `src/cli/commands/approve.js`, `src/cli/commands/init.js`
- Tests: `test/policy/loader.test.js`
- Integration: `test/integration/cli-e2e.test.js`

## Acceptance Criteria Judgment

| AC | Status | Evidence |
|---|---|---|
| `loader.js` exists, exports `loadPolicy({ configPath, cacheDir, profile })` | PASS | `node --test test/policy/loader.test.js` — 19/19 pass; named async export confirmed |
| `loadPolicy` calls `resolveExtends` when `extends` present; skips when absent | PASS | loader.test: "extends URL → merged config" + "skips resolveExtends when absent" |
| `loadPolicy` calls `applyProfileOverlay` when `--profile` passed; skips when absent | PASS | loader.test: "applies built-in strict/relaxed profile", "user-defined profile", "no profile applied when null" |
| `check.js` awaits `loadPolicy(args)` before delta | PASS | `grep -n "await loadPolicy" src/cli/commands/check.js` → line 81 |
| `audit.js` awaits `loadPolicy(args)` at top | PASS | → line 55 |
| `approve.js` awaits `loadPolicy(args)` at top | PASS | → line 109 |
| `init.js` awaits `loadPolicy(args)` before baseline creation | PASS | → line 151 |
| `cross-audit.js` NOT modified (C-NEW-4) | PASS | `grep -n "loadPolicy" src/cli/commands/cross-audit.js` → no output |
| Header comment documents C-NEW-4 and names four callers | PASS | `loader.js` lines 11–21: all four commands listed; C-NEW-4 rationale documented |
| Integration: extends URL → merged config, org floor enforced | PASS | loader.test: "AC: extends URL → loadPolicy returns merged config with org values floor-enforced" |
| Integration: remote unreachable + no cache → exitCode 2 | PASS | loader.test: "AC: remote unreachable + no cache → loadPolicy rejects with exitCode 2" |
| Integration: no extends + `--profile strict` → correct merged config | PASS | loader.test: "applies built-in strict profile: cooldown_hours = 168" |
| F14 composition: profile floor check against merged (extends+repo) config | PASS | loader.test: "AC: extends URL + --profile strict" + "AC: F14 composition — user profile floor check uses merged config" |
| C-NEW-4 test: static source check verifies cross-audit has no loadPolicy reference | PASS | loader.test: "C-NEW-4: cross-audit.js does not import loadPolicy" |

**All 14 acceptance criteria: PASS.**

## Regression Coverage

- `node --test test/policy/loader.test.js` → 19/19 pass
- `node --test test/integration/cli-e2e.test.js` → 11/11 pass
- Full suite: `node --test` → 754/788 pass; 34 failures are pre-existing on `main` before this task (confirmed by running full suite against `main` with changes stashed → same 34 failures). **Zero regressions introduced.**

## Architecture / ADR Compliance

- **ADR-005:** Three-step merge sequence (repo parse → extends merge via `inherit.js` → profile overlay via `builtin-profiles.js`) correctly implemented and sequenced. Floor checks delegated to `mergePolicy` in `inherit.js` (F15-S1) — per ADR-005 § "Floor enforcement logic lives in loader.js, called at steps 3 and 4" the delegation is correct since `mergePolicy` is the floor-check locus. `applyProfileOverlay` handles profile floor enforcement per ADR-005 step 4.
- **ADR-001 (zero runtime dependencies):** `loader.js` uses only `node:fs/promises` plus peer imports within the project. No external dependencies.

## Callee/Caller Integration Completeness

- `loader.js` ← `./inherit.js` (resolveExtends, mergePolicy): real import, no stub
- `loader.js` ← `./builtin-profiles.js` (applyProfileOverlay, isBuiltinProfile): real import, no stub
- All four commands consume the merged `PolicyConfig` object from `loadPolicy` — not a parallel copy
- `approve.js`: `loadApprovalConfig` removed; pass-through fields (`require_reason`, `max_expiry_days`) survive `normalizePolicyConfig` via `{ ...raw }` spread — verified by loader.test "approval-specific fields pass through normalization"
- `check.js`: manual profile overlay block removed; `hasProvenanceAllWarning` derived correctly from `policy.provenance.required_for.includes('*')` — equivalent to prior signal

## Stub Check

`check-no-stubs.sh` → OK. No runtime stubs, TODOs, or placeholder behavior in critical paths.

## Design Note Honesty

Design note verification results match observed test outcomes. The note correctly documents `node:test` as the runner (the story's verification section mentioned Jest, but the project convention is `node --test` — this is a story artifact artifact inconsistency, not an implementation defect).

## Notable Decisions (accepted without concern)

1. `mergeNested` in `loader.js` uses `{ ...defaults, ...override }` (preserves unknown nested keys, e.g. `block_on_publisher_change` from org policy) rather than `config.js`'s key-filtering approach. Correct and intentional — org policy passthrough is required.
2. `init.js` calls `loadPolicy` but discards the return value — it is a validation checkpoint (catches extends floor violations before baseline work begins). Correct per story and design note.
3. C-NEW-4 test is a static source check rather than a runtime invocation of `audit --compare`. Sufficient: if `cross-audit.js` doesn't import `loadPolicy`, a malformed `extends` key can never reach `loadPolicy` through that path. Story AC is satisfied.

## Reusable Context Updates

No new module guidance or pitfalls emerged that are not already derivable from the code and ADR-005. No module context files updated.

## Findings

None blocking. Implementation is complete, correct, and well-tested.
