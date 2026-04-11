#!/usr/bin/env node

import { parseArgs } from './args.js';
import { run as runInit } from './commands/init.js';
import { run as runCheck } from './commands/check.js';
import { run as runApprove } from './commands/approve.js';
import { run as runAudit } from './commands/audit.js';
import { run as runCrossAudit } from './commands/cross-audit.js';
import { run as runClean } from './commands/clean.js';
import { run as runInstallHook } from './commands/install-hook.js';

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
