import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import { parseUv } from '../../src/lockfile/uv.js';
import { parseLockfile } from '../../src/lockfile/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures/lockfiles');

async function loadFixture(filename) {
  return readFile(path.join(FIXTURES, filename), 'utf8');
}

// ── AC7: registry entries ─────────────────────────────────────────────────────

describe('parseUv — registry entries (uv-basic.lock)', () => {
  test('returns a non-empty array from uv-basic.lock', async () => {
    const content = await loadFixture('uv-basic.lock');
    const result = parseUv(content);
    assert.ok(Array.isArray(result), 'must return an array');
    assert.ok(result.length > 0, 'must be non-empty');
  });

  test('AC7: requests entry has correct name, version, ecosystem: pypi, sourceType: registry', async () => {
    const content = await loadFixture('uv-basic.lock');
    const result = parseUv(content);
    const requests = result.find((d) => d.name === 'requests');
    assert.ok(requests, '"requests" must be present');
    assert.equal(requests.version, '2.31.0');
    assert.equal(requests.ecosystem, 'pypi');
    assert.equal(requests.sourceType, 'registry');
  });

  test('AC7: certifi entry has correct name and version', async () => {
    const content = await loadFixture('uv-basic.lock');
    const result = parseUv(content);
    const certifi = result.find((d) => d.name === 'certifi');
    assert.ok(certifi, '"certifi" must be present');
    assert.equal(certifi.version, '2023.7.22');
    assert.equal(certifi.sourceType, 'registry');
  });

  test('AC7: parseLockfile dispatches to uv parser via router for uv.lock filename', async () => {
    // The router matches on the exact filename "uv.lock".
    // Write fixture content to a temp uv.lock file for router dispatch testing.
    const fixtureContent = await loadFixture('uv-basic.lock');
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'trustlock-uv-test-'));
    try {
      const lockfilePath = path.join(tmpDir, 'uv.lock');
      await writeFile(lockfilePath, fixtureContent, 'utf8');
      const result = await parseLockfile(lockfilePath, null);
      assert.ok(Array.isArray(result));
      const requests = result.find((d) => d.name === 'requests');
      assert.ok(requests, '"requests" must be present in routed result');
      assert.equal(requests.ecosystem, 'pypi');
      assert.equal(requests.sourceType, 'registry');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── AC8: source.path entries ──────────────────────────────────────────────────

describe('parseUv — source.path entries (uv-source-path.lock)', () => {
  test('AC8: source.path entry returned with sourceType: file, present in output', async () => {
    const content = await loadFixture('uv-source-path.lock');
    const result = parseUv(content);
    const localLib = result.find((d) => d.name === 'my-local-lib');
    assert.ok(localLib, '"my-local-lib" (source.path) must be present in output — not dropped');
    assert.equal(localLib.sourceType, 'file', 'source.path must have sourceType: "file"');
    assert.equal(localLib.ecosystem, 'pypi');
  });

  test('AC8: source.path entry is in the output array (policy engine owns exclusion, not parser)', async () => {
    const content = await loadFixture('uv-source-path.lock');
    const result = parseUv(content);
    // Both registry and path entries must appear
    assert.ok(result.find((d) => d.sourceType === 'registry'), 'registry entry must be present');
    assert.ok(result.find((d) => d.sourceType === 'file'), 'file (path) entry must be present');
  });

  test('AC8: registry entry alongside source.path has sourceType: registry', async () => {
    const content = await loadFixture('uv-source-path.lock');
    const result = parseUv(content);
    const reg = result.find((d) => d.name === 'requests');
    assert.ok(reg, '"requests" must be present');
    assert.equal(reg.sourceType, 'registry');
  });
});

// ── AC9: source.git entries ───────────────────────────────────────────────────

describe('parseUv — source.git entries (uv-basic.lock)', () => {
  test('AC9: source.git entry has sourceType: git', async () => {
    const content = await loadFixture('uv-basic.lock');
    const result = parseUv(content);
    const gitDep = result.find((d) => d.name === 'my-git-dep');
    assert.ok(gitDep, '"my-git-dep" (source.git) must be present');
    assert.equal(gitDep.sourceType, 'git');
    assert.equal(gitDep.ecosystem, 'pypi');
  });
});

// ── AC10: ecosystem: pypi on all entries ─────────────────────────────────────

describe('parseUv — ecosystem field', () => {
  test('AC10: every entry from uv-basic.lock has ecosystem: "pypi"', async () => {
    const content = await loadFixture('uv-basic.lock');
    const result = parseUv(content);
    assert.ok(result.length > 0);
    for (const dep of result) {
      assert.equal(dep.ecosystem, 'pypi', `${dep.name} must have ecosystem: "pypi"`);
    }
  });

  test('AC10: every entry from uv-source-path.lock has ecosystem: "pypi"', async () => {
    const content = await loadFixture('uv-source-path.lock');
    const result = parseUv(content);
    assert.ok(result.length > 0);
    for (const dep of result) {
      assert.equal(dep.ecosystem, 'pypi', `${dep.name} must have ecosystem: "pypi"`);
    }
  });
});

// ── AC12: no registry imports ─────────────────────────────────────────────────

describe('parseUv — module purity', () => {
  test('AC12: uv.js does not import from src/registry/', async () => {
    const src = await readFile(
      path.resolve(__dirname, '../../src/lockfile/uv.js'),
      'utf8'
    );
    assert.ok(
      !src.includes("from '../registry/") && !src.includes('from "../registry/'),
      'uv.js must not import from src/registry/'
    );
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('parseUv — edge cases', () => {
  test('unknown top-level keys are skipped silently', () => {
    const content = `version = 1
requires-python = ">=3.11"
some-unknown-key = "whatever"

[[package]]
name = "requests"
version = "2.31.0"
source = { registry = "https://pypi.org/simple" }
unknown-field = "ignored"
`;
    const result = parseUv(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'requests');
  });

  test('package without explicit source defaults to sourceType: registry', () => {
    const content = `
[[package]]
name = "simple-pkg"
version = "1.0.0"
`;
    const result = parseUv(content);
    assert.equal(result.length, 1);
    assert.equal(result[0].sourceType, 'registry');
  });

  test('multiple packages parsed correctly', () => {
    const content = `
[[package]]
name = "pkg-a"
version = "1.0.0"
source = { registry = "https://pypi.org/simple" }

[[package]]
name = "pkg-b"
version = "2.0.0"
source = { registry = "https://pypi.org/simple" }
`;
    const result = parseUv(content);
    assert.equal(result.length, 2);
    assert.ok(result.find((d) => d.name === 'pkg-a'));
    assert.ok(result.find((d) => d.name === 'pkg-b'));
  });
});
