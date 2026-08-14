#!/usr/bin/env node
/**
 * Write the source-commit identity shipped with every expo-ui tarball.
 *
 * There is deliberately no timestamp: rebuilding the same commit produces the
 * same provenance payload, while the tarball digest binds that payload to an
 * immutable package artifact. Development builds may run from a dirty tree;
 * prepack and the repository pack check reject those artifacts before release.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const repositoryRoot = git(['rev-parse', '--show-toplevel'], packageRoot);
const sourceCommit = git(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
if (!/^[0-9a-f]{40,64}$/u.test(sourceCommit)) {
  throw new Error(`Git returned an invalid immutable source commit: ${sourceCommit}`);
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (manifest.name !== '@gj-kit/expo-ui' || typeof manifest.version !== 'string') {
  throw new Error('expo-ui package identity is invalid; refusing to stamp provenance.');
}

const dist = join(packageRoot, 'dist');
mkdirSync(dist, { recursive: true });
const stampPath = join(dist, 'gj-kit-provenance.json');
const stamp = {
  schemaVersion: 1,
  package: manifest.name,
  version: manifest.version,
  sourceCommit,
};

writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`Stamped ${manifest.name}@${manifest.version} from ${sourceCommit}.`);
