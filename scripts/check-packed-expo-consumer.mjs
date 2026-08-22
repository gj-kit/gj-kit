#!/usr/bin/env node
/**
 * Shared release-only smoke harness for a packed Expo library.
 *
 * Unit tests can prove our interpretation of an export map, but only Metro in
 * a new Expo project proves that an npm tarball resolves the same way for a
 * consumer. Callers provide one or more fixtures so packages can assert both
 * their web and native optional-peer boundaries without copying the pack,
 * install, and export plumbing.
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

/**
 * @typedef {'web' | 'ios' | 'android'} ExpoPlatform
 * @typedef {{ readonly name: string; readonly args: readonly string[] }} NodeCheck
 * @typedef {{
 *   readonly name: string;
 *   readonly command: string;
 *   readonly args: readonly string[];
 *   readonly expect?: string;
 * }} CommandCheck
 * @typedef {{
 *   readonly name: string;
 *   readonly fixtureDirectory: string;
 *   readonly placeholder: string;
 *   readonly platforms: readonly ExpoPlatform[];
 *   readonly installArgs?: readonly string[];
 *   readonly forbiddenInstalledPackages?: readonly string[];
 *   readonly forbiddenBundleText?: Partial<Record<ExpoPlatform, readonly string[]>>;
 *   readonly requiredBundleText?: Partial<Record<ExpoPlatform, readonly string[]>>;
 *   readonly nodeChecks?: readonly NodeCheck[];
 *   readonly commandChecks?: readonly CommandCheck[];
 * }} ExpoConsumerFixture
 * @typedef {{
 *   readonly packageDirectory: string;
 *   readonly packageName: string;
 *   readonly requiredBuildFile: string;
 *   readonly fixtures: readonly ExpoConsumerFixture[];
 *   readonly keepEnvironmentVariable: string;
 * }} PackedExpoConsumerOptions
 */

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
        // A fixture owns no committed lockfile: its tarball path is unique for
        // every run. Do not let a user-level package-manager setting alter it.
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
    else if (/\.(?:js|mjs|cjs|map|html)$/u.test(entry.name)) files.push(path);
  }
  return files;
}

function bundleContains(directory, needle) {
  return allTextFiles(directory).some((file) => readFileSync(file, 'utf8').includes(needle));
}

function canResolvePackage(packageName, cwd) {
  try {
    execFileSync(
      process.execPath,
      ['--eval', `require.resolve(${JSON.stringify(packageName)});`],
      { cwd, encoding: 'utf8', stdio: 'pipe' },
    );
    return true;
  } catch {
    return false;
  }
}

function validateFixture(fixture) {
  if (!existsSync(fixture.fixtureDirectory)) {
    throw new Error(`${fixture.name}: fixture is missing: ${fixture.fixtureDirectory}`);
  }
  if (fixture.platforms.length === 0) {
    throw new Error(`${fixture.name}: at least one Expo platform is required.`);
  }
  // `commandChecks` runs an arbitrary executable, so a typo must fail here
  // rather than minutes later after a pack and an install.
  for (const check of fixture.commandChecks ?? []) {
    if (typeof check?.name !== 'string' || check.name.length === 0) {
      throw new Error(`${fixture.name}: every command check needs a name.`);
    }
    if (typeof check.command !== 'string' || check.command.length === 0) {
      throw new Error(`${fixture.name}: ${String(check.name)} needs a command.`);
    }
    if (!Array.isArray(check.args) || check.args.some((arg) => typeof arg !== 'string')) {
      throw new Error(`${fixture.name}: ${check.name} needs a string argument array.`);
    }
    if (check.expect !== undefined && typeof check.expect !== 'string') {
      throw new Error(`${fixture.name}: ${check.name} expect must be a string when present.`);
    }
  }
}

function writeFixtureManifest({ fixture, consumerDirectory, tarball }) {
  const manifestPath = join(consumerDirectory, 'package.json');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const matches = manifestText.split(fixture.placeholder).length - 1;
  if (matches !== 1) {
    throw new Error(`${fixture.name}: package.json must contain its tarball placeholder exactly once.`);
  }
  writeFileSync(manifestPath, manifestText.replace(fixture.placeholder, `file:${tarball}`));
}

function assertBundleText({ fixture, consumerDirectory, platform, outputDirectory }) {
  const outputPath = join(consumerDirectory, outputDirectory);
  for (const needle of fixture.forbiddenBundleText?.[platform] ?? []) {
    if (bundleContains(outputPath, needle)) {
      throw new Error(`${fixture.name}: ${platform} bundle unexpectedly contains ${needle}.`);
    }
  }
  for (const needle of fixture.requiredBundleText?.[platform] ?? []) {
    if (!bundleContains(outputPath, needle)) {
      throw new Error(`${fixture.name}: ${platform} bundle is missing ${needle}.`);
    }
  }
}

function runFixture({ fixture, consumerDirectory, tarball }) {
  cpSync(fixture.fixtureDirectory, consumerDirectory, { recursive: true });
  writeFixtureManifest({ fixture, consumerDirectory, tarball });

  console.log(`Installing packed ${basename(tarball)} into ${fixture.name}…`);
  run(
    'corepack',
    ['pnpm', 'install', '--no-frozen-lockfile', '--reporter', 'append-only', ...(fixture.installArgs ?? [])],
    consumerDirectory,
  );

  for (const packageName of fixture.forbiddenInstalledPackages ?? []) {
    if (canResolvePackage(packageName, consumerDirectory)) {
      throw new Error(`${fixture.name}: optional peer ${packageName} was installed unexpectedly.`);
    }
  }

  for (const check of fixture.nodeChecks ?? []) {
    console.log(`${fixture.name}: Node ${check.name}…`);
    run(process.execPath, [...check.args], consumerDirectory);
  }

  // Some consumer-facing contracts are owned by tools that are not Node
  // scripts — `expo-modules-autolinking resolve` and `expo config --type
  // introspect` are the two that decide whether a native module links and
  // whether its config plugin ran. `run()` already accepts any executable.
  for (const check of fixture.commandChecks ?? []) {
    console.log(`${fixture.name}: ${check.name}…`);
    const output = run(check.command, [...check.args], consumerDirectory);
    if (check.expect !== undefined && !output.includes(check.expect)) {
      throw new Error(`${fixture.name}: ${check.name} output is missing ${check.expect}.`);
    }
  }

  for (const platform of fixture.platforms) {
    const outputDirectory = `dist-${platform}`;
    console.log(`${fixture.name}: Expo export (${platform})…`);
    run(
      'corepack',
      ['pnpm', 'exec', 'expo', 'export', '--platform', platform, '--output-dir', outputDirectory],
      consumerDirectory,
    );
    if (!existsSync(join(consumerDirectory, outputDirectory))) {
      throw new Error(`${fixture.name}: Expo export produced no ${outputDirectory} directory.`);
    }
    assertBundleText({ fixture, consumerDirectory, platform, outputDirectory });
  }
}

/**
 * Packs one library artifact, installs it into fresh fixture apps, and asks
 * Expo SDK 56's Metro resolver to export each requested platform.
 *
 * @param {PackedExpoConsumerOptions} options
 */
export function runPackedExpoConsumerSmoke(options) {
  const packageDirectory = resolve(options.packageDirectory);
  const requiredBuildFile = resolve(packageDirectory, options.requiredBuildFile);
  if (!existsSync(requiredBuildFile)) {
    throw new Error(`${options.packageName}: ${options.requiredBuildFile} is missing — build before smoke testing.`);
  }
  if (options.fixtures.length === 0) {
    throw new Error(`${options.packageName}: at least one consumer fixture is required.`);
  }
  options.fixtures.forEach(validateFixture);

  const work = mkdtempSync(join(tmpdir(), `${options.packageName.replace(/[^a-z0-9]+/giu, '-')}-consumer-`));
  const packDirectory = join(work, 'packed');
  const keep = process.env[options.keepEnvironmentVariable] === '1';

  try {
    mkdirSync(packDirectory);
    run(
      'npm',
      ['pack', packageDirectory, '--json', '--ignore-scripts', '--pack-destination', packDirectory],
      work,
    );
    const tarballs = readdirSync(packDirectory).filter((name) => name.endsWith('.tgz'));
    if (tarballs.length !== 1) {
      throw new Error(`${options.packageName}: expected one packed tarball, found ${tarballs.join(', ') || 'none'}.`);
    }
    const tarball = join(packDirectory, tarballs[0]);

    for (const fixture of options.fixtures) {
      runFixture({ fixture, consumerDirectory: join(work, `consumer-${fixture.name}`), tarball });
    }

    console.log(`Packed ${options.packageName} consumer smoke passed.`);
  } finally {
    if (keep) console.log(`Keeping ${options.packageName} consumer smoke workspace: ${work}`);
    else rmSync(work, { recursive: true, force: true });
  }
}
