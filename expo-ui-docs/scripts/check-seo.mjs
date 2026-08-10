import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const distDir = path.join(projectDir, 'dist');
const siteUrl = 'https://gj-kit-expo-ui.expo.app';
const catalog = JSON.parse(await readFile(path.join(projectDir, 'src/seo-catalog.json'), 'utf8'));
const libraryPackage = JSON.parse(
  await readFile(path.resolve(projectDir, '../expo-ui/package.json'), 'utf8'),
);

function compareVersions(first, second) {
  const left = first.split('.').map(Number);
  const right = second.split('.').map(Number);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

const released = catalog.components.filter(
  (entry) => compareVersions(catalog.publishedVersion, entry.since) >= 0,
);
const previews = catalog.components.filter(
  (entry) => compareVersions(catalog.publishedVersion, entry.since) < 0,
);
const indexableRoutes = [
  '/',
  '/docs',
  '/docs/components',
  ...catalog.guides.map((entry) => `/docs/${entry.slug}`),
  ...released.map((entry) => `/docs/components/${entry.slug}`),
];

function routeFile(route) {
  if (route === '/') return path.join(distDir, 'index.html');
  return path.join(distDir, `${route.slice(1)}.html`);
}

function fail(message) {
  throw new Error(`SEO check failed: ${message}`);
}

if (catalog.publishedVersion !== libraryPackage.version) {
  fail(
    `catalog publishedVersion ${catalog.publishedVersion} does not match package version ${libraryPackage.version}`,
  );
}

function matchContent(html, pattern, label, route) {
  const value = pattern.exec(html)?.[1];
  if (!value) fail(`${route} is missing ${label}`);
  return value;
}

const titles = new Map();
const descriptions = new Map();
for (const route of indexableRoutes) {
  const html = await readFile(routeFile(route), 'utf8');
  const title = matchContent(html, /<title[^>]*>([^<]+)<\/title>/i, 'title', route);
  const description = matchContent(
    html,
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    'meta description',
    route,
  );
  const canonical = matchContent(
    html,
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
    'canonical',
    route,
  );
  const ogUrl = matchContent(
    html,
    /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i,
    'og:url',
    route,
  );
  const expectedUrl = `${siteUrl}${route}`;
  if (canonical !== expectedUrl) fail(`${route} canonical is ${canonical}, expected ${expectedUrl}`);
  if (ogUrl !== expectedUrl) fail(`${route} og:url is ${ogUrl}, expected ${expectedUrl}`);
  const h1Count = (html.match(/<h1\b/gi) ?? []).length;
  if (h1Count !== 1) fail(`${route} has ${h1Count} h1 elements, expected exactly 1`);
  if (/name="robots"[^>]+content="[^"]*noindex/i.test(html)) fail(`${route} is unexpectedly noindex`);
  if (!/type="application\/ld\+json"/i.test(html)) fail(`${route} has no JSON-LD`);
  if ((html.match(/<a\b[^>]+href=/gi) ?? []).length === 0) fail(`${route} has no crawlable links`);
  if (titles.has(title)) fail(`${route} shares title with ${titles.get(title)}`);
  if (descriptions.has(description)) fail(`${route} shares description with ${descriptions.get(description)}`);
  titles.set(title, route);
  descriptions.set(description, route);

  const scripts = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, source] of scripts) {
    try {
      JSON.parse(source);
    } catch (error) {
      fail(`${route} has invalid JSON-LD: ${error.message}`);
    }
  }
}

for (const entry of previews) {
  const route = `/docs/components/${entry.slug}`;
  const html = await readFile(routeFile(route), 'utf8');
  const expectedUrl = `${siteUrl}${route}`;
  if (!/name="robots"[^>]+content="[^"]*noindex/i.test(html)) {
    fail(`${route} must remain noindex until npm v${entry.since} is public`);
  }
  const canonical = matchContent(
    html,
    /<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i,
    'canonical',
    route,
  );
  const ogUrl = matchContent(
    html,
    /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i,
    'og:url',
    route,
  );
  matchContent(html, /<title[^>]*>([^<]+)<\/title>/i, 'title', route);
  matchContent(
    html,
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i,
    'meta description',
    route,
  );
  if (canonical !== expectedUrl || ogUrl !== expectedUrl) {
    fail(`${route} preview metadata does not use its self URL`);
  }
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) fail(`${route} preview must have exactly 1 h1`);
  if (!/type="application\/ld\+json"/i.test(html)) fail(`${route} preview has no JSON-LD`);
}

const componentIndexHtml = await readFile(routeFile('/docs/components'), 'utf8');
const expectedComponentPaths = catalog.components.map(
  (entry) => `/docs/components/${entry.slug}`,
);
const actualComponentPaths = [
  ...componentIndexHtml.matchAll(/<a\b[^>]+href="(\/docs\/components\/[^"#?]+)"/gi),
].map((match) => match[1]);
if (JSON.stringify(actualComponentPaths) !== JSON.stringify(expectedComponentPaths)) {
  fail('component index crawlable links do not exactly match catalog order');
}
for (const requiredClass of ['seo-directory-hero', 'seo-directory-layout', 'seo-component-grid']) {
  if (!componentIndexHtml.includes(requiredClass)) {
    fail(`component index is missing the ${requiredClass} layout hook`);
  }
}

const componentSchemas = [
  ...componentIndexHtml.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  ),
].map((match) => JSON.parse(match[1]));
const itemList = componentSchemas.find((schema) => schema['@type'] === 'ItemList');
if (!itemList) fail('component index has no ItemList JSON-LD');
if (itemList.numberOfItems !== catalog.components.length) {
  fail('component ItemList numberOfItems does not match catalog');
}
const expectedItemList = catalog.components.map((entry, index) => ({
  '@type': 'ListItem',
  position: index + 1,
  name: entry.name,
  url: `${siteUrl}/docs/components/${entry.slug}`,
}));
if (JSON.stringify(itemList.itemListElement) !== JSON.stringify(expectedItemList)) {
  fail('component ItemList entries do not match catalog names, URLs, and order');
}

const homeHtml = await readFile(routeFile('/'), 'utf8');
const homeSchemas = [
  ...homeHtml.matchAll(
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi,
  ),
].map((match) => JSON.parse(match[1]));
const softwareSourceCode = homeSchemas.find((schema) => schema['@type'] === 'SoftwareSourceCode');
if (!softwareSourceCode) fail('home page has no SoftwareSourceCode JSON-LD');
if (softwareSourceCode.version !== libraryPackage.version) {
  fail('home SoftwareSourceCode version does not match package version');
}

const notFound = await readFile(path.join(distDir, '+not-found.html'), 'utf8');
if (!/name="robots"[^>]+content="[^"]*noindex/i.test(notFound)) {
  fail('+not-found.html must be noindex');
}

for (const internalFile of ['_sitemap.html', 'docs/[guide].html', 'docs/components/[slug].html']) {
  const internalHtml = await readFile(path.join(distDir, internalFile), 'utf8');
  if (!/name="robots"[^>]+content="[^"]*noindex/i.test(internalHtml)) {
    fail(`${internalFile} must be noindex`);
  }
}

await Promise.all([
  access(path.join(distDir, 'robots.txt')),
  access(path.join(distDir, 'sitemap.xml')),
  access(path.join(distDir, 'favicon.svg')),
  access(path.join(distDir, 'site.webmanifest')),
]);
const robots = await readFile(path.join(distDir, 'robots.txt'), 'utf8');
if (!robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`)) fail('robots.txt has no sitemap declaration');
if (/Disallow:\s*\/_sitemap/i.test(robots)) {
  fail('robots.txt must allow crawlers to read the _sitemap noindex directive');
}
const sitemap = await readFile(path.join(distDir, 'sitemap.xml'), 'utf8');
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const expectedUrls = indexableRoutes.map((route) => `${siteUrl}${route}`);
if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls)) {
  fail('sitemap URLs do not match canonical indexable routes');
}

console.log(
  `SEO check passed: ${indexableRoutes.length} indexable routes, ${previews.length} noindex previews, unique metadata and valid JSON-LD.`,
);
