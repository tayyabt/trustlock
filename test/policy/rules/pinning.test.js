import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluate } from '../../../src/policy/rules/pinning.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a package.json to a temp file and return its path. */
async function writePkgJson(dir, content) {
  const path = join(dir, 'package.json');
  await writeFile(path, JSON.stringify(content, null, 2), 'utf8');
  return path;
}

const policyEnabled = { pinning: { required: true } };
const policyDisabled = { pinning: { required: false } };

// ---------------------------------------------------------------------------
// Admit — pinning disabled
// ---------------------------------------------------------------------------

test('pinning: admits all deps when pinning.required = false (no file read)', async () => {
  const dep = { name: 'lodash', version: '4.17.21' };
  // packageJsonPath is irrelevant when disabled — pass a nonexistent path to prove no read.
  const findings = await evaluate(dep, null, null, policyDisabled, '/nonexistent/package.json');
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Block — range operators
// ---------------------------------------------------------------------------

test('pinning: blocks caret range in dependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { lodash: '^4.17.0' },
  });

  const dep = { name: 'lodash', version: '4.17.21' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);

  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.rule, 'exposure:pinning');
  assert.equal(f.severity, 'error');
  assert.ok(f.message.includes('lodash'));
  assert.ok(f.message.includes('^4.17.0'));
  assert.equal(f.detail.name, 'lodash');
  assert.equal(f.detail.spec, '^4.17.0');

  await unlink(pkgPath);
});

test('pinning: blocks tilde range in dependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { express: '~4.18.0' },
  });

  const dep = { name: 'express', version: '4.18.2' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].detail.spec, '~4.18.0');

  await unlink(pkgPath);
});

test('pinning: blocks wildcard (*) in dependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { chalk: '*' },
  });

  const dep = { name: 'chalk', version: '5.3.0' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].detail.spec, '*');

  await unlink(pkgPath);
});

test('pinning: blocks range in devDependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    devDependencies: { vitest: '^1.0.0' },
  });

  const dep = { name: 'vitest', version: '1.2.0' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'exposure:pinning');

  await unlink(pkgPath);
});

test('pinning: blocks >= range operator', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { semver: '>=7.0.0' },
  });

  const dep = { name: 'semver', version: '7.5.4' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 1);

  await unlink(pkgPath);
});

// ---------------------------------------------------------------------------
// Admit — exact version
// ---------------------------------------------------------------------------

test('pinning: admits exact version in dependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { lodash: '4.17.21' },
  });

  const dep = { name: 'lodash', version: '4.17.21' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 0);

  await unlink(pkgPath);
});

test('pinning: admits exact version in devDependencies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    devDependencies: { vitest: '1.2.0' },
  });

  const dep = { name: 'vitest', version: '1.2.0' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 0);

  await unlink(pkgPath);
});

test('pinning: admits when dependency is not listed in package.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { lodash: '^4.17.0' },
  });

  // 'express' is not in package.json — should admit.
  const dep = { name: 'express', version: '4.18.2' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 0);

  await unlink(pkgPath);
});

// ---------------------------------------------------------------------------
// Graceful degradation — unreadable package.json
// ---------------------------------------------------------------------------

test('pinning: admits (does not block) when package.json is missing', async () => {
  const dep = { name: 'lodash', version: '4.17.21' };
  const findings = await evaluate(dep, null, null, policyEnabled, '/nonexistent/package.json');
  assert.equal(findings.length, 0);
});

// ---------------------------------------------------------------------------
// Finding shape validation
// ---------------------------------------------------------------------------

test('pinning: all Finding fields present on block finding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'trustlock-pin-'));
  const pkgPath = await writePkgJson(dir, {
    dependencies: { lodash: '^4.17.0' },
  });

  const dep = { name: 'lodash', version: '4.17.21' };
  const findings = await evaluate(dep, null, null, policyEnabled, pkgPath);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.ok('rule' in f, 'missing rule');
  assert.ok('severity' in f, 'missing severity');
  assert.ok('message' in f, 'missing message');
  assert.ok('detail' in f, 'missing detail');
  assert.equal(typeof f.rule, 'string');
  assert.equal(typeof f.severity, 'string');
  assert.equal(typeof f.message, 'string');
  assert.equal(typeof f.detail, 'object');

  await unlink(pkgPath);
});
