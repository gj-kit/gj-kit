#!/usr/bin/env node
/**
 * Release-only Metro smoke test for the packed @gj-kit/expo-media artifact.
 *
 * Unit guards prove our interpretation of package exports. This deliberately
 * hands the actual `npm pack --ignore-scripts` tarball to a fresh Expo SDK 56
 * app, so Metro itself resolves web/iOS/Android conditions. It is intentionally
 * separate from ordinary unit tests because the fixture installs Expo and takes
 * minutes rather than milliseconds.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mediaDir = join(root, 'expo-media');
const fixtureDir = join(mediaDir, 'tests', 'fixtures', 'expo-consumer');
const placeholder = 'file:__GJ_KIT_EXPO_MEDIA_TARBALL__';
const work = mkdtempSync(join(tmpdir(), 'gj-kit-expo-media-consumer-'));
const packDir = join(work, 'packed');
const consumerDir = join(work, 'consumer');
const keep = process.env.KEEP_EXPO_MEDIA_CONSUMER_SMOKE === '1';

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CI: '1',
        EXPO_NO_TELEMETRY: '1',
        // The fixture owns no lockfile: the packed artifact path is generated
        // per run. Do not make a user-level pnpm config affect its resolution.
        npm_config_update_notifier: 'false',
      },
    });
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    throw new Error(`${command} ${args.join(' ')} failed in ${cwd}\n${stdout}${stderr}`);
  }
}

function allTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...allTextFiles(path));
    else if (/\.(?:js|mjs|cjs|map|html)$/.test(entry.name)) files.push(path);
  }
  return files;
}

function bundleContains(directory, needle) {
  return allTextFiles(directory).some((file) => readFileSync(file, 'utf8').includes(needle));
}

try {
  if (!existsSync(join(mediaDir, 'dist', 'index.js'))) {
    throw new Error('expo-media/dist is missing — build before running the packed consumer smoke test.');
  }
  if (!existsSync(fixtureDir)) throw new Error(`fixture is missing: ${fixtureDir}`);

  mkdirSync(packDir);
  run('npm', [
    'pack',
    mediaDir,
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    packDir,
  ], work);
  const tarballs = readdirSync(packDir).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`expected one packed tarball, found ${tarballs.join(', ') || 'none'}`);
  const tarball = join(packDir, tarballs[0]);

  cpSync(fixtureDir, consumerDir, { recursive: true });
  const manifestPath = join(consumerDir, 'package.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  if (!manifestText.includes(placeholder)) throw new Error('fixture package.json has no tarball placeholder.');
  writeFileSync(manifestPath, manifestText.replace(placeholder, `file:${tarball}`));

  console.log(`Installing packed ${basename(tarball)} into fresh Expo SDK 56 consumer…`);
  run('corepack', ['pnpm', 'install', '--no-frozen-lockfile', '--reporter', 'append-only'], consumerDir);

  for (const platform of ['web', 'ios', 'android']) {
    const outputDir = `dist-${platform}`;
    console.log(`Expo export (${platform})…`);
    run('corepack', ['pnpm', 'exec', 'expo', 'export', '--platform', platform, '--output-dir', outputDir], consumerDir);
    if (!existsSync(join(consumerDir, outputDir))) {
      throw new Error(`Expo export produced no ${outputDir} directory.`);
    }
  }

  // The browser must select `./save`'s web fork. Native SDK 56 exports are
  // Hermes bytecode (`.hbc`), so a text search would be a false negative there;
  // their successful Metro resolution above is the native-branch proof.
  if (bundleContains(join(consumerDir, 'dist-web'), 'expo-media-library')) {
    throw new Error('web Metro bundle unexpectedly contains expo-media-library.');
  }

  console.log('Packed Expo consumer smoke passed (web/iOS/Android).');
} finally {
  if (keep) console.log(`Keeping Expo consumer smoke workspace: ${work}`);
  else rmSync(work, { recursive: true, force: true });
}
