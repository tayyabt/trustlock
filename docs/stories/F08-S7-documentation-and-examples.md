# Story: F08-S7 — Documentation and Example Files

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Write the project documentation and example files after all CLI commands are implemented and integration tests pass. Documentation must accurately reflect the final command interface, policy options, and architecture as built — not as originally planned.

## Scope
**In scope:**
- `README.md` — project overview, quick start, command summary, links to detailed docs
- `USAGE.md` — full command reference (all 6 commands, all flags, all exit codes)
- `POLICY-REFERENCE.md` — every `.trustlockrc.json` option with type, default, and description
- `ARCHITECTURE.md` — design decisions, module map, data flow for `check` and `init`
- `examples/configs/production.trustlockrc.json` — strict production policy example
- `examples/configs/relaxed.trustlockrc.json` — permissive policy for greenfield projects
- `examples/ci/github-actions.yml` — GitHub Actions workflow running `trustlock check --enforce`
- `examples/ci/lefthook.yml` — Lefthook configuration
- `examples/ci/husky/.husky/pre-commit` — Husky pre-commit hook configuration

**Not in scope:**
- API documentation (trustlock has no public API)
- v0.2 features (SARIF, pnpm/yarn, monorepo)
- Man pages or shell completions

## Entry Points
- Route / page / screen: Documentation files at the project root and `examples/`
- Trigger / navigation path: Developers navigate to these files after installation or from GitHub
- Starting surface: `README.md` is the primary landing document

## Wiring / Integration Points
- Caller-side ownership: Documentation references all CLI commands by their final implemented interface; must match the real `args.js` argument schema exactly
- Callee-side ownership: This story does not wire code; it accurately documents the contracts that were implemented in F08-S1 through F08-S5
- Caller-side conditional rule: All commands are implemented (F08-S1 through S5 are done); documentation is written to match what exists, not what was planned
- Callee-side conditional rule: N/A (documentation only)
- Boundary / contract check: Every `trustlock <command>` invocation shown in documentation must work against the real implementation (verified by running the examples)
- Files / modules to connect: Documentation references `src/cli/args.js` for the authoritative flag schema; `ARCHITECTURE.md` references the actual module files
- Deferred integration: none

## Not Allowed To Stub
- Command examples in documentation — every `trustlock` command shown must be runnable and produce the documented output
- Policy option table in `POLICY-REFERENCE.md` — must be complete; no "TBD" entries
- Exit codes in `USAGE.md` — must match the actual implementation (0/1/2 contract)
- CI workflow files — must be syntactically valid (GitHub Actions YAML must parse, lefthook.yml must parse)

## Behavioral / Interaction Rules
- `README.md` quick start must cover the three primary workflows: onboarding, check-admit, blocked-approve
- `USAGE.md` must document all edge-case behaviors (no lockfile, already initialized, etc.) that developers will encounter
- `POLICY-REFERENCE.md` must document every configurable field in `.trustlockrc.json` with: key path, type, default, allowed values, and description
- `ARCHITECTURE.md` should reference the actual module files (`src/lockfile/`, `src/registry/`, etc.) and the data flow diagrams from `system-overview.md`
- Example configs must be valid JSON (production) and `relaxed` must have clearly annotated comments explaining each relaxed setting
- CI example files must include the `--enforce` flag and set the correct Node.js version (>=18.3)

## Acceptance Criteria
- [ ] `README.md` exists with: project overview, installation instructions, quick start for all three primary workflows, link to `USAGE.md` and `POLICY-REFERENCE.md`
- [ ] `USAGE.md` exists with: all 6 commands documented, all flags, exit codes (0/1/2), and key error messages
- [ ] `POLICY-REFERENCE.md` exists with: complete table of all `.trustlockrc.json` options (no TBD entries)
- [ ] `ARCHITECTURE.md` exists with: module map, data flow for `trustlock check` and `trustlock init`
- [ ] `examples/configs/production.trustlockrc.json` is valid JSON and represents a strict policy
- [ ] `examples/configs/relaxed.trustlockrc.json` is valid JSON with annotated permissive settings
- [ ] `examples/ci/github-actions.yml` is valid YAML and runs `trustlock check --enforce` with Node.js >=18.3
- [ ] `examples/ci/lefthook.yml` is valid YAML
- [ ] `examples/ci/husky/.husky/pre-commit` is a valid shell script
- [ ] All `trustlock` command examples in `README.md` and `USAGE.md` run successfully against the real implementation

## Task Breakdown
1. Write `README.md` — overview, install, quick start for three workflows, links
2. Write `USAGE.md` — full command reference, all flags, exit codes, error messages
3. Write `POLICY-REFERENCE.md` — complete option table from `.trustlockrc.json` schema
4. Write `ARCHITECTURE.md` — module map, data flows
5. Create `examples/configs/production.trustlockrc.json`
6. Create `examples/configs/relaxed.trustlockrc.json`
7. Create `examples/ci/github-actions.yml`
8. Create `examples/ci/lefthook.yml`
9. Create `examples/ci/husky/.husky/pre-commit`
10. Smoke-test all `trustlock` commands shown in the documentation against the real implementation

## Verification
```bash
# Validate JSON examples
node -e "JSON.parse(require('fs').readFileSync('examples/configs/production.trustlockrc.json', 'utf8')); console.log('valid')"
node -e "JSON.parse(require('fs').readFileSync('examples/configs/relaxed.trustlockrc.json', 'utf8')); console.log('valid')"

# Validate YAML (requires js-yaml or Python, or use a CI linter)
python3 -c "import yaml; yaml.safe_load(open('examples/ci/github-actions.yml'))" && echo "valid"
python3 -c "import yaml; yaml.safe_load(open('examples/ci/lefthook.yml'))" && echo "valid"

# Smoke-test key commands from README
node src/cli/index.js --help || node src/cli/index.js; echo "router works"
```

## Edge Cases to Handle
- Documentation must cover the `--dry-run` flag (not in v0.1 CI examples but important for developer testing)
- `USAGE.md` must document the "already initialized" error for `init` (D6)
- `POLICY-REFERENCE.md` must document `require_reason` and `max_expiry_days` fields used by the approve command

## Dependencies
- Depends on: F08-S6 (integration tests must pass — commands must be stable before documenting)
- Blocked by: none beyond F08-S6

## Effort
M — high word count but no code complexity; risk is documentation drift from implementation

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: P1

---

## Run Log

<!-- Developer and Reviewer append dated entries here:
Format:
### [ISO date] [Agent]: [Action]
[Details]
-->
