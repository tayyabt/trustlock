# Feature: F01 Project Scaffolding & Shared Utilities

## Summary
Set up the project structure, package.json, bin entry point, test harness, and the shared utility modules (semver, time, git) that every other module depends on.

## Delivery Metadata
- UI-Bearing: no
- Preview Required: no
- Workflow Coverage: not required
- Workflow Rationale: Pure infrastructure — no user-facing flows, tested via unit tests
- Target Sprint: 1
- Sprint Rationale: Foundation layer — every other feature imports from utils; must land first

## Description
This feature creates the project skeleton and the three shared utility modules. The package.json declares the `dep-fence` bin entry, sets `"type": "module"` for ES modules, specifies `engines: { node: ">=18.3" }`, and includes no runtime dependencies (ADR-001).

The utility modules provide: semver subset (version comparison, range operator detection), timestamp parsing and age calculation, and git operations (child_process wrappers for `git add`, `git config`, hook file manipulation). These are small, focused, zero-dependency modules used across the codebase.

The test harness (test runner, fixture directory structure) is established here so sprint 1 features can ship with tests.

## User-Facing Behavior
Not directly user-facing. Enables all other features.

## UI Expectations (if applicable)
N/A — CLI tool, no UI.

## Primary Workflows
- none

## Edge Cases
1. Node.js version < 18.3 — `node:util.parseArgs` is unavailable; must fail with a clear error at startup
2. Semver pre-release versions (e.g., `1.0.0-beta.1`) — range detection must not false-positive on the hyphen
3. Semver build metadata (e.g., `1.0.0+build.123`) — must be ignored in version comparison
4. Scoped package names (`@scope/name`) — semver utils must not choke on the `@` prefix
5. Git not installed — `git config` and `git add` calls must produce clear errors, not cryptic child_process failures
6. Git repo not initialized — same as above, clear error message
7. Timestamp edge cases — ISO 8601 with and without timezone offset, milliseconds
8. Version strings with spaces or invalid characters — must reject cleanly
9. Empty string passed to semver comparison — must not crash
10. `git config user.name` returns empty — must handle gracefully (used by approve command later)

## Acceptance Criteria
- [ ] `package.json` exists with `bin`, `type: "module"`, `engines`, zero `dependencies`
- [ ] `src/utils/semver.js` correctly compares exact versions and detects range operators (`^`, `~`, `*`, `>`, `<`, `||`, `x`)
- [ ] `src/utils/time.js` parses ISO 8601 timestamps and calculates age in hours
- [ ] `src/utils/git.js` wraps `git add`, `git config user.name`, and hook file operations
- [ ] All three utility modules have unit tests covering happy path and edge cases
- [ ] `node -e "import('./src/utils/semver.js')"` succeeds (ES module validation)
- [ ] Test harness runs and reports results

## Dependencies
- none

## Layering
- Single layer: utils

## Module Scope
- utils

## Complexity Assessment
- Modules affected: utils
- New patterns introduced: yes — semver subset implementation, ANSI color constants
- Architecture review needed: no
- Design review needed: no

## PM Assumptions (if any)
- Semver subset is sufficient for v0.1: compare exact versions and detect range operators. Full semver range resolution (intersections, pre-release ordering) is not needed because lockfiles resolve to exact versions.
- Test runner is Node.js built-in test runner (`node --test`) to maintain zero-dependency stance.

## Metadata
- Agent: pm
- Date: 2026-04-08
- Spec source: specs/2026-04-07-dep-fence-full-spec.md
- Sprint: 1
