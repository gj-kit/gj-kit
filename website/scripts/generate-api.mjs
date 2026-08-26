import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { packageBySlug, packages, quickStartBySlug, REPOSITORY_URL, SITE_URL } from '../src/data/catalog.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const websiteDir = path.resolve(scriptDir, '..');
const repositoryDir = path.resolve(websiteDir, '..');
const snapshotsDir = path.join(websiteDir, 'api-snapshots');
const generatedDocsDir = path.join(websiteDir, 'src', 'content', 'docs');
const publicDir = path.join(websiteDir, 'public');
const publishedSnapshotPath = path.join(snapshotsDir, 'published.json');
const nextSnapshotPath = path.join(snapshotsDir, 'next.json');
const siteBasePath = new URL(SITE_URL).pathname.replace(/\/$/u, '');

const args = new Set(process.argv.slice(2));
const snapshotTarget = args.has('--next') ? nextSnapshotPath : publishedSnapshotPath;
const writeSnapshot = args.has('--write-snapshot');

function fail(message) {
  throw new Error(`Documentation generation failed: ${message}`);
}

function stable(value) {
  return JSON.stringify(value, null, 2) + '\n';
}

function normalizeTypeTarget(target) {
  return target.replace(/^\.\//u, '');
}

function collectTypeTargets(value, targets) {
  if (value === null || typeof value !== 'object') return;
  if (typeof value.types === 'string') targets.add(normalizeTypeTarget(value.types));
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'types') collectTypeTargets(child, targets);
  }
}

function declarationTargets(manifest) {
  const entries = [];
  for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
    if (subpath === './package.json' || subpath.endsWith('.plugin.js')) continue;
    const targets = new Set();
    collectTypeTargets(conditions, targets);
    if (subpath === '.' && targets.size === 0 && typeof manifest.types === 'string') {
      targets.add(normalizeTypeTarget(manifest.types));
    }
    // Export conditions can repeat an identical declaration under import/require,
    // browser/node, or native branches. The API is the public subpath, not every
    // resolver branch, so one canonical declaration prevents duplicate pages.
    const target = [...targets]
      .sort((left, right) => {
        const leftPenalty = left.includes('.web.') ? 1 : 0;
        const rightPenalty = right.includes('.web.') ? 1 : 0;
        return leftPenalty - rightPenalty || left.localeCompare(right);
      })[0];
    if (target) entries.push({ subpath, target });
  }
  return entries.sort((left, right) => left.subpath.localeCompare(right.subpath) || left.target.localeCompare(right.target));
}

function entryId(subpath) {
  return subpath === '.' ? 'root' : subpath.slice(2).replaceAll('/', '--');
}

function symbolSlug(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/gu, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .toLowerCase() || 'default';
}

function declarationKind(symbol, declaration) {
  const flags = symbol.flags;
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.ValueModule) return 'namespace';
  if (flags & ts.SymbolFlags.Variable) return 'constant';
  if (declaration && ts.isTypeParameterDeclaration(declaration)) return 'type';
  return 'export';
}

function publicSymbolEntries(declarationPath) {
  const program = ts.createProgram({
    rootNames: [declarationPath],
    options: {
      allowJs: false,
      declaration: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const source = program.getSourceFile(declarationPath);
  if (!source) fail(`cannot read declaration ${path.relative(repositoryDir, declarationPath)}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) fail(`cannot resolve exports for ${path.relative(repositoryDir, declarationPath)}`);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: false });

  const entries = checker
    .getExportsOfModule(moduleSymbol)
    .map((exportedSymbol) => {
      const symbol = exportedSymbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exportedSymbol)
        : exportedSymbol;
      const declarations = symbol.declarations ?? exportedSymbol.declarations ?? [];
      const declaration = declarations.find((candidate) => !ts.isExportSpecifier(candidate)) ?? declarations[0];
      const declarationText = declarations
        .filter((candidate) => !ts.isExportSpecifier(candidate))
        .map((candidate) => printer.printNode(ts.EmitHint.Unspecified, candidate, candidate.getSourceFile()).trim())
        .filter(Boolean)
        .join('\n\n');
      const documentation = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
      return {
        name: exportedSymbol.getName(),
        slug: symbolSlug(exportedSymbol.getName()),
        kind: declarationKind(symbol, declaration),
        declaration: declarationText || `export { ${exportedSymbol.getName()} };`,
        sourceDocumentation: documentation || undefined,
      };
    })
    .filter((entry) => entry.name !== '__export')
    .sort((left, right) => left.name.localeCompare(right.name));

  // TypeScript permits a type and a runtime value to share a readable name.
  // Lower-casing URLs would otherwise make `MediaErrorCode` and
  // `mediaErrorCode` overwrite one another. Preserve the shortest URL for the
  // runtime value and add a deterministic kind suffix to its sibling.
  const grouped = new Map();
  for (const entry of entries) {
    const siblings = grouped.get(entry.slug) ?? [];
    siblings.push(entry);
    grouped.set(entry.slug, siblings);
  }
  const kindOrder = new Map([
    ['function', 0],
    ['class', 0],
    ['constant', 0],
    ['enum', 0],
    ['namespace', 0],
    ['interface', 1],
    ['type', 1],
    ['export', 2],
  ]);
  for (const siblings of grouped.values()) {
    if (siblings.length < 2) continue;
    siblings.sort((left, right) => (kindOrder.get(left.kind) ?? 3) - (kindOrder.get(right.kind) ?? 3) || left.name.localeCompare(right.name));
    siblings.forEach((entry, index) => {
      if (index > 0) entry.slug = `${entry.slug}--${entry.kind}${index > 1 ? `-${index + 1}` : ''}`;
    });
  }
  return entries;
}

async function readManifest(slug) {
  return JSON.parse(await readFile(path.join(repositoryDir, slug, 'package.json'), 'utf8'));
}

async function createSnapshot() {
  const collected = [];
  for (const product of packages) {
    const manifest = await readManifest(product.slug);
    if (manifest.name !== product.name) fail(`${product.slug} catalog name does not match package.json`);
    const entries = declarationTargets(manifest).map(({ subpath, target }) => {
      const declarationPath = path.join(repositoryDir, product.slug, target);
      return {
        subpath,
        id: entryId(subpath),
        declarationTarget: `./${target}`,
        symbols: publicSymbolEntries(declarationPath),
      };
    });
    if (entries.length === 0) fail(`${manifest.name} has no TypeScript declaration exports`);
    collected.push({
      slug: product.slug,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description ?? '',
      homepage: manifest.homepage ?? '',
      repository: typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url ?? '',
      license: manifest.license ?? '',
      engines: manifest.engines ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
      peerDependenciesMeta: manifest.peerDependenciesMeta ?? {},
      entries,
    });
  }
  return { schemaVersion: 1, packages: collected };
}

async function loadSnapshot() {
  try {
    return JSON.parse(await readFile(snapshotTarget, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      fail(`missing ${path.relative(repositoryDir, snapshotTarget)}; run generate:api with --write-snapshot after a verified build`);
    }
    throw error;
  }
}

function pagePath(locale, route) {
  // Astro preserves root-relative Markdown links verbatim. The documentation
  // portal is a GitHub Pages project site, so every internal link must include
  // the repository base path instead of resolving from gj-kit.github.io/.
  const relativeRoute = route.replace(/^\/+/, '');
  return locale === 'ko'
    ? `${siteBasePath}/ko/${relativeRoute}`
    : `${siteBasePath}/${relativeRoute}`;
}

function markdownLink(locale, route, label) {
  return `[${label}](${pagePath(locale, route)})`;
}

function fenced(language, source) {
  return `\`\`\`${language}\n${source.trim()}\n\`\`\``;
}

function frontmatter({ title, description, order, hidden = false, template = 'doc' }) {
  const fields = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `template: ${template}`,
    `sidebar: { order: ${order}, hidden: ${hidden} }`,
    '---',
  ];
  return fields.join('\n');
}

function peerTable(entry) {
  const peers = Object.entries(entry.peerDependencies);
  if (peers.length === 0) return 'This package has no peer dependencies.';
  return [
    '| Peer | Supported range | Required for |',
    '| --- | --- | --- |',
    ...peers.map(([name, range]) => {
      const optional = entry.peerDependenciesMeta[name]?.optional === true;
      return `| \`${name}\` | \`${range}\` | ${optional ? 'documented optional subpaths only' : 'the package integration'} |`;
    }),
  ].join('\n');
}

function peerTableKo(entry) {
  const peers = Object.entries(entry.peerDependencies);
  if (peers.length === 0) return '이 패키지는 peer dependency가 없습니다.';
  return [
    '| Peer | 지원 범위 | 필요한 위치 |',
    '| --- | --- | --- |',
    ...peers.map(([name, range]) => {
      const optional = entry.peerDependenciesMeta[name]?.optional === true;
      return `| \`${name}\` | \`${range}\` | ${optional ? '문서화된 optional subpath에서만' : '패키지 통합'} |`;
    }),
  ].join('\n');
}

function entryLabel(entry) {
  return entry.subpath === '.' ? 'Root entry' : entry.subpath;
}

function apiRoute(pkg, entry, symbol) {
  return `api/${pkg.slug}/${entry.id}/${symbol.slug}/`;
}

function packageRoute(slug) {
  return `packages/${slug}/`;
}

function packageIndexRoute(slug) {
  return `api/${slug}/`;
}

function renderRoot(snapshot, locale) {
  const korean = locale === 'ko';
  const title = korean ? 'GJ Kit 라이브러리 문서' : 'GJ Kit library documentation';
  const description = korean
    ? 'Expo, React Native, NestJS, Toss Payments를 위한 재사용 가능한 TypeScript 라이브러리입니다.'
    : 'Reusable TypeScript libraries for Expo, React Native, NestJS, and Toss Payments.';
  const groups = new Map();
  for (const entry of snapshot.packages) {
    const product = packageBySlug.get(entry.slug);
    const category = product.category[locale];
    const current = groups.get(category) ?? [];
    current.push({ entry, product });
    groups.set(category, current);
  }
  const sections = [...groups.entries()].map(([category, entries]) => {
    const rows = entries.map(({ entry, product }) => {
      const link = markdownLink(locale, packageRoute(entry.slug), `\`${entry.name}\``);
      return `| ${link} | ${product.description[locale]} | \`${entry.version}\` |`;
    });
    return `## ${category}\n\n| Package | What it is | npm latest |\n| --- | --- | --- |\n${rows.join('\n')}`;
  });
  const chooser = korean
    ? '각 패키지 페이지에서 설치 명령, Golden path, peer/플랫폼 경계, API reference를 확인하세요. API reference는 현재 npm latest의 생성된 선언 파일만 표시합니다.'
    : 'Open a package page for its install command, golden path, peer/platform boundary, and API reference. API reference is generated only from the current npm-latest declaration snapshot.';
  const machineIndexPath = (path) => (korean ? `../${path}` : path);
  return [
    frontmatter({ title, description, order: 0, template: 'splash' }),
    description,
    '',
    chooser,
    '',
    korean
      ? '## 빠른 선택\n\n- Expo·React Native 화면과 접근성 프리미티브: `@gj-kit/expo-ui`\n- 미디어 파일, 업로드, 기기 라이브러리: `@gj-kit/expo-media`\n- 토큰 lifecycle: `@gj-kit/expo-auth`\n- HealthKit·Health Connect: `@gj-kit/expo-workouts`\n- Nest 운영 작업·알림: `@gj-kit/nest-operations-jobs`, `@gj-kit/nest-notifications`\n- 결제, Nest 조립, PostgreSQL store: `@gj-kit/toss-payments` 계열'
      : '## Choose a starting point\n\n- Expo and React Native UI primitives: `@gj-kit/expo-ui`\n- Media files, uploads, and device libraries: `@gj-kit/expo-media`\n- Token lifecycle: `@gj-kit/expo-auth`\n- HealthKit and Health Connect: `@gj-kit/expo-workouts`\n- Nest operations and notifications: `@gj-kit/nest-operations-jobs`, `@gj-kit/nest-notifications`\n- Payments, Nest composition, and PostgreSQL stores: the `@gj-kit/toss-payments` family',
    '',
    ...sections,
    '',
    korean
      ? `## 에이전트·자동화\n\n사람이 읽는 페이지 외에 [llms.txt](${machineIndexPath('llms.txt')})와 [API JSON index](${machineIndexPath('api/index.json')})를 제공합니다. 자동화는 반드시 JSON의 package version과 import path를 확인하세요.`
      : `## Agents and automation\n\nAlongside these pages, GJ Kit publishes [llms.txt](${machineIndexPath('llms.txt')}) and an [API JSON index](${machineIndexPath('api/index.json')}). Automation should always check the JSON package version and import path.`,
  ].join('\n');
}

function renderPackage(snapshotPackage, locale, index) {
  const product = packageBySlug.get(snapshotPackage.slug);
  const quickStart = quickStartBySlug[product.slug]?.[locale];
  if (!quickStart) fail(`missing ${locale} quick start for ${product.name}`);
  const korean = locale === 'ko';
  const apiLink = markdownLink(locale, packageIndexRoute(product.slug), korean ? '전체 API reference' : 'complete API reference');
  const related = product.related
    .map((slug) => {
      const relatedProduct = packageBySlug.get(slug);
      return relatedProduct ? markdownLink(locale, packageRoute(slug), `\`${relatedProduct.name}\``) : null;
    })
    .filter(Boolean)
    .join(', ');
  const engines = Object.entries(snapshotPackage.engines)
    .map(([name, range]) => `\`${name} ${range}\``)
    .join(', ') || (korean ? '별도 엔진 제한 없음' : 'No additional engine restriction');
  const entryRows = snapshotPackage.entries.map((entry) => {
    const href = pagePath(locale, `${packageIndexRoute(product.slug)}#${entry.id}`);
    return `| [\`${entryLabel(entry)}\`](${href}) | ${entry.symbols.length} |`;
  });
  const title = product.name;
  return [
    frontmatter({ title, description: product.description[locale], order: index + 1 }),
    product.description[locale],
    '',
    `> ${korean ? '현재 npm 최신판' : 'Current npm latest'}: \`${snapshotPackage.version}\``,
    '',
    `## ${korean ? '사용할 때' : 'Use it when'}`,
    product.when[locale],
    '',
    `## ${korean ? '사용하지 않을 때' : 'Do not use it when'}`,
    product.avoid[locale],
    '',
    `## ${korean ? 'Golden path' : 'Golden path'}`,
    `> **${korean ? '완료 상태' : 'Outcome'}:** ${quickStart.outcome}`,
    '',
    `### 1. ${korean ? '설치' : 'Install'}`,
    fenced('sh', `pnpm add ${product.name}`),
    '',
    `### 2. ${korean ? '앱이 소유할 경계를 정합니다' : 'Keep the app-owned boundary explicit'}`,
    quickStart.boundary,
    '',
    `### 3. ${korean ? '최소 연결부터 시작합니다' : 'Start with the smallest integration'}`,
    korean
      ? '먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.'
      : 'Copy this first, then replace only the app-owned values named above.',
    '',
    fenced(product.slug === 'expo-ui' ? 'tsx' : 'ts', product.code),
    '',
    `## ${korean ? '환경과 peer' : 'Runtime and peers'}`,
    `${korean ? '엔진' : 'Engines'}: ${engines}`,
    '',
    korean ? peerTableKo(snapshotPackage) : peerTable(snapshotPackage),
    '',
    `## ${korean ? '공개 subpath' : 'Public subpaths'}`,
    '| Entry | Exported symbols |\n| --- | --- |\n' + entryRows.join('\n'),
    '',
    `## ${korean ? '안전 경계' : 'Safety boundary'}`,
    product.safety[locale],
    '',
    `## ${korean ? 'API reference' : 'API reference'}`,
    korean
      ? `${apiLink}에는 선언 파일에서 생성한 모든 공개 함수, 클래스, 타입, 상수, 오류 계약이 있습니다. 각 항목은 import path, release signature, package version을 표시합니다.`
      : `${apiLink} contains every public function, class, type, constant, and error contract generated from release declarations. Each item shows its import path, release signature, and package version.`,
    '',
    `## ${korean ? '관련 패키지' : 'Related packages'}`,
    related || (korean ? '없음' : 'None'),
    '',
    `[npm](https://www.npmjs.com/package/${product.name}) · [GitHub](${REPOSITORY_URL}/tree/main/${product.slug})`,
  ].join('\n');
}

function renderApiIndex(snapshotPackage, locale, order) {
  const product = packageBySlug.get(snapshotPackage.slug);
  const korean = locale === 'ko';
  const entrySections = snapshotPackage.entries.map((entry) => {
    const items = entry.symbols.map((symbol) => {
      const route = apiRoute(snapshotPackage, entry, symbol);
      return `| ${markdownLink(locale, route, `\`${symbol.name}\``)} | ${symbol.kind} |`;
    });
    return [
      `<a id="${entry.id}"></a>`,
      `## \`${entryLabel(entry)}\``,
      '',
      korean
        ? `Import: \`${product.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}\``
        : `Import: \`${product.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}\``,
      '',
      '| Symbol | Kind |\n| --- | --- |\n' + items.join('\n'),
    ].join('\n');
  });
  return [
    frontmatter({
      title: `${product.name} API`,
      description: korean
        ? `${product.name}의 npm 최신 선언 파일에서 생성한 전체 공개 API입니다.`
        : `Complete public API generated from the npm-latest declarations for ${product.name}.`,
      order,
    }),
    korean
      ? `이 reference는 \`${snapshotPackage.version}\` release declaration snapshot에서 생성되었습니다. 미공개 main API는 표시하지 않습니다.`
      : `This reference is generated from the \`${snapshotPackage.version}\` release declaration snapshot. Unpublished main APIs are not shown.`,
    '',
    ...entrySections,
  ].join('\n');
}

function renderSymbol(snapshotPackage, entry, symbol, locale) {
  const korean = locale === 'ko';
  const packageImport = `${snapshotPackage.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;
  const original = symbol.sourceDocumentation && korean
    ? `\n\n## 구현 주석\n\n${symbol.sourceDocumentation}`
    : '';
  return [
    frontmatter({
      title: `${symbol.name} — ${snapshotPackage.name}`,
      description: korean
        ? `${packageImport}에서 export하는 ${symbol.kind} ${symbol.name}의 API 명세입니다.`
        : `API specification for the ${symbol.kind} ${symbol.name} exported from ${packageImport}.`,
      order: 1,
      hidden: true,
    }),
    korean
      ? `\`${packageImport}\`에서 공개하는 ${symbol.kind}입니다. package version \`${snapshotPackage.version}\`의 release declaration을 그대로 표시합니다.`
      : `A public ${symbol.kind} from \`${packageImport}\`. The signature below is taken directly from the \`${snapshotPackage.version}\` release declaration.`,
    '',
    `## ${korean ? '검증된 import 예제' : 'Verified import example'}`,
    fenced('ts', `import { ${symbol.name} } from '${packageImport}';`),
    '',
    korean ? '## 시그니처, 매개변수, 반환 타입' : '## Signature, parameters, and return type',
    fenced('ts', symbol.declaration),
    '',
    korean
      ? '이 선언은 매개변수, optionality, 제네릭, 반환값, 공개 union/type 계약의 정본입니다. 호출 전 필요한 환경·권한·오류 경계는 패키지 Golden path와 이 subpath의 import 조건을 함께 확인하세요.'
      : 'This declaration is the source of truth for parameters, optionality, generics, return values, and public union/type contracts. Check the package golden path and this subpath’s import conditions for required environment, permission, and error boundaries before calling it.',
    '',
    `## ${korean ? 'Release context' : 'Release context'}`,
    `- ${korean ? '패키지' : 'Package'}: \`${snapshotPackage.name}\``,
    `- ${korean ? '버전' : 'Version'}: \`${snapshotPackage.version}\``,
    `- ${korean ? '공개 entry' : 'Public entry'}: \`${entry.subpath}\``,
    `- ${korean ? '소스' : 'Source'}: [GitHub](${REPOSITORY_URL}/tree/main/${snapshotPackage.slug})`,
    original,
  ].join('\n');
}

async function write(relativePath, content) {
  const destination = path.join(generatedDocsDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content.trimEnd() + '\n', 'utf8');
}

function llmsText(snapshot) {
  const packageLines = snapshot.packages.map((pkg) => {
    const entryLines = pkg.entries.map((entry) => {
      const importPath = `${pkg.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`;
      return `- ${importPath}: ${entry.symbols.map((symbol) => symbol.name).join(', ')}`;
    });
    return `## ${pkg.name} ${pkg.version}\nDocumentation: ${SITE_URL}/packages/${pkg.slug}/\nAPI JSON: ${SITE_URL}/api/${pkg.slug}.json\n${entryLines.join('\n')}`;
  });
  return [
    '# GJ Kit',
    '',
    'GJ Kit publishes reusable TypeScript libraries. Use the npm-latest version recorded per package below; do not infer undocumented imports or use deep internal paths.',
    '',
    ...packageLines,
    '',
    `Repository: ${REPOSITORY_URL}`,
  ].join('\n');
}

function llmsFullText(snapshot) {
  return [
    '# GJ Kit API reference',
    '',
    'This document is generated from public npm-release declaration snapshots. Each package section lists only documented public imports.',
    '',
    ...snapshot.packages.flatMap((pkg) => [
      `## ${pkg.name} ${pkg.version}`,
      ...pkg.entries.flatMap((entry) => [
        `### ${pkg.name}${entry.subpath === '.' ? '' : entry.subpath.slice(1)}`,
        ...entry.symbols.map((symbol) => `#### ${symbol.name}\n\`\`\`ts\n${symbol.declaration}\n\`\`\``),
      ]),
    ]),
  ].join('\n');
}

async function writeMachineFiles(snapshot) {
  const apiDir = path.join(publicDir, 'api');
  await mkdir(apiDir, { recursive: true });
  await writeFile(path.join(publicDir, 'llms.txt'), llmsText(snapshot), 'utf8');
  await writeFile(path.join(publicDir, 'llms-full.txt'), llmsFullText(snapshot), 'utf8');
  await writeFile(
    path.join(apiDir, 'index.json'),
    stable({
      schemaVersion: snapshot.schemaVersion,
      generatedFrom: 'npm-latest release snapshots',
      packages: snapshot.packages.map((pkg) => ({
        name: pkg.name,
        version: pkg.version,
        documentation: `${SITE_URL}/packages/${pkg.slug}/`,
        api: `${SITE_URL}/api/${pkg.slug}.json`,
      })),
    }),
    'utf8',
  );
  for (const pkg of snapshot.packages) {
    await writeFile(path.join(apiDir, `${pkg.slug}.json`), stable(pkg), 'utf8');
  }
}

async function renderPortal(snapshot) {
  await rm(generatedDocsDir, { recursive: true, force: true });
  for (const locale of ['en', 'ko']) {
    const prefix = locale === 'ko' ? 'ko/' : '';
    await write(`${prefix}index.md`, renderRoot(snapshot, locale));
    for (const [index, snapshotPackage] of snapshot.packages.entries()) {
      await write(`${prefix}packages/${snapshotPackage.slug}/index.md`, renderPackage(snapshotPackage, locale, index));
      await write(`${prefix}api/${snapshotPackage.slug}/index.md`, renderApiIndex(snapshotPackage, locale, index));
      for (const entry of snapshotPackage.entries) {
        for (const symbol of entry.symbols) {
          await write(
            `${prefix}${apiRoute(snapshotPackage, entry, symbol)}index.md`,
            renderSymbol(snapshotPackage, entry, symbol, locale),
          );
        }
      }
    }
  }
  await writeMachineFiles(snapshot);
}

if (writeSnapshot) {
  const snapshot = await createSnapshot();
  await mkdir(snapshotsDir, { recursive: true });
  await writeFile(snapshotTarget, stable(snapshot), 'utf8');
}

const snapshot = await loadSnapshot();
if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.packages)) {
  fail(`${path.relative(repositoryDir, snapshotTarget)} has an unsupported schema`);
}
await renderPortal(snapshot);
console.log(`Generated GJ Kit portal from ${path.relative(repositoryDir, snapshotTarget)} (${snapshot.packages.length} packages).`);
