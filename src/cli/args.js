import { parseArgs as nodeParseArgs } from 'node:util';

/**
 * Parse CLI arguments using node:util.parseArgs.
 *
 * @param {string[]} [argv] - Argument array (defaults to process.argv.slice(2))
 * @returns {{ values: object, positionals: string[] }}
 */
export function parseArgs(argv = process.argv.slice(2)) {
  const { values, positionals } = nodeParseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      // check / shared flags
      'enforce':      { type: 'boolean', default: false },
      'json':         { type: 'boolean', default: false },
      'sarif':        { type: 'boolean', default: false },
      'profile':      { type: 'string' },
      'quiet':        { type: 'boolean', default: false },
      'dry-run':      { type: 'boolean', default: false },
      'lockfile':     { type: 'string' },
      'project-dir':  { type: 'string' },
      'no-cache':     { type: 'boolean', default: false },
      'no-baseline':  { type: 'boolean', default: false },
      'strict':       { type: 'boolean', default: false },
      // approve flags
      'override':    { type: 'string',  multiple: true },
      'reason':      { type: 'string' },
      'expires':     { type: 'string' },
      'as':          { type: 'string' },
      // install-hook / init flags
      'force':       { type: 'boolean', default: false },
    },
  });

  // Mutual exclusion: --json and --sarif cannot be used together (F13/C3).
  if (values.json && values.sarif) {
    process.stderr.write('Cannot use --json and --sarif together.\n');
    process.exitCode = 2;
    process.exit(2);
  }

  return { values, positionals };
}
