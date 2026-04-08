# dep-fence: Project Brief

## What it is

dep-fence is a dependency admission controller for Git-based projects. It evaluates trust signals on dependency changes and blocks commits or builds when changes violate the team's declared policy.

## What it is not

It is not a scanner, vulnerability database, malware detector, license checker, or dependency recommender. It makes admit/block decisions based on trust continuity, release age, install-time behavior, and declared policy.

## Where it runs

- **Git pre-commit hook** — local, advisory (warns but does not block by default).
- **CI check** — enforced, blocking (`--enforce` flag).

## Core value proposition

Dependency supply chain attacks exploit the gap between "a package was published" and "a team installs it." dep-fence closes that gap by requiring that dependency changes pass a declared trust policy before they enter the codebase.

## Target users

- **Developers** on teams that ship production software with npm dependencies.
- **Security-conscious tech leads** who want a policy-driven gate on dependency changes without adopting a full SCA platform.
- Teams that already use code review but have no systematic review process for dependency changes.

## Key product constraints

- Zero runtime dependencies in the critical path (the tool that guards your supply chain should not itself be a supply chain risk).
- Decisions, not findings. Every rule resolves to admit or block. No "informational" noise that developers learn to ignore.
- Approvals are committed to Git and go through code review. No out-of-band approval database.
- The baseline (trusted state) only advances on successful admission. Bypassing the hook does not corrupt the trust boundary.

## Phased delivery

- **v0.1:** npm only, core policy rules, approval workflow, terminal + JSON output.
- **v0.2:** pnpm/yarn parsers, publisher change detection, SARIF output, policy profiles, monorepo support.
- **v0.3:** Python ecosystem (pip/uv), policy inheritance.
- **v0.4:** Cargo support, UX polish (dep-fence diff, dep-fence why, completions).
- **v0.5+:** Optional hosted trust intelligence API (monetization path).

## Success criteria for v0.1

- A developer can run `dep-fence init` on an npm project and get a working trust baseline.
- `dep-fence check` catches provenance regression, cooldown violations, undeclared install scripts, and non-registry sources.
- `dep-fence approve` lets a developer override a block with a scoped, time-limited, attributed approval.
- The pre-commit hook and CI check work independently with clear, distinct behavior (advisory vs. enforced).
- The tool is publishable to npm as a standalone package.
