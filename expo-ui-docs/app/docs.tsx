import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import {
  Button,
  ContentFrame,
  Surface,
  Text,
  Toast,
  UiProvider,
  createThemes,
  koStrings,
  useTheme,
  useToastController,
} from '@gj-kit/expo-ui';
import type { ColorScheme, IconRenderProps, UiIcons } from '@gj-kit/expo-ui';
import {
  componentSeoEntries,
  componentDocsPath,
  getComponentSeoEntryByReference,
  isReleasedComponent,
  publishedPackageVersion,
} from '../src/seo-content';
import { SeoHead, breadcrumbSchema, webPageSchema } from '../src/seo';
import { useHydratedWindowWidth } from '../src/responsive';
import { LinkPressable } from '../src/site-link';
import { SITE_NAV_LINKS } from '../src/site-nav';
import { NPM_URL } from '../src/site-theme';
import { useDocumentChrome, useSiteColorScheme } from '../src/use-site-color-scheme';

const docsThemes = createThemes({
  shared: {
    colors: {
      primary: '#4F46E5',
      primaryStrong: '#3730A3',
    },
    radius: { sm: 10, md: 12, lg: 20 },
  },
  light: {
    colors: {
      background: '#F8FAFC',
      surface: '#FFFFFF',
      surfaceSubtle: '#F1F5F9',
      primarySoft: '#EEF2FF',
      line: '#E2E8F0',
      text: '#172033',
      textMuted: '#526079',
      // background/surface/surfaceSubtle 모두에서 작은 보조 텍스트가 4.5:1 이상이다.
      textSubtle: '#667085',
    },
  },
  dark: {
    colors: {
      background: '#07111F',
      surface: '#0E1B2C',
      surfaceSubtle: '#14243A',
      primary: '#818CF8',
      // 다크에서 *Strong은 더 밝아야 한다. 이전 값(#6366F1)은 surfaceSubtle 위에서
      // 3.5:1, 라이브러리 기본 warningStrong(#92400E) 폴백은 2.21:1로 AA 미달이었다.
      primaryStrong: '#A5B4FC',
      primarySoft: '#1B2552',
      dangerStrong: '#FDA4AF',
      warningStrong: '#FCD34D',
      successStrong: '#6EE7B7',
      infoStrong: '#A5B4FC',
      line: '#253650',
      text: '#F1F5F9',
      textMuted: '#AAB7CB',
      textSubtle: '#7F90AA',
      tabActive: '#F1F5F9',
      tabInactive: '#7F90AA',
    },
  },
});

function Glyph({ children, color, size }: IconRenderProps & { children: string }) {
  return <RNText style={{ color, fontSize: size, lineHeight: size }}>{children}</RNText>;
}

const docsIcons: UiIcons = {
  check: (props) => <Glyph {...props}>✓</Glyph>,
  search: (props) => <Glyph {...props}>⌕</Glyph>,
  empty: (props) => <Glyph {...props}>◇</Glyph>,
  error: (props) => <Glyph {...props}>!</Glyph>,
  toast: {
    error: (props) => <Glyph {...props}>!</Glyph>,
    success: (props) => <Glyph {...props}>✓</Glyph>,
    info: (props) => <Glyph {...props}>i</Glyph>,
    warning: (props) => <Glyph {...props}>!</Glyph>,
  },
};

type SectionId = 'start' | 'theme' | 'components' | 'insets' | 'tailwind' | 'contracts';

const SOURCE_COMPONENT_COUNT = componentSeoEntries.length;
const RELEASED_COMPONENT_COUNT = componentSeoEntries.filter(isReleasedComponent).length;
const PREVIEW_COMPONENT_COUNT = SOURCE_COMPONENT_COUNT - RELEASED_COMPONENT_COUNT;

const NAV_ITEMS: ReadonlyArray<{ id: SectionId; label: string; meta?: string }> = [
  { id: 'start', label: '시작하기' },
  { id: 'theme', label: 'Theme & Provider' },
  { id: 'components', label: 'Components', meta: String(SOURCE_COMPONENT_COUNT) },
  { id: 'insets', label: 'Insets & Keyboard' },
  { id: 'tailwind', label: 'Tailwind' },
  { id: 'contracts', label: 'Type contracts' },
];

const COMPONENT_GROUPS = [
  {
    title: 'Foundation',
    description: '의미 기반 서체와 색 역할로 화면의 목소리를 맞춥니다.',
    items: [
      { name: 'Text', detail: '7 typography roles · token color' },
    ],
  },
  {
    title: 'Actions',
    description: '의도를 드러내는 6개 variant와 명시적인 접근성 계약.',
    items: [
      { name: 'Button', detail: '6 variants · 3 sizes · loading' },
      { name: 'IconButton', detail: 'required accessibilityLabel' },
      { name: 'Link', detail: 'native anchor · destination union' },
      { name: 'FloatingActionButton', detail: 'safe-area placement · required name' },
    ],
  },
  {
    title: 'Inputs & Navigation',
    description: '입력 상태와 현재 위치를 일관된 토큰으로 표현합니다.',
    items: [
      { name: 'TextField', detail: 'label · helper · error · counter' },
      { name: 'SearchField', detail: 'localized placeholder · icon slot' },
      { name: 'FormField', detail: 'label · description · error IDREFs' },
      { name: 'Select', detail: 'web combobox · native radio surface' },
      { name: 'Tabs', detail: 'roving focus · typed panels' },
      { name: 'Collapsible', detail: 'controlled disclosure · ARIA links' },
      { name: 'Pagination', detail: 'numbered items/pages · opaque cursor' },
    ],
  },
  {
    title: 'Selection',
    description: '선택 마크부터 전체 선택 행까지 조합 가능한 프리미티브.',
    items: [
      { name: 'SelectionIndicator', detail: '16 · 18 · 20 · 24 sizes' },
      { name: 'SelectableRow', detail: 'selected and disabled states' },
      { name: 'SelectAllRow', detail: 'localized select / deselect' },
      { name: 'Chip', detail: 'action · filter · removable union' },
    ],
  },
  {
    title: 'Controls',
    description: '의미론과 키보드 동작까지 갖춘 controlled form primitives.',
    items: [
      { name: 'Checkbox', detail: 'boolean · mixed · Space activation' },
      { name: 'Switch', detail: 'native behavior · required label' },
      { name: 'RadioGroup', detail: 'typed value · roving focus · arrow keys' },
      { name: 'Slider', detail: 'single/range · 44px thumbs · RTL' },
      { name: 'ToggleGroup', detail: 'single/multiple · toolbar · roving focus' },
    ],
  },
  {
    title: 'Layout',
    description: '페이지 폭, 섹션, 표면과 하단 액션을 위한 기본 구조.',
    items: [
      { name: 'Surface', detail: 'padding · radius · elevation tokens' },
      { name: 'ContentFrame', detail: 'constrained content width' },
      { name: 'Section', detail: 'title · subtitle · actions' },
      { name: 'StickyActionBar', detail: 'bottom inset · web sticky' },
      { name: 'Card', detail: 'static semantic surface' },
      { name: 'AspectRatio', detail: 'validated media ratio' },
    ],
  },
  {
    title: 'Feedback',
    description: '로딩, 비어 있음, 오류와 짧은 알림까지 같은 언어로.',
    items: [
      { name: 'Skeleton', detail: 'animated pulse · a11y label' },
      { name: 'EmptyState', detail: 'paired action contract' },
      { name: 'ErrorState', detail: 'optional retry action' },
      { name: 'Toast', detail: '4 variants · controller hook' },
      { name: 'ToastViewport', detail: 'FIFO queue · pause/resume · live region' },
    ],
  },
  {
    title: 'Status & Progress',
    description: '지속형 상태 메시지와 결정·불확정 진행률을 정확히 전달합니다.',
    items: [
      { name: 'Badge', detail: '5 semantic variants · 2 sizes' },
      { name: 'Alert', detail: 'action · dismiss · live-region opt-in' },
      { name: 'Spinner', detail: 'localized accessible loading' },
      { name: 'ProgressBar', detail: 'determinate · null indeterminate' },
    ],
  },
  {
    title: 'Display & Disclosure',
    description: '정체성, 구분선, 목록 행과 펼침 구조를 조합합니다.',
    items: [
      { name: 'Avatar', detail: 'alt/decorative union · initials fallback' },
      { name: 'Divider', detail: 'horizontal · vertical · semantic opt-in' },
      { name: 'ListItem', detail: 'static or interactive contract' },
      { name: 'Accordion', detail: 'single · multiple · ARIA relationships' },
    ],
  },
  {
    title: 'Data',
    description: '행·열 데이터의 의미, 정렬 요청과 선택 상태를 플랫폼에 맞게 표현합니다.',
    items: [
      { name: 'DataTable', detail: 'semantic web table · native adaptive list' },
    ],
  },
  {
    title: 'Overlay',
    description: '명명·포커스·dismiss 이유와 플랫폼별 의미를 갖춘 overlay.',
    items: [
      { name: 'Dialog', detail: 'named modal · dismiss reasons · focus refs' },
      { name: 'DialogPanel', detail: 'title · description · explicit close' },
      { name: 'ConfirmActionRow', detail: 'loading-aware action pair' },
      { name: 'ActionSheet', detail: 'typed actions · bottom / center adaptation' },
      { name: 'Sheet', detail: 'rich body · mobile bottom / desktop side' },
      { name: 'Popover', detail: 'web non-modal · native adaptive dialog' },
      { name: 'Tooltip', detail: 'web visual · native accessibility hint' },
      { name: 'Menu', detail: 'web menu · native adaptive actions' },
    ],
  },
] as const;

const THEME_CODE = `// src/theme.ts
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
});`;

const PROVIDER_CODE = `import { UiProvider, koStrings } from '@gj-kit/expo-ui';
import { themes } from '../src/theme';

export default function RootLayout() {
  return (
    <UiProvider theme={themes} strings={koStrings}>
      {/* Menu·Select·Popover·Tooltip·Sheet의 overlay 환경도 자동으로 제공됩니다. */}
    </UiProvider>
  );
}`;

const QUICK_START_CODE = `import { Button } from '@gj-kit/expo-ui';

export function SaveButton() {
  return (
    <Button
      label="저장"
      onPress={() => console.log('saved')}
    />
  );
}`;

const COMPONENTS_V04_CODE = `import { useState } from 'react';
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
}`;

const INSETS_CODE = `import { Button, StickyActionBar } from '@gj-kit/expo-ui';
import { useBottomInset } from '@gj-kit/expo-ui/insets';

export function BottomBar() {
  return (
    <StickyActionBar bottomInset={useBottomInset()}>
      <Button label="완료" onPress={() => {}} />
    </StickyActionBar>
  );
}`;

const KEYBOARD_CODE = `import {
  computeKeyboardRevealOffset,
  useBottomSheetPadding,
  useModalKeyboardOverlap,
} from '@gj-kit/expo-ui/insets';

const keyboardOverlap = useModalKeyboardOverlap();
const bottomPadding = useBottomSheetPadding(24);`;

const TAILWIND_CODE = `import { createTailwindPreset } from '@gj-kit/expo-ui/tailwind';
import { themes } from './src/theme';

export const preset = createTailwindPreset(themes.light);

// presets: [preset]
// bg-ui-primary · p-ui-lg · rounded-ui-pill
// text-ui-title · shadow-ui-sm · tablet: / desktop:`;

const CONTRACT_CODE = `// TypeScript error: 접근성 라벨 누락
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
<EmptyState action={{ label: '추가', onPress: create }} />;`;

export default function DocsPage() {
  const { colorScheme, setColorScheme } = useSiteColorScheme();
  useDocumentChrome(docsThemes[colorScheme].colors.background);

  return (
    <>
      <SeoHead
        title="@gj-kit/expo-ui 문서 | 설치, 테마, 컴포넌트 API"
        description="설치부터 createThemes, UiProvider, Expo·React Native 컴포넌트, safe-area·키보드와 Tailwind preset까지 실제 TypeScript 예제로 확인하세요."
        path="/docs"
        schemas={[
          webPageSchema({
            path: '/docs',
            title: '@gj-kit/expo-ui 문서',
            description: '설치, 테마, 컴포넌트 API와 플랫폼 유틸 문서',
            type: 'CollectionPage',
          }),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '문서', path: '/docs' },
          ]),
        ]}
      />
      <UiProvider
        theme={docsThemes}
        colorScheme={colorScheme}
        strings={koStrings}
        icons={docsIcons}
      >
        <DocsLayout colorScheme={colorScheme} onColorSchemeChange={setColorScheme} />
      </UiProvider>
    </>
  );
}

function DocsLayout({
  colorScheme,
  onColorSchemeChange,
}: {
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
}) {
  const theme = useTheme();
  const width = useHydratedWindowWidth();
  const desktop = width >= 980;
  const wide = width >= 720;
  const compact = width < 560;
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<SectionId, number>>({
    start: 0,
    theme: 0,
    components: 0,
    insets: 0,
    tailwind: 0,
    contracts: 0,
  });
  const [activeSection, setActiveSection] = useState<SectionId>('start');
  const { toast, showToast } = useToastController({ durationMs: 1_800 });

  const goToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    scrollRef.current?.scrollTo({
      y: Math.max(0, sectionOffsets.current[id] + (desktop ? 24 : 12)),
      animated: true,
    });
  }, [desktop]);

  const rememberSection = useCallback((id: SectionId, event: LayoutChangeEvent) => {
    sectionOffsets.current[id] = event.nativeEvent.layout.y;
  }, []);

  const copyCode = useCallback(async (value: string) => {
    const clipboard = (
      globalThis as unknown as {
        navigator?: { clipboard?: { writeText: (text: string) => Promise<void> } };
      }
    ).navigator?.clipboard;

    if (!clipboard) {
      showToast({ message: '코드를 선택해 직접 복사해 주세요.', variant: 'warning' });
      return;
    }

    try {
      await clipboard.writeText(value);
      showToast({ message: '클립보드에 복사했습니다.', variant: 'success' });
    } catch {
      showToast({ message: '복사하지 못했습니다. 코드를 직접 선택해 주세요.', variant: 'warning' });
    }
  }, [showToast]);

  const toggleTheme = () => {
    onColorSchemeChange(colorScheme === 'light' ? 'dark' : 'light');
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <TopBar compact={compact} colorScheme={colorScheme} onToggleTheme={toggleTheme} />

      {!desktop ? (
        <MobileNav
          activeSection={activeSection}
          onSelect={goToSection}
        />
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ContentFrame maxWidth={1280} padding={desktop ? 32 : 16} center>
          <View style={[styles.docsGrid, desktop ? styles.docsGridDesktop : null]}>
            {desktop ? (
              <Sidebar activeSection={activeSection} onSelect={goToSection} />
            ) : null}

            <View style={styles.mainColumn}>
              <View nativeID="start" onLayout={(event) => rememberSection('start', event)}>
                <Hero wide={wide} onCopy={() => copyCode('pnpm add @gj-kit/expo-ui')} />

                <DocSection
                  eyebrow="01 · QUICK START"
                  title="설치는 한 줄, 첫 컴포넌트는 몇 줄이면 충분합니다."
                  description="기본 light theme와 영문 문구가 내장되어 있어 일반 컴포넌트와 단일 Sheet·Dialog는 Provider 없이도 시작할 수 있습니다. 앱 브랜드·한국어 문구, Menu·Select·Popover·Tooltip 또는 중첩 Sheet·Dialog 순서가 필요하면 루트 UiProvider를 두세요."
                >
                  <CodeBlock
                    label="Terminal"
                    code="pnpm add @gj-kit/expo-ui"
                    onCopy={copyCode}
                  />
                  <CodeBlock
                    label="SaveButton.tsx"
                    code={QUICK_START_CODE}
                    onCopy={copyCode}
                  />
                  <Callout tone="info" title="지원 기준">
                    React 18 이상 · React Native 0.79 이상 · Node.js 20 이상을 peer 및
                    engine 기준으로 지원합니다. Expo 전용 native module은 없습니다.
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="theme" onLayout={(event) => rememberSection('theme', event)}>
                <DocSection
                  eyebrow="02 · FOUNDATION"
                  title="Theme과 Provider가 하나의 설계 언어를 만듭니다."
                  description="createThemes는 shared 오버라이드 뒤에 light와 dark 오버라이드를 적용해 완성된 ThemePair를 만듭니다. 루트 UiProvider는 스킴·문구·아이콘과 Menu·Select·Popover·Tooltip·Sheet의 overlay 환경을 함께 제공하고, 중첩 Provider는 바깥 stack과 tooltip coordinator를 재사용합니다."
                >
                  <StatGrid wide={wide} />
                  <CodeBlock label="src/theme.ts" code={THEME_CODE} onCopy={copyCode} />
                  <CodeBlock label="app/_layout.tsx" code={PROVIDER_CODE} onCopy={copyCode} />
                  <View style={[styles.twoColumn, wide ? styles.twoColumnWide : null]}>
                    <InfoCard
                      icon="◐"
                      title="Light와 dark를 함께"
                      body="ThemePair는 두 스킴을 항상 완성된 상태로 제공합니다. 단일 Theme을 넘기면 해당 스킴으로 고정됩니다."
                    />
                    <InfoCard
                      icon="Aa"
                      title="문구와 아이콘은 앱 소유"
                      body="koStrings·enStrings와 RenderIcon 슬롯을 Provider 한 곳에서 주입합니다. UiProvider가 없는 독립 overlay tree에서만 OverlayProvider를 직접 둡니다."
                    />
                  </View>
                </DocSection>
              </View>

              <View nativeID="components" onLayout={(event) => rememberSection('components', event)}>
                <DocSection
                  eyebrow="03 · COMPONENTS"
                  title={`${SOURCE_COMPONENT_COUNT}개의 작은 조각, 일관된 하나의 시스템.`}
                  description="컴포넌트는 앱 구조를 대신 소유하지 않습니다. 토큰과 명확한 prop 계약을 제공하고, 화면 흐름과 도메인 조립은 앱에 남겨 둡니다."
                >
                  <View style={styles.componentCountRow}>
                    <View style={[styles.countPill, { backgroundColor: theme.colors.primarySoft }]}>
                      <RNText style={[styles.countPillNumber, { color: theme.colors.primary }]}>{SOURCE_COMPONENT_COUNT}</RNText>
                      <RNText style={[styles.countPillLabel, { color: theme.colors.textMuted }]}>source components</RNText>
                    </View>
                    <Text role="caption" color="textMuted" style={styles.componentCountCopy}>
                      아래 목록은 현재 루트 엔트리에서 실제 export되는 시각 컴포넌트 전체입니다.
                    </Text>
                  </View>

                  <View style={styles.componentGrid}>
                    {COMPONENT_GROUPS.map((group) => (
                      <ComponentGroupCard key={group.title} group={group} wide={wide} />
                    ))}
                  </View>

                  <CodeBlock
                    label="ReadingControls.tsx"
                    code={COMPONENTS_V04_CODE}
                    onCopy={copyCode}
                  />

                  <Callout tone="neutral" title="플랫폼에 맞는 overlay 의미">
                    Menu는 웹에서 menuitem·checkbox focus와 typeahead를, Select는 포커스를
                    trigger에 유지하는 combobox·listbox를 제공합니다. Popover는 owned trigger에서
                    웹 non-modal rich dialog와 네이티브 adaptive Dialog로, Tooltip은 owned icon action에서
                    웹 시각 설명과 네이티브 accessibilityHint로 적응합니다. Sheet는 작은 화면의 bottom
                    surface와 넓은 화면의 logical side panel을 같은 controlled 계약으로 연결합니다. public
                    Portal·Host·asChild, submenu, 검색·다중 Select와 drag·snap BottomSheet adapter는
                    아직 계약하지 않습니다.
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="insets" onLayout={(event) => rememberSection('insets', event)}>
                <DocSection
                  eyebrow="04 · DEVICE EDGES"
                  title="Safe area와 키보드도 조합 가능한 유틸로."
                  description="/insets 엔트리는 하단 safe-area와 Android edge-to-edge Modal의 키보드 겹침을 다룹니다. 훅을 사용할 때만 react-native-safe-area-context가 optional peer로 필요합니다."
                >
                  <CodeBlock
                    label="Optional peer for Expo"
                    code="npx expo install react-native-safe-area-context"
                    onCopy={copyCode}
                  />
                  <CodeBlock label="BottomBar.tsx" code={INSETS_CODE} onCopy={copyCode} />
                  <CodeBlock label="Keyboard utilities" code={KEYBOARD_CODE} onCopy={copyCode} />
                  <ApiList
                    items={[
                      ['useBottomInset', '웹에서는 0, native에서는 실측 하단 inset을 반환합니다.'],
                      ['useBottomSheetPadding', '디자인 여백과 실제 inset을 더합니다.'],
                      ['useModalKeyboardOverlap', '별도 Modal 윈도우의 실제 키보드 가림 높이를 계산합니다.'],
                      ['computeKeyboardRevealOffset', '포커스 입력의 아래쪽을 드러낼 스크롤 위치를 계산합니다.'],
                      ['nativeBottomInset / Padding', 'React 훅 없이 사용할 수 있는 순수 계산 함수입니다.'],
                    ]}
                  />
                </DocSection>
              </View>

              <View nativeID="tailwind" onLayout={(event) => rememberSection('tailwind', event)}>
                <DocSection
                  eyebrow="05 · NATIVEWIND"
                  title="Tailwind는 선택하고, 토큰은 공유하세요."
                  description="스타일링 가능한 프리미티브는 style과 className 확장 지점을 제공하며 NativeWind 자체에는 의존하지 않습니다. /tailwind 엔트리는 Theme에서 preset을 만들어 런타임 테마와 클래스 토큰의 출처를 맞춥니다."
                >
                  <CodeBlock label="tailwind.preset.ts" code={TAILWIND_CODE} onCopy={copyCode} />
                  <View style={[styles.twoColumn, wide ? styles.twoColumnWide : null]}>
                    <InfoCard
                      icon="⌘"
                      title="Node 컨텍스트에서 안전"
                      body="/theme과 /tailwind 엔트리는 React와 React Native를 import하지 않아 설정 파일에서 바로 불러올 수 있습니다."
                    />
                    <InfoCard
                      icon="ui"
                      title="기본 prefix는 ui"
                      body="색, spacing, radius, 6개 일반 typography role, elevation과 breakpoint가 유틸리티로 파생됩니다."
                    />
                  </View>
                  <Callout tone="warning" title="다크 클래스의 정본">
                    preset은 전달한 단일 Theme에서 만들어집니다. 런타임 스킴 전환은 useTheme이
                    담당하고, className의 dark: 전환은 NativeWind 설정에서 앱이 관리합니다.
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="contracts" onLayout={(event) => rememberSection('contracts', event)}>
                <DocSection
                  eyebrow="06 · TYPE-SAFE BY DESIGN"
                  title="동작하지 않는 UI를 만들기 어렵게."
                  description="접근성 라벨 누락, 내용 없는 버튼, 오타 난 토큰 키, 핸들러 없는 액션을 런타임까지 보내지 않습니다. 공개 타입 테스트가 정상 사용과 잘못된 사용을 함께 고정합니다."
                >
                  <ProofStrip wide={wide} />
                  <CodeBlock label="Contracts.tsx" code={CONTRACT_CODE} onCopy={copyCode} />
                  <ContractGrid wide={wide} />
                  <Callout tone="success" title="현재 소스에서 직접 검증했습니다">
                    unit 테스트 534개와 type-contract 테스트 91개, 총 625개가 통과하며 README의
                    TypeScript/TSX 예제도 배포 타입 선언을 기준으로 컴파일됩니다.
                  </Callout>
                </DocSection>
              </View>

              <Footer />
            </View>
          </View>
        </ContentFrame>
      </ScrollView>

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} bottomOffset={24} />
      ) : null}
    </View>
  );
}

function TopBar({
  compact,
  colorScheme,
  onToggleTheme,
}: {
  compact: boolean;
  colorScheme: ColorScheme;
  onToggleTheme: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.topBar,
        {
          backgroundColor: theme.colors.surface,
          borderBottomColor: theme.colors.line,
        },
      ]}
    >
      <View style={styles.topBarInner}>
        <LinkPressable href="/" accessibilityLabel="홈으로 이동" style={styles.brandLink}>
          <View style={[styles.brandMark, { backgroundColor: theme.colors.primary }]}>
            <RNText style={[styles.brandMarkText, { color: theme.colors.onPrimary }]}>g</RNText>
          </View>
          <View>
            <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
            {!compact ? (
              <RNText style={[styles.brandMeta, { color: theme.colors.textMuted }]}>Documentation</RNText>
            ) : null}
          </View>
        </LinkPressable>

        <View style={styles.topBarActions}>
          {!compact
            ? SITE_NAV_LINKS.filter((item) => item.href !== '/docs').map((item) => (
                <LinkPressable
                  key={item.href}
                  href={item.href as Href}
                  style={[styles.headerButton, { borderColor: theme.colors.line }]}
                >
                  <RNText style={[styles.headerButtonText, { color: theme.colors.text }]}>{item.label}</RNText>
                </LinkPressable>
              ))
            : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={colorScheme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
            onPress={onToggleTheme}
            style={({ pressed }) => [
              styles.themeButton,
              {
                backgroundColor: theme.colors.primarySoft,
                borderColor: theme.colors.line,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <RNText style={[styles.themeButtonIcon, { color: theme.colors.primary }]}>
              {colorScheme === 'light' ? '◐' : '☼'}
            </RNText>
            {!compact ? (
              <RNText style={[styles.themeButtonText, { color: theme.colors.text }]}>
                {colorScheme === 'light' ? 'Dark' : 'Light'}
              </RNText>
            ) : null}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function MobileNav({
  activeSection,
  onSelect,
}: {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.mobileNavShell,
        { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.line },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mobileNavContent}
      >
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeSection;
          return (
            <LinkPressable
              key={item.id}
              href={`/docs#${item.id}` as Href}
              onPress={() => onSelect(item.id)}
              {...(active ? { ariaCurrent: 'page' as const } : {})}
              style={[
                styles.mobileNavItem,
                active ? { backgroundColor: theme.colors.primarySoft } : null,
              ]}
            >
              <RNText
                style={[
                  styles.mobileNavLabel,
                  { color: active ? theme.colors.primary : theme.colors.textMuted },
                ]}
              >
                {item.label}{item.meta ? ` ${item.meta}` : ''}
              </RNText>
            </LinkPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Sidebar({
  activeSection,
  onSelect,
}: {
  activeSection: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sidebarWrap}>
      <View style={styles.sidebarSticky}>
        <RNText style={[styles.sidebarEyebrow, { color: theme.colors.textSubtle }]}>DOCUMENTATION</RNText>
        <View style={styles.sidebarNav}>
          {NAV_ITEMS.map((item, index) => {
            const active = item.id === activeSection;
            return (
              <LinkPressable
                key={item.id}
                href={`/docs#${item.id}` as Href}
                onPress={() => onSelect(item.id)}
                {...(active ? { ariaCurrent: 'page' as const } : {})}
                style={[
                  styles.sidebarItem,
                  active ? { backgroundColor: theme.colors.primarySoft } : null,
                ]}
              >
                <RNText
                  style={[
                    styles.sidebarIndex,
                    { color: active ? theme.colors.primary : theme.colors.textSubtle },
                  ]}
                >
                  {String(index + 1).padStart(2, '0')}
                </RNText>
                <RNText
                  style={[
                    styles.sidebarLabel,
                    { color: active ? theme.colors.primary : theme.colors.textMuted },
                  ]}
                >
                  {item.label}
                </RNText>
                {item.meta ? (
                  <View style={[styles.sidebarBadge, { backgroundColor: theme.colors.surfaceSubtle }]}>
                    <RNText style={[styles.sidebarBadgeText, { color: theme.colors.textMuted }]}>{item.meta}</RNText>
                  </View>
                ) : null}
              </LinkPressable>
            );
          })}
        </View>

        <Surface padding="lg" style={styles.sidebarCard}>
          <Text role="label">npm v{publishedPackageVersion}</Text>
          <Text role="caption" color="textMuted" style={styles.sidebarCardCopy}>
            {RELEASED_COMPONENT_COUNT} stable · {PREVIEW_COMPONENT_COUNT} preview{`\n`}ESM + CJS · MIT
          </Text>
          <LinkPressable href={NPM_URL} style={styles.sidebarNpmLink}>
            <RNText style={[styles.sidebarNpmText, { color: theme.colors.primary }]}>npm에서 보기 ↗</RNText>
          </LinkPressable>
        </Surface>
      </View>
    </View>
  );
}

function Hero({ wide, onCopy }: { wide: boolean; onCopy: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.hero,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.line,
        },
      ]}
    >
      <View
        style={[
          styles.heroGlow,
          { backgroundColor: theme.colors.primarySoft, pointerEvents: 'none' },
        ]}
      />
      <View style={styles.heroContent}>
        <View style={styles.heroBadgeRow}>
          <View style={[styles.heroBadge, { backgroundColor: theme.colors.primarySoft }]}>
            <RNText style={[styles.heroBadgeText, { color: theme.colors.primary }]}>DOCS · npm v{publishedPackageVersion} · {SOURCE_COMPONENT_COUNT} source components</RNText>
          </View>
          <RNText style={[styles.heroLicense, { color: theme.colors.textMuted }]}>MIT · React Native</RNText>
        </View>
        <Text
          role="heading"
          accessibilityRole="header"
          aria-level={1}
          style={[styles.heroTitle, !wide ? styles.heroTitleMobile : null]}
        >
          Expo UI 컴포넌트,{`\n`}빠르게 시작하고 안전하게 확장하세요.
        </Text>
        <Text role="body" color="textMuted" style={styles.heroCopy}>
          npm v{publishedPackageVersion}에 공개된 {RELEASED_COMPONENT_COUNT}개와 v0.4 소스 미리보기 {PREVIEW_COMPONENT_COUNT}개를 함께 문서화합니다.
          미공개 상세 페이지는 검색에서 제외하며, 토큰 기반 light·dark 테마와 device edge 유틸을 같은 타입 안전 API로 제공합니다.
        </Text>
        <View style={styles.heroActions}>
          <Button label="설치 명령 복사" size="lg" onPress={onCopy} />
          {[
            { href: '/docs/components', label: `컴포넌트 ${SOURCE_COMPONENT_COUNT}종` },
            { href: '/docs/getting-started', label: '시작 가이드' },
            { href: NPM_URL, label: 'npm 패키지 ↗' },
          ].map((action) => (
            <LinkPressable
              key={action.href}
              href={action.href as Href}
              style={[styles.heroLinkButton, { borderColor: theme.colors.line }]}
            >
              <RNText style={[styles.heroLinkText, { color: theme.colors.text }]}>{action.label}</RNText>
            </LinkPressable>
          ))}
        </View>
      </View>
    </View>
  );
}

function DocSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.docSection, { borderBottomColor: theme.colors.line }]}>
      <View style={styles.sectionHeading}>
        <RNText style={[styles.sectionEyebrow, { color: theme.colors.primary }]}>{eyebrow}</RNText>
        <Text role="heading" accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>{title}</Text>
        <Text role="body" color="textMuted" style={styles.sectionDescription}>{description}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function CodeBlock({
  label,
  code,
  onCopy,
}: {
  label: string;
  code: string;
  onCopy: (value: string) => void;
}) {
  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <View style={styles.windowDots}>
          <View style={[styles.windowDot, styles.windowDotRed]} />
          <View style={[styles.windowDot, styles.windowDotYellow]} />
          <View style={[styles.windowDot, styles.windowDotGreen]} />
        </View>
        <RNText style={styles.codeLabel}>{label}</RNText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} 코드 복사`}
          onPress={() => onCopy(code)}
          style={({ pressed }) => [styles.copyButton, pressed ? styles.copyButtonPressed : null]}
        >
          <RNText style={styles.copyButtonText}>복사</RNText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <RNText selectable style={styles.codeText}>{code}</RNText>
      </ScrollView>
    </View>
  );
}

function StatGrid({ wide }: { wide: boolean }) {
  const stats = [
    ['31', 'semantic color roles'],
    ['7', 'typography roles'],
    ['2', 'built-in schemes'],
    ['0', 'direct dependencies'],
  ] as const;
  return (
    <View style={styles.statGrid}>
      {stats.map(([value, label]) => (
        <StatCard key={label} value={value} label={label} wide={wide} />
      ))}
    </View>
  );
}

function StatCard({ value, label, wide }: { value: string; label: string; wide: boolean }) {
  const theme = useTheme();
  return (
    <Surface padding="lg" style={[styles.statCard, wide ? styles.statCardWide : null]}>
      <RNText style={[styles.statValue, { color: theme.colors.primary }]}>{value}</RNText>
      <RNText style={[styles.statLabel, { color: theme.colors.textMuted }]}>{label}</RNText>
    </Surface>
  );
}

function InfoCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  const theme = useTheme();
  return (
    <Surface padding="xl" style={styles.infoCard}>
      <View style={[styles.infoIcon, { backgroundColor: theme.colors.primarySoft }]}>
        <RNText style={[styles.infoIconText, { color: theme.colors.primary }]}>{icon}</RNText>
      </View>
      <Text role="title" style={styles.infoTitle}>{title}</Text>
      <Text role="caption" color="textMuted" style={styles.infoBody}>{body}</Text>
    </Surface>
  );
}

function ComponentGroupCard({
  group,
  wide,
}: {
  group: (typeof COMPONENT_GROUPS)[number];
  wide: boolean;
}) {
  const theme = useTheme();
  return (
    <Surface padding="xl" style={[styles.componentCard, wide ? styles.componentCardWide : null]}>
      <RNText style={[styles.componentGroupTitle, { color: theme.colors.primary }]}>{group.title}</RNText>
      <Text role="caption" color="textMuted" style={styles.componentGroupDescription}>
        {group.description}
      </Text>
      <View style={styles.componentItems}>
        {group.items.map((item) => {
          const entry = getComponentSeoEntryByReference(item.name);
          const content = (
            <View style={[styles.componentItem, { borderTopColor: theme.colors.line }]}>
              <Text role="label">{item.name}</Text>
              <Text role="caption" color="textSubtle" style={styles.componentDetail}>
                {item.detail}
              </Text>
            </View>
          );
          return entry ? (
            <LinkPressable key={item.name} href={componentDocsPath(entry.slug)}>
              {content}
            </LinkPressable>
          ) : (
            <View key={item.name}>{content}</View>
          );
        })}
      </View>
    </Surface>
  );
}

function ApiList({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  const theme = useTheme();
  return (
    <Surface padding="none" style={styles.apiList}>
      {items.map(([name, description], index) => (
        <View
          key={name}
          style={[
            styles.apiRow,
            index > 0 ? { borderTopColor: theme.colors.line, borderTopWidth: 1 } : null,
          ]}
        >
          <View style={[styles.apiNamePill, { backgroundColor: theme.colors.surfaceSubtle }]}>
            <RNText style={[styles.apiName, { color: theme.colors.primary }]}>{name}</RNText>
          </View>
          <Text role="caption" color="textMuted" style={styles.apiDescription}>{description}</Text>
        </View>
      ))}
    </Surface>
  );
}

function ProofStrip({ wide }: { wide: boolean }) {
  const theme = useTheme();
  const items = [
    ['534', 'unit tests'],
    ['91', 'type tests'],
    [String(SOURCE_COMPONENT_COUNT), 'source components'],
  ] as const;
  return (
    <View
      style={[
        styles.proofStrip,
        wide ? styles.proofStripWide : null,
        { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.line },
      ]}
    >
      {items.map(([value, label]) => (
        <View key={label} style={styles.proofItem}>
          <RNText style={[styles.proofValue, { color: theme.colors.primary }]}>{value}</RNText>
          <RNText style={[styles.proofLabel, { color: theme.colors.textMuted }]}>{label}</RNText>
        </View>
      ))}
    </View>
  );
}

function ContractGrid({ wide }: { wide: boolean }) {
  const theme = useTheme();
  const contracts = [
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
  ] as const;
  return (
    <View style={styles.contractGrid}>
      {contracts.map(([title, body], index) => (
        <View
          key={title}
          style={[
            styles.contractItem,
            wide ? styles.contractItemWide : null,
            { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={[styles.contractCheck, { backgroundColor: theme.colors.primarySoft }]}>
            <RNText style={[styles.contractCheckText, { color: theme.colors.primary }]}>✓</RNText>
          </View>
          <View style={styles.contractCopy}>
            <RNText style={[styles.contractTitle, { color: theme.colors.text }]}>{title}</RNText>
            <RNText style={[styles.contractBody, { color: theme.colors.textMuted }]}>{body}</RNText>
          </View>
          <RNText style={[styles.contractNumber, { color: theme.colors.textSubtle }]}>
            {String(index + 1).padStart(2, '0')}
          </RNText>
        </View>
      ))}
    </View>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'info' | 'success' | 'warning' | 'neutral';
  title: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const toneMap = {
    info: { mark: 'i', color: theme.colors.primary, background: theme.colors.primarySoft },
    success: { mark: '✓', color: theme.colors.success, background: theme.colors.primarySoft },
    warning: { mark: '!', color: theme.colors.warningStrong, background: theme.colors.surfaceSubtle },
    neutral: { mark: '↳', color: theme.colors.textMuted, background: theme.colors.surfaceSubtle },
  }[tone];
  return (
    <View
      style={[
        styles.callout,
        { backgroundColor: toneMap.background, borderColor: theme.colors.line },
      ]}
    >
      <View style={[styles.calloutMark, { borderColor: toneMap.color }]}>
        <RNText style={[styles.calloutMarkText, { color: toneMap.color }]}>{toneMap.mark}</RNText>
      </View>
      <View style={styles.calloutCopy}>
        <RNText style={[styles.calloutTitle, { color: theme.colors.text }]}>{title}</RNText>
        <RNText style={[styles.calloutBody, { color: theme.colors.textMuted }]}>{children}</RNText>
      </View>
    </View>
  );
}

function Footer() {
  const theme = useTheme();
  return (
    <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
      <View>
        <Text role="label">@gj-kit/expo-ui</Text>
        <Text role="caption" color="textMuted" style={styles.footerCopy}>
          Type-safe primitives for Expo, React Native and React Native Web.
        </Text>
      </View>
      <View style={styles.footerLinks}>
        <LinkPressable href="/" style={styles.footerLinkHit}>
          <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>홈</RNText>
        </LinkPressable>
        <LinkPressable href="/docs/components" style={styles.footerLinkHit}>
          <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>컴포넌트</RNText>
        </LinkPressable>
        <LinkPressable href={NPM_URL} style={styles.footerLinkHit}>
          <RNText style={[styles.footerLink, { color: theme.colors.primary }]}>npm ↗</RNText>
        </LinkPressable>
        <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>MIT</RNText>
      </View>
    </View>
  );
}

const stickySidebarStyle: ViewStyle | null = Platform.OS === 'web'
  ? ({ position: 'sticky', top: 24 } as unknown as ViewStyle)
  : null;

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  topBar: {
    borderBottomWidth: 1,
    minHeight: 68,
    zIndex: 50,
  },
  topBarInner: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    maxWidth: 1280,
    minHeight: 68,
    paddingHorizontal: 18,
    width: '100%',
  },
  brandLink: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  brandMark: {
    alignItems: 'center',
    borderRadius: 10,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  brandMarkText: { fontSize: 21, fontWeight: '800', lineHeight: 25 },
  brandName: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  brandMeta: { fontSize: 10, fontWeight: '600', letterSpacing: 0.7, marginTop: 1, textTransform: 'uppercase' },
  topBarActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  headerButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  headerButtonText: { fontSize: 13, fontWeight: '700' },
  themeButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    height: 38,
    justifyContent: 'center',
    minWidth: 42,
    paddingHorizontal: 12,
  },
  themeButtonIcon: { fontSize: 17, fontWeight: '700' },
  themeButtonText: { fontSize: 12, fontWeight: '700', marginLeft: 4 },
  pressed: { opacity: 0.7 },
  mobileNavShell: { borderBottomWidth: 1, minHeight: 48, zIndex: 40 },
  mobileNavContent: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 },
  mobileNavItem: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  mobileNavLabel: { fontSize: 12, fontWeight: '700' },
  docsGrid: { width: '100%' },
  docsGridDesktop: { alignItems: 'flex-start', flexDirection: 'row', gap: 48 },
  sidebarWrap: { flexShrink: 0, width: 220 },
  sidebarSticky: { ...(stickySidebarStyle ?? {}) },
  sidebarEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 12 },
  sidebarNav: { gap: 3 },
  sidebarItem: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', minHeight: 40, paddingHorizontal: 10 },
  sidebarIndex: { fontFamily: 'monospace', fontSize: 10, marginRight: 9 },
  sidebarLabel: { flex: 1, fontSize: 12, fontWeight: '700' },
  sidebarBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  sidebarBadgeText: { fontSize: 9, fontWeight: '800' },
  sidebarCard: { marginTop: 24 },
  sidebarCardCopy: { lineHeight: 19, marginTop: 6 },
  sidebarNpmLink: { marginTop: 13 },
  sidebarNpmText: { fontSize: 12, fontWeight: '800' },
  mainColumn: { flex: 1, minWidth: 0, width: '100%' },
  hero: {
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 72,
    minHeight: 390,
    overflow: 'hidden',
    paddingHorizontal: 30,
    paddingVertical: 54,
    position: 'relative',
  },
  heroGlow: {
    borderRadius: 999,
    height: 420,
    opacity: 0.9,
    position: 'absolute',
    right: -190,
    top: -210,
    width: 420,
  },
  heroContent: { maxWidth: 720, position: 'relative', zIndex: 1 },
  heroBadgeRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  heroBadge: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  heroBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  heroLicense: { fontSize: 11, fontWeight: '700' },
  heroTitle: { fontSize: 48, letterSpacing: -1.8, lineHeight: 57, maxWidth: 660 },
  heroTitleMobile: { fontSize: 36, letterSpacing: -1.2, lineHeight: 44 },
  heroCopy: { fontSize: 17, lineHeight: 29, marginTop: 20, maxWidth: 650 },
  heroActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 30 },
  heroLinkButton: { alignItems: 'center', borderRadius: 10, borderWidth: 1, minHeight: 52, justifyContent: 'center', paddingHorizontal: 20 },
  heroLinkText: { fontSize: 14, fontWeight: '800' },
  docSection: { borderBottomWidth: 1, paddingBottom: 76, paddingTop: 20 },
  sectionHeading: { marginBottom: 32, maxWidth: 760 },
  sectionEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12 },
  sectionTitle: { fontSize: 30, letterSpacing: -0.7, lineHeight: 39 },
  sectionDescription: { fontSize: 15, lineHeight: 26, marginTop: 14, maxWidth: 730 },
  sectionBody: { gap: 18 },
  codeBlock: { backgroundColor: '#08111F', borderColor: '#1D2C42', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  codeHeader: { alignItems: 'center', backgroundColor: '#0D1929', borderBottomColor: '#1D2C42', borderBottomWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 14 },
  windowDots: { flexDirection: 'row', gap: 6 },
  windowDot: { borderRadius: 999, height: 7, width: 7 },
  windowDotRed: { backgroundColor: '#FB7185' },
  windowDotYellow: { backgroundColor: '#FBBF24' },
  windowDotGreen: { backgroundColor: '#34D399' },
  codeLabel: { color: '#94A3B8', flex: 1, fontFamily: 'monospace', fontSize: 11, marginLeft: 12 },
  copyButton: { backgroundColor: '#15243A', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  copyButtonPressed: { backgroundColor: '#233654' },
  copyButtonText: { color: '#C7D2FE', fontSize: 10, fontWeight: '800' },
  codeText: { color: '#DCE7F7', fontFamily: 'monospace', fontSize: 12.5, lineHeight: 21, padding: 18 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { flexGrow: 1, flexBasis: '45%', minWidth: 135 },
  statCardWide: { flexBasis: '20%' },
  statValue: { fontSize: 25, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', marginTop: 5, textTransform: 'uppercase' },
  twoColumn: { gap: 14 },
  twoColumnWide: { flexDirection: 'row' },
  infoCard: { flex: 1 },
  infoIcon: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  infoIconText: { fontSize: 14, fontWeight: '900' },
  infoTitle: { marginTop: 16 },
  infoBody: { lineHeight: 21, marginTop: 8 },
  componentCountRow: { alignItems: 'center', flexDirection: 'row', gap: 15 },
  countPill: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, paddingHorizontal: 13, paddingVertical: 9 },
  countPillNumber: { fontSize: 18, fontWeight: '900' },
  countPillLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  componentCountCopy: { flex: 1, lineHeight: 20 },
  componentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  componentCard: { flexBasis: '100%', width: '100%' },
  componentCardWide: { flexBasis: '47%', flexGrow: 1, minWidth: 290, width: 'auto' },
  componentGroupTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  componentGroupDescription: { lineHeight: 20, marginTop: 8, minHeight: 40 },
  componentItems: { marginTop: 14 },
  componentItem: { borderTopWidth: 1, paddingVertical: 11 },
  componentDetail: { fontFamily: 'monospace', fontSize: 10.5, marginTop: 4 },
  apiList: { overflow: 'hidden' },
  apiRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 17, paddingVertical: 15 },
  apiNamePill: { borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  apiName: { fontFamily: 'monospace', fontSize: 10.5, fontWeight: '700' },
  apiDescription: { flex: 1, lineHeight: 20, minWidth: 220 },
  proofStrip: { borderRadius: 14, borderWidth: 1, gap: 14, padding: 18 },
  proofStripWide: { flexDirection: 'row' },
  proofItem: { flex: 1 },
  proofValue: { fontSize: 27, fontWeight: '900', letterSpacing: -0.6 },
  proofLabel: { fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  contractGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  contractItem: { alignItems: 'flex-start', borderRadius: 12, borderWidth: 1, flexBasis: '100%', flexDirection: 'row', minHeight: 102, padding: 15, position: 'relative' },
  contractItemWide: { flexBasis: '47%', flexGrow: 1 },
  contractCheck: { alignItems: 'center', borderRadius: 999, height: 26, justifyContent: 'center', marginRight: 11, width: 26 },
  contractCheckText: { fontSize: 12, fontWeight: '900' },
  contractCopy: { flex: 1, paddingRight: 22 },
  contractTitle: { fontSize: 12, fontWeight: '900' },
  contractBody: { fontSize: 11, lineHeight: 18, marginTop: 5 },
  contractNumber: { fontFamily: 'monospace', fontSize: 9, position: 'absolute', right: 11, top: 10 },
  callout: { alignItems: 'flex-start', borderRadius: 13, borderWidth: 1, flexDirection: 'row', padding: 16 },
  calloutMark: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 25, justifyContent: 'center', marginRight: 12, width: 25 },
  calloutMarkText: { fontSize: 11, fontWeight: '900' },
  calloutCopy: { flex: 1 },
  calloutTitle: { fontSize: 12, fontWeight: '900' },
  calloutBody: { fontSize: 11.5, lineHeight: 19, marginTop: 5 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', paddingVertical: 32 },
  footerCopy: { marginTop: 5 },
  footerLinks: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  footerLinkHit: { justifyContent: 'center', minHeight: 44 },
  footerLink: { fontSize: 11, fontWeight: '800' },
});
