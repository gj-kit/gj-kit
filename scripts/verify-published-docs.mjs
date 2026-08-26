import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const snapshot = JSON.parse(
  readFileSync(resolve(root, 'website/api-snapshots/published.json'), 'utf8'),
);
const pendingChangesets = readdirSync(resolve(root, '.changeset'))
  .filter((entry) => entry.endsWith('.md') && entry !== 'README.md');

if (pendingChangesets.length > 0) {
  throw new Error(
    `Published docs cannot deploy while Changesets are pending: ${pendingChangesets.join(', ')}`,
  );
}

for (const pkg of snapshot.packages) {
  const latest = execFileSync('npm', ['view', pkg.name, 'version', '--json'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().replace(/^"|"$/g, '');

  if (latest !== pkg.version) {
    throw new Error(
      `${pkg.name}: snapshot ${pkg.version} does not match npm latest ${latest}`,
    );
  }
}

console.log(`Published docs snapshot verified for ${snapshot.packages.length} packages.`);
