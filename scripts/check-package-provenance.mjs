#!/usr/bin/env node
/**
 * Verify the provenance stamp of the package in the current working directory
 * or of one of its packed npm tarballs. The file is intentionally package
 * agnostic so every package still owns the wrapper that invokes it at build and
 * prepack time.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageRoot = resolve(process.cwd());
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
    if (value === undefined || value.startsWith('--')) throw new Error('--tarball requires a path.');
    tarball = resolve(value);
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

function git(command, cwd) {
  return execFileSync('git', command, { cwd, encoding: 'utf8' }).trim();
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
  if (!entries.includes(entry)) throw new Error(`${tarballPath}: missing required packed file ${entry}.`);
  return execFileSync('tar', ['-xOf', tarballPath, entry], { encoding: 'utf8' });
}

const sourceManifest = readJson(readFileSync(join(packageRoot, 'package.json'), 'utf8'), 'source package.json');
if (typeof sourceManifest.name !== 'string' || !sourceManifest.name.startsWith('@gj-kit/') || typeof sourceManifest.version !== 'string') {
  throw new Error(`${packageRoot}: package identity is invalid; refusing to verify provenance.`);
}

const repositoryRoot = git(['rev-parse', '--show-toplevel'], packageRoot);
const sourceCommit = git(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
if (!/^[0-9a-f]{40,64}$/u.test(sourceCommit)) {
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

if (tarball !== null && !existsSync(tarball)) throw new Error(`Tarball does not exist: ${tarball}`);

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
  throw new Error(`Invalid provenance stamp. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(stamp)}.`);
}

console.log(
  `${expected.package}@${expected.version}: immutable source commit ${expected.sourceCommit} verified${tarball === null ? '' : ' in tarball'}.`,
);
