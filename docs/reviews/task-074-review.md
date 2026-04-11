# Review: task-074 — Python lockfile parsers (requirements.txt + uv.lock)

## Status

Ready for review.

## Summary

Implemented F16-S1: Python ecosystem lockfile parsing for trustlock.

- Added `ecosystem` discriminant field to `ResolvedDependency` model (required, `'npm' | 'pypi'`)
- Retrofitted `ecosystem: 'npm'` onto existing npm and pnpm parsers
- New `src/lockfile/requirements.js` — pip requirements.txt parser with PEP 508 normalization, hash integrity, URL requirements, pip-compile `# via` annotations, unpinned detection
- New `src/lockfile/uv.js` — purpose-built line-by-line TOML subset parser for uv.lock; handles `[[package]]`, inline source tables, `registry`/`path`/`git` dispatch
- Extended `src/lockfile/parser.js` router with `requirements.txt` and `uv.lock` branches
- 4 new test fixtures; 2 new test files; existing test files updated for `ecosystem` field
- 148 tests pass (0 fail); all 14 acceptance criteria PASS

## Files Changed

### Source
- `src/lockfile/models.js` — ecosystem field + ECOSYSTEMS constant + validation
- `src/lockfile/npm.js` — ecosystem: 'npm' added to all validateDependency calls
- `src/lockfile/pnpm.js` — ecosystem: 'npm' added to _buildDep
- `src/lockfile/parser.js` — requirements.txt and uv.lock branches added
- `src/lockfile/requirements.js` — new file
- `src/lockfile/uv.js` — new file

### Tests
- `test/lockfile/models.test.js` — ecosystem field tests added
- `test/lockfile/requirements.test.js` — new file (21 tests)
- `test/lockfile/uv.test.js` — new file (14 tests)

### Fixtures
- `test/fixtures/lockfiles/requirements-basic.txt` — new
- `test/fixtures/lockfiles/requirements-piped.txt` — new
- `test/fixtures/lockfiles/uv-basic.lock` — new
- `test/fixtures/lockfiles/uv-source-path.lock` — new

## Verification

```
node --test test/lockfile/models.test.js        → 25/25 pass
node --test test/lockfile/npm.test.js           → 39/39 pass
node --test test/lockfile/pnpm.test.js          → 33/33 pass
node --test test/lockfile/parser.test.js        → 16/16 pass
node --test test/lockfile/requirements.test.js  → 21/21 pass
node --test test/lockfile/uv.test.js            → 14/14 pass
Total: 148/148 pass
```

## Notes for Reviewer

- `yarn.js` does not exist in this codebase yet (no yarn parser story has shipped). The AC for "yarn parsers now set ecosystem: 'npm'" is vacuously satisfied. The yarn parser will set `ecosystem: 'npm'` when implemented.
- The router test for `uv.lock` dispatch writes the fixture content to a temp `uv.lock` file since fixtures are named `uv-basic.lock` (not `uv.lock`). This is consistent with how `parser.test.js` tests routing.
- `source.path` entries from `uv.lock` are returned in the output array with `sourceType: 'file'`. The policy engine (C12) owns the exclusion — the parser does not drop them.

## Metadata

- Agent: developer
- Date: 2026-04-11
- Task: task-074
