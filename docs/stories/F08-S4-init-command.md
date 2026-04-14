# Story: F08-S4 — `init` Command

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Implement `trustlock init` — the cross-cutting onboarding command that creates the project configuration file, the `.trustlock/` directory scaffold, and the initial trust baseline from the current lockfile. This story covers the init-onboarding workflow in full.

## Scope
**In scope:**
- `src/cli/commands/init.js` — full implementation (replace stub from F08-S1)
- Creating `.trustlockrc.json` with default policy configuration
- Creating `.trustlock/` directory structure: `approvals.json` (empty array), `.cache/`, `.gitignore`
- Lockfile detection: auto-detect `package-lock.json` in the current directory
- Building the initial baseline: parse lockfile → fetch provenance from registry → write `baseline.json`
- `--strict` flag: write a stricter default `.trustlockrc.json` (provenance required for top packages)
- `--no-baseline` flag: skip baseline creation entirely (write directory scaffold only)
- Trusting all current packages by default (D6: error if `.trustlock/` already exists)
- Final summary message and next-step guidance

**Not in scope:**
- `install-hook` — separate story (F08-S5)
- `--force` flag (nice-to-have per PM assumptions; deferred — user deletes `.trustlock/` manually)
- Registry caching during init (cache is freshly created here, so cache-first only applies to subsequent runs)

## Entry Points
- Route / page / screen: `trustlock init [--strict] [--no-baseline]`
- Trigger / navigation path: Manual one-time setup by policy owner or developer
- Starting surface: `src/cli/index.js` routes `init` → `commands/init.js`

## Wiring / Integration Points
- Caller-side ownership: `index.js` already routes to the init stub (F08-S1); this story replaces the stub — no changes to `index.js` needed
- Callee-side ownership: This story owns wiring to all sprint 1 modules:
  - `src/lockfile/parser.js` (F02): `parseLockfile(path)` — detect and parse `package-lock.json`
  - `src/registry/client.js` (F03): `fetchMetadata(packages)` — provenance for all current packages
  - `src/baseline/manager.js` (F04): `createBaseline(packages)`, `writeBaseline(baseline)` — build and write initial baseline
  - `src/approvals/store.js` (F05): `createEmptyStore()` — initialize `approvals.json`
- Caller-side conditional rule: `index.js` already exists; wire callee to it now (stub replacement)
- Callee-side conditional rule: All sprint 1 modules are complete; wire to real APIs now — no mocking
- Boundary / contract check: After `trustlock init` runs, `trustlock check` must work without errors (verified in F08-S6 integration test)
- Files / modules to connect: `init.js` → lockfile parser, registry client, baseline manager, approvals store
- Deferred integration: `install-hook` deferred to F08-S5; full round-trip test deferred to F08-S6

## Not Allowed To Stub
- Lockfile parser — must be real; fail hard on unknown versions (Q1: exit 2, no best-effort)
- Registry client — must be real; registry unreachable during init creates baseline with null provenance fields and prints warning (not exit 2)
- Baseline manager `writeBaseline` — must be real; `baseline.json` must be a valid, complete baseline after init
- Approvals store init — must be real; `approvals.json` must be `[]` after init
- `.trustlock/.gitignore` creation — must be real and must gitignore the `.cache/` directory (D8)

## Behavioral / Interaction Rules
- **D6 (init fails if .trustlock/ exists):** Exit 2 with "trustlock is already initialized. Delete `.trustlock/` to reinitialize."
- **C3 (cross-cutting):** This command depends on ALL sprint 1 modules being complete and correct
- **`--trust-current` is the default** — no explicit flag; trusting all current packages is always the init behavior
- **`--strict`:** write `.trustlockrc.json` with `provenance.required: true` and higher default thresholds instead of permissive defaults
- **`--no-baseline`:** create directory scaffold and `.trustlockrc.json` but do NOT parse lockfile or write `baseline.json`; print "Skipped baseline creation. Run `trustlock audit` to review your dependency posture before running `trustlock check`."
- No lockfile: exit 2, "No lockfile found. Run `npm install` first to generate package-lock.json."
- Registry unreachable: create baseline with `provenance: null` fields, print warning per package
- Empty lockfile (0 dependencies): baseline created with empty `packages` object; summary shows "Baselined 0 packages"
- Summary message: `"Baselined N packages. Detected npm lockfile vX. Next: run 'trustlock install-hook' to enable the pre-commit hook."`

## Acceptance Criteria
- [ ] `trustlock init` creates `.trustlockrc.json` in project root with valid default policy
- [ ] `trustlock init` creates `.trustlock/` containing `approvals.json` (`[]`), `.cache/` directory, `.gitignore` (caching `.cache/`, D8)
- [ ] `trustlock init` creates `.trustlock/baseline.json` with all current packages trusted
- [ ] `trustlock init` prints "Baselined N packages. Detected npm lockfile vX." with correct counts
- [ ] `trustlock init` when `.trustlock/` already exists exits 2 with "already initialized" message (D6)
- [ ] `trustlock init` with no lockfile exits 2 with "No lockfile found" message
- [ ] `trustlock init` with unknown lockfile version exits 2 (Q1 — fail hard)
- [ ] `trustlock init --strict` creates `.trustlockrc.json` with stricter policy thresholds
- [ ] `trustlock init --no-baseline` creates scaffold and config but not `baseline.json`
- [ ] `trustlock init` with registry unreachable creates baseline (with null provenance) and prints warning

## Task Breakdown
1. Implement `src/cli/commands/init.js` — guard: check `.trustlock/` existence (D6), detect lockfile
2. Write `.trustlockrc.json` with default or `--strict` policy config
3. Create `.trustlock/` directory, `approvals.json`, `.cache/`, `.gitignore` (D8)
4. Implement baseline creation: parse lockfile → fetch provenance → write `baseline.json` (skip when `--no-baseline`)
5. Handle registry-unreachable during init: null provenance, warning per package
6. Print summary and next-step guidance
7. Write unit tests for: happy path, already-initialized guard, no-lockfile guard, unknown-version guard, `--strict`, `--no-baseline`, registry-unreachable

## Verification
```bash
# In a temporary directory with a package-lock.json
node src/cli/index.js init
# Expected: "Baselined N packages. Detected npm lockfile v3. Next: run 'trustlock install-hook' ..."

ls .trustlock/
# Expected: approvals.json  .cache/  .gitignore  baseline.json

node -e "console.log(JSON.parse(require('fs').readFileSync('.trustlockrc.json', 'utf8')))"
# Expected: valid policy config object

node src/cli/index.js init; echo $?
# Expected (second run): "trustlock is already initialized.", exits 2

node src/cli/index.js init --no-baseline
# Expected: scaffold created, no baseline.json written

node --test test/unit/cli/init.test.js
# Expected: all tests pass
```

## Edge Cases to Handle
- `.trustlock/` already exists: exit 2 (D6)
- No lockfile found: exit 2
- Unknown lockfile version: exit 2, fail hard (Q1)
- Registry unreachable: create baseline with null provenance, print warning (not exit 2)
- Empty dependency tree (0 packages): baseline with empty `packages` object, "Baselined 0 packages"
- `--no-baseline`: skip lockfile parsing and baseline write entirely

## Dependencies
- Depends on: F08-S1 (routing stub must exist)
- Blocked by: F02 (lockfile parser), F03 (registry client), F04 (baseline manager), F05 (approvals store) — ALL sprint 1 modules must be complete (C3)

## Effort
L — cross-cutting integration of all sprint 1 modules; multiple error states; registry degradation handling

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P0

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
Format:
### [ISO date] [Agent]: [Action]
[Details]
-->
