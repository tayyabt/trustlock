import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../../../src/cli/args.js';

describe('parseArgs', () => {
  it('returns empty positionals and default values when no args given', () => {
    const result = parseArgs([]);
    assert.deepEqual(result.positionals, []);
    assert.equal(result.values.enforce, false);
    assert.equal(result.values.json, false);
    assert.equal(result.values['dry-run'], false);
    assert.equal(result.values['no-cache'], false);
    assert.equal(result.values['no-baseline'], false);
    assert.equal(result.values.force, false);
    assert.equal(result.values.strict, false);
  });

  it('captures the command as the first positional', () => {
    const result = parseArgs(['check']);
    assert.deepEqual(result.positionals, ['check']);
  });

  it('captures multiple positionals (command + package@version)', () => {
    const result = parseArgs(['approve', 'express@4.18.2']);
    assert.deepEqual(result.positionals, ['approve', 'express@4.18.2']);
  });

  it('parses boolean flags correctly', () => {
    const result = parseArgs(['check', '--enforce', '--json', '--dry-run']);
    assert.equal(result.values.enforce, true);
    assert.equal(result.values.json, true);
    assert.equal(result.values['dry-run'], true);
  });

  it('parses --no-cache and --no-baseline flags', () => {
    const result = parseArgs(['check', '--no-cache', '--no-baseline']);
    assert.equal(result.values['no-cache'], true);
    assert.equal(result.values['no-baseline'], true);
  });

  it('parses --lockfile string flag', () => {
    const result = parseArgs(['check', '--lockfile', 'path/to/package-lock.json']);
    assert.equal(result.values.lockfile, 'path/to/package-lock.json');
  });

  it('parses --project-dir string flag', () => {
    const result = parseArgs(['check', '--project-dir', 'packages/backend']);
    assert.equal(result.values['project-dir'], 'packages/backend');
  });

  it('parses --project-dir with absolute path', () => {
    const result = parseArgs(['init', '--project-dir', '/home/user/repo/packages/api']);
    assert.equal(result.values['project-dir'], '/home/user/repo/packages/api');
  });

  it('--project-dir not provided results in undefined', () => {
    const result = parseArgs(['check']);
    assert.equal(result.values['project-dir'], undefined);
  });

  it('--profile is NOT a valid flag (belongs to F14, not this story)', () => {
    assert.throws(
      () => parseArgs(['check', '--profile', 'strict']),
      TypeError,
      '--profile should not be accepted (belongs to F14)'
    );
  });

  it('parses --reason, --expires, --as string flags', () => {
    const result = parseArgs(['approve', 'pkg@1.0.0', '--reason', 'needed for CI', '--expires', '30d', '--as', 'alice']);
    assert.equal(result.values.reason, 'needed for CI');
    assert.equal(result.values.expires, '30d');
    assert.equal(result.values.as, 'alice');
  });

  it('parses multiple --override values', () => {
    const result = parseArgs(['approve', 'pkg@1.0.0', '--override', 'provenance', '--override', 'cooldown']);
    assert.deepEqual(result.values.override, ['provenance', 'cooldown']);
  });

  it('--override not provided results in undefined', () => {
    const result = parseArgs(['approve', 'pkg@1.0.0']);
    assert.equal(result.values.override, undefined);
  });

  it('parses --force flag', () => {
    const result = parseArgs(['init', '--force']);
    assert.equal(result.values.force, true);
  });

  it('throws TypeError on unknown flag', () => {
    assert.throws(
      () => parseArgs(['check', '--unknown-flag']),
      TypeError,
    );
  });

  it('flags do not bleed into positionals', () => {
    const result = parseArgs(['approve', 'express@4.18.2', '--force']);
    assert.deepEqual(result.positionals, ['approve', 'express@4.18.2']);
    assert.equal(result.values.force, true);
  });
});
