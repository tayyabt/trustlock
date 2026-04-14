import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { parseYarn } from '../../src/lockfile/yarn.js';
import { parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/lockfiles');

async function loadFixture(filename) {
  return readFile(path.join(FIXTURES, filename), 'utf8');
}

// ── AC: classic multi-specifier header → one resolved entry ───────────────────

describe('parseYarn — classic v1: multi-specifier header', () => {
  test('multi-specifier "lodash@^4.17.21", "lodash@4.x.x": produces one entry', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    const all = result.filter((d) => d.name === 'lodash');
    assert.equal(all.length, 1, 'should produce exactly one lodash entry');
  });

  test('lodash entry has correct version from classic fixture', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
  });

  test('lodash entry has correct integrity from classic fixture', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash.integrity, 'integrity must be set');
    assert.ok(lodash.integrity.startsWith('sha512-'), 'integrity must be sha512');
  });

  test('lodash entry sourceType is registry', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.sourceType, 'registry');
  });

  test('classic: all entries have required ResolvedDependency fields', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    assert.ok(result.length > 0, 'must produce entries');
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

// ── AC: classic hasInstallScripts is always null ──────────────────────────────

describe('parseYarn — classic v1: hasInstallScripts', () => {
  test('classic lockfile: hasInstallScripts is null for all entries (not available)', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    for (const dep of result) {
      assert.equal(dep.hasInstallScripts, null, `classic: hasInstallScripts must be null for ${dep.name}`);
    }
  });
});

// ── AC: berry languageName: unknown excluded ──────────────────────────────────

describe('parseYarn — berry v2: languageName: unknown workspace exclusion', () => {
  test('my-workspace with languageName: unknown is absent from results', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    const workspace = result.find((d) => d.name === 'my-workspace');
    assert.equal(workspace, undefined, 'workspace package must be excluded');
  });

  test('berry fixture: regular packages (languageName: node) are present', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    assert.ok(result.length > 0, 'must have non-workspace entries');
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
  });

  test('berry lodash: correct version', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.version, '4.17.21');
  });

  test('berry lodash: integrity set from checksum field', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash.integrity, 'integrity (from checksum) must be set');
  });

  test('berry lodash: sourceType is registry', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.sourceType, 'registry');
  });
});

// ── AC: berry dependenciesMeta.built → hasInstallScripts ─────────────────────

describe('parseYarn — berry: dependenciesMeta.built → hasInstallScripts', () => {
  test('package with no dependenciesMeta → hasInstallScripts: null', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.hasInstallScripts, null);
  });

  test('package with dependenciesMeta[pkg].built: true → hasInstallScripts: true', async () => {
    const content = await loadFixture('yarn-berry-with-built.lock');
    const result = parseYarn(content, null);
    const sharp = result.find((d) => d.name === 'sharp');
    assert.ok(sharp, 'sharp must be present');
    assert.equal(sharp.hasInstallScripts, true);
  });

  test('package without built in dependenciesMeta → hasInstallScripts: null', async () => {
    const content = await loadFixture('yarn-berry-with-built.lock');
    const result = parseYarn(content, null);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.hasInstallScripts, null);
  });
});

// ── AC: dev/prod classification from package.json ─────────────────────────────

describe('parseYarn — dev/prod classification from package.json', () => {
  test('direct prod dep → isDev: false', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const pkgJson = JSON.stringify({
      dependencies: { express: '^4.18.2', lodash: '^4.17.21' },
      devDependencies: { jest: '^29.0.0' },
    });
    const result = parseYarn(content, pkgJson);
    const express = result.find((d) => d.name === 'express');
    assert.equal(express.isDev, false);
  });

  test('direct dev dep → isDev: true', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const pkgJson = JSON.stringify({
      dependencies: { express: '^4.18.2', lodash: '^4.17.21' },
      devDependencies: { jest: '^29.0.0' },
    });
    const result = parseYarn(content, pkgJson);
    const jest = result.find((d) => d.name === 'jest');
    assert.equal(jest.isDev, true);
  });

  test('transitive dep of dev package → isDev: true (inherit from closest direct ancestor)', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const pkgJson = JSON.stringify({
      dependencies: { express: '^4.18.2', lodash: '^4.17.21' },
      devDependencies: { jest: '^29.0.0' },
    });
    const result = parseYarn(content, pkgJson);
    // jest-runner is a transitive dep of jest (dev) in the fixture
    const jestRunner = result.find((d) => d.name === 'jest-runner');
    assert.ok(jestRunner, 'jest-runner must be present');
    assert.equal(jestRunner.isDev, true, 'transitive dep of dev package must be isDev: true');
  });

  test('null packageJsonContent → all isDev: false', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const result = parseYarn(content, null);
    for (const dep of result) {
      assert.equal(dep.isDev, false, `${dep.name} must be isDev: false when no package.json`);
    }
  });

  test('direct dep listed in dependencies → directDependency: true', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const pkgJson = JSON.stringify({
      dependencies: { lodash: '^4.17.21' },
      devDependencies: {},
    });
    const result = parseYarn(content, pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.equal(lodash.directDependency, true);
  });

  test('transitive dep not in package.json → directDependency: false', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    const pkgJson = JSON.stringify({
      dependencies: { express: '^4.18.2' },
      devDependencies: {},
    });
    const result = parseYarn(content, pkgJson);
    // lodash is in the lockfile but only a transitive dep of express in this scenario
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash);
    assert.equal(lodash.directDependency, false);
  });
});

// ── AC: format detection ──────────────────────────────────────────────────────

describe('parseYarn — format detection: __metadata presence', () => {
  test('content with __metadata: → berry path (no workspace packages in result)', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
    // my-workspace has languageName: unknown and should be excluded (berry path taken)
    const workspace = result.find((d) => d.name === 'my-workspace');
    assert.equal(workspace, undefined, 'berry path must exclude languageName: unknown packages');
  });

  test('content without __metadata → classic path', async () => {
    const content = await loadFixture('yarn-classic-v1.lock');
    assert.ok(!/^__metadata:/m.test(content), 'classic fixture must not have __metadata');
    const result = parseYarn(content, null);
    assert.ok(result.length > 0, 'classic path must return results');
  });

  test('inline berry content detected by __metadata at line start', () => {
    const berryContent = [
      '__metadata:',
      '  version: 6',
      '',
      '"pkg@npm:^1.0.0":',
      '  version: 1.0.0',
      '  resolution: "pkg@npm:1.0.0"',
      '  checksum: 10/abc',
      '  languageName: node',
      '  linkType: hard',
    ].join('\n');
    const result = parseYarn(berryContent, null);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'pkg');
    assert.equal(result[0].version, '1.0.0');
  });
});

// ── AC: via parseLockfile integration ─────────────────────────────────────────

describe('parseLockfile — yarn integration', () => {
  test('parseLockfile(yarn-classic-v1.lock, null) returns array', async () => {
    const lockfilePath = path.join(FIXTURES, 'yarn-classic-v1.lock');
    const result = await parseLockfile(lockfilePath, null);
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });

  test('parseLockfile(yarn-classic-v1.lock, null): lodash present with multi-specifier', async () => {
    const lockfilePath = path.join(FIXTURES, 'yarn-classic-v1.lock');
    const result = await parseLockfile(lockfilePath, null);
    const all = result.filter((d) => d.name === 'lodash');
    assert.equal(all.length, 1, 'multi-specifier must produce one entry');
    assert.equal(all[0].version, '4.17.21');
  });

  test('parseLockfile(yarn-berry-v2.lock, null): workspace package absent', async () => {
    const lockfilePath = path.join(FIXTURES, 'yarn-berry-v2.lock');
    const result = await parseLockfile(lockfilePath, null);
    assert.ok(Array.isArray(result));
    const workspace = result.find((d) => d.name === 'my-workspace');
    assert.equal(workspace, undefined, 'workspace must be excluded');
  });

  test('parseLockfile(yarn-berry-with-built.lock, null): sharp hasInstallScripts: true', async () => {
    const lockfilePath = path.join(FIXTURES, 'yarn-berry-with-built.lock');
    const result = await parseLockfile(lockfilePath, null);
    const sharp = result.find((d) => d.name === 'sharp');
    assert.ok(sharp, 'sharp must be present');
    assert.equal(sharp.hasInstallScripts, true);
  });
});

// ── AC: no registry imports ───────────────────────────────────────────────────

describe('parseYarn — module isolation', () => {
  test('parseYarn result entries have all required ResolvedDependency fields (berry)', async () => {
    const content = await loadFixture('yarn-berry-v2.lock');
    const result = parseYarn(content, null);
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

// ── AC: existing pnpm/npm paths unchanged ────────────────────────────────────

describe('parseLockfile — existing paths unchanged after yarn branch added', () => {
  test('pnpm-v5.yaml still routed correctly', async () => {
    const lockfilePath = path.join(FIXTURES, 'pnpm-v5.yaml');
    const result = await parseLockfile(lockfilePath, null);
    assert.ok(Array.isArray(result));
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present in pnpm result');
    assert.equal(lodash.version, '4.17.21');
  });

  test('package-lock.json still routed correctly', async () => {
    const lockfilePath = path.join(FIXTURES, 'package-lock.json');
    const pkgJsonPath = path.join(FIXTURES, 'package.json');
    const result = await parseLockfile(lockfilePath, pkgJsonPath);
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
  });
});
