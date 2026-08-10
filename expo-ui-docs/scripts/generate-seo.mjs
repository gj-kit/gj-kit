import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const catalog = JSON.parse(
  await readFile(path.join(projectDir, 'src/seo-catalog.json'), 'utf8'),
);
const siteUrl = 'https://gj-kit-expo-ui.expo.app';

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

const releasedComponents = catalog.components.filter(
  (entry) => compareVersions(catalog.publishedVersion, entry.since) >= 0,
);
const routes = [
  '/',
  '/docs',
  '/docs/components',
  ...catalog.guides.map((entry) => `/docs/${entry.slug}`),
  ...releasedComponents.map((entry) => `/docs/components/${entry.slug}`),
];

if (catalog.components.length !== 31) {
  throw new Error(`SEO catalog must contain 31 components, received ${catalog.components.length}`);
}
if (catalog.guides.length !== 6) {
  throw new Error(`SEO catalog must contain 6 guides, received ${catalog.guides.length}`);
}
if (new Set(routes).size !== routes.length) {
  throw new Error('SEO routes contain duplicates.');
}

const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`;
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...routes.map((route) => `  <url><loc>${siteUrl}${route}</loc></url>`),
  '</urlset>',
  '',
].join('\n');

await Promise.all([
  writeFile(path.join(projectDir, 'public/robots.txt'), robots, 'utf8'),
  writeFile(path.join(projectDir, 'public/sitemap.xml'), sitemap, 'utf8'),
]);

console.log(
  `SEO assets generated: ${routes.length} canonical routes (${releasedComponents.length} released components, ${catalog.components.length - releasedComponents.length} previews excluded).`,
);
