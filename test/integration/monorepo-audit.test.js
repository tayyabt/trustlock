/**
 * Integration test: `trustlock audit` no-lockfile error messaging for monorepos.
 *
 * Verifies BUG-003 fix:
 *   - When no lockfile exists at project root, stderr includes `--project-dir` hint.
 *   - When root `package.json` has `"workspaces"`, stderr names each workspace package
 *     with per-package `--project-dir` example invocations.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { run } from '../../src/cli/commands/audit.js';

let repoRoot;

/** Minimal mock registry client (no real network calls). */
function mockRegistry() {
  return {
    getAttestations:      async () => ({ data: null, warnings: [] }),
    fetchPackageMetadata: async () => ({ data: null, warnings: [] }),
    getVersionMetadata:   async () => ({ data: null, warnings: [] }),
  };
}

function captureOutput() {
  const captured = { stdout: [], stderr: [] };
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => { captured.stdout.push(String(chunk)); return true; };
  process.stderr.write = (chunk) => { captured.stderr.push(String(chunk)); return true; };
  return {
    captured,
    restore() {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

beforeEach(async () => {
  repoRoot = join(tmpdir(), `trustlock-monorepo-audit-${process.pid}-${Date.now()}`);
  await mkdir(repoRoot, { recursive: true });
  await mkdir(join(repoRoot, '.git'), { recursive: true });
  process.exitCode = 0;
});

afterEach(async () => {
  process.exitCode = 0;
  if (repoRoot) {
    await rm(repoRoot, { recursive: true, force: true });
    repoRoot = null;
  }
});

// ---------------------------------------------------------------------------
// BUG-003: No-lockfile error must mention --project-dir
// ---------------------------------------------------------------------------

test('BUG-003 audit: no-lockfile error at repo root includes --project-dir hint (no workspaces)', async () => {
  // Repo root: .trustlockrc.json present (audit requires it), no lockfile, no workspaces
  await writeFile(
    join(repoRoot, '.trustlockrc.json'),
    JSON.stringify({ cooldown_hours: 72, pinning: { required: false }, scripts: { allowlist: [] },
      sources: { allowed: ['registry'] }, provenance: { required_for: [] }, transitive: { max_new: 5 } })
  );
  await writeFile(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'my-app', version: '1.0.0' })
  );

  const cap = captureOutput();
  try {
    await run(
      { values: { json: false }, positionals: ['audit'] },
      { _registryClient: mockRegistry(), _cwd: repoRoot }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 2, 'Expected exit code 2 when lockfile absent');
  const stderr = cap.captured.stderr.join('');
  assert.ok(
    stderr.includes('--project-dir'),
    `Expected stderr to mention --project-dir; got: ${stderr}`
  );
});

test('BUG-003 audit: no-lockfile error names workspace packages when workspaces field present', async () => {
  // Repo root: .trustlockrc.json + workspaces in package.json, no root lockfile
  await writeFile(
    join(repoRoot, '.trustlockrc.json'),
    JSON.stringify({ cooldown_hours: 72, pinning: { required: false }, scripts: { allowlist: [] },
      sources: { allowed: ['registry'] }, provenance: { required_for: [] }, transitive: { max_new: 5 } })
  );
  await writeFile(
    join(repoRoot, 'package.json'),
    JSON.stringify({ name: 'my-monorepo', version: '1.0.0', workspaces: ['apps/*'] })
  );

  // Create sub-packages under apps/
  const frontendDir = join(repoRoot, 'apps', 'frontend');
  const backendDir  = join(repoRoot, 'apps', 'backend');
  await mkdir(frontendDir, { recursive: true });
  await mkdir(backendDir,  { recursive: true });
  await writeFile(join(frontendDir, 'package.json'), JSON.stringify({ name: 'frontend' }));
  await writeFile(join(backendDir,  'package.json'), JSON.stringify({ name: 'backend' }));

  const cap = captureOutput();
  try {
    await run(
      { values: { json: false }, positionals: ['audit'] },
      { _registryClient: mockRegistry(), _cwd: repoRoot }
    );
  } finally {
    cap.restore();
  }

  assert.equal(process.exitCode, 2, 'Expected exit code 2 when lockfile absent');
  const stderr = cap.captured.stderr.join('');
  assert.ok(
    stderr.includes('--project-dir'),
    `Expected stderr to mention --project-dir; got: ${stderr}`
  );
  assert.ok(
    stderr.includes('apps/frontend'),
    `Expected stderr to name apps/frontend; got: ${stderr}`
  );
  assert.ok(
    stderr.includes('apps/backend'),
    `Expected stderr to name apps/backend; got: ${stderr}`
  );
});
