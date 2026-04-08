# Story: F06-S02 — Trust & Exposure Rules

## Parent
F06: Policy Engine & Rules

## Description
Implement the three trust-signal rules as pure functions in `src/policy/rules/`: `provenance.js` (trust-continuity:provenance), `cooldown.js` (exposure:cooldown), and `pinning.js` (exposure:pinning). The pinning rule owns `package.json` loading — that responsibility is not assumed from any other module (constraint C2 from the feature validation).

## Scope
**In scope:**
- `src/policy/rules/provenance.js` — `trust-continuity:provenance` rule
- `src/policy/rules/cooldown.js` — `exposure:cooldown` rule (with `clears_at` UTC timestamp per D4)
- `src/policy/rules/pinning.js` — `exposure:pinning` rule (reads `package.json` directly via `node:fs/promises`)
- Unit tests for each rule: should-admit, should-block, edge cases from the feature brief

**Not in scope:**
- `execution:scripts`, `execution:sources`, `delta:new-dependency`, `delta:transitive-surprise` — those are F06-S03
- Engine orchestration — F06-S04
- Registry HTTP calls — registry data arrives as a pre-fetched argument; this story does not call the registry client

## Entry Points
- Route / page / screen: N/A — pure functions, no UI
- Trigger / navigation path: Each rule function is called by the engine (`engine.js`) with pre-fetched data
- Starting surface: `src/policy/rules/provenance.js`, `src/policy/rules/cooldown.js`, `src/policy/rules/pinning.js`

## Wiring / Integration Points
- Caller-side ownership: `engine.js` (F06-S04) calls each rule — that file does not exist yet. Keep the seam explicit: each rule file exports a named function matching the contract below.
- Callee-side ownership: This story implements all three rule functions with the exact contract the engine expects.
- Caller-side conditional rule: Engine (caller) does not exist yet — keep seam explicit. Contract: `evaluate(dependency: ResolvedDependency, baseline: TrustProfile | null, registryData: RegistryMetadata, policy: PolicyConfig): Finding[]`
- Callee-side conditional rule: `PolicyConfig` and `Finding` are imported from `src/policy/models.js` (F06-S01, which must land first).
- Boundary / contract check: Unit tests confirm each rule returns `Finding[]` with correct `rule`, `severity`, `message`, and `detail` fields. Tests confirm admit (empty array) and block cases.
- Files / modules to connect: `src/policy/rules/*.js` ← `src/policy/models.js` (import `Finding`); `src/policy/rules/pinning.js` ← `node:fs/promises` (read `package.json`)
- Deferred integration, if any: Engine wiring deferred to F06-S04.

## Not Allowed To Stub
- Each rule must be a real implementation — no placeholder that always returns `[]` or always blocks.
- `provenance.js` must implement the regression check: package HAD attestation in baseline AND does NOT have attestation now → block. A package in `required_for` that has never had provenance is also a block (required ≠ regression, see feature brief edge case #5).
- `cooldown.js` must compute actual package age from `publishedAt` and include the exact UTC `clears_at` timestamp in `finding.detail` (D4 — non-negotiable UX requirement).
- `pinning.js` must read `package.json` from the filesystem — not from the lockfile, not from registry data (C2). It must check both `dependencies` and `devDependencies` for range operators (`^`, `~`, `>`, `>=`, `<`, `<=`, `*`, `x`).
- All rule signatures must exactly match the engine contract so F06-S04 can wire them without modification.

## Behavioral / Interaction Rules
- A rule that produces no findings means "admit" for that rule — return `[]`, not `null`.
- `severity` must be `"error"` for blocking findings; rules in this story (provenance, cooldown, pinning) are all blocking.
- If registry data is unavailable for a registry-dependent check (provenance, cooldown), the rule annotates the finding as `severity: "skipped"` with `message: "skipped: registry unreachable"` — it does NOT block (feature brief edge case #6).
- `cooldown.js` `clears_at` must be an ISO 8601 UTC string, e.g. `"2026-04-10T14:32:00.000Z"`.
- `pinning.js` reads `package.json` from the project root (same directory as `package-lock.json`). The path is passed as part of the `policy` or as a separate argument — the exact signature is the implementor's choice, but it must be deterministic and testable.

## Acceptance Criteria
- [ ] `provenance.js`: returns blocking finding when a package had attestation in baseline and no longer has it; returns `[]` (admit) when attestation is present or was never present and not in `required_for`; blocks when package is in `required_for` and has no attestation (even with no baseline record).
- [ ] `provenance.js`: returns `severity: "skipped"` finding when registry data is null/unavailable — does not block.
- [ ] `cooldown.js`: returns blocking finding with `detail.clears_at` (ISO 8601 UTC) when package age < `cooldown_hours`; returns `[]` when age ≥ threshold.
- [ ] `cooldown.js`: returns `severity: "skipped"` finding when `publishedAt` is unavailable — does not block.
- [ ] `pinning.js`: reads `package.json` (not lockfile) and returns blocking finding for each production/dev dependency with a range operator (`^`, `~`, `*`, etc.) when `pinning.required = true`; returns `[]` when all ranges are exact versions or policy is disabled.
- [ ] All three rules return `Finding[]` with correct `rule`, `severity`, `message`, and `detail` fields.
- [ ] Unit tests for each rule cover: admit case, block case, registry-unavailable case (provenance, cooldown), range-detection cases for pinning.

## Task Breakdown
1. Create `src/policy/rules/provenance.js` — implement `evaluate(dependency, baseline, registryData, policy): Finding[]`; check `required_for` list and baseline attestation state; handle null registry data gracefully.
2. Create `src/policy/rules/cooldown.js` — calculate age `now - publishedAt`; compute `clears_at = publishedAt + cooldown_hours * 3600000`; format as ISO UTC; handle null `publishedAt` as skipped.
3. Create `src/policy/rules/pinning.js` — read `package.json` via `node:fs/promises`; detect range operators in `dependencies` and `devDependencies`; return block findings for floating ranges when `pinning.required` is true.
4. Write `test/policy/rules/provenance.test.js`, `test/policy/rules/cooldown.test.js`, `test/policy/rules/pinning.test.js` with fixture data covering all AC cases.

## Verification
```
node --test test/policy/rules/provenance.test.js
node --test test/policy/rules/cooldown.test.js
node --test test/policy/rules/pinning.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Provenance: package in `required_for` with no baseline record and no attestation → block (required ≠ regression; feature brief edge case #5)
- Provenance: registry unreachable → annotate as skipped, do not block (feature brief edge case #6)
- Cooldown: `publishedAt` null (registry unreachable or field missing) → skipped, do not block
- Cooldown: `clears_at` must be exact UTC timestamp (D4)
- Pinning: range operators checked on `dependencies` AND `devDependencies` — not just production deps
- Pinning: only checks packages with a range operator; exact versions (`1.2.3`) are fine

## Dependencies
- Depends on: F06-S01 (must land first — imports `Finding`, `PolicyConfig` from `src/policy/models.js`)
- Blocked by: F06-S01 task

## Effort
M — three rule implementations, each with registry-data-null handling; pinning owns package.json loading

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: 2

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
