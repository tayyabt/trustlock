# Story: F17-S1 — Cross-Project Audit Command (`trustlock audit --compare`)

## Parent
F17: Cross-Project Audit

## Description
Adds `trustlock audit --compare <dir1> <dir2> ...` which reads lockfiles from multiple project directories and produces a unified report of version drift, provenance inconsistency, and allowlist inconsistency. This is a passive, informational command — no policy evaluation, no baseline modification, always exits 0 (D6, C-NEW-4).

## Scope
**In scope:**
- `src/cli/commands/cross-audit.js` — new command handler; reads lockfiles per directory, runs three comparison passes, formats and prints the unified report
- `src/cli/args.js` — add `--compare` flag to the `audit` subcommand (takes one or more directory paths)
- `src/cli/index.js` — route `audit --compare` to `cross-audit.js` when `--compare` is present

**Not in scope:**
- Policy evaluation — `.trustlockrc.json` is read ONLY to extract `scripts.allowlist`; the full `loadPolicy()` async loader (F15) must NOT be called
- Baseline modification — cross-audit is read-only
- Any new lockfile parser — reuses existing parsers (npm, pnpm, yarn, Python) via `src/lockfile/index.js`
- Workflow documentation — no side-effecting flow; no workflow artifact required (verified in feature validation)

## Entry Points
- Route / page / screen: CLI — `trustlock audit --compare <dir1> <dir2> ...`
- Trigger / navigation path: Manual invocation by a tech lead or developer comparing lockfiles across monorepo packages
- Starting surface: Terminal; the `audit` subcommand extended with `--compare` flag

## Wiring / Integration Points
- Caller-side ownership: `src/cli/args.js` (add `--compare` multi-value flag to the `audit` subcommand) and `src/cli/index.js` (branch on `--compare` presence to dispatch to `cross-audit.js` instead of `audit.js`)
- Callee-side ownership: `src/cli/commands/cross-audit.js` — owns all comparison logic, direct `fs.readFile` reads of `.trustlockrc.json` per directory (scripts.allowlist only), lockfile parser dispatch via `src/lockfile/index.js`, and output formatting to stdout
- Caller-side conditional rule: `audit.js` already exists; `index.js` must add a branch: if `--compare` flag is present, dispatch to `cross-audit.js`. `audit.js` itself is not modified.
- Callee-side conditional rule: `cross-audit.js` is new. It calls `src/lockfile/index.js` (callee already exists) using the existing format-detection router. If a format is unrecognised or the lockfile is missing, the handler skips the directory with a stderr warning rather than throwing.
- Boundary / contract check: integration test invokes `trustlock audit --compare packages/frontend packages/backend` against a real fixture directory tree and verifies stdout contains all three report sections; also verifies `loadPolicy` is never imported by `cross-audit.js`
- Files / modules to connect:
  - `src/cli/args.js` → extends argument spec with `--compare`
  - `src/cli/index.js` → dispatches to `cross-audit.js`
  - `src/cli/commands/cross-audit.js` → calls `src/lockfile/index.js` for each directory; calls `node:fs/promises` directly for `.trustlockrc.json`; calls output formatter for the report
- Deferred integration: none — all wiring is owned and completed in this story

## Not Allowed To Stub
- `src/lockfile/index.js` integration — must call the real format-detection router per directory; no mock lockfile results
- Direct `fs.readFile` for `.trustlockrc.json` — must be real; `loadPolicy()` must not be called (C-NEW-4)
- The three comparison passes (version drift, provenance inconsistency, allowlist inconsistency) — all three must produce real output or the clean-section confirmation; no placeholder sections
- Routing in `src/cli/index.js` — must dispatch to `cross-audit.js` for real; no stub routing

## Behavioral / Interaction Rules
- Exit code is always 0, including when drift or inconsistencies are found; only fatal errors (directory not found, fewer than two directories supplied) produce a non-zero exit
- `--compare` requires at least two directory arguments; supplying exactly one must exit with an error message: `--compare requires at least two directories.`
- A directory that does not exist must exit with an error: `Directory not found: <path>.`
- A directory with no recognised lockfile must skip with a stderr warning and continue comparing the remaining directories; it must not abort the run
- `source.path` entries in `uv.lock` must be excluded from all three comparison passes (C12, D3)
- Packages present in only one project must not appear in the version drift section (drift requires presence in 2+ projects at different versions)
- Same package name at the same version in two projects is not a provenance inconsistency — both must agree; inconsistency requires same name but different versions where provenance state differs
- `.trustlockrc.json` is read directly via `fs.readFile`; a malformed `extends` field must not trigger a network call or error (C-NEW-4)
- If `.trustlockrc.json` is absent from a directory, treat `scripts.allowlist` as empty for that directory; do not error
- Clean sections print a per-section confirmation line: "No version drift detected. ✓" / "No provenance inconsistencies. ✓" / "No allowlist inconsistencies. ✓"
- Output goes to stdout; all warnings and diagnostic messages go to stderr; same styling conventions as `trustlock audit` single-project output

## Acceptance Criteria
- [ ] `trustlock audit --compare <dir1> <dir2>` reads lockfiles from each directory and produces a unified report with three sections: version drift, provenance inconsistency, and allowlist inconsistency.
- [ ] `cross-audit.js` does not import `loadPolicy` or any export from `src/policy/loader.js`. Verified by: `grep -r 'loadPolicy' src/cli/commands/cross-audit.js` → no matches.
- [ ] `.trustlockrc.json` is read with `fs.readFile` directly; only the `scripts.allowlist` field is extracted. No admission rules are loaded or evaluated.
- [ ] No baseline modification occurs. Verified by: `grep -r 'writeAndStage\|writeBaseline\|baseline' src/cli/commands/cross-audit.js` → no matches referencing write paths.
- [ ] Exit code is always 0 when the command runs successfully (with or without inconsistencies).
- [ ] Fewer than two directories: exits with error message `--compare requires at least two directories.` and a non-zero exit code.
- [ ] Directory not found: exits with error message `Directory not found: <path>.` and a non-zero exit code.
- [ ] Directory with no recognised lockfile: emits a stderr warning and skips that directory; run continues with remaining directories.
- [ ] Multi-format lockfile directories (npm + pnpm across directories): format detection runs per directory via the existing `src/lockfile/index.js` router; both parsers are used correctly.
- [ ] `source.path` entries in `uv.lock` are excluded from all comparison passes (C12).
- [ ] Packages present in only one directory do not appear in the version drift section.
- [ ] Clean sections show a per-section confirmation: "No version drift detected. ✓" (or equivalent).
- [ ] A directory with a malformed `extends` URL in `.trustlockrc.json` does not cause an error or network call during `--compare`. Verified by: unit test with a fixture `.trustlockrc.json` containing `"extends": "https://bad-url-that-should-not-be-fetched.invalid"` — run completes without error or HTTP activity.
- [ ] Absolute and relative directory paths are both accepted; relative paths are resolved from `cwd`.

## Task Breakdown
1. Extend `src/cli/args.js`: add `--compare` as a multi-value flag on the `audit` subcommand.
2. Update `src/cli/index.js`: when `audit` is dispatched and `--compare` is present, call `cross-audit.js` handler instead of `audit.js`.
3. Create `src/cli/commands/cross-audit.js`:
   a. Validate ≥2 directories; error and exit if not.
   b. For each directory: resolve path (abs or relative to cwd), verify it exists (error exit if not), detect and parse lockfile via `src/lockfile/index.js` (skip with warning if none found), read `.trustlockrc.json` via `fs.readFile` extracting `scripts.allowlist` only.
   c. Filter out `source.path` entries from any uv.lock parse results.
   d. Compute version drift: packages present in ≥2 directories at differing versions.
   e. Compute provenance inconsistency: packages at the same name but different versions where provenance state (has/lacks attestation) differs across directories.
   f. Compute allowlist inconsistency: packages in one directory's `scripts.allowlist` absent from another's.
   g. Format and print to stdout using existing output conventions; emit per-section clean confirmations when no issues found.
4. Write unit tests for each comparison function (version drift, provenance, allowlist) with fixture `ResolvedDependency[]` arrays.
5. Write integration test: two fixture directories (one npm, one pnpm), verify all three sections, verify loadPolicy not called, verify `source.path` exclusion, verify malformed `extends` does not trigger network activity.
6. Write edge-case tests: single directory error, missing directory error, no lockfile warning+skip, packages in only one directory (no drift).

## Verification
```bash
# Unit tests
node --test src/cli/commands/__tests__/cross-audit.test.js
# Expected: all tests pass

# Integration test (requires fixture directories)
node --test test/integration/cross-audit.test.js
# Expected: all tests pass

# Grep check — loadPolicy must not be imported
grep -r 'loadPolicy' src/cli/commands/cross-audit.js
# Expected: no output (no matches)

# Grep check — no baseline writes
grep -r 'writeAndStage\|writeBaseline' src/cli/commands/cross-audit.js
# Expected: no output (no matches)

# Smoke test
node src/index.js audit --compare packages/frontend packages/backend
# Expected: unified report with three sections, exit code 0

# Single directory error
node src/index.js audit --compare packages/frontend
# Expected: error message "--compare requires at least two directories.", non-zero exit

# Missing directory error
node src/index.js audit --compare packages/frontend /nonexistent/path
# Expected: error message "Directory not found: /nonexistent/path.", non-zero exit
```

## Edge Cases to Handle
- Only one directory supplied — error exit with `--compare requires at least two directories.`
- Directory not found — error exit with `Directory not found: <path>.`
- Directory has no lockfile — skip with stderr warning; continue with remaining directories
- All projects at same versions — version drift section shows "No version drift detected. ✓"
- All projects have same allowlists — allowlist section shows "No allowlist inconsistencies. ✓"
- Package present in only one project — no drift reported (drift requires presence in ≥2 projects)
- Mix of npm and pnpm lockfiles across directories — format detection runs per directory
- `source.path` entries in uv.lock — excluded from all comparison passes (C12)
- Same package name at same version in two projects — no provenance inconsistency
- Directory supplied as absolute path — resolved as-is
- Directory supplied as relative path — resolved relative to cwd
- `.trustlockrc.json` absent — treat `scripts.allowlist` as empty; no error
- `.trustlockrc.json` present but has malformed `extends` field — read file, extract `scripts.allowlist`, ignore `extends`; no network call

## Dependencies
- Depends on: F02 (npm lockfile parser — already shipped), F11 (pnpm/yarn parsers — Sprint 3/4, must be available), F16 (Python parsers — parallel Sprint 4; if not yet shipped, skip Python lockfiles with warning per PM assumption)
- Blocked by: none — standalone; no dependency on F15 (`loadPolicy`) or any other Sprint 4 feature

## Effort
M — Single new command handler with three comparison passes and full edge case coverage. No new patterns; all parser and output wiring already exists.

## Metadata
- Agent: pm
- Date: 2026-04-11
- Sprint: 4
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
