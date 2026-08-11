import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const registry = 'https://npm.pkg.github.com';
const token = process.env.GITHUB_PACKAGES_TOKEN;

if (token === undefined || token.length === 0) {
  throw new Error('GITHUB_PACKAGES_TOKEN must be set to publish GitHub Packages.');
}

const packageDirectories = [
  'expo-ui',
  'expo-media',
  'toss-payments',
  'toss-payments-nestjs',
];

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'gj-kit-npmrc-'));
const userConfig = join(temporaryDirectory, '.npmrc');
writeFileSync(
  userConfig,
  `@gj-kit:registry=${registry}\n//npm.pkg.github.com/:_authToken=${token}\n`,
  { mode: 0o600 },
);

const environment = {
  ...process.env,
  NPM_CONFIG_USERCONFIG: userConfig,
};

function execute(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: 'utf8',
    env: environment,
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

try {
  for (const directory of packageDirectories) {
    const manifest = JSON.parse(
      readFileSync(join(root, directory, 'package.json'), 'utf8'),
    );
    const { name, private: isPrivate = false, version } = manifest;
    if (isPrivate) continue;

    const existing = execute(
      'npm',
      ['view', `${name}@${version}`, 'version', `--registry=${registry}`],
      { stdio: 'pipe' },
    );
    if (existing.status === 0) {
      process.stdout.write(`${name}@${version} already exists in GitHub Packages.\n`);
      continue;
    }
    const output = `${existing.stdout}\n${existing.stderr}`;
    if (!output.includes('E404')) {
      throw new Error(
        `Could not determine whether ${name}@${version} exists in GitHub Packages:\n${output}`,
      );
    }

    const publish = execute(
      'pnpm',
      [
        '--filter', name,
        'publish',
        '--access', 'public',
        '--no-git-checks',
        `--registry=${registry}`,
      ],
      { stdio: 'inherit' },
    );
    if (publish.status !== 0) {
      throw new Error(`Failed to publish ${name}@${version} to GitHub Packages.`);
    }
  }
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
