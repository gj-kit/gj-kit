import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const packages = [
  'expo-ui',
  'expo-media',
  'expo-auth',
  'format',
  'nest-operations-jobs',
  'nest-notifications',
  'expo-workouts',
  'toss-payments',
  'toss-payments-nestjs',
  'toss-payments-postgresql',
];

for (const directory of packages) {
  const result = spawnSync(process.execPath, ['scripts/check-readme.mjs'], {
    cwd: path.join(root, directory),
    encoding: 'utf8',
    env: { ...process.env, README_PATH: 'README.ko.md' },
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  process.stdout.write(`${directory}: Korean README verified.\n`);
}
