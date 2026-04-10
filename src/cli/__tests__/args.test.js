/**
 * Tests for F10-S4 args.js additions:
 * - --quiet and --sarif flags present and default to false
 * - --profile is NOT accepted (belongs to F14)
 * - --json + --sarif mutual exclusion → exit 2 with error message
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../args.js';

describe('F10-S4 args.js', () => {
  it('--quiet defaults to false', () => {
    const result = parseArgs([]);
    assert.equal(result.values.quiet, false);
  });

  it('--sarif defaults to false', () => {
    const result = parseArgs([]);
    assert.equal(result.values.sarif, false);
  });

  it('--quiet is parsed as boolean true', () => {
    const result = parseArgs(['check', '--quiet']);
    assert.equal(result.values.quiet, true);
  });

  it('--sarif is parsed as boolean true', () => {
    const result = parseArgs(['check', '--sarif']);
    assert.equal(result.values.sarif, true);
  });

  it('--profile is NOT a valid flag (belongs to F14)', () => {
    assert.throws(
      () => parseArgs(['check', '--profile', 'strict']),
      TypeError,
      '--profile must not be accepted in this story (reserved for F14)'
    );
  });

  it('--json + --sarif together calls process.exit(2)', () => {
    let exitCode = null;
    const origExit = process.exit;
    const origWrite = process.stderr.write.bind(process.stderr);
    const prevExitCode = process.exitCode;
    const stderrLines = [];

    process.exit = (code) => { exitCode = code; throw new Error('process.exit called'); };
    process.stderr.write = (chunk) => { stderrLines.push(String(chunk)); return true; };

    try {
      parseArgs(['check', '--json', '--sarif']);
      assert.fail('should have called process.exit');
    } catch (err) {
      if (!err.message.includes('process.exit called')) throw err;
    } finally {
      process.exit = origExit;
      process.stderr.write = origWrite;
      process.exitCode = prevExitCode; // restore exitCode set by args.js
    }

    assert.equal(exitCode, 2, 'exit code must be 2 for --json+--sarif');
    assert.ok(
      stderrLines.join('').includes('Cannot use --json and --sarif together'),
      `expected mutex error in stderr, got: ${stderrLines.join('')}`
    );
  });

  it('--json alone is valid (no exit)', () => {
    const result = parseArgs(['check', '--json']);
    assert.equal(result.values.json, true);
  });

  it('--sarif alone is valid (no exit)', () => {
    const result = parseArgs(['check', '--sarif']);
    assert.equal(result.values.sarif, true);
  });
});
