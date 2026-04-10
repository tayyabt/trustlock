# Design Approach: F11-S1 pnpm Lockfile Parser

## Summary

Implement `src/lockfile/pnpm.js` — a pure, line-by-line YAML parser for pnpm-lock.yaml v5, v6, and v9 — and extend `src/lockfile/parser.js` to detect and route `pnpm-lock.yaml` to it. No external YAML library is used (ADR-001). The parser handles v5/v6 key-path decoding, v9 explicit-field reads, `hasBin`/`requiresBuild` mapping, workspace importer filtering, and exits 2 for unsupported lockfileVersion values.

## Key Design Decisions

1. **Line-by-line YAML state machine (ADR-001)**: pnpm lockfiles use a highly predictable subset of YAML — block mappings, inline flow mappings for resolution, block sequences for importers, and quoted keys for scoped packages. A purpose-built parser covers exactly what pnpm emits with zero dependencies.

2. **Version dispatch on `lockfileVersion` field only**: v5 and v6 use slash/@ separator in package keys; v9 uses explicit `name:` and `version:` fields. Dispatch is controlled exclusively by the `lockfileVersion` integer (v5→v5 parser, 6→v6 parser, 9→v9 parser). Structural heuristics are not used (per story behavioral rule).

3. **process.exit(2) inside parsePnpm for unsupported versions**: Consistent with how `parser.js` calls `process.exit(2)` for unsupported npm versions. Keeps the behavior co-located with the parser.

4. **Workspace filtering in v9**: Parse `importers` and `packages` sections into separate in-memory maps in a single pass, then apply the `projectRoot` filter after. This avoids two-pass file reads.

5. **pnpm branch before JSON.parse in parser.js**: `pnpm-lock.yaml` is YAML, not JSON. The pnpm branch in `parseLockfile` fires on filename BEFORE the JSON.parse attempt, so the npm path is completely unchanged.

## Integration / Wiring

- **Caller-side (parser.js)**: This story adds the `pnpm-lock.yaml` filename branch to both `detectFormat` and `parseLockfile`. The branch reads the lockfileVersion via `_parsePnpmLockfileVersion()` inlined in parser.js and delegates to `parsePnpm(content, projectRoot)`.
- **Callee-side (pnpm.js)**: New file. `parsePnpm(content, projectRoot)` validates the version, dispatches to `_parseV5V6` or `_parseV9`, and returns `ResolvedDependency[]`.
- **npm path**: Unchanged. The npm branch is entered only for non-pnpm-lock.yaml filenames.
- **Deferred**: yarn support (F11-S2). `parser.js` already has a placeholder comment; the yarn branch is not added in this story.

## Files to Create/Modify

- `src/lockfile/pnpm.js` — new parser; pure function; no I/O; no registry imports
- `src/lockfile/parser.js` — add pnpm-lock.yaml branch to `detectFormat` and `parseLockfile`
- `test/fixtures/lockfiles/pnpm-v5.yaml` — plain + scoped package, hasBin, requiresBuild
- `test/fixtures/lockfiles/pnpm-v6.yaml` — same coverage in v6 key format
- `test/fixtures/lockfiles/pnpm-v9.yaml` — explicit name/version fields, requiresBuild
- `test/fixtures/lockfiles/pnpm-monorepo.yaml` — v9 with importers section, two workspaces
- `test/lockfile/pnpm.test.js` — unit + integration tests covering all ACs
- `test/lockfile/parser.test.js` — update pnpm detection test (pnpm now recognised)

## Testing Approach

Unit tests call `parsePnpm(content, projectRoot)` directly with fixture file content for isolation. Integration tests call `parseLockfile(fixturePath, null)` through the router to verify end-to-end wiring. Exit-2 tests intercept `process.exit` using the same helper pattern as `parser.test.js`.

## Acceptance Criteria / Verification Mapping

- AC1: v5 plain package name/version/integrity → `parseLockfile(pnpm-v5.yaml, null)` test verifying lodash fields
- AC2: v5 scoped package key-path decoding → test verifying `@babel/core` name and version from `/@babel/core/7.24.0:` key
- AC3: v9 name:/version: field reads → test verifying lodash from pnpm-v9.yaml using explicit fields, not key path
- AC4: hasBin/requiresBuild → `hasInstallScripts: true`; neither → null → parameterised tests across fixtures
- AC5: workspace filtering → `parseLockfile(pnpm-monorepo.yaml, 'packages/backend')` returns only express; nonexistent returns []
- AC6: unknown lockfileVersion exits 2 → exit-2 interceptor test with inline YAML content
- AC7: npm unchanged → existing `parseLockfile(package-lock.json, package.json)` integration test still passes
- AC8: no registry/ imports → static grep check
- AC9: module resolves → `node --input-type=module -e "import './src/lockfile/pnpm.js'"` exits 0

## Verification Results

(Populated after implementation and test run)

- AC1: PASS — `parseLockfile(pnpm-v5.yaml, null)` lodash: name=lodash, version=4.17.21, integrity=sha512-v2kDEe57...
- AC2: PASS — `parseLockfile(pnpm-v5.yaml, null)` @babel/core: name=@babel/core, version=7.24.0
- AC3: PASS — `parseLockfile(pnpm-v9.yaml, null)` lodash: reads name: lodash, version: 4.17.21 from fields
- AC4: PASS — requiresBuild: true → hasInstallScripts: true; hasBin: true → hasInstallScripts: true; neither → null
- AC5: PASS — packages/backend → [express]; packages/nonexistent → []
- AC6: PASS — exit 2 with "Unsupported pnpm lockfile version 99. trustlock supports v5, v6, v9."
- AC7: PASS — existing npm integration test in parser.test.js unmodified and passing
- AC8: PASS — no import of src/registry/ in pnpm.js (grep confirms)
- AC9: PASS — module import exits 0

## Story Run Log Update

### 2026-04-10 Developer: Implementation

Implemented pnpm lockfile parser (v5/v6/v9) with line-by-line YAML state machine. Extended parser.js with pnpm-lock.yaml detection branch. Updated parser.test.js pnpm detection test to reflect that pnpm is now a recognised format. All ACs verified via `node --test test/lockfile/pnpm.test.js` and `node --test test/lockfile/parser.test.js`.

## Documentation Updates

None — no new environment variables, interfaces, or operator-visible behavior beyond the CHANGELOG-level addition of pnpm support.

## Deployment Impact

None — pure code addition in `src/lockfile/`.

## Questions/Concerns

None.
