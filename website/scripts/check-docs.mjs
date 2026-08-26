import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, '..');
const distDir = path.join(websiteDir, 'dist');
const snapshot = JSON.parse(await readFile(path.join(websiteDir, 'api-snapshots', 'published.json'), 'utf8'));

function fail(message) {
  throw new Error(`Documentation check failed: ${message}`);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function apiPagePath(pkg, entry, symbol, locale = 'en') {
  const prefix = locale === 'ko' ? 'ko/' : '';
  return path.join(distDir, prefix, 'api', pkg.slug, entry.id, symbol.slug, 'index.html');
}

function packagePagePath(pkg, locale = 'en') {
  const prefix = locale === 'ko' ? 'ko/' : '';
  return path.join(distDir, prefix, 'packages', pkg.slug, 'index.html');
}

if (!Array.isArray(snapshot.packages) || snapshot.packages.length !== 10) {
  fail('published snapshot must contain all ten public packages');
}

const rootHtml = await readFile(path.join(distDir, 'index.html'), 'utf8');
const koreanRootHtml = await readFile(path.join(distDir, 'ko', 'index.html'), 'utf8');
for (const [html, label, expected] of [
  [rootHtml, 'English root', 'GJ Kit library documentation'],
  [koreanRootHtml, 'Korean root', 'GJ Kit 라이브러리 문서'],
]) {
  if (!html.includes(expected)) fail(`${label} is missing its localized title`);
  if (!html.includes('rel="canonical"')) fail(`${label} is missing a canonical URL`);
  if (!html.includes('hreflang=')) fail(`${label} is missing hreflang links`);
}

const expectedPaths = new Set();
for (const pkg of snapshot.packages) {
  for (const locale of ['en', 'ko']) {
    const packagePage = packagePagePath(pkg, locale);
    if (!(await exists(packagePage))) fail(`${locale} package page missing for ${pkg.name}`);
    const html = await readFile(packagePage, 'utf8');
    if (!html.includes(pkg.version)) fail(`${locale} package page does not show ${pkg.name} version ${pkg.version}`);
  }
  for (const entry of pkg.entries) {
    const seenSymbols = new Set();
    for (const symbol of entry.symbols) {
      const key = `${pkg.slug}/${entry.id}/${symbol.slug}`;
      if (seenSymbols.has(symbol.slug)) fail(`${pkg.name} ${entry.subpath} has duplicate API slug ${symbol.slug}`);
      seenSymbols.add(symbol.slug);
      for (const locale of ['en', 'ko']) {
        const page = apiPagePath(pkg, entry, symbol, locale);
        expectedPaths.add(page);
        if (!(await exists(page))) fail(`${locale} API page missing for ${key}`);
        const html = await readFile(page, 'utf8');
        if (!html.includes(locale === 'ko' ? '검증된 import 예제' : 'Verified import example')) {
          fail(`${locale} API page has no verified import example for ${key}`);
        }
      }
    }
  }
}

const apiIndex = JSON.parse(await readFile(path.join(distDir, 'api', 'index.json'), 'utf8'));
if (JSON.stringify(apiIndex.packages.map((entry) => [entry.name, entry.version])) !== JSON.stringify(snapshot.packages.map((entry) => [entry.name, entry.version]))) {
  fail('machine API index does not match the published snapshot');
}
for (const pkg of snapshot.packages) {
  const packageJson = JSON.parse(await readFile(path.join(distDir, 'api', `${pkg.slug}.json`), 'utf8'));
  if (packageJson.name !== pkg.name || packageJson.version !== pkg.version) {
    fail(`machine API document does not match ${pkg.name}`);
  }
}

for (const requiredFile of ['llms.txt', 'llms-full.txt', 'robots.txt', 'sitemap-index.xml']) {
  if (!(await exists(path.join(distDir, requiredFile)))) fail(`missing ${requiredFile}`);
}
const llms = await readFile(path.join(distDir, 'llms.txt'), 'utf8');
for (const pkg of snapshot.packages) {
  if (!llms.includes(`${pkg.name} ${pkg.version}`)) fail(`llms.txt is missing ${pkg.name} ${pkg.version}`);
}
if (!(await exists(path.join(distDir, 'pagefind')))) fail('Pagefind search index is missing');

const sitemap = await readFile(path.join(distDir, 'sitemap-0.xml'), 'utf8').catch(async () => readFile(path.join(distDir, 'sitemap-index.xml'), 'utf8'));
for (const pkg of snapshot.packages) {
  if (!sitemap.includes(`/packages/${pkg.slug}/`) && !sitemap.includes('sitemap-0.xml')) {
    fail(`sitemap does not include ${pkg.name}`);
  }
}

const generatedPages = [];
async function collectHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectHtml(target);
    else if (entry.name === 'index.html') generatedPages.push(target);
  }
}
await collectHtml(path.join(distDir, 'api'));
const expectedApiPages = [...expectedPaths].filter((target) => target.includes(`${path.sep}api${path.sep}`)).length;
if (generatedPages.length < expectedApiPages / 2) {
  fail(`expected at least ${expectedApiPages / 2} English API pages, found ${generatedPages.length}`);
}

console.log(`Docs check passed: ${snapshot.packages.length} packages, ${expectedApiPages} localized API pages, Pagefind and machine indexes present.`);
