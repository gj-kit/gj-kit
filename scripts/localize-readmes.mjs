import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { categoryBlurbs, family, packages, quickStartBySlug, REPOSITORY_URL } from '../website/src/data/catalog.mjs';
import { compileGuardStats, copyTokens, resolveCopy } from '../website/src/data/verification.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checkOnly = process.argv.includes('--check');

// Guard counts in the copy are written as {{guards}} / {{guardTotal}} /
// {{guardFixtureFiles}} and filled in from the fixtures themselves, so a number
// in a README is always the number in tests/types.
const guardStats = await compileGuardStats();
const familyTokens = copyTokens(guardStats);
const copyFor = (product) => (text, where) => resolveCopy(text, copyTokens(guardStats, product.slug), where ?? product.name);
const familyCopy = (text, where) => resolveCopy(text, familyTokens, where ?? 'family copy');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Nine packages compile every README code block against their built dist types
 * (each package's scripts/check-readme.mjs). toss-payments-nestjs deliberately
 * does not: its examples lean on app-owned Nest types, and duplicating them into
 * a check harness degrades the whole thing to an `any` check. It verifies
 * required operational markers in the prose instead, and pins the golden path
 * against the real surface in tests/types/docs-golden-path.test-d.ts. The
 * "Verified" line has to say which of the two a reader is looking at.
 */
const MARKER_CHECKED_README = new Set(['toss-payments-nestjs']);

function verificationNote(product, locale) {
  const korean = locale === 'ko';
  if (MARKER_CHECKED_README.has(product.slug)) {
    return korean
      ? '이 페이지의 골든 패스와 예제가 주장하는 타입 동작은 `tests/types/docs-golden-path.test-d.ts`가 실제 공개 표면에 대해 고정하고, 필수 운영 표식은 릴리스마다 검사합니다. 열 개 패키지가 공유하는 게이트는 `pnpm verify:release` 하나입니다.'
      : 'The type behaviour this page\'s golden path and example claim is pinned against the real public surface by `tests/types/docs-golden-path.test-d.ts`, and its required operational markers are checked on every release; `pnpm verify:release` is the gate all ten packages share.';
  }
  return korean
    ? '이 문서의 모든 코드 블록은 릴리스 전에 공개 선언 파일에 대해 타입 검사를 통과합니다. 열 개 패키지가 공유하는 게이트는 `pnpm verify:release` 하나입니다.'
    : 'Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.';
}

const BADGE_QUERY = 'style=flat-square&color=0a7ea4';
const CI_BADGE = `[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&${BADGE_QUERY})](${REPOSITORY_URL}/actions/workflows/ci.yml)`;

/**
 * Badges answer, above the fold, the three questions a reader has about an
 * unfamiliar package: is it released, does it build, and what will it drag in.
 * Only the last is a literal, and the assertion further down this file keeps it
 * honest: adding a runtime dependency fails README generation.
 */
function packageBadges(product, hasLicenseFile) {
  const npmUrl = `https://www.npmjs.com/package/${product.name}`;
  // The badge asserts MIT, so the MIT text has to be somewhere a reader can
  // reach. Every package carries its own LICENSE today; the npm fallback exists
  // so a package that loses one degrades to a working link instead of a 404.
  const licenseHref = hasLicenseFile ? `${REPOSITORY_URL}/blob/main/${product.slug}/LICENSE` : npmUrl;
  return [
    `[![npm](https://img.shields.io/npm/v/${product.name}?label=npm&${BADGE_QUERY})](${npmUrl})`,
    CI_BADGE,
    `[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](${npmUrl})`,
    `[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](${npmUrl})`,
    `[![license](https://img.shields.io/npm/l/${product.name}?label=license&${BADGE_QUERY})](${licenseHref})`,
  ].join('\n');
}

function highlightList(product, locale) {
  const resolve = copyFor(product);
  return product.highlights
    .map((highlight) => `- **${resolve(highlight.title[locale])}** — ${resolve(highlight.body[locale])}`)
    .join('\n');
}

function proofList(product, locale) {
  const resolve = copyFor(product);
  return product.proof.map((item) => `- ${resolve(item[locale])}`).join('\n');
}

function showcaseBlock(product, locale) {
  if (!product.showcase) return '';
  const korean = locale === 'ko';
  return `\n\n## ${korean ? '실제로는 이렇게 걸립니다' : 'What that looks like'}\n\n${product.showcase.caption[locale]}\n\n\`\`\`${product.showcase.language}\n${product.showcase.code}\n\`\`\``;
}

function goldenPathBlock(product, locale) {
  const quickStart = quickStartBySlug[product.slug]?.[locale];
  if (!quickStart) throw new Error(`Missing ${locale} quick start for ${product.name}`);
  const korean = locale === 'ko';
  const language = product.slug === 'expo-ui' ? 'tsx' : 'ts';
  return `## Golden path

> **${korean ? '완료 상태' : 'Outcome'}:** ${quickStart.outcome}

### 1. ${korean ? '설치' : 'Install'}

\`\`\`sh
pnpm add ${product.name}
\`\`\`

### 2. ${korean ? '앱이 소유할 경계를 정합니다' : 'Keep the app-owned boundary explicit'}

${quickStart.boundary}

### 3. ${korean ? '최소 연결부터 시작합니다' : 'Start with the smallest integration'}

${korean
  ? '먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.'
  : 'Copy this first, then replace only the app-owned values named above.'}

\`\`\`${language}
${product.code}
\`\`\``;
}

function englishReadme(product, manifest, errorCodes, hasLicenseFile) {
  const entrypoints = Object.keys(manifest.exports ?? {})
    .filter((entry) => entry !== './package.json' && !entry.endsWith('.plugin.js'))
    .map((entry) => `- \`${product.name}${entry === '.' ? '' : entry.slice(1)}\``)
    .join('\n');
  const peers = Object.entries(manifest.peerDependencies ?? {});
  const peerSection = peers.length === 0
    ? 'This package has no peer dependencies.'
    : [
      '| Peer | Supported range |',
      '| --- | --- |',
      ...peers.map(([name, range]) => `| \`${name}\` | \`${range}\` |`),
    ].join('\n');
  const errorSection = errorCodes.length === 0
    ? ''
    : `\n\n## Error codes\n\nHandle these stable public codes rather than provider or native exception text:\n\n${errorCodes.map((code) => `- \`${code}\``).join('\n')}`;
  return `# ${product.name}

${packageBadges(product, hasLicenseFile)}

**English** · [한국어](./README.ko.md)

> **${copyFor(product)(product.tagline.en)}**

## Why this exists

${copyFor(product)(product.problem.en)}

## What it does about it

${highlightList(product, 'en')}

${goldenPathBlock(product, 'en')}${showcaseBlock(product, 'en')}

## Verified, not asserted

${proofList(product, 'en')}

${verificationNote(product, 'en')}

## Use it when

${product.when.en}

## Do not use it when

${product.avoid.en}

## Runtime and peers

${peerSection}

## Public entry points

${entrypoints}

## Safety boundary

${product.safety.en}${errorSection}

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/${product.slug}/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/${product.slug}/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/${product.slug}.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/${product.slug})
- [npm package](https://www.npmjs.com/package/${product.name})
`;
}

/**
 * The root README and the portal landing page answer the same question in the
 * same order: what is the shared promise, what mechanism backs it, and which of
 * the ten packages is mine. Package rows lead with the tagline rather than the
 * neutral npm description, because a reader scanning ten rows needs the payoff.
 */
function categorySections(locale) {
  const grouped = new Map();
  for (const product of packages) {
    const category = product.category[locale];
    grouped.set(category, [...(grouped.get(category) ?? []), product]);
  }
  return [...grouped.entries()]
    .map(([category, entries]) => {
      const rows = entries
        .map((product) => `| [\`${product.name}\`](./${product.slug}) | ${copyFor(product)(product.tagline[locale])} |`)
        .join('\n');
      const blurb = categoryBlurbs[entries[0].category.en]?.[locale];
      const header = locale === 'ko' ? '| 패키지 | 무엇을 막아 주는가 |' : '| Package | What it makes impossible |';
      return `### ${category}\n\n${blurb}\n\n${header}\n| --- | --- |\n${rows}`;
    })
    .join('\n\n');
}

function pillarList(locale) {
  return family.pillars.map((pillar) => `- **${familyCopy(pillar.title[locale])}** — ${familyCopy(pillar.body[locale])}`).join('\n');
}

function rootBadges() {
  return [
    CI_BADGE,
    '[![packages](https://img.shields.io/badge/packages-10-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)',
    '[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)',
    '[![node](https://img.shields.io/badge/node-%3E%3D20-0a7ea4?style=flat-square)](https://nodejs.org)',
    `[![license](https://img.shields.io/badge/license-MIT-0a7ea4?style=flat-square)](${REPOSITORY_URL}/blob/main/LICENSE)`,
  ].join('\n');
}

function koreanRootReadme() {
  return `# GJ Kit

${rootBadges()}

[English](./README.md) · **한국어**

> **${family.heroTagline.ko}**

${family.heroSubtitle.ko}

## 왜 이렇게 만들었나

${pillarList('ko')}

## 패키지

${categorySections('ko')}

## 설치

\`\`\`sh
pnpm add @gj-kit/expo-ui
\`\`\`

각 패키지의 Golden path, peer·플랫폼 경계, 전체 API 명세는 해당 패키지 README와 [문서 포털](https://gj-kit.github.io/gj-kit/ko/)에서 확인하세요. 에이전트용으로는 [llms.txt](https://gj-kit.github.io/gj-kit/llms.txt)와 [API JSON index](https://gj-kit.github.io/gj-kit/api/index.json)를 함께 제공합니다.

## 검증

${family.proof.map((item) => `- ${familyCopy(item.ko)}`).join('\n')}

## 릴리스

공개 패키지 변경에는 Changeset이 필요합니다. main에 병합된 Version Packages PR은 기존 CI를 통해 npm과 GitHub Release를 만듭니다. 직접 \`npm publish\` 하지 마세요.
`;
}

function englishRootReadme() {
  return `# GJ Kit

${rootBadges()}

**English** · [한국어](./README.ko.md)

> **${family.heroTagline.en}**

${family.heroSubtitle.en}

## Why they are built this way

${pillarList('en')}

## The packages

${categorySections('en')}

## Install

\`\`\`sh
pnpm add @gj-kit/expo-ui
\`\`\`

Each package README and [portal page](https://gj-kit.github.io/gj-kit/) carries its golden path, supported peer and platform boundary, and complete generated API reference. For agents there is also [llms.txt](https://gj-kit.github.io/gj-kit/llms.txt) and an [API JSON index](https://gj-kit.github.io/gj-kit/api/index.json).

## Verified, not asserted

${family.proof.map((item) => `- ${familyCopy(item.en)}`).join('\n')}

## Releases

Every user-facing package change needs a Changeset. A Version Packages PR merged into \`main\` publishes through the existing CI workflow; do not run \`npm publish\` directly.
`;
}

function withLanguageSwitch(source) {
  if (source.includes('[English](./README.md)') || source.includes('**한국어**')) return source;
  const firstBreak = source.indexOf('\n');
  if (firstBreak === -1) return `${source}\n\n[English](./README.md) · **한국어**\n`;
  return `${source.slice(0, firstBreak)}\n\n[English](./README.md) · **한국어**${source.slice(firstBreak)}`;
}

function koreanOverview(product, manifest, errorCodes, hasLicenseFile) {
  const peers = Object.entries(manifest.peerDependencies ?? {});
  const entrypoints = Object.keys(manifest.exports ?? {})
    .filter((entry) => entry !== './package.json' && !entry.endsWith('.plugin.js'))
    .map((entry) => `- \`${product.name}${entry === '.' ? '' : entry.slice(1)}\``)
    .join('\n');
  const peerSection = peers.length === 0
    ? '이 패키지는 peer dependency가 없습니다.'
    : [
      '| Peer | 지원 범위 |',
      '| --- | --- |',
      ...peers.map(([name, range]) => `| \`${name}\` | \`${range}\` |`),
    ].join('\n');
  const errorSection = errorCodes.length === 0
    ? ''
    : `\n\n## 오류 코드\n\nprovider 또는 native 예외 문자열 대신 다음의 안정된 공개 코드를 처리하세요.\n\n${errorCodes.map((code) => `- \`${code}\``).join('\n')}`;
  return `<!-- gj-kit-localized-overview -->

${packageBadges(product, hasLicenseFile)}

> **${copyFor(product)(product.tagline.ko)}**

## 왜 필요한가

${copyFor(product)(product.problem.ko)}

## 무엇으로 막는가

${highlightList(product, 'ko')}

${goldenPathBlock(product, 'ko')}${showcaseBlock(product, 'ko')}

## 주장 대신 검증

${proofList(product, 'ko')}

${verificationNote(product, 'ko')}

## 사용할 때

${product.when.ko}

## 사용하지 않을 때

${product.avoid.ko}

## 런타임과 peer 조건

${peerSection}

## 공개 entry point

${entrypoints}

## 안전 경계

${product.safety.ko}${errorSection}

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/${product.slug}/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/${product.slug}/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/${product.slug}.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.`;
}

function withKoreanOverview(source, product, manifest, errorCodes, hasLicenseFile) {
  const switched = withLanguageSwitch(source);
  const existingOverviewStart = switched.indexOf('<!-- gj-kit-localized-overview -->');
  if (existingOverviewStart !== -1) {
    const detailGuideStart = switched.indexOf('\n\n## 상세 가이드', existingOverviewStart);
    if (detailGuideStart === -1) throw new Error(`Could not refresh ${product.name} Korean README overview`);
    return `${switched.slice(0, existingOverviewStart)}${koreanOverview(product, manifest, errorCodes, hasLicenseFile)}${switched.slice(detailGuideStart)}`;
  }
  const switchLine = '[English](./README.md) · **한국어**';
  const switchIndex = switched.indexOf(switchLine);
  if (switchIndex === -1) throw new Error(`Could not add language switch to ${product.name} Korean README`);
  const afterSwitch = switchIndex + switchLine.length;
  return `${switched.slice(0, afterSwitch)}\n\n${koreanOverview(product, manifest, errorCodes, hasLicenseFile)}\n\n## 상세 가이드\n${switched.slice(afterSwitch)}`;
}

async function publicErrorCodes(directory) {
  if (path.basename(directory) !== 'nest-notifications') return [];
  const source = await readFile(path.join(directory, 'src', 'core', 'errors.ts'), 'utf8');
  const union = /export type NotificationsErrorCode =([\s\S]*?);/u.exec(source)?.[1] ?? '';
  return [...union.matchAll(/'(ERR_NOTIFICATION_[A-Z_]+)'/gu)].map((match) => match[1]).filter(Boolean);
}

const rootReadme = path.join(root, 'README.md');
const rootKorean = path.join(root, 'README.ko.md');
if (checkOnly) {
  for (const target of [rootReadme, rootKorean]) {
    if (!(await exists(target))) throw new Error(`Missing localized root README: ${path.relative(root, target)}`);
  }
} else {
  await writeFile(rootReadme, englishRootReadme(), 'utf8');
  await writeFile(rootKorean, koreanRootReadme(), 'utf8');
}

for (const product of packages) {
  const directory = path.join(root, product.slug);
  const readme = path.join(directory, 'README.md');
  const korean = path.join(directory, 'README.ko.md');
  const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const errorCodes = await publicErrorCodes(directory);
  const hasLicenseFile = await exists(path.join(directory, 'LICENSE'));
  // Both READMEs and the portal carry a "0 runtime dependencies" badge. That is
  // the one claim on the page that a routine `pnpm add` could silently falsify,
  // so it is asserted here rather than trusted: adding a runtime dependency now
  // fails `pnpm check:readme` in CI instead of shipping a badge that lies.
  const runtimeDependencies = Object.keys(manifest.dependencies ?? {});
  if (runtimeDependencies.length > 0) {
    throw new Error(
      `${product.name} declares runtime dependencies (${runtimeDependencies.join(', ')}), ` +
      'but its README and portal page badge zero. Remove the dependency, or drop the badge from packageBadges().',
    );
  }
  if (checkOnly) {
    for (const target of [readme, korean]) {
      if (!(await exists(target))) throw new Error(`Missing localized README: ${path.relative(root, target)}`);
    }
    const english = await readFile(readme, 'utf8');
    const koreanText = await readFile(korean, 'utf8');
    if (!english.includes('[한국어](./README.ko.md)')) throw new Error(`${product.name} English README has no Korean switch`);
    if (!koreanText.includes('[English](./README.md)')) throw new Error(`${product.name} Korean README has no English switch`);
    if (!koreanText.includes('<!-- gj-kit-localized-overview -->')) throw new Error(`${product.name} Korean README has no localized overview`);
    // A README that opens with a spec table is a README nobody reads. These
    // assert that the parts a reader decides on — the tagline, the failure
    // modes it removes, and what it does about them — survived regeneration.
    for (const [text, label, locale] of [[english, 'English', 'en'], [koreanText, 'Korean', 'ko']]) {
      const resolve = copyFor(product);
      if (!text.includes(`> **${resolve(product.tagline[locale])}**`)) {
        throw new Error(`${product.name} ${label} README does not lead with its tagline`);
      }
      if (!text.includes(resolve(product.problem[locale]))) {
        throw new Error(`${product.name} ${label} README is missing the problem it solves`);
      }
      for (const highlight of product.highlights) {
        if (!text.includes(`**${resolve(highlight.title[locale])}**`)) {
          throw new Error(`${product.name} ${label} README is missing highlight "${highlight.title.en}"`);
        }
      }
      if (!text.includes(`https://img.shields.io/npm/v/${product.name}`)) {
        throw new Error(`${product.name} ${label} README has no npm badge`);
      }
    }
    continue;
  }
  const legacyKorean = await readFile((await exists(korean)) ? korean : readme, 'utf8');
  await writeFile(korean, withKoreanOverview(legacyKorean, product, manifest, errorCodes, hasLicenseFile), 'utf8');
  await writeFile(readme, englishReadme(product, manifest, errorCodes, hasLicenseFile), 'utf8');
}

console.log(checkOnly ? 'Localized README check passed.' : 'Created English-first README files and preserved Korean originals.');
