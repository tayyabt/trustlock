# Docs Closeout: Sprint 4

## Summary

Sprint 4 ships trustlock v0.3.0 — Python ecosystem support (pip/uv lockfile parsers, PyPI registry adapter), org policy inheritance via `extends`, and the cross-project audit command (`trustlock audit --compare`). All five sprint-4 delivery tasks are marked `done` and reviewed.

This closeout also captures sprint 3 (v0.2.0) features that were not documented in a dedicated sprint-3 docs closeout: pnpm/yarn lockfile parsers, output redesign, SARIF output, policy profiles, publisher identity, monorepo root resolution, and the BUG-001 fix. The last docs closeout was for sprint 2 (DOCS-CLOSEOUT-2.md), so this closeout covers sprints 3 and 4 together.

---

## Sprint 4 Delivered (task-072 – task-076)

| Task | Story | Outcome |
|------|-------|---------|
| task-072 | F15-S1 policy/inherit.js | Shipped — `src/policy/inherit.js`; 25/25 tests pass; review approved |
| task-073 | F15-S2 policy/loader.js | Shipped — `src/policy/loader.js`; all four commands wired; PR #18 |
| task-074 | F16-S1 Python lockfile parsers | Shipped — `src/lockfile/requirements.js`, `src/lockfile/uv.js`, `ecosystem` field on `ResolvedDependency`; PR #16 |
| task-075 | F16-S2 PyPI registry adapter | Shipped — `src/registry/pypi.js`, `client.js` ecosystem dispatch; PR #19 |
| task-076 | F17-S1 Cross-project audit | Shipped — `src/cli/commands/cross-audit.js`; 24 unit + 17 integration tests pass; review approved; merged via PR #17 |

## Sprint 3 Delivered (task-059 – task-071, not previously closed out)

| Task | Story | Outcome |
|------|-------|---------|
| task-059 | F09-S1 Monorepo root resolution | Shipped — `src/utils/paths.js`, `src/utils/git.js`, `--project-dir` flag; PR #2 |
| task-060 | F10-S1 Progress counter | Shipped — `src/utils/progress.js`, TTY-aware progress on check; PR #3 |
| task-061 | F10-S2 Terminal output redesign | Shipped — grouped output redesign in `src/output/terminal.js`; PR #6 |
| task-062 | F10-S3 JSON schema v2 | Shipped — `schema_version: 2`, structured grouped JSON shape; PR #9 |
| task-063 | F10-S4 CLI integration | Shipped — `--sarif`, `--quiet`, `--profile`, `--project-dir` flags wired; PR #11 |
| task-064 | F11-S1 pnpm parser | Shipped — `src/lockfile/pnpm.js` (v5/v6/v9); PR #4 |
| task-065 | F11-S2 yarn parser | Shipped — `src/lockfile/yarn.js` (classic and berry); PR #7 |
| task-066 | F12-S01 Publisher identity + baseline v2 | Shipped — publisher identity tracking, baseline schema v2; PR #14 |
| task-067 | F13-S1 SARIF formatter | Shipped — `src/output/sarif.js`, SARIF 2.1.0; PR #10 |
| task-068 | F13-S2 SARIF CLI wiring | Shipped — `--sarif` flag wired to check.js; PR #8 |
| task-069 | F14-S1 Built-in profiles | Shipped — `src/policy/builtin-profiles.js`, `strict`/`relaxed` profiles; PR #5 |
| task-070 | F14-S2 --profile flag + check wiring | Shipped — `--profile` flag on check.js and all policy-using commands; PR #12 |
| task-071 | BUG fix: progress.test.js location | Shipped — test file moved to correct location; PR #13 |
| task-041 | BUG-001: approval command rule names | Shipped — terminal formatter now emits short rule names in generated approval commands |

---

## Docs Changes This Closeout

### Updated: `README.md`

- Changed project description from "npm projects" to "npm, pnpm, yarn, and Python projects"
- Replaced bullet "how long since published to npm" with ecosystem-neutral wording across all signal descriptions
- Added "Publisher change" signal to the trust signals list
- Added "Supported lockfiles" table (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `requirements.txt`, `uv.lock`)
- Updated workflow 1 comment: removed "(requires package-lock.json)" since multiple lockfiles are now supported
- Added Workflow 4 for `audit --compare`
- Added `trustlock audit --compare <dir...>` to the commands table
- Added "Policy profiles" section with `strict`/`relaxed` table and `--profile strict` example
- Added "Org policy inheritance" section with `extends` example

### Updated: `OVERVIEW.md`

- Changed project description to include all four ecosystems
- Added paragraph explaining the consistent trust model across ecosystems
- Updated "How it works" registry reference from "npm registry" to "registry (npm or PyPI depending on ecosystem)"
- Added `publisher-change` rule to the trust signals table
- Added "Policy profiles and inheritance" section before "Key design constraints"
- Updated "Key design constraints": removed "npm lockfile only (v0.1)" constraint; replaced with accurate multi-ecosystem support statement

### Updated: `CHANGELOG.md`

- Added `[0.3.0] — 2026-04-11` entry: Python ecosystem (F16), policy inheritance (F15), cross-project audit (F17)
- Added `[0.2.0] — 2026-04-10` entry: monorepo root (F09), output redesign (F10), pnpm/yarn parsers (F11), publisher identity (F12), SARIF (F13), policy profiles (F14), BUG-001 fix
- Marked BUG-001 in v0.1.0 known-issues section as "Fixed in v0.2.0"

### Verified accurate (no changes needed)

- **`USAGE.md`** — Sprint 3 flags (`--sarif`, `--quiet`, `--profile`, `--project-dir`) and the `audit --compare` command are not yet reflected in USAGE.md. These are deferred to the USAGE.md update tracked below.
- **`POLICY-REFERENCE.md`** — The `extends` key is not yet in POLICY-REFERENCE.md. Deferred to USAGE/POLICY-REFERENCE update.
- **`ARCHITECTURE.md`** — Module map does not yet include new modules (policy/inherit.js, policy/loader.js, lockfile/requirements.js, lockfile/uv.js, registry/pypi.js, cli/commands/cross-audit.js). Deferred to ARCHITECTURE.md update.
- **`examples/`** — Existing examples accurate for v0.1 behavior; no new examples created this sprint.

### Deferred doc work (not in this task scope)

The following docs need a follow-up pass (not blocking sprint closeout):
- `USAGE.md`: add `--sarif`, `--quiet`, `--profile`, `--project-dir`, `audit --compare` to command reference
- `POLICY-REFERENCE.md`: add `extends` field documentation
- `ARCHITECTURE.md`: update module map to include sprint 3+4 modules

---

## Verification Basis

- task-072 review (`docs/reviews/task-072-review.md`): Approved, 25/25 tests pass
- task-076 review (`docs/reviews/task-076-review.md`): Approved, 24 unit + 17 integration tests pass, `loadPolicy` grep clean
- task-073: `src/policy/loader.js` present in worktree; PR #18 marked done
- task-074: `src/lockfile/requirements.js`, `src/lockfile/uv.js` present in worktree; PR #16 marked done
- task-075: `src/registry/pypi.js` present in worktree; PR #19 marked done
- Sprint 3 tasks: all 13 delivery tasks marked done in `tasks/backlog.csv`; PRs #2–#14 merged or done
- `package.json`: version is `0.1.0` — version bump to 0.3.0 is deferred to sprint closeout (task-078)

---

## Metadata

- Agent: docs-closer
- Date: 2026-04-11
- Task: task-077
- Sprint: 4
