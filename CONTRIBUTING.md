# Contributing to trustlock

## Reporting bugs

Open an issue at https://github.com/tayyabt/trustlock/issues. Include the trustlock version (`trustlock --version`), the Node.js version, your OS, and the full terminal output including any error messages.

## Suggesting features

Open an issue with a description of the problem you're trying to solve, not just the solution you have in mind. trustlock's scope is narrow by design: admission control at the point of dependency change. Feature suggestions that expand into malware scanning, CVE tracking, or license checking are out of scope.

## Submitting pull requests

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep it focused — one concern per PR.
3. Run the test suite before submitting: `npm test`
4. Open a PR against `main` with a description of what changed and why.

## Code style

- **No external runtime dependencies.** trustlock has zero npm dependencies and it should stay that way. Every new module must be implementable with Node.js built-ins only (`node:fs`, `node:path`, `node:util`, `node:http`, etc.).
- Run `npm test` before submitting. The test suite runs with `node --test` (Node.js built-in test runner, no Jest or Vitest).
- No TypeScript compilation step. Source is plain ESM JavaScript with JSDoc type annotations.

## Running tests

```bash
npm test
```

This runs all files matching `**/*.test.js` using the Node.js built-in test runner. No setup required beyond `node >= 18.3`.

## Adding test fixtures

Fixtures live in `test/fixtures/`. For lockfile parser tests, add a representative lockfile under `test/fixtures/lockfiles/<ecosystem>/`. For registry mock tests, add a JSON file under `test/fixtures/registry/`. Each fixture should be the smallest possible example that exercises the case you are testing.

## Scope

trustlock is an admission controller: it makes binary admit/block decisions about dependency changes based on declared policy. It is not a malware scanner, a CVE database, or a license checker. Changes that blur this boundary will not be merged.
