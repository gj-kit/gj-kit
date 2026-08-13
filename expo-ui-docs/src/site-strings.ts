import type { Locale } from './locale';

/**
 * 문서 셸과 컴포넌트 문서의 UI 문구. 카탈로그 본문(seo-catalog.json)과 달리
 * 여기 있는 것은 화면 장치의 라벨이라 코드와 함께 관리한다.
 */
type Strings = {
  readonly skipToContent: string;
  readonly homeLabel: string;
  readonly primaryNavLabel: string;
  readonly breadcrumbNavLabel: string;
  readonly adjacentNavLabel: string;
  readonly toDark: string;
  readonly toLight: string;
  readonly toKorean: string;
  readonly toEnglish: string;
  readonly languageLabel: string;

  readonly home: string;
  readonly docs: string;
  readonly components: string;
  readonly componentsCount: (count: number) => string;
  readonly accessibility: string;
  readonly theming: string;
  readonly tailwind: string;
  readonly safeArea: string;
  readonly typeSafety: string;
  readonly github: string;
  readonly changelog: string;
  readonly issues: string;
  readonly license: string;
  readonly tagline: string;

  readonly livePreview: string;
  readonly livePreviewHint: string;
  readonly sourcePreviewHint: string;
  readonly previewNote: string;
  readonly readMore: string;
  readonly copy: string;
  readonly copied: string;
  readonly copyCommand: (command: string) => string;
  readonly copyExample: string;

  readonly propsHeaderProp: string;
  readonly propsHeaderType: string;
  readonly propsHeaderRequired: string;
  readonly propsHeaderDescription: string;
  readonly required: string;
  readonly conditional: string;
  readonly conditionalHint: string;
  readonly none: string;
  readonly propsCaption: (typeName: string, total: number, req: number, cond: number) => string;
  readonly inheritsPlatformProps: string;

  readonly previous: string;
  readonly next: string;
  readonly paginationPageLabel: (page: number, current: boolean) => string;
  readonly previousComponent: (name: string) => string;
  readonly nextComponent: (name: string) => string;

  readonly releaseTitle: (version: string) => string;
  readonly releaseBody: string;

  readonly sectionPreview: (name: string) => string;
  readonly sectionWhen: (name: string) => string;
  readonly sectionInstall: string;
  readonly sectionInstallPreview: (version: string) => string;
  readonly installParagraph: (name: string) => string;
  readonly installParagraphPreview: (name: string, since: string, published: string) => string;
  readonly sectionProps: (name: string) => string;
  readonly propsParagraph: (typeName: string) => string;
  readonly sectionAccessibility: string;
  readonly accessibilityTail: string;
  readonly sectionRelated: string;

  readonly notFoundTitle: string;
  readonly notFoundDescription: string;
  readonly guideNotFoundMetaTitle: string;
  readonly guideNotFoundMetaDescription: string;
  readonly pageNotFoundMetaTitle: string;
  readonly pageNotFoundMetaDescription: string;
  readonly pageNotFoundTitle: string;
  readonly pageNotFoundDescription: string;
  readonly pageNotFoundSectionTitle: string;
  readonly pageNotFoundSectionBody: string;
  readonly routeIndexMetaTitle: string;
  readonly routeIndexMetaDescription: string;
  readonly routeIndexCrumb: string;
  readonly routeIndexTitle: string;
  readonly routeIndexDescription: string;
  readonly routeIndexSectionTitle: string;
  readonly routeIndexSectionBody: string;
  readonly routeIndexDocsTitle: string;
  readonly routeIndexDocsDescription: string;
  readonly routeIndexComponentsDescription: string;
  readonly routeIndexSitemapDescription: string;
  readonly catalogTitle: (count: number) => string;
  readonly catalogMetaTitle: (count: number) => string;
  readonly catalogMetaDescription: (count: number) => string;
  readonly catalogHeroDescription: string;
  readonly catalogPreviewBadge: (published: string, count: number) => string;
  readonly catalogBrowse: string;
  readonly catalogCategories: string;
  readonly catalogAll: string;
  readonly catalogSearchLabel: string;
  readonly catalogSearchPlaceholder: string;
  readonly catalogClearSearch: string;
  readonly catalogReleaseLabel: string;
  readonly catalogFilterAll: string;
  readonly catalogFilterStable: string;
  readonly catalogFilterPreview: string;
  readonly catalogResults: (shown: number, total: number) => string;
  readonly catalogNoResults: string;
  readonly catalogNoResultsBody: string;
  readonly catalogReset: string;
  readonly catalogCardMeta: string;
  readonly catalogFilterRegion: string;
  readonly catalogExplore: string;
  readonly catalogPrinciples: string;
  readonly catalogPreviewNote: (count: number) => string;
  readonly catalogPublishedNote: (count: number) => string;
  readonly showcaseEyebrow: string;
  readonly showcaseTitle: string;
  readonly showcaseCopy: string;
  readonly showcaseCheckboxLabel: string;
  readonly showcaseCheckboxDescription: string;
  readonly showcaseProgressLabel: string;
  readonly showcasePreviewPages: string;
  readonly showcaseToggle: string;
  readonly showcaseRecheck: string;
  readonly showcaseReadiness: string;
};

const en: Strings = {
  skipToContent: 'Skip to content',
  homeLabel: 'GJ Kit Expo UI home',
  primaryNavLabel: 'Primary documentation',
  breadcrumbNavLabel: 'Breadcrumb',
  adjacentNavLabel: 'Adjacent components',
  toDark: 'Switch to dark mode',
  toLight: 'Switch to light mode',
  toKorean: '한국어로 보기',
  toEnglish: 'View in English',
  languageLabel: 'Language',

  home: 'Home',
  docs: 'Docs',
  components: 'Components',
  componentsCount: (count) => `${count} components`,
  accessibility: 'Accessibility',
  theming: 'Theming',
  tailwind: 'Tailwind',
  safeArea: 'Safe area',
  typeSafety: 'Type safety',
  github: 'GitHub ↗',
  changelog: 'Changelog ↗',
  issues: 'Issues ↗',
  license: 'MIT ↗',
  tagline: 'Type-safe primitives for Expo and React Native.',

  livePreview: 'LIVE PREVIEW',
  livePreviewHint: 'Rendered from the installed package, not a mockup.',
  sourcePreviewHint: 'Rendered from workspace source; this API is not in npm latest yet.',
  previewNote: 'These controls really work. Press them and change the state.',
  readMore: 'Read more',
  copy: 'COPY',
  copied: 'COPIED',
  copyCommand: (command) => `Copy ${command}`,
  copyExample: 'Copy example code',

  propsHeaderProp: 'Prop',
  propsHeaderType: 'Type',
  propsHeaderRequired: 'Required',
  propsHeaderDescription: 'Description',
  required: 'required',
  conditional: 'conditional',
  conditionalHint: 'Required only in one branch of the discriminated union.',
  none: '—',
  propsCaption: (typeName, total, req, cond) =>
    `${typeName} — ${total} props · ${req} required` + (cond > 0 ? ` · ${cond} conditional` : ''),
  inheritsPlatformProps:
    'React Native props pass through as well. This table lists only the contracts this library adds.',

  previous: '← Previous',
  next: 'Next →',
  paginationPageLabel: (page, current) => `Page ${page}${current ? ' (current)' : ''}`,
  previousComponent: (name) => `Previous component: ${name}`,
  nextComponent: (name) => `Next component: ${name}`,

  releaseTitle: (version) => `v${version} preview — not installable yet`,
  releaseBody:
    'This page includes source API planned for the next release. npm latest may export the component name but not these documented additions, so use the preview after this version ships. The preview below renders from workspace source, and this page stays out of the search index until release.',

  sectionPreview: (name) => `${name} preview`,
  sectionWhen: (name) => `When to reach for ${name}`,
  sectionInstall: 'Install and minimal example',
  sectionInstallPreview: (version) => `Minimal example (available after v${version})`,
  installParagraph: (name) =>
    `Import ${name} from the package root entry, then wire it to state and events your app owns.`,
  installParagraphPreview: (name, since, published) =>
    `${name} is not on npm yet. The currently installable v${published} has no such export, so the code below will not compile. Use it after v${since} ships.`,
  sectionProps: (name) => `${name} props`,
  propsParagraph: (typeName) =>
    `This table is generated at build time from the exported ${typeName} type, so the docs cannot drift from the API.`,
  sectionAccessibility: 'Accessibility and platform behavior',
  accessibilityTail:
    'Default styling derives from the active UiProvider theme — color, spacing, radius, typography, and metric roles. The same prop contract applies on Expo, bare React Native, and React Native Web.',
  sectionRelated: 'Works well with',

  notFoundTitle: 'Component documentation not found',
  notFoundDescription: 'Check the component list for the currently published API.',
  guideNotFoundMetaTitle: 'Guide not found | GJ Kit Expo UI',
  guideNotFoundMetaDescription: 'The GJ Kit Expo UI guide you asked for does not exist.',
  pageNotFoundMetaTitle: 'Page not found | GJ Kit Expo UI',
  pageNotFoundMetaDescription: 'The GJ Kit Expo UI documentation page you asked for does not exist.',
  pageNotFoundTitle: 'We could not find that page',
  pageNotFoundDescription:
    'Check the URL, or find the currently published documentation in the component list.',
  pageNotFoundSectionTitle: 'Start over',
  pageNotFoundSectionBody:
    'The Docs and Components links in the header take you to install, theming, accessibility, and the individual API pages.',
  routeIndexMetaTitle: 'Documentation routes | GJ Kit Expo UI',
  routeIndexMetaDescription:
    'Where to find the XML sitemap for search engines and the GJ Kit Expo UI documentation routes.',
  routeIndexCrumb: 'Documentation routes',
  routeIndexTitle: 'Looking for the GJ Kit Expo UI docs?',
  routeIndexDescription:
    'This address is an Expo Router internal route. The user-facing documentation and the XML sitemap for search engines are linked below.',
  routeIndexSectionTitle: 'Go to the public docs',
  routeIndexSectionBody:
    'Every component plus the install, theming, and accessibility guides are browsable from the documentation index.',
  routeIndexDocsTitle: 'Documentation home',
  routeIndexDocsDescription: 'Install, theming, components, utilities, and type contracts.',
  routeIndexComponentsDescription:
    'Every component in the current source, with its npm release status.',
  routeIndexSitemapDescription: 'The list of canonical URLs submitted to search engines.',
  catalogTitle: (count) => `${count} Expo & React Native UI components`,
  catalogMetaTitle: (count) => `${count} Expo UI components | GJ Kit Expo UI`,
  catalogMetaDescription: (count) =>
    `Examples, accessibility behavior, theming, and release status for ${count} TypeScript UI components for Expo, React Native, and the web.`,
  catalogHeroDescription:
    'Assemble iOS, Android, and web UI from one type system and one set of theme tokens. Every page shows a live preview, a generated props table, accessibility behavior, and release status.',
  catalogPreviewBadge: (published, count) => `npm v${published} · ${count} source previews`,
  catalogBrowse: 'BROWSE',
  catalogCategories: 'Categories',
  catalogAll: 'All',
  catalogSearchLabel: 'Search components',
  catalogSearchPlaceholder: 'Button, accessibility, layout…',
  catalogClearSearch: 'Clear search',
  catalogReleaseLabel: 'Release status',
  catalogFilterAll: 'All',
  catalogFilterStable: 'npm stable',
  catalogFilterPreview: 'Preview',
  catalogResults: (shown, total) => `Found ${shown} components out of ${total}.`,
  catalogNoResults: 'No components match.',
  catalogNoResultsBody: 'Try a different search term, category, or release status.',
  catalogReset: 'Reset filters',
  catalogCardMeta: 'Preview · props · accessibility',
  catalogFilterRegion: 'Component filters',
  catalogExplore: 'Browse components',
  catalogPrinciples: 'Start from the design principles',
  catalogPreviewNote: (count) =>
    `${count} components are source-only previews. Their pages stay out of the search index until they ship to npm.`,
  catalogPublishedNote: (count) => `All ${count} components are published and installable.`,
  showcaseEyebrow: 'LIVE SOURCE PREVIEW',
  showcaseTitle: 'Design once, ship everywhere.',
  showcaseCopy: 'These controls are the real components from this workspace, not documentation chrome.',
  showcaseCheckboxLabel: 'Accessibility contract included',
  showcaseCheckboxDescription: 'Space input and type-safe state',
  showcaseProgressLabel: 'Cross-platform readiness',
  showcasePreviewPages: 'Component preview pages',
  showcaseToggle: 'Change the state',
  showcaseRecheck: 'Check again',
  showcaseReadiness: 'Cross-platform readiness',
};

const ko: Strings = {
  skipToContent: '본문으로 건너뛰기',
  homeLabel: 'GJ Kit Expo UI 홈',
  primaryNavLabel: '주요 문서',
  breadcrumbNavLabel: '현재 문서 경로',
  adjacentNavLabel: '이웃 컴포넌트',
  toDark: '다크 모드로 전환',
  toLight: '라이트 모드로 전환',
  toKorean: '한국어로 보기',
  toEnglish: 'View in English',
  languageLabel: '언어',

  home: '홈',
  docs: '문서',
  components: '컴포넌트',
  componentsCount: (count) => `컴포넌트 ${count}종`,
  accessibility: '접근성',
  theming: '테마',
  tailwind: 'Tailwind',
  safeArea: 'Safe area',
  typeSafety: '타입 안전',
  github: 'GitHub ↗',
  changelog: '변경 이력 ↗',
  issues: '이슈 ↗',
  license: 'MIT ↗',
  tagline: 'Expo와 React Native를 위한 타입 안전 프리미티브.',

  livePreview: 'LIVE PREVIEW',
  livePreviewHint: '문서용 목업이 아니라 설치된 패키지의 실제 컴포넌트입니다.',
  sourcePreviewHint: '워크스페이스 소스로 렌더한 미리보기이며 이 API는 아직 npm 최신판에 없습니다.',
  previewNote: '위 컨트롤은 실제로 동작합니다. 눌러 보고 상태를 바꿔 보세요.',
  readMore: '자세히 보기',
  copy: 'COPY',
  copied: 'COPIED',
  copyCommand: (command) => `${command} 복사`,
  copyExample: '예제 코드 복사',

  propsHeaderProp: 'Prop',
  propsHeaderType: 'Type',
  propsHeaderRequired: '필수',
  propsHeaderDescription: '설명',
  required: '필수',
  conditional: '조건부',
  conditionalHint: '판별 유니언의 특정 갈래에서만 필요합니다.',
  none: '—',
  propsCaption: (typeName, total, req, cond) =>
    `${typeName} — ${total}개 prop · 필수 ${req}개` + (cond > 0 ? ` · 조건부 ${cond}개` : ''),
  inheritsPlatformProps:
    'React Native의 기본 props도 그대로 전달됩니다. 위 표는 이 라이브러리가 추가한 계약만 보여줍니다.',

  previous: '← 이전',
  next: '다음 →',
  paginationPageLabel: (page, current) => `${page}페이지${current ? ' (현재)' : ''}`,
  previousComponent: (name) => `이전 컴포넌트: ${name}`,
  nextComponent: (name) => `다음 컴포넌트: ${name}`,

  releaseTitle: (version) => `v${version} 공개 예정 · 지금은 설치할 수 없습니다`,
  releaseBody:
    '이 페이지에는 다음 릴리스를 위해 소스에 추가된 API가 포함되어 있습니다. npm 최신판에 컴포넌트 이름이 있더라도 여기의 추가 API는 아직 없을 수 있으므로 해당 버전이 공개된 뒤 사용하세요. 아래 미리보기는 워크스페이스 소스로 렌더한 것이며, 이 페이지는 공개 전까지 검색 색인에서 제외됩니다.',

  sectionPreview: (name) => `${name} 미리보기`,
  sectionWhen: (name) => `${name} 사용 시점과 역할`,
  sectionInstall: '설치와 최소 예제',
  sectionInstallPreview: (version) => `최소 예제 (v${version} 릴리스 후 사용 가능)`,
  installParagraph: (name) =>
    `${name}: 패키지 루트 엔트리에서 import한 뒤 앱이 소유한 상태와 이벤트를 연결하세요.`,
  installParagraphPreview: (name, since, published) =>
    `${name}은 아직 npm에 없습니다. 지금 설치되는 v${published}에는 이 export가 없어 아래 코드는 컴파일되지 않습니다. v${since} 공개 후 사용하세요.`,
  sectionProps: (name) => `${name} props`,
  propsParagraph: (typeName) =>
    `아래 표는 패키지가 내보내는 ${typeName} 타입에서 빌드 시점에 생성됩니다. 문서와 API가 어긋날 수 없습니다.`,
  sectionAccessibility: '접근성과 플랫폼 동작',
  accessibilityTail:
    '기본 스타일은 현재 UiProvider 테마의 color, spacing, radius, typography, metric 역할에서 파생됩니다. Expo, bare React Native와 React Native Web에서 같은 prop 계약을 사용합니다.',
  sectionRelated: '함께 사용하는 컴포넌트',

  notFoundTitle: '컴포넌트 문서를 찾을 수 없습니다',
  notFoundDescription: '컴포넌트 목록에서 현재 공개된 API를 확인해 주세요.',
  guideNotFoundMetaTitle: '가이드를 찾을 수 없습니다 | GJ Kit Expo UI',
  guideNotFoundMetaDescription: '요청한 GJ Kit Expo UI 가이드가 없습니다.',
  pageNotFoundMetaTitle: '페이지를 찾을 수 없습니다 | GJ Kit Expo UI',
  pageNotFoundMetaDescription: '요청한 GJ Kit Expo UI 문서 페이지가 없습니다.',
  pageNotFoundTitle: '요청한 문서를 찾을 수 없습니다',
  pageNotFoundDescription: 'URL을 확인하거나 컴포넌트 목록에서 현재 공개된 문서를 찾아보세요.',
  pageNotFoundSectionTitle: '다시 시작하기',
  pageNotFoundSectionBody:
    '헤더의 Docs 또는 Components 링크를 선택하면 설치, 테마, 접근성과 개별 API 문서로 이동할 수 있습니다.',
  routeIndexMetaTitle: '문서 경로 안내 | GJ Kit Expo UI',
  routeIndexMetaDescription: '검색엔진용 XML sitemap과 GJ Kit Expo UI 문서 경로를 안내합니다.',
  routeIndexCrumb: '문서 경로 안내',
  routeIndexTitle: 'GJ Kit Expo UI 문서를 찾고 있나요?',
  routeIndexDescription:
    '이 주소는 Expo Router의 내부 경로입니다. 사용자 문서와 검색엔진용 XML sitemap은 아래 링크에서 확인하세요.',
  routeIndexSectionTitle: '공개 문서로 이동',
  routeIndexSectionBody: '전체 컴포넌트와 설치·테마·접근성 가이드는 문서 인덱스에서 탐색할 수 있습니다.',
  routeIndexDocsTitle: '문서 홈',
  routeIndexDocsDescription: '설치, 테마, 컴포넌트, 유틸리티와 타입 계약을 살펴봅니다.',
  routeIndexComponentsDescription: '현재 소스의 컴포넌트와 npm 릴리스 상태를 확인합니다.',
  routeIndexSitemapDescription: '검색엔진에 제출하는 canonical URL 목록입니다.',
  catalogTitle: (count) => `Expo·React Native UI 컴포넌트 ${count}종`,
  catalogMetaTitle: (count) => `Expo UI 컴포넌트 ${count}종 | GJ Kit Expo UI`,
  catalogMetaDescription: (count) =>
    `소스에 포함된 Expo·React Native·Web용 TypeScript UI 컴포넌트 ${count}종의 예제, 접근성, 테마 연동과 릴리스 상태를 확인하세요.`,
  catalogHeroDescription:
    '하나의 타입 시스템과 테마 토큰으로 iOS, Android, Web UI를 조립하세요. 각 문서에서 실제 렌더 미리보기, 타입에서 생성한 props 표, 접근성 동작과 릴리스 상태를 바로 확인할 수 있습니다.',
  catalogPreviewBadge: (published, count) => `npm v${published} · 소스 미리보기 ${count}종`,
  catalogBrowse: 'BROWSE',
  catalogCategories: '카테고리',
  catalogAll: '전체',
  catalogSearchLabel: '컴포넌트 검색',
  catalogSearchPlaceholder: 'Button, 접근성, 레이아웃…',
  catalogClearSearch: '검색어 지우기',
  catalogReleaseLabel: '릴리스 상태',
  catalogFilterAll: '전체',
  catalogFilterStable: 'npm stable',
  catalogFilterPreview: 'Preview',
  catalogResults: (shown, total) => `컴포넌트 ${shown}개를 찾았습니다. 전체 ${total}개 중.`,
  catalogNoResults: '일치하는 컴포넌트가 없습니다.',
  catalogNoResultsBody: '검색어나 카테고리, 릴리스 상태를 바꿔 보세요.',
  catalogReset: '필터 초기화',
  catalogCardMeta: '미리보기 · props · 접근성',
  catalogFilterRegion: '컴포넌트 필터',
  catalogExplore: '컴포넌트 탐색',
  catalogPrinciples: '설계 원칙부터 읽기',
  catalogPreviewNote: (count) =>
    `미리보기 ${count}종은 소스에만 있습니다. npm 공개 전까지 상세 페이지가 검색에서 제외됩니다.`,
  catalogPublishedNote: (count) => `${count}개 컴포넌트가 모두 공개되어 설치와 검색 색인이 가능합니다.`,
  showcaseEyebrow: 'LIVE SOURCE PREVIEW',
  showcaseTitle: '한 번 설계하고, 모든 화면에서.',
  showcaseCopy: '아래 컨트롤은 문서 장식이 아니라 현재 워크스페이스의 실제 컴포넌트입니다.',
  showcaseCheckboxLabel: '접근성 계약 포함',
  showcaseCheckboxDescription: 'Space 입력과 타입 안전 상태',
  showcaseProgressLabel: 'Cross-platform readiness',
  showcasePreviewPages: '컴포넌트 미리보기 페이지',
  showcaseToggle: '상태 바꾸기',
  showcaseRecheck: '다시 확인하기',
  showcaseReadiness: 'Cross-platform readiness',
};

const catalog: Readonly<Record<Locale, Strings>> = { en, ko };

export function siteStrings(locale: Locale): Strings {
  return catalog[locale];
}
