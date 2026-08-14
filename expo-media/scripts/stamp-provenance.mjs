#!/usr/bin/env node
/**
 * Write the source-commit identity that is shipped with every expo-media
 * tarball. It intentionally has no timestamp: a rebuild of the same commit
 * produces the same provenance payload, and the tarball digest can bind that
 * payload to an immutable package artifact.
 *
 * A dirty checkout can still run `build` during development. `prepack` and the
 * repository pack check call check-provenance with --require-clean so a
 * publishable artifact cannot claim HEAD while containing uncommitted source.
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
if (!/^[0-9a-f]{40,64}$/.test(sourceCommit)) {
  throw new Error(`Git returned an invalid immutable source commit: ${sourceCommit}`);
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (manifest.name !== '@gj-kit/expo-media' || typeof manifest.version !== 'string') {
  throw new Error('expo-media package identity is invalid; refusing to stamp provenance.');
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
