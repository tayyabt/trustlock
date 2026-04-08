# Story: F06-S01 — Policy Config & Data Models

## Parent
F06: Policy Engine & Rules

## Description
Implement `src/policy/config.js` and `src/policy/models.js`. Config loads and validates `.depfencerc.json`, merging caller-provided values with hardcoded defaults. Models defines the `PolicyConfig`, `Finding`, and `CheckResult` shapes that every other F06 story imports — this file must land before any rule or engine work begins.

## Scope
**In scope:**
- `src/policy/config.js` — `loadPolicy(configPath)` → `PolicyConfig`
- `src/policy/models.js` — `PolicyConfig`, `Finding`, `CheckResult`, and `DependencyCheckResult` shape definitions
- Unit tests covering load success, missing file, malformed JSON, default merging, and unknown rule name handling

**Not in scope:**
- Rule implementations (F06-S02, F06-S03)
- Engine orchestration (`engine.js`, `decision.js`) — F06-S04
- Formatting or output — that is the output module's job (F07)

## Entry Points
- Route / page / screen: N/A — CLI backend module
- Trigger / navigation path: Called by the CLI `check` command via `engine.evaluate()`
- Starting surface: `src/policy/config.js` exports `loadPolicy(configPath: string) → Promise<PolicyConfig>`

## Wiring / Integration Points
- Caller-side ownership: CLI (`src/cli/commands/check.js`) will call `loadPolicy()` — that caller does not exist yet (F08). Keep the seam explicit: export `loadPolicy` with a clear signature.
- Callee-side ownership: This story implements `loadPolicy()` and the shared model definitions entirely.
- Caller-side conditional rule: Caller does not exist yet — keep seam explicit. The expected contract is `loadPolicy(configPath: string): Promise<PolicyConfig>`. The caller is expected to pass an absolute path; error handling is surfaced via thrown errors with a `.exitCode = 2` property.
- Callee-side conditional rule: N/A — this story is the callee for all future F06 stories and F08.
- Boundary / contract check: Unit tests confirm that `loadPolicy()` returns a fully merged `PolicyConfig` on a valid file, throws with `.exitCode = 2` on missing file, and throws with `.exitCode = 2` on malformed JSON.
- Files / modules to connect: `src/policy/config.js` ↔ `src/policy/models.js` (models imported by config for validation)
- Deferred integration, if any: CLI wiring deferred to F08.

## Not Allowed To Stub
- `loadPolicy()` must read and parse real JSON from the filesystem via `node:fs/promises`.
- Default merging must produce a complete `PolicyConfig` — not just echo the file contents.
- Missing-file and malformed-JSON error paths must throw objects with `.exitCode = 2` so the CLI can propagate exit codes correctly.
- `models.js` must export real shape definitions (not empty objects) because F06-S02 and F06-S03 import them on day one.

## Behavioral / Interaction Rules
- Unknown rule names in `.depfencerc.json` are silently ignored (forward-compat for v0.2 rules); do not throw.
- All fields that are absent in the file must be filled in from defaults (the spec defines `cooldown_hours`, `pinning.required`, `scripts.allowlist`, `sources.allowed`, `provenance.required_for`, and transitive threshold).
- Policy file missing → throw `{ message: "Policy file not found: <path>", exitCode: 2 }`.
- Policy file malformed JSON → throw `{ message: "Failed to parse policy file: <parse error>", exitCode: 2 }`.

## Acceptance Criteria
- [ ] `loadPolicy(configPath)` reads `.depfencerc.json` at the given path and returns a complete `PolicyConfig` with all fields populated (either from file or from defaults).
- [ ] Missing file throws with `.exitCode = 2` and a message naming the path.
- [ ] Malformed JSON throws with `.exitCode = 2` and includes the parse error detail.
- [ ] Unknown rule names in the config are ignored — no error, no crash.
- [ ] `models.js` exports `PolicyConfig`, `Finding`, `CheckResult`, and `DependencyCheckResult` — each with all required fields documented in comments.
- [ ] Unit tests cover: valid config (all fields), valid config (sparse — defaults fill in), missing file, malformed JSON, unknown rule name in config.

## Task Breakdown
1. Create `src/policy/models.js` — define and export `PolicyConfig`, `Finding` (with `rule`, `severity`, `message`, `detail` fields), `CheckResult` (with `decision`, `findings`, `approvalCommand`), and `DependencyCheckResult`.
2. Create `src/policy/config.js` — implement `loadPolicy(configPath)` using `node:fs/promises`; define `DEFAULTS` constant covering all policy fields; merge file values over defaults; ignore unknown keys; throw structured errors on missing/malformed file.
3. Write `test/policy/config.test.js` — unit tests using fixture config files in `test/fixtures/policy/`; create minimal fixture files covering the cases listed in AC.

## Verification
```
node --test test/policy/config.test.js
# Expected: all tests pass, no errors

node -e "import('./src/policy/config.js').then(m => m.loadPolicy('.depfencerc.json')).then(c => console.log(JSON.stringify(c, null, 2))).catch(e => console.error(e.message, 'exit:', e.exitCode))"
# Expected: prints full merged PolicyConfig or structured error with exitCode: 2
```

## Edge Cases to Handle
- Config file missing → exit 2 with clear path message
- Config file malformed JSON → exit 2 with parse error included
- Unknown rule names in config → silently ignored (forward-compat)
- Partial config (only some fields) → missing fields filled from defaults

## Dependencies
- Depends on: none within F06
- Blocked by: none (sprint 1 complete; this story starts F06 work)

## Effort
S — pure config loader and model definitions; no registry calls, no rule logic

## Metadata
- Agent: pm
- Date: 2026-04-09
- Sprint: 2
- Priority: 1

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
