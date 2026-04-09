# Review: task-039 — End-to-End Integration Tests (F08-S6)

## Summary

Implemented `test/integration/cli-e2e.test.js` covering all 11 acceptance criteria for F08-S6.
Tests spawn the real `node src/cli/index.js` subprocess and verify exit codes, stdout/stderr,
filesystem state, and git staging behavior.

## Outcome

**All 11 tests pass.** `node --test test/integration/cli-e2e.test.js` → `pass 11, fail 0`

## Delivered Files

- `test/integration/cli-e2e.test.js` — integration test suite (11 test cases)
- `docs/design-notes/F08-S6-approach.md` — design note with approach and verification results

## Acceptance Criteria Coverage

| AC | Test Name | Result |
|---|---|---|
| `init` creates all required files | `init: creates .depfencerc.json, baseline.json...` | PASS |
| `check` no-changes | `check: no-changes — prints "No dependency changes"` | PASS |
| `check` admit + ADR-002 staging | `check: admit — updates and stages baseline` | PASS |
| `check` block + D1 | `check: block — blocked package prints reason...(D1)` | PASS |
| `approve` + re-check | `approve + re-check: admitted with approval` | PASS |
| `check --enforce` block → exit 1, no baseline write (D10) | `check --enforce: exits 1 on block` | PASS |
| `check --enforce` pass → exit 0, no baseline write (D10) | `check --enforce: exits 0 on pass` | PASS |
| `check --dry-run` no baseline write | `check --dry-run: no baseline write` | PASS |
| `clean-approvals` removes expired | `clean-approvals: removes expired entries` | PASS |
| `install-hook` creates executable hook | `install-hook: creates .git/hooks/pre-commit` | PASS |
| Full pipeline init→check→block→approve→re-check | `full pipeline: init → ...` | PASS |

## Key Design Choices

- **Block trigger**: `hasInstallScripts: true` in v3 lockfile → `execution:scripts` rule blocks
  without any registry calls. Simplest local-only trigger.
- **Registry isolation**: Cache pre-populated with `_cachedAt = Date.now()` before each `check`.
  No HTTP calls made during tests.
- **`init` test**: Runs real `dep-fence init` subprocess (makes one registry call per package);
  accepts both `provenanceStatus: null` (offline) and `'unverified'` (online) as valid.
- **Full pipeline**: Uses `dep-fence init --no-baseline` to avoid registry calls, then writes
  baseline.json manually from the lockfile's SHA-256 hash.

## No Stubs

No internal module behavior was stubbed. All tests exercise real subprocess behavior.
