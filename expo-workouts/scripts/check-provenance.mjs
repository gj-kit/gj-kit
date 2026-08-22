#!/usr/bin/env node
/**
 * Verify the immutable source stamp from a build directory or a packed npm
 * tarball. This is deliberately package-owned: an app's vendor manifest may
 * add its own digest, but it cannot substitute for provenance embedded in the
 * artifact it installs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let tarball = null;
let requireClean = false;

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--require-clean') {
    requireClean = true;
    continue;
  }
  if (arg === '--tarball') {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error('--tarball requires a path.');
    }
    tarball = resolve(value);
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function readJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readTarEntry(tarballPath, entry) {
  const entries = execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (!entries.includes(entry)) {
    throw new Error(`${tarballPath}: missing required packed file ${entry}.`);
  }
  return execFileSync('tar', ['-xOf', tarballPath, entry], { encoding: 'utf8' });
}

const sourceManifest = readJson(readFileSync(join(packageRoot, 'package.json'), 'utf8'), 'source package.json');
const repositoryRoot = git(['rev-parse', '--show-toplevel'], packageRoot);
const sourceCommit = git(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
if (!/^[0-9a-f]{40,64}$/.test(sourceCommit)) {
  throw new Error(`Git returned an invalid immutable source commit: ${sourceCommit}`);
}

if (requireClean) {
  const dirty = git(['status', '--porcelain=v1', '--untracked-files=all'], repositoryRoot);
  if (dirty.length > 0) {
    throw new Error(
      'Refusing release provenance from a dirty checkout. Commit or remove the following changes before packing:\n' + dirty,
    );
  }
}

if (tarball !== null && !existsSync(tarball)) {
  throw new Error(`Tarball does not exist: ${tarball}`);
}

const packedManifest = tarball === null
  ? sourceManifest
  : readJson(readTarEntry(tarball, 'package/package.json'), `${tarball}: package/package.json`);
const stamp = tarball === null
  ? readJson(readFileSync(join(packageRoot, 'dist', 'gj-kit-provenance.json'), 'utf8'), 'dist/gj-kit-provenance.json')
  : readJson(readTarEntry(tarball, 'package/dist/gj-kit-provenance.json'), `${tarball}: package/dist/gj-kit-provenance.json`);

if (packedManifest.name !== sourceManifest.name || packedManifest.version !== sourceManifest.version) {
  throw new Error('Packed package identity differs from the checked source manifest.');
}

const expected = {
  schemaVersion: 1,
  package: sourceManifest.name,
  version: sourceManifest.version,
  sourceCommit,
};
if (JSON.stringify(stamp) !== JSON.stringify(expected)) {
  throw new Error(
    `Invalid provenance stamp. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(stamp)}.`,
  );
}

console.log(
  `${expected.package}@${expected.version}: immutable source commit ${expected.sourceCommit} verified${tarball === null ? '' : ' in tarball'}.`,
);
