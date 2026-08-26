#!/usr/bin/env node
/**
 * Published tarball contract guard.
 *
 * `dist/` is intentionally gitignored, so a fresh checkout can otherwise pack a
 * manifest whose exports all point at files that do not exist. Check export
 * targets on disk *before* packing, then inspect `npm pack --ignore-scripts`.
 * npm versions may still run some package lifecycle hooks for `pack`; the
 * pre-pack assertion keeps this release check independent of that behavior.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packages = [
  { directory: 'expo-ui', requirePrepack: true, requireProvenance: true },
  { directory: 'expo-media', requirePrepack: true, requireProvenance: true },
  { directory: 'expo-auth', requirePrepack: true, requireProvenance: true },
  { directory: 'format', requirePrepack: true, requireProvenance: true },
  { directory: 'nest-operations-jobs', requirePrepack: true, requireProvenance: true },
  { directory: 'nest-notifications', requirePrepack: true, requireProvenance: true },
  { directory: 'toss-payments', requirePrepack: true, requireProvenance: true },
  { directory: 'toss-payments-nestjs', requirePrepack: true, requireProvenance: true },
  { directory: 'toss-payments-postgresql', requirePrepack: true, requireProvenance: true },
  {
    directory: 'expo-workouts',
    requirePrepack: true,
    requireProvenance: true,
    // An Expo native module publishes files that no export map mentions:
    // autolinking reads `expo-module.config.json`, prebuild reads
    // `app.plugin.js`, and Gradle/CocoaPods read the platform trees. Miss one
    // and the tarball still installs — it just never links, which a consumer
    // discovers during their own native build.
    requiredFiles: ['expo-module.config.json', 'app.plugin.js', 'android/build.gradle'],
    requiredPrefixes: ['dist/', 'ios/', 'android/src/main/', 'plugin/build/'],
    forbiddenPrefixes: ['example/', 'android/build/', 'android/.gradle/', 'tests/', 'ios/build/'],
    // Machine-specific absolute paths live here (`org.gradle.java.home` must be
    // pinned to a local JDK 17 on this machine). Never publish them.
    forbiddenFiles: ['android/gradle.properties', 'android/local.properties'],
  },
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
  // npm 11 can still print a package lifecycle banner before its `--json`
  // payload even with `--ignore-scripts`. Parse the final JSON array rather
  // than treating that harmless banner as a release-check failure.
  const json = output.match(/(\[\s*\{[\s\S]*\])\s*$/)?.[1];
  if (json === undefined) {
    throw new Error(`${directory}: npm pack did not emit a JSON file manifest.`);
  }
  const result = JSON.parse(json);
  if (!Array.isArray(result) || result.length !== 1 || !Array.isArray(result[0]?.files)) {
    throw new Error(`${directory}: npm pack did not return one file manifest.`);
  }
  return new Set(result[0].files.map((file) => file.path));
}

function parsePackResult(output, directory) {
  const json = output.match(/(\[\s*\{[\s\S]*\])\s*$/)?.[1];
  if (json === undefined) {
    throw new Error(`${directory}: npm pack did not emit a JSON file manifest.`);
  }
  const result = JSON.parse(json);
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.filename !== 'string') {
    throw new Error(`${directory}: npm pack did not return one tarball.`);
  }
  return result[0];
}

function verifyPackageProvenance(directory) {
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));
  const outputDirectory = mkdtempSync(
    resolve(tmpdir(), `${String(manifest.name).replace(/[^a-z0-9]+/giu, '-')}-pack-`),
  );
  try {
    const output = execFileSync(
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', outputDirectory],
      { cwd: directory, encoding: 'utf8', env: { ...process.env, npm_config_loglevel: 'error' } },
    );
    parsePackResult(output, directory);
    // `npm pack --json` reports scoped filenames differently from the
    // filesystem-safe tarball written by --pack-destination. Discover the one
    // output rather than guessing npm's scope escaping convention.
    const tarballs = readdirSync(outputDirectory).filter((file) => file.endsWith('.tgz'));
    if (tarballs.length !== 1) {
      throw new Error(`${directory}: npm pack should create one tarball, found ${tarballs.join(', ') || 'none'}.`);
    }
    const tarball = resolve(outputDirectory, tarballs[0]);
    execFileSync(
      process.execPath,
      [resolve(directory, 'scripts', 'check-provenance.mjs'), '--tarball', tarball, '--require-clean'],
      { cwd: directory, encoding: 'utf8', stdio: 'inherit' },
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
}

for (const packageConfig of packages) {
  const directory = resolve(root, packageConfig.directory);
  const manifest = JSON.parse(readFileSync(resolve(directory, 'package.json'), 'utf8'));

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

  const files = packedFiles(directory);

  const missingFromTarball = targets.filter((target) => !files.has(target.replace(/^\.\//, '')));
  if (missingFromTarball.length > 0) {
    throw new Error(`${manifest.name}: packed tarball is missing: ${missingFromTarball.join(', ')}`);
  }

  // npm renders README.md as the package landing page. README.ko.md is shipped
  // alongside it so the language switch never points to a GitHub-only file.
  const localizedReadmes = ['README.md', 'README.ko.md'];
  const missingReadmes = localizedReadmes.filter((file) => !files.has(file));
  if (missingReadmes.length > 0) {
    throw new Error(`${manifest.name}: packed tarball is missing localized README files: ${missingReadmes.join(', ')}`);
  }

  // The four assertions below are opt-in: a package that declares none of these
  // options behaves exactly as it did before they existed.
  const missingRequiredFiles = (packageConfig.requiredFiles ?? []).filter((file) => !files.has(file));
  if (missingRequiredFiles.length > 0) {
    throw new Error(`${manifest.name}: packed tarball is missing required files: ${missingRequiredFiles.join(', ')}`);
  }

  const missingRequiredPrefixes = (packageConfig.requiredPrefixes ?? []).filter(
    (prefix) => ![...files].some((file) => file.startsWith(prefix)),
  );
  if (missingRequiredPrefixes.length > 0) {
    throw new Error(`${manifest.name}: packed tarball has no files under: ${missingRequiredPrefixes.join(', ')}`);
  }

  const forbiddenHits = [
    ...(packageConfig.forbiddenPrefixes ?? []).flatMap((prefix) =>
      [...files].filter((file) => file.startsWith(prefix)),
    ),
    ...(packageConfig.forbiddenFiles ?? []).filter((file) => files.has(file)),
  ];
  if (forbiddenHits.length > 0) {
    throw new Error(`${manifest.name}: packed tarball must not contain: ${[...new Set(forbiddenHits)].sort().join(', ')}`);
  }

  const distCount = [...files].filter((file) => file.startsWith('dist/')).length;
  if (distCount === 0) throw new Error(`${manifest.name}: packed tarball has no dist/ files.`);
  console.log(`${manifest.name}: ${targets.length} declared targets, ${distCount} dist files packed.`);

  if (packageConfig.requireProvenance) verifyPackageProvenance(directory);
}
