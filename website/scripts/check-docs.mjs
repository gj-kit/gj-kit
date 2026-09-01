import { access, readFile, readdir } from 'node:fs/promises';
import { categoryBlurbs, family, learningBySlug, packageBySlug, solutions } from '../src/data/catalog.mjs';
import { compileGuardStats, copyTokens, resolveCopy } from '../src/data/verification.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, '..');
const distDir = path.join(websiteDir, 'dist');
const siteBasePath = '/gj-kit';
const snapshot = JSON.parse(await readFile(path.join(websiteDir, 'api-snapshots', 'published.json'), 'utf8'));
// Catalog copy cites guard counts by token; resolve them the same way the
// generator did, so these assertions compare against what actually shipped.
const guardStats = await compileGuardStats();

function fail(message) {
  throw new Error(`Documentation check failed: ${message}`);
}

// Catalog copy does not survive into the HTML character for character: body
// text passes through Astro's typographic transform (straight quotes become
// curly), some of it is HTML-escaped, and every backtick becomes a <code>
// element that splits the sentence in two. So compare on the longest run of
// plain prose in the copy, with quotes and entities normalised on both sides.
function normalizeText(value) {
  return value
    .replaceAll('&#38;', '&')
    .replaceAll('&amp;', '&')
    .replaceAll('&#34;', '"')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('\u2018', "'")
    .replaceAll('\u2019', "'")
    .replaceAll('\u201c', '"')
    .replaceAll('\u201d', '"')
    .replace(/\s+/gu, ' ')
    .trim();
}

function longestPlainRun(text) {
  return text
    .split('`')
    .filter((_, index) => index % 2 === 0)
    .map((segment) => normalizeText(segment))
    .reduce((longest, segment) => (segment.length > longest.length ? segment : longest), '');
}

function renders(html, copy, slug) {
  const needle = longestPlainRun(resolveCopy(copy, copyTokens(guardStats, slug), 'docs check'));
  // Too short to identify anything; treat as present rather than assert on noise.
  if (needle.length < 12) return true;
  return normalizeText(html).includes(needle);
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

function packageLearningPagePath(pkg, page, locale = 'en') {
  const prefix = locale === 'ko' ? 'ko/' : '';
  return path.join(distDir, prefix, 'packages', pkg.slug, page, 'index.html');
}

function solutionPagePath(solution, locale = 'en') {
  const prefix = locale === 'ko' ? 'ko/' : '';
  return path.join(distDir, prefix, 'solutions', solution.slug, 'index.html');
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
// The landing page exists to answer "why should I care" before "how do I
// install". These assertions keep that answer on the page: a future refactor
// that drops the hero, the pillars or the category framing fails the build
// rather than quietly reverting the portal to a table of package names.
for (const [html, label, locale] of [
  [rootHtml, 'English root', 'en'],
  [koreanRootHtml, 'Korean root', 'ko'],
]) {
  if (!renders(html, family.heroTagline[locale])) fail(`${label} does not show the hero tagline`);
  for (const pillar of family.pillars) {
    if (!renders(html, pillar.title[locale])) fail(`${label} is missing the pillar "${pillar.title.en}"`);
  }
  for (const [category, blurb] of Object.entries(categoryBlurbs)) {
    if (!renders(html, blurb[locale])) fail(`${label} is missing the ${category} category blurb`);
  }
  for (const item of family.proof) {
    if (!renders(html, item[locale])) fail(`${label} is missing the proof point "${item.en}"`);
  }
  const scenarioHeading = locale === 'ko' ? '목표로 시작하기' : 'Start with a scenario';
  if (!html.includes(scenarioHeading)) fail(`${label} is missing the scenario entry point`);
}

for (const pkg of snapshot.packages) {
  if (!rootHtml.includes(`href="${siteBasePath}/packages/${pkg.slug}/"`)) {
    fail(`English root package link is missing the Pages base path for ${pkg.name}`);
  }
  if (!koreanRootHtml.includes(`href="${siteBasePath}/ko/packages/${pkg.slug}/"`)) {
    fail(`Korean root package link is missing the Pages base path for ${pkg.name}`);
  }
}
for (const [html, label, llmsHref, apiHref] of [
  [rootHtml, 'English root', 'href="llms.txt"', 'href="api/index.json"'],
  [koreanRootHtml, 'Korean root', 'href="../llms.txt"', 'href="../api/index.json"'],
]) {
  if (!html.includes(llmsHref)) fail(`${label} links llms.txt outside the site base path`);
  if (!html.includes(apiHref)) fail(`${label} links the API index outside the site base path`);
}

for (const [locale, labels] of [
  ['en', ['Packages', 'Solutions', 'API reference']],
  ['ko', ['패키지', '솔루션', 'API 레퍼런스']],
]) {
  const html = await readFile(packagePagePath(snapshot.packages[0], locale), 'utf8');
  for (const label of labels) {
    if (!html.includes(label)) fail(`${locale} package sidebar is missing navigation label ${label}`);
  }
}

const expectedPaths = new Set();
for (const pkg of snapshot.packages) {
  for (const locale of ['en', 'ko']) {
    const packagePage = packagePagePath(pkg, locale);
    if (!(await exists(packagePage))) fail(`${locale} package page missing for ${pkg.name}`);
    const html = await readFile(packagePage, 'utf8');
    if (!html.includes(pkg.version)) fail(`${locale} package page does not show ${pkg.name} version ${pkg.version}`);
    const quickStartLabels = locale === 'ko'
      ? ['완료 상태', '1. 설치', '2. 앱이 소유할 경계를 정합니다', '3. 최소 연결부터 시작합니다']
      : ['Outcome', '1. Install', '2. Keep the app-owned boundary explicit', '3. Start with the smallest integration'];
    for (const label of quickStartLabels) {
      if (!html.includes(label)) fail(`${locale} package page is missing Golden path step: ${label}`);
    }
    if (html.includes('void gjKit')) {
      fail(`${locale} package page still uses a no-op Golden path import for ${pkg.name}`);
    }
    // A package page has to sell before it specifies: the tagline is the lead,
    // and every highlight is a claim someone verified against the source.
    const product = packageBySlug.get(pkg.slug);
    const learning = learningBySlug[pkg.slug];
    if (!learning) fail(`${locale} package page has no learning catalog for ${pkg.name}`);
    if (!renders(html, product.tagline[locale], pkg.slug)) {
      fail(`${locale} package page for ${pkg.name} does not lead with its tagline`);
    }
    for (const highlight of product.highlights) {
      if (!renders(html, highlight.title[locale], pkg.slug)) {
        fail(`${locale} package page for ${pkg.name} is missing highlight "${highlight.title.en}"`);
      }
    }
    if (product.showcase && !renders(html, product.showcase.caption[locale], pkg.slug)) {
      fail(`${locale} package page for ${pkg.name} is missing its showcase caption`);
    }
    if (!html.includes(locale === 'ko' ? '계속 학습하기' : 'Keep learning')) {
      fail(`${locale} package page is missing learning-hub navigation for ${pkg.name}`);
    }
    if (!html.includes(locale === 'ko' ? '패키지 관계' : 'Package relationships')) {
      fail(`${locale} package page is missing relationship guidance for ${pkg.name}`);
    }

    const conceptsPage = packageLearningPagePath(pkg, 'concepts', locale);
    const recipesPage = packageLearningPagePath(pkg, 'recipes', locale);
    if (!(await exists(conceptsPage))) fail(`${locale} concepts page missing for ${pkg.name}`);
    if (!(await exists(recipesPage))) fail(`${locale} recipes page missing for ${pkg.name}`);
    const conceptsHtml = await readFile(conceptsPage, 'utf8');
    const recipesHtml = await readFile(recipesPage, 'utf8');
    for (const entry of learning.concepts) {
      if (!renders(conceptsHtml, entry.title[locale], pkg.slug) || !renders(conceptsHtml, entry.body[locale], pkg.slug)) {
        fail(`${locale} concepts page is missing catalog content for ${pkg.name}`);
      }
    }
    for (const recipe of learning.recipes) {
      if (!renders(recipesHtml, recipe.title[locale], pkg.slug) || !renders(recipesHtml, recipe.summary[locale], pkg.slug)) {
        fail(`${locale} recipes page is missing catalog content for ${pkg.name}`);
      }
    }
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

for (const solution of solutions) {
  for (const locale of ['en', 'ko']) {
    const page = solutionPagePath(solution, locale);
    if (!(await exists(page))) fail(`${locale} solution page missing for ${solution.slug}`);
    const html = await readFile(page, 'utf8');
    if (!renders(html, solution.title[locale]) || !renders(html, solution.description[locale])) {
      fail(`${locale} solution page is missing title or description for ${solution.slug}`);
    }
    for (const choice of solution.choices) {
      if (!renders(html, choice.title[locale]) || !renders(html, choice.body[locale])) {
        fail(`${locale} solution page is missing a choice for ${solution.slug}`);
      }
    }
    for (const slug of solution.packages) {
      const prefix = locale === 'ko' ? '/ko/' : '/';
      if (!html.includes(`href="${siteBasePath}${prefix}packages/${slug}/"`)) {
        fail(`${locale} solution page link is missing the base path for ${slug}`);
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
await collectHtml(distDir);
for (const page of generatedPages) {
  const html = await readFile(page, 'utf8');
  for (const match of html.matchAll(/\bhref="(\/[^"?#]*)/gu)) {
    const href = match[1];
    if (href !== siteBasePath && !href.startsWith(`${siteBasePath}/`)) {
      fail(`root-relative link outside the Pages base path in ${path.relative(distDir, page)}: ${href}`);
    }
  }
}
const expectedApiPages = [...expectedPaths].filter((target) => target.includes(`${path.sep}api${path.sep}`)).length;
const generatedApiPages = generatedPages.filter((page) => page.includes(`${path.sep}api${path.sep}`)).length;
if (generatedApiPages < expectedApiPages / 2) {
  fail(`expected at least ${expectedApiPages / 2} English API pages, found ${generatedApiPages}`);
}

console.log(`Docs check passed: ${snapshot.packages.length} packages, ${expectedApiPages} localized API pages, Pagefind and machine indexes present.`);
