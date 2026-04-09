# Story: F05-S03 — Approval Command Generator

## Parent
F05: Approval Store & Validation

## Description
Implement the approval command generator that produces copy-pasteable `trustlock approve` commands for blocked packages. When a package is blocked, the output includes a ready-to-run command with the correct `--override` flags for the specific rules that blocked it.

## Scope
**In scope:**
- `src/approvals/generator.js` — generateApprovalCommand
- Correct `--override` flags for each blocking rule
- Correct `package@version` formatting (including scoped packages like `@scope/pkg@1.0.0`)
- Default expiry from policy config
- `test/approvals/generator.test.js`

**Not in scope:**
- Store operations (read/write/clean) — owned by F05-S01
- Approval validation — owned by F05-S02
- Output formatting/rendering (terminal colors, layout) — owned by F07
- CLI command parsing — owned by F08

## Entry Points
- Route / page / screen: N/A — library module, not user-facing
- Trigger / navigation path: Called by output module (F07) when rendering blocked package results
- Starting surface: Output module imports `generator.js` to embed approval commands in terminal output

## Wiring / Integration Points
- Caller-side ownership: Output module (F07) will call `generateApprovalCommand()` — F07 owns that wiring
- Callee-side ownership: This story owns the command string generation logic
- Caller-side conditional rule: Output module (F07) does not exist yet. Export `generateApprovalCommand(checkResult, policyConfig)` returning a `string`. F07 wires to this when it lands.
- Callee-side conditional rule: This story takes `checkResult` (with `packageName`, `version`, `blockingRules`) and `policyConfig` (with `default_expiry`) as plain objects. No import dependency on F06 modules — the function operates on data shapes, not module imports.
- Boundary / contract check: Unit tests verify generated command strings are syntactically correct and parseable
- Files / modules to connect: `src/approvals/generator.js` (standalone, no internal module imports)
- Deferred integration, if any: Output module wiring deferred to F07

## Not Allowed To Stub
- `--override` flag generation — must produce one `--override <rule>` per blocking rule, not a placeholder
- Package@version formatting — must handle scoped packages (`@scope/pkg@1.0.0`) correctly
- The generated command must be directly copy-pasteable into a terminal and produce a valid `trustlock approve` invocation

## Behavioral / Interaction Rules
- Generated command uses the format: `trustlock approve <package>@<version> --override <rule1> --override <rule2> --expires <default>`
- Multiple blocking rules produce multiple `--override` flags, not a comma-separated list
- Default expiry comes from `policyConfig.default_expiry` (e.g., "7d")
- If no default expiry in config, omit `--expires` flag (let CLI use its own default)

## Acceptance Criteria
- [ ] `generateApprovalCommand(checkResult, policyConfig)` returns a valid command string
- [ ] Generated command includes correct `package@version` (handles scoped packages)
- [ ] Generated command includes one `--override <rule>` per blocking rule
- [ ] Generated command includes `--expires <duration>` when `policyConfig.default_expiry` is set
- [ ] Generated command omits `--expires` when no default expiry configured
- [ ] Multiple blocking rules produce multiple `--override` flags
- [ ] Unit tests cover: single rule block, multi-rule block, scoped package, with/without default expiry
- [ ] `node test/approvals/generator.test.js` — all tests pass

## Task Breakdown
1. Create `src/approvals/generator.js` — implement `generateApprovalCommand()` with package@version and --override flag generation
2. Handle scoped package names (ensure `@scope/pkg@1.0.0` doesn't break the command format)
3. Add optional `--expires` flag from policy config
4. Write `test/approvals/generator.test.js` — cover all acceptance criteria

## Verification
```
node test/approvals/generator.test.js
# Expected: all tests pass, no errors
```

## Edge Cases to Handle
- Scoped package names (`@scope/pkg@1.0.0`) — the `@` in scope must not confuse the `package@version` split
- Single blocking rule vs. multiple blocking rules — both must produce valid commands
- No default expiry in policy config — omit `--expires` entirely
- Package blocked by all rules — command includes all `--override` flags

## Dependencies
- Depends on: none
- Blocked by: none

## Effort
S — pure string formatting with no I/O or complex logic

## Metadata
- Agent: pm
- Date: 2026-04-08
- Sprint: 1
- Priority: P0

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
