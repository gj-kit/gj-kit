#!/usr/bin/env node
/**
 * Package-owned provenance entry point.
 *
 * The implementation is shared at the monorepo root, but this wrapper keeps
 * the build contract discoverable from this package and always supplies the
 * package root as cwd.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootScript = resolve(packageRoot, '..', 'scripts', 'stamp-package-provenance.mjs');

execFileSync(process.execPath, [rootScript, ...process.argv.slice(2)], {
  cwd: packageRoot,
  stdio: 'inherit',
});
