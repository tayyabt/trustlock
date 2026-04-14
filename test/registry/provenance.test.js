import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fetchAttestations } from '../../src/registry/provenance.js';

// ---------------------------------------------------------------------------
// Mock factory (same pattern as npm-registry.test.js)
// ---------------------------------------------------------------------------

/**
 * @param {object} opts
 * @param {number}  [opts.statusCode=200]
 * @param {object}  [opts.body]
 * @param {object}  [opts.networkError] - { message, code }
 * @param {boolean} [opts.triggerTimeout=false]
 * @returns {{ mock: object, capturedOptions: () => object | null }}
 */
function makeMockHttps({ statusCode = 200, body = null, networkError = null, triggerTimeout = false } = {}) {
  let capturedOptions = null;

  const mock = {
    get(options, callback) {
      capturedOptions = options;

      const req = new EventEmitter();
      req.setTimeout = (_ms, cb) => { req._timeoutCb = cb; };
      req.destroy = (err) => {
        if (err) setImmediate(() => req.emit('error', err));
      };

      if (triggerTimeout) {
        setImmediate(() => req._timeoutCb && req._timeoutCb());
        return req;
      }

      if (networkError) {
        const err = new Error(networkError.message);
        err.code = networkError.code;
        setImmediate(() => req.emit('error', err));
        return req;
      }

      setImmediate(() => {
        const res = new EventEmitter();
        res.statusCode = statusCode;
        res.resume = () => {};

        callback(res);

        setImmediate(() => {
          if (statusCode === 200 && body !== null) {
            res.emit('data', Buffer.from(JSON.stringify(body)));
          }
          res.emit('end');
        });
      });

      return req;
    },
  };

  return { mock, capturedOptions: () => capturedOptions };
}

// ---------------------------------------------------------------------------
// fetchAttestations
// ---------------------------------------------------------------------------

test('fetchAttestations returns parsed attestation JSON for a 200 response', async () => {
  const payload = {
    attestations: [{ predicateType: 'https://slsa.dev/provenance/v0.2', bundleBytes: 'abc123' }],
  };
  const { mock } = makeMockHttps({ body: payload });
  const result = await fetchAttestations('sigstore', '1.9.0', { _https: mock });
  assert.deepEqual(result, payload);
});

test('fetchAttestations constructs the correct URL path for an unscoped package', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: { attestations: [] } });
  await fetchAttestations('sigstore', '1.9.0', { _https: mock });
  assert.equal(capturedOptions().hostname, 'registry.npmjs.org');
  assert.equal(capturedOptions().path, '/-/npm/v1/attestations/sigstore@1.9.0');
});

test('fetchAttestations constructs the correct URL path for a scoped package', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: { attestations: [] } });
  await fetchAttestations('@sigstore/bundle', '2.3.2', { _https: mock });
  assert.equal(capturedOptions().path, '/-/npm/v1/attestations/@sigstore%2fbundle@2.3.2');
});

test('fetchAttestations returns null when the attestations endpoint returns 404', async () => {
  const { mock } = makeMockHttps({ statusCode: 404 });
  const result = await fetchAttestations('no-attestations-package', '1.0.0', { _https: mock });
  assert.equal(result, null);
});

test('fetchAttestations throws REGISTRY_RATE_LIMITED on 429', async () => {
  const { mock } = makeMockHttps({ statusCode: 429 });
  await assert.rejects(
    () => fetchAttestations('sigstore', '1.9.0', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_RATE_LIMITED');
      return true;
    }
  );
});

test('fetchAttestations throws REGISTRY_ERROR on 500', async () => {
  const { mock } = makeMockHttps({ statusCode: 500 });
  await assert.rejects(
    () => fetchAttestations('sigstore', '1.9.0', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_ERROR');
      return true;
    }
  );
});

test('fetchAttestations throws NETWORK_TIMEOUT when timeout fires', async () => {
  const { mock } = makeMockHttps({ triggerTimeout: true });
  await assert.rejects(
    () => fetchAttestations('sigstore', '1.9.0', { timeoutMs: 1, _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_TIMEOUT');
      return true;
    }
  );
});

test('fetchAttestations throws NETWORK_ERROR on DNS failure', async () => {
  const { mock } = makeMockHttps({ networkError: { message: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' } });
  await assert.rejects(
    () => fetchAttestations('sigstore', '1.9.0', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});
