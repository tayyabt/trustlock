/**
 * `dep-fence init` command — one-time project initialization.
 *
 * Creates .depfencerc.json, .dep-fence/ scaffold (approvals.json, .cache/, .gitignore),
 * and optionally the initial trust baseline from the current lockfile.
 *
 * Flags:
 *   --strict       Write stricter default policy thresholds
 *   --no-baseline  Create scaffold and config only; skip lockfile parsing and baseline write
 *
 * Exit codes:
 *   0  Success
 *   2  Fatal: .dep-fence/ already exists (D6), no lockfile, unknown lockfile version (Q1)
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseLockfile } from '../../lockfile/parser.js';
import { createRegistryClient } from '../../registry/client.js';
import { createBaseline, writeAndStage } from '../../baseline/manager.js';

const SUPPORTED_NPM_VERSIONS = new Set([1, 2, 3]);

const DEFAULT_POLICY = {
  cooldown_hours: 72,
  pinning: { required: false },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: [] },
  transitive: { max_new: 5 },
};

const STRICT_POLICY = {
  cooldown_hours: 24,
  pinning: { required: true },
  scripts: { allowlist: [] },
  sources: { allowed: ['registry'] },
  provenance: { required_for: ['*'] },
  transitive: { max_new: 3 },
};

/**
 * Run the `dep-fence init` command.
 *
 * @param {{ values: object, positionals: string[] }} args  Parsed CLI arguments
 * @param {object} [_opts]  Dependency injection for tests
 * @param {object}   [_opts._registryClient]  Pre-built registry client (skips createRegistryClient)
 * @param {string}   [_opts._cwd]             Override process.cwd() for test isolation
 */
export async function run(args, { _registryClient, _cwd } = {}) {
  const strict = args.values['strict'] ?? false;
  const noBaseline = args.values['no-baseline'] ?? false;
  const cwd = _cwd ?? process.cwd();

  const depFenceDir = join(cwd, '.dep-fence');
  const configPath = join(cwd, '.depfencerc.json');
  const lockfilePath = join(cwd, 'package-lock.json');
  const packageJsonPath = join(cwd, 'package.json');
  const approvalsPath = join(depFenceDir, 'approvals.json');
  const cachePath = join(depFenceDir, '.cache');
  const gitignorePath = join(depFenceDir, '.gitignore');
  const baselinePath = join(depFenceDir, 'baseline.json');

  // ── Guard: D6 — fail if .dep-fence/ already exists ──────────────────────────
  try {
    await stat(depFenceDir);
    process.stderr.write(
      'dep-fence is already initialized. Delete `.dep-fence/` to reinitialize.\n'
    );
    process.exitCode = 2;
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // ENOENT — directory absent, good to proceed
  }

  // ── Guard: no lockfile ───────────────────────────────────────────────────────
  let lockfileContent;
  try {
    lockfileContent = await readFile(lockfilePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(
        'No lockfile found. Run `npm install` first to generate package-lock.json.\n'
      );
      process.exitCode = 2;
      return;
    }
    throw err;
  }

  // ── Guard: unknown lockfile version (Q1) — only when baseline will be built ─
  let lockfileVersion;
  if (!noBaseline) {
    let parsed;
    try {
      parsed = JSON.parse(lockfileContent);
    } catch (err) {
      process.stderr.write(`Failed to parse lockfile as JSON: ${err.message}\n`);
      process.exitCode = 2;
      return;
    }
    lockfileVersion = parsed.lockfileVersion;
    if (lockfileVersion == null || !SUPPORTED_NPM_VERSIONS.has(lockfileVersion)) {
      process.stderr.write(
        `Unsupported npm lockfile version ${lockfileVersion}. dep-fence supports v1, v2, v3.\n`
      );
      process.exitCode = 2;
      return;
    }
  }

  // ── All guards passed; begin writing ────────────────────────────────────────

  // Write .depfencerc.json
  const policy = strict ? STRICT_POLICY : DEFAULT_POLICY;
  await writeFile(configPath, JSON.stringify(policy, null, 2) + '\n', 'utf8');

  // Create .dep-fence/ scaffold
  // mkdir with recursive:true creates both .dep-fence/ and .dep-fence/.cache/
  await mkdir(cachePath, { recursive: true });
  await writeFile(approvalsPath, '[]\n', 'utf8');
  await writeFile(gitignorePath, '.cache/\n', 'utf8'); // D8: gitignore the cache dir

  // ── --no-baseline: scaffold only ────────────────────────────────────────────
  if (noBaseline) {
    process.stdout.write(
      'Skipped baseline creation. Run `dep-fence audit` to review your dependency posture before running `dep-fence check`.\n'
    );
    return;
  }

  // ── Baseline creation ────────────────────────────────────────────────────────

  // parseLockfile re-reads the file; version already validated above so no exit
  const deps = await parseLockfile(lockfilePath, packageJsonPath);
  const lockfileHash = createHash('sha256').update(lockfileContent).digest('hex');

  const baseline = createBaseline(deps, lockfileHash);

  const registry = _registryClient ?? createRegistryClient({ cacheDir: cachePath });

  for (const dep of deps) {
    const profile = baseline.packages[dep.name];
    if (!profile) continue;

    const { data, warnings } = await registry.getAttestations(dep.name, dep.version);

    if (warnings.some((w) => w.includes('registry unreachable'))) {
      process.stderr.write(
        `Warning: registry unreachable, skipped provenance for ${dep.name}@${dep.version}\n`
      );
      profile.provenanceStatus = null;
    } else if (data !== null) {
      profile.provenanceStatus = 'verified';
    } else {
      // data === null, no warning → 404, package has no SLSA attestations
      profile.provenanceStatus = 'unverified';
    }
  }

  await writeAndStage(baseline, baselinePath);

  process.stdout.write(
    `Baselined ${deps.length} packages. Detected npm lockfile v${lockfileVersion}. ` +
    `Next: run 'dep-fence install-hook' to enable the pre-commit hook.\n`
  );
}
