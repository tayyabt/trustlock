import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { fetchVersionMetadata } from '../../src/registry/pypi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../fixtures/registry');

async function loadFixture(name) {
  const content = await readFile(join(FIXTURE_DIR, name), 'utf8');
  return JSON.parse(content);
}

// ---------------------------------------------------------------------------
// Helper — build injectable fetch functions from fixtures or controlled data
// ---------------------------------------------------------------------------

function makeVersionFetch(fixture) {
  return async () => fixture;
}

function makeSimpleFetch(fixture) {
  return async () => fixture;
}

function makeVersionFetchFail(code = 'NETWORK_TIMEOUT') {
  return async () => {
    const err = new Error(`mock ${code}`);
    err.code = code;
    throw err;
  };
}

// ---------------------------------------------------------------------------
// Publisher identity — AC: publisherAccount from urls[].uploader
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: extracts publisherAccount from urls[].uploader', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0.json');
  const simpleFixture = await loadFixture('pypi-simple-requests.json');

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch(simpleFixture),
  });

  assert.equal(result.publisherAccount, 'ken-reitz');
});

// ---------------------------------------------------------------------------
// Publisher fallback — AC: fallback to info.maintainer_email when uploader absent
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: falls back to first maintainer_email when uploader absent', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0-no-uploader.json');
  // maintainer_email is "me@kennethreitz.org,backup@kennethreitz.org" — first only
  const simpleFixture = { meta: { 'api-version': '1.1' }, name: 'requests', files: [] };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch(simpleFixture),
  });

  assert.equal(result.publisherAccount, 'me@kennethreitz.org');
});

test('fetchVersionMetadata: returns null when both uploader and maintainer_email absent', async () => {
  const fixture = {
    info: { name: 'requests', version: '2.28.0', maintainer_email: null },
    urls: [
      { filename: 'requests-2.28.0.tar.gz', upload_time_iso_8601: '2022-06-29T15:12:00.000000Z' },
    ],
  };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch({ files: [] }),
  });

  assert.equal(result.publisherAccount, null);
});

test('fetchVersionMetadata: returns null when maintainer_email is empty string', async () => {
  const fixture = {
    info: { name: 'requests', version: '2.28.0', maintainer_email: '' },
    urls: [
      { filename: 'requests-2.28.0.tar.gz', upload_time_iso_8601: '2022-06-29T15:12:00.000000Z' },
    ],
  };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch({ files: [] }),
  });

  assert.equal(result.publisherAccount, null);
});

// ---------------------------------------------------------------------------
// Publish date — AC: earliest upload_time_iso_8601 across all urls[] entries
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: uses earliest upload_time_iso_8601 when multiple release files', async () => {
  // Fixture has two entries: whl at 15:14:30, tar.gz at 15:12:00 — tar.gz is earlier
  const fixture = await loadFixture('pypi-requests-2.28.0.json');

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch({ files: [] }),
  });

  // The earlier timestamp is the tar.gz at 15:12:00
  assert.equal(result.publishedAt, '2022-06-29T15:12:00.000000Z');
});

test('fetchVersionMetadata: returns null publishedAt when urls[] is empty', async () => {
  const fixture = {
    info: { name: 'requests', version: '2.28.0', maintainer_email: null },
    urls: [],
  };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch({ files: [] }),
  });

  assert.equal(result.publishedAt, null);
});

test('fetchVersionMetadata: handles single urls[] entry correctly', async () => {
  const fixture = {
    info: { name: 'somepkg', version: '1.0.0', maintainer_email: null },
    urls: [
      { filename: 'somepkg-1.0.0.tar.gz', upload_time_iso_8601: '2023-01-15T10:00:00.000000Z', uploader: 'author' },
    ],
  };

  const result = await fetchVersionMetadata('somepkg', '1.0.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch({ files: [] }),
  });

  assert.equal(result.publishedAt, '2023-01-15T10:00:00.000000Z');
});

// ---------------------------------------------------------------------------
// Attestation check — AC: PYPI_SIMPLE_API endpoint used; hasAttestations correct
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: hasAttestations is true when files[] contains attestations', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0.json');
  const simpleFixture = await loadFixture('pypi-simple-requests.json');
  // simpleFixture has attestations on one file

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch(simpleFixture),
  });

  assert.equal(result.hasAttestations, true);
});

test('fetchVersionMetadata: hasAttestations is false when files[] has no attestations', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0.json');
  const simpleNoAtt = {
    meta: { 'api-version': '1.1' },
    name: 'requests',
    files: [
      { filename: 'requests-2.28.0.tar.gz', url: '...', hashes: {} },
    ],
  };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch(simpleNoAtt),
  });

  assert.equal(result.hasAttestations, false);
});

test('fetchVersionMetadata: hasAttestations is false when Simple API call fails', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0.json');
  // Simulate Simple API timeout — should not propagate
  const fetchSimpleFail = async () => {
    const err = new Error('mock NETWORK_TIMEOUT');
    err.code = 'NETWORK_TIMEOUT';
    throw err;
  };

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: fetchSimpleFail,
  });

  assert.equal(result.hasAttestations, false);
});

// ---------------------------------------------------------------------------
// Named constant grep check — AC: PYPI_SIMPLE constant greppable at top of file
// ---------------------------------------------------------------------------

test('PYPI_SIMPLE named constant is defined at the top of pypi.js', async () => {
  const srcPath = join(__dirname, '../../src/registry/pypi.js');
  const content = await readFile(srcPath, 'utf8');
  const lines = content.split('\n');

  // Find lines containing PYPI_SIMPLE
  const matchingLines = lines
    .map((line, i) => ({ line, lineNumber: i + 1 }))
    .filter(({ line }) => line.includes('PYPI_SIMPLE'));

  assert.ok(
    matchingLines.length > 0,
    'PYPI_SIMPLE constant not found in src/registry/pypi.js'
  );

  // The constant declaration line must contain 'const PYPI_SIMPLE'
  const declarationLine = matchingLines.find(({ line }) => line.includes('const PYPI_SIMPLE'));
  assert.ok(
    declarationLine != null,
    'No "const PYPI_SIMPLE" declaration line found — expected a named constant'
  );
});

test('no hardcoded PYPI_SIMPLE URL string literal appears inside a fetch call', async () => {
  const srcPath = join(__dirname, '../../src/registry/pypi.js');
  const content = await readFile(srcPath, 'utf8');

  // The literal URL string 'https://pypi.org/simple' must NOT appear inside
  // a function call expression — i.e., not as a direct argument to httpGetJson etc.
  // We verify this by checking that the URL only appears in const declarations.
  const lines = content.split('\n');
  for (const line of lines) {
    const hasPypiSimpleUrl = line.includes('https://pypi.org/simple');
    if (!hasPypiSimpleUrl) continue;

    // The line must be a const declaration (C7 compliance)
    assert.ok(
      line.trimStart().startsWith('const '),
      `Hardcoded URL string "https://pypi.org/simple" found outside a const declaration: "${line.trim()}"`
    );
  }
});

// ---------------------------------------------------------------------------
// Degradation — AC: NETWORK_TIMEOUT in main fetch throws to caller (not caught in pypi.js)
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: throws classified error on NETWORK_TIMEOUT so client.js can degrade', async () => {
  await assert.rejects(
    () => fetchVersionMetadata('requests', '2.28.0', {
      _fetchVersionJson: makeVersionFetchFail('NETWORK_TIMEOUT'),
      _fetchSimpleJson: makeSimpleFetch({ files: [] }),
    }),
    (err) => {
      assert.equal(err.code, 'NETWORK_TIMEOUT');
      return true;
    }
  );
});

test('fetchVersionMetadata: throws REGISTRY_NOT_FOUND on 404', async () => {
  const notFound = async () => {
    const err = new Error('HTTP 404');
    err.code = 'REGISTRY_NOT_FOUND';
    err.statusCode = 404;
    throw err;
  };

  await assert.rejects(
    () => fetchVersionMetadata('no-such-pkg', '1.0.0', {
      _fetchVersionJson: notFound,
      _fetchSimpleJson: makeSimpleFetch({ files: [] }),
    }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_NOT_FOUND');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Return shape — all three fields present on success
// ---------------------------------------------------------------------------

test('fetchVersionMetadata: return shape includes publisherAccount, publishedAt, hasAttestations', async () => {
  const fixture = await loadFixture('pypi-requests-2.28.0.json');
  const simpleFixture = await loadFixture('pypi-simple-requests.json');

  const result = await fetchVersionMetadata('requests', '2.28.0', {
    _fetchVersionJson: makeVersionFetch(fixture),
    _fetchSimpleJson: makeSimpleFetch(simpleFixture),
  });

  assert.ok('publisherAccount' in result, 'publisherAccount field missing');
  assert.ok('publishedAt' in result, 'publishedAt field missing');
  assert.ok('hasAttestations' in result, 'hasAttestations field missing');
  assert.equal(typeof result.hasAttestations, 'boolean');
});

// ---------------------------------------------------------------------------
// Module import smoke test
// ---------------------------------------------------------------------------

test('pypi.js module exports fetchVersionMetadata as a function', () => {
  assert.equal(typeof fetchVersionMetadata, 'function');
});
