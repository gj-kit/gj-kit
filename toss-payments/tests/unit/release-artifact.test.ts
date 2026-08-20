import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  files?: unknown;
  scripts?: { build?: unknown; prepack?: unknown };
};

describe('release artifact contract', () => {
  it('ships only dist and stamps/verifies immutable package provenance before pack', () => {
    expect(manifest.files).toEqual(['dist']);
    expect(manifest.scripts?.build).toContain('scripts/stamp-provenance.mjs');
    expect(manifest.scripts?.prepack).toContain('scripts/check-provenance.mjs --require-clean');
    expect(existsSync(join(packageRoot, 'scripts', 'stamp-provenance.mjs'))).toBe(true);
    expect(existsSync(join(packageRoot, 'scripts', 'check-provenance.mjs'))).toBe(true);
  });
});
