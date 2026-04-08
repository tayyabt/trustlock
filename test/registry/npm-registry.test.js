import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { fetchFullMetadata, fetchVersionMetadata } from '../../src/registry/npm-registry.js';

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock https module.
 *
 * @param {object} opts
 * @param {number}  [opts.statusCode=200]
 * @param {object}  [opts.body]        - Serialised as JSON on 200 responses
 * @param {object}  [opts.networkError] - { message, code } emitted via req 'error'
 * @param {boolean} [opts.triggerTimeout=false]
 * @param {number}  [opts.chunkSize]   - If set, splits body into chunks of this byte size
 * @returns {{ mock: object, capturedOptions: () => object | null }}
 */
function makeMockHttps({ statusCode = 200, body = null, networkError = null, triggerTimeout = false, chunkSize = null } = {}) {
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
            const encoded = Buffer.from(JSON.stringify(body));
            if (chunkSize) {
              for (let i = 0; i < encoded.length; i += chunkSize) {
                res.emit('data', encoded.slice(i, i + chunkSize));
              }
            } else {
              res.emit('data', encoded);
            }
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
// fetchFullMetadata
// ---------------------------------------------------------------------------

test('fetchFullMetadata returns parsed JSON for a 200 response', async () => {
  const payload = { name: 'lodash', versions: { '4.17.21': {} }, time: {} };
  const { mock } = makeMockHttps({ body: payload });
  const result = await fetchFullMetadata('lodash', { _https: mock });
  assert.deepEqual(result, payload);
});

test('fetchFullMetadata constructs the correct URL path for an unscoped package', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: {} });
  await fetchFullMetadata('express', { _https: mock });
  assert.equal(capturedOptions().hostname, 'registry.npmjs.org');
  assert.equal(capturedOptions().path, '/express');
});

test('fetchFullMetadata URL-encodes scoped package names', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: {} });
  await fetchFullMetadata('@babel/core', { _https: mock });
  assert.equal(capturedOptions().path, '/@babel%2fcore');
});

test('fetchFullMetadata reassembles a multi-chunk response', async () => {
  const payload = { name: 'lodash', big: 'x'.repeat(1_000) };
  const { mock } = makeMockHttps({ body: payload, chunkSize: 64 });
  const result = await fetchFullMetadata('lodash', { _https: mock });
  assert.deepEqual(result, payload);
});

test('fetchFullMetadata throws REGISTRY_NOT_FOUND on 404', async () => {
  const { mock } = makeMockHttps({ statusCode: 404 });
  await assert.rejects(
    () => fetchFullMetadata('no-such-package', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_NOT_FOUND');
      return true;
    }
  );
});

test('fetchFullMetadata throws REGISTRY_RATE_LIMITED on 429', async () => {
  const { mock } = makeMockHttps({ statusCode: 429 });
  await assert.rejects(
    () => fetchFullMetadata('express', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_RATE_LIMITED');
      return true;
    }
  );
});

test('fetchFullMetadata throws REGISTRY_ERROR on 500', async () => {
  const { mock } = makeMockHttps({ statusCode: 500 });
  await assert.rejects(
    () => fetchFullMetadata('express', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_ERROR');
      return true;
    }
  );
});

test('fetchFullMetadata throws REGISTRY_ERROR on 503', async () => {
  const { mock } = makeMockHttps({ statusCode: 503 });
  await assert.rejects(
    () => fetchFullMetadata('express', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_ERROR');
      return true;
    }
  );
});

test('fetchFullMetadata throws NETWORK_TIMEOUT when timeout is triggered', async () => {
  const { mock } = makeMockHttps({ triggerTimeout: true });
  await assert.rejects(
    () => fetchFullMetadata('express', { timeoutMs: 1, _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_TIMEOUT');
      return true;
    }
  );
});

test('fetchFullMetadata throws NETWORK_ERROR on DNS failure', async () => {
  const { mock } = makeMockHttps({ networkError: { message: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' } });
  await assert.rejects(
    () => fetchFullMetadata('express', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});

test('fetchFullMetadata throws NETWORK_ERROR on connection refused', async () => {
  const { mock } = makeMockHttps({ networkError: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' } });
  await assert.rejects(
    () => fetchFullMetadata('express', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});

test('fetchFullMetadata throws REGISTRY_ERROR when response body exceeds 50 MB', async () => {
  // Build a mock that emits a single chunk larger than MAX_RESPONSE_BYTES (50 MB)
  const hugeMock = {
    get(_options, callback) {
      const req = new EventEmitter();
      req.setTimeout = () => {};
      req.destroy = () => {};

      setImmediate(() => {
        const res = new EventEmitter();
        res.statusCode = 200;
        res.resume = () => {};
        callback(res);
        setImmediate(() => {
          // Emit a chunk that exceeds the 50 MB ceiling
          res.emit('data', Buffer.alloc(51 * 1024 * 1024));
          res.emit('end');
        });
      });
      return req;
    },
  };

  await assert.rejects(
    () => fetchFullMetadata('lodash', { _https: hugeMock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_ERROR');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// fetchVersionMetadata
// ---------------------------------------------------------------------------

test('fetchVersionMetadata returns parsed JSON for a 200 response', async () => {
  const payload = { name: 'express', version: '4.18.2', scripts: {}, _npmUser: {} };
  const { mock } = makeMockHttps({ body: payload });
  const result = await fetchVersionMetadata('express', '4.18.2', { _https: mock });
  assert.deepEqual(result, payload);
});

test('fetchVersionMetadata constructs the correct URL path', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: {} });
  await fetchVersionMetadata('express', '4.18.2', { _https: mock });
  assert.equal(capturedOptions().hostname, 'registry.npmjs.org');
  assert.equal(capturedOptions().path, '/express/4.18.2');
});

test('fetchVersionMetadata URL-encodes scoped package names', async () => {
  const { mock, capturedOptions } = makeMockHttps({ body: {} });
  await fetchVersionMetadata('@babel/core', '7.24.0', { _https: mock });
  assert.equal(capturedOptions().path, '/@babel%2fcore/7.24.0');
});

test('fetchVersionMetadata throws REGISTRY_NOT_FOUND on 404', async () => {
  const { mock } = makeMockHttps({ statusCode: 404 });
  await assert.rejects(
    () => fetchVersionMetadata('no-such-pkg', '1.0.0', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_NOT_FOUND');
      return true;
    }
  );
});

test('fetchVersionMetadata throws REGISTRY_RATE_LIMITED on 429', async () => {
  const { mock } = makeMockHttps({ statusCode: 429 });
  await assert.rejects(
    () => fetchVersionMetadata('express', '4.18.2', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_RATE_LIMITED');
      return true;
    }
  );
});

test('fetchVersionMetadata throws REGISTRY_ERROR on 500', async () => {
  const { mock } = makeMockHttps({ statusCode: 500 });
  await assert.rejects(
    () => fetchVersionMetadata('express', '4.18.2', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'REGISTRY_ERROR');
      return true;
    }
  );
});

test('fetchVersionMetadata throws NETWORK_TIMEOUT when timeout fires', async () => {
  const { mock } = makeMockHttps({ triggerTimeout: true });
  await assert.rejects(
    () => fetchVersionMetadata('express', '4.18.2', { timeoutMs: 1, _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_TIMEOUT');
      return true;
    }
  );
});

test('fetchVersionMetadata throws NETWORK_ERROR on network failure', async () => {
  const { mock } = makeMockHttps({ networkError: { message: 'getaddrinfo ENOTFOUND', code: 'ENOTFOUND' } });
  await assert.rejects(
    () => fetchVersionMetadata('express', '4.18.2', { _https: mock }),
    (err) => {
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});
