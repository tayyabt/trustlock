# ADR-002: Baseline Advancement Strategy

## Status
Accepted

## Supersedes
N/A

## Context
The baseline is the trusted state of the dependency tree. It must only advance when changes pass policy or are explicitly approved. Three binding product decisions constrain this:
- D1: All-or-nothing advance — if any dependency is blocked, no baseline advancement for any.
- D2: Approval valid in same commit — the pre-commit hook reads approvals from the working tree, not the previous commit.
- D10: CI is read-only — `check --enforce` never advances the baseline.

The question is how the pre-commit hook should handle baseline writes.

## Options Considered

### Option 1: Auto-stage baseline on pass
- Description: When all dependencies are admitted in advisory mode, write the updated baseline and run `git add .trustlock/baseline.json` to include it in the commit. The baseline change becomes part of the same commit as the lockfile change.
- Pros: Baseline always reflects the admitted state. No drift. Developer doesn't need to remember to stage it. Atomic: the commit contains both the dependency change and the corresponding baseline update.
- Cons: Hook modifies the staging area, which may surprise developers who inspect staged files.

### Option 2: Write baseline without staging
- Description: Write the updated baseline but don't auto-stage. Developer must run `git add .trustlock/baseline.json`.
- Pros: No staging surprise. Developer has full control.
- Cons: Baseline drifts if developer forgets to stage it. The next commit sees a stale baseline, potentially re-evaluating already-admitted packages.

### Option 3: Write baseline to a temp location, stage on next check
- Description: Write baseline update to a temporary file. On next check, if the temp file exists and the lockfile matches, promote it to the real baseline.
- Pros: No staging surprise. No drift (eventually).
- Cons: Complex. Two-phase approach adds failure modes. Baseline is temporarily inconsistent.

## Decision
Option 1: Auto-stage baseline on pass. The hook already modifies process state (exit code). Auto-staging the baseline is a natural extension. The baseline update is a consequence of admission, not a separate action.

This behavior is clearly documented: "trustlock updates and stages .trustlock/baseline.json when all changes are admitted."

The `--dry-run` flag skips both the write and the staging.

## Consequences
- Implementation: After successful evaluation, write baseline and call `git add .trustlock/baseline.json`. Must handle the case where git add fails (e.g., baseline file is in .gitignore by mistake).
- Testing: Integration tests must verify that after a successful hook run, the baseline is staged. Tests must also verify that `--dry-run` and `--enforce` do NOT stage.
- Operations: Developers see baseline changes in `git diff --staged` after a successful hook. This is a feature: it makes the trust boundary advancement visible.
- Future: If a future `advance-baseline` command is added for CI workflows, it would follow the same write logic but be triggered explicitly.

## Deployment Architecture
- Deployment method: N/A (runtime behavior, not infrastructure)
- Infrastructure needed: Git repository
- Environment variables: None
- CI/CD considerations: CI must never run baseline advancement. The `--enforce` flag guarantees this.

## Module Structure
- `src/baseline/manager.js` — read, write, advance baseline
- `src/baseline/diff.js` — compute delta between baseline and current lockfile
- `src/utils/git.js` — `git add` operation for auto-staging

## Metadata
- Agent: architect
- Date: 2026-04-08
- Feature: baseline-advancement
