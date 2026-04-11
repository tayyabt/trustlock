import https from 'node:https';

const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB safety guard

const KNOWN_CODES = new Set([
  'NETWORK_TIMEOUT',
  'NETWORK_ERROR',
  'REGISTRY_NOT_FOUND',
  'REGISTRY_RATE_LIMITED',
  'REGISTRY_ERROR',
]);

/**
 * Create a classified error for a non-200 HTTP status.
 *
 * @param {number} statusCode
 * @returns {Error}
 */
function classifyHttpError(statusCode) {
  let code;
  if (statusCode === 404) code = 'REGISTRY_NOT_FOUND';
  else if (statusCode === 429) code = 'REGISTRY_RATE_LIMITED';
  else code = 'REGISTRY_ERROR';
  const err = new Error(`HTTP ${statusCode}`);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

/**
 * GET a URL over HTTPS and return the parsed JSON body.
 *
 * Collects the response as a stream of Buffer chunks (size-bounded at 50 MB)
 * and parses the full body once the stream ends. Throws a classified error on
 * HTTP failures, network errors, timeouts, and JSON parse failures.
 *
 * @param {string} url
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=30000]
 * @param {object} [opts._https] - Injectable https module (for unit tests only)
 * @returns {Promise<object>}
 */
export function httpGetJson(url, { timeoutMs = 30_000, _https: httpsModule = https, headers: extraHeaders = {} } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, val) => {
      if (!settled) {
        settled = true;
        fn(val);
      }
    };

    const { hostname, pathname, search } = new URL(url);

    const req = httpsModule.get(
      { hostname, path: pathname + search, headers: { Accept: 'application/json', ...extraHeaders } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return done(reject, classifyHttpError(res.statusCode));
        }

        const chunks = [];
        let bytesReceived = 0;

        res.on('data', (chunk) => {
          bytesReceived += chunk.length;
          if (bytesReceived > MAX_RESPONSE_BYTES) {
            res.removeAllListeners('data');
            res.removeAllListeners('end');
            res.resume();
            req.destroy();
            const err = new Error('Response body exceeded size limit');
            err.code = 'REGISTRY_ERROR';
            return done(reject, err);
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          try {
            done(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            const err = new Error('Failed to parse JSON response');
            err.code = 'REGISTRY_ERROR';
            done(reject, err);
          }
        });

        res.on('error', (err) => {
          if (!KNOWN_CODES.has(err.code)) err.code = 'NETWORK_ERROR';
          done(reject, err);
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      const err = new Error(`Request timed out after ${timeoutMs}ms`);
      err.code = 'NETWORK_TIMEOUT';
      req.destroy(err);
    });

    req.on('error', (err) => {
      if (!KNOWN_CODES.has(err.code)) err.code = 'NETWORK_ERROR';
      done(reject, err);
    });
  });
}
