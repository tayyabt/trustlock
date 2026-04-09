# ADR-001: Zero Runtime Dependencies

## Status
Accepted

## Supersedes
N/A

## Context
trustlock is a supply chain security tool. Its core product thesis is that dependency changes should pass a trust policy. A tool that guards the supply chain should not itself be a supply chain risk. This requires zero runtime dependencies — no CLI framework, HTTP client library, semver library, or color library.

## Options Considered

### Option 1: Pure Node.js Built-ins
- Description: Use only Node.js standard library modules. `node:https` for HTTP, `node:util.parseArgs` for CLI argument parsing, `node:fs/promises` for file I/O, `node:child_process` for git operations, manual ANSI escape codes for terminal colors, hand-rolled semver subset for version comparison.
- Pros: Truly zero dependencies. Dogfoods the product thesis. No transitive supply chain risk. Smaller install size.
- Cons: More code to write and maintain. Must implement semver subset, arg parsing edge cases, and terminal formatting manually.

### Option 2: Bundle Dependencies at Build Time
- Description: Use esbuild to bundle small libraries (commander, chalk, semver) into a single output file. package.json lists zero dependencies.
- Pros: Less code to write. Battle-tested libraries for CLI and semver.
- Cons: Intellectually dishonest — supply chain risk exists at build time. Bundled code is harder to audit. Contradicts the product thesis.

### Option 3: Vendor Specific Functions
- Description: Copy specific functions from semver, chalk, etc. into a utils/ folder with attribution.
- Pros: No dependency. Uses proven code.
- Cons: Maintenance burden. License compliance overhead. Stale vendored code.

## Decision
Option 1: Pure Node.js built-ins. For v0.1 (npm only), the required functionality is modest:
- **Semver:** Compare exact versions, detect range operators (`^`, `~`, `*`), parse version strings. Full range resolution is unnecessary because lockfiles resolve to exact versions.
- **HTTP:** GET requests with JSON parsing. `node:https` is sufficient.
- **CLI args:** `node:util.parseArgs` (available since Node 18.3).
- **Colors:** A handful of ANSI escape code constants.
- **File I/O:** `node:fs/promises` for JSON read/write.

## Consequences
- Implementation: All utility code must be hand-written. Semver subset must be tested carefully against edge cases (pre-release versions, build metadata).
- Testing: Must verify that `node:util.parseArgs` handles all argument patterns the CLI needs. Must test HTTP client against real npm registry response shapes.
- Operations: Minimum Node.js version is 18.3 (for `parseArgs`).
- Future: v0.2 (pnpm/yarn) will need a YAML parser. Options: hand-roll a minimal YAML subset for pnpm-lock.yaml, or reconsider this decision at that point. The ADR applies to v0.1 scope.

## Deployment Architecture
- Deployment method: npm package (`npm install -g trustlock` or `npx trustlock`)
- Infrastructure needed: None (CLI tool, runs locally and in CI)
- Environment variables: None required
- CI/CD considerations: Node.js >= 18.3 in CI environment

## Module Structure
- `src/utils/semver.js` — version comparison, range detection
- `src/utils/time.js` — timestamp parsing, age calculation
- `src/utils/git.js` — git operations via child_process
- `src/cli/args.js` — argument parsing wrapper around `node:util.parseArgs`
- `src/registry/client.js` — HTTP client using `node:https`
- `src/output/terminal.js` — ANSI color formatting

## Metadata
- Agent: architect
- Date: 2026-04-08
- Feature: zero-runtime-deps
