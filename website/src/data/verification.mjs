import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packages } from './catalog.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * The README and portal copy cites how many compile-time guards each package
 * has. Those numbers were typed by hand once and were wrong within a day: a
 * single new fixture silently turned every published claim into an overstatement.
 *
 * So they are counted here instead, from the fixtures themselves, every time the
 * documentation is generated. Copy refers to them by token (see resolveCopy) and
 * an unknown token fails generation, which means a number in the docs can only
 * ever be the number in the tests.
 */
async function collectFixtureFiles(directory) {
  const collected = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return collected;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collected.push(...(await collectFixtureFiles(target)));
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) collected.push(target);
  }
  return collected;
}

async function countGuards(slug) {
  const files = await collectFixtureFiles(path.join(repositoryRoot, slug, 'tests', 'types'));
  let directives = 0;
  let fixtureFiles = 0;
  for (const file of files) {
    const matches = (await readFile(file, 'utf8')).match(/@ts-expect-error/gu);
    if (!matches) continue;
    directives += matches.length;
    fixtureFiles += 1;
  }
  return { directives, fixtureFiles };
}

export async function compileGuardStats() {
  const bySlug = new Map();
  let directives = 0;
  let fixtureFiles = 0;
  for (const product of packages) {
    const counts = await countGuards(product.slug);
    bySlug.set(product.slug, counts);
    directives += counts.directives;
    fixtureFiles += counts.fixtureFiles;
  }
  return { bySlug, directives, fixtureFiles };
}

/**
 * Replaces `{{token}}` placeholders in catalog copy. An unknown token throws
 * rather than rendering literally, so a typo in the copy fails the build instead
 * of shipping `{{guards}}` to npm.
 */
export function resolveCopy(text, tokens, where) {
  return String(text).replace(/\{\{(\w+)\}\}/gu, (_, name) => {
    if (!(name in tokens)) {
      throw new Error(`Unknown copy token {{${name}}} in ${where}. Known tokens: ${Object.keys(tokens).join(', ')}`);
    }
    return String(tokens[name]);
  });
}

export function copyTokens(stats, slug) {
  return {
    guardTotal: stats.directives,
    guardFixtureFiles: stats.fixtureFiles,
    ...(slug ? { guards: stats.bySlug.get(slug)?.directives ?? 0 } : {}),
  };
}
