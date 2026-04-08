# Global Architecture Context: dep-fence

## What This Is
dep-fence is a dependency admission controller for npm projects. It makes binary admit/block decisions on dependency changes based on trust continuity, release age, install-time behavior, and declared policy.

## Module Map

| Module | Purpose | Key Files |
|---|---|---|
| **cli** | Command routing, arg parsing, entry points | `src/cli/index.js`, `src/cli/commands/*.js`, `src/cli/args.js` |
| **policy** | Core evaluation engine — admit/block decisions | `src/policy/engine.js`, `src/policy/config.js`, `src/policy/rules/*.js`, `src/policy/decision.js` |
| **lockfile** | Parse lockfiles into common model | `src/lockfile/parser.js`, `src/lockfile/npm.js`, `src/lockfile/models.js` |
| **registry** | Fetch trust signals from npm, with caching | `src/registry/client.js`, `src/registry/npm-registry.js`, `src/registry/provenance.js`, `src/registry/cache.js` |
| **baseline** | Manage trusted state, compute deltas | `src/baseline/manager.js`, `src/baseline/diff.js` |
| **approvals** | Scoped, time-limited policy overrides | `src/approvals/store.js`, `src/approvals/validator.js`, `src/approvals/generator.js` |
| **output** | Format results for humans and machines | `src/output/terminal.js`, `src/output/json.js` |
| **utils** | Shared helpers | `src/utils/git.js`, `src/utils/semver.js`, `src/utils/time.js` |

## Layering Rules

```
cli → policy → [lockfile, registry, baseline, approvals] → output
                                                            utils (leaf)
```

- **cli** depends on policy and output. Never contains business logic.
- **policy** depends on lockfile, registry, baseline, approvals. Owns all admit/block decisions.
- **lockfile, registry, baseline, approvals** are independent of each other.
- **output** depends on nothing except data models. No business logic.
- **utils** is a leaf — depended on by any module, depends on nothing.

## Key Constraints

- **Zero runtime dependencies** (ADR-001). Pure Node.js built-ins only.
- **Node.js >= 18.3** for `node:util.parseArgs`.
- **ES modules** throughout.
- **All data is JSON files** read into memory. No database.

## Binding Product Decisions

These decisions are locked and must be respected by all implementation:

| ID | Decision | Impact |
|---|---|---|
| D1 | All-or-nothing baseline advance | If any dep blocked, no baseline advance for any |
| D2 | Approval valid in same commit | Pre-commit hook reads working tree, not previous commit |
| D3 | Removed deps — silent | No policy evaluation on removal |
| D4 | Cooldown clears_at required | Output must include exact UTC timestamp |
| D5 | Single lockfile in v0.1 | No multi-lockfile support |
| D6 | init fails if .dep-fence/ exists | Must delete first or use --force |
| D7 | Approver from git config | `git config user.name` or `--as` flag |
| D8 | Cache is gitignored | `.dep-fence/.cache/` never committed |
| D9 | No wildcard approvals | Must specify which rules to override |
| D10 | CI is read-only | `--enforce` never advances baseline |
| Q1 | Fail hard on unknown lockfile | Exit 2 on unrecognized format version |
| Q2 | Manual approval cleanup only | `check` skips expired, never deletes |

## Exit Codes

- **0:** All changes admitted (or no changes). Advisory mode always exits 0 even with blocks.
- **1:** One or more changes blocked (only with `--enforce`).
- **2:** Fatal error (config missing, lockfile parse failure, unknown lockfile version).
