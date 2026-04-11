# Design Approach: F16-S1 Python lockfile parsers (requirements.txt + uv.lock)

## Summary

Adds Python ecosystem lockfile parsing to trustlock by implementing two new pure parser modules (`requirements.js` and `uv.js`) and extending the format-detection router to dispatch to them. Also retrofits the `ecosystem` discriminant field onto the existing npm/pnpm parsers and the `ResolvedDependency` model — this is the seam that the forthcoming PyPI registry adapter (F16-S2) consumes.

The work is entirely within the `lockfile` module. Both new parsers are pure functions: `(content: string) → ResolvedDependency[]`. No I/O, no network, no registry imports.

## Key Design Decisions

1. **`ecosystem` field added to `validateDependency`**: Required field with values `'npm'` | `'pypi'`. All existing callers (npm.js, pnpm.js) explicitly pass `ecosystem: 'npm'`; new Python parsers pass `ecosystem: 'pypi'`. No parser may omit it.
2. **`sourceType` field retained** (not renamed to `source`): The story uses `source:` in prose/AC descriptions but the existing model field is `sourceType`. All Python parsers use `sourceType` to match the model — `SOURCE_TYPES.registry`, `SOURCE_TYPES.file`, `SOURCE_TYPES.git`, `SOURCE_TYPES.url`.
3. **Purpose-built TOML subset for uv.lock** (ADR-001): No external TOML library. Line-by-line parser handles only the constructs uv.lock emits: `[[package]]` section headers, `key = "value"` pairs, `source = { type = "...", ... }` inline tables. Unknown keys silently skipped.
4. **PEP 508 normalization**: Lowercase + replace `_` with `-`. Applied to every package name before building the `ResolvedDependency`.
5. **pip-compile `# via` multi-line form**: After a package line, if next non-blank comment line starts with `#   ` (4 spaces) this is the multi-package via form. All names captured and joined with `, `.
6. **Parser.js detection order**: `package-lock.json` > `pnpm-lock.yaml` > `yarn.lock` > `requirements.txt` > `uv.lock` as specified in the story. `requirements.txt` dispatches without parsing as JSON.
7. **yarn.js**: No `src/lockfile/yarn.js` exists in this worktree yet (it's a future story). The AC for yarn ecosystem retrofit is satisfied vacuously — there is no yarn parser to update. Documented here so reviewer is aware.

## Integration / Wiring

- **Caller**: `src/lockfile/parser.js:parseLockfile()` — already exists; gains two new filename branches.
- **Callees**: `src/lockfile/requirements.js` and `src/lockfile/uv.js` — new files, fully owned by this story.
- **Model**: `src/lockfile/models.js` — `ecosystem` field added to `validateDependency`; `ECOSYSTEMS` constant exported.
- **Seam to F16-S2**: `ecosystem: 'pypi'` on every Python `ResolvedDependency`. `registry/client.js` dispatch is F16-S2's responsibility; not touched here.
- **`requirements.txt` branch**: No `package.json` companion needed; second argument to `parseLockfile` is unused for Python paths.
- **`uv.lock` branch**: Same — no companion file needed.

## Files to Create/Modify

- `src/lockfile/models.js` — add `ecosystem` field and `ECOSYSTEMS` constant; update `validateDependency` to require it
- `src/lockfile/npm.js` — add `ecosystem: 'npm'` to every `validateDependency` call
- `src/lockfile/pnpm.js` — add `ecosystem: 'npm'` to `_buildDep`
- `src/lockfile/parser.js` — add `requirements.txt` and `uv.lock` detection branches; import new parsers
- `src/lockfile/requirements.js` — new file; pip requirements.txt parser
- `src/lockfile/uv.js` — new file; uv.lock TOML subset parser
- `test/fixtures/lockfiles/requirements-basic.txt` — fixture: exact pins, hash, URL requirement
- `test/fixtures/lockfiles/requirements-piped.txt` — fixture: pip-compile with `# via`, unpinned entry
- `test/fixtures/lockfiles/uv-basic.lock` — fixture: two registry packages, one git source
- `test/fixtures/lockfiles/uv-source-path.lock` — fixture: source.path entry alongside registry entry
- `test/lockfile/requirements.test.js` — unit tests for all requirements.js ACs
- `test/lockfile/uv.test.js` — unit tests for all uv.js ACs

## Testing Approach

- Node.js built-in test runner (`node:test`), matching existing test style.
- Each test file covers the parser in isolation using fixture files.
- Integration-style tests call `parseLockfile()` from `parser.js` to verify routing.
- `models.test.js` updated to assert `ecosystem` field is required and validated.

## Acceptance Criteria / Verification Mapping

- AC1 (requirements-basic.txt exact pins) → `test/lockfile/requirements.test.js` "parses exact-pinned packages"
- AC2 (PEP 508 normalization Pillow/my_package) → `test/lockfile/requirements.test.js` "normalizes package names"
- AC3 (hash integrity) → `test/lockfile/requirements.test.js` "stores hash as integrity"
- AC4 (URL requirement source: url) → `test/lockfile/requirements.test.js` "classifies URL requirements"
- AC5 (pip-compile # via) → `test/lockfile/requirements.test.js` "captures via annotation"
- AC6 (unpinned pinned: false) → `test/lockfile/requirements.test.js` "returns unpinned with pinned: false"
- AC7 (uv-basic.lock registry entries) → `test/lockfile/uv.test.js` "parses registry entries"
- AC8 (source.path → source: file in output) → `test/lockfile/uv.test.js` "returns source.path with sourceType: file"
- AC9 (source.git → source: git) → `test/lockfile/uv.test.js` "classifies git source"
- AC10 (ecosystem: pypi on all entries) → checked across both test files
- AC11 (existing parsers ecosystem: npm) → `test/lockfile/npm.test.js` extended; `parseLockfile` npm-v3.json test
- AC12 (no registry imports) → `node --input-type=module` import check
- AC13 (import resolve without error) → `node --input-type=module` import check
- AC14 (C-NEW-3 ecosystem field in models) → `test/lockfile/models.test.js` extended

## Verification Results

- AC1 (requirements-basic.txt exact pins) → PASS — `node --test test/lockfile/requirements.test.js` (21/21 pass)
- AC2 (PEP 508 normalization) → PASS — Pillow→pillow, my_package→my-package; inline normalization tests pass
- AC3 (hash integrity) → PASS — `sha256:...` stored on requests entry
- AC4 (URL requirement source: url) → PASS — `direct-dep @ https://...` → sourceType: url, resolved set
- AC5 (pip-compile # via) → PASS — single-package and multi-package via forms both captured
- AC6 (unpinned pinned: false) → PASS — setuptools>=65.0.0 returned with pinned: false; all range operators tested
- AC7 (uv-basic.lock registry entries) → PASS — `node --test test/lockfile/uv.test.js` (14/14 pass); router dispatch tested with temp uv.lock
- AC8 (source.path → sourceType: file, in output) → PASS — my-local-lib present with sourceType: file
- AC9 (source.git → sourceType: git) → PASS — my-git-dep with sourceType: git
- AC10 (ecosystem: pypi on all entries) → PASS — verified for both requirements.js and uv.js parsers
- AC11 (existing npm/pnpm parsers set ecosystem: npm) → PASS — parseNpm+parsePnpm all pass; `parseLockfile(package-lock.json)` all entries have ecosystem: npm; `parseNpm(npm-v3.json)` all entries npm
- AC12 (no registry imports) → PASS — grep test in both requirements.test.js and uv.test.js passes
- AC13 (import resolves without error) → PASS — `node --input-type=module -e "import './src/lockfile/requirements.js'"` and uv.js both OK
- AC14 (C-NEW-3 ecosystem field in models) → PASS — `node --test test/lockfile/models.test.js` (25/25 pass); ecosystem validation added

Full suite: `node --test test/lockfile/*.test.js` → 148/148 pass

## Story Run Log Update

### 2026-04-11 developer: Implementation

Implementing F16-S1: Python lockfile parsers for requirements.txt and uv.lock.

## Documentation Updates

None — no new env vars, interfaces, or operator workflows.

## Deployment Impact

None.

## Questions/Concerns

- `yarn.js` does not exist yet in this codebase. The AC says "yarn parsers now set ecosystem: 'npm'" but there is no yarn parser to update. This is flagged as a no-op for yarn — the yarn parser will set `ecosystem: 'npm'` when it is implemented in its own story.
- The story uses `source:` in prose but the model uses `sourceType`. All implementations use `sourceType` to be consistent with the existing model.

## Metadata

- Agent: developer
- Date: 2026-04-11
- Work Item: F16-S1 / task-074
- Work Type: story
- Branch: burnish/task-074-implement-python-lockfile-parsers-requirements-txt-uv-lock
- ADR: ADR-001, ADR-004
