/**
 * src/policy/loader.js
 *
 * Async policy entry point for trustlock (F15-S2, ADR-005).
 *
 * Owns the three-step merge sequence:
 *   1. Parse repo .trustlockrc.json
 *   2. If `extends` key present: resolveExtends() + mergePolicy() from inherit.js
 *   3. Apply --profile overlay via applyProfileOverlay() from builtin-profiles.js
 *
 * Commands that call loadPolicy():
 *   - src/cli/commands/check.js
 *   - src/cli/commands/audit.js
 *   - src/cli/commands/approve.js
 *   - src/cli/commands/init.js
 *
 * C-NEW-4 carve-out: src/cli/commands/cross-audit.js reads .trustlockrc.json
 * directly via fs.readFile and MUST NOT call loadPolicy(). This is a permanent
 * carve-out — cross-audit is a passive, multi-project scan that bypasses the
 * full policy inheritance chain by design.
 */

import { readFile } from 'node:fs/promises';
import { resolveExtends, mergePolicy } from './inherit.js';
import { applyProfileOverlay, isBuiltinProfile } from './builtin-profiles.js';

// ---------------------------------------------------------------------------
// Defaults (mirrors src/policy/config.js — applied after all merges)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  cooldown_hours: 72,
  pinning: { required: false },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: [] },
  transitive: { max_new: 5 },
};

/**
 * Merge a partial nested object over a defaults object (one level deep).
 * Defaults fill in missing keys; all keys from `override` are preserved,
 * including keys not present in `defaults` (e.g. block_on_publisher_change).
 * This differs from config.js's mergeNested which strips unknown keys.
 *
 * @param {object} defaults
 * @param {unknown} override
 * @returns {object}
 */
function mergeNested(defaults, override) {
  if (override == null || typeof override !== 'object' || Array.isArray(override)) {
    return { ...defaults };
  }
  // defaults first, override wins — unknown override keys are preserved.
  return { ...defaults, ...override };
}

/**
 * Normalize a raw (merged) config object into a complete PolicyConfig.
 *
 * Known PolicyConfig fields are filled from DEFAULTS when absent. Unknown
 * fields (e.g. `require_reason`, `max_expiry_days`) are preserved as
 * pass-through so callers like approve.js can read them. The `extends` key
 * is stripped — it is not a runtime policy field.
 *
 * @param {object} raw — raw merged config (may be from mergePolicy or straight parse)
 * @returns {object} Normalized PolicyConfig (superset — extra fields preserved)
 */
function normalizePolicyConfig(raw) {
  // Start with all fields so unknown keys pass through.
  const result = { ...raw };

  // Apply defaults for each known PolicyConfig field.
  result.cooldown_hours =
    typeof raw.cooldown_hours === 'number' ? raw.cooldown_hours : DEFAULTS.cooldown_hours;
  result.pinning  = mergeNested(DEFAULTS.pinning,  raw.pinning);
  result.scripts  = mergeNested(DEFAULTS.scripts,  raw.scripts);
  result.sources  = mergeNested(DEFAULTS.sources,  raw.sources);
  result.provenance = mergeNested(DEFAULTS.provenance, raw.provenance);
  result.transitive = mergeNested(DEFAULTS.transitive, raw.transitive);

  // profiles: keep if valid map, remove otherwise.
  if (
    raw.profiles == null ||
    typeof raw.profiles !== 'object' ||
    Array.isArray(raw.profiles)
  ) {
    delete result.profiles;
  }

  // Strip the `extends` key — not a runtime policy field.
  delete result.extends;

  return result;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Load and merge the trustlock policy for a project directory.
 *
 * Three-step ADR-005 merge sequence:
 *   1. Parse `configPath` as raw JSON.
 *   2. If `extends` present: resolveExtends() + mergePolicy() (inherit.js owns this).
 *   3. Apply `--profile` overlay via applyProfileOverlay() (builtin-profiles.js).
 *
 * Throws { message, exitCode: 2 } on:
 *   - missing or malformed .trustlockrc.json
 *   - resolveExtends failure (unreachable URL with no cache, local path not found)
 *   - floor violation (mergePolicy or profile floor check)
 *   - profile name not found in user-defined or built-in profiles
 *
 * @param {{ configPath: string, cacheDir: string, profile: string | null }} args
 * @returns {Promise<object>} Merged and normalized PolicyConfig (all layers applied)
 */
export async function loadPolicy({ configPath, cacheDir, profile }) {
  // ── Step 1: Read and parse .trustlockrc.json ────────────────────────────────
  let raw;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (cause) {
    const err = new Error(`Policy file not found: ${configPath}`);
    err.exitCode = 2;
    err.cause = cause;
    throw err;
  }

  let rawRepo;
  try {
    rawRepo = JSON.parse(raw);
  } catch (cause) {
    const err = new Error(`Failed to parse policy file: ${cause.message}`);
    err.exitCode = 2;
    err.cause = cause;
    throw err;
  }

  // ── Step 2: Resolve `extends` and merge if present ──────────────────────────
  let merged = rawRepo;
  if (rawRepo.extends) {
    // resolveExtends throws on: URL unreachable + no cache, local path not found,
    // malformed JSON response. mergePolicy throws on floor violation.
    const base = await resolveExtends(rawRepo.extends, configPath, cacheDir);
    if (base !== null) {
      merged = mergePolicy(base, rawRepo);
    }
  }

  // ── Step 3: Normalize (apply defaults; preserve pass-through fields) ────────
  const normalized = normalizePolicyConfig(merged);

  // ── Step 4: Apply profile overlay ───────────────────────────────────────────
  if (profile != null) {
    const profilesMap = normalized.profiles != null ? normalized.profiles : {};
    const isUserDefined = Object.prototype.hasOwnProperty.call(profilesMap, profile);
    const builtin = !isUserDefined && isBuiltinProfile(profile);

    if (!isUserDefined && !builtin) {
      const err = new Error(
        `Profile "${profile}" not found in .trustlockrc.json or built-in profiles.`
      );
      err.exitCode = 2;
      throw err;
    }

    // applyProfileOverlay: user-defined wins over built-in; built-in relaxed skips floor check.
    const result = applyProfileOverlay(normalized, profile, profilesMap, builtin);

    // result should never be undefined here (we already verified the profile exists above).
    if (!result) {
      const err = new Error(`Profile "${profile}" not found.`);
      err.exitCode = 2;
      throw err;
    }

    return result.config;
  }

  return normalized;
}
