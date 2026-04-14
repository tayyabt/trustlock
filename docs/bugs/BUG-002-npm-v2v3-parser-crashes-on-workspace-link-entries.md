# Bug Report: BUG-002 npm v2/v3 parser crashes on workspace link entries — missing required field "version"

## Summary

When `trustlock init` or `trustlock audit` is run in an npm workspaces project, the v2/v3 lockfile parser crashes with `validateDependency: missing required field "version"`. The root `package-lock.json` in an npm workspace includes `"link": true` entries for each workspace package (e.g., `"apps/frontend"`, `"apps/backend"`). These entries do not have a `version` field — they are workspace symlinks, not versioned registry packages. `_parseV2V3` at `src/lockfile/npm.js:98` iterates all `packages` keys and only skips the `""` root entry, so link entries reach `validateDependency`, which throws on the missing `version`. This was not encountered earlier because the user's project recently gained or was first run with a workspace-style root lockfile.

## Expected Behavior

`trustlock init` and `trustlock audit` parse the lockfile without error. Workspace link entries (`"link": true`) are silently skipped because they are not independently installable versioned packages — they are local path aliases managed by npm workspaces.

## Actual Behavior

```
Error: validateDependency: missing required field "version"
```

Both `init` and `audit` exit with a fatal error immediately after parsing the lockfile.

## Reproduction

1. Create an npm workspaces project with a root `package.json` (`"workspaces": ["apps/*"]`) and sub-packages at `apps/frontend` and `apps/backend`.
2. Run `npm install` to generate a root `package-lock.json` (v2 or v3). The lockfile will contain `"apps/frontend": { "link": true }` and `"apps/backend": { "link": true }` entries.
3. Run `trustlock init` or `trustlock audit` from the project root.

## Scope / Environment

- `src/lockfile/npm.js` — `_parseV2V3` function
- Triggered by `init` and `audit` commands
- Affects any project using npm workspaces with a v2 or v3 lockfile

## Evidence

- User report from Farhan Salam (resource_ally project)
- `_parseV2V3` at `src/lockfile/npm.js:98-130` skips only `key === ''`; does not guard against `entry.link === true`
- `validateDependency` at `src/lockfile/models.js:52-54` throws when `dep.version` is falsy

## Severity / User Impact

Blocking — any user running trustlock on an npm workspaces project cannot use `init` or `audit` at all. Init is the entry point; this is a hard blocker on onboarding.

## Duplicate Relationship

None. BUG-001 is about approval command formatting; unrelated.

## Confirmation Snapshot

Bug reported directly by Farhan Salam via Slack with exact error message and confirmation that both `init` and `audit` are affected.

## Behavioral / Interaction Rules

Workspace link entries (`"link": true`) in a v2/v3 lockfile must be skipped during parsing. They represent local workspace packages, not resolved registry/git/file dependencies, and should never be validated or included in the dependency list.

## Counterpart Boundary / Contract

`parseNpm` must return only `ResolvedDependency[]` objects that have a real `version`. Callers (`init`, `audit`, `check`) expect every element to satisfy `validateDependency`. The parser is solely responsible for filtering out structural lockfile metadata entries before they reach the validator.

## Root-Cause Hypothesis

`_parseV2V3` iterates all keys in `packages` but only guards against the root entry (`key === ''`). In a workspace lockfile, npm writes `"apps/frontend": { "link": true, "resolved": "apps/frontend" }` (no `version`). This reaches `validateDependency` and throws. Fix: add `if (entry.link === true) continue;` immediately after the `key === ''` guard at `src/lockfile/npm.js:100`.

## Acceptance Criteria

- `trustlock init` and `trustlock audit` complete without error on a project with a v2 or v3 npm workspace lockfile.
- Workspace link entries are not included in the parsed dependency array.
- Non-link entries continue to be parsed and validated correctly.
- Regression: a unit test covers a v2/v3 lockfile with a link entry and asserts it is excluded from results.

## Verification

- `node --input-type=module` with a synthetic v3 lockfile containing `"apps/frontend": { "link": true }` — `parseNpm` must return an array that does not include `apps/frontend`.
- `npm test` — existing npm parser unit tests must continue to pass.

## Metadata

- Agent: bug-assistant
- Date: 2026-04-13
- Bug ID: BUG-002
- Related Feature or Story: F16 (PyPI/npm lockfile parsers)
- Duplicate Of: none
- UI-Affecting: no
- Design Foundation: none
- Feature Preview: none
- Preview Notes: none
