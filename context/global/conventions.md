# Global Conventions: dep-fence

## Language and Runtime
- JavaScript (ES modules, `import`/`export`)
- Node.js >= 18.3
- No TypeScript in v0.1
- No build step — source files are the distribution

## Dependencies
- Zero runtime dependencies (ADR-001)
- Dev dependencies allowed for testing only
- `node:https`, `node:fs/promises`, `node:path`, `node:crypto`, `node:child_process`, `node:util` are the standard library modules used

## File Structure
- Source code in `src/` organized by module (cli, policy, lockfile, registry, baseline, approvals, output, utils)
- Tests in `test/` mirroring source structure (unit/, integration/)
- Test fixtures in `test/fixtures/` (lockfiles, policies, approvals, registry-responses)
- Documentation in `docs/`
- Examples in `examples/`

## Code Style
- Pure functions preferred — especially for parsers, rules, and formatters
- Each policy rule is a standalone function: `(dependency, baseline, registryData, policy) → Finding[]`
- Each lockfile parser is a standalone function: `(content: string) → ResolvedDependency[]`
- Error handling: throw on fatal errors (exit 2 cases), return error data for policy violations
- Async where needed (registry HTTP, file I/O), sync where possible (pure evaluation)

## Data Format
- All persisted data is JSON
- Timestamps are ISO 8601 UTC strings
- File writes are atomic: write to temp file, rename

## Naming
- Files: kebab-case (`trust-continuity.js`, `npm-registry.js`)
- Functions: camelCase (`parseLockfile`, `evaluateRule`)
- Constants: UPPER_SNAKE_CASE (`CACHE_TTL_HOURS`)
- Data models: PascalCase in comments/docs, plain objects in code (no classes)

## Testing
- Test framework: Node.js built-in test runner (`node:test`) or minimal external (vitest/jest — dev dependency only)
- All registry interactions mocked from fixtures
- Integration tests use temp directories with real file I/O
- Each policy rule has: should-admit, should-block, should-admit-with-approval, expired-approval test cases

## Git Integration
- `.dep-fence/baseline.json` — committed, auto-staged on advancement
- `.dep-fence/approvals.json` — committed, modified by approve/clean-approvals
- `.dep-fence/.cache/` — gitignored (D8)
- `.depfencerc.json` — committed, project root

## Output
- Terminal: ANSI colors (respect NO_COLOR and TERM=dumb)
- JSON: structured, matches CheckResult model
- All output to stdout. Errors to stderr.
