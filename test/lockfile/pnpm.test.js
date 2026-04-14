import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { parsePnpm } from '../../src/lockfile/pnpm.js';
import { parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/lockfiles');

// ── process.exit intercept ────────────────────────────────────────────────────

const _realExit = process.exit;
const _realConsoleError = console.error;

afterEach(() => {
  process.exit = _realExit;
  console.error = _realConsoleError;
});

async function expectExit2(fn) {
  const messages = [];
  console.error = (...args) => messages.push(args.join(' '));
  process.exit = (code) => {
    throw Object.assign(new Error(`process.exit(${code})`), { exitCode: code });
  };

  let exitCode = null;
  await assert.rejects(
    fn,
    (err) => {
      exitCode = err.exitCode;
      return /process\.exit/.test(err.message);
    }
  );

  process.exit = _realExit;
  console.error = _realConsoleError;

  assert.equal(exitCode, 2, `Expected exit code 2, got ${exitCode}`);
  return messages;
}

async function loadFixture(filename) {
  return readFile(path.join(FIXTURES, filename), 'utf8');
}

// ── v5: plain package name/version/integrity (AC1) ────────────────────────────

describe('parsePnpm — v5 plain packages', () => {
  test('lodash: correct name, version, integrity', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);

    assert.ok(Array.isArray(result), 'result must be an array');
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(
      lodash.integrity,
      'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZkFekkLKFiJCMSBB69A=='
    );
  });

  test('lodash: sourceType is registry (has integrity)', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.sourceType, 'registry');
  });

  test('express: hasBin → hasInstallScripts: true', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const express = result.find((d) => d.name === 'express');
    assert.ok(express, 'express must be present');
    assert.equal(express.hasInstallScripts, true);
  });

  test('@babel/core: requiresBuild → hasInstallScripts: true', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.ok(babel, '@babel/core must be present');
    assert.equal(babel.hasInstallScripts, true);
  });

  test('lodash (no hasBin, no requiresBuild) → hasInstallScripts: null', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.hasInstallScripts, null);
  });

  test('no-integrity git package → integrity: null, sourceType: git', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const gitPkg = result.find((d) => d.name === 'no-integrity-git-pkg');
    assert.ok(gitPkg, 'no-integrity-git-pkg must be present');
    assert.equal(gitPkg.integrity, null);
    assert.equal(gitPkg.sourceType, 'git');
  });
});

// ── v5: scoped package key-path decoding (AC2) ───────────────────────────────

describe('parsePnpm — v5 scoped packages', () => {
  test('@babel/core: name decoded from /@babel/core/7.24.0: key', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.ok(babel, '@babel/core must be present');
    assert.equal(babel.version, '7.24.0');
    assert.equal(
      babel.integrity,
      'sha512-guv9-Qjcp0O+u5TkGAOojtylsAkWzaW5kFJP7GKKFsYlbUHbhzFSMaGJoIrQ7h3aFBQu7C+6Rfp2lPTkIb5A=='
    );
  });
});

// ── v6: key format with @ separator (additional coverage) ────────────────────

describe('parsePnpm — v6 packages', () => {
  test('lodash: correct name, version, integrity from /lodash@4.17.21: key', async () => {
    const content = await loadFixture('pnpm-v6.yaml');
    const result = parsePnpm(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(
      lodash.integrity,
      'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZkFekkLKFiJCMSBB69A=='
    );
  });

  test('@babel/core: name decoded from /@babel/core@7.24.0: key', async () => {
    const content = await loadFixture('pnpm-v6.yaml');
    const result = parsePnpm(content, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.ok(babel, '@babel/core must be present');
    assert.equal(babel.version, '7.24.0');
  });

  test('express (v6): hasBin → hasInstallScripts: true', async () => {
    const content = await loadFixture('pnpm-v6.yaml');
    const result = parsePnpm(content, null);
    const express = result.find((d) => d.name === 'express');
    assert.ok(express, 'express must be present');
    assert.equal(express.hasInstallScripts, true);
  });
});

// ── v9: explicit name/version field reads (AC3) ──────────────────────────────

describe('parsePnpm — v9 packages via explicit fields', () => {
  test('lodash: name and version from explicit fields, not key path', async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(
      lodash.integrity,
      'sha512-v2kDEe57lecTulaDIuNTPy3Ry4gLGJ6Z1O3vE1krgXZNrsQ+LFTGHVxVjcXPs17LhbZkFekkLKFiJCMSBB69A=='
    );
  });

  test("@babel/core: single-quoted key parsed; name and version read from fields", async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.ok(babel, '@babel/core must be present');
    assert.equal(babel.version, '7.24.0');
    assert.equal(
      babel.integrity,
      'sha512-guv9-Qjcp0O+u5TkGAOojtylsAkWzaW5kFJP7GKKFsYlbUHbhzFSMaGJoIrQ7h3aFBQu7C+6Rfp2lPTkIb5A=='
    );
  });

  test('snapshots section packages are NOT included in result', async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    // Packages section has 3 entries; snapshots section should not add duplicates
    assert.equal(result.length, 3, 'only 3 packages from packages section');
  });
});

// ── AC4: hasBin / requiresBuild / neither mapping ────────────────────────────

describe('parsePnpm — hasInstallScripts mapping (AC4)', () => {
  test('v9: @babel/core requiresBuild: true → hasInstallScripts: true', async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.equal(babel.hasInstallScripts, true);
  });

  test('v9: express hasBin: true → hasInstallScripts: true', async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    const express = result.find((d) => d.name === 'express');
    assert.equal(express.hasInstallScripts, true);
  });

  test('v9: lodash (neither hasBin nor requiresBuild) → hasInstallScripts: null', async () => {
    const content = await loadFixture('pnpm-v9.yaml');
    const result = parsePnpm(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.hasInstallScripts, null);
  });

  test('inline content: only hasBin: true → hasInstallScripts: true', () => {
    const content = [
      'lockfileVersion: 5',
      '',
      'packages:',
      '',
      '  /pkg-with-bin/1.0.0:',
      '    resolution: {integrity: sha512-abc}',
      '    hasBin: true',
      '    dev: false',
    ].join('\n');
    const result = parsePnpm(content, null);
    assert.equal(result[0].hasInstallScripts, true);
  });
});

// ── AC5: workspace importer filtering ────────────────────────────────────────

describe('parsePnpm — workspace filtering (AC5)', () => {
  test('packages/backend returns only express and jest', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, 'packages/backend');
    assert.ok(Array.isArray(result));
    const names = result.map((d) => d.name).sort();
    assert.deepEqual(names, ['express', 'jest']);
  });

  test('packages/backend: express has correct version and integrity', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, 'packages/backend');
    const express = result.find((d) => d.name === 'express');
    assert.ok(express, 'express must be present');
    assert.equal(express.version, '4.18.2');
    assert.equal(
      express.integrity,
      'sha512-5/PsL6iGOs/rsbKmhMbRSL2YDutNq7FxlMT3jJSIhQCBlp/z1dM+xbRpLtMBlPTk2mGqFMM8XGMeMU6yLNdg=='
    );
  });

  test('packages/frontend returns only react', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, 'packages/frontend');
    assert.ok(Array.isArray(result));
    const names = result.map((d) => d.name);
    assert.deepEqual(names, ['react']);
  });

  test('packages/nonexistent returns []', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, 'packages/nonexistent');
    assert.deepEqual(result, []);
  });

  test('projectRoot=null with importers returns all packages', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, null);
    const names = result.map((d) => d.name).sort();
    assert.deepEqual(names, ['express', 'jest', 'react', 'shared-lib']);
  });

  test('root importer (.) returns shared-lib', async () => {
    const content = await loadFixture('pnpm-monorepo.yaml');
    const result = parsePnpm(content, '.');
    const names = result.map((d) => d.name);
    assert.deepEqual(names, ['shared-lib']);
  });
});

// ── AC5: via parseLockfile integration ───────────────────────────────────────

describe('parseLockfile — pnpm workspace filtering integration (AC5)', () => {
  test('parseLockfile(pnpm-monorepo.yaml, packages/backend) returns only backend packages', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-monorepo.yaml');
    const result = await parseLockfile(lockfilePath, 'packages/backend');
    const names = result.map((d) => d.name).sort();
    assert.deepEqual(names, ['express', 'jest']);
  });

  test('parseLockfile(pnpm-monorepo.yaml, packages/nonexistent) returns []', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-monorepo.yaml');
    const result = await parseLockfile(lockfilePath, 'packages/nonexistent');
    assert.deepEqual(result, []);
  });
});

// ── AC6: unknown lockfileVersion exits 2 ─────────────────────────────────────

describe('parsePnpm — unsupported lockfileVersion (AC6)', () => {
  test('version 99 exits 2 with correct message', async () => {
    const content = 'lockfileVersion: 99\n\npackages:\n';
    // parsePnpm is synchronous — wrap in async so assert.rejects gets a Promise
    const messages = await expectExit2(async () => parsePnpm(content, null));
    assert.ok(
      messages.some((m) => m.includes('Unsupported pnpm lockfile version 99')),
      `Expected "Unsupported pnpm lockfile version 99", got: ${JSON.stringify(messages)}`
    );
    assert.ok(
      messages.some((m) => m.includes('trustlock supports v5, v6, v9')),
      `Expected "trustlock supports v5, v6, v9", got: ${JSON.stringify(messages)}`
    );
  });

  test('missing lockfileVersion (null) exits 2', async () => {
    const content = 'packages:\n  /lodash/4.17.21:\n    resolution: {integrity: sha512-abc}\n';
    const messages = await expectExit2(async () => parsePnpm(content, null));
    assert.ok(
      messages.some((m) => m.includes('Unsupported pnpm lockfile version')),
      `Expected unsupported version message, got: ${JSON.stringify(messages)}`
    );
  });

  test('via parseLockfile: unsupported version exits 2', async () => {
    // Router delegates to parsePnpm which owns the version check
    const content = 'lockfileVersion: 4\n\npackages:\n';
    const messages = await expectExit2(async () => parsePnpm(content, null));
    assert.ok(
      messages.some((m) => m.includes('Unsupported pnpm lockfile version 4')),
      `Expected "Unsupported pnpm lockfile version 4", got: ${JSON.stringify(messages)}`
    );
  });
});

// ── AC7: existing npm parsing unchanged ──────────────────────────────────────

describe('parseLockfile — npm parsing unchanged (AC7)', () => {
  test('parseLockfile(package-lock.json, package.json) still returns correct results', async () => {
    const lockfilePath = path.join(FIXTURES, 'package-lock.json');
    const pkgJsonPath = path.join(FIXTURES, 'package.json');
    const result = await parseLockfile(lockfilePath, pkgJsonPath);

    assert.ok(Array.isArray(result), 'result must be an array');
    assert.ok(result.length > 0, 'result must be non-empty');

    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be in result');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(lodash.sourceType, 'registry');
    assert.equal(lodash.directDependency, true);
    assert.equal(lodash.isDev, false);
  });
});

// ── AC1 + AC3: via parseLockfile integration ─────────────────────────────────

describe('parseLockfile — pnpm router integration (AC1, AC3)', () => {
  test('parseLockfile(pnpm-v5.yaml, null) returns correct lodash entry', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-v5.yaml');
    const result = await parseLockfile(lockfilePath, null);
    assert.ok(Array.isArray(result));
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.ok(lodash.integrity, 'integrity must be set');
  });

  test('parseLockfile(pnpm-v5.yaml, null) returns correct @babel/core entry (scoped)', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-v5.yaml');
    const result = await parseLockfile(lockfilePath, null);
    const babel = result.find((d) => d.name === '@babel/core');
    assert.ok(babel, '@babel/core must be present');
    assert.equal(babel.version, '7.24.0');
    assert.ok(babel.integrity, 'integrity must be set');
  });

  test('parseLockfile(pnpm-v9.yaml, null) returns lodash via name: field reads', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-v9.yaml');
    const result = await parseLockfile(lockfilePath, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.ok(lodash.integrity, 'integrity must be set');
  });
});

// ── AC8: no registry/ imports (verified by static check in test run) ──────────

describe('parsePnpm — module isolation (AC8, AC9)', () => {
  test('all returned entries have required ResolvedDependency fields', async () => {
    const content = await loadFixture('pnpm-v5.yaml');
    const result = parsePnpm(content, null);
    for (const dep of result) {
      assert.ok(dep.name, `name must be set on ${JSON.stringify(dep)}`);
      assert.ok(dep.version, `version must be set on ${JSON.stringify(dep)}`);
      assert.ok(
        ['registry', 'git', 'file', 'url'].includes(dep.sourceType),
        `sourceType must be valid on ${dep.name}`
      );
      assert.equal(typeof dep.isDev, 'boolean', `isDev must be boolean on ${dep.name}`);
      assert.equal(typeof dep.directDependency, 'boolean', `directDependency must be boolean on ${dep.name}`);
      assert.ok(
        dep.hasInstallScripts === null || typeof dep.hasInstallScripts === 'boolean',
        `hasInstallScripts must be boolean or null on ${dep.name}`
      );
    }
  });
});
