#!/usr/bin/env node
/**
 * Write the immutable source identity shipped in a package artifact.
 *
 * Package-local wrappers invoke this helper with their package directory as
 * cwd. The generated JSON deliberately has no timestamp so its content is
 * reproducible for a given package version and source commit; the tarball
 * digest binds that provenance to the exact artifact handed to a consumer.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const packageRoot = resolve(process.cwd());

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@gj-kit/') || typeof manifest.version !== 'string') {
  throw new Error(`${packageRoot}: package identity is invalid; refusing to stamp provenance.`);
}

const repositoryRoot = git(['rev-parse', '--show-toplevel'], packageRoot);
const sourceCommit = git(['rev-parse', '--verify', 'HEAD'], repositoryRoot);
if (!/^[0-9a-f]{40,64}$/u.test(sourceCommit)) {
  throw new Error(`Git returned an invalid immutable source commit: ${sourceCommit}`);
}

const dist = join(packageRoot, 'dist');
mkdirSync(dist, { recursive: true });
const stamp = {
  schemaVersion: 1,
  package: manifest.name,
  version: manifest.version,
  sourceCommit,
};

writeFileSync(join(dist, 'gj-kit-provenance.json'), `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`Stamped ${manifest.name}@${manifest.version} from ${sourceCommit}.`);
