#!/usr/bin/env node
/**
 * Published tarball contract guard.
 *
 * `dist/` is intentionally gitignored, so a fresh checkout can otherwise pack a
 * manifest whose exports all point at files that do not exist. This check runs
 * `npm pack --ignore-scripts` after the repository build: ignoring lifecycle
 * scripts is deliberate, because it proves the release workflow itself created
 * the artifacts rather than letting `prepack` hide a missing build.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = [
  { directory: 'expo-ui', requirePrepack: true },
  { directory: 'expo-media', requirePrepack: true },
  { directory: 'toss-payments', requirePrepack: true },
  { directory: 'toss-payments-nestjs', requirePrepack: true },
];

function collectExportTargets(value, targets) {
  if (typeof value === 'string') {
    targets.add(value);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const next of Object.values(value)) collectExportTargets(next, targets);
}

function declaredTargets(manifest) {
  const targets = new Set();
  for (const field of ['main', 'module', 'types']) {
    const value = manifest[field];
    if (typeof value === 'string') targets.add(value);
  }
  collectExportTargets(manifest.exports, targets);
  return [...targets];
}

function packedFiles(directory) {
  const output = execFileSync(
    'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    // pnpm forwards a few npm_config_* implementation details to child
    // processes. npm warns about those unrelated settings unless its log level
    // is constrained, which would otherwise make every CI pack check noisy.
    { cwd: directory, encoding: 'utf8', env: { ...process.env, npm_config_loglevel: 'error' } },
  );
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]?.files)) {
    throw new Error(`${directory}: npm pack did not return one file manifest.`);
  }
  return new Set(result[0].files.map((file) => file.path));
}

for (const packageConfig of packages) {
  const directory = resolve(root, packageConfig.directory);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  const files = packedFiles(directory);

  if (!Array.isArray(manifest.files) || !manifest.files.includes('dist')) {
    throw new Error(`${manifest.name}: package.json must explicitly publish dist/.`);
  }
  if (packageConfig.requirePrepack && typeof manifest.scripts?.prepack !== 'string') {
    throw new Error(`${manifest.name}: a prepack build hook is required.`);
  }

  const targets = declaredTargets(manifest);
  const missingOnDisk = targets.filter((target) => !existsSync(resolve(directory, target)));
  if (missingOnDisk.length > 0) {
    throw new Error(`${manifest.name}: build artifacts missing: ${missingOnDisk.join(', ')}`);
  }

  const missingFromTarball = targets.filter((target) => !files.has(target.replace(/^\.\//, '')));
  if (missingFromTarball.length > 0) {
    throw new Error(`${manifest.name}: packed tarball is missing: ${missingFromTarball.join(', ')}`);
  }

  const distCount = [...files].filter((file) => file.startsWith('dist/')).length;
  if (distCount === 0) throw new Error(`${manifest.name}: packed tarball has no dist/ files.`);
  console.log(`${manifest.name}: ${targets.length} declared targets, ${distCount} dist files packed.`);
}
