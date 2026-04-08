import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

describe('project skeleton', () => {
  it('src/index.js is a valid ES module', async () => {
    const mod = await import(join(rootDir, 'src', 'index.js'));
    assert.ok(mod, 'module imported successfully');
  });

  it('package.json has correct type field', () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    assert.equal(pkg.type, 'module');
  });

  it('package.json has correct engines field', () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '>=18.3');
  });

  it('package.json has correct bin field', () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    assert.deepEqual(pkg.bin, { 'dep-fence': 'src/cli/index.js' });
  });

  it('package.json has zero dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    assert.ok(
      !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
      'dependencies must be empty or absent'
    );
  });
});
