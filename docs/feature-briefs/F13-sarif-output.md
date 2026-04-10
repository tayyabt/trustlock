# Feature: [F13] SARIF Output

Keep this artifact concise and deterministic. Fill every required section, but prefer short specific bullets over broad prose.

## Summary

Adds `trustlock check --sarif` to emit a SARIF 2.1.0 JSON document to stdout, enabling GitHub Advanced Security integration via `actions/upload-sarif`. `--sarif` and `--json` are mutually exclusive (C3, D5). Approved packages produce no SARIF results. Depends on F10's JSON schema v2 grouped output being stable.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: `--sarif` is a CI-only output mode consumed by GitHub Advanced Security tooling, not by a human in an interactive session. The GitHub Actions upload step is external to trustlock. No interactive recovery or approval flow is unique to SARIF mode — the developer still uses `trustlock approve` in the same way. The existing blocked-approve workflow covers the human-facing side.
- Target Sprint: 3
- Sprint Rationale: SARIF output maps from the grouped CheckResult structure produced by F10 (JSON schema v2). Must be sequenced after F10's `json.js` schema v2 is stable (C5 — no v1 shim). Can be the last item in Sprint 3.

## Description

`src/output/sarif.js` takes a grouped CheckResult object (produced by F10's `json.js` refactor) and maps it to a valid SARIF 2.1.0 document. The `runs[0].tool.driver.rules` array contains one entry per policy rule: `cooldown`, `provenance`, `scripts`, `sources`, `pinning`, `new-dep`, `transitive`, `publisher-change`. Each blocked finding becomes one `runs[0].results` entry. Admitted packages (including those admitted with valid approvals) produce no results.

`--sarif` is orthogonal to `--enforce`: SARIF goes to stdout, exit code reflects enforce mode normally. Both can be used together. `--json` and `--sarif` are mutually exclusive: if both are passed, exit with `Cannot use --json and --sarif together.` — this gate is enforced in `args.js` (C3, D5).

## User-Facing Behavior

- `trustlock check --sarif` emits a SARIF 2.1.0 JSON document to stdout.
- `trustlock check --sarif --enforce` emits SARIF to stdout and exits 1 if any packages are blocked.
- `trustlock check --json --sarif` exits with `Cannot use --json and --sarif together.`
- Approved packages produce no SARIF results (same admission semantics as terminal/JSON modes).
- All diagnostic output (progress counter, warnings) remains on stderr; stdout is clean SARIF.
- SARIF `locations[0].physicalLocation.artifactLocation.uri` is the lockfile path relative to `projectRoot` (uses F09 path resolution).

## UI Expectations (if applicable)
N/A — CI/machine-readable output only.

## Primary Workflows
- none

## Edge Cases
1. All packages admitted — SARIF `results` array is empty; valid SARIF document with no findings.
2. Package admitted with valid approval — no SARIF result generated for it.
3. Multiple rules fire on one package — one SARIF result entry per finding (not per package).
4. `--sarif` + `--enforce` + all admitted — valid SARIF emitted, exit 0.
5. `--sarif` + `--enforce` + any blocked — valid SARIF emitted, exit 1.
6. `--json --sarif` together — error exit before any processing.
7. `--quiet --sarif` together — `--quiet` suppresses output; SARIF emitted or not? Assume `--quiet` takes precedence and suppresses SARIF too; verify at implementation time.
8. `ruleId` for pip-compile transitive surprise: `transitive` (D10 — same ruleId, `# via` annotation in `message.text`).
9. SARIF `startLine: 1` hardcoded for all results (per spec §3.4 — no line-level precision).
10. Release notes must document schema_version 1 → 2 as a breaking change (C5).

## Acceptance Criteria
- [ ] `trustlock check --sarif` emits valid SARIF 2.1.0 to stdout with correct `tool.driver.name: "trustlock"`.
- [ ] `runs[0].tool.driver.rules` contains one entry per policy rule (all 8 rule names).
- [ ] Each blocked finding produces one `runs[0].results` entry with correct `ruleId`, `level: "error"`, `message.text`, and `artifactLocation.uri`.
- [ ] Admitted packages (including admitted_with_approval) produce no SARIF results.
- [ ] `--sarif` and `--json` together: exits with `Cannot use --json and --sarif together.` (C3, D5).
- [ ] `--sarif --enforce`: SARIF on stdout, exit 1 on any block.
- [ ] `artifactLocation.uri` is lockfile path relative to projectRoot (uses F09 path resolution).
- [ ] All diagnostic output on stderr; stdout is pure SARIF JSON.

## Dependencies
- F10 (output/json.js schema v2 grouped structure — SARIF maps from it; must be stable before this feature)
- F09 (paths.js — lockfile URI is relative to projectRoot)
- F06 (policy engine — same CheckResult model)

## Layering
- `src/output/sarif.js` (new) → `src/cli/commands/check.js` (--sarif flag) → `src/cli/args.js` (mutual exclusion gate for --json and --sarif)

## Module Scope
- output, cli

## Complexity Assessment
- Modules affected: output/sarif.js (new), cli/commands/check.js (--sarif flag integration), cli/args.js (mutual exclusion)
- New patterns introduced: no — maps from existing CheckResult model to a well-specified schema
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- SARIF output scope is `check` only. `audit` does not emit SARIF.
- `--quiet --sarif` interaction: implementation-time decision. PM assumption is `--quiet` takes precedence; if SARIF is needed by a CI consumer, they would not use `--quiet`.
- SARIF `startLine: 1` is hardcoded per spec — no line-level precision is possible from a lockfile perspective.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Spec source: specs/2026-04-10-trustlock-v0.2-v0.4-spec.md §3.4, §5.1
- Sprint: 3
