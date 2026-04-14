# Story: F16-S1 — Python lockfile parsers (requirements.txt + uv.lock)

## Parent
F16: Python Ecosystem: Parsers + PyPI Adapter

## Description
Implement `src/lockfile/requirements.js` (pip requirements.txt) and `src/lockfile/uv.js` (uv.lock TOML), extend the format-detection router to dispatch these new formats, and add the `ecosystem` discriminant field to `ResolvedDependency`. This makes trustlock parse Python lockfiles and produce the correct `ecosystem: 'pypi'` signal that the PyPI registry adapter (F16-S2) reads for dispatch.

## Scope
**In scope:**
- `src/lockfile/models.js` — add `ecosystem: 'npm' | 'pypi'` field to `ResolvedDependency` (C-NEW-3); existing npm parsers set `ecosystem: 'npm'`
- `src/lockfile/requirements.js` — new pure parser; handles exact pins, URL requirements, PEP 508 name normalization, pip-compile `# via` annotations, hash lines, unpinned ranges
- `src/lockfile/uv.js` — new purpose-built line-by-line TOML parser scoped to constructs uv.lock actually emits; handles `[[package]]`, inline key-value, inline tables, arrays
- `src/lockfile/parser.js` — extend format detection: `.txt` (requirements.txt) and `uv.lock` filename branches; dispatch to `requirements.js` / `uv.js`
- Test fixtures in `test/fixtures/lockfiles/`: `requirements-basic.txt`, `requirements-piped.txt` (pip-compile with `# via`), `uv-basic.lock`, `uv-source-path.lock`
- Unit tests for both new parsers

**Not in scope:**
- `src/registry/pypi.js` — this is F16-S2; the `ecosystem: 'pypi'` field is the seam, not the registry implementation
- Policy engine changes — the `source: file` exclusion for `source.path` entries is enforced by the policy engine reading the `source` field; this story sets it correctly
- Any pip-compile `-c` constraint file parsing — only the output `requirements.txt` format

## Entry Points
- Route / page / screen: CLI entry — all commands that call `parseLockfile()` reach the new Python branches through the router
- Trigger / navigation path: `trustlock init`, `trustlock check`, `trustlock approve`, `trustlock audit` in a Python project directory containing `requirements.txt` or `uv.lock`
- Starting surface: `src/lockfile/parser.js:parseLockfile(lockfilePath, projectRoot?)` — exists; this story adds the `requirements.txt` and `uv.lock` detection branches

## Wiring / Integration Points
- Caller-side ownership: `src/lockfile/parser.js` owns format detection. This story adds two new filename branches: `requirements.txt` → `requirements.js`, `uv.lock` → `uv.js`. Detection order: `package-lock.json` > `pnpm-lock.yaml` > `yarn.lock` > `requirements.txt` > `uv.lock`.
- Callee-side ownership: `requirements.js` and `uv.js` are new files; this story owns their full implementation. Both return `ResolvedDependency[]` with `ecosystem: 'pypi'` set on every entry.
- Caller-side conditional rule: The caller (`parser.js`) already exists. Wire it to the two new callees now — no deferred seam.
- Callee-side conditional rule: `pypi.js` (F16-S2) does not exist yet. The `ecosystem: 'pypi'` field on each `ResolvedDependency` is the explicit seam for registry dispatch. F16-S2 reads this field from `registry/client.js` to route to the PyPI adapter.
- Boundary / contract check: Integration test calls `parseLockfile('test/fixtures/lockfiles/requirements-basic.txt', null)` and verifies every returned entry has `ecosystem: 'pypi'`; same for `uv-basic.lock`.
- Files / modules to connect: `src/lockfile/parser.js` → `src/lockfile/requirements.js` and `src/lockfile/uv.js`; `src/lockfile/models.js` updated for both callers
- Deferred integration, if any: `registry/client.js` dispatch on `ecosystem` field is F16-S2. This story sets the field; F16-S2 consumes it.

## Not Allowed To Stub
- PEP 508 name normalization in `requirements.js`: lowercase + hyphen/underscore equivalence must be applied to every parsed package name before returning; no pass-through of raw names
- pip-compile `# via` annotation parsing: the text after `# via` must be captured and stored; enriches SARIF `message.text` in F13 (D10); ruleId remains `transitive`
- Hash lines (`--hash=sha256:...`) in requirements.txt: stored as `integrity` value on the entry; do not drop them
- URL requirements (`package @ https://...`): classified as `source: 'url'`; name and URL extracted
- Unpinned requirements (`>=`, `<=`, `~=`, `!=`, `>`, `<`): parsed and returned with a flag that triggers the `pinning` rule; do not silently skip them
- `uv.lock` `source.path` entries: must set `source: 'file'` on the returned `ResolvedDependency`; the policy engine uses this to exclude them entirely (C12); they must appear in the parsed output with `source: 'file'` so the policy engine can skip them — do not drop them before returning
- `uv.lock` `source.git` entries: classified as `source: 'git'`; treated as supply-chain sources; included in output
- `uv.lock` purpose-built TOML parser: must be hand-rolled using Node.js built-ins only (ADR-001); no external TOML library; scope is limited to `[[package]]`, inline key-value, inline tables, and arrays as emitted by uv
- `src/lockfile/models.js` `ecosystem` field: must be added as a required field; existing npm parsers (`npm.js`, `pnpm.js`, `yarn.js`) must be updated to set `ecosystem: 'npm'`; no parser may omit the field

## Behavioral / Interaction Rules
- Both `requirements.js` and `uv.js` are pure functions — no I/O, no network calls, no imports from `src/registry/`
- PEP 508 normalization: lowercase the name; treat `-` and `_` as equivalent (replace all `_` with `-`); strip leading/trailing whitespace
- `# via` annotation is on the line immediately after the package entry in pip-compile output; if multiple packages are listed after `via`, capture all of them as a comma-separated string
- Unpinned entries are returned as valid `ResolvedDependency` with a `pinned: false` field (or equivalent flag); the existing `pinning` rule reads this flag — do not gate on version format inside the parser
- Unknown/unrecognized TOML constructs in `uv.lock` that are outside the declared scope: skip silently (do not exit 2; uv may add new fields in minor versions that trustlock does not care about)
- `source.path` entries in `uv.lock` are returned in the output array with `source: 'file'` — they are NOT filtered out here; the policy engine (C12) owns the exclusion decision

## Acceptance Criteria
- [ ] `parseLockfile('test/fixtures/lockfiles/requirements-basic.txt', null)` returns `ResolvedDependency[]` with correct `name`, `version`, `ecosystem: 'pypi'` for exact-pinned packages (`package==1.2.3` format).
- [ ] PEP 508 name normalization: `Pillow==9.0.0` and `pillow==9.0.0` produce the same normalized name; `my_package==1.0.0` and `my-package==1.0.0` produce the same normalized name.
- [ ] Hash lines: `--hash=sha256:abc123` stored as `integrity: 'sha256:abc123'` on the entry.
- [ ] URL requirement (`package @ https://example.com/pkg.tar.gz`): `source: 'url'`; name extracted from left of `@`.
- [ ] pip-compile `# via` annotation: `via` text captured and available on the entry; integration test fixture `requirements-piped.txt` includes at least one `# via pkg` annotation.
- [ ] Unpinned requirement (`requests>=2.28.0`): returned with `pinned: false`; no exit 2.
- [ ] `parseLockfile('test/fixtures/lockfiles/uv-basic.lock', null)` returns `ResolvedDependency[]` with correct `name`, `version`, `ecosystem: 'pypi'`, `source: 'registry'` for registry entries.
- [ ] `source.path` entry in `uv-source-path.lock` fixture: returned with `source: 'file'`; present in output array (not dropped); policy engine can inspect the `source` field.
- [ ] `source.git` entry: returned with `source: 'git'`.
- [ ] `ecosystem: 'pypi'` is set on every entry returned by both `requirements.js` and `uv.js`.
- [ ] Existing npm, pnpm, and yarn parsers now set `ecosystem: 'npm'` on every entry; `parseLockfile('test/fixtures/lockfiles/npm-v3.json', null)` returns entries with `ecosystem: 'npm'`.
- [ ] `src/lockfile/requirements.js` and `src/lockfile/uv.js` do not import any module from `src/registry/`.
- [ ] `node --input-type=module -e "import './src/lockfile/requirements.js'"` and `import './src/lockfile/uv.js'` both resolve without error.
- [ ] C-NEW-3 (a): `ResolvedDependency` model in `models.js` includes the `ecosystem` discriminant field.

## Task Breakdown
1. Update `src/lockfile/models.js` — add `ecosystem: 'npm' | 'pypi'` field to `ResolvedDependency`; update `validateDependency` to require it
2. Update `src/lockfile/npm.js`, `src/lockfile/pnpm.js`, `src/lockfile/yarn.js` — set `ecosystem: 'npm'` on every returned entry
3. Create `test/fixtures/lockfiles/requirements-basic.txt` — plain exact-pin entries, one URL requirement, one hash line
4. Create `test/fixtures/lockfiles/requirements-piped.txt` — pip-compile output with `# via` annotation on at least two packages; include one unpinned entry
5. Create `src/lockfile/requirements.js` — implement line-by-line parser; PEP 508 normalization; hash lines; URL requirements; unpinned detection; `# via` annotation capture; return `ResolvedDependency[]` with `ecosystem: 'pypi'`
6. Create `test/fixtures/lockfiles/uv-basic.lock` — at least two registry packages, one git source
7. Create `test/fixtures/lockfiles/uv-source-path.lock` — at least one `source.path` entry alongside a registry entry
8. Create `src/lockfile/uv.js` — implement purpose-built line-by-line TOML parser; handle `[[package]]` sections, inline key-value, `source.type` dispatch (`registry`, `path`, `git`); return `ResolvedDependency[]` with `ecosystem: 'pypi'`
9. Extend `src/lockfile/parser.js` — add `requirements.txt` and `uv.lock` filename detection branches; dispatch to new parsers; preserve existing detection order
10. Write unit tests for `requirements.js` in `test/lockfile/requirements.test.js` covering all AC items
11. Write unit tests for `uv.js` in `test/lockfile/uv.test.js` covering all AC items
12. Run existing parser tests to confirm `ecosystem: 'npm'` retrofit did not break anything

## Verification
```
node --test test/lockfile/requirements.test.js
# Expected: all tests pass, no errors

node --test test/lockfile/uv.test.js
# Expected: all tests pass, no errors

node --test test/lockfile/parser.test.js
# Expected: existing npm/pnpm/yarn tests still pass; new Python detection tests pass

node --test test/lockfile/models.test.js
# Expected: ecosystem field validation passes for both 'npm' and 'pypi'
```

## Edge Cases to Handle
- PEP 508 name normalization: `Pillow` / `pillow` / `PIL` are not all the same — only case and hyphen/underscore equivalence apply; do not conflate distinct package names
- pip-compile `# via` on multiple packages: `# via\n#   pkgA\n#   pkgB` multi-line form — capture all names
- Blank lines and comment-only lines in requirements.txt — skip silently
- `uv.lock` `source.path` entries — set `source: 'file'`, return in output, do not drop
- `uv.lock` `source.git` with `url` and `rev` subfields — `source: 'git'`; git URL stored
- Multiple `--hash` lines for a single requirements.txt entry — store the first hash as `integrity`; others are alternatives and may be ignored for the model (document choice in code comment)
- Unpinned entries with `>=`, `<=`, `~=`, `!=`, `>`, `<` — return with `pinned: false`; exact `==` pins → `pinned: true` (or omit for exact default)

## Dependencies
- Depends on: none (lockfile layer is a leaf; `models.js` is already in this module)
- Blocked by: none

## Effort
M — two hand-rolled parsers for different formats (line-by-line text and purpose-built TOML subset) plus a model field addition across all existing parsers; well-scoped but non-trivial.

## Metadata
- Agent: pm
- Date: 2026-04-11
- Sprint: 4
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
