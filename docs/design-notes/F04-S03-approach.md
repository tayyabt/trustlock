# Design Approach: F04-S03 Baseline Advancement and Auto-Staging

## Summary
Add `advanceBaseline()` and `writeAndStage()` to `src/baseline/manager.js`. The advancement function merges a fresh set of resolved dependencies into an existing baseline: packages with an unchanged name+version retain their original TrustProfile; packages with a new name or changed version receive a fresh TrustProfile; packages present in the old baseline but absent from the new dep set are silently dropped (D3). `writeAndStage` writes the updated baseline as 2-space-indented JSON using an atomic rename, then calls `gitAdd('.trustlock/baseline.json')` per ADR-002. If `gitAdd` fails (e.g., file is `.gitignore`-d), a warning is written to stderr but no exception is raised.

Mode guards (D1, D10) are the caller's responsibility — neither function checks `--dry-run` or `--enforce` flags.

## Key Design Decisions

1. **`admittedDeps` is the full current lockfile dep set**: The caller passes all resolved dependencies from the current lockfile (not just the delta). This lets `advanceBaseline` determine which old baseline entries to drop (anything not present in the new set) and which to retain (same name+version). This interpretation is consistent with AC3 ("not in admittedDeps and not in the current lockfile" = one and the same set).

2. **Retain TrustProfile on same name+version**: If `dep.name` exists in old baseline with the same `version`, the original TrustProfile — including its `admittedAt` timestamp and `provenanceStatus` — is copied unchanged. If the version differs, a fresh TrustProfile is created with the current timestamp and `provenanceStatus: 'unknown'`.

3. **`updated_at` field added on advancement**: The story specifies updating `updated_at` timestamp. `createBaseline` sets `created_at`; `advanceBaseline` adds/updates `updated_at` to mark when the baseline was last advanced.

4. **Atomic write via temp+rename**: Conventions require atomic writes (`writeFile` to temp, then `rename`). This prevents a partial write leaving a corrupted baseline file.

5. **Dependency injection for testability (`_gitAdd` optional param)**: `writeAndStage(baseline, baselinePath, { _gitAdd })` accepts an optional override. Default is the real `gitAdd`. This avoids needing a live git repo in unit tests while keeping the real wiring intact in production. The injected parameter is underscore-prefixed to signal it is internal/test-only.

6. **Warning via `process.stderr.write`**: Consistent with `src/output` conventions (errors/warnings to stderr, not stdout).

## Integration / Wiring

- Callee-side: This story owns both functions. They are exported as named exports from `src/baseline/manager.js`.
- Caller-side (F08, deferred): The CLI check command will call `advanceBaseline` then `writeAndStage` after all policy evaluation passes, in advisory mode only. The caller skips these calls under `--dry-run` and `--enforce`. That caller does not exist yet — the seam is kept explicit via named exports and documented in this note.
- Wired now: `gitAdd` from `src/utils/git.js` is imported and called by `writeAndStage`.

## Files to Create/Modify

- `src/baseline/manager.js` — add `advanceBaseline()` and `writeAndStage()`; add imports for `rename` from `node:fs/promises`, `dirname`/`join` from `node:path`, and `gitAdd` from `../utils/git.js`
- `test/baseline/manager.test.js` — add unit tests for all new acceptance criteria

## Testing Approach

Node.js built-in test runner (`node:test`). Tests use temp directories for real file I/O. For `writeAndStage`, the `_gitAdd` injection parameter is used so tests can verify the call and simulate failure without requiring a live git repo. Warning capture uses a `process.stderr.write` monkey-patch scoped to each test.

## Acceptance Criteria / Verification Mapping

- AC1: `advanceBaseline(baseline, admittedDeps, lockfileHash)` returns updated Baseline with merged packages, updated `lockfile_hash`, updated `updated_at` → test: "advanceBaseline merges new packages, drops removed, updates hash"
- AC2: Newly admitted packages get fresh TrustProfile with current `admittedAt` → test: "advanceBaseline gives newly admitted packages a fresh TrustProfile"
- AC3: Old baseline packages not in `admittedDeps` are silently dropped → test: "advanceBaseline drops packages absent from admittedDeps"
- AC4: Unchanged packages (same name+version) retain original TrustProfile → test: "advanceBaseline retains original TrustProfile for unchanged packages"
- AC5: `writeAndStage` writes JSON to disk and calls `gitAdd('.trustlock/baseline.json')` → test: "writeAndStage writes JSON and calls gitAdd"
- AC6: If `gitAdd` fails, warns and does not throw → test: "writeAndStage logs warning when gitAdd fails and does not throw"
- AC7: Unit tests cover all required scenarios → covered by AC1–AC6 tests plus edge-case tests

## Verification Results

Command: `node --test test/baseline/manager.test.js`
Result: 18 pass, 0 fail

- AC1: `advanceBaseline` returns updated Baseline with merged packages, new `lockfile_hash`, `updated_at` → PASS — "advanceBaseline returns updated baseline with new lockfile_hash and updated_at"
- AC2: Newly admitted packages get fresh TrustProfile with current `admittedAt` → PASS — "advanceBaseline gives newly admitted packages a fresh TrustProfile"
- AC3: Old baseline packages not in `admittedDeps` are silently dropped → PASS — "advanceBaseline drops packages absent from admittedDeps"
- AC4: Unchanged packages (same name+version) retain original TrustProfile → PASS — "advanceBaseline retains original TrustProfile for unchanged packages"
- AC5: `writeAndStage` writes JSON to disk and calls `gitAdd('.trustlock/baseline.json')` → PASS — "writeAndStage writes JSON to disk and calls gitAdd"
- AC6: If `gitAdd` fails, logs warning, does not throw → PASS — "writeAndStage logs warning when gitAdd fails and does not throw"
- AC7: Unit tests cover all required scenarios → PASS — 9 new tests covering all 6 ACs plus edge cases (all packages removed, version change, schema_version/created_at preservation)

## Story Run Log Update

### 2026-04-09 developer: Implementation

Implemented `advanceBaseline` and `writeAndStage` in `src/baseline/manager.js`. Added unit tests in `test/baseline/manager.test.js`. Verification: `node --test test/baseline/manager.test.js`.

## Documentation Updates

None — no new interfaces, env vars, or operator workflows changed.

## Deployment Impact

None.

## Questions/Concerns

- `admittedDeps` interpretation as full lockfile dep set (not just delta) is inferred from AC semantics; the caller (F08) must pass the full dep set for correct removal behavior.
- `provenanceStatus` defaults to `'unknown'` for new entries, matching `createBaseline`. The policy engine (F06) may annotate this before calling `advanceBaseline` in the future.

## Metadata

- Agent: developer
- Date: 2026-04-09
- Work Item: F04-S03
- Work Type: story
- Branch: burnish/task-024-implement-baseline-advancement-and-auto-staging
- ADR: ADR-002 (baseline advancement strategy)
