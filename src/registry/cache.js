import { readFile, writeFile, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Encode a cache key to a safe filename.
 * Handles scoped packages: @scope/name → @scope%2fname
 */
function encodeKey(key) {
  return key.replace(/\//g, '%2f');
}

/**
 * Create a file-based cache bound to `cacheDir`.
 *
 * @param {string} cacheDir - Directory where cache files are stored.
 * @returns {{ get: Function, set: Function, invalidate: Function }}
 */
export function createCache(cacheDir) {
  /**
   * Read a cached value.
   *
   * @param {string} key
   * @param {number} ttlMs - Time-to-live in milliseconds.
   * @returns {Promise<{ data: object, fresh: boolean } | null>}
   *   `null` if the file is missing or the JSON is corrupted.
   */
  async function get(key, ttlMs) {
    const filePath = join(cacheDir, encodeKey(key) + '.json');
    try {
      const content = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);
      const { _cachedAt, ...data } = parsed;
      const fresh = (_cachedAt + ttlMs) > Date.now();
      return { data, fresh };
    } catch {
      return null;
    }
  }

  /**
   * Write a value to the cache.
   * Creates `cacheDir` if it does not exist.
   * Uses atomic temp-file + rename to prevent corruption.
   * Write failures are silently swallowed — cache is best-effort.
   *
   * @param {string} key
   * @param {object} data
   * @returns {Promise<void>}
   */
  async function set(key, data) {
    const filePath = join(cacheDir, encodeKey(key) + '.json');
    const tmpPath = filePath + '.tmp.' + randomBytes(4).toString('hex');
    const content = JSON.stringify({ ...data, _cachedAt: Date.now() });
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(tmpPath, content, 'utf8');
      await rename(tmpPath, filePath);
    } catch {
      try { await unlink(tmpPath); } catch { /* ignore */ }
    }
  }

  /**
   * Remove a cached entry.
   * Silently ignored if the file does not exist.
   *
   * @param {string} key
   * @returns {Promise<void>}
   */
  async function invalidate(key) {
    const filePath = join(cacheDir, encodeKey(key) + '.json');
    try {
      await unlink(filePath);
    } catch { /* ignore — already missing */ }
  }

  return { get, set, invalidate };
}
