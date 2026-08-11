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
  enStrings,
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
import { useLocale } from '../src/locale';
import { docsHubStrings } from '../src/docs-hub-strings';
import type { DocsHubStrings } from '../src/docs-hub-strings';
import { siteStrings } from '../src/site-strings';
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

function navItems(
  t: DocsHubStrings,
): ReadonlyArray<{ id: SectionId; label: string; meta?: string }> {
  return [
    { id: 'start', label: t.navStart },
    { id: 'theme', label: t.navTheme },
    { id: 'components', label: t.navComponents, meta: String(SOURCE_COMPONENT_COUNT) },
    { id: 'insets', label: t.navInsets },
    { id: 'tailwind', label: t.navTailwind },
    { id: 'contracts', label: t.navContracts },
  ];
}

const COMPONENT_GROUPS = [
  {
    title: 'Foundation',
    items: [
      { name: 'Text', detail: '7 typography roles · token color' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { name: 'Button', detail: '6 variants · 3 sizes · loading' },
      { name: 'IconButton', detail: 'required accessibilityLabel' },
      { name: 'Link', detail: 'native anchor · destination union' },
      { name: 'FloatingActionButton', detail: 'safe-area placement · required name' },
    ],
  },
  {
    title: 'Inputs & Navigation',
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
    items: [
      { name: 'SelectionIndicator', detail: '16 · 18 · 20 · 24 sizes' },
      { name: 'SelectableRow', detail: 'selected and disabled states' },
      { name: 'SelectAllRow', detail: 'localized select / deselect' },
      { name: 'Chip', detail: 'action · filter · removable union' },
    ],
  },
  {
    title: 'Controls',
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
    items: [
      { name: 'Badge', detail: '5 semantic variants · 2 sizes' },
      { name: 'Alert', detail: 'action · dismiss · live-region opt-in' },
      { name: 'Spinner', detail: 'localized accessible loading' },
      { name: 'ProgressBar', detail: 'determinate · null indeterminate' },
    ],
  },
  {
    title: 'Display & Disclosure',
    items: [
      { name: 'Avatar', detail: 'alt/decorative union · initials fallback' },
      { name: 'Divider', detail: 'horizontal · vertical · semantic opt-in' },
      { name: 'ListItem', detail: 'static or interactive contract' },
      { name: 'Accordion', detail: 'single · multiple · ARIA relationships' },
    ],
  },
  {
    title: 'Data',
    items: [
      { name: 'DataTable', detail: 'semantic web table · native adaptive list' },
    ],
  },
  {
    title: 'Overlay',
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

// 주석까지 전부 코드 토큰이라 로케일과 무관하다.
const TAILWIND_CODE = `import { createTailwindPreset } from '@gj-kit/expo-ui/tailwind';
import { themes } from './src/theme';

export const preset = createTailwindPreset(themes.light);

// presets: [preset]
// bg-ui-primary · p-ui-lg · rounded-ui-pill
// text-ui-title · shadow-ui-sm · tablet: / desktop:`;

export default function DocsPage() {
  const { colorScheme, setColorScheme } = useSiteColorScheme();
  const { locale } = useLocale();
  const t = docsHubStrings(locale);
  const nav = siteStrings(locale);
  useDocumentChrome(docsThemes[colorScheme].colors.background);

  return (
    <>
      <SeoHead
        title={t.metaTitle}
        description={t.metaDescription}
        path="/docs"
        locale={locale}
        schemas={[
          webPageSchema({
            path: '/docs',
            title: t.schemaTitle,
            description: t.schemaDescription,
            type: 'CollectionPage',
            locale,
          }),
          breadcrumbSchema([
            { name: nav.home, path: '/' },
            { name: nav.docs, path: '/docs' },
          ]),
        ]}
      />
      <UiProvider
        theme={docsThemes}
        colorScheme={colorScheme}
        strings={locale === 'ko' ? koStrings : enStrings}
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
  const t = docsHubStrings(useLocale().locale);
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
      showToast({ message: t.copyUnavailable, variant: 'warning' });
      return;
    }

    try {
      await clipboard.writeText(value);
      showToast({ message: t.copySuccess, variant: 'success' });
    } catch {
      showToast({ message: t.copyFailed, variant: 'warning' });
    }
  }, [showToast, t]);

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
                  eyebrow={t.quickStartEyebrow}
                  title={t.quickStartTitle}
                  description={t.quickStartDescription}
                >
                  <CodeBlock
                    label={t.quickStartTerminalLabel}
                    code="pnpm add @gj-kit/expo-ui"
                    onCopy={copyCode}
                  />
                  <CodeBlock
                    label="SaveButton.tsx"
                    code={t.quickStartCode}
                    onCopy={copyCode}
                  />
                  <Callout tone="info" title={t.quickStartCalloutTitle}>
                    {t.quickStartCalloutBody}
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="theme" onLayout={(event) => rememberSection('theme', event)}>
                <DocSection
                  eyebrow={t.foundationEyebrow}
                  title={t.foundationTitle}
                  description={t.foundationDescription}
                >
                  <StatGrid wide={wide} />
                  <CodeBlock label="src/theme.ts" code={t.themeCode} onCopy={copyCode} />
                  <CodeBlock label="app/_layout.tsx" code={t.providerCode} onCopy={copyCode} />
                  <View style={[styles.twoColumn, wide ? styles.twoColumnWide : null]}>
                    <InfoCard
                      icon="◐"
                      title={t.foundationCardOne.title}
                      body={t.foundationCardOne.body}
                    />
                    <InfoCard
                      icon="Aa"
                      title={t.foundationCardTwo.title}
                      body={t.foundationCardTwo.body}
                    />
                  </View>
                </DocSection>
              </View>

              <View nativeID="components" onLayout={(event) => rememberSection('components', event)}>
                <DocSection
                  eyebrow={t.componentsEyebrow}
                  title={t.componentsTitle(SOURCE_COMPONENT_COUNT)}
                  description={t.componentsDescription}
                >
                  <View style={styles.componentCountRow}>
                    <View style={[styles.countPill, { backgroundColor: theme.colors.primarySoft }]}>
                      <RNText style={[styles.countPillNumber, { color: theme.colors.primary }]}>{SOURCE_COMPONENT_COUNT}</RNText>
                      <RNText style={[styles.countPillLabel, { color: theme.colors.textMuted }]}>{t.componentsCountLabel}</RNText>
                    </View>
                    <Text role="caption" color="textMuted" style={styles.componentCountCopy}>
                      {t.componentsCountCopy}
                    </Text>
                  </View>

                  <View style={styles.componentGrid}>
                    {COMPONENT_GROUPS.map((group) => (
                      <ComponentGroupCard key={group.title} group={group} wide={wide} />
                    ))}
                  </View>

                  <CodeBlock
                    label="ReadingControls.tsx"
                    code={t.componentsCode}
                    onCopy={copyCode}
                  />

                  <Callout tone="neutral" title={t.componentsCalloutTitle}>
                    {t.componentsCalloutBody}
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="insets" onLayout={(event) => rememberSection('insets', event)}>
                <DocSection
                  eyebrow={t.insetsEyebrow}
                  title={t.insetsTitle}
                  description={t.insetsDescription}
                >
                  <CodeBlock
                    label={t.insetsPeerLabel}
                    code="npx expo install react-native-safe-area-context"
                    onCopy={copyCode}
                  />
                  <CodeBlock label="BottomBar.tsx" code={t.insetsCode} onCopy={copyCode} />
                  <CodeBlock label={t.insetsKeyboardLabel} code={t.keyboardCode} onCopy={copyCode} />
                  <ApiList items={t.insetsApi} />
                </DocSection>
              </View>

              <View nativeID="tailwind" onLayout={(event) => rememberSection('tailwind', event)}>
                <DocSection
                  eyebrow={t.tailwindEyebrow}
                  title={t.tailwindTitle}
                  description={t.tailwindDescription}
                >
                  <CodeBlock label="tailwind.preset.ts" code={TAILWIND_CODE} onCopy={copyCode} />
                  <View style={[styles.twoColumn, wide ? styles.twoColumnWide : null]}>
                    <InfoCard
                      icon="⌘"
                      title={t.tailwindCardOne.title}
                      body={t.tailwindCardOne.body}
                    />
                    <InfoCard
                      icon="ui"
                      title={t.tailwindCardTwo.title}
                      body={t.tailwindCardTwo.body}
                    />
                  </View>
                  <Callout tone="warning" title={t.tailwindCalloutTitle}>
                    {t.tailwindCalloutBody}
                  </Callout>
                </DocSection>
              </View>

              <View nativeID="contracts" onLayout={(event) => rememberSection('contracts', event)}>
                <DocSection
                  eyebrow={t.contractsEyebrow}
                  title={t.contractsTitle}
                  description={t.contractsDescription}
                >
                  <ProofStrip wide={wide} />
                  <CodeBlock label="Contracts.tsx" code={t.contractsCode} onCopy={copyCode} />
                  <ContractGrid wide={wide} />
                  <Callout tone="success" title={t.contractsCalloutTitle}>
                    {t.contractsCalloutBody}
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
  const { locale, toggleLocale } = useLocale();
  const t = docsHubStrings(locale);
  const nav = siteStrings(locale);

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
        <LinkPressable href="/" accessibilityLabel={t.homeLabel} style={styles.brandLink}>
          <View style={[styles.brandMark, { backgroundColor: theme.colors.primary }]}>
            <RNText style={[styles.brandMarkText, { color: theme.colors.onPrimary }]}>g</RNText>
          </View>
          <View>
            <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
            {!compact ? (
              <RNText style={[styles.brandMeta, { color: theme.colors.textMuted }]}>{t.brandMeta}</RNText>
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
            accessibilityLabel={locale === 'en' ? nav.toKorean : nav.toEnglish}
            onPress={toggleLocale}
            style={({ pressed }) => [
              styles.themeButton,
              {
                backgroundColor: theme.colors.primarySoft,
                borderColor: theme.colors.line,
              },
              pressed ? styles.pressed : null,
            ]}
          >
            <RNText style={[styles.localeButtonText, { color: theme.colors.primary }]}>
              {locale === 'en' ? '한' : 'EN'}
            </RNText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={colorScheme === 'light' ? nav.toDark : nav.toLight}
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
  const t = docsHubStrings(useLocale().locale);
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
        {navItems(t).map((item) => {
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
  const t = docsHubStrings(useLocale().locale);
  return (
    <View style={styles.sidebarWrap}>
      <View style={styles.sidebarSticky}>
        <RNText style={[styles.sidebarEyebrow, { color: theme.colors.textSubtle }]}>{t.sidebarEyebrow}</RNText>
        <View style={styles.sidebarNav}>
          {navItems(t).map((item, index) => {
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
            {PREVIEW_COMPONENT_COUNT > 0
              ? t.sidebarMeta(RELEASED_COMPONENT_COUNT, PREVIEW_COMPONENT_COUNT)
              : t.sidebarMetaAllReleased(RELEASED_COMPONENT_COUNT)}
          </Text>
          <LinkPressable href={NPM_URL} style={styles.sidebarNpmLink}>
            <RNText style={[styles.sidebarNpmText, { color: theme.colors.primary }]}>{t.sidebarNpmLink}</RNText>
          </LinkPressable>
        </Surface>
      </View>
    </View>
  );
}

function Hero({ wide, onCopy }: { wide: boolean; onCopy: () => void }) {
  const theme = useTheme();
  const t = docsHubStrings(useLocale().locale);
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
            <RNText style={[styles.heroBadgeText, { color: theme.colors.primary }]}>{t.heroBadge(publishedPackageVersion, SOURCE_COMPONENT_COUNT)}</RNText>
          </View>
          <RNText style={[styles.heroLicense, { color: theme.colors.textMuted }]}>{t.heroLicense}</RNText>
        </View>
        <Text
          role="heading"
          accessibilityRole="header"
          aria-level={1}
          style={[styles.heroTitle, !wide ? styles.heroTitleMobile : null]}
        >
          {t.heroTitleTop}{`\n`}{t.heroTitleBottom}
        </Text>
        <Text role="body" color="textMuted" style={styles.heroCopy}>
          {PREVIEW_COMPONENT_COUNT > 0
            ? t.heroCopy(publishedPackageVersion, RELEASED_COMPONENT_COUNT, PREVIEW_COMPONENT_COUNT)
            : t.heroCopyAllReleased(publishedPackageVersion, RELEASED_COMPONENT_COUNT)}
        </Text>
        <View style={styles.heroActions}>
          <Button label={t.heroCopyCommand} size="lg" onPress={onCopy} />
          {[
            { href: '/docs/components', label: t.heroComponentsLink(SOURCE_COMPONENT_COUNT) },
            { href: '/docs/getting-started', label: t.heroGuideLink },
            { href: NPM_URL, label: t.heroNpmLink },
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
  const t = docsHubStrings(useLocale().locale);
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
          accessibilityLabel={t.copyCodeLabel(label)}
          onPress={() => onCopy(code)}
          style={({ pressed }) => [styles.copyButton, pressed ? styles.copyButtonPressed : null]}
        >
          <RNText style={styles.copyButtonText}>{t.copyButton}</RNText>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <RNText selectable style={styles.codeText}>{code}</RNText>
      </ScrollView>
    </View>
  );
}

function StatGrid({ wide }: { wide: boolean }) {
  const stats = docsHubStrings(useLocale().locale).foundationStats;
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
  const t = docsHubStrings(useLocale().locale);
  return (
    <Surface padding="xl" style={[styles.componentCard, wide ? styles.componentCardWide : null]}>
      <RNText style={[styles.componentGroupTitle, { color: theme.colors.primary }]}>{group.title}</RNText>
      <Text role="caption" color="textMuted" style={styles.componentGroupDescription}>
        {t.componentGroupDescriptions[group.title]}
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
  const t = docsHubStrings(useLocale().locale);
  const items = [
    ...t.contractsProof,
    [String(SOURCE_COMPONENT_COUNT), t.componentsCountLabel] as const,
  ];
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
  const contracts = docsHubStrings(useLocale().locale).contractItems;
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
  const t = docsHubStrings(useLocale().locale);
  return (
    <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
      <View>
        <Text role="label">@gj-kit/expo-ui</Text>
        <Text role="caption" color="textMuted" style={styles.footerCopy}>
          {t.footerTagline}
        </Text>
      </View>
      <View style={styles.footerLinks}>
        <LinkPressable href="/" style={styles.footerLinkHit}>
          <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>{t.footerHome}</RNText>
        </LinkPressable>
        <LinkPressable href="/docs/components" style={styles.footerLinkHit}>
          <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>{t.footerComponents}</RNText>
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
  localeButtonText: { fontSize: 12, fontWeight: '800' },
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
