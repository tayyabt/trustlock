import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { parseRequirements } from '../../src/lockfile/requirements.js';
import { parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/lockfiles');

async function loadFixture(filename) {
  return readFile(path.join(FIXTURES, filename), 'utf8');
}

// ── AC1: exact pins ───────────────────────────────────────────────────────────

describe('parseRequirements — exact pins (requirements-basic.txt)', () => {
  test('returns a non-empty array from requirements-basic.txt', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    assert.ok(Array.isArray(result), 'must return an array');
    assert.ok(result.length > 0, 'must be non-empty');
  });

  test('parses requests==2.31.0 with correct name and version', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    const requests = result.find((d) => d.name === 'requests');
    assert.ok(requests, '"requests" must be present');
    assert.equal(requests.version, '2.31.0');
    assert.equal(requests.sourceType, 'registry');
    assert.equal(requests.pinned, true);
  });

  test('AC1: parseLockfile dispatches to requirements parser via router', async () => {
    const lockfilePath = path.join(FIXTURES, 'requirements-basic.txt');
    const result = await parseLockfile(lockfilePath, null);
    assert.ok(Array.isArray(result));
    assert.ok(result.length > 0);
    const requests = result.find((d) => d.name === 'requests');
    assert.ok(requests, '"requests" must be present in routed result');
    assert.equal(requests.ecosystem, 'pypi');
  });
});

// ── AC2: PEP 508 name normalization ──────────────────────────────────────────

describe('parseRequirements — PEP 508 name normalization', () => {
  test('AC2: Pillow==9.5.0 is normalized to lowercase "pillow"', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    // Should find "pillow" (lowercase) not "Pillow"
    const pillow = result.find((d) => d.name === 'pillow');
    assert.ok(pillow, '"pillow" (normalized) must be present');
    assert.equal(pillow.version, '9.5.0');
  });

  test('AC2: my_package==1.0.0 normalized to "my-package"', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    const pkg = result.find((d) => d.name === 'my-package');
    assert.ok(pkg, '"my-package" (underscore normalized) must be present');
    assert.equal(pkg.version, '1.0.0');
  });

  test('AC2: inline normalization — Pillow and pillow produce same name', () => {
    const r1 = parseRequirements('Pillow==9.0.0\n');
    const r2 = parseRequirements('pillow==9.0.0\n');
    assert.equal(r1[0].name, r2[0].name, 'case variants must normalize to same name');
  });

  test('AC2: inline normalization — my_package and my-package produce same name', () => {
    const r1 = parseRequirements('my_package==1.0.0\n');
    const r2 = parseRequirements('my-package==1.0.0\n');
    assert.equal(r1[0].name, r2[0].name, 'underscore/hyphen variants must normalize to same name');
  });
});

// ── AC3: hash integrity ───────────────────────────────────────────────────────

describe('parseRequirements — hash lines', () => {
  test('AC3: --hash=sha256:... stored as integrity on the entry', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    const requests = result.find((d) => d.name === 'requests');
    assert.ok(requests, '"requests" must be present');
    assert.ok(requests.integrity, 'integrity must be set');
    assert.ok(
      requests.integrity.startsWith('sha256:'),
      `integrity must start with "sha256:", got: ${requests.integrity}`
    );
  });
});

// ── AC4: URL requirements ─────────────────────────────────────────────────────

describe('parseRequirements — URL requirements', () => {
  test('AC4: "pkg @ https://..." classified as sourceType: url', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    const urlPkg = result.find((d) => d.sourceType === 'url');
    assert.ok(urlPkg, 'at least one URL requirement must be present');
    assert.equal(urlPkg.name, 'direct-dep');
    assert.ok(urlPkg.resolved, 'URL requirement must have resolved URL');
    assert.ok(urlPkg.resolved.startsWith('https://'), 'resolved must be an HTTPS URL');
  });

  test('AC4: inline URL requirement parses name from left of @', () => {
    const result = parseRequirements('mypkg @ https://example.com/mypkg-1.0.0.tar.gz\n');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'mypkg');
    assert.equal(result[0].sourceType, 'url');
    assert.equal(result[0].resolved, 'https://example.com/mypkg-1.0.0.tar.gz');
  });
});

// ── AC5: pip-compile # via annotation ────────────────────────────────────────

describe('parseRequirements — pip-compile # via annotation', () => {
  test('AC5: single-package via annotation captured', async () => {
    const content = await loadFixture('requirements-piped.txt');
    const result = parseRequirements(content);
    const certifi = result.find((d) => d.name === 'certifi');
    assert.ok(certifi, '"certifi" must be present');
    assert.ok(certifi.via, 'via must be set');
    assert.equal(certifi.via, 'requests');
  });

  test('AC5: multi-package via annotation captured as comma-separated string', async () => {
    const content = await loadFixture('requirements-piped.txt');
    const result = parseRequirements(content);
    const requests = result.find((d) => d.name === 'requests');
    assert.ok(requests, '"requests" must be present');
    assert.ok(requests.via, 'via must be set for requests');
    assert.ok(
      requests.via.includes('my-app'),
      `via must include "my-app", got: ${requests.via}`
    );
    assert.ok(
      requests.via.includes('another-dep'),
      `via must include "another-dep", got: ${requests.via}`
    );
  });
});

// ── AC6: unpinned entries ─────────────────────────────────────────────────────

describe('parseRequirements — unpinned requirements', () => {
  test('AC6: setuptools>=65.0.0 returned with pinned: false', async () => {
    const content = await loadFixture('requirements-piped.txt');
    const result = parseRequirements(content);
    const setuptools = result.find((d) => d.name === 'setuptools');
    assert.ok(setuptools, '"setuptools" must be present');
    assert.equal(setuptools.pinned, false, 'unpinned entry must have pinned: false');
  });

  test('AC6: no process.exit(2) for unpinned range requirement', () => {
    // Must not throw
    const result = parseRequirements('requests>=2.28.0\n');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'requests');
    assert.equal(result[0].pinned, false);
  });

  test('exact pin has pinned: true', () => {
    const result = parseRequirements('requests==2.31.0\n');
    assert.equal(result[0].pinned, true);
  });

  test('AC6: multiple range operators all produce pinned: false', () => {
    const cases = [
      'pkg>=1.0.0',
      'pkg<=1.0.0',
      'pkg~=1.0.0',
      'pkg!=1.0.0',
      'pkg>1.0.0',
      'pkg<1.0.0',
    ];
    for (const line of cases) {
      const result = parseRequirements(`${line}\n`);
      assert.equal(result.length, 1, `expected 1 result for "${line}"`);
      assert.equal(result[0].pinned, false, `expected pinned:false for "${line}"`);
    }
  });
});

// ── AC10: ecosystem: pypi on all entries ─────────────────────────────────────

describe('parseRequirements — ecosystem field', () => {
  test('AC10: every entry has ecosystem: "pypi"', async () => {
    const content = await loadFixture('requirements-basic.txt');
    const result = parseRequirements(content);
    assert.ok(result.length > 0);
    for (const dep of result) {
      assert.equal(dep.ecosystem, 'pypi', `${dep.name} must have ecosystem: "pypi"`);
    }
  });
});

// ── AC12: no registry imports ─────────────────────────────────────────────────

describe('parseRequirements — module purity', () => {
  test('AC12: requirements.js does not import from src/registry/', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../src/lockfile/requirements.js'),
      'utf8'
    );
    assert.ok(
      !src.includes("from '../registry/") && !src.includes('from "../registry/'),
      'requirements.js must not import from src/registry/'
    );
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('parseRequirements — edge cases', () => {
  test('blank lines and comment-only lines are skipped silently', () => {
    const content = '# comment\n\n# another comment\nrequests==2.31.0\n\n';
    const result = parseRequirements(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'requests');
  });

  test('global options like --index-url are skipped', () => {
    const content = '--index-url https://pypi.org/simple/\nrequests==2.31.0\n';
    const result = parseRequirements(content);
    // Only requests, not the option line
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'requests');
  });

  test('via is null for packages without via annotation', () => {
    const result = parseRequirements('requests==2.31.0\n');
    assert.equal(result[0].via, null);
  });
});
