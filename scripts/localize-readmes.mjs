import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packages, quickStartBySlug } from '../website/src/data/catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const checkOnly = process.argv.includes('--check');

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
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

function englishReadme(product, manifest, errorCodes) {
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

**English** · [한국어](./README.ko.md)

${product.description.en}

${goldenPathBlock(product, 'en')}

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

function koreanRootReadme() {
  const rows = packages.map((product) => `| [\`${product.name}\`](./${product.slug}) | ${product.description.ko} |`).join('\n');
  return `# gj-kit

[English](./README.md) · **한국어**

Expo, React Native, NestJS, Toss Payments를 위한 재사용 가능한 TypeScript 라이브러리 모노레포입니다. 사람용 문서와 에이전트용 API index는 [GJ Kit 문서 포털](https://gj-kit.github.io/gj-kit/)에서 제공합니다.

| 패키지 | 설명 |
| --- | --- |
${rows}

## 설치

\`\`\`sh
pnpm add @gj-kit/expo-ui
\`\`\`

각 패키지의 설치, Golden path, peer/플랫폼 경계, 전체 API 명세는 해당 패키지 README와 포털을 확인하세요.

## 릴리스

공개 패키지 변경에는 Changeset이 필요합니다. main에 병합된 Version Packages PR은 기존 CI를 통해 npm과 GitHub Release를 만듭니다. 직접 \`npm publish\` 하지 마세요.
`;
}

function englishRootReadme() {
  const rows = packages.map((product) => `| [\`${product.name}\`](./${product.slug}) | ${product.description.en} |`).join('\n');
  return `# gj-kit

**English** · [한국어](./README.ko.md)

Reusable TypeScript libraries for Expo, React Native, NestJS, and Toss Payments. Human documentation and agent-readable API indexes are published at [GJ Kit Docs](https://gj-kit.github.io/gj-kit/).

| Package | Description |
| --- | --- |
${rows}

## Install

\`\`\`sh
pnpm add @gj-kit/expo-ui
\`\`\`

Open each package README and portal page for its supported peer/platform boundary, golden path, and complete generated API reference.

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

function koreanOverview(product, manifest, errorCodes) {
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

${product.description.ko}

${goldenPathBlock(product, 'ko')}

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

function withKoreanOverview(source, product, manifest, errorCodes) {
  const switched = withLanguageSwitch(source);
  const existingOverviewStart = switched.indexOf('<!-- gj-kit-localized-overview -->');
  if (existingOverviewStart !== -1) {
    const detailGuideStart = switched.indexOf('\n\n## 상세 가이드', existingOverviewStart);
    if (detailGuideStart === -1) throw new Error(`Could not refresh ${product.name} Korean README overview`);
    return `${switched.slice(0, existingOverviewStart)}${koreanOverview(product, manifest, errorCodes)}${switched.slice(detailGuideStart)}`;
  }
  const switchLine = '[English](./README.md) · **한국어**';
  const switchIndex = switched.indexOf(switchLine);
  if (switchIndex === -1) throw new Error(`Could not add language switch to ${product.name} Korean README`);
  const afterSwitch = switchIndex + switchLine.length;
  return `${switched.slice(0, afterSwitch)}\n\n${koreanOverview(product, manifest, errorCodes)}\n\n## 상세 가이드\n${switched.slice(afterSwitch)}`;
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
  if (checkOnly) {
    for (const target of [readme, korean]) {
      if (!(await exists(target))) throw new Error(`Missing localized README: ${path.relative(root, target)}`);
    }
    const english = await readFile(readme, 'utf8');
    const koreanText = await readFile(korean, 'utf8');
    if (!english.includes('[한국어](./README.ko.md)')) throw new Error(`${product.name} English README has no Korean switch`);
    if (!koreanText.includes('[English](./README.md)')) throw new Error(`${product.name} Korean README has no English switch`);
    if (!koreanText.includes('<!-- gj-kit-localized-overview -->')) throw new Error(`${product.name} Korean README has no localized overview`);
    continue;
  }
  const legacyKorean = await readFile((await exists(korean)) ? korean : readme, 'utf8');
  await writeFile(korean, withKoreanOverview(legacyKorean, product, manifest, errorCodes), 'utf8');
  await writeFile(readme, englishReadme(product, manifest, errorCodes), 'utf8');
}

console.log(checkOnly ? 'Localized README check passed.' : 'Created English-first README files and preserved Korean originals.');
