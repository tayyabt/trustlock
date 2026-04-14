/**
 * Rule: exposure:pinning
 *
 * Blocks floating semver ranges in package.json when policy.pinning.required = true.
 * Reads package.json directly from the filesystem (not from the lockfile — constraint C2).
 * Checks both `dependencies` and `devDependencies`.
 *
 * Range operators that trigger a block: ^, ~, >, >=, <, <=, *, x
 *
 * @param {{ name: string, version: string }} dependency
 * @param {object | null} baseline  TrustProfile from baseline (not used by this rule).
 * @param {object | null} registryData  Registry metadata (not used by this rule).
 * @param {{ pinning: { required: boolean } }} policy
 * @param {string} packageJsonPath
 *   Absolute path to the project's package.json. The caller (engine) provides this.
 * @returns {Promise<import('../models.js').Finding[]>}
 */

import { readFile } from 'node:fs/promises';

// Version spec substrings that indicate a floating range.
const RANGE_OPERATORS = ['^', '~', '>=', '<=', '>', '<', '*', 'x'];

/**
 * Return true if the version specifier contains any range operator.
 * @param {string} spec
 * @returns {boolean}
 */
function isRangeSpec(spec) {
  if (!spec || typeof spec !== 'string') return false;
  for (const op of RANGE_OPERATORS) {
    if (spec.includes(op)) return true;
  }
  return false;
}

export async function evaluate(dependency, baseline, registryData, policy, packageJsonPath) {
  // Pinning not required — admit immediately without reading package.json.
  if (!policy.pinning?.required) {
    return [];
  }

  let pkg;
  try {
    const raw = await readFile(packageJsonPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch {
    // package.json unreadable or unparseable — skip rather than block.
    return [];
  }

  const allDeps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  const spec = allDeps[dependency.name];

  if (spec != null && isRangeSpec(spec)) {
    return [
      {
        rule: 'exposure:pinning',
        severity: 'error',
        message: `${dependency.name} uses floating range "${spec}" in package.json; pinning.required = true requires an exact version`,
        detail: {
          name: dependency.name,
          spec,
          packageJsonPath,
        },
      },
    ];
  }

  return [];
}
