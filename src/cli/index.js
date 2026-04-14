#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseArgs } from './args.js';
import { run as runInit } from './commands/init.js';
import { run as runCheck } from './commands/check.js';
import { run as runApprove } from './commands/approve.js';
import { run as runAudit } from './commands/audit.js';
import { run as runCrossAudit } from './commands/cross-audit.js';
import { run as runClean } from './commands/clean.js';
import { run as runInstallHook } from './commands/install-hook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const { version } = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf8')
);

const HELP_TEXT = `trustlock v${version} — Git-native dependency admission controller

Usage:
  trustlock <command> [options]

Commands:
  init                     Initialize trustlock in the current project
  check                    Evaluate dependency changes against policy
  approve                  Approve a blocked package for a limited time
  audit                    Full trust-posture scan of the entire lockfile
  audit --compare          Cross-project audit: compare lockfiles for drift
  clean-approvals          Remove expired approval entries
  install-hook             Install the Git pre-commit hook

Options:
  --enforce                Exit 1 when any package is blocked (default: advisory)
  --json                   Output results as JSON
  --sarif                  Output results as SARIF
  --profile <name>         Apply a named policy profile
  --dry-run                Run checks without advancing the baseline
  --project-dir <path>     Path to the project root (default: cwd)
  --no-cache               Bypass the local registry cache
  -h, --help               Show this help text
  -v, --version            Print the version number

Docs: https://github.com/tayyabt/trustlock
`;

const COMMANDS = {
  'init':             runInit,
  'check':            runCheck,
  'approve':          runApprove,
  'audit':            runAudit,
  'clean-approvals':  runClean,
  'install-hook':     runInstallHook,
};

const AVAILABLE_COMMANDS = Object.keys(COMMANDS).join(', ');

async function main() {
  // ── Early interception: handle --help / -h / --version / -v ────────────────
  // Must run before parseArgs() because node:util.parseArgs throws
  // ERR_PARSE_ARGS_UNKNOWN_OPTION on any unrecognized flag.
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    process.stdout.write(`${version}\n`);
    return;
  }
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    process.stdout.write(HELP_TEXT);
    return;
  }

  // ── Normal path ─────────────────────────────────────────────────────────────
  const args = parseArgs();
  const command = args.positionals[0];

  if (!command) {
    process.stderr.write(`Usage: trustlock <command> [options]\nAvailable commands: ${AVAILABLE_COMMANDS}\n`);
    process.exitCode = 2;
    return;
  }

  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}. Available commands: ${AVAILABLE_COMMANDS}\n`);
    process.exitCode = 2;
    return;
  }

  // Cross-project audit: dispatch to cross-audit handler when --compare is present.
  if (command === 'audit' && args.values['compare']) {
    await runCrossAudit(args);
    return;
  }

  await handler(args);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exitCode = 2;
});
