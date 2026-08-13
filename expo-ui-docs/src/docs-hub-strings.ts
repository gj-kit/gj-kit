import type { Locale } from './locale';

/**
 * 문서 허브(`/docs`)의 본문 카피. 랜딩과 마찬가지로 JSX에 박혀 있던 문구를
 * 로케일 전환이 가능하도록 뽑아 왔다.
 */
export type DocsHubStrings = {
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly schemaTitle: string;
  readonly schemaDescription: string;

  readonly homeLabel: string;
  readonly brandMeta: string;

  readonly navStart: string;
  readonly navTheme: string;
  readonly navComponents: string;
  readonly navInsets: string;
  readonly navTailwind: string;
  readonly navContracts: string;

  readonly sidebarEyebrow: string;
  readonly sidebarNpmLink: string;
  readonly sidebarMeta: (stable: number, preview: number) => string;
  readonly sidebarMetaAllReleased: (stable: number) => string;

  readonly heroBadge: (version: string, count: number) => string;
  readonly heroLicense: string;
  readonly heroTitleTop: string;
  readonly heroTitleBottom: string;
  readonly heroCopy: (version: string, released: number, preview: number) => string;
  readonly heroCopyAllReleased: (version: string, released: number) => string;
  readonly heroCopyCommand: string;
  readonly heroComponentsLink: (count: number) => string;
  readonly heroGuideLink: string;
  readonly heroNpmLink: string;

  readonly copyButton: string;
  readonly copyCodeLabel: (label: string) => string;
  readonly copySuccess: string;
  readonly copyUnavailable: string;
  readonly copyFailed: string;

  readonly quickStartEyebrow: string;
  readonly quickStartTitle: string;
  readonly quickStartDescription: string;
  readonly quickStartTerminalLabel: string;
  readonly quickStartCalloutTitle: string;
  readonly quickStartCalloutBody: string;
  readonly quickStartCode: string;

  readonly foundationEyebrow: string;
  readonly foundationTitle: string;
  readonly foundationDescription: string;
  readonly foundationStats: readonly (readonly [string, string])[];
  readonly foundationCardOne: { readonly title: string; readonly body: string };
  readonly foundationCardTwo: { readonly title: string; readonly body: string };
  readonly themeCode: string;
  readonly providerCode: string;

  readonly componentsEyebrow: string;
  readonly componentsTitle: (count: number) => string;
  readonly componentsDescription: string;
  readonly componentsCountLabel: string;
  readonly componentsCountCopy: string;
  readonly componentsCalloutTitle: string;
  readonly componentsCalloutBody: string;
  readonly componentsCode: string;
  readonly componentGroupDescriptions: Readonly<Record<ComponentGroupKey, string>>;

  readonly insetsEyebrow: string;
  readonly insetsTitle: string;
  readonly insetsDescription: string;
  readonly insetsPeerLabel: string;
  readonly insetsKeyboardLabel: string;
  readonly insetsApi: readonly (readonly [string, string])[];
  readonly insetsCode: string;
  readonly keyboardCode: string;

  readonly tailwindEyebrow: string;
  readonly tailwindTitle: string;
  readonly tailwindDescription: string;
  readonly tailwindCardOne: { readonly title: string; readonly body: string };
  readonly tailwindCardTwo: { readonly title: string; readonly body: string };
  readonly tailwindCalloutTitle: string;
  readonly tailwindCalloutBody: string;

  readonly contractsEyebrow: string;
  readonly contractsTitle: string;
  readonly contractsDescription: string;
  readonly contractsProof: readonly (readonly [string, string])[];
  readonly contractsCalloutTitle: string;
  readonly contractsCalloutBody: string;
  readonly contractsCode: string;
  readonly contractItems: readonly (readonly [string, string])[];

  readonly footerTagline: string;
  readonly footerHome: string;
  readonly footerComponents: string;
};

export type ComponentGroupKey =
  | 'Foundation'
  | 'Actions'
  | 'Inputs & Navigation'
  | 'Selection'
  | 'Controls'
  | 'Layout'
  | 'Feedback'
  | 'Status & Progress'
  | 'Display & Disclosure'
  | 'Data'
  | 'Overlay';

const en: DocsHubStrings = {
  metaTitle: '@gj-kit/expo-ui docs | Install, theming, component API',
  metaDescription:
    'From install to createThemes, UiProvider, the Expo and React Native components, safe-area and keyboard utilities, and the Tailwind preset — all in real TypeScript examples.',
  schemaTitle: '@gj-kit/expo-ui documentation',
  schemaDescription: 'Install, theming, component API, and platform utilities',

  homeLabel: 'Go to the home page',
  brandMeta: 'Documentation',

  navStart: 'Getting started',
  navTheme: 'Theme & Provider',
  navComponents: 'Components',
  navInsets: 'Insets & Keyboard',
  navTailwind: 'Tailwind',
  navContracts: 'Type contracts',

  sidebarEyebrow: 'DOCUMENTATION',
  sidebarNpmLink: 'View on npm ↗',
  sidebarMeta: (stable, preview) => `${stable} stable · ${preview} preview\nESM + CJS · MIT`,
  sidebarMetaAllReleased: (stable) => `${stable} components · all published\nESM + CJS · MIT`,

  heroBadge: (version, count) => `DOCS · npm v${version} · ${count} source components`,
  heroLicense: 'MIT · React Native',
  heroTitleTop: 'Expo UI components:',
  heroTitleBottom: 'start fast, scale safely.',
  heroCopy: (version, released, preview) =>
    `Documents the ${released} components published in npm v${version} alongside ${preview} source previews. Source-only pages stay out of the search index, and token-based light and dark themes plus device-edge utilities share one type-safe API.`,
  heroCopyAllReleased: (version, released) =>
    `Documents all ${released} components published in npm v${version}. Every one of them is installable today, and token-based light and dark themes plus device-edge utilities share one type-safe API.`,
  heroCopyCommand: 'Copy the install command',
  heroComponentsLink: (count) => `${count} components`,
  heroGuideLink: 'Getting started guide',
  heroNpmLink: 'npm package ↗',

  copyButton: 'Copy',
  copyCodeLabel: (label) => `Copy the ${label} code`,
  copySuccess: 'Copied to clipboard.',
  copyUnavailable: 'Select the code and copy it manually.',
  copyFailed: 'Copy failed. Select the code and copy it manually.',

  quickStartEyebrow: '01 · QUICK START',
  quickStartTitle: 'One line to install, a few more for your first component.',
  quickStartDescription:
    'A default light theme and English strings are built in, so ordinary components and a single Sheet or Dialog work without a Provider. Add a root UiProvider once you need your own brand, other languages, Menu/Select/Popover/Tooltip, or nested Sheet and Dialog ordering.',
  quickStartTerminalLabel: 'Terminal',
  quickStartCalloutTitle: 'Support baseline',
  quickStartCalloutBody:
    'React 18+, React Native 0.79+, and Node.js 20+ as peer and engine requirements. There are no Expo-only native modules.',
  quickStartCode: `import { Button } from '@gj-kit/expo-ui';

export function SaveButton() {
  return (
    <Button
      label="Save"
      onPress={() => console.log('saved')}
    />
  );
}`,

  foundationEyebrow: '02 · FOUNDATION',
  foundationTitle: 'Theme and Provider make one design language.',
  foundationDescription:
    'createThemes applies the shared overrides first, then the light and dark overrides, producing a complete ThemePair. The root UiProvider supplies the scheme, strings, icons, and the overlay environment for Menu, Select, Popover, Tooltip, and Sheet; nested Providers reuse the outer stack and tooltip coordinator.',
  foundationStats: [
    ['31', 'semantic color roles'],
    ['7', 'typography roles'],
    ['2', 'built-in schemes'],
    ['0', 'direct dependencies'],
  ],
  foundationCardOne: {
    title: 'Light and dark, together',
    body: 'A ThemePair always hands you both schemes fully built. Pass a single Theme and the scheme is pinned to it.',
  },
  foundationCardTwo: {
    title: 'Strings and icons stay yours',
    body: 'Inject koStrings/enStrings and the RenderIcon slots from one Provider. Reach for OverlayProvider only in a standalone overlay tree with no UiProvider.',
  },
  themeCode: `// src/theme.ts
import { createThemes } from '@gj-kit/expo-ui/theme';

export const themes = createThemes({
  shared: { radius: { sm: 10 } },
  light: {
    colors: {
      primary: '#1769C2',
      primaryStrong: '#0E5CAD',
    },
  },
  dark: {
    colors: { primary: '#5C9EEA', primaryStrong: '#6BAAF0' },
  },
});`,
  providerCode: `import { UiProvider, enStrings } from '@gj-kit/expo-ui';
import { themes } from '../src/theme';

export default function RootLayout() {
  return (
    <UiProvider theme={themes} strings={enStrings}>
      {/* Also provides the overlay environment for Menu, Select, Popover, Tooltip, and Sheet. */}
    </UiProvider>
  );
}`,

  componentsEyebrow: '03 · COMPONENTS',
  componentsTitle: (count) => `${count} small parts, one consistent system.`,
  componentsDescription:
    'Components do not take ownership of your app structure. They give you tokens and clear prop contracts, and leave screen flow and domain composition to you.',
  componentsCountLabel: 'source components',
  componentsCountCopy:
    'The list below is every visual component actually exported from the root entry today.',
  componentsCalloutTitle: 'Overlay semantics that fit the platform',
  componentsCalloutBody:
    'Menu gives you menuitem/checkbox focus and typeahead on the web; Select gives you a combobox and listbox that keep focus on the trigger. Popover adapts from a web non-modal rich dialog to a native adaptive Dialog on an owned trigger, and Tooltip from a web visual description to a native accessibilityHint on an owned icon action. Sheet connects a bottom surface on small screens to a logical side panel on wide ones through the same controlled contract. A public Portal/Host/asChild, submenus, searchable and multi-select Select, and a drag/snap BottomSheet adapter are not contracted yet.',
  componentsCode: `import { useState } from 'react';
import { Select, Slider, ToggleGroup } from '@gj-kit/expo-ui';

const densityItems = [
  { label: 'Spacious', value: 'spacious' },
  { label: 'Default', value: 'comfortable' },
  { label: 'Compact', value: 'compact' },
] as const;

const channelItems = [
  { label: 'Stable', value: 'stable' },
  { label: 'Preview', value: 'preview' },
] as const;

export function ReadingControls() {
  const [fontSize, setFontSize] = useState(16);
  const [density, setDensity] = useState<'spacious' | 'comfortable' | 'compact'>('comfortable');
  const [channel, setChannel] = useState<'stable' | 'preview' | null>('stable');
  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <>
      <Slider
        value={fontSize}
        min={12}
        max={24}
        step={1}
        accessibilityLabel="Body text size"
        onValueChange={setFontSize}
      />
      <ToggleGroup
        selectionMode="single"
        value={density}
        onValueChange={(next) => next && setDensity(next)}
        accessibilityLabel="List density"
        items={densityItems}
        allowEmpty={false}
      />
      <Select
        label="Release channel"
        placeholder="Choose a channel"
        items={channelItems}
        value={channel}
        onValueChange={setChannel}
        open={selectOpen}
        onOpenChange={(next) => setSelectOpen(next)}
      />
    </>
  );
}`,
  componentGroupDescriptions: {
    Foundation: 'Semantic typography and color roles keep every screen speaking the same way.',
    Actions: 'Seven intent-revealing variants with explicit accessibility contracts.',
    'Inputs & Navigation': 'Input state and current position, expressed through consistent tokens.',
    Selection: 'Composable primitives from a selection mark to a select-all row.',
    Controls: 'Controlled form primitives with the semantics and keyboard behavior built in.',
    Layout: 'The base structure for page width, sections, surfaces, and bottom actions.',
    Feedback: 'Loading, empty, error, and short-lived notices — all in one language.',
    'Status & Progress':
      'Persistent status messages and determinate or indeterminate progress, stated precisely.',
    'Display & Disclosure': 'Compose identity, separators, list rows, and disclosure structures.',
    Data: 'Row and column semantics, sort requests, and selection state, adapted per platform.',
    Overlay: 'Overlays with naming, focus, dismiss reasons, and per-platform semantics.',
  },

  insetsEyebrow: '04 · DEVICE EDGES',
  insetsTitle: 'Safe area and the keyboard, as composable utilities.',
  insetsDescription:
    'The /insets entry handles the bottom safe area and keyboard overlap inside Android edge-to-edge Modals. react-native-safe-area-context is an optional peer, needed only when you use the hooks.',
  insetsPeerLabel: 'Optional peer for Expo',
  insetsKeyboardLabel: 'Keyboard utilities',
  insetsApi: [
    ['useBottomInset', 'Returns 0 on the web and the measured bottom inset on native.'],
    ['useBottomSheetPadding', 'Adds your design padding to the real inset.'],
    ['useModalKeyboardOverlap', 'Computes the real keyboard occlusion inside a separate Modal window.'],
    ['computeKeyboardRevealOffset', 'Computes the scroll offset that reveals the bottom of a focused input.'],
    ['nativeBottomInset / Padding', 'Pure calculation functions usable without React hooks.'],
  ],
  insetsCode: `import { Button, StickyActionBar } from '@gj-kit/expo-ui';
import { useBottomInset } from '@gj-kit/expo-ui/insets';

export function BottomBar() {
  return (
    <StickyActionBar bottomInset={useBottomInset()}>
      <Button label="Done" onPress={() => {}} />
    </StickyActionBar>
  );
}`,
  keyboardCode: `import {
  computeKeyboardRevealOffset,
  useBottomSheetPadding,
  useModalKeyboardOverlap,
} from '@gj-kit/expo-ui/insets';

const keyboardOverlap = useModalKeyboardOverlap();
const bottomPadding = useBottomSheetPadding(24);`,

  tailwindEyebrow: '05 · NATIVEWIND',
  tailwindTitle: 'Tailwind is optional; the tokens are shared.',
  tailwindDescription:
    'Styleable primitives expose both style and className extension points without depending on NativeWind itself. The /tailwind entry builds a preset from your Theme so the runtime theme and the class tokens share one source.',
  tailwindCardOne: {
    title: 'Safe in a Node context',
    body: 'The /theme and /tailwind entries import neither React nor React Native, so config files can load them directly.',
  },
  tailwindCardTwo: {
    title: 'The default prefix is ui',
    body: 'Colors, spacing, radius, the six general typography roles, elevation, and breakpoints all derive into utilities.',
  },
  tailwindCalloutTitle: 'Who owns the dark class',
  tailwindCalloutBody:
    'The preset is built from the single Theme you pass in. Runtime scheme switching belongs to useTheme, and the dark: variant on classNames stays under your NativeWind config.',

  contractsEyebrow: '06 · TYPE-SAFE BY DESIGN',
  contractsTitle: 'Make UI that cannot work hard to write.',
  contractsDescription:
    'Missing accessibility labels, buttons with no content, typo-ed token keys, and actions with no handler never reach runtime. Public type tests pin down both correct and incorrect usage.',
  contractsProof: [
    ['534', 'unit tests'],
    ['91', 'type tests'],
  ],
  contractsCalloutTitle: 'Verified against the current source',
  contractsCalloutBody:
    '534 unit tests and 91 type-contract tests pass — 625 in total — and the TypeScript/TSX examples in the README compile against the published type declarations.',
  contractsCode: `// TypeScript error: missing accessibility label
<IconButton icon={gear} onPress={openSettings} />;

// OK
<IconButton
  accessibilityLabel="Open settings"
  icon={gear}
  onPress={openSettings}
/>;

// TypeScript error: an action that does nothing
<EmptyState action={{ label: 'Add' }} />;

// OK
<EmptyState action={{ label: 'Add', onPress: create }} />;`,
  contractItems: [
    ['Theme brand', 'Rejects hand-assembled themes that never went through createTheme/createThemes.'],
    ['Accessible icon', 'accessibilityLabel is required on IconButton.'],
    ['Button content', 'A Button with neither label nor children does not compile.'],
    ['Typed tabs', 'NoInfer blocks a Tabs value that is not in items.'],
    ['Complete strings', 'Requires a complete UiStrings bundle instead of a partial one.'],
    ['Token keys', 'Rejects nonexistent spacing and color keys right where you use them.'],
    ['No legacy escape', 'A leftover unstyled prop is rejected even when routed through a spread.'],
    ['Explicit field style', 'TextField separates containerStyle from inputStyle.'],
    ['Live actions only', 'An EmptyState action requires both label and onPress.'],
    ['Semantic text color', 'Text color takes token keys only; raw colors need an explicit style.'],
    ['Labeled controls', 'Checkbox and Switch require a visible label or an accessibilityLabel.'],
    ['Progress modes', 'ProgressBar separates the number and null states and requires an accessibility label.'],
  ],

  footerTagline: 'Type-safe primitives for Expo, React Native and React Native Web.',
  footerHome: 'Home',
  footerComponents: 'Components',
};

const ko: DocsHubStrings = {
  metaTitle: '@gj-kit/expo-ui 문서 | 설치, 테마, 컴포넌트 API',
  metaDescription:
    '설치부터 createThemes, UiProvider, Expo·React Native 컴포넌트, safe-area·키보드와 Tailwind preset까지 실제 TypeScript 예제로 확인하세요.',
  schemaTitle: '@gj-kit/expo-ui 문서',
  schemaDescription: '설치, 테마, 컴포넌트 API와 플랫폼 유틸 문서',

  homeLabel: '홈으로 이동',
  brandMeta: 'Documentation',

  navStart: '시작하기',
  navTheme: 'Theme & Provider',
  navComponents: 'Components',
  navInsets: 'Insets & Keyboard',
  navTailwind: 'Tailwind',
  navContracts: 'Type contracts',

  sidebarEyebrow: 'DOCUMENTATION',
  sidebarNpmLink: 'npm에서 보기 ↗',
  sidebarMeta: (stable, preview) => `${stable} stable · ${preview} preview\nESM + CJS · MIT`,
  sidebarMetaAllReleased: (stable) => `컴포넌트 ${stable}종 · 전부 공개\nESM + CJS · MIT`,

  heroBadge: (version, count) => `DOCS · npm v${version} · ${count} source components`,
  heroLicense: 'MIT · React Native',
  heroTitleTop: 'Expo UI 컴포넌트,',
  heroTitleBottom: '빠르게 시작하고 안전하게 확장하세요.',
  heroCopy: (version, released, preview) =>
    `npm v${version}에 공개된 ${released}개와 소스 미리보기 ${preview}개를 함께 문서화합니다. 소스 전용 상세 페이지는 검색에서 제외하며, 토큰 기반 light·dark 테마와 device edge 유틸을 같은 타입 안전 API로 제공합니다.`,
  heroCopyAllReleased: (version, released) =>
    `npm v${version}에 공개된 컴포넌트 ${released}종을 모두 문서화합니다. 전부 지금 설치할 수 있으며, 토큰 기반 light·dark 테마와 device edge 유틸을 같은 타입 안전 API로 제공합니다.`,
  heroCopyCommand: '설치 명령 복사',
  heroComponentsLink: (count) => `컴포넌트 ${count}종`,
  heroGuideLink: '시작 가이드',
  heroNpmLink: 'npm 패키지 ↗',

  copyButton: '복사',
  copyCodeLabel: (label) => `${label} 코드 복사`,
  copySuccess: '클립보드에 복사했습니다.',
  copyUnavailable: '코드를 선택해 직접 복사해 주세요.',
  copyFailed: '복사하지 못했습니다. 코드를 직접 선택해 주세요.',

  quickStartEyebrow: '01 · QUICK START',
  quickStartTitle: '설치는 한 줄, 첫 컴포넌트는 몇 줄이면 충분합니다.',
  quickStartDescription:
    '기본 light theme와 영문 문구가 내장되어 있어 일반 컴포넌트와 단일 Sheet·Dialog는 Provider 없이도 시작할 수 있습니다. 앱 브랜드·한국어 문구, Menu·Select·Popover·Tooltip 또는 중첩 Sheet·Dialog 순서가 필요하면 루트 UiProvider를 두세요.',
  quickStartTerminalLabel: 'Terminal',
  quickStartCalloutTitle: '지원 기준',
  quickStartCalloutBody:
    'React 18 이상 · React Native 0.79 이상 · Node.js 20 이상을 peer 및 engine 기준으로 지원합니다. Expo 전용 native module은 없습니다.',
  quickStartCode: `import { Button } from '@gj-kit/expo-ui';

export function SaveButton() {
  return (
    <Button
      label="저장"
      onPress={() => console.log('saved')}
    />
  );
}`,

  foundationEyebrow: '02 · FOUNDATION',
  foundationTitle: 'Theme과 Provider가 하나의 설계 언어를 만듭니다.',
  foundationDescription:
    'createThemes는 shared 오버라이드 뒤에 light와 dark 오버라이드를 적용해 완성된 ThemePair를 만듭니다. 루트 UiProvider는 스킴·문구·아이콘과 Menu·Select·Popover·Tooltip·Sheet의 overlay 환경을 함께 제공하고, 중첩 Provider는 바깥 stack과 tooltip coordinator를 재사용합니다.',
  foundationStats: [
    ['31', 'semantic color roles'],
    ['7', 'typography roles'],
    ['2', 'built-in schemes'],
    ['0', 'direct dependencies'],
  ],
  foundationCardOne: {
    title: 'Light와 dark를 함께',
    body: 'ThemePair는 두 스킴을 항상 완성된 상태로 제공합니다. 단일 Theme을 넘기면 해당 스킴으로 고정됩니다.',
  },
  foundationCardTwo: {
    title: '문구와 아이콘은 앱 소유',
    body: 'koStrings·enStrings와 RenderIcon 슬롯을 Provider 한 곳에서 주입합니다. UiProvider가 없는 독립 overlay tree에서만 OverlayProvider를 직접 둡니다.',
  },
  themeCode: `// src/theme.ts
import { createThemes } from '@gj-kit/expo-ui/theme';

export const themes = createThemes({
  shared: { radius: { sm: 10 } },
  light: {
    colors: {
      primary: '#1769C2',
      primaryStrong: '#0E5CAD',
    },
  },
  dark: {
    colors: { primary: '#5C9EEA', primaryStrong: '#6BAAF0' },
  },
});`,
  providerCode: `import { UiProvider, koStrings } from '@gj-kit/expo-ui';
import { themes } from '../src/theme';

export default function RootLayout() {
  return (
    <UiProvider theme={themes} strings={koStrings}>
      {/* Menu·Select·Popover·Tooltip·Sheet의 overlay 환경도 자동으로 제공됩니다. */}
    </UiProvider>
  );
}`,

  componentsEyebrow: '03 · COMPONENTS',
  componentsTitle: (count) => `${count}개의 작은 조각, 일관된 하나의 시스템.`,
  componentsDescription:
    '컴포넌트는 앱 구조를 대신 소유하지 않습니다. 토큰과 명확한 prop 계약을 제공하고, 화면 흐름과 도메인 조립은 앱에 남겨 둡니다.',
  componentsCountLabel: 'source components',
  componentsCountCopy: '아래 목록은 현재 루트 엔트리에서 실제 export되는 시각 컴포넌트 전체입니다.',
  componentsCalloutTitle: '플랫폼에 맞는 overlay 의미',
  componentsCalloutBody:
    'Menu는 웹에서 menuitem·checkbox focus와 typeahead를, Select는 포커스를 trigger에 유지하는 combobox·listbox를 제공합니다. Popover는 owned trigger에서 웹 non-modal rich dialog와 네이티브 adaptive Dialog로, Tooltip은 owned icon action에서 웹 시각 설명과 네이티브 accessibilityHint로 적응합니다. Sheet는 작은 화면의 bottom surface와 넓은 화면의 logical side panel을 같은 controlled 계약으로 연결합니다. public Portal·Host·asChild, submenu, 검색·다중 Select와 drag·snap BottomSheet adapter는 아직 계약하지 않습니다.',
  componentsCode: `import { useState } from 'react';
import { Select, Slider, ToggleGroup } from '@gj-kit/expo-ui';

const densityItems = [
  { label: '여유', value: 'spacious' },
  { label: '기본', value: 'comfortable' },
  { label: '압축', value: 'compact' },
] as const;

const channelItems = [
  { label: 'Stable', value: 'stable' },
  { label: 'Preview', value: 'preview' },
] as const;

export function ReadingControls() {
  const [fontSize, setFontSize] = useState(16);
  const [density, setDensity] = useState<'spacious' | 'comfortable' | 'compact'>('comfortable');
  const [channel, setChannel] = useState<'stable' | 'preview' | null>('stable');
  const [selectOpen, setSelectOpen] = useState(false);

  return (
    <>
      <Slider
        value={fontSize}
        min={12}
        max={24}
        step={1}
        accessibilityLabel="본문 글자 크기"
        onValueChange={setFontSize}
      />
      <ToggleGroup
        selectionMode="single"
        value={density}
        onValueChange={(next) => next && setDensity(next)}
        accessibilityLabel="목록 밀도"
        items={densityItems}
        allowEmpty={false}
      />
      <Select
        label="릴리스 채널"
        placeholder="채널 선택"
        items={channelItems}
        value={channel}
        onValueChange={setChannel}
        open={selectOpen}
        onOpenChange={(next) => setSelectOpen(next)}
      />
    </>
  );
}`,
  componentGroupDescriptions: {
    Foundation: '의미 기반 서체와 색 역할로 화면의 목소리를 맞춥니다.',
    Actions: '의도를 드러내는 7개 variant와 명시적인 접근성 계약.',
    'Inputs & Navigation': '입력 상태와 현재 위치를 일관된 토큰으로 표현합니다.',
    Selection: '선택 마크부터 전체 선택 행까지 조합 가능한 프리미티브.',
    Controls: '의미론과 키보드 동작까지 갖춘 controlled form primitives.',
    Layout: '페이지 폭, 섹션, 표면과 하단 액션을 위한 기본 구조.',
    Feedback: '로딩, 비어 있음, 오류와 짧은 알림까지 같은 언어로.',
    'Status & Progress': '지속형 상태 메시지와 결정·불확정 진행률을 정확히 전달합니다.',
    'Display & Disclosure': '정체성, 구분선, 목록 행과 펼침 구조를 조합합니다.',
    Data: '행·열 데이터의 의미, 정렬 요청과 선택 상태를 플랫폼에 맞게 표현합니다.',
    Overlay: '명명·포커스·dismiss 이유와 플랫폼별 의미를 갖춘 overlay.',
  },

  insetsEyebrow: '04 · DEVICE EDGES',
  insetsTitle: 'Safe area와 키보드도 조합 가능한 유틸로.',
  insetsDescription:
    '/insets 엔트리는 하단 safe-area와 Android edge-to-edge Modal의 키보드 겹침을 다룹니다. 훅을 사용할 때만 react-native-safe-area-context가 optional peer로 필요합니다.',
  insetsPeerLabel: 'Optional peer for Expo',
  insetsKeyboardLabel: 'Keyboard utilities',
  insetsApi: [
    ['useBottomInset', '웹에서는 0, native에서는 실측 하단 inset을 반환합니다.'],
    ['useBottomSheetPadding', '디자인 여백과 실제 inset을 더합니다.'],
    ['useModalKeyboardOverlap', '별도 Modal 윈도우의 실제 키보드 가림 높이를 계산합니다.'],
    ['computeKeyboardRevealOffset', '포커스 입력의 아래쪽을 드러낼 스크롤 위치를 계산합니다.'],
    ['nativeBottomInset / Padding', 'React 훅 없이 사용할 수 있는 순수 계산 함수입니다.'],
  ],
  insetsCode: `import { Button, StickyActionBar } from '@gj-kit/expo-ui';
import { useBottomInset } from '@gj-kit/expo-ui/insets';

export function BottomBar() {
  return (
    <StickyActionBar bottomInset={useBottomInset()}>
      <Button label="완료" onPress={() => {}} />
    </StickyActionBar>
  );
}`,
  keyboardCode: `import {
  computeKeyboardRevealOffset,
  useBottomSheetPadding,
  useModalKeyboardOverlap,
} from '@gj-kit/expo-ui/insets';

const keyboardOverlap = useModalKeyboardOverlap();
const bottomPadding = useBottomSheetPadding(24);`,

  tailwindEyebrow: '05 · NATIVEWIND',
  tailwindTitle: 'Tailwind는 선택하고, 토큰은 공유하세요.',
  tailwindDescription:
    '스타일링 가능한 프리미티브는 style과 className 확장 지점을 제공하며 NativeWind 자체에는 의존하지 않습니다. /tailwind 엔트리는 Theme에서 preset을 만들어 런타임 테마와 클래스 토큰의 출처를 맞춥니다.',
  tailwindCardOne: {
    title: 'Node 컨텍스트에서 안전',
    body: '/theme과 /tailwind 엔트리는 React와 React Native를 import하지 않아 설정 파일에서 바로 불러올 수 있습니다.',
  },
  tailwindCardTwo: {
    title: '기본 prefix는 ui',
    body: '색, spacing, radius, 6개 일반 typography role, elevation과 breakpoint가 유틸리티로 파생됩니다.',
  },
  tailwindCalloutTitle: '다크 클래스의 정본',
  tailwindCalloutBody:
    'preset은 전달한 단일 Theme에서 만들어집니다. 런타임 스킴 전환은 useTheme이 담당하고, className의 dark: 전환은 NativeWind 설정에서 앱이 관리합니다.',

  contractsEyebrow: '06 · TYPE-SAFE BY DESIGN',
  contractsTitle: '동작하지 않는 UI를 만들기 어렵게.',
  contractsDescription:
    '접근성 라벨 누락, 내용 없는 버튼, 오타 난 토큰 키, 핸들러 없는 액션을 런타임까지 보내지 않습니다. 공개 타입 테스트가 정상 사용과 잘못된 사용을 함께 고정합니다.',
  contractsProof: [
    ['534', 'unit tests'],
    ['91', 'type tests'],
  ],
  contractsCalloutTitle: '현재 소스에서 직접 검증했습니다',
  contractsCalloutBody:
    'unit 테스트 534개와 type-contract 테스트 91개, 총 625개가 통과하며 README의 TypeScript/TSX 예제도 배포 타입 선언을 기준으로 컴파일됩니다.',
  contractsCode: `// TypeScript error: 접근성 라벨 누락
<IconButton icon={gear} onPress={openSettings} />;

// OK
<IconButton
  accessibilityLabel="설정 열기"
  icon={gear}
  onPress={openSettings}
/>;

// TypeScript error: 동작 없는 액션
<EmptyState action={{ label: '추가' }} />;

// OK
<EmptyState action={{ label: '추가', onPress: create }} />;`,
  contractItems: [
    ['Theme brand', 'createTheme/createThemes를 거치지 않은 손조립 테마를 거부합니다.'],
    ['Accessible icon', 'IconButton의 accessibilityLabel은 필수입니다.'],
    ['Button content', 'label과 children이 모두 없는 Button은 컴파일되지 않습니다.'],
    ['Typed tabs', 'items에 없는 Tabs value 오타를 NoInfer로 차단합니다.'],
    ['Complete strings', '부분 번들 대신 완성된 UiStrings를 요구합니다.'],
    ['Token keys', '존재하지 않는 spacing·color 키를 사용 지점에서 거부합니다.'],
    ['No legacy escape', '이관 중 남은 unstyled prop은 스프레드 경유까지 거부합니다.'],
    ['Explicit field style', 'TextField는 containerStyle과 inputStyle을 구분합니다.'],
    ['Live actions only', 'EmptyState action은 label과 onPress를 함께 요구합니다.'],
    ['Semantic text color', 'Text color는 토큰 키만 받고 raw 색은 명시적인 style로만 허용합니다.'],
    ['Labeled controls', 'Checkbox와 Switch는 보이는 label 또는 accessibilityLabel을 요구합니다.'],
    ['Progress modes', 'ProgressBar는 number와 null 상태를 분리하고 접근성 라벨을 필수로 받습니다.'],
  ],

  footerTagline: 'Type-safe primitives for Expo, React Native and React Native Web.',
  footerHome: '홈',
  footerComponents: '컴포넌트',
};

const catalog: Readonly<Record<Locale, DocsHubStrings>> = { en, ko };

export function docsHubStrings(locale: Locale): DocsHubStrings {
  return catalog[locale];
}
