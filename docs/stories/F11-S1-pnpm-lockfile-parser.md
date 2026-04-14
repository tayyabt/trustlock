# Story: F11-S1 — pnpm lockfile parser

## Parent
F11: Lockfile Parsers: pnpm + yarn

## Description
Implement the pnpm lockfile parser (`src/lockfile/pnpm.js`) and extend the format-detection router (`src/lockfile/parser.js`) to detect and dispatch `pnpm-lock.yaml`. This makes `trustlock init`, `check`, `approve`, and `audit` work in pnpm projects and pnpm monorepos.

## Scope
**In scope:**
- `src/lockfile/pnpm.js` — new pure parser function; handles pnpm-lock.yaml v5, v6, and v9
- `src/lockfile/parser.js` — add `pnpm-lock.yaml` detection branch; add `lockfileVersion` field read for pnpm version dispatch; leave existing npm path and yarn detection slot (yarn detection added in F11-S2)
- `test/fixtures/lockfiles/pnpm-v5.yaml`, `pnpm-v6.yaml`, `pnpm-v9.yaml` — new fixture files covering plain packages and scoped packages
- Unit tests for `pnpm.js` against all three fixture versions

**Not in scope:**
- yarn parser (F11-S2)
- `src/lockfile/models.js` changes — `ResolvedDependency` model is already defined; `hasInstallScripts: null` is already a valid contract (ADR-004)
- Policy engine changes (F11-S2)
- No `package.json` reading — pnpm workspace filtering uses only `importers` keys from the lockfile (C10, D7)

## Entry Points
- Route / page / screen: CLI entry — all commands that call `parseLockfile()` reach the pnpm branch through the router
- Trigger / navigation path: `trustlock init`, `trustlock check`, `trustlock approve`, `trustlock audit` in a pnpm project directory
- Starting surface: `src/lockfile/parser.js:parseLockfile(lockfilePath, projectRoot?)` — exists; this story adds the pnpm branch

## Wiring / Integration Points
- Caller-side ownership: `src/lockfile/parser.js` owns format detection and dispatch — this story adds the `pnpm-lock.yaml` filename check and `lockfileVersion` read, then calls `pnpm.js:parsePnpm(content, projectRoot)`.
- Callee-side ownership: `src/lockfile/pnpm.js` — new file; this story owns its full implementation. Returns `ResolvedDependency[]`.
- Caller-side conditional rule: The caller (`parser.js`) already exists. Wire it to the new `pnpm.js` callee now — no deferred seam.
- Callee-side conditional rule: `pnpm.js` is new. It must satisfy the ADR-004 contract: pure function `(content: string, projectRoot: string | null) => ResolvedDependency[]`. The `projectRoot` parameter is used for workspace importer filtering; `null` means no filtering.
- Boundary / contract check: Integration test calls `parseLockfile('test/fixtures/lockfiles/pnpm-v9.yaml', null)` and verifies the returned array matches the expected `ResolvedDependency[]` shape.
- Files / modules to connect: `src/lockfile/parser.js` → `src/lockfile/pnpm.js`
- Deferred integration, if any: `paths.js` resolves `projectRoot` at startup (F09-S1, task-059); this story receives `projectRoot` as a parameter — it does not call `paths.js` directly.

## Not Allowed To Stub
- The YAML line-by-line parser inside `pnpm.js` — must handle block mappings, block sequences, quoted strings, and multi-level indentation as actually emitted by pnpm; no JSON.parse shortcut
- v5/v6 scoped package key decoding: `/@scope/name/version` format must extract `name` and `version` from the key path
- v9 `name:` and `version:` field reads: must read these fields, not a key path
- `hasBin: true` or `requiresBuild: true` → `hasInstallScripts: true`; absent or false → `hasInstallScripts: null`
- Workspace importer filtering: when `projectRoot` is provided, filter `importers` section keys by matching against `projectRoot`; no match → return empty array (not an error; caller handles empty-result reporting)
- Unknown pnpm `lockfileVersion` → `process.exit(2)` with message `Unsupported pnpm lockfile version X. trustlock supports v5, v6, v9.`
- Router `parser.js`: existing npm detection path must be unchanged

## Behavioral / Interaction Rules
- `pnpm.js` is a pure function — no I/O, no network calls, no imports from `src/registry/`
- `lockfileVersion` field in `pnpm-lock.yaml` is the authoritative version discriminant — do not infer version from structural heuristics
- In pnpm monorepos, `pnpm-lock.yaml` lives at `gitRoot`; `importers` keys are relative paths from `gitRoot`; match against `projectRoot` relative to `gitRoot` to select the right importer (C10)
- If `importers` section is absent, the lockfile is not a monorepo lockfile — treat all packages as in-scope (flat pnpm project)
- `integrity` field from pnpm lockfile is stored as-is in `ResolvedDependency.integrity`; it may be absent for git-sourced packages — set to `null` in that case

## Acceptance Criteria
- [ ] `parseLockfile('test/fixtures/lockfiles/pnpm-v5.yaml', null)` returns correct `name`, `version`, `integrity` for plain packages.
- [ ] `parseLockfile('test/fixtures/lockfiles/pnpm-v5.yaml', null)` returns correct `name`, `version`, `integrity` for scoped packages (v5/v6 key-path decoding: `/@scope/name/version`).
- [ ] `parseLockfile('test/fixtures/lockfiles/pnpm-v9.yaml', null)` returns correct `name`, `version`, `integrity` using `name:` and `version:` field reads (not key path).
- [ ] Package with `hasBin: true` → `hasInstallScripts: true`; package with `requiresBuild: true` → `hasInstallScripts: true`; package with neither → `hasInstallScripts: null`.
- [ ] Workspace filtering: `parseLockfile('test/fixtures/lockfiles/pnpm-monorepo.yaml', 'packages/backend')` returns only packages listed under the `packages/backend` importer key; `parseLockfile(..., 'packages/nonexistent')` returns `[]`.
- [ ] Unknown `lockfileVersion` exits 2 with message `Unsupported pnpm lockfile version X. trustlock supports v5, v6, v9.`
- [ ] Existing npm lockfile parsing is unchanged: `parseLockfile('test/fixtures/lockfiles/npm-v3.json', null)` still returns the same results as before this story.
- [ ] `src/lockfile/pnpm.js` does not import any module from `src/registry/`.
- [ ] `node --input-type=module -e "import './src/lockfile/pnpm.js'"` resolves without error (no missing runtime dependencies).

## Task Breakdown
1. Create `test/fixtures/lockfiles/pnpm-v5.yaml` — include at least one plain package and one scoped package with `integrity` fields
2. Create `test/fixtures/lockfiles/pnpm-v6.yaml` — same coverage as v5 (v6 format is near-identical to v5)
3. Create `test/fixtures/lockfiles/pnpm-v9.yaml` — include plain and scoped packages using explicit `name:` and `version:` fields; include one package with `requiresBuild: true`
4. Create `test/fixtures/lockfiles/pnpm-monorepo.yaml` — include `importers` section with at least two workspace paths
5. Create `src/lockfile/pnpm.js` — implement line-by-line YAML parser; handle v5/v6 key-path decoding, v9 field reads, `hasBin`/`requiresBuild` mapping, workspace filtering
6. Extend `src/lockfile/parser.js` — add `pnpm-lock.yaml` filename detection branch; read `lockfileVersion` field; dispatch to `pnpm.js`; add exit 2 for unsupported pnpm versions
7. Write unit tests for `pnpm.js` in `test/` covering all AC items above

## Verification
```
node --test test/lockfile/pnpm.test.js
# Expected: all tests pass, no errors

node --test test/lockfile/parser.test.js
# Expected: existing npm tests still pass; new pnpm detection tests pass
```

## Edge Cases to Handle
- pnpm v5/v6 scoped package key `/@scope/name/version` — decode `name` and `version` from key path
- pnpm v9 explicit `name:` and `version:` fields — read fields; do not attempt key-path decoding
- `hasBin: true` or `requiresBuild: true` → `hasInstallScripts: true`
- pnpm workspace `importers` key matching: relative path from gitRoot must match `projectRoot` (relative to gitRoot); no match → `[]`
- `integrity` field may be absent for git-sourced packages → `null`

## Dependencies
- Depends on: task-059 (F09-S1 — paths.js and gitRoot/projectRoot resolution; this story receives `projectRoot` as a parameter, so the dependency is conceptual — both stories can proceed in parallel if F09-S1 ships the `projectRoot` API before this story's integration tests run)
- Blocked by: none

## Effort
M — purpose-built YAML line-parser for three format versions plus workspace filtering is non-trivial, but scope is well-defined and isolated to one new file.

## Metadata
- Agent: pm
- Date: 2026-04-10
- Sprint: 3
- Priority: P1

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
