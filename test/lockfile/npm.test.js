import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { parseNpm } from '../../src/lockfile/npm.js';
import { parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/lockfiles');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadFixture(filename) {
  return readFile(path.join(FIXTURES, filename), 'utf8');
}

// ── v1 parsing ────────────────────────────────────────────────────────────────

describe('parseNpm — v1 lockfile', () => {
  test('parses v1 fixture into non-empty ResolvedDependency[]', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    assert.ok(Array.isArray(result), 'result must be an array');
    assert.ok(result.length > 0, 'result must be non-empty');
  });

  test('v1: all entries have hasInstallScripts === null', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    for (const dep of result) {
      assert.equal(dep.hasInstallScripts, null, `${dep.name}: hasInstallScripts must be null`);
    }
  });

  test('v1: lodash is registry type, direct, not dev', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(lodash.sourceType, 'registry');
    assert.equal(lodash.directDependency, true);
    assert.equal(lodash.isDev, false);
    assert.equal(lodash.resolved, 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz');
    assert.ok(lodash.integrity, 'lodash must have integrity');
  });

  test('v1: git dep (my-git-pkg) has sourceType "git"', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const gitDep = result.find((d) => d.name === 'my-git-pkg');
    assert.ok(gitDep, 'my-git-pkg must be present');
    assert.equal(gitDep.sourceType, 'git');
    assert.equal(gitDep.directDependency, true);
    assert.equal(gitDep.isDev, false);
  });

  test('v1: file dep (my-local-pkg) has sourceType "file"', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const fileDep = result.find((d) => d.name === 'my-local-pkg');
    assert.ok(fileDep, 'my-local-pkg must be present');
    assert.equal(fileDep.sourceType, 'file');
    assert.equal(fileDep.directDependency, true);
    assert.equal(fileDep.isDev, false);
  });

  test('v1: dep with no resolved field gets resolved: null', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const noResolved = result.find((d) => d.name === 'no-resolved-pkg');
    assert.ok(noResolved, 'no-resolved-pkg must be present');
    assert.equal(noResolved.resolved, null);
    assert.equal(noResolved.sourceType, 'registry');
  });

  test('v1: devDependency (mocha) has isDev: true', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const mocha = result.find((d) => d.name === 'mocha');
    assert.ok(mocha, 'mocha must be present');
    assert.equal(mocha.isDev, true);
    assert.equal(mocha.directDependency, true);
  });

  test('v1: scoped devDependency (@scope/dev-tool) parsed correctly', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const devTool = result.find((d) => d.name === '@scope/dev-tool');
    assert.ok(devTool, '@scope/dev-tool must be present');
    assert.equal(devTool.isDev, true);
    assert.equal(devTool.directDependency, true);
    assert.equal(devTool.sourceType, 'registry');
  });

  test('v1: scoped transitive dep (@scope/transitive) is not direct', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const transitive = result.find((d) => d.name === '@scope/transitive');
    assert.ok(transitive, '@scope/transitive must be present');
    assert.equal(transitive.directDependency, false);
    assert.equal(transitive.isDev, false);
  });

  test('v1: nested transitive dep (deep-transitive) is flattened', async () => {
    const lockfile = await loadFixture('npm-v1.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const deepDep = result.find((d) => d.name === 'deep-transitive');
    assert.ok(deepDep, 'deep-transitive must be present (flattened from nested deps)');
    assert.equal(deepDep.directDependency, false);
    assert.equal(deepDep.sourceType, 'registry');
  });

  test('v1: empty dependencies returns []', () => {
    const lockfile = JSON.stringify({ name: 'x', version: '1.0.0', lockfileVersion: 1, dependencies: {} });
    const pkgJson = JSON.stringify({ name: 'x', version: '1.0.0', dependencies: {}, devDependencies: {} });
    const result = parseNpm(lockfile, pkgJson);
    assert.deepEqual(result, []);
  });

  test('v1: no dependencies key returns []', () => {
    const lockfile = JSON.stringify({ name: 'x', version: '1.0.0', lockfileVersion: 1 });
    const pkgJson = JSON.stringify({ name: 'x', version: '1.0.0', dependencies: {}, devDependencies: {} });
    const result = parseNpm(lockfile, pkgJson);
    assert.deepEqual(result, []);
  });
});

// ── v2 parsing ────────────────────────────────────────────────────────────────

describe('parseNpm — v2 lockfile', () => {
  test('parses v2 fixture into non-empty ResolvedDependency[]', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    assert.ok(Array.isArray(result), 'result must be an array');
    assert.ok(result.length > 0, 'result must be non-empty');
  });

  test('v2: prefers packages map — lodash version is 4.17.21, not 4.0.0 from dependencies', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(
      lodash.version,
      '4.17.21',
      'v2 must prefer packages map (4.17.21) over backward-compat dependencies (4.0.0)'
    );
  });

  test('v2: all entries have hasInstallScripts === null', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    for (const dep of result) {
      assert.equal(dep.hasInstallScripts, null, `${dep.name}: hasInstallScripts must be null for v2`);
    }
  });

  test('v2: scoped package node_modules/@scope/transitive parsed correctly', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const transitive = result.find((d) => d.name === '@scope/transitive');
    assert.ok(transitive, '@scope/transitive must be present');
    assert.equal(transitive.directDependency, false);
    assert.equal(transitive.sourceType, 'registry');
  });

  test('v2: git dep has sourceType "git"', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const gitDep = result.find((d) => d.name === 'my-git-pkg');
    assert.ok(gitDep, 'my-git-pkg must be present');
    assert.equal(gitDep.sourceType, 'git');
  });

  test('v2: file dep has sourceType "file"', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const fileDep = result.find((d) => d.name === 'my-local-pkg');
    assert.ok(fileDep, 'my-local-pkg must be present');
    assert.equal(fileDep.sourceType, 'file');
  });

  test('v2: mocha isDev: true, direct', async () => {
    const lockfile = await loadFixture('npm-v2.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const mocha = result.find((d) => d.name === 'mocha');
    assert.ok(mocha, 'mocha must be present');
    assert.equal(mocha.isDev, true);
    assert.equal(mocha.directDependency, true);
  });

  test('v2: empty packages returns []', () => {
    const lockfile = JSON.stringify({ name: 'x', version: '1.0.0', lockfileVersion: 2, packages: {}, dependencies: {} });
    const pkgJson = JSON.stringify({ name: 'x', version: '1.0.0', dependencies: {}, devDependencies: {} });
    const result = parseNpm(lockfile, pkgJson);
    assert.deepEqual(result, []);
  });
});

// ── v3 parsing ────────────────────────────────────────────────────────────────

describe('parseNpm — v3 lockfile', () => {
  test('parses v3 fixture into non-empty ResolvedDependency[]', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    assert.ok(Array.isArray(result), 'result must be an array');
    assert.ok(result.length > 0, 'result must be non-empty');
  });

  test('v3: lodash has hasInstallScripts: false (from fixture)', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.hasInstallScripts, false);
  });

  test('v3: my-local-pkg has hasInstallScripts: true (from fixture)', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const fileDep = result.find((d) => d.name === 'my-local-pkg');
    assert.ok(fileDep, 'my-local-pkg must be present');
    assert.equal(fileDep.hasInstallScripts, true);
  });

  test('v3: hasInstallScripts is boolean (not null) for all entries with the field', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    for (const dep of result) {
      assert.ok(
        dep.hasInstallScripts === null || typeof dep.hasInstallScripts === 'boolean',
        `${dep.name}: hasInstallScripts must be boolean or null`
      );
    }
  });

  test('v3: scoped dev dep @scope/dev-tool isDev: true', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const devTool = result.find((d) => d.name === '@scope/dev-tool');
    assert.ok(devTool, '@scope/dev-tool must be present');
    assert.equal(devTool.isDev, true);
    assert.equal(devTool.directDependency, true);
  });

  test('v3: scoped transitive dep @scope/transitive not direct, not dev', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const transitive = result.find((d) => d.name === '@scope/transitive');
    assert.ok(transitive, '@scope/transitive must be present');
    assert.equal(transitive.directDependency, false);
    assert.equal(transitive.isDev, false);
  });

  test('v3: git dep has sourceType "git"', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const gitDep = result.find((d) => d.name === 'my-git-pkg');
    assert.ok(gitDep, 'my-git-pkg must be present');
    assert.equal(gitDep.sourceType, 'git');
  });

  test('v3: file dep has sourceType "file"', async () => {
    const lockfile = await loadFixture('npm-v3.json');
    const pkgJson = await loadFixture('package.json');
    const result = parseNpm(lockfile, pkgJson);
    const fileDep = result.find((d) => d.name === 'my-local-pkg');
    assert.ok(fileDep, 'my-local-pkg must be present');
    assert.equal(fileDep.sourceType, 'file');
  });

  test('v3: empty packages returns []', () => {
    const lockfile = JSON.stringify({ name: 'x', version: '1.0.0', lockfileVersion: 3, packages: {} });
    const pkgJson = JSON.stringify({ name: 'x', version: '1.0.0', dependencies: {}, devDependencies: {} });
    const result = parseNpm(lockfile, pkgJson);
    assert.deepEqual(result, []);
  });
});

// ── Source type classification ────────────────────────────────────────────────

describe('parseNpm — source type classification', () => {
  function makeLockfileV3(resolved) {
    return JSON.stringify({
      name: 'x', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'x', version: '1.0.0', dependencies: { 'test-pkg': '*' } },
        'node_modules/test-pkg': { version: '1.0.0', resolved },
      },
    });
  }
  const pkgJson = JSON.stringify({
    name: 'x', version: '1.0.0',
    dependencies: { 'test-pkg': '*' }, devDependencies: {},
  });

  test('registry.npmjs.org → "registry"', () => {
    const result = parseNpm(
      makeLockfileV3('https://registry.npmjs.org/test-pkg/-/test-pkg-1.0.0.tgz'),
      pkgJson
    );
    assert.equal(result[0].sourceType, 'registry');
  });

  test('git+https:// → "git"', () => {
    const result = parseNpm(
      makeLockfileV3('git+https://github.com/owner/repo.git#abc'),
      pkgJson
    );
    assert.equal(result[0].sourceType, 'git');
  });

  test('github: → "git"', () => {
    const result = parseNpm(
      makeLockfileV3('github:owner/repo#abc'),
      pkgJson
    );
    assert.equal(result[0].sourceType, 'git');
  });

  test('file: → "file"', () => {
    const result = parseNpm(
      makeLockfileV3('file:../local-pkg'),
      pkgJson
    );
    assert.equal(result[0].sourceType, 'file');
  });

  test('other URL → "url"', () => {
    const result = parseNpm(
      makeLockfileV3('https://example.com/custom-registry/pkg-1.0.0.tgz'),
      pkgJson
    );
    assert.equal(result[0].sourceType, 'url');
  });

  test('null resolved → "registry" (graceful default)', () => {
    const lockfile = JSON.stringify({
      name: 'x', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'x', version: '1.0.0', dependencies: { 'test-pkg': '*' } },
        'node_modules/test-pkg': { version: '1.0.0' },
      },
    });
    const result = parseNpm(lockfile, pkgJson);
    assert.equal(result[0].sourceType, 'registry');
    assert.equal(result[0].resolved, null);
  });
});

// ── directDependency and isDev cross-ref ──────────────────────────────────────

describe('parseNpm — directDependency and isDev', () => {
  test('only-devDependencies: all direct packages have isDev: true', () => {
    const lockfile = JSON.stringify({
      name: 'x', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'x', version: '1.0.0', devDependencies: { jest: '^29.0.0' } },
        'node_modules/jest': {
          version: '29.0.0',
          resolved: 'https://registry.npmjs.org/jest/-/jest-29.0.0.tgz',
          dev: true,
        },
      },
    });
    const pkgJson = JSON.stringify({
      name: 'x', version: '1.0.0',
      dependencies: {},
      devDependencies: { jest: '^29.0.0' },
    });
    const result = parseNpm(lockfile, pkgJson);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'jest');
    assert.equal(result[0].isDev, true);
    assert.equal(result[0].directDependency, true);
  });

  test('transitive dep is not direct', () => {
    const lockfile = JSON.stringify({
      name: 'x', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'x', version: '1.0.0', dependencies: { parent: '*' } },
        'node_modules/parent': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/parent/-/parent-1.0.0.tgz',
        },
        'node_modules/child': {
          version: '2.0.0',
          resolved: 'https://registry.npmjs.org/child/-/child-2.0.0.tgz',
        },
      },
    });
    const pkgJson = JSON.stringify({
      name: 'x', version: '1.0.0',
      dependencies: { parent: '*' },
      devDependencies: {},
    });
    const result = parseNpm(lockfile, pkgJson);
    const child = result.find((d) => d.name === 'child');
    assert.ok(child, 'child must be present');
    assert.equal(child.directDependency, false);
    assert.equal(child.isDev, false);
  });

  test('pkg in both dependencies and devDependencies: isDev: false (prod wins)', () => {
    const lockfile = JSON.stringify({
      name: 'x', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'x', version: '1.0.0', dependencies: { shared: '*' }, devDependencies: { shared: '*' } },
        'node_modules/shared': {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/shared/-/shared-1.0.0.tgz',
        },
      },
    });
    const pkgJson = JSON.stringify({
      name: 'x', version: '1.0.0',
      dependencies: { shared: '*' },
      devDependencies: { shared: '*' },
    });
    const result = parseNpm(lockfile, pkgJson);
    const shared = result.find((d) => d.name === 'shared');
    assert.ok(shared, 'shared must be present');
    assert.equal(shared.directDependency, true);
    assert.equal(shared.isDev, false);
  });
});

// ── Workspace link entries (BUG-002 regression) ───────────────────────────────

describe('parseNpm — v2 workspace link entries are skipped', () => {
  function makeV2WithLinks() {
    return JSON.stringify({
      name: 'monorepo', version: '1.0.0', lockfileVersion: 2,
      packages: {
        '': { name: 'monorepo', version: '1.0.0', workspaces: ['apps/*'], dependencies: { lodash: '^4.17.21' } },
        'apps/frontend': { resolved: 'apps/frontend', link: true },
        'apps/backend': { resolved: 'apps/backend', link: true },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-test',
        },
      },
    });
  }
  const pkgJson = JSON.stringify({
    name: 'monorepo', version: '1.0.0',
    dependencies: { lodash: '^4.17.21' }, devDependencies: {},
  });

  test('v2: link entries are not included in result', () => {
    const result = parseNpm(makeV2WithLinks(), pkgJson);
    assert.equal(result.find((d) => d.name === 'apps/frontend'), undefined, 'apps/frontend must be excluded');
    assert.equal(result.find((d) => d.name === 'apps/backend'), undefined, 'apps/backend must be excluded');
  });

  test('v2: normal packages are still included when link entries are present', () => {
    const result = parseNpm(makeV2WithLinks(), pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
  });

  test('v2: parseNpm does not throw on lockfile with link entries', () => {
    assert.doesNotThrow(() => parseNpm(makeV2WithLinks(), pkgJson));
  });
});

describe('parseNpm — v3 workspace link entries are skipped', () => {
  function makeV3WithLinks() {
    return JSON.stringify({
      name: 'monorepo', version: '1.0.0', lockfileVersion: 3,
      packages: {
        '': { name: 'monorepo', version: '1.0.0', workspaces: ['apps/*'], dependencies: { lodash: '^4.17.21' } },
        'apps/frontend': { resolved: 'apps/frontend', link: true },
        'apps/backend': { resolved: 'apps/backend', link: true },
        'node_modules/lodash': {
          version: '4.17.21',
          resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          integrity: 'sha512-test',
          hasInstallScripts: false,
        },
      },
    });
  }
  const pkgJson = JSON.stringify({
    name: 'monorepo', version: '1.0.0',
    dependencies: { lodash: '^4.17.21' }, devDependencies: {},
  });

  test('v3: link entries are not included in result', () => {
    const result = parseNpm(makeV3WithLinks(), pkgJson);
    assert.equal(result.find((d) => d.name === 'apps/frontend'), undefined, 'apps/frontend must be excluded');
    assert.equal(result.find((d) => d.name === 'apps/backend'), undefined, 'apps/backend must be excluded');
  });

  test('v3: normal packages are still included when link entries are present', () => {
    const result = parseNpm(makeV3WithLinks(), pkgJson);
    const lodash = result.find((d) => d.name === 'lodash');
    assert.ok(lodash, 'lodash must be present');
    assert.equal(lodash.version, '4.17.21');
    assert.equal(lodash.hasInstallScripts, false);
  });

  test('v3: parseNpm does not throw on lockfile with link entries', () => {
    assert.doesNotThrow(() => parseNpm(makeV3WithLinks(), pkgJson));
  });
});

// ── Integration test via parseLockfile() ─────────────────────────────────────

describe('Integration — parseLockfile() with v3 fixture', () => {
  test('parseLockfile(package-lock.json, package.json) returns correct ResolvedDependency[]', async () => {
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
    assert.equal(lodash.hasInstallScripts, false);
    assert.equal(lodash.ecosystem, 'npm', 'AC11: ecosystem must be npm');

    // All items are valid ResolvedDependency shapes; every npm entry must set ecosystem: 'npm'
    for (const dep of result) {
      assert.ok(dep.name, 'name must be set');
      assert.ok(dep.version, 'version must be set');
      assert.ok(['registry', 'git', 'file', 'url'].includes(dep.sourceType), 'sourceType must be valid');
      assert.equal(typeof dep.isDev, 'boolean', 'isDev must be boolean');
      assert.equal(typeof dep.directDependency, 'boolean', 'directDependency must be boolean');
      assert.equal(dep.ecosystem, 'npm', `AC11: ${dep.name} ecosystem must be npm`);
    }
  });
});
