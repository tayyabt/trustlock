import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDependency, SOURCE_TYPES, ECOSYSTEMS } from '../../src/lockfile/models.js';

describe('SOURCE_TYPES', () => {
  it('exports all four source type constants', () => {
    assert.equal(SOURCE_TYPES.registry, 'registry');
    assert.equal(SOURCE_TYPES.git, 'git');
    assert.equal(SOURCE_TYPES.file, 'file');
    assert.equal(SOURCE_TYPES.url, 'url');
  });
});

describe('ECOSYSTEMS', () => {
  it('exports npm and pypi ecosystem constants', () => {
    assert.equal(ECOSYSTEMS.npm, 'npm');
    assert.equal(ECOSYSTEMS.pypi, 'pypi');
  });
});

describe('validateDependency()', () => {
  const base = {
    name: 'lodash',
    version: '4.17.21',
    resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
    integrity: 'sha512-abc123',
    isDev: false,
    hasInstallScripts: false,
    sourceType: 'registry',
    directDependency: true,
    ecosystem: 'npm',
  };

  it('returns a valid ResolvedDependency for a fully-populated input', () => {
    const result = validateDependency(base);
    assert.equal(result.name, 'lodash');
    assert.equal(result.version, '4.17.21');
    assert.equal(result.resolved, 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz');
    assert.equal(result.integrity, 'sha512-abc123');
    assert.equal(result.isDev, false);
    assert.equal(result.hasInstallScripts, false);
    assert.equal(result.sourceType, 'registry');
    assert.equal(result.directDependency, true);
    assert.equal(result.ecosystem, 'npm');
  });

  it('throws a descriptive error when name is missing', () => {
    const dep = { ...base, name: undefined };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"name"'), `Expected "name" in error: ${err.message}`);
        return true;
      }
    );
  });

  it('throws a descriptive error when version is missing', () => {
    const dep = { ...base, version: undefined };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"version"'), `Expected "version" in error: ${err.message}`);
        return true;
      }
    );
  });

  it('throws a descriptive error when sourceType is missing', () => {
    const dep = { ...base, sourceType: undefined };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"sourceType"'), `Expected "sourceType" in error: ${err.message}`);
        return true;
      }
    );
  });

  it('throws a descriptive error for an invalid sourceType value', () => {
    const dep = { ...base, sourceType: 'cdn' };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"cdn"'), `Expected invalid value in error: ${err.message}`);
        assert.ok(
          err.message.includes('registry') && err.message.includes('git'),
          `Expected valid options in error: ${err.message}`
        );
        return true;
      }
    );
  });

  it('accepts hasInstallScripts: null (v1/v2 lockfiles)', () => {
    const dep = { ...base, hasInstallScripts: null };
    const result = validateDependency(dep);
    assert.equal(result.hasInstallScripts, null);
  });

  it('accepts hasInstallScripts: undefined and coerces to null', () => {
    const dep = { ...base };
    delete dep.hasInstallScripts;
    const result = validateDependency(dep);
    assert.equal(result.hasInstallScripts, null);
  });

  it('accepts resolved: null', () => {
    const dep = { ...base, resolved: null };
    const result = validateDependency(dep);
    assert.equal(result.resolved, null);
  });

  it('accepts integrity: null', () => {
    const dep = { ...base, integrity: null };
    const result = validateDependency(dep);
    assert.equal(result.integrity, null);
  });

  it('accepts sourceType "registry"', () => {
    const result = validateDependency({ ...base, sourceType: 'registry' });
    assert.equal(result.sourceType, 'registry');
  });

  it('accepts sourceType "git"', () => {
    const result = validateDependency({ ...base, sourceType: 'git' });
    assert.equal(result.sourceType, 'git');
  });

  it('accepts sourceType "file"', () => {
    const result = validateDependency({ ...base, sourceType: 'file' });
    assert.equal(result.sourceType, 'file');
  });

  it('accepts sourceType "url"', () => {
    const result = validateDependency({ ...base, sourceType: 'url' });
    assert.equal(result.sourceType, 'url');
  });

  it('coerces isDev to boolean', () => {
    const result = validateDependency({ ...base, isDev: 1 });
    assert.equal(typeof result.isDev, 'boolean');
    assert.equal(result.isDev, true);
  });

  it('coerces directDependency to boolean', () => {
    const result = validateDependency({ ...base, directDependency: 0 });
    assert.equal(typeof result.directDependency, 'boolean');
    assert.equal(result.directDependency, false);
  });

  // ── AC14: ecosystem field (C-NEW-3) ──────────────────────────────────────────

  it('AC14: throws a descriptive error when ecosystem is missing', () => {
    const dep = { ...base, ecosystem: undefined };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"ecosystem"'), `Expected "ecosystem" in error: ${err.message}`);
        return true;
      }
    );
  });

  it('AC14: throws a descriptive error for an invalid ecosystem value', () => {
    const dep = { ...base, ecosystem: 'crates' };
    assert.throws(
      () => validateDependency(dep),
      (err) => {
        assert.ok(err.message.includes('"crates"'), `Expected invalid value in error: ${err.message}`);
        assert.ok(
          err.message.includes('npm') && err.message.includes('pypi'),
          `Expected valid options in error: ${err.message}`
        );
        return true;
      }
    );
  });

  it('AC14: accepts ecosystem "npm"', () => {
    const result = validateDependency({ ...base, ecosystem: 'npm' });
    assert.equal(result.ecosystem, 'npm');
  });

  it('AC14: accepts ecosystem "pypi"', () => {
    const result = validateDependency({ ...base, ecosystem: 'pypi' });
    assert.equal(result.ecosystem, 'pypi');
  });

  it('pinned defaults to true when omitted', () => {
    const result = validateDependency(base);
    assert.equal(result.pinned, true);
  });

  it('pinned: false is preserved', () => {
    const result = validateDependency({ ...base, pinned: false });
    assert.equal(result.pinned, false);
  });

  it('via defaults to null when omitted', () => {
    const result = validateDependency(base);
    assert.equal(result.via, null);
  });

  it('via value is preserved', () => {
    const result = validateDependency({ ...base, via: 'requests' });
    assert.equal(result.via, 'requests');
  });
});
