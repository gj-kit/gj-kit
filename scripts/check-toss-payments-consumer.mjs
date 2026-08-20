#!/usr/bin/env node
/**
 * Release-only packed consumer smoke for the Toss core + Nest integration.
 *
 * Unit tests run against workspace source; this gate packages both artifacts,
 * installs their .tgz files into fresh Nest 10 and Nest 11 applications, and
 * bootstraps a real Nest application context through the named-kit DI path.
 * It also proves ESM/CJS exports and package-owned provenance after install.
 *
 * Release runs require a clean checkout. `ALLOW_DIRTY_PACKED_TOSS_CONSUMER=1`
 * is only for local iteration; it never substitutes for the clean provenance
 * gate in `check:pack` / `verify:release`.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreDirectory = join(root, 'toss-payments');
const nestDirectory = join(root, 'toss-payments-nestjs');
const fixtureRoot = join(nestDirectory, 'tests', 'fixtures', 'packed-consumer');
const allowDirty = process.env.ALLOW_DIRTY_PACKED_TOSS_CONSUMER === '1';
const keep = process.env.KEEP_TOSS_PAYMENTS_CONSUMER_SMOKE === '1';

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        npm_config_update_notifier: 'false',
        npm_config_loglevel: 'error',
      },
    });
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${stdout}${stderr}`);
  }
}

function parsePackResult(output, packageName) {
  const json = output.match(/(\[\s*\{[\s\S]*\])\s*$/u)?.[1];
  if (json === undefined) throw new Error(`${packageName}: npm pack did not emit JSON.`);
  const result = JSON.parse(json);
  if (!Array.isArray(result) || result.length !== 1 || typeof result[0]?.filename !== 'string') {
    throw new Error(`${packageName}: npm pack did not produce exactly one tarball.`);
  }
}

function assertBuild(packageDirectory, packageName) {
  for (const path of ['dist/index.js', 'dist/gj-kit-provenance.json']) {
    if (!existsSync(join(packageDirectory, path))) {
      throw new Error(`${packageName}: ${path} is missing — run the package build before consumer smoke.`);
    }
  }
}

function verifyProvenance(packageDirectory, tarball) {
  const args = [join(packageDirectory, 'scripts', 'check-provenance.mjs')];
  if (tarball !== undefined) args.push('--tarball', tarball);
  if (!allowDirty) args.push('--require-clean');
  run(process.execPath, args, packageDirectory);
}

function pack(packageDirectory, packageName, destination) {
  mkdirSync(destination, { recursive: true });
  const output = run(
    'npm',
    ['pack', packageDirectory, '--json', '--ignore-scripts', '--pack-destination', destination],
    root,
  );
  parsePackResult(output, packageName);
  const tarballs = readdirSync(destination).filter((file) => file.endsWith('.tgz'));
  if (tarballs.length !== 1) {
    throw new Error(`${packageName}: expected one tarball, found ${tarballs.join(', ') || 'none'}.`);
  }
  return join(destination, tarballs[0]);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function replaceExactly(text, placeholder, replacement, fixtureName) {
  const matches = text.split(placeholder).length - 1;
  if (matches !== 1) {
    throw new Error(`${fixtureName}: expected exactly one ${placeholder} placeholder, found ${matches}.`);
  }
  return text.replace(placeholder, replacement);
}

function writeConsumerManifest(consumerDirectory, fixtureName, coreTarball, nestTarball) {
  const manifestPath = join(consumerDirectory, 'package.json');
  let manifest = readFileSync(manifestPath, 'utf8');
  manifest = replaceExactly(
    manifest,
    '__GJ_KIT_TOSS_PAYMENTS_TARBALL__',
    pathToFileURL(coreTarball).href,
    fixtureName,
  );
  manifest = replaceExactly(
    manifest,
    '__GJ_KIT_TOSS_PAYMENTS_NESTJS_TARBALL__',
    pathToFileURL(nestTarball).href,
    fixtureName,
  );
  writeFileSync(manifestPath, manifest);
}

function assertInstalledOutsideSource(consumerDirectory, specifier, sourceDirectory) {
  const resolved = run(
    process.execPath,
    [
      '--eval',
      `const fs = require('node:fs'); process.stdout.write(fs.realpathSync(require.resolve(${JSON.stringify(specifier)})));`,
    ],
    consumerDirectory,
  ).trim();
  const source = realpathSync(sourceDirectory);
  const fromSource = relative(source, resolved);
  if (fromSource === '' || (!fromSource.startsWith(`..${sep}`) && fromSource !== '..')) {
    throw new Error(`${specifier}: consumer resolved workspace source instead of the packed artifact: ${resolved}`);
  }
}

function runFixture({ name, directory, coreTarball, nestTarball, work }) {
  if (!existsSync(directory)) throw new Error(`${name}: fixture directory is missing: ${directory}`);
  const consumerDirectory = join(work, `consumer-${name}`);
  cpSync(directory, consumerDirectory, { recursive: true });
  cpSync(join(fixtureRoot, 'smoke.cjs'), join(consumerDirectory, 'smoke.cjs'));
  cpSync(join(fixtureRoot, 'smoke.mjs'), join(consumerDirectory, 'smoke.mjs'));
  writeConsumerManifest(consumerDirectory, name, coreTarball, nestTarball);

  console.log(`${name}: installing ${basename(coreTarball)} + ${basename(nestTarball)}…`);
  run(
    'corepack',
    [
      'pnpm',
      'install',
      '--no-frozen-lockfile',
      '--strict-peer-dependencies',
      '--ignore-scripts',
      '--reporter',
      'append-only',
    ],
    consumerDirectory,
  );
  assertInstalledOutsideSource(consumerDirectory, '@gj-kit/toss-payments/server', coreDirectory);
  assertInstalledOutsideSource(consumerDirectory, '@gj-kit/toss-payments-nestjs', nestDirectory);

  console.log(`${name}: CJS Nest application-context smoke…`);
  run(process.execPath, ['smoke.cjs'], consumerDirectory);
  console.log(`${name}: ESM/CJS public-export smoke…`);
  run(process.execPath, ['smoke.mjs'], consumerDirectory);
}

const fixtures = [
  { name: 'nest10', directory: join(fixtureRoot, 'nest10') },
  { name: 'nest11', directory: join(fixtureRoot, 'nest11') },
];

assertBuild(coreDirectory, '@gj-kit/toss-payments');
assertBuild(nestDirectory, '@gj-kit/toss-payments-nestjs');
if (allowDirty) {
  console.warn('ALLOW_DIRTY_PACKED_TOSS_CONSUMER=1: local-only smoke; release provenance requires a clean checkout.');
}
verifyProvenance(coreDirectory);
verifyProvenance(nestDirectory);

const work = mkdtempSync(join(tmpdir(), 'gj-kit-toss-payments-consumer-'));
try {
  const coreTarball = pack(coreDirectory, '@gj-kit/toss-payments', join(work, 'packed-core'));
  const nestTarball = pack(nestDirectory, '@gj-kit/toss-payments-nestjs', join(work, 'packed-nest'));
  verifyProvenance(coreDirectory, coreTarball);
  verifyProvenance(nestDirectory, nestTarball);

  console.log(`@gj-kit/toss-payments SHA-256: ${sha256(coreTarball)}`);
  console.log(`@gj-kit/toss-payments-nestjs SHA-256: ${sha256(nestTarball)}`);
  for (const fixture of fixtures) runFixture({ ...fixture, coreTarball, nestTarball, work });
  console.log('Packed Toss core + Nest consumer smoke passed.');
} finally {
  if (keep) console.log(`Keeping Toss packed-consumer workspace: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
