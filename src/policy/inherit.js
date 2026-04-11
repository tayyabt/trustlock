/**
 * src/policy/inherit.js
 *
 * Owns all `extends` resolution logic for trustlock policy inheritance (F15-S1).
 *
 * Exports:
 *   resolveExtends(extendsValue, configFilePath, cacheDir) → Promise<PolicyObject | null>
 *     Detects URL vs. local path, fetches/reads the base policy, manages the 1-hour
 *     remote cache at {cacheDir}/org-policy.json, strips chained `extends` with a
 *     stderr warning, and returns the pre-merge base policy object.
 *
 *   mergePolicy(base, repo) → PolicyObject
 *     Deep-merges a repo config over a base (org) policy:
 *       - Scalar (number, boolean, string): repo wins; numeric floor enforced.
 *       - Arrays: union — repo cannot remove base entries.
 *       - Nested objects: one-level deep merge with the same scalar/array rules.
 *     Throws with exitCode=2 on floor violation.
 *
 * This module does NOT import from the registry module (C6 compliance).
 * Uses only Node.js built-ins: node:https, node:http, node:fs/promises, node:path.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import { resolve, dirname } from 'node:path';

/** Cache TTL: 1 hour in milliseconds. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Cache filename within cacheDir. */
const CACHE_FILENAME = 'org-policy.json';

// ---------------------------------------------------------------------------
// HTTP fetch
// ---------------------------------------------------------------------------

/**
 * Fetch a URL via HTTP or HTTPS and return the full response body as a string.
 * Rejects on connection error or timeout (10 s).
 *
 * @param {string} url
 * @returns {Promise<string>}
 */
function fetchUrl(url) {
  return new Promise((res, rej) => {
    const mod = url.startsWith('https://') ? https : http;
    const req = mod.get(url, (response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => res(body));
      response.on('error', rej);
    });
    req.on('error', rej);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Request timed out'));
    });
  });
}

// ---------------------------------------------------------------------------
// Chained-extends stripping
// ---------------------------------------------------------------------------

/**
 * If `policy` contains an `extends` key, strip it and emit a warning to stderr.
 *
 * @param {object} policy
 * @returns {object}
 */
function stripChainedExtends(policy) {
  if (Object.prototype.hasOwnProperty.call(policy, 'extends')) {
    process.stderr.write('Warning: chained extends in org policy is not supported. Ignoring.\n');
    const { extends: _dropped, ...rest } = policy;
    return rest;
  }
  return policy;
}

// ---------------------------------------------------------------------------
// Local path resolution
// ---------------------------------------------------------------------------

/**
 * Read and parse a policy from a local file path.
 * Path is resolved relative to the directory containing `configFilePath`.
 * No cache is written for local paths.
 *
 * @param {string} extendsValue — relative (or absolute) path from the `extends` key
 * @param {string} configFilePath — absolute path to the .trustlockrc.json
 * @returns {Promise<object>}
 */
async function resolveLocalPath(extendsValue, configFilePath) {
  const resolvedPath = resolve(dirname(configFilePath), extendsValue);

  let content;
  try {
    content = await readFile(resolvedPath, 'utf8');
  } catch {
    const err = new Error(`extends path not found: ${resolvedPath}`);
    err.exitCode = 2;
    throw err;
  }

  let policy;
  try {
    policy = JSON.parse(content);
  } catch (cause) {
    const err = new Error(`Failed to parse extends file at ${resolvedPath}: ${cause.message}`);
    err.exitCode = 2;
    err.cause = cause;
    throw err;
  }

  return stripChainedExtends(policy);
}

// ---------------------------------------------------------------------------
// Remote URL resolution with cache
// ---------------------------------------------------------------------------

/**
 * Fetch and cache a remote policy URL.
 *
 * Cache format: { "fetched_at": "<ISO>", "policy": { ...PolicyObject } }
 * Cache lives at {cacheDir}/org-policy.json.
 * TTL: 1 hour. If the cache is fresh, the network is not contacted.
 * If the network is unreachable and a stale cache exists, the stale copy is
 * used with a stderr warning. If no cache exists at all, rejects.
 *
 * @param {string} url
 * @param {string} cacheDir — directory where org-policy.json is stored
 * @returns {Promise<object>}
 */
async function resolveRemoteUrl(url, cacheDir) {
  const cachePath = resolve(cacheDir, CACHE_FILENAME);

  // Attempt to read existing cache entry.
  let cachedEntry = null;
  try {
    const raw = await readFile(cachePath, 'utf8');
    cachedEntry = JSON.parse(raw);
  } catch {
    // No cache or unreadable — will fetch.
  }

  // If cache is fresh (age < TTL), return without making an HTTP call.
  if (
    cachedEntry !== null &&
    cachedEntry.fetched_at &&
    cachedEntry.policy
  ) {
    const ageMs = Date.now() - new Date(cachedEntry.fetched_at).getTime();
    if (ageMs < CACHE_TTL_MS) {
      return cachedEntry.policy;
    }
  }

  // Cache is absent or stale — attempt fetch.
  let body;
  try {
    body = await fetchUrl(url);
  } catch {
    // Network unreachable.
    if (cachedEntry !== null && cachedEntry.policy) {
      // Use stale cache with warning.
      process.stderr.write(
        `Warning: could not reach policy URL, using cached copy from ${cachedEntry.fetched_at}.\n`
      );
      return cachedEntry.policy;
    }
    // No cache at all — fatal.
    const err = new Error(
      `could not fetch org policy from ${url} and no cached copy exists.`
    );
    err.exitCode = 2;
    throw err;
  }

  // Parse the response.
  let policy;
  try {
    policy = JSON.parse(body);
  } catch {
    const err = new Error(`Failed to parse JSON response from ${url}`);
    err.exitCode = 2;
    throw err;
  }

  // Strip chained extends before caching so the warning is not repeated on cache hits.
  policy = stripChainedExtends(policy);

  // Write refreshed cache.
  const entry = {
    fetched_at: new Date().toISOString(),
    policy,
  };
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify(entry, null, 2), 'utf8');

  return policy;
}

// ---------------------------------------------------------------------------
// resolveExtends — public entry point
// ---------------------------------------------------------------------------

/**
 * Resolve the `extends` key from a repo policy config.
 *
 * If `extendsValue` is falsy, returns null (caller should skip merge).
 * For URLs starting with `https://` or `http://`, fetches remotely with cache.
 * For all other values, reads the local path relative to `configFilePath`.
 *
 * @param {string | null | undefined} extendsValue — value of the `extends` key
 * @param {string} configFilePath — absolute path to .trustlockrc.json
 * @param {string} cacheDir — directory for the org-policy.json cache
 * @returns {Promise<object | null>} Base policy object (pre-merge), or null
 */
export async function resolveExtends(extendsValue, configFilePath, cacheDir) {
  if (!extendsValue) {
    return null;
  }

  const isRemote =
    extendsValue.startsWith('https://') || extendsValue.startsWith('http://');

  if (isRemote) {
    return resolveRemoteUrl(extendsValue, cacheDir);
  }

  return resolveLocalPath(extendsValue, configFilePath);
}

// ---------------------------------------------------------------------------
// mergePolicy — public merge + floor enforcement
// ---------------------------------------------------------------------------

/**
 * Merge two nested (one-level-deep) policy objects.
 * Applies scalar-override, array-union, and numeric floor enforcement.
 * Throws on floor violation.
 *
 * @param {object} base — parent object from base (org) policy
 * @param {object} repo — parent object from repo policy
 * @param {string} [parentKey] — used in error messages for nested fields
 * @returns {object}
 */
function mergeNestedObject(base, repo, parentKey) {
  const result = { ...base };

  for (const [key, repoValue] of Object.entries(repo)) {
    const baseValue = base[key];

    if (Array.isArray(repoValue)) {
      // Array union: base entries are always preserved.
      result[key] = Array.isArray(baseValue)
        ? [...new Set([...baseValue, ...repoValue])]
        : [...repoValue];
    } else if (typeof repoValue === 'number') {
      // Numeric scalar: floor check against base.
      if (typeof baseValue === 'number' && repoValue < baseValue) {
        const err = new Error(
          `Policy error: repo config sets ${key}=${repoValue}, below org minimum of ${baseValue}. Repos may only tighten org policy.`
        );
        err.exitCode = 2;
        throw err;
      }
      result[key] = repoValue;
    } else {
      // Non-numeric scalar or unknown type: repo wins.
      result[key] = repoValue;
    }
  }

  return result;
}

/**
 * Deep-merge a repo policy config over a base (org) policy config.
 *
 * Merge semantics (ADR-005):
 *   - Numeric scalars: repo wins; numeric floor enforced (repo >= base).
 *   - Non-numeric scalars (boolean, string): repo wins.
 *   - Arrays: union of base and repo; repo cannot remove base entries.
 *   - Nested objects: one-level deep merge using the same rules recursively.
 *   - `profiles` object: union of keys; repo keys win on conflict (shallow merge).
 *
 * Throws { message, exitCode: 2 } on the first floor violation found.
 *
 * @param {object} base — base (org) policy (pre-merge)
 * @param {object} repo — repo policy config
 * @returns {object} Merged policy
 */
export function mergePolicy(base, repo) {
  const result = { ...base };

  for (const [key, repoValue] of Object.entries(repo)) {
    // Skip `extends` key — callers strip it before calling mergePolicy.
    if (key === 'extends') continue;

    const baseValue = base[key];

    if (Array.isArray(repoValue)) {
      // Array union.
      result[key] = Array.isArray(baseValue)
        ? [...new Set([...baseValue, ...repoValue])]
        : [...repoValue];
    } else if (
      repoValue !== null &&
      typeof repoValue === 'object' &&
      !Array.isArray(repoValue)
    ) {
      // Nested object: one-level deep merge.
      if (
        baseValue !== null &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue)
      ) {
        result[key] = mergeNestedObject(baseValue, repoValue, key);
      } else {
        result[key] = { ...repoValue };
      }
    } else if (typeof repoValue === 'number') {
      // Numeric scalar: floor check.
      if (typeof baseValue === 'number' && repoValue < baseValue) {
        const err = new Error(
          `Policy error: repo config sets ${key}=${repoValue}, below org minimum of ${baseValue}. Repos may only tighten org policy.`
        );
        err.exitCode = 2;
        throw err;
      }
      result[key] = repoValue;
    } else {
      // Non-numeric scalar: repo wins.
      result[key] = repoValue;
    }
  }

  return result;
}
