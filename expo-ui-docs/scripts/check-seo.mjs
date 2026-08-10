import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const distDir = path.join(projectDir, 'dist');
const siteUrl = 'https://gj-kit-expo-ui.expo.app';
const catalog = JSON.parse(await readFile(path.join(projectDir, 'src/seo-catalog.json'), 'utf8'));

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
  if (!/<h1\b/i.test(html)) fail(`${route} has no h1`);
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
  if (!/name="robots"[^>]+content="[^"]*noindex/i.test(html)) {
    fail(`${route} must remain noindex until npm v${entry.since} is public`);
  }
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
