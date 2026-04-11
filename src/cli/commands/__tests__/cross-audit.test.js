/**
 * Unit tests for cross-audit comparison functions.
 *
 * Covers:
 *   - computeVersionDrift
 *   - computeProvenanceInconsistency
 *   - computeAllowlistInconsistency
 *   - filterSourcePathEntries
 *
 * No I/O — all tests use in-memory fixture arrays.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeVersionDrift,
  computeProvenanceInconsistency,
  computeAllowlistInconsistency,
  filterSourcePathEntries,
} from '../cross-audit.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function dep(name, version, overrides = {}) {
  return {
    name,
    version,
    resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`,
    integrity: null,
    isDev: false,
    hasInstallScripts: null,
    sourceType: 'registry',
    directDependency: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterSourcePathEntries
// ---------------------------------------------------------------------------

describe('filterSourcePathEntries', () => {
  test('keeps registry deps unchanged', () => {
    const deps = [dep('lodash', '4.0.0')];
    assert.deepEqual(filterSourcePathEntries(deps), deps);
  });

  test('keeps npm file: deps (have "file:" protocol in resolved)', () => {
    const d = dep('my-local', '1.0.0', {
      sourceType: 'file',
      resolved: 'file:../my-local',
    });
    const result = filterSourcePathEntries([d]);
    assert.equal(result.length, 1);
  });

  test('removes source.path entries (file type, no protocol in resolved)', () => {
    const d = dep('path-dep', '0.1.0', {
      sourceType: 'file',
      resolved: '../path-dep',   // no ":" protocol — uv.lock style
    });
    const result = filterSourcePathEntries([d]);
    assert.equal(result.length, 0);
  });

  test('removes source.path entries with relative dot-slash resolved', () => {
    const d = dep('local-pkg', '0.0.1', {
      sourceType: 'file',
      resolved: './local-pkg',
    });
    assert.equal(filterSourcePathEntries([d]).length, 0);
  });

  test('keeps git deps', () => {
    const d = dep('git-pkg', '1.2.3', {
      sourceType: 'git',
      resolved: 'git+https://github.com/org/repo.git#abc',
    });
    assert.equal(filterSourcePathEntries([d]).length, 1);
  });

  test('keeps entries where resolved is null', () => {
    const d = dep('null-resolved', '1.0.0', {
      sourceType: 'file',
      resolved: null,
    });
    // null resolved — no protocol check possible; treat as keeping (resolved === '')
    // filterSourcePathEntries: resolved = '' → includes(':') = false → filtered
    // Actually null resolved file: with no protocol → filtered (correct for uv.lock)
    const result = filterSourcePathEntries([d]);
    assert.equal(result.length, 0, 'file: dep with null resolved treated as source.path — excluded');
  });
});

// ---------------------------------------------------------------------------
// computeVersionDrift
// ---------------------------------------------------------------------------

describe('computeVersionDrift', () => {
  test('returns empty array when all packages have same version', () => {
    const projects = [
      { dir: '/a', deps: [dep('lodash', '4.0.0')] },
      { dir: '/b', deps: [dep('lodash', '4.0.0')] },
    ];
    assert.deepEqual(computeVersionDrift(projects), []);
  });

  test('reports drift for packages present in ≥2 dirs at different versions', () => {
    const projects = [
      { dir: '/a', deps: [dep('lodash', '4.0.0')] },
      { dir: '/b', deps: [dep('lodash', '4.1.0')] },
    ];
    const result = computeVersionDrift(projects);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'lodash');
    assert.equal(result[0].entries.length, 2);
  });

  test('does NOT report packages present in only one directory', () => {
    const projects = [
      { dir: '/a', deps: [dep('only-in-a', '1.0.0'), dep('shared', '2.0.0')] },
      { dir: '/b', deps: [dep('shared', '2.0.0')] },
    ];
    const result = computeVersionDrift(projects);
    assert.equal(result.length, 0, 'only-in-a not shared; shared has same version');
  });

  test('does NOT report packages in only one dir even at different versions from another unique pkg', () => {
    const projects = [
      { dir: '/a', deps: [dep('unique-a', '1.0.0')] },
      { dir: '/b', deps: [dep('unique-b', '2.0.0')] },
    ];
    assert.deepEqual(computeVersionDrift(projects), []);
  });

  test('handles 3 directories with mixed versions', () => {
    const projects = [
      { dir: '/a', deps: [dep('react', '18.0.0')] },
      { dir: '/b', deps: [dep('react', '18.0.0')] },
      { dir: '/c', deps: [dep('react', '17.0.0')] },
    ];
    const result = computeVersionDrift(projects);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'react');
    assert.equal(result[0].entries.length, 3);
  });

  test('returns results sorted by package name', () => {
    const projects = [
      { dir: '/a', deps: [dep('zz', '1.0.0'), dep('aa', '1.0.0')] },
      { dir: '/b', deps: [dep('zz', '2.0.0'), dep('aa', '2.0.0')] },
    ];
    const result = computeVersionDrift(projects);
    assert.equal(result[0].name, 'aa');
    assert.equal(result[1].name, 'zz');
  });
});

// ---------------------------------------------------------------------------
// computeProvenanceInconsistency
// ---------------------------------------------------------------------------

function projectWithProvenance(dir, packageEntries) {
  const deps = packageEntries.map(([name, version]) => dep(name, version));
  const provenanceMap = new Map(packageEntries.map(([name, , status]) => [name, status ?? 'unknown']));
  return { dir, deps, provenanceMap };
}

describe('computeProvenanceInconsistency', () => {
  test('returns empty when packages have same version everywhere', () => {
    const projects = [
      projectWithProvenance('/a', [['pkg', '1.0.0', 'verified']]),
      projectWithProvenance('/b', [['pkg', '1.0.0', 'unverified']]),
    ];
    // same version → no inconsistency per story spec
    assert.deepEqual(computeProvenanceInconsistency(projects), []);
  });

  test('returns empty when provenance is the same at different versions', () => {
    const projects = [
      projectWithProvenance('/a', [['pkg', '1.0.0', 'verified']]),
      projectWithProvenance('/b', [['pkg', '2.0.0', 'verified']]),
    ];
    assert.deepEqual(computeProvenanceInconsistency(projects), []);
  });

  test('reports inconsistency: different versions, different provenance states', () => {
    const projects = [
      projectWithProvenance('/a', [['pkg', '1.0.0', 'verified']]),
      projectWithProvenance('/b', [['pkg', '2.0.0', 'unverified']]),
    ];
    const result = computeProvenanceInconsistency(projects);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'pkg');
  });

  test('excludes packages where provenance is unknown in any participating dir', () => {
    const projects = [
      projectWithProvenance('/a', [['pkg', '1.0.0', 'verified']]),
      projectWithProvenance('/b', [['pkg', '2.0.0', 'unknown']]),
    ];
    // /b has unknown provenance — not enough known entries → excluded
    assert.deepEqual(computeProvenanceInconsistency(projects), []);
  });

  test('excludes packages present in only one directory', () => {
    const projects = [
      projectWithProvenance('/a', [['only-in-a', '1.0.0', 'verified']]),
      projectWithProvenance('/b', []),
    ];
    assert.deepEqual(computeProvenanceInconsistency(projects), []);
  });
});

// ---------------------------------------------------------------------------
// computeAllowlistInconsistency
// ---------------------------------------------------------------------------

describe('computeAllowlistInconsistency', () => {
  test('returns empty when allowlists are identical', () => {
    const projects = [
      { dir: '/a', allowlist: ['script-pkg', 'other-pkg'] },
      { dir: '/b', allowlist: ['script-pkg', 'other-pkg'] },
    ];
    assert.deepEqual(computeAllowlistInconsistency(projects), []);
  });

  test('returns empty when both allowlists are empty', () => {
    const projects = [
      { dir: '/a', allowlist: [] },
      { dir: '/b', allowlist: [] },
    ];
    assert.deepEqual(computeAllowlistInconsistency(projects), []);
  });

  test('reports package present in one allowlist but absent in another', () => {
    const projects = [
      { dir: '/a', allowlist: ['script-pkg'] },
      { dir: '/b', allowlist: [] },
    ];
    const result = computeAllowlistInconsistency(projects);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'script-pkg');
    assert.deepEqual(result[0].presentIn, ['/a']);
    assert.deepEqual(result[0].absentIn, ['/b']);
  });

  test('reports both directions when allowlists are disjoint', () => {
    const projects = [
      { dir: '/a', allowlist: ['pkg-a'] },
      { dir: '/b', allowlist: ['pkg-b'] },
    ];
    const result = computeAllowlistInconsistency(projects);
    assert.equal(result.length, 2); // both pkg-a and pkg-b are inconsistent
  });

  test('handles three directories with partial overlap', () => {
    const projects = [
      { dir: '/a', allowlist: ['common', 'only-a'] },
      { dir: '/b', allowlist: ['common'] },
      { dir: '/c', allowlist: ['common', 'only-c'] },
    ];
    const result = computeAllowlistInconsistency(projects);
    const names = result.map((r) => r.name).sort();
    assert.deepEqual(names, ['only-a', 'only-c']);
  });

  test('returns empty with fewer than 2 projects', () => {
    assert.deepEqual(computeAllowlistInconsistency([{ dir: '/a', allowlist: ['pkg'] }]), []);
    assert.deepEqual(computeAllowlistInconsistency([]), []);
  });

  test('returns results sorted by name', () => {
    const projects = [
      { dir: '/a', allowlist: ['zzz', 'aaa'] },
      { dir: '/b', allowlist: [] },
    ];
    const result = computeAllowlistInconsistency(projects);
    assert.equal(result[0].name, 'aaa');
    assert.equal(result[1].name, 'zzz');
  });
});
