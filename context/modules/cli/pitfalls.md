# Module Pitfalls: CLI

## Known Pitfalls
1. `node:util.parseArgs` strictness
   - Why it happens: `parseArgs` with `strict: true` throws on unknown flags. With `strict: false` it silently ignores them. Neither is ideal.
   - How to avoid it: Use `strict: true` and catch the error to produce a helpful "unknown flag" message instead of a stack trace.

2. Pre-commit hook performance
   - Why it happens: `check` runs on every commit. If registry calls are slow (no cache, slow network), the hook feels sluggish.
   - How to avoid it: Cache-first design (ADR-003). Only fetch registry data for changed packages. Short-circuit on lockfile hash match (no changes).

3. Exit code confusion between advisory and enforce
   - Why it happens: In advisory mode, `check` exits 0 even when packages are blocked (it warns but doesn't prevent the commit). A developer might think "exit 0 = all good" when blocks exist.
   - How to avoid it: Terminal output makes the distinction clear. Blocked packages are shown in red even in advisory mode. A trailing line says "N packages blocked (advisory mode — commit allowed)."

## Regression Traps
- Adding new flags must not break existing flag combinations. Test all flag combinations in integration tests.
- `--enforce` and `--dry-run` interaction must be clear: `--enforce --dry-run` evaluates and reports but doesn't exit 1 on blocks.

## Metadata
- Agent: architect-foundation
- Date: 2026-04-08
- Module: cli
