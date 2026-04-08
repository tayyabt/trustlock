/**
 * Policy configuration loader for dep-fence.
 *
 * Reads .depfencerc.json at the given path, merges the file contents over
 * hardcoded defaults, and returns a complete PolicyConfig. Unknown top-level
 * keys are silently dropped (forward-compat for future rule names).
 *
 * Throws a structured error with .exitCode = 2 on:
 *   - missing file
 *   - malformed JSON
 */

import { readFile } from 'node:fs/promises';

/** @type {import('./models.js').PolicyConfig} */
const DEFAULTS = {
  cooldown_hours: 72,
  pinning: {
    required: false,
  },
  scripts: {
    allowlist: [],
  },
  sources: {
    allowed: ['registry'],
  },
  provenance: {
    required_for: [],
  },
  transitive: {
    max_new: 5,
  },
};

/**
 * Merge a partial nested object over a defaults object at one level of depth.
 * Only keys present in defaults are retained from the override.
 * @param {object} defaults
 * @param {object} override
 * @returns {object}
 */
function mergeNested(defaults, override) {
  if (override == null || typeof override !== 'object') return { ...defaults };
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(override, key)) {
      result[key] = override[key];
    }
  }
  return result;
}

/**
 * Load and validate the dep-fence policy configuration file.
 *
 * @param {string} configPath - Absolute path to the .depfencerc.json file.
 * @returns {Promise<import('./models.js').PolicyConfig>} Fully merged PolicyConfig.
 * @throws {{ message: string, exitCode: 2 }} On missing file or malformed JSON.
 */
export async function loadPolicy(configPath) {
  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (cause) {
    const err = new Error(`Policy file not found: ${configPath}`);
    err.exitCode = 2;
    err.cause = cause;
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    const err = new Error(`Failed to parse policy file: ${cause.message}`);
    err.exitCode = 2;
    err.cause = cause;
    throw err;
  }

  // Merge known top-level scalar fields.
  const cooldown_hours =
    typeof parsed.cooldown_hours === 'number'
      ? parsed.cooldown_hours
      : DEFAULTS.cooldown_hours;

  // Merge known top-level nested fields; unknown keys are silently dropped.
  const pinning = mergeNested(DEFAULTS.pinning, parsed.pinning);
  const scripts = mergeNested(DEFAULTS.scripts, parsed.scripts);
  const sources = mergeNested(DEFAULTS.sources, parsed.sources);
  const provenance = mergeNested(DEFAULTS.provenance, parsed.provenance);
  const transitive = mergeNested(DEFAULTS.transitive, parsed.transitive);

  return {
    cooldown_hours,
    pinning,
    scripts,
    sources,
    provenance,
    transitive,
  };
}
