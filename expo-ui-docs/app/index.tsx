import { Fragment, createElement, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type {
  ColorScheme,
  DataTableColumn,
  DataTableSort,
  IconRenderProps,
  Theme,
} from '@gj-kit/expo-ui';
import {
  Accordion,
  ActionSheet,
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  ConfirmActionRow,
  ContentFrame,
  DataTable,
  Dialog,
  DialogPanel,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListItem,
  Menu,
  Pagination,
  Popover,
  ProgressBar,
  RadioGroup,
  SearchField,
  Select,
  SelectableRow,
  SelectionIndicator,
  Sheet,
  Slider,
  Skeleton,
  Spinner,
  Surface,
  Switch,
  Tabs,
  Text,
  TextField,
  Toast,
  ToastViewport,
  ToggleGroup,
  Tooltip,
  UiProvider,
  enStrings,
  koStrings,
  useTheme,
  useToastController,
  useToastQueue,
} from '@gj-kit/expo-ui';
import {
  BrandMark,
  FONT_FAMILY,
  Glyph,
  INSTALL_COMMAND,
  MONO_FAMILY,
  NPM_URL,
  elevatedShadow,
  siteIcons,
  siteThemes,
} from '../src/site-theme';
import {
  componentSeoEntries,
  isReleasedComponent,
  publishedPackageVersion,
} from '../src/seo-content';
import { useHydratedWindowWidth } from '../src/responsive';
import { LinkPressable } from '../src/site-link';
import { useLocale } from '../src/locale';
import { landingStrings } from '../src/landing-strings';
import type { DemoCategoryKey, LandingStrings } from '../src/landing-strings';
import { siteStrings } from '../src/site-strings';
import { useDocumentChrome, useSiteColorScheme } from '../src/use-site-color-scheme';
import {
  SeoHead,
  softwareSourceCodeSchema,
  webPageSchema,
  websiteSchema,
} from '../src/seo';

type DemoCategory = DemoCategoryKey;

const DEMO_CATEGORY_ORDER: readonly DemoCategory[] = [
  'actions',
  'forms',
  'controls',
  'selection',
  'layout',
  'status',
  'display',
  'data',
  'feedback',
  'dialog',
];

const SOURCE_COMPONENT_COUNT = componentSeoEntries.length;
const RELEASED_COMPONENT_COUNT = componentSeoEntries.filter(isReleasedComponent).length;
const PREVIEW_COMPONENT_COUNT = SOURCE_COMPONENT_COUNT - RELEASED_COMPONENT_COUNT;

// 미리보기가 0이면 "· 0 preview"는 정보가 아니라 잡음이다.
const RELEASE_BADGE =
  `npm v${publishedPackageVersion} · ${RELEASED_COMPONENT_COUNT} stable` +
  (PREVIEW_COMPONENT_COUNT > 0 ? ` · ${PREVIEW_COMPONENT_COUNT} preview` : '');

function footerLinks(t: LandingStrings): readonly { label: string; href: string }[] {
  return [
    { label: t.footerHome, href: '/' },
    { label: t.footerDocs, href: '/docs' },
    { label: t.footerComponents, href: '/docs/components' },
    { label: t.footerGettingStarted, href: '/docs/getting-started' },
    { label: 'npm ↗', href: NPM_URL },
  ];
}

const COMPONENT_GROUPS = [
  { label: 'Foundation', items: ['Text'] },
  { label: 'Actions', items: ['Button', 'IconButton', 'Link', 'FloatingActionButton'] },
  { label: 'Inputs', items: ['TextField', 'SearchField', 'FormField', 'Select'] },
  { label: 'Navigation', items: ['Tabs', 'Collapsible', 'Pagination'] },
  { label: 'Selection', items: ['SelectionIndicator', 'SelectableRow', 'SelectAllRow', 'Chip'] },
  { label: 'Controls', items: ['Checkbox', 'Switch', 'RadioGroup', 'Slider', 'ToggleGroup'] },
  { label: 'Layout', items: ['Surface', 'ContentFrame', 'Section', 'StickyActionBar', 'Card', 'AspectRatio'] },
  { label: 'Status', items: ['Badge', 'Alert', 'Spinner', 'ProgressBar'] },
  { label: 'Display', items: ['Avatar', 'Divider', 'ListItem', 'Accordion'] },
  { label: 'Data', items: ['DataTable'] },
  { label: 'Feedback', items: ['Skeleton', 'EmptyState', 'ErrorState', 'Toast', 'ToastViewport'] },
  { label: 'Overlay', items: ['Dialog', 'DialogPanel', 'ConfirmActionRow', 'ActionSheet', 'Sheet', 'Popover', 'Tooltip', 'Menu'] },
] as const;


type DataDemoStatus = 'done' | 'pending' | 'failed';

type DataDemoRow = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
  readonly status: DataDemoStatus;
};

type DataDemoColumnId = 'member' | 'amount' | 'status';
type DataDemoSortableColumnId = 'member' | 'amount';

const DATA_DEMO_ROWS: readonly DataDemoRow[] = [
  { id: 'payment-a', member: 'Minseo Kim', amount: 128_000, status: 'done' },
  { id: 'payment-b', member: 'Ada Kim', amount: 84_500, status: 'pending' },
  { id: 'payment-c', member: 'Grace Lee', amount: 212_000, status: 'failed' },
  { id: 'payment-d', member: 'Linus Park', amount: 64_000, status: 'done' },
  { id: 'payment-e', member: 'Margaret Han', amount: 156_500, status: 'pending' },
  { id: 'payment-f', member: 'Alan Choi', amount: 98_000, status: 'done' },
  { id: 'payment-g', member: 'Evelyn Seo', amount: 310_000, status: 'failed' },
];

function formatAmount(amount: number): string {
  // 금액 단위는 데모 데이터의 일부라 로케일과 무관하게 유지한다.
  return `₩${amount.toLocaleString('en-US')}`;
}

const DATA_DEMO_PAGE_SIZE = 3;

// `as const`로 리터럴을 유지해야 DataTable이 sortable 컬럼 id를 좁혀 추론한다.
// 넓어지면 onSortChange가 'status'까지 포함한 유니언을 넘긴다.
function dataDemoColumns(t: LandingStrings) {
  return [
    {
      id: 'member',
      header: t.demoTableColumnMember,
      flex: 2,
      sortable: true,
      getTextValue: ({ row }) => row.member,
    },
    {
      id: 'amount',
      header: t.demoTableColumnAmount,
      width: 116,
      align: 'end',
      sortable: true,
      firstSortDirection: 'descending',
      getTextValue: ({ row }) => `${formatAmount(row.amount)}`,
    },
    {
      id: 'status',
      header: t.demoTableColumnStatus,
      flex: 1,
      getTextValue: ({ row }) => t.demoTableStatus[row.status],
    },
  ] as const satisfies readonly DataTableColumn<DataDemoRow, DataDemoColumnId, string>[];
}

export default function Home(): ReactElement {
  const { colorScheme, setColorScheme } = useSiteColorScheme();
  const { locale } = useLocale();
  const t = landingStrings(locale);
  useDocumentChrome(siteThemes[colorScheme].colors.background);

  return (
    <>
      <SeoHead
        title={t.metaTitle}
        description={t.metaDescription}
        path="/"
        locale={locale}
        schemas={[
          websiteSchema(),
          softwareSourceCodeSchema(publishedPackageVersion),
          webPageSchema({
            path: '/',
            title: t.metaTitle,
            description: t.schemaDescription,
            locale,
          }),
        ]}
      />
      <UiProvider
        theme={siteThemes}
        colorScheme={colorScheme}
        strings={locale === 'ko' ? koStrings : enStrings}
        icons={siteIcons}
      >
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Landing
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
        />
      </UiProvider>
    </>
  );
}

function Landing({
  colorScheme,
  onColorSchemeChange,
}: {
  colorScheme: ColorScheme;
  onColorSchemeChange: (scheme: ColorScheme) => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  const width = useHydratedWindowWidth();
  const desktop = width >= 960;
  const compact = width < 680;
  const [heroTab, setHeroTab] = useState<'today' | 'week'>('today');
  const [heroSelected, setHeroSelected] = useState(true);
  const [category, setCategory] = useState<DemoCategory>('actions');
  const [query, setQuery] = useState('');
  const [projectName, setProjectName] = useState('My Expo App');
  const [selected, setSelected] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast, showToast } = useToastController({ durationMs: 2200 });

  const toggleTheme = () =>
    onColorSchemeChange(colorScheme === 'light' ? 'dark' : 'light');

  const copy = async (value: string, key: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    }
    setCopied(key);
    showToast({ message: t.copiedToast, variant: 'success' });
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <SiteHeader
        compact={compact}
        colorScheme={colorScheme}
        onToggleTheme={toggleTheme}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View nativeID="top">
          <Hero
            compact={compact}
            desktop={desktop}
            colorScheme={colorScheme}
            heroSelected={heroSelected}
            heroTab={heroTab}
            copied={copied === 'install'}
            onCopyInstall={() => copy(INSTALL_COMMAND, 'install')}
            onHeroSelectedChange={setHeroSelected}
            onHeroTabChange={setHeroTab}
          />
        </View>

        <ProofStrip />

        <View nativeID="why">
          <TypeSafetySection desktop={desktop} />
        </View>

        <View nativeID="components">
          <ComponentsSection
            category={category}
            compact={compact}
            desktop={desktop}
            actionSheetVisible={actionSheetVisible}
            dialogVisible={dialogVisible}
            sheetOpen={sheetOpen}
            projectName={projectName}
            query={query}
            selected={selected}
            copied={copied === 'demo'}
            onCategoryChange={setCategory}
            onCloseActionSheet={() => setActionSheetVisible(false)}
            onCloseDialog={() => setDialogVisible(false)}
            onCloseSheet={() => setSheetOpen(false)}
            onCopyCode={() => copy(t.componentsSnippets[category], 'demo')}
            onOpenDialog={() => setDialogVisible(true)}
            onOpenSheet={() => setSheetOpen(true)}
            onOpenActionSheet={() => setActionSheetVisible(true)}
            onProjectNameChange={setProjectName}
            onQueryChange={setQuery}
            onSelectedChange={setSelected}
            onShowToast={(message, variant) => showToast({ message, variant })}
          />
        </View>

        <View nativeID="theme">
          <ThemeSection
            colorScheme={colorScheme}
            desktop={desktop}
            copied={copied === 'quick-start'}
            onCopy={() => copy(t.quickStartCode, 'quick-start')}
            onColorSchemeChange={onColorSchemeChange}
          />
        </View>

        <PlatformSection desktop={desktop} />

        <FinalCta
          compact={compact}
          copied={copied === 'install-bottom'}
          onCopy={() => copy(INSTALL_COMMAND, 'install-bottom')}
        />

        <SiteFooter />
      </ScrollView>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          bottomOffset={24}
          containerStyle={styles.toast}
        />
      ) : null}
    </View>
  );
}

function SiteHeader({
  compact,
  colorScheme,
  onToggleTheme,
}: {
  compact: boolean;
  colorScheme: ColorScheme;
  onToggleTheme: () => void;
}): ReactElement {
  const theme = useTheme();
  const { locale, toggleLocale } = useLocale();
  const t = landingStrings(locale);
  const nav = siteStrings(locale);
  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.colors.background,
          borderBottomColor: theme.colors.line,
        },
      ]}
    >
      <ContentFrame maxWidth={1180} center padding={compact ? 16 : 20} style={styles.headerFrame}>
        <View style={styles.headerRow}>
          <LinkPressable
            href="/"
            accessibilityLabel={t.homeLabel}
            style={styles.brand}
          >
            <BrandMark size={34} />
            <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
          </LinkPressable>

          {!compact ? (
            <View style={styles.navLinks}>
              <NavLink label={t.navWhy} targetId="why" />
              <NavLink label={t.navComponents} targetId="components" />
              <NavLink label={t.navTheme} targetId="theme" />
            </View>
          ) : null}

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={locale === 'en' ? nav.toKorean : nav.toEnglish}
              onPress={toggleLocale}
              style={({ pressed }) => [
                styles.themeButton,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
                pressed ? styles.pressed : null,
              ]}
            >
              <RNText style={[styles.localeGlyph, { color: theme.colors.text }]}>
                {locale === 'en' ? '한' : 'EN'}
              </RNText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={colorScheme === 'light' ? nav.toDark : nav.toLight}
              onPress={onToggleTheme}
              style={({ pressed }) => [
                styles.themeButton,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
                pressed ? styles.pressed : null,
              ]}
            >
              <RNText style={[styles.themeGlyph, { color: theme.colors.text }]}>
                {colorScheme === 'light' ? '☾' : '☀'}
              </RNText>
            </Pressable>
            <SiteButton compact={compact} label={nav.docs} href="/docs" />
          </View>
        </View>
      </ContentFrame>
    </View>
  );
}

/**
 * 같은 페이지 안의 섹션 앵커. expo-router의 <Link href="#why">는 웹에서
 * preventDefault로 브라우저의 네이티브 앵커 점프를 막은 뒤 스크롤 없는 라우터
 * 네비게이션만 수행해, 클릭해도 아무 일도 일어나지 않았다. 섹션에 실제 id가
 * 있으므로 평범한 <a>를 쓰면 브라우저가 알아서 처리한다.
 */
function NavLink({ label, targetId }: { label: string; targetId: string }): ReactElement {
  const theme = useTheme();
  const content = (
    <RNText style={[styles.navLabel, { color: theme.colors.textMuted }]}>{label}</RNText>
  );

  if (Platform.OS === 'web') {
    return createElement(
      'a',
      {
        href: `#${targetId}`,
        style: {
          alignItems: 'center',
          display: 'flex',
          minHeight: 40,
          padding: '10px 14px',
          textDecoration: 'none',
        },
      },
      content,
    );
  }
  return <View style={styles.navLink}>{content}</View>;
}

function Hero({
  compact,
  desktop,
  colorScheme,
  heroSelected,
  heroTab,
  copied,
  onCopyInstall,
  onHeroSelectedChange,
  onHeroTabChange,
}: {
  compact: boolean;
  desktop: boolean;
  colorScheme: ColorScheme;
  heroSelected: boolean;
  heroTab: 'today' | 'week';
  copied: boolean;
  onCopyInstall: () => void;
  onHeroSelectedChange: (value: boolean) => void;
  onHeroTabChange: (value: 'today' | 'week') => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <View style={styles.heroShell}>
      <View
        style={[
          styles.heroGlow,
          { backgroundColor: theme.colors.primarySoft, pointerEvents: 'none' },
        ]}
      />
      <ContentFrame maxWidth={1180} center padding={compact ? 20 : 28} style={styles.heroFrame}>
        <View style={[styles.heroGrid, desktop ? styles.heroGridDesktop : null]}>
          <View style={[styles.heroCopyColumn, desktop ? styles.heroCopyDesktop : null]}>
            <View
              style={[
                styles.releaseBadge,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
              ]}
            >
              <View style={[styles.releaseDot, { backgroundColor: '#9FF5D1' }]} />
              <RNText style={[styles.releaseText, { color: theme.colors.textMuted }]}>{RELEASE_BADGE}</RNText>
              <RNText style={[styles.releaseArrow, { color: theme.colors.primary }]}>↗</RNText>
            </View>

            <RNText
              accessibilityRole="header"
              aria-level={1}
              style={[
                styles.heroTitle,
                compact ? styles.heroTitleCompact : null,
                { color: theme.colors.text },
              ]}
            >
              {t.heroTitleLead}{compact ? '\n' : ' '}<RNText style={{ color: theme.colors.primary }}>{t.heroTitleAccent}</RNText>
            </RNText>
            <RNText style={[styles.heroDescription, { color: theme.colors.textMuted }]}> 
              {t.heroDescription}
            </RNText>

            <InstallBar copied={copied} onCopy={onCopyInstall} />

            <View style={styles.heroActions}>
              <SiteButton label={t.heroCtaStart} href="/docs/getting-started" showArrow />
              <SiteButton
                label={t.heroCtaComponents}
                variant="secondary"
                href="/docs/components"
              />
            </View>

            <View style={styles.inlineProofs}>
              {t.heroProofs.map((item) => (
                <View key={item} style={styles.inlineProof}>
                  <RNText style={{ color: theme.colors.success, fontWeight: '800' }}>✓</RNText>
                  <RNText style={[styles.inlineProofText, { color: theme.colors.textMuted }]}>{item}</RNText>
                </View>
              ))}
            </View>
          </View>

          <HeroPreview
            colorScheme={colorScheme}
            compact={compact}
            selected={heroSelected}
            tab={heroTab}
            onSelectedChange={onHeroSelectedChange}
            onTabChange={onHeroTabChange}
          />
        </View>
      </ContentFrame>
    </View>
  );
}

function HeroPreview({
  compact,
  colorScheme,
  selected,
  tab,
  onSelectedChange,
  onTabChange,
}: {
  compact: boolean;
  colorScheme: ColorScheme;
  selected: boolean;
  tab: 'today' | 'week';
  onSelectedChange: (value: boolean) => void;
  onTabChange: (value: 'today' | 'week') => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  const nav = siteStrings(useLocale().locale);
  return (
    <View
      style={[
        styles.previewStage,
        compact ? styles.previewStageCompact : null,
        { borderColor: colorScheme === 'dark' ? '#30344C' : '#252941' },
      ]}
    >
      <View style={[styles.previewOrbOne, { pointerEvents: 'none' }]} />
      <View style={[styles.previewOrbTwo, { pointerEvents: 'none' }]} />
      <View style={styles.previewTopline}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <RNText style={styles.liveText}>{nav.livePreview}</RNText>
        </View>
        <RNText style={styles.previewMode}>{colorScheme === 'dark' ? 'DARK' : 'LIGHT'} THEME</RNText>
      </View>

      <View style={[styles.phone, { backgroundColor: theme.colors.background, borderColor: theme.colors.line }]}> 
        <View style={styles.phoneTopbar}>
          <View>
            <Text role="caption" color="textMuted">{t.previewDate}</Text>
            <RNText style={[styles.phoneTitle, { color: theme.colors.text }]}>{t.previewTitle}</RNText>
          </View>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}> 
            <RNText style={styles.avatarText}>G</RNText>
          </View>
        </View>

        <SearchField value="" onChangeText={() => undefined} placeholder={t.previewSearchPlaceholder} />

        <Surface padding="lg" radius="lg" style={styles.focusCard}>
          <View style={styles.focusCardTop}>
            <View style={[styles.focusIcon, { backgroundColor: theme.colors.primarySoft }]}> 
              <RNText style={{ color: theme.colors.primary, fontWeight: '800' }}>✦</RNText>
            </View>
            <View style={styles.focusCopy}>
              <Text role="label">{t.previewFocusTitle}</Text>
              <Text role="caption" color="textMuted">{t.previewFocusCaption}</Text>
            </View>
            <SelectionIndicator selected={selected} size={20} />
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceSubtle }]}> 
            <View style={[styles.progressFill, { backgroundColor: theme.colors.primary }]} />
          </View>
        </Surface>

        <Tabs
          accessibilityLabel={t.previewRangeLabel}
          items={[
            { label: t.previewToday, value: 'today' },
            { label: t.previewWeek, value: 'week' },
          ] as const}
          value={tab}
          onChange={onTabChange}
          panels={{
            today: (
              <View style={styles.phoneList}>
                <SelectableRow selected={selected} onPress={() => onSelectedChange(!selected)}>
                  <View style={styles.rowCopy}>
                    <Text role="label">{t.previewTodayRows[0]?.title}</Text>
                    <Text role="caption" color="textMuted">{t.previewTodayRows[0]?.caption}</Text>
                  </View>
                </SelectableRow>
                <SelectableRow selected={false} onPress={() => onSelectedChange(true)}>
                  <View style={styles.rowCopy}>
                    <Text role="label">{t.previewTodayRows[1]?.title}</Text>
                    <Text role="caption" color="textMuted">{t.previewTodayRows[1]?.caption}</Text>
                  </View>
                </SelectableRow>
              </View>
            ),
            week: (
              <View style={styles.phoneList}>
                <SelectableRow selected onPress={() => onSelectedChange(false)}>
                  <View style={styles.rowCopy}>
                    <Text role="label">{t.previewWeekRow.title}</Text>
                    <Text role="caption" color="textMuted">{t.previewWeekRow.caption}</Text>
                  </View>
                </SelectableRow>
              </View>
            ),
          }}
        />

        <Button label={selected ? t.previewCtaDone : t.previewCtaPick} onPress={() => onSelectedChange(!selected)} />
      </View>

      <View style={styles.typeSafeChip}>
        <View style={styles.typeSafeIcon}>
          <RNText style={styles.typeSafeCheck}>✓</RNText>
        </View>
        <View>
          <RNText style={styles.typeSafeTitle}>Type-safe props</RNText>
          <RNText style={styles.typeSafeCaption}>invalid states rejected</RNText>
        </View>
      </View>
    </View>
  );
}

function ProofStrip(): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  const proofs = [
    { value: String(SOURCE_COMPONENT_COUNT), label: t.proofSourceComponents },
    { value: '31', label: t.proofColorRoles },
    { value: '0', label: t.proofRuntimeDeps },
    { value: '625', label: t.proofTests },
  ];
  return (
    <ContentFrame maxWidth={1180} center padding={20} style={styles.proofFrame}>
      <View style={[styles.proofStrip, { borderColor: theme.colors.line }]}> 
        {proofs.map((proof, index) => (
          <View
            key={proof.label}
            style={[
              styles.proofItem,
              index > 0 ? { borderLeftColor: theme.colors.line, borderLeftWidth: 1 } : null,
            ]}
          >
            <RNText style={[styles.proofValue, { color: theme.colors.text }]}>{proof.value}</RNText>
            <RNText style={[styles.proofLabel, { color: theme.colors.textMuted }]}>{proof.label}</RNText>
          </View>
        ))}
      </View>
    </ContentFrame>
  );
}

function TypeSafetySection({ desktop }: { desktop: boolean }): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <SectionShell>
      <SectionEyebrow>TYPE CONTRACTS</SectionEyebrow>
      <SectionHeading
        title={t.typeSafetyTitle}
        description={t.typeSafetyDescription}
      />

      <View style={[styles.contractGrid, desktop ? styles.twoColumns : null]}>
        <View
          style={[
            styles.contractCard,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          ]}
        >
          <View style={styles.contractHeader}>
            <View style={[styles.contractStatus, { backgroundColor: theme.colors.dangerSoft }]}> 
              <RNText style={[styles.contractStatusText, { color: theme.colors.dangerStrong }]}>TYPE ERROR</RNText>
            </View>
            <RNText style={[styles.contractMeta, { color: theme.colors.textMuted }]}>IconButton.tsx</RNText>
          </View>
          <CodeLines
            lines={[
              { text: '<IconButton', tone: 'muted' },
              { text: '  icon={Settings}', tone: 'normal' },
              { text: '  onPress={openSettings}', tone: 'normal' },
              { text: '/>', tone: 'muted' },
            ]}
          />
          <View style={[styles.errorMessage, { backgroundColor: theme.colors.dangerSoft }]}> 
            <RNText style={[styles.errorText, { color: theme.colors.dangerStrong }]}>{t.typeSafetyErrorMessage}</RNText>
          </View>
        </View>

        <View
          style={[
            styles.contractCard,
            styles.contractCardGood,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary },
          ]}
        >
          <View style={styles.contractHeader}>
            <View style={[styles.contractStatus, { backgroundColor: theme.colors.primarySoft }]}> 
              <RNText style={[styles.contractStatusText, { color: theme.colors.primary }]}>CONTRACT MET</RNText>
            </View>
            <RNText style={[styles.contractMeta, { color: theme.colors.textMuted }]}>IconButton.tsx</RNText>
          </View>
          <CodeLines
            lines={[
              { text: '<IconButton', tone: 'muted' },
              { text: t.typeSafetyLabelLine, tone: 'accent' },
              { text: '  icon={Settings}', tone: 'normal' },
              { text: '  onPress={openSettings}', tone: 'normal' },
              { text: '/>', tone: 'muted' },
            ]}
          />
          <View style={[styles.errorMessage, { backgroundColor: theme.colors.primarySoft }]}> 
            <RNText style={[styles.errorText, { color: theme.colors.primary }]}>{t.typeSafetyOkMessage}</RNText>
          </View>
        </View>
      </View>

      <View style={[styles.featureGrid, desktop ? styles.threeColumns : null]}>
        {t.typeSafetyFeatures.map((feature) => (
          <FeatureCard
            key={feature.title}
            symbol={feature.symbol}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </View>
    </SectionShell>
  );
}

function ComponentsSection({
  actionSheetVisible,
  category,
  compact,
  desktop,
  dialogVisible,
  sheetOpen,
  projectName,
  query,
  selected,
  copied,
  onCategoryChange,
  onCloseActionSheet,
  onCloseDialog,
  onCloseSheet,
  onCopyCode,
  onOpenDialog,
  onOpenSheet,
  onOpenActionSheet,
  onProjectNameChange,
  onQueryChange,
  onSelectedChange,
  onShowToast,
}: {
  actionSheetVisible: boolean;
  category: DemoCategory;
  compact: boolean;
  desktop: boolean;
  dialogVisible: boolean;
  sheetOpen: boolean;
  projectName: string;
  query: string;
  selected: boolean;
  copied: boolean;
  onCategoryChange: (category: DemoCategory) => void;
  onCloseActionSheet: () => void;
  onCloseDialog: () => void;
  onCloseSheet: () => void;
  onCopyCode: () => void;
  onOpenDialog: () => void;
  onOpenSheet: () => void;
  onOpenActionSheet: () => void;
  onProjectNameChange: (name: string) => void;
  onQueryChange: (query: string) => void;
  onSelectedChange: (selected: boolean) => void;
  onShowToast: (message: string, variant: 'error' | 'success' | 'info' | 'warning') => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <View style={{ backgroundColor: theme.colors.surface }}>
      <SectionShell>
        <SectionEyebrow>COMPONENTS</SectionEyebrow>
        <SectionHeading
          title={t.componentsTitle}
          description={t.componentsDescription}
          aside={
            <SiteButton
              label={t.componentsNpmCta}
              variant="secondary"
              href={NPM_URL}
              showArrow
            />
          }
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {DEMO_CATEGORY_ORDER.map((value) => {
            const active = value === category;
            return (
              <Pressable
                key={value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onCategoryChange(value)}
                style={({ pressed }) => [
                  styles.categoryChip,
                  {
                    backgroundColor: active ? theme.colors.text : theme.colors.background,
                    borderColor: active ? theme.colors.text : theme.colors.line,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                <RNText
                  style={[
                    styles.categoryLabel,
                    { color: active ? theme.colors.background : theme.colors.textMuted },
                  ]}
                >
                  {t.componentsCategories[value]}
                </RNText>
              </Pressable>
            );
          })}
        </ScrollView>

        <View
          style={[
            styles.playground,
            desktop ? styles.playgroundDesktop : null,
            { backgroundColor: theme.colors.background, borderColor: theme.colors.line },
          ]}
        >
          <View style={[styles.demoCanvas, desktop ? styles.demoCanvasDesktop : null]}>
            <View style={styles.demoCanvasHeader}>
              <View>
                <RNText style={[styles.demoTitle, { color: theme.colors.text }]}>Live canvas</RNText>
                <RNText style={[styles.demoCaption, { color: theme.colors.textMuted }]}>{t.componentsCanvasCaption}</RNText>
              </View>
              <View style={[styles.canvasDots, { borderColor: theme.colors.line }]}> 
                <View style={[styles.canvasDot, { backgroundColor: theme.colors.primary }]} />
                <View style={[styles.canvasDot, { backgroundColor: theme.colors.warning }]} />
                <View style={[styles.canvasDot, { backgroundColor: theme.colors.success }]} />
              </View>
            </View>
            <View style={styles.demoBody}>
              <ComponentDemo
                category={category}
                projectName={projectName}
                query={query}
                selected={selected}
                onProjectNameChange={onProjectNameChange}
                onQueryChange={onQueryChange}
                onSelectedChange={onSelectedChange}
                onOpenDialog={onOpenDialog}
                onOpenSheet={onOpenSheet}
                onOpenActionSheet={onOpenActionSheet}
                onShowToast={onShowToast}
              />
            </View>
          </View>

          <View
            style={[
              styles.demoCode,
              desktop ? styles.demoCodeDesktop : null,
              { backgroundColor: '#0F111B' },
            ]}
          >
            <View style={styles.codeHeader}>
              <RNText style={styles.codeFilename}>example.tsx</RNText>
              <CopyButton dark copied={copied} onPress={onCopyCode} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <RNText selectable style={styles.codeBlockText}>{t.componentsSnippets[category]}</RNText>
            </ScrollView>
            <View style={styles.codeFooter}>
              <View style={styles.codeStatusDot} />
              <RNText style={styles.codeStatus}>TypeScript · no errors</RNText>
            </View>
          </View>
        </View>

        <View style={styles.componentIndex}>
          <RNText style={[styles.componentIndexTitle, { color: theme.colors.text }]}>{t.componentsIndexTitle(SOURCE_COMPONENT_COUNT)}</RNText>
          <View style={styles.componentGroups}>
            {COMPONENT_GROUPS.map((group) => (
              <View
                key={group.label}
                style={[
                  styles.componentGroup,
                  compact ? styles.componentGroupCompact : null,
                  { borderColor: theme.colors.line },
                ]}
              >
                <RNText style={[styles.groupLabel, { color: theme.colors.textMuted }]}>{group.label}</RNText>
                <View style={styles.componentNames}>
                  {group.items.map((item) => (
                    <RNText key={item} style={[styles.componentName, { color: theme.colors.text }]}>{item}</RNText>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      </SectionShell>

      <Dialog visible={dialogVisible} onDismiss={onCloseDialog}>
        <DialogPanel
          title={t.dialogTitle}
          description={t.dialogDescription}
        >
          <ConfirmActionRow
            destructive
            cancelLabel={t.dialogCancel}
            confirmLabel={t.dialogConfirm}
            onCancel={onCloseDialog}
            onConfirm={() => {
              onCloseDialog();
              onShowToast(t.dialogToast, 'info');
            }}
          />
        </DialogPanel>
      </Dialog>
      <ActionSheet
        visible={actionSheetVisible}
        title={t.actionSheetTitle}
        description={t.actionSheetDescription}
        items={[
          { value: 'duplicate', label: t.actionSheetDuplicate },
          { value: 'delete', label: t.actionSheetDelete, description: t.actionSheetDeleteHint, destructive: true },
        ] as const}
        onDismiss={(detail) => {
          onCloseActionSheet();
          if (detail.reason === 'action-select') {
            onShowToast(t.actionSheetToast(detail.value), 'info');
          }
        }}
      />
      <Sheet
        open={sheetOpen}
        title={t.sheetTitle}
        description={t.sheetDescription}
        footer={(
          <Button
            label={t.sheetSave}
            onPress={() => {
              onCloseSheet();
              onShowToast(t.sheetToast, 'success');
            }}
          />
        )}
        onOpenChange={(next: boolean) => {
          if (!next) onCloseSheet();
        }}
      >
        <TextField
          label={t.sheetProjectName}
          value={projectName}
          onChangeText={onProjectNameChange}
        />
        <Text role="caption" color="textMuted">
          {t.sheetCaption}
        </Text>
      </Sheet>
    </View>
  );
}

function ComponentDemo({
  category,
  projectName,
  query,
  selected,
  onProjectNameChange,
  onQueryChange,
  onSelectedChange,
  onOpenDialog,
  onOpenSheet,
  onOpenActionSheet,
  onShowToast,
}: {
  category: DemoCategory;
  projectName: string;
  query: string;
  selected: boolean;
  onProjectNameChange: (name: string) => void;
  onQueryChange: (query: string) => void;
  onSelectedChange: (selected: boolean) => void;
  onOpenDialog: () => void;
  onOpenSheet: () => void;
  onOpenActionSheet: () => void;
  onShowToast: (message: string, variant: 'error' | 'success' | 'info' | 'warning') => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  const [demoTab, setDemoTab] = useState<'preview' | 'code'>('preview');
  const [checked, setChecked] = useState<boolean | 'mixed'>('mixed');
  const [switchEnabled, setSwitchEnabled] = useState(true);
  const [channel, setChannel] = useState<'push' | 'email' | 'sms'>('push');
  const [volume, setVolume] = useState(60);
  const [density, setDensity] = useState<'comfortable' | 'compact' | 'spacious'>('comfortable');
  const [openSection, setOpenSection] = useState<'overview' | 'accessibility' | null>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [compactView, setCompactView] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const [releaseChannel, setReleaseChannel] = useState<'stable' | 'preview' | null>('stable');
  const [dataSort, setDataSort] = useState<DataTableSort<DataDemoSortableColumnId> | null>(null);
  const [dataPage, setDataPage] = useState(1);
  const [selectedPaymentKeys, setSelectedPaymentKeys] = useState<readonly string[]>([
    'payment-a',
  ]);
  const toastQueue = useToastQueue({ defaultDurationMs: 3_600, maxQueued: 3, maxVisible: 2 });
  const icon = (props: IconRenderProps) => <Glyph {...props}>✦</Glyph>;
  const dataColumns = dataDemoColumns(t);
  const visibleDataRows = DATA_DEMO_ROWS.slice(
    (dataPage - 1) * DATA_DEMO_PAGE_SIZE,
    dataPage * DATA_DEMO_PAGE_SIZE,
  );

  switch (category) {
    case 'actions':
      return (
        <View style={styles.demoStack}>
          <View style={styles.demoRow}>
            <Button label={t.demoSave} onPress={() => onShowToast(t.demoSaveToast, 'success')} />
            <Button label={t.demoPreview} variant="secondary" onPress={() => onShowToast(t.demoPreviewToast, 'info')} />
          </View>
          <View style={styles.demoRow}>
            <Button label={t.demoDelete} size="sm" variant="destructive-outline" onPress={onOpenDialog} />
            <Button label={t.demoSyncing} size="sm" loading />
            <IconButton accessibilityLabel={t.demoFavorite} icon={icon} onPress={() => onShowToast(t.demoFavoriteToast, 'success')} />
          </View>
          <Text role="caption" color="textMuted">{t.demoActionsCaption}</Text>
        </View>
      );
    case 'forms':
      return (
        <View style={styles.demoStack}>
          <SearchField value={query} onChangeText={onQueryChange} />
          <TextField
            label={t.sheetProjectName}
            value={projectName}
            onChangeText={onProjectNameChange}
            counter={`${projectName.length}/30`}
            helperText={t.demoProjectNameHelper}
          />
          <Tabs
            accessibilityLabel={t.demoViewLabel}
            items={[
              { label: 'Preview', value: 'preview' },
              { label: 'Code', value: 'code' },
            ] as const}
            value={demoTab}
            onChange={setDemoTab}
            panels={{
              preview: (
                <Text role="caption" color="textMuted">
                  {t.demoPreviewPanel}
                </Text>
              ),
              code: (
                <Text role="caption" color="textMuted">
                  {t.demoCodePanel}
                </Text>
              ),
            }}
            panelStyle={{ paddingTop: theme.spacing.md }}
          />
        </View>
      );
    case 'controls':
      return (
        <Surface radius="lg" padding="xl" style={styles.selectionCard}>
          <Text role="title">{t.demoNotificationPrefs}</Text>
          <Checkbox
            checked={checked}
            onCheckedChange={setChecked}
            label={t.demoTermsLabel}
            description={t.demoTermsDescription}
          />
          <Switch
            value={switchEnabled}
            onValueChange={setSwitchEnabled}
            label={t.demoNewsLabel}
            description={t.demoNewsDescription}
          />
          <RadioGroup
            items={[
              { label: t.demoChannelPush, value: 'push' },
              { label: t.demoChannelEmail, value: 'email' },
              { label: t.demoChannelSms, value: 'sms', disabled: true },
            ] as const}
            value={channel}
            onValueChange={setChannel}
            accessibilityLabel={t.demoChannelLabel}
            orientation="horizontal"
          />
          <View style={styles.demoStack}>
            <View style={styles.sliderLabelRow}>
              <Text role="label">{t.demoVolumeLabel}</Text>
              <Text role="caption" color="textMuted">{volume}%</Text>
            </View>
            <Slider
              value={volume}
              min={0}
              max={100}
              step={5}
              accessibilityLabel={t.demoVolumeLabel}
              onValueChange={setVolume}
            />
            <ToggleGroup
              selectionMode="single"
              value={density}
              onValueChange={(next) => setDensity(next ?? 'comfortable')}
              accessibilityLabel={t.demoDensityLabel}
              allowEmpty={false}
              items={[
                { label: t.demoDensitySpacious, value: 'spacious' },
                { label: t.demoDensityComfortable, value: 'comfortable' },
                { label: t.demoDensityCompact, value: 'compact' },
              ] as const}
              size="sm"
            />
          </View>
        </Surface>
      );
    case 'selection':
      return (
        <Surface radius="lg" padding="xl" style={styles.selectionCard}>
          <Text role="title">{t.demoSelectionTitle}</Text>
          <Text role="caption" color="textMuted">{t.demoSelectionCaption}</Text>
          <SelectableRow selected={selected} onPress={() => onSelectedChange(!selected)}>
            <View style={styles.rowCopy}>
              <Text role="label">{t.demoSelectionRows[0]?.title}</Text>
              <Text role="caption" color="textMuted">{t.demoSelectionRows[0]?.caption}</Text>
            </View>
          </SelectableRow>
          <SelectableRow selected={!selected} onPress={() => onSelectedChange(!selected)}>
            <View style={styles.rowCopy}>
              <Text role="label">{t.demoSelectionRows[1]?.title}</Text>
              <Text role="caption" color="textMuted">{t.demoSelectionRows[1]?.caption}</Text>
            </View>
          </SelectableRow>
        </Surface>
      );
    case 'layout':
      return (
        <View style={styles.demoStack}>
          <Surface padding="xl" radius="lg" elevation="sm">
            <View style={styles.layoutDemoHeader}>
              <View style={[styles.layoutIcon, { backgroundColor: theme.colors.primarySoft }]}> 
                <RNText style={{ color: theme.colors.primary, fontWeight: '800' }}>G</RNText>
              </View>
              <View style={styles.rowCopy}>
                <Text role="title">{t.demoLayoutTitle}</Text>
                <Text role="caption" color="textMuted">padding="xl" · radius="lg" · elevation="sm"</Text>
              </View>
            </View>
          </Surface>
          <View style={styles.tokenRow}>
            {['none', 'sm', 'md', 'lg', 'pill'].map((radius, index) => (
              <View
                key={radius}
                style={[
                  styles.radiusSample,
                  {
                    backgroundColor: theme.colors.primarySoft,
                    borderRadius: [0, 8, 12, 20, 999][index],
                  },
                ]}
              >
                <RNText style={[styles.radiusLabel, { color: theme.colors.primary }]}>{radius}</RNText>
              </View>
            ))}
          </View>
        </View>
      );
    case 'status':
      return (
        <View style={styles.demoStack}>
          <View style={styles.demoRow}>
            <Badge label="Beta" />
            <Badge label="New" variant="info" />
            <Badge label="Saved" variant="success" />
            <Badge label="Attention" variant="warning" />
            <Badge label="Failed" variant="error" />
          </View>
          <Alert title={t.demoAlertTitle} variant="success" live="polite">
            {t.demoAlertBody}
          </Alert>
          <View style={styles.demoStack}>
            <ProgressBar value={72} variant="success" accessibilityLabel={t.demoProgressDocs} />
            <ProgressBar
              value={null}
              variant="info"
              accessibilityLabel={t.demoProgressSync}
              accessibilityValueText={t.demoProgressSyncValue}
            />
            <View style={styles.demoRow}>
              <Spinner accessibilityLabel={t.demoSpinnerLabel} />
              <Text role="caption" color="textMuted">{t.demoStatusCaption}</Text>
            </View>
          </View>
        </View>
      );
    case 'display':
      return (
        <View style={styles.demoStack}>
          <Surface radius="lg" padding="sm">
            <ListItem
              title="Ada Lovelace"
              description="Design systems contributor"
              leading={<Avatar name="Ada Lovelace" decorative />}
              trailing={<Badge label="Core" variant="info" size="sm" />}
              onPress={() => onShowToast(t.demoProfileToast, 'info')}
            />
            <Divider inset="md" />
            <ListItem
              title="Grace Hopper"
              description="Accessibility reviewer"
              leading={<Avatar name="Grace Hopper" decorative />}
              trailing={<Badge label="A11y" variant="success" size="sm" />}
            />
          </Surface>
          <Accordion
            items={[
              {
                value: 'overview',
                title: t.demoAccordion[0]?.title ?? '',
                content: <Text color="textMuted">{t.demoAccordion[0]?.content}</Text>,
              },
              {
                value: 'accessibility',
                title: t.demoAccordion[1]?.title ?? '',
                content: <Text color="textMuted">{t.demoAccordion[1]?.content}</Text>,
              },
            ] as const}
            value={openSection}
            onValueChange={setOpenSection}
          />
        </View>
      );
    case 'data':
      return (
        <View style={styles.dataDemo}>
          <DataTable
            caption={t.demoTableCaption}
            description={t.demoTableDescription}
            state={{ status: 'ready', rows: visibleDataRows }}
            columns={dataColumns}
            getRowKey={(row) => row.id}
            rowHeaderColumnId="member"
            sort={dataSort}
            onSortChange={(next) => {
              setDataSort(next);
              const column =
                next?.columnId === 'amount' ? t.demoTableColumnAmount : t.demoTableColumnMember;
              const direction =
                next?.direction === 'ascending' ? t.demoTableAscending : t.demoTableDescending;
              onShowToast(
                next === null
                  ? t.demoTableSortCleared
                  : t.demoTableSortRequested(column, direction),
                'info',
              );
            }}
            selection={{
              selectedRowKeys: selectedPaymentKeys,
              onSelectionChange: setSelectedPaymentKeys,
              getRowSelectionAccessibilityLabel: ({ row }) => t.demoTableRowSelectLabel(row.member),
              isRowSelectionDisabled: ({ row }) => row.status === 'failed',
              selectAllAccessibilityLabel: t.demoTableSelectAll,
              clearSelectionAccessibilityLabel: t.demoTableClearSelection,
            }}
            presentation="auto"
            renderListRow={({ row }) => (
              <View style={styles.dataListRow}>
                <View style={styles.rowCopy}>
                  <Text role="label">{row.member}</Text>
                  <Text role="caption" color="textMuted">
                    {formatAmount(row.amount)} · {t.demoTableStatus[row.status]}
                  </Text>
                </View>
                <Badge
                  label={t.demoTableStatus[row.status]}
                  size="sm"
                  variant={
                    row.status === 'done'
                      ? 'success'
                      : row.status === 'pending'
                        ? 'warning'
                        : 'error'
                  }
                />
              </View>
            )}
            minTableWidth={500}
            size="sm"
            striped
            variant="outline"
            style={styles.dataTable}
          />
          <Text role="caption" color="textMuted" style={styles.dataSelectionSummary}>
            {t.demoTableSelectionSummary(selectedPaymentKeys.length)}
          </Text>
          <Pagination
            mode="numbered"
            countMode="items"
            accessibilityLabel={t.demoPaginationLabel}
            page={dataPage}
            totalItemCount={DATA_DEMO_ROWS.length}
            pageSize={DATA_DEMO_PAGE_SIZE}
            siblingCount={0}
            size="sm"
            getPageAccessibilityLabel={({ page, current }) => t.demoPageLabel(page, current)}
            onPageChange={setDataPage}
            style={styles.dataPagination}
          />
        </View>
      );
    case 'feedback':
      return (
        <View style={styles.demoStack}>
          <View style={styles.feedbackDemoRow}>
            <EmptyState
              title={t.demoEmptyTitle}
              body={t.demoEmptyBody}
              action={{ label: t.demoEmptyAction, onPress: () => onShowToast(t.demoEmptyToast, 'success') }}
              style={styles.feedbackItem}
            />
            <ErrorState
              message={t.demoErrorMessage}
              onRetry={() => onShowToast(t.demoErrorToast, 'info')}
              style={styles.feedbackItem}
            />
          </View>
          <Surface padding="lg">
            <View style={styles.skeletonRow}>
              <Skeleton radius="pill" style={styles.skeletonAvatar} />
              <View style={styles.skeletonLines}>
                <Skeleton style={styles.skeletonLong} />
                <Skeleton style={styles.skeletonShort} />
              </View>
            </View>
          </Surface>
          <Surface padding="lg" style={styles.demoStack}>
            <Text role="label">{t.demoQueueTitle}</Text>
            <Text role="caption" color="textMuted">
              {t.demoQueueCaption}
            </Text>
            <Button
              label={t.demoQueueButton}
              size="sm"
              onPress={() => toastQueue.show({ message: t.demoQueueToast, variant: 'success' })}
            />
          </Surface>
          <ToastViewport
            toasts={toastQueue.visibleToasts}
            onDismiss={toastQueue.dismiss}
            onPause={toastQueue.pause}
            onResume={toastQueue.resume}
            placement="top"
            offset={20}
          />
        </View>
      );
    case 'dialog':
      return (
        <View style={styles.dialogDemo}>
          <View style={[styles.dialogIllustration, { backgroundColor: theme.colors.primarySoft }]}> 
            <RNText style={[styles.dialogIllustrationMark, { color: theme.colors.primary }]}>◇</RNText>
          </View>
          <Text role="title">{t.demoOverlayTitle}</Text>
          <Text role="body" color="textMuted" style={styles.dialogDemoCopy}>
            {t.demoOverlayCopy}
          </Text>
          <View style={styles.demoStack}>
            <Select
              label={t.demoReleaseChannel}
              placeholder={t.demoReleaseChannelPlaceholder}
              items={[
                { value: 'stable', label: 'Stable' },
                { value: 'preview', label: 'Preview', description: t.demoReleaseChannelPreviewHint },
              ] as const}
              value={releaseChannel}
              onValueChange={setReleaseChannel}
              open={selectOpen}
              onOpenChange={(next) => setSelectOpen(next)}
              size="sm"
            />
            <Menu
              triggerLabel={t.demoMenuTrigger}
              items={[
                { kind: 'action', value: 'duplicate', label: t.demoMenuDuplicate },
                { kind: 'checkbox', value: 'compact', label: t.demoMenuCompact, checked: compactView },
                { kind: 'action', value: 'delete', label: t.demoMenuDelete, destructive: true },
              ] as const}
              open={menuOpen}
              onOpenChange={(next) => setMenuOpen(next)}
              onSelect={(detail) => {
                if (detail.kind === 'checkbox') setCompactView(detail.checked);
                if (detail.kind === 'action') onShowToast(t.demoMenuToast(detail.value), 'info');
              }}
              size="sm"
              variant="outlined"
            />
            <View style={styles.demoRow}>
              <Popover
                triggerLabel={t.demoPopoverTrigger}
                title={t.demoPopoverTitle}
                description="controlled rich overlay"
                open={popoverOpen}
                onOpenChange={(next) => setPopoverOpen(next)}
                size="sm"
                variant="outlined"
              >
                <Text>{t.demoPopoverBody}</Text>
              </Popover>
              <Tooltip
                triggerLabel={t.demoTooltipTrigger}
                triggerIcon={icon}
                content={t.demoTooltipContent}
                onPress={() => onShowToast(t.demoTooltipToast, 'info')}
                size="sm"
              />
            </View>
          </View>
          <View style={styles.demoRow}>
            <Button label={t.demoOpenDialog} onPress={onOpenDialog} />
            <Button
              label={t.demoOpenSheet}
              variant="secondary"
              onPress={onOpenSheet}
            />
            <Button
              label={t.demoOpenActionSheet}
              variant="secondary"
              onPress={onOpenActionSheet}
            />
          </View>
        </View>
      );
  }
}

function ThemeSection({
  colorScheme,
  desktop,
  copied,
  onCopy,
  onColorSchemeChange,
}: {
  colorScheme: ColorScheme;
  desktop: boolean;
  copied: boolean;
  onCopy: () => void;
  onColorSchemeChange: (scheme: ColorScheme) => void;
}): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <SectionShell>
      <SectionEyebrow>THEME SYSTEM</SectionEyebrow>
      <SectionHeading
        title={t.themeTitle}
        description={t.themeDescription}
      />

      <View style={[styles.themeGrid, desktop ? styles.twoColumns : null]}>
        <View style={styles.themeStory}>
          <View style={styles.schemeControl}>
            {(['light', 'dark'] as const).map((scheme) => {
              const active = scheme === colorScheme;
              return (
                <Pressable
                  key={scheme}
                  onPress={() => onColorSchemeChange(scheme)}
                  style={[
                    styles.schemeButton,
                    {
                      backgroundColor: active ? theme.colors.text : theme.colors.surface,
                      borderColor: theme.colors.line,
                    },
                  ]}
                >
                  <RNText style={[styles.schemeLabel, { color: active ? theme.colors.background : theme.colors.textMuted }]}> 
                    {scheme === 'light' ? '☀ Light' : '☾ Dark'}
                  </RNText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.swatchGrid}>
            {[
              ['primary', theme.colors.primary],
              ['primarySoft', theme.colors.primarySoft],
              ['surface', theme.colors.surface],
              ['text', theme.colors.text],
              ['success', theme.colors.success],
              ['danger', theme.colors.danger],
            ].map(([name, color]) => (
              <View key={name} style={[styles.swatchCard, { borderColor: theme.colors.line, backgroundColor: theme.colors.surface }]}> 
                <View style={[styles.swatchColor, { backgroundColor: color }]} />
                <View style={styles.swatchCopy}>
                  <RNText style={[styles.swatchName, { color: theme.colors.text }]}>{name}</RNText>
                  <RNText style={[styles.swatchValue, { color: theme.colors.textMuted }]}>{color}</RNText>
                </View>
              </View>
            ))}
          </View>

          <View
            style={[
              styles.themeGuarantee,
              { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.primary },
            ]}
          >
            <RNText style={[styles.themeGuaranteeIcon, { color: theme.colors.primary }]}>✓</RNText>
            <View style={styles.rowCopy}>
              <RNText style={[styles.themeGuaranteeTitle, { color: theme.colors.text }]}>{t.themeGuaranteeTitle}</RNText>
              <RNText style={[styles.themeGuaranteeBody, { color: theme.colors.textMuted }]}>{t.themeGuaranteeBody}</RNText>
            </View>
          </View>
        </View>

        <View style={styles.quickStartCard}>
          <View style={styles.quickStartHeader}>
            <View>
              <RNText style={styles.quickStartEyebrow}>QUICK START</RNText>
              <RNText style={styles.quickStartTitle}>{t.quickStartTitle}</RNText>
            </View>
            <CopyButton dark copied={copied} onPress={onCopy} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <RNText selectable style={styles.quickStartCode}>{t.quickStartCode}</RNText>
          </ScrollView>
          <View style={styles.quickStartFooter}>
            {t.quickStartSteps.map((step, index) => (
              <Fragment key={step}>
                {index > 0 ? <View style={styles.quickStartLine} /> : null}
                <View style={styles.quickStartStep}>
                  <RNText style={styles.quickStartNumber}>{index + 1}</RNText>
                  <RNText style={styles.quickStartStepText}>{step}</RNText>
                </View>
              </Fragment>
            ))}
          </View>
        </View>
      </View>
    </SectionShell>
  );
}

function PlatformSection({ desktop }: { desktop: boolean }): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  const items = t.platformItems;
  return (
    <View style={{ backgroundColor: theme.colors.surface }}>
      <SectionShell>
        <SectionEyebrow>NATIVE-FIRST</SectionEyebrow>
        <SectionHeading
          title={t.platformTitle}
          description={t.platformDescription}
        />
        <View style={[styles.platformGrid, desktop ? styles.threeColumns : null]}>
          {items.map((item) => (
            <View
              key={item.title}
              style={[
                styles.platformCard,
                { backgroundColor: theme.colors.background, borderColor: theme.colors.line },
              ]}
            >
              <View style={styles.platformTop}>
                <RNText style={[styles.platformEyebrow, { color: theme.colors.primary }]}>{item.eyebrow}</RNText>
                <View style={[styles.platformSymbol, { backgroundColor: theme.colors.primarySoft }]}> 
                  <RNText style={[styles.platformSymbolText, { color: theme.colors.primary }]}>{item.symbol}</RNText>
                </View>
              </View>
              <RNText style={[styles.platformTitle, { color: theme.colors.text }]}>{item.title}</RNText>
              <RNText style={[styles.platformDescription, { color: theme.colors.textMuted }]}>{item.description}</RNText>
              <View style={[styles.inlineCode, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}> 
                <RNText selectable style={[styles.inlineCodeText, { color: theme.colors.text }]}>{item.code}</RNText>
              </View>
            </View>
          ))}
        </View>
      </SectionShell>
    </View>
  );
}

function FinalCta({
  compact,
  copied,
  onCopy,
}: {
  compact: boolean;
  copied: boolean;
  onCopy: () => void;
}): ReactElement {
  const t = landingStrings(useLocale().locale);
  return (
    <ContentFrame maxWidth={1180} center padding={compact ? 20 : 28} style={styles.finalFrame}>
      <View style={[styles.finalCta, compact ? styles.finalCtaCompact : null]}>
        <View style={[styles.finalOrb, { pointerEvents: 'none' }]} />
        <View style={styles.finalCopy}>
          <RNText style={styles.finalEyebrow}>BUILD WITH CONFIDENCE</RNText>
          <RNText style={[styles.finalTitle, compact ? styles.finalTitleCompact : null]}>{t.finalTitle}</RNText>
          <RNText style={styles.finalDescription}>{t.finalDescription}</RNText>
        </View>
        <View style={styles.finalActions}>
          <Pressable onPress={onCopy} style={({ pressed }) => [styles.finalInstall, pressed ? styles.pressed : null]}>
            <RNText style={styles.finalPrompt}>$</RNText>
            <RNText selectable style={styles.finalInstallText}>{INSTALL_COMMAND}</RNText>
            <RNText style={styles.finalCopyLabel}>{copied ? 'COPIED' : 'COPY'}</RNText>
          </Pressable>
          <LinkPressable href="/docs/getting-started" style={styles.finalDocs}>
            <RNText style={styles.finalDocsText}>{t.finalDocsLink}</RNText>
            <RNText aria-hidden style={styles.finalDocsArrow}>→</RNText>
          </LinkPressable>
        </View>
      </View>
    </ContentFrame>
  );
}

function SiteFooter(): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <ContentFrame maxWidth={1180} center padding={20} style={styles.footerFrame}>
      <View style={[styles.footer, { borderTopColor: theme.colors.line }]}> 
        <View style={styles.brand}>
          <BrandMark size={30} />
          <View>
            <RNText style={[styles.footerBrand, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
            <RNText style={[styles.footerCaption, { color: theme.colors.textMuted }]}>{t.footerTagline}</RNText>
          </View>
        </View>
        <View style={styles.footerLinks}>
          {footerLinks(t).map((item) => (
            <LinkPressable key={item.label} href={item.href as Href} style={styles.footerLinkHit}>
              <RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>{item.label}</RNText>
            </LinkPressable>
          ))}
        </View>
        <RNText style={[styles.footerLicense, { color: theme.colors.textSubtle }]}>MIT · npm v{publishedPackageVersion}</RNText>
      </View>
    </ContentFrame>
  );
}

function InstallBar({ copied, onCopy }: { copied: boolean; onCopy: () => void }): ReactElement {
  const theme = useTheme();
  const t = landingStrings(useLocale().locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.copyInstallLabel(INSTALL_COMMAND)}
      onPress={onCopy}
      style={({ pressed }) => [
        styles.installBar,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        pressed ? styles.pressed : null,
      ]}
    >
      <RNText style={[styles.installPrompt, { color: theme.colors.primary }]}>$</RNText>
      <RNText selectable style={[styles.installText, { color: theme.colors.text }]}>{INSTALL_COMMAND}</RNText>
      <View style={[styles.installCopy, { backgroundColor: theme.colors.primarySoft }]}> 
        <RNText style={[styles.installCopyText, { color: theme.colors.primary }]}>{copied ? 'COPIED' : 'COPY'}</RNText>
      </View>
    </Pressable>
  );
}

function SiteButton({
  compact = false,
  href,
  label,
  onPress,
  showArrow = false,
  variant = 'primary',
}: {
  compact?: boolean;
  href?: Href;
  label: string;
  onPress?: () => void;
  showArrow?: boolean;
  variant?: 'primary' | 'secondary';
}): ReactElement {
  const theme = useTheme();
  const primary = variant === 'primary';
  const shape = [
    styles.siteButton,
    compact ? styles.siteButtonCompact : null,
    {
      backgroundColor: primary ? theme.colors.text : theme.colors.surface,
      borderColor: primary ? theme.colors.text : theme.colors.line,
    },
  ];
  const labelColor = primary ? theme.colors.background : theme.colors.text;
  const content = (
    <>
      <RNText
        style={[
          styles.siteButtonLabel,
          compact ? styles.siteButtonLabelCompact : null,
          { color: labelColor },
        ]}
      >
        {label}
      </RNText>
      {showArrow ? (
        <RNText aria-hidden style={[styles.siteButtonArrow, { color: labelColor }]}>→</RNText>
      ) : null}
    </>
  );

  // href가 있으면 Slot 안전한 LinkPressable을 쓴다. 함수형 style은 여기서 쓰지 않는다.
  return href ? (
    <LinkPressable href={href} style={shape}>
      {content}
    </LinkPressable>
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...shape, pressed ? styles.pressed : null]}
    >
      {content}
    </Pressable>
  );
}

function SectionShell({ children }: { children: ReactNode }): ReactElement {
  const width = useHydratedWindowWidth();
  return (
    <ContentFrame
      maxWidth={1180}
      center
      padding={width < 680 ? 20 : 28}
      style={styles.sectionShell}
    >
      {children}
    </ContentFrame>
  );
}

function SectionEyebrow({ children }: { children: ReactNode }): ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.sectionEyebrowRow}>
      <View style={[styles.eyebrowLine, { backgroundColor: theme.colors.primary }]} />
      <RNText style={[styles.sectionEyebrow, { color: theme.colors.primary }]}>{children}</RNText>
    </View>
  );
}

function SectionHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description: string;
  aside?: ReactNode;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeadingRow}>
      <View style={styles.sectionHeadingCopy}>
        <RNText accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.colors.text }]}>{title}</RNText>
        <RNText style={[styles.sectionDescription, { color: theme.colors.textMuted }]}>{description}</RNText>
      </View>
      {aside ? <View style={styles.sectionAside}>{aside}</View> : null}
    </View>
  );
}

function FeatureCard({
  symbol,
  title,
  description,
}: {
  symbol: string;
  title: string;
  description: string;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.featureCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}> 
      <View style={[styles.featureSymbol, { backgroundColor: theme.colors.primarySoft }]}> 
        <RNText style={[styles.featureSymbolText, { color: theme.colors.primary }]}>{symbol}</RNText>
      </View>
      <RNText style={[styles.featureTitle, { color: theme.colors.text }]}>{title}</RNText>
      <RNText style={[styles.featureDescription, { color: theme.colors.textMuted }]}>{description}</RNText>
    </View>
  );
}

function CodeLines({
  lines,
}: {
  lines: readonly { text: string; tone: 'normal' | 'muted' | 'accent' }[];
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.codeLines, { backgroundColor: theme.colors.background }]}> 
      {lines.map((line, index) => (
        <View key={`${line.text}-${index}`} style={styles.codeLine}>
          <RNText style={[styles.lineNumber, { color: theme.colors.textSubtle }]}>{index + 1}</RNText>
          <RNText
            selectable
            style={[
              styles.codeLineText,
              {
                color:
                  line.tone === 'accent'
                    ? theme.colors.primary
                    : line.tone === 'muted'
                      ? theme.colors.textMuted
                      : theme.colors.text,
              },
            ]}
          >
            {line.text}
          </RNText>
        </View>
      ))}
    </View>
  );
}

function CopyButton({
  copied,
  dark = false,
  onPress,
}: {
  copied: boolean;
  dark?: boolean;
  onPress: () => void;
}): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.copyExample}
      onPress={onPress}
      style={({ pressed }) => [
        styles.copyButton,
        {
          backgroundColor: dark ? '#1D2030' : theme.colors.surface,
          borderColor: dark ? '#34384C' : theme.colors.line,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <RNText style={[styles.copyButtonText, { color: dark ? '#C8CBDA' : theme.colors.textMuted }]}> 
        {copied ? 'COPIED' : 'COPY'}
      </RNText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  header: { borderBottomWidth: 1, zIndex: 50 },
  headerFrame: { paddingBottom: 0, paddingTop: 0 },
  headerRow: { alignItems: 'center', flexDirection: 'row', height: 68, justifyContent: 'space-between' },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandName: { fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: '700', letterSpacing: -0.3 },
  navLinks: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  navLink: { paddingHorizontal: 14, paddingVertical: 10 },
  navLabel: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '600' },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  themeButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  localeGlyph: { fontSize: 13, fontWeight: '800' },
  themeGlyph: { fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '700' },
  siteButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 42, paddingHorizontal: 18 },
  siteButtonCompact: { minHeight: 36, paddingHorizontal: 14 },
  siteButtonLabel: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '700' },
  siteButtonLabelCompact: { fontSize: 13 },
  siteButtonArrow: { fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '700' },
  heroShell: { minHeight: 700, overflow: 'hidden', position: 'relative' },
  heroGlow: { borderRadius: 999, height: 640, opacity: 0.7, position: 'absolute', right: -260, top: -220, width: 640 },
  heroFrame: { paddingBottom: 74, paddingTop: 64 },
  heroGrid: { gap: 52 },
  heroGridDesktop: { alignItems: 'center', flexDirection: 'row', gap: 56 },
  heroCopyColumn: { flex: 1, maxWidth: 680 },
  heroCopyDesktop: { maxWidth: 590 },
  releaseBadge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 28, paddingHorizontal: 12, paddingVertical: 8 },
  releaseDot: { borderRadius: 999, height: 7, width: 7 },
  releaseText: { fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  releaseArrow: { fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '800' },
  heroTitle: { fontFamily: FONT_FAMILY, fontSize: 62, fontWeight: '800', letterSpacing: -3.7, lineHeight: 72 },
  heroTitleCompact: { fontSize: 44, letterSpacing: -2.7, lineHeight: 52 },
  heroDescription: { fontFamily: FONT_FAMILY, fontSize: 18, letterSpacing: -0.45, lineHeight: 30, marginTop: 24, maxWidth: 570 },
  installBar: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 30, maxWidth: '100%', minHeight: 54, paddingLeft: 16, paddingRight: 7 },
  installPrompt: { fontFamily: MONO_FAMILY, fontSize: 14, fontWeight: '800' },
  installText: { flexShrink: 1, fontFamily: MONO_FAMILY, fontSize: 13, fontWeight: '600' },
  installCopy: { borderRadius: 9, marginLeft: 6, paddingHorizontal: 10, paddingVertical: 8 },
  installCopyText: { fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  inlineProofs: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 28 },
  inlineProof: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  inlineProofText: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600' },
  previewStage: { backgroundColor: '#10121F', borderRadius: 32, borderWidth: 1, flex: 1, minHeight: 620, minWidth: 0, overflow: 'hidden', padding: 28, position: 'relative' },
  previewStageCompact: { minHeight: 600, padding: 18 },
  previewOrbOne: { backgroundColor: '#635BFF', borderRadius: 999, height: 280, opacity: 0.32, position: 'absolute', right: -80, top: -100, width: 280 },
  previewOrbTwo: { backgroundColor: '#9FF5D1', borderRadius: 999, bottom: -150, height: 280, left: -120, opacity: 0.12, position: 'absolute', width: 280 },
  previewTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  liveBadge: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  liveDot: { backgroundColor: '#9FF5D1', borderRadius: 999, height: 7, width: 7 },
  liveText: { color: '#C9CBE0', fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  previewMode: { color: '#777C95', fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  phone: { alignSelf: 'center', borderRadius: 28, borderWidth: 1, gap: 15, maxWidth: 372, padding: 22, width: '100%', ...elevatedShadow('#000000', 0.36) },
  phoneTopbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  phoneTitle: { fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  avatar: { alignItems: 'center', borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 15, fontWeight: '800' },
  focusCard: { gap: 14 },
  focusCardTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  focusIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', width: 38 },
  focusCopy: { flex: 1, gap: 1 },
  progressTrack: { borderRadius: 999, height: 6, overflow: 'hidden' },
  progressFill: { borderRadius: 999, height: 6, width: '72%' },
  phoneList: { gap: 5 },
  rowCopy: { flex: 1, gap: 2 },
  typeSafeChip: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, bottom: 20, flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 11, position: 'absolute', right: 18, ...elevatedShadow('#000000', 0.2) },
  typeSafeIcon: { alignItems: 'center', backgroundColor: '#E6FFF4', borderRadius: 999, height: 30, justifyContent: 'center', width: 30 },
  typeSafeCheck: { color: '#178B68', fontSize: 14, fontWeight: '800' },
  typeSafeTitle: { color: '#171925', fontFamily: MONO_FAMILY, fontSize: 10, fontWeight: '800' },
  typeSafeCaption: { color: '#7A7F91', fontFamily: MONO_FAMILY, fontSize: 8, marginTop: 2 },
  proofFrame: { paddingBottom: 36, paddingTop: 0 },
  proofStrip: { borderBottomWidth: 1, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 22 },
  proofItem: { alignItems: 'center', flexGrow: 1, minWidth: 150, paddingHorizontal: 18, paddingVertical: 8 },
  proofValue: { fontFamily: FONT_FAMILY, fontSize: 26, fontWeight: '800', letterSpacing: -1 },
  proofLabel: { fontFamily: MONO_FAMILY, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, marginTop: 3, textTransform: 'uppercase' },
  sectionShell: { gap: 0, paddingBottom: 104, paddingTop: 104 },
  sectionEyebrowRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 18 },
  eyebrowLine: { borderRadius: 999, height: 2, width: 22 },
  sectionEyebrow: { fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '800', letterSpacing: 1.3 },
  sectionHeadingRow: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', marginBottom: 46 },
  sectionHeadingCopy: { flex: 1, maxWidth: 760, minWidth: 260 },
  sectionTitle: { fontFamily: FONT_FAMILY, fontSize: 42, fontWeight: '800', letterSpacing: -2.1, lineHeight: 52 },
  sectionDescription: { fontFamily: FONT_FAMILY, fontSize: 16, letterSpacing: -0.25, lineHeight: 27, marginTop: 18, maxWidth: 700 },
  sectionAside: { alignItems: 'flex-start' },
  contractGrid: { gap: 16 },
  twoColumns: { flexDirection: 'row' },
  threeColumns: { flexDirection: 'row' },
  contractCard: { borderRadius: 24, borderWidth: 1, flex: 1, minWidth: 0, padding: 22 },
  contractCardGood: { borderWidth: 1.5 },
  contractHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  contractStatus: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  contractStatusText: { fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  contractMeta: { fontFamily: MONO_FAMILY, fontSize: 10 },
  codeLines: { borderRadius: 14, gap: 6, padding: 16 },
  codeLine: { alignItems: 'center', flexDirection: 'row', gap: 13 },
  lineNumber: { fontFamily: MONO_FAMILY, fontSize: 10, textAlign: 'right', width: 16 },
  codeLineText: { fontFamily: MONO_FAMILY, fontSize: 12, lineHeight: 20 },
  errorMessage: { borderRadius: 11, marginTop: 14, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '700' },
  featureGrid: { gap: 14, marginTop: 16 },
  featureCard: { borderRadius: 22, borderWidth: 1, flex: 1, gap: 12, padding: 22 },
  featureSymbol: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', marginBottom: 4, width: 42 },
  featureSymbolText: { fontFamily: MONO_FAMILY, fontSize: 16, fontWeight: '800' },
  featureTitle: { fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  featureDescription: { fontFamily: FONT_FAMILY, fontSize: 14, letterSpacing: -0.15, lineHeight: 23 },
  categoryRow: { gap: 8, paddingBottom: 22 },
  categoryChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  categoryLabel: { fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '700' },
  playground: { borderRadius: 28, borderWidth: 1, overflow: 'hidden' },
  playgroundDesktop: { flexDirection: 'row', minHeight: 500 },
  demoCanvas: { flex: 1, minHeight: 460, padding: 22 },
  demoCanvasDesktop: { minWidth: 0 },
  demoCanvasHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  demoTitle: { fontFamily: MONO_FAMILY, fontSize: 12, fontWeight: '800' },
  demoCaption: { fontFamily: FONT_FAMILY, fontSize: 11, marginTop: 3 },
  canvasDots: { borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  canvasDot: { borderRadius: 999, height: 6, width: 6 },
  demoBody: { flex: 1, justifyContent: 'center', paddingVertical: 34 },
  demoCode: { justifyContent: 'space-between', minHeight: 370, padding: 22 },
  demoCodeDesktop: { borderLeftColor: '#282B3B', borderLeftWidth: 1, flex: 0.85, minWidth: 0 },
  codeHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  codeFilename: { color: '#8F93A8', fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '700' },
  codeBlockText: { color: '#D5D7E5', fontFamily: MONO_FAMILY, fontSize: 12, lineHeight: 22, minWidth: 390 },
  codeFooter: { alignItems: 'center', borderTopColor: '#282B3B', borderTopWidth: 1, flexDirection: 'row', gap: 7, marginTop: 24, paddingTop: 14 },
  codeStatusDot: { backgroundColor: '#9FF5D1', borderRadius: 999, height: 7, width: 7 },
  codeStatus: { color: '#8F93A8', fontFamily: MONO_FAMILY, fontSize: 9, letterSpacing: 0.5 },
  copyButton: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6 },
  copyButtonText: { fontFamily: MONO_FAMILY, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  demoStack: { gap: 16, width: '100%' },
  dataDemo: { gap: 10, width: '100%' },
  dataTable: { maxWidth: '100%' },
  dataListRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', width: '100%' },
  dataSelectionSummary: { textAlign: 'right' },
  dataPagination: { alignSelf: 'stretch' },
  sliderLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  demoRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selectionCard: { alignSelf: 'center', gap: 14, maxWidth: 430, width: '100%' },
  layoutDemoHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  layoutIcon: { alignItems: 'center', borderRadius: 14, height: 48, justifyContent: 'center', width: 48 },
  tokenRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  radiusSample: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 54, minWidth: 70, padding: 8 },
  radiusLabel: { fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '700' },
  feedbackDemoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  feedbackItem: { flex: 1, minWidth: 210 },
  skeletonRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  skeletonAvatar: { height: 46, width: 46 },
  skeletonLines: { flex: 1, gap: 8 },
  skeletonLong: { height: 12, width: '76%' },
  skeletonShort: { height: 10, width: '48%' },
  dialogDemo: { alignItems: 'center', alignSelf: 'center', gap: 14, maxWidth: 430 },
  dialogIllustration: { alignItems: 'center', borderRadius: 22, height: 74, justifyContent: 'center', width: 74 },
  dialogIllustrationMark: { fontSize: 28, fontWeight: '800' },
  dialogDemoCopy: { textAlign: 'center' },
  componentIndex: { marginTop: 50 },
  componentIndexTitle: { fontFamily: FONT_FAMILY, fontSize: 22, fontWeight: '800', letterSpacing: -0.7, marginBottom: 20 },
  componentGroups: { flexDirection: 'row', flexWrap: 'wrap' },
  componentGroup: { borderTopWidth: 1, minHeight: 120, paddingHorizontal: 14, paddingVertical: 18, width: '25%' },
  componentGroupCompact: { width: '50%' },
  groupLabel: { fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 10, textTransform: 'uppercase' },
  componentNames: { gap: 5 },
  componentName: { fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '600' },
  themeGrid: { gap: 32 },
  themeStory: { flex: 1, gap: 20, minWidth: 0 },
  schemeControl: { flexDirection: 'row', gap: 8 },
  schemeButton: { borderRadius: 999, borderWidth: 1, flex: 1, paddingHorizontal: 16, paddingVertical: 11 },
  schemeLabel: { fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchCard: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10, width: '48%' },
  swatchColor: { borderRadius: 10, height: 38, width: 38 },
  swatchCopy: { flex: 1, minWidth: 0 },
  swatchName: { fontFamily: MONO_FAMILY, fontSize: 10, fontWeight: '700' },
  swatchValue: { fontFamily: MONO_FAMILY, fontSize: 9, marginTop: 3 },
  themeGuarantee: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 16 },
  themeGuaranteeIcon: { fontSize: 18, fontWeight: '800' },
  themeGuaranteeTitle: { fontFamily: FONT_FAMILY, fontSize: 14, fontWeight: '800' },
  themeGuaranteeBody: { fontFamily: FONT_FAMILY, fontSize: 11, lineHeight: 17, marginTop: 2 },
  quickStartCard: { backgroundColor: '#0F111B', borderColor: '#282B3B', borderRadius: 26, borderWidth: 1, flex: 1, minWidth: 0, padding: 24 },
  quickStartHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  quickStartEyebrow: { color: '#8B82FF', fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  quickStartTitle: { color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 24, fontWeight: '800', letterSpacing: -0.8, marginTop: 5 },
  quickStartCode: { color: '#D5D7E5', fontFamily: MONO_FAMILY, fontSize: 11, lineHeight: 20, minWidth: 530 },
  quickStartFooter: { alignItems: 'center', borderTopColor: '#282B3B', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 18 },
  quickStartStep: { alignItems: 'center', gap: 5 },
  quickStartNumber: { backgroundColor: '#24273A', borderRadius: 999, color: '#9FF5D1', fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', height: 22, lineHeight: 22, textAlign: 'center', width: 22 },
  quickStartStepText: { color: '#9A9EB2', fontFamily: FONT_FAMILY, fontSize: 9, fontWeight: '600' },
  quickStartLine: { backgroundColor: '#35384C', flex: 1, height: 1, marginHorizontal: 8 },
  platformGrid: { gap: 14 },
  platformCard: { borderRadius: 22, borderWidth: 1, flex: 1, padding: 22 },
  platformTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  platformEyebrow: { fontFamily: MONO_FAMILY, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  platformSymbol: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  platformSymbolText: { fontFamily: MONO_FAMILY, fontSize: 16, fontWeight: '800' },
  platformTitle: { fontFamily: FONT_FAMILY, fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  platformDescription: { flex: 1, fontFamily: FONT_FAMILY, fontSize: 13, lineHeight: 22, marginTop: 10 },
  inlineCode: { borderRadius: 10, borderWidth: 1, marginTop: 20, paddingHorizontal: 11, paddingVertical: 9 },
  inlineCodeText: { fontFamily: MONO_FAMILY, fontSize: 10, fontWeight: '600' },
  finalFrame: { paddingBottom: 20, paddingTop: 70 },
  finalCta: { alignItems: 'center', backgroundColor: '#10121F', borderColor: '#2D3148', borderRadius: 30, borderWidth: 1, flexDirection: 'row', gap: 40, justifyContent: 'space-between', minHeight: 350, overflow: 'hidden', padding: 46, position: 'relative' },
  finalCtaCompact: { alignItems: 'stretch', flexDirection: 'column', padding: 26 },
  finalOrb: { backgroundColor: '#635BFF', borderRadius: 999, height: 360, opacity: 0.22, position: 'absolute', right: -140, top: -180, width: 360 },
  finalCopy: { flex: 1, maxWidth: 610 },
  finalEyebrow: { color: '#9FF5D1', fontFamily: MONO_FAMILY, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  finalTitle: { color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 39, fontWeight: '800', letterSpacing: -1.8, lineHeight: 49, marginTop: 15 },
  finalTitleCompact: { fontSize: 31, letterSpacing: -1.2, lineHeight: 40 },
  finalDescription: { color: '#A8ABBE', fontFamily: FONT_FAMILY, fontSize: 15, lineHeight: 24, marginTop: 14 },
  finalActions: { gap: 10, minWidth: 300 },
  finalInstall: { alignItems: 'center', backgroundColor: '#191C2B', borderColor: '#30344A', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 15 },
  finalPrompt: { color: '#9FF5D1', fontFamily: MONO_FAMILY, fontSize: 12, fontWeight: '800' },
  finalInstallText: { color: '#FFFFFF', flex: 1, fontFamily: MONO_FAMILY, fontSize: 11, fontWeight: '600' },
  finalCopyLabel: { color: '#8B90A6', fontFamily: MONO_FAMILY, fontSize: 8, fontWeight: '800', letterSpacing: 0.7 },
  finalDocs: { alignItems: 'center', backgroundColor: '#635BFF', borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  finalDocsText: { color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 13, fontWeight: '800' },
  finalDocsArrow: { color: '#FFFFFF', fontFamily: FONT_FAMILY, fontSize: 18, fontWeight: '800' },
  footerFrame: { paddingBottom: 26, paddingTop: 26 },
  footer: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', paddingTop: 28 },
  footerBrand: { fontFamily: MONO_FAMILY, fontSize: 12, fontWeight: '800' },
  footerCaption: { fontFamily: FONT_FAMILY, fontSize: 10, marginTop: 2 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  footerLinkHit: { justifyContent: 'center', minHeight: 44 },
  footerLink: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600' },
  footerLicense: { fontFamily: MONO_FAMILY, fontSize: 9 },
  toast: { alignSelf: 'center', left: 'auto', maxWidth: 420, right: 24 },
});
