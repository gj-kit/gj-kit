import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const catalog = JSON.parse(
  await readFile(path.join(projectDir, 'src/seo-catalog.json'), 'utf8'),
);
const siteUrl = 'https://gj-kit-expo-ui.expo.app';
const LOCALES = ['en', 'ko'];

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

function assertEntries(entries, label) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`SEO catalog ${label} must be a non-empty array.`);
  }
}

function assertUnique(entries, key, label) {
  const values = entries.map((entry) => entry[key]);
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate !== undefined) {
    throw new Error(`SEO catalog contains duplicate ${label}: ${duplicate}`);
  }
}

assertEntries(catalog.components, 'components');
assertEntries(catalog.guides, 'guides');
assertUnique(catalog.components, 'slug', 'component slug');
assertUnique(catalog.components, 'name', 'component name');
assertUnique(catalog.guides, 'slug', 'guide slug');

const componentReferences = new Set(
  catalog.components.flatMap((entry) => [entry.slug, entry.name]),
);
for (const entry of catalog.components) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.slug)) {
    throw new Error(`Invalid component slug: ${entry.slug}`);
  }
  if (!/^\d+\.\d+\.\d+$/u.test(entry.since)) {
    throw new Error(`Invalid component version for ${entry.name}: ${entry.since}`);
  }
  for (const related of entry.related ?? []) {
    if (!componentReferences.has(related)) {
      throw new Error(`Unknown related component for ${entry.name}: ${related}`);
    }
  }
  // 상세 페이지 h1은 headline을 그대로 쓴다. 이름으로 끝나지 않으면 제목에서
  // 컴포넌트 이름이 사라진다. 두 로케일 모두 검사한다.
  for (const locale of LOCALES) {
    const text = entry[locale];
    if (text === undefined) {
      throw new Error(`Missing ${locale} text for component: ${entry.name}`);
    }
    if (!text.headline.trim().endsWith(entry.name)) {
      throw new Error(
        `[${locale}] Headline must end with the component name so the detail page h1 contains it: ${entry.name} — ${text.headline}`,
      );
    }
    for (const field of ['category', 'description', 'summary', 'accessibility', 'snippet']) {
      if (typeof text[field] !== 'string' || text[field].length === 0) {
        throw new Error(`[${locale}] Empty ${field} for component: ${entry.name}`);
      }
    }
    if (!Array.isArray(text.features) || text.features.length === 0) {
      throw new Error(`[${locale}] Empty features for component: ${entry.name}`);
    }
  }
}

// 카탈로그에 컴포넌트를 추가하고 미리보기를 빠뜨리면 상세 페이지가 글만 남는다.
const previewSource = await readFile(
  path.join(projectDir, 'src/component-previews.tsx'),
  'utf8',
);
const registryBlock = previewSource
  .split('const previews: Readonly<Record<string, ComponentType>> = {')[1]
  ?.split('\n};')[0];
if (registryBlock === undefined) {
  throw new Error('component-previews.tsx의 previews 레지스트리를 찾지 못했습니다.');
}
const previewSlugs = new Set(
  [...registryBlock.matchAll(/^\s{2}'?([a-z0-9-]+)'?:/gmu)].map((match) => match[1]),
);
const missingPreviews = catalog.components
  .map((entry) => entry.slug)
  .filter((slug) => !previewSlugs.has(slug));
if (missingPreviews.length > 0) {
  throw new Error(
    `미리보기가 없는 컴포넌트: ${missingPreviews.join(', ')} — src/component-previews.tsx에 추가하세요.`,
  );
}

for (const guide of catalog.guides) {
  for (const locale of LOCALES) {
    const text = guide[locale];
    if (text === undefined) throw new Error(`Missing ${locale} text for guide: ${guide.slug}`);
    if (text.sections.length !== guide.ko.sections.length) {
      throw new Error(
        `[${locale}] Guide section count differs from ko for ${guide.slug}: ${text.sections.length} vs ${guide.ko.sections.length}`,
      );
    }
  }
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
console.log(`Live previews: ${previewSlugs.size}/${catalog.components.length} components covered.`);
