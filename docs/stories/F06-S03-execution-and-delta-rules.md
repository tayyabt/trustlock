# Story: F06-S03 — Execution & Delta Rules

## Parent
F06: Policy Engine & Rules

## Description
Implement the four execution and delta rules as pure functions: `scripts.js` (execution:scripts), `sources.js` (execution:sources), `new-dependency.js` (delta:new-dependency), and `transitive-surprise.js` (delta:transitive-surprise). The two delta rules produce warning-severity findings — they are informational and never cause a block regardless of approval state.

## Scope
**In scope:**
- `src/policy/rules/scripts.js` — `execution:scripts` rule
- `src/policy/rules/sources.js` — `execution:sources` rule
- `src/policy/rules/new-dependency.js` — `delta:new-dependency` rule (warning severity)
- `src/policy/rules/transitive-surprise.js` — `delta:transitive-surprise` rule (warning severity, hardcoded threshold 5)
- Unit tests for each rule: admit, block/warn, and edge cases from the feature brief

**Not in scope:**
- Trust-signal rules (provenance, cooldown, pinning) — those are F06-S02
- Engine orchestration — F06-S04
- Registry HTTP calls — registry data is a pre-fetched argument

## Entry Points
- Route / page / screen: N/A — pure functions
- Trigger / navigation path: Called by `engine.js` (F06-S04) with pre-fetched data for each changed dependency
- Starting surface: `src/policy/rules/scripts.js`, `sources.js`, `new-dependency.js`, `transitive-surprise.js`

## Wiring / Integration Points
- Caller-side ownership: `engine.js` (F06-S04) calls each rule — that file does not exist yet. Keep the seam explicit: each rule exports a named `evaluate` function matching the contract below.
- Callee-side ownership: This story implements all four rule functions with the exact contract the engine expects.
- Caller-side conditional rule: Engine (caller) does not exist yet — keep seam explicit. Same contract as S02: `evaluate(dependency: ResolvedDependency, baseline: TrustProfile | null, registryData: RegistryMetadata, policy: PolicyConfig): Finding[]`
- Callee-side conditional rule: `PolicyConfig` and `Finding` are imported from `src/policy/models.js` (F06-S01, which must land first).
- Boundary / contract check: Unit tests confirm each rule returns `Finding[]` with correct `rule`, `severity`, `message`, and `detail`. Warning-severity findings (new-dep, transitive-surprise) have `severity: "warning"`. Blocking findings (scripts, sources) have `severity: "error"`.
- Files / modules to connect: `src/policy/rules/*.js` ← `src/policy/models.js` (import `Finding`)
- Deferred integration, if any: Engine wiring deferred to F06-S04.

## Not Allowed To Stub
- `scripts.js` must implement real allowlist checking. The `hasInstallScripts` field on `ResolvedDependency` is `null` for npm v1/v2 lockfiles — when null, the rule must check `registryData.hasInstallScripts`. When `registryData` is also null, treat as skipped (registry unreachable), not block.
- `sources.js` must inspect the `resolved` URL field from `ResolvedDependency` and detect `git+`, `http:`, `https://` non-registry hosts, `file:` schemes explicitly. A package resolved from the standard npm registry URL is always allowed.
- `new-dependency.js` must return `severity: "warning"` (not `"error"`) — never causes a block in the decision layer.
- `transitive-surprise.js` must use the hardcoded threshold of 5 for v0.1. Threshold configurability is deferred. Must count only NEW transitive packages (not in baseline) added by upgrading one direct dependency.

## Behavioral / Interaction Rules
- `delta:new-dependency` and `delta:transitive-surprise` are informational only — `severity: "warning"`. The decision layer in F06-S04 must never block on warning-severity findings, but these rules do not need to know that — they just return the finding with the correct severity.
- `execution:scripts` allowlist check: if a package IS in `scripts.allowlist`, return `[]` (admit). If it is NOT in the allowlist and has install scripts, return a block finding.
- `execution:sources` allowed sources are declared in `policy.sources.allowed` (e.g., `["registry"]`). Non-registry schemes like `git+`, `file:`, `http://` (non-npm-registry) are blocked if `"registry"` is the only allowed type and the resolved URL uses a different scheme.
- `transitive-surprise.js`: the `delta` argument must carry the new-transitive count per direct dep. If this field is not populated (engine hasn't computed it yet), the rule returns `[]` — it does NOT infer transitives itself.

## Acceptance Criteria
- [ ] `scripts.js`: returns blocking finding for a package with install scripts not in `scripts.allowlist`; returns `[]` for packages in the allowlist; returns `[]` (or `severity: "skipped"`) when `hasInstallScripts` is null and `registryData` is null.
- [ ] `scripts.js`: correctly handles npm v3 lockfile `hasInstallScripts: true` (uses lockfile value) vs. v1/v2 `hasInstallScripts: null` (falls back to registry data).
- [ ] `sources.js`: returns blocking finding for packages resolved via `git+`, `file:`, or non-registry `http`/`https` URLs when the policy does not allow that source type; returns `[]` for standard npm registry URLs.
- [ ] `new-dependency.js`: returns `severity: "warning"` finding for packages with no baseline record (new packages); returns `[]` for packages that exist in baseline.
- [ ] `transitive-surprise.js`: returns `severity: "warning"` finding when new-transitive count > 5 for a direct dep upgrade; returns `[]` when count ≤ 5 or no new transitives.
- [ ] All four rules return `Finding[]` with correct `rule`, `severity`, `message`, and `detail` fields.
- [ ] Unit tests for all four rules cover: admit case, block/warn case, and edge cases noted above.

## Task Breakdown
1. Create `src/policy/rules/scripts.js` — implement allowlist check; handle `hasInstallScripts: null` with registry fallback; treat null registry as skipped.
2. Create `src/policy/rules/sources.js` — parse `dependency.resolved` URL; detect non-registry schemes; compare against `policy.sources.allowed`.
3. Create `src/policy/rules/new-dependency.js` — check whether `dependency.name` exists in `baseline`; if not, return `severity: "warning"` finding.
4. Create `src/policy/rules/transitive-surprise.js` — read `delta.newTransitiveCount` (or equivalent field); if > 5, return `severity: "warning"` finding; hardcode threshold at 5.
5. Write `test/policy/rules/scripts.test.js`, `sources.test.js`, `new-dependency.test.js`, `transitive-surprise.test.js` with fixture data.

## Verification
```
node --test test/policy/rules/scripts.test.js
node --test test/policy/rules/sources.test.js
node --test test/policy/rules/new-dependency.test.js
node --test test/policy/rules/transitive-surprise.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- `scripts.js`: npm v1/v2 lockfile `hasInstallScripts: null` — fall back to `registryData.hasInstallScripts`; if also null (registry unreachable) → skipped, not block
- `sources.js`: scoped packages (`@scope/pkg`) resolved from standard registry → not blocked
- `new-dependency.js`: baseline is empty (first run after init) → all packages are "new"; this is expected — all produce warning findings
- `transitive-surprise.js`: threshold is hardcoded 5 — do not read from policy config (deferred to v0.2)

## Dependencies
- Depends on: F06-S01 (imports `Finding`, `PolicyConfig` from `src/policy/models.js`) — can proceed in parallel with F06-S02
- Blocked by: F06-S01 task

## Effort
M — four rule implementations; scripts and sources have non-obvious null-handling requirements

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: 3

---

## Run Log

Everything above this line is the spec. Do not modify it after story generation (except to fix errors).
Everything below is appended by agents during execution.

<!-- Developer and Reviewer append dated entries here:
- Verification results (pass/fail, output)
- Revision history (what was flagged, what was fixed)
- Exploratory findings (unexpected issues, new pitfalls discovered)
- QA observations (edge cases found during testing that weren't in the spec)

Format:
### [ISO date] [Agent]: [Action]
[Details]

- Include the exact verification commands that ran, the outcome (`PASS`, `FAIL`, or `DEFERRED`), and any follow-up verification task created from review.
-->
