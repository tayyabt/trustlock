# Story: F08-S6 — End-to-End Integration Tests

## Parent
F08: CLI Commands, Integration & Documentation

## Description
Write integration tests that exercise the complete CLI pipeline end-to-end against real fixture projects. Tests must cover the full init → check (admit) → modify lockfile → check (block) → approve → check (admit with approval) sequence, plus enforce mode and edge-case exits.

## Scope
**In scope:**
- `test/integration/cli-e2e.test.js` — the integration test suite using `node --test`
- Fixture npm projects in `test/fixtures/` (lockfile + policy + baseline snapshots)
- Spawning `dep-fence` as a child process to test real exit codes and stdout/stderr
- Testing the three primary workflows: init-onboarding, check-admit, blocked-approve
- Testing CI enforce mode: `check --enforce` exits 1 on block, never advances baseline
- Testing `clean-approvals` removes expired entries
- Testing `install-hook` creates an executable pre-commit file

**Not in scope:**
- Unit tests for individual modules (those live in each module's own story)
- Performance benchmarks
- Documentation tests

## Entry Points
- Route / page / screen: `node --test test/integration/cli-e2e.test.js`
- Trigger / navigation path: Run by developer after implementing F08-S2 through F08-S5, or in CI
- Starting surface: Integration test file spawns `node src/cli/index.js` as a child process

## Wiring / Integration Points
- Caller-side ownership: This story creates the integration test file; tests invoke the CLI as a subprocess via `node:child_process`
- Callee-side ownership: The real `src/cli/index.js` and all command handlers (F08-S2 through F08-S5) are the callee; tests verify real behavior
- Caller-side conditional rule: CLI commands (S2–S5) already exist; wire tests to real CLI subprocess now
- Callee-side conditional rule: All command handlers are real by this point; no mocks for module internals in integration tests
- Boundary / contract check: Each test verifies exit code, stdout content, and filesystem state after each command
- Files / modules to connect: `cli-e2e.test.js` → `node src/cli/index.js` as subprocess; fixture projects in `test/fixtures/`
- Deferred integration: none

## Not Allowed To Stub
- CLI subprocess invocation — must spawn real `node src/cli/index.js` as a child process; do not import command handlers directly
- Filesystem state assertions — must check that `baseline.json`, `approvals.json`, `.git/hooks/pre-commit` actually exist on disk with correct content
- Exit code assertions — must verify the real `process.exitCode` from the subprocess, not mock it
- `git add` staging assertion — must verify that `git diff --staged` includes `baseline.json` after a successful advisory check (ADR-002)

## Behavioral / Interaction Rules
- Each test case uses an isolated temp directory (clone fixture or copy fixture files) to avoid cross-test interference
- Tests must clean up temp directories on teardown
- Registry calls in integration tests: use recorded HTTP fixtures (file-based cache pre-populated) so tests do not depend on npm registry availability
- ADR-002 (auto-staging): at least one test must verify that `git diff --staged` shows `baseline.json` after a successful check
- D1 (all-or-nothing): at least one test must verify that a partial block prevents baseline advancement for ALL packages, not just the blocked one
- D10 (CI read-only): at least one test must verify that `--enforce` mode never writes `baseline.json`

## Acceptance Criteria
- [ ] `init` test: runs `dep-fence init`, asserts `.depfencerc.json`, `baseline.json`, `approvals.json`, `.cache/`, `.gitignore` all exist with correct content
- [ ] `check` admit test: modifies a fixture lockfile, runs `dep-fence check`, asserts "admitted" in output, asserts baseline is updated and staged
- [ ] `check` block test: introduces a policy-violating dependency, runs `dep-fence check`, asserts block output with reasons and generated approval command, asserts baseline NOT advanced
- [ ] `approve` + re-check test: runs `dep-fence approve` after block, then `dep-fence check`, asserts "admitted with approval" in output, asserts commit would succeed
- [ ] `check --enforce` block test: asserts exit code 1 and baseline not written
- [ ] `check --enforce` pass test: asserts exit code 0 and baseline not written (D10)
- [ ] `check --dry-run` test: asserts no baseline write even when all packages admitted
- [ ] No-changes test: lockfile unchanged, `dep-fence check` prints "No dependency changes", exit 0
- [ ] `clean-approvals` test: expired approval removed from `approvals.json`, count printed
- [ ] `install-hook` test: `.git/hooks/pre-commit` created, executable, contains `dep-fence check`
- [ ] Full pipeline test: `init` → `check` (admit) → modify lockfile → `check` (block) → `approve` → `check` (admit with approval) — all pass in sequence

## Task Breakdown
1. Create `test/fixtures/` directory structure with a minimal npm project (package.json + package-lock.json v3)
2. Pre-populate `test/fixtures/.dep-fence/.cache/` with recorded npm registry responses for fixture packages
3. Create `test/integration/cli-e2e.test.js` using `node:test` and `node:child_process`
4. Implement test helper: `spawnCli(args, cwd)` → `{ exitCode, stdout, stderr }`
5. Implement test helper: `setupFixtureProject(tmpDir)` — copies fixture files into a clean temp git repo
6. Write each acceptance criterion as a named `test(...)` case
7. Verify all tests pass via `node --test test/integration/cli-e2e.test.js`

## Verification
```bash
node --test test/integration/cli-e2e.test.js
# Expected: all subtests pass, no failures

# Individual scenarios can be run in isolation:
node --test --test-name-pattern="full pipeline" test/integration/cli-e2e.test.js
# Expected: full init→check→block→approve→re-check sequence passes

node --test --test-name-pattern="enforce" test/integration/cli-e2e.test.js
# Expected: enforce mode exits 1 on block, 0 on pass, no baseline write in either case
```

## Edge Cases to Handle
- D1: partial block prevents any baseline advancement — verified explicitly
- D10: `--enforce` never writes baseline — verified explicitly
- ADR-002: `git diff --staged` shows baseline.json after successful advisory check
- `--dry-run`: no baseline write even when all admitted
- Expired approval silently skipped by check (not used, not an error)

## Dependencies
- Depends on: F08-S2 (check), F08-S3 (approve), F08-S4 (init), F08-S5 (audit, clean, install-hook) — all must be complete
- Blocked by: none beyond the F08 command stories

## Effort
M — test infrastructure setup is the main effort; individual test cases are straightforward once the fixture project and spawn helpers exist

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
