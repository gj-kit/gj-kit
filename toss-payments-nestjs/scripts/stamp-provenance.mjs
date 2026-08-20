#!/usr/bin/env node
/** Package-owned provenance entry point; delegates implementation to the monorepo helper. */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootScript = resolve(packageRoot, '..', 'scripts', 'stamp-package-provenance.mjs');

execFileSync(process.execPath, [rootScript, ...process.argv.slice(2)], {
  cwd: packageRoot,
  stdio: 'inherit',
});
