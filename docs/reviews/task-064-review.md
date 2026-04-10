# Review Handoff: task-064 — pnpm lockfile parser (F11-S1)

## Status
Ready for review

## Summary
Implemented `src/lockfile/pnpm.js` — a zero-dependency, line-by-line YAML parser for pnpm-lock.yaml v5, v6, and v9. Extended `src/lockfile/parser.js` to detect and route `.yaml` files to the pnpm parser. All 9 acceptance criteria are verified PASS.

## Changes

### New files
- `src/lockfile/pnpm.js` — pnpm parser; exports `parsePnpm(content, projectRoot)`
- `test/lockfile/pnpm.test.js` — 33 tests covering all ACs
- `test/fixtures/lockfiles/pnpm-v5.yaml` — v5 fixture: plain + scoped + git pkg
- `test/fixtures/lockfiles/pnpm-v6.yaml` — v6 fixture: plain + scoped + hasBin
- `test/fixtures/lockfiles/pnpm-v9.yaml` — v9 fixture: explicit name/version fields, snapshots section
- `test/fixtures/lockfiles/pnpm-monorepo.yaml` — v9 monorepo with importers section

### Modified files
- `src/lockfile/parser.js` — added pnpm branch (filename `.endsWith('.yaml')`) in `detectFormat` and `parseLockfile`; npm path is unchanged
- `test/lockfile/parser.test.js` — updated pnpm detection test: pnpm-lock.yaml is now a recognised format; added detection-success test for v5

## Verification

All tests pass:
```
node --test test/lockfile/pnpm.test.js
# 33 tests, 33 pass, 0 fail

node --test test/lockfile/parser.test.js
# 16 tests, 16 pass, 0 fail

node --test test/lockfile/npm.test.js test/lockfile/models.test.js
# 55 tests, 55 pass, 0 fail

node --input-type=module -e "import './src/lockfile/pnpm.js'"
# exits 0

.burnish/check-no-stubs.sh
# check-no-stubs: OK
```

## AC Coverage

| AC | Status | Evidence |
|---|---|---|
| AC1: v5 plain pkg name/version/integrity | PASS | pnpm.test.js: `parsePnpm — v5 plain packages` |
| AC2: v5 scoped pkg key-path decoding | PASS | pnpm.test.js: `@babel/core: name decoded from /@babel/core/7.24.0:` |
| AC3: v9 name:/version: field reads | PASS | pnpm.test.js: `parsePnpm — v9 packages via explicit fields` |
| AC4: hasBin/requiresBuild → hasInstallScripts | PASS | pnpm.test.js: `parsePnpm — hasInstallScripts mapping (AC4)` |
| AC5: workspace filtering | PASS | pnpm.test.js: `parsePnpm — workspace filtering (AC5)` |
| AC6: unknown lockfileVersion exits 2 | PASS | pnpm.test.js: `parsePnpm — unsupported lockfileVersion (AC6)` |
| AC7: npm unchanged | PASS | pnpm.test.js: `parseLockfile — npm parsing unchanged (AC7)` + all npm.test.js pass |
| AC8: no registry/ imports | PASS | grep confirms only `./models.js` import |
| AC9: module resolves | PASS | `node --input-type=module -e "import './src/lockfile/pnpm.js'"` exits 0 |

## Notes for Reviewer

- The router uses `filename.endsWith('.yaml')` (not just `=== 'pnpm-lock.yaml'`) to support the `--lockfile <path>` override with any YAML lockfile name. ADR-004 lists `pnpm-lock.yaml` as the auto-detection filename; the broader `.yaml` check covers `--lockfile` usage.
- `_parseLockfileVersion` is exported from `pnpm.js` (prefixed with `_` to signal internal use) so `parser.js` can reuse it for `detectFormat` without duplicating the regex.
- `isDev` is read from the `dev: true/false` field in v5/v6 packages. In v9, it defaults to `false` (dev classification requires `package.json`, deferred to F11-S2 per spec).
- `directDependency` is `false` for all pnpm packages (pnpm lockfiles don't mark direct vs transitive; the importers section identifies direct deps by workspace, not globally).
