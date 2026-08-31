import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// `--soft` reports "not deployable yet" as a clean skip instead of a failure.
// Push-triggered runs use it: a pending changeset is the normal state of main
// between releases, and should not paint the branch red. Manual redeploys omit
// it, because someone asking for a redeploy needs to be told why it cannot run.
const soft = process.argv.includes('--soft');
const root = resolve(import.meta.dirname, '..');

function setOutput(deployable) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deployable=${deployable}\n`);
  }
}

function blocked(reason) {
  if (!soft) throw new Error(reason);
  setOutput(false);
  console.log(`Skipping documentation deploy: ${reason}`);
  process.exit(0);
}

const snapshot = JSON.parse(
  readFileSync(resolve(root, 'website/api-snapshots/published.json'), 'utf8'),
);
const pendingChangesets = readdirSync(resolve(root, '.changeset'))
  .filter((entry) => entry.endsWith('.md') && entry !== 'README.md');

if (pendingChangesets.length > 0) {
  blocked(`Changesets are pending: ${pendingChangesets.join(', ')}`);
}

for (const pkg of snapshot.packages) {
  let latest;
  try {
    latest = execFileSync('npm', ['view', pkg.name, 'version', '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim().replace(/^"|"$/g, '');
  } catch (error) {
    // A package the registry has never seen is a policy blocker like any other
    // version mismatch. Anything else — network, auth, registry outage — is a
    // real failure and must stay loud even in soft mode.
    const stderr = String(error.stderr ?? '');
    if (stderr.includes('E404') || stderr.includes('404 Not Found')) {
      blocked(`${pkg.name} is not published to npm yet`);
    }
    throw error;
  }

  if (latest !== pkg.version) {
    blocked(`${pkg.name}: snapshot ${pkg.version} does not match npm latest ${latest}`);
  }
}

setOutput(true);
console.log(`Published docs snapshot verified for ${snapshot.packages.length} packages.`);
