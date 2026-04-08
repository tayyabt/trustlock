import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, compareVersions, isRangeOperator } from '../../src/utils/semver.js';

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------

describe('parseVersion', () => {
  it('parses a simple version string', () => {
    const v = parseVersion('1.2.3');
    assert.deepEqual(v, { major: 1, minor: 2, patch: 3, preRelease: null, buildMetadata: null });
  });

  it('parses pre-release identifier', () => {
    const v = parseVersion('1.0.0-beta.1');
    assert.equal(v.major, 1);
    assert.equal(v.minor, 0);
    assert.equal(v.patch, 0);
    assert.equal(v.preRelease, 'beta.1');
    assert.equal(v.buildMetadata, null);
  });

  it('parses build metadata', () => {
    const v = parseVersion('1.0.0+build.123');
    assert.equal(v.major, 1);
    assert.equal(v.buildMetadata, 'build.123');
    assert.equal(v.preRelease, null);
  });

  it('parses pre-release and build metadata together', () => {
    const v = parseVersion('1.0.0-alpha.1+exp.sha.5114f85');
    assert.equal(v.preRelease, 'alpha.1');
    assert.equal(v.buildMetadata, 'exp.sha.5114f85');
  });

  it('parses 0.0.0', () => {
    const v = parseVersion('0.0.0');
    assert.deepEqual(v, { major: 0, minor: 0, patch: 0, preRelease: null, buildMetadata: null });
  });

  it('parses very large version numbers', () => {
    const v = parseVersion('999999.999999.999999');
    assert.equal(v.major, 999999);
    assert.equal(v.minor, 999999);
    assert.equal(v.patch, 999999);
  });

  it('trims leading and trailing whitespace', () => {
    const v = parseVersion('  1.2.3  ');
    assert.ok(v !== null);
    assert.equal(v.major, 1);
  });

  // --- invalid inputs ---

  it('returns null for empty string', () => {
    assert.equal(parseVersion(''), null);
  });

  it('returns null for non-version string', () => {
    assert.equal(parseVersion('not-a-version'), null);
  });

  it('returns null for v-prefixed string', () => {
    assert.equal(parseVersion('v1.0.0'), null);
  });

  it('returns null for invalid characters (1.0.0abc)', () => {
    assert.equal(parseVersion('1.0.0abc'), null);
  });

  it('returns null for missing patch component', () => {
    assert.equal(parseVersion('1.0'), null);
  });

  it('returns null for leading zero in major (01.0.0)', () => {
    assert.equal(parseVersion('01.0.0'), null);
  });

  it('returns null for null input', () => {
    assert.equal(parseVersion(null), null);
  });

  it('returns null for undefined input', () => {
    assert.equal(parseVersion(undefined), null);
  });

  it('returns null for numeric input', () => {
    assert.equal(parseVersion(123), null);
  });

  it('does not choke on range operator prefix (^1.0.0)', () => {
    assert.equal(parseVersion('^1.0.0'), null);
  });
});

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------

describe('compareVersions', () => {
  it('returns -1 when a < b (major)', () => {
    assert.equal(compareVersions('1.0.0', '2.0.0'), -1);
  });

  it('returns 1 when a > b (major)', () => {
    assert.equal(compareVersions('2.0.0', '1.0.0'), 1);
  });

  it('returns 0 for equal versions', () => {
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  });

  it('compares minor component', () => {
    assert.equal(compareVersions('1.1.0', '1.2.0'), -1);
    assert.equal(compareVersions('1.2.0', '1.1.0'), 1);
  });

  it('compares patch component', () => {
    assert.equal(compareVersions('1.0.1', '1.0.2'), -1);
    assert.equal(compareVersions('1.0.2', '1.0.1'), 1);
  });

  it('ignores build metadata in comparison', () => {
    assert.equal(compareVersions('1.0.0+build.1', '1.0.0'), 0);
    assert.equal(compareVersions('1.0.0', '1.0.0+build.1'), 0);
    assert.equal(compareVersions('1.0.0+build.1', '1.0.0+build.2'), 0);
  });

  it('pre-release version sorts before release (1.0.0-alpha < 1.0.0)', () => {
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0'), -1);
    assert.equal(compareVersions('1.0.0', '1.0.0-alpha'), 1);
  });

  it('two pre-release versions are compared lexicographically', () => {
    assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
    assert.equal(compareVersions('1.0.0-beta', '1.0.0-alpha'), 1);
    assert.equal(compareVersions('1.0.0-beta.1', '1.0.0-beta.1'), 0);
  });

  it('handles very large version numbers without overflow', () => {
    assert.equal(compareVersions('999999.999999.999998', '999999.999999.999999'), -1);
  });

  it('throws on invalid version string', () => {
    assert.throws(() => compareVersions('not-valid', '1.0.0'), /invalid version/);
    assert.throws(() => compareVersions('1.0.0', 'not-valid'), /invalid version/);
  });
});

// ---------------------------------------------------------------------------
// isRangeOperator
// ---------------------------------------------------------------------------

describe('isRangeOperator', () => {
  it('returns true for ^ prefix', () => {
    assert.equal(isRangeOperator('^1.0.0'), true);
  });

  it('returns true for ~ prefix', () => {
    assert.equal(isRangeOperator('~1.0.0'), true);
  });

  it('returns true for > prefix', () => {
    assert.equal(isRangeOperator('>1.0.0'), true);
  });

  it('returns true for >= prefix', () => {
    assert.equal(isRangeOperator('>=1.0.0'), true);
  });

  it('returns true for < prefix', () => {
    assert.equal(isRangeOperator('<2.0.0'), true);
  });

  it('returns true for <= prefix', () => {
    assert.equal(isRangeOperator('<=2.0.0'), true);
  });

  it('returns true for * (wildcard)', () => {
    assert.equal(isRangeOperator('*'), true);
  });

  it('returns true for x (wildcard)', () => {
    assert.equal(isRangeOperator('x'), true);
  });

  it('returns true for X (wildcard)', () => {
    assert.equal(isRangeOperator('X'), true);
  });

  it('returns true for || (union)', () => {
    assert.equal(isRangeOperator('||'), true);
    assert.equal(isRangeOperator('||2.0.0'), true);
  });

  it('returns false for exact version', () => {
    assert.equal(isRangeOperator('1.0.0'), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isRangeOperator(''), false);
  });

  it('returns false for non-string input', () => {
    assert.equal(isRangeOperator(null), false);
    assert.equal(isRangeOperator(undefined), false);
    assert.equal(isRangeOperator(123), false);
  });

  it('pre-release hyphen is NOT treated as range operator', () => {
    // A bare hyphen or pre-release version string should not match
    assert.equal(isRangeOperator('1.0.0-beta.1'), false);
  });
});

// ---------------------------------------------------------------------------
// ES module import check (AC: module loads as ES module)
// ---------------------------------------------------------------------------

describe('module exports', () => {
  it('exports parseVersion as a function', () => {
    assert.equal(typeof parseVersion, 'function');
  });

  it('exports compareVersions as a function', () => {
    assert.equal(typeof compareVersions, 'function');
  });

  it('exports isRangeOperator as a function', () => {
    assert.equal(typeof isRangeOperator, 'function');
  });
});
