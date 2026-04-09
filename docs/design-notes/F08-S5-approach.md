# Design Approach: F08-S5 — `audit`, `clean-approvals`, and `install-hook` Commands

## Summary

Implement the three remaining CLI command stubs: `audit.js` (full-tree trust posture scan), `clean.js` (expired approval removal), and `install-hook.js` (pre-commit hook installation). Each command is a thin orchestration layer that wires to existing module APIs — no business logic lives in the command handlers.

`audit.js` is the most complex: it parses the full lockfile, fetches registry metadata concurrently for all packages, runs the policy engine with a synthetic delta (all packages treated as "added"), and computes an AuditReport from the results. `clean.js` delegates entirely to `cleanExpired()` in the approvals store. `install-hook.js` handles four filesystem branch cases with proper atomic writes and `chmod +x`.

## Key Design Decisions

1. **Synthetic delta for audit**: The policy engine expects a `DependencyDelta`. For audit (whole-tree scan), all packages are treated as `added` with `previousProfile = null`. This correctly surfaces cooldown, provenance, scripts, and sources violations across the full tree. The `transitive-surprise` rule may produce elevated counts since every transitive package appears "new" — this is a known audit trade-off and is informational only (exits 0).
2. **`cleanExpired` delegates fully**: The store already implements the atomic write-back and expiry logic. `clean.js` only handles path resolution, calls `cleanExpired()`, and formats the message.
3. **`chmod` via `node:fs/promises`**: `fs/promises.chmod(path, 0o755)` is used instead of `child_process` to keep the hook installation self-contained and avoid shell-injection risk.
4. **Hooks directory created with `mkdir({ recursive: true })`**: `.git/hooks/` may not exist in fresh clones with `core.hooksPath` configs — create it defensively.
5. **`blockOnRegression` derived from policy**: The policy model does not have a literal `block_on_regression` field. It is derived as `policy.provenance.required_for.length > 0` for the audit report heuristic suggestions.

## Integration / Wiring

- `index.js` already routes all three commands to their stubs (F08-S1). This story replaces the stubs — no changes to `index.js`.
- `audit.js` → `parseLockfile` (F02) + `createRegistryClient` (F03) + `loadPolicy` (F06) + `evaluate` (policy engine F06) + `formatAuditReport` (F07)
- `clean.js` → `cleanExpired` from `approvals/store.js` (F05)
- `install-hook.js` → `node:fs/promises` only

## Files to Create/Modify

- `src/cli/commands/audit.js` — full implementation (was stub)
- `src/cli/commands/clean.js` — full implementation (was stub)
- `src/cli/commands/install-hook.js` — full implementation (was stub)
- `test/unit/cli/audit.test.js` — new test file
- `test/unit/cli/clean.test.js` — new test file
- `test/unit/cli/install-hook.test.js` — new test file

## Testing Approach

All tests use `node:test` and `node:assert`. Dependency injection (`_cwd`, `_registryClient`) isolates filesystem and network calls.

- **audit tests**: inject `_cwd` pointing to a temp dir with fixture lockfile + policy; inject `_registryClient` returning controlled metadata; assert stdout contains expected stat lines and that exit code is always 0
- **clean tests**: write real approvals.json fixture files in temp dir; assert correct removal counts and output messages
- **install-hook tests**: use real temp dirs with/without `.git/hooks/`; assert file content and executable bit for all 4 states

## Acceptance Criteria / Verification Mapping

- AC: `audit` prints stats (total packages, per-rule issue counts, flagged packages with suggestions) → test `audit.test.js` + manual `node src/cli/index.js audit`
- AC: `audit` exits 0 always → test verifies `process.exitCode` not set; manual run exits 0
- AC: `clean-approvals` removes expired + prints counts → test `clean.test.js`
- AC: `clean-approvals` no expired → prints "No expired approvals found." → test `clean.test.js`
- AC: `install-hook` creates hook + makes executable → test `install-hook.test.js` + `ls -la .git/hooks/pre-commit`
- AC: `install-hook` when already installed → "Hook already installed." → test `install-hook.test.js`
- AC: `install-hook` when hook exists without trustlock → appends → test `install-hook.test.js`
- AC: `install-hook --force` with custom content → warns + overwrites → test `install-hook.test.js`

## Verification Results

- AC: `audit` prints stats (total packages, provenance %, age, source types, install scripts, suggestions) → PASS — `node --test test/unit/cli/audit.test.js` (10/10 pass); manual `node src/cli/index.js audit` confirmed
- AC: `audit` exits 0 always → PASS — AC2 test + `echo $?` = 0
- AC: `clean-approvals` removes expired + prints counts → PASS — `node --test test/unit/cli/clean.test.js` (AC1, AC3 pass)
- AC: `clean-approvals` no expired → PASS — AC2/AC2b tests pass; "No expired approvals found." confirmed
- AC: `install-hook` creates hook + makes executable → PASS — AC1 test + `ls -la .git/hooks/pre-commit` shows `-rwxr-xr-x`; manual run confirmed
- AC: `install-hook` already installed → PASS — AC2 test; second manual run prints "Hook already installed."
- AC: `install-hook` appends without overwrite → PASS — AC3 + AC3b tests pass
- AC: `install-hook --force` warns + overwrites → PASS — AC4 test pass

All test commands run:
```
node --test test/unit/cli/audit.test.js      # 10/10 pass
node --test test/unit/cli/clean.test.js      # 7/7 pass
node --test test/unit/cli/install-hook.test.js  # 9/9 pass
node --test test/unit/cli/approve.test.js test/unit/cli/check.test.js test/unit/cli/init.test.js test/unit/cli/args.test.js  # 56/56 pass
node --test test/smoke.test.js               # 5/5 pass
```

## Documentation Updates

None — no new CLI flags, environment variables, or operator workflows introduced beyond what the feature brief already documents.

## Deployment Impact

None.

## Questions/Concerns

- The `transitive-surprise` rule may produce warnings for most packages in a full audit scan since all are "added". This is expected audit behavior — the output is informational (exit 0).
- `blockOnRegression` is approximated from `policy.provenance.required_for.length > 0` since the policy model has no direct `block_on_regression` field.

## Metadata

- Agent: developer
- Date: 2026-04-09
- Work Item: F08-S5 / task-038
- Work Type: story
- Branch: burnish/task-038-implement-audit-clean-approvals-and-install-hook-commands
- ADR: ADR-001 (zero runtime dependencies)
