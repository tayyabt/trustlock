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

## Regression Traps
- Adding v2/v3 parsing must not break v1. Each version path is independent.
- Changing `ResolvedDependency` model fields requires updating ALL parsers — the common model is a contract.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: lockfile
