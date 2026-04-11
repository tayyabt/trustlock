# Module Pitfalls: Lockfile

## Known Pitfalls
1. npm lockfile v2 backward-compat trap
   - Why it happens: npm lockfile v2 includes BOTH a `packages` map (new format) and a `dependencies` tree (v1 compat). Parsing the wrong one gives different results for transitive dependency detection.
   - How to avoid it: Always use `packages` map for v2 and v3. Only use `dependencies` tree for v1.

2. Scoped package name parsing
   - Why it happens: Scoped packages (`@scope/name`) appear differently in v1 vs v2/v3. In v1, they're nested under `dependencies.@scope/name`. In v2/v3, they're keyed as `node_modules/@scope/name` in the `packages` map.
   - How to avoid it: Normalize package names during parsing. Strip `node_modules/` prefix from v2/v3 keys.

3. `hasInstallScripts` availability
   - Why it happens: Only npm lockfile v3 includes `hasInstallScripts: true` in the `packages` entries. v1 and v2 don't have this field. Setting it to `false` instead of `null` would incorrectly mark packages as having no install scripts.
   - How to avoid it: Set to `null` when the lockfile format doesn't provide this information. Policy engine must check for `null` and fetch from registry.

4. Git and file dependencies in resolved URLs
   - Why it happens: Git dependencies have `resolved` URLs like `git+https://github.com/...#commit`. File dependencies have `resolved` as `file:../path`. These need correct source classification.
   - How to avoid it: Source classification function with explicit pattern matching, tested against fixture data.

5. Testing `process.exit` in async node:test functions
   - Why it happens: If a test mocks `process.exit` without making it throw, the real `process.exit` is bypassed but the async function continues executing. The test suite may abort or give false passes.
   - How to avoid it: Mock `process.exit` to throw (`throw Object.assign(new Error(...), { exitCode: code })`). Use `assert.rejects()` to capture the error and check `err.exitCode === 2`. Always restore both `process.exit` and `console.error` in `afterEach`.

6. `.endsWith('.yaml')` routes ALL YAML filenames to the pnpm parser
   - Why it happens: `parser.js` uses `filename.endsWith('.yaml')` (not `=== 'pnpm-lock.yaml'`) to support `--lockfile <any>.yaml` override. This is intentional for v0.2, but means any future YAML-format lockfile (if introduced) would silently enter the pnpm code path and produce confusing errors or wrong output.
   - How to avoid it: If a second YAML-based lockfile format is ever added (e.g. a hypothetical v0.3 format), add content-based disambiguation before the version dispatch — check for a distinguishing top-level key before calling `_parseLockfileVersion`. Files: `src/lockfile/parser.js:60,106`

7. `parseLockfile` npm format requires a non-null `packageJsonPath` second argument
   - Why it happens: The npm parser needs `package.json` to resolve `directDependency` and `isDev` fields. The router calls `readFile(packageJsonPath)` unconditionally for npm format. Passing `null` causes `readFile(null, 'utf8')` which throws → `process.exit(2)`.
   - How to avoid it: Python format callers (`requirements.txt`, `uv.lock`) accept `null` safely because they don't read a companion file. Npm callers must always provide a real path. Write npm integration tests with real fixture paths (e.g. `test/fixtures/lockfiles/package.json`), not `null`. Files: `src/lockfile/parser.js:147–154`.

8. AC11-class pitfall: new model fields must be explicitly asserted in existing parser tests
   - Why it happens: `validateDependency` enforces required fields by throwing, so adding a required field to the model makes existing tests implicitly verify it. But the story AC requires explicit assertions, and reviewers will flag their absence even when the behavior is correct.
   - How to avoid it: When a new required field is added to `models.js` and retrofitted onto existing parsers, add at least one explicit assertion for that field in the existing parser integration test (e.g. `assert.equal(lodash.ecosystem, 'npm')` in the `parseLockfile` integration test). Files: `test/lockfile/npm.test.js`, `test/lockfile/pnpm.test.js`.

## Regression Traps
- Adding v2/v3 parsing must not break v1. Each version path is independent.
- Changing `ResolvedDependency` model fields requires updating ALL parsers — the common model is a contract.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: lockfile
