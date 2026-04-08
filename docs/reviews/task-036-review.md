# Code Review: task-036 — Implement `approve` Command (F08-S3)

## Summary
Full implementation of `dep-fence approve` replacing the F08-S1 stub. All 8 acceptance criteria are satisfied and verified by 14 passing unit tests. No runtime stubs present; all required callee wires use real module APIs. The design note is honest and complete.

## Verdict
Approved

## Findings

### Observation: Story AC2 field names differ from established model
- **Severity:** suggestion
- **Finding:** Story AC2 names fields `approvedAt`, `expiresAt`, `approvedBy` (camelCase), but the F05 model (`src/approvals/models.js`) defines them as `approved_at`, `expires_at`, `approver` (snake_case). The implementation correctly follows the established model.
- **Proposed Judgment:** No change required. The story authoring used camelCase but the model predates this story. Developer correctly followed the authoritative model. Future story authors should use snake_case field names when referencing approval entry fields.
- **Reference:** `src/approvals/models.js` (F05), global conventions (plain objects, ISO UTC strings), story F08-S3 AC2.

### Observation: Valid rule name list diverges from story/workflow error message example
- **Severity:** suggestion
- **Finding:** Story AC5 error message example lists `cooldown, provenance, scripts, source, pinning`; the workflow doc lists the same stale set. The implementation uses `VALID_RULE_NAMES` from `src/approvals/models.js` which is the authoritative set: `provenance, cooldown, pinning, scripts, sources, new-dep, transitive`. The design note explicitly acknowledges and justifies this (decision #7).
- **Proposed Judgment:** No change required. Using `VALID_RULE_NAMES` is correct. The story/workflow docs contain a stale example list. Future story/workflow updates should reference `models.js` as the source of truth.
- **Reference:** `src/approvals/models.js:19-27`, design note §Key Design Decisions #7, story F08-S3 AC5.

### Observation: Story names `appendApproval` but actual API is `writeApproval`
- **Severity:** suggestion
- **Finding:** Story integration section says callee should call `appendApproval(entry)` from `store.js`, but the actual exported function is `writeApproval(approvalsPath, input, lockfileDeps, config)` (F05). The developer correctly called the real API, which performs read-append-atomicWrite.
- **Proposed Judgment:** No change required. Developer used the actual API. Story integration documentation is inaccurate about the function name.
- **Reference:** `src/approvals/store.js:91`, `src/cli/commands/approve.js:219`, story F08-S3 §Wiring.

## Checks Performed
- [x] Correctness (each acceptance criterion verified individually)
- [x] Workflow completeness / blocked-state guidance (blocked-approve.md — all error states and confirmation format match)
- [x] Architecture compliance (ADR-001: zero runtime deps — only built-in modules used; ADR-002: not applicable to approve)
- [ ] Design compliance (N/A — no UI)
- [x] Behavioral / interaction rule compliance (D7 approver identity, D9 no wildcard, expiry reject not cap, require_reason default)
- [x] Integration completeness (caller index.js routes to stub — no changes needed; all callee wires are real: parseLockfile, writeApproval, VALID_RULE_NAMES, parseDuration, getGitUserName)
- [x] Pitfall avoidance (no module guidance or pitfalls artifacts defined for cli module)
- [x] Convention compliance (ES modules, snake_case fields, stderr for errors, stdout for output, atomic writes, ISO UTC timestamps)
- [x] Test coverage (14 tests cover all 8 ACs plus AC7b, comma-separated overrides, missing override, missing config, scoped package; all pass)
- [x] Code quality & documentation (design note complete and honest, no dead code, stubs check: none found)

## Acceptance Criteria Judgment
- AC1: `approve axios@1.14.1 --override cooldown --reason "ok"` writes valid approval entry → **PASS** — unit test "AC1: happy path"; file inspection via `readFile` in test
- AC2: Entry has package, version, overrides (array), reason, approved_at (ISO), expires_at (ISO), approver → **PASS** — unit test "AC2: approval entry has all required fields"; fields are snake_case per F05 model
- AC3: `--as <name>` overrides git config for approver identity → **PASS** — unit test "AC3: --as <name> overrides approvedBy"; `approve.js:185-198` takes strict precedence
- AC4: Package not in lockfile exits exit 2 + "Error: \<pkg\>@\<ver\> not found in lockfile" → **PASS** — unit test "AC4: package not in lockfile"; `approve.js:209-212`
- AC5: Invalid `--override` value exits exit 2 + valid rule names list → **PASS** — unit test "AC5: invalid --override value"; `approve.js:146-153`
- AC6: `--expires` exceeding `max_expiry_days` exits exit 2 + "Maximum expiry is N days (configured in .depfencerc.json)" → **PASS** — unit test "AC6: --expires exceeding max_expiry_days"; `approve.js:165-171`
- AC7: Missing `--reason` when `require_reason: true` exits exit 2 → **PASS** — unit test "AC7: missing --reason when require_reason:true"; `approve.js:175-180`
- AC8: Approval file appended (not overwritten) when approvals already exist → **PASS** — unit test "AC8: appends to existing approvals"; pre-populated fixture with 1 entry, verifies 2 entries after

## Deferred Verification
none

## Regression Risk
- Risk level: low
- Why: New file replaces a stub with no downstream callers yet (F08-S6 re-check integration deferred per story). All callee contracts exercised through unit tests with real file I/O in temp directories. `writeApproval` in store.js is atomic (temp-file + rename), so partial-write risk is absent. The lockfile parser and git utils are pre-existing tested modules unchanged by this task.

## Integration / Boundary Judgment
- Boundary: `index.js` → `approve.js` (caller); `approve.js` → `parseLockfile`, `writeApproval`, `VALID_RULE_NAMES`, `parseDuration`, `getGitUserName` (callees)
- Judgment: complete
- Notes: Caller side (index.js routing stub) was established in F08-S1 and requires no changes per story. All callee wires confirmed real: `parseLockfile` called with lockfile + package.json paths; `writeApproval` called with approvalsPath, structured input, lockfileDeps, approval config; `getGitUserName()` called sync, null-checked, with `--as` override. Boundary contract (approvals.json shape) verified by AC2 and AC8 tests.

## Test Results
- Command run: `node --test test/unit/cli/approve.test.js`
- Result: 14 pass, 0 fail, 0 skipped

## Context Updates Made
No context updates needed. The cli module has no existing module guidance or pitfalls artifacts. No reusable traps or rules emerged from this review that rise to the level of a module pitfall (all patterns are well-covered by global conventions and the story behavioral rules).

## Artifacts Used
- Story: `docs/stories/F08-S3-approve-command.md`
- Feature brief: `docs/feature-briefs/F08-cli-commands.md`
- Workflow: `docs/workflows/cli/blocked-approve.md`
- Design note: `docs/design-notes/F08-S3-approach.md`
- ADR-001: `docs/adrs/ADR-001-zero-runtime-dependencies.md`
- ADR-002: `docs/adrs/ADR-002-baseline-advancement-strategy.md`
- Global conventions: `context/global/conventions.md`
- Source: `src/cli/commands/approve.js`, `src/approvals/store.js`, `src/approvals/models.js`, `src/utils/git.js`
- Tests: `test/unit/cli/approve.test.js`

## Metadata
- Agent: reviewer
- Date: 2026-04-09
- Task: task-036
- Branch: burnish/task-036-implement-approve-command
