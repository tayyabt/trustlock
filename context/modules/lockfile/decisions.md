# Module Decisions: Lockfile

## Durable Decisions
1. Fail hard on unknown lockfile version
   - Why: Silent misparse is worse than a clear error. The parser must be updated for new versions, not guess.
   - Consequence: Exit 2 with message "Unsupported npm lockfile version X. trustlock supports v1, v2, v3."

2. Use `packages` map for v2 and v3, `dependencies` tree for v1 only
   - Why: `packages` is the canonical format in v2+. The `dependencies` tree in v2 is backward-compat only.
   - Consequence: v1 parser logic is separate from v2/v3 parser logic, even though the file structure overlaps.

3. `null` for unavailable fields, not defaults
   - Why: Defaulting `hasInstallScripts` to `false` when the lockfile doesn't say is a lie. `null` signals "unknown, fetch from registry."
   - Consequence: Policy engine must handle `null` for `hasInstallScripts` and fetch from registry when needed.

4. Direct dependency detection uses package.json
   - Why: Lockfile doesn't always distinguish direct from transitive. Reading `dependencies` and `devDependencies` from `package.json` is authoritative.
   - Consequence: Parser reads both the lockfile and `package.json` in the same directory.

## Deferred Decisions
- pnpm-lock.yaml parser (v0.2) — separate parser file, same common model
- yarn.lock parser (v0.2) — separate parser file, same common model

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: lockfile
