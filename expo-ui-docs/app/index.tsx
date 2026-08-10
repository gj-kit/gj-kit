import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ColorScheme, IconRenderProps, Theme } from '@gj-kit/expo-ui';
import {
  Button,
  ConfirmActionRow,
  ContentFrame,
  Dialog,
  DialogPanel,
  EmptyState,
  ErrorState,
  IconButton,
  SearchField,
  SelectableRow,
  SelectionIndicator,
  Skeleton,
  Surface,
  Tabs,
  Text,
  TextField,
  Toast,
  UiProvider,
  koStrings,
  useTheme,
  useToastController,
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

type DemoCategory =
  | 'actions'
  | 'forms'
  | 'selection'
  | 'layout'
  | 'feedback'
  | 'dialog';

const DEMO_CATEGORIES: readonly { label: string; value: DemoCategory }[] = [
  { label: 'Actions', value: 'actions' },
  { label: 'Forms', value: 'forms' },
  { label: 'Selection', value: 'selection' },
  { label: 'Layout', value: 'layout' },
  { label: 'Feedback', value: 'feedback' },
  { label: 'Dialog', value: 'dialog' },
];

const COMPONENT_GROUPS = [
  { label: 'Foundation', items: ['Text'] },
  { label: 'Actions', items: ['Button', 'IconButton'] },
  { label: 'Inputs', items: ['TextField', 'SearchField'] },
  { label: 'Navigation', items: ['Tabs'] },
  { label: 'Selection', items: ['SelectionIndicator', 'SelectableRow', 'SelectAllRow'] },
  { label: 'Layout', items: ['Surface', 'ContentFrame', 'Section', 'StickyActionBar'] },
  { label: 'Feedback', items: ['Skeleton', 'EmptyState', 'ErrorState', 'Toast'] },
  { label: 'Overlay', items: ['Dialog', 'DialogPanel', 'ConfirmActionRow'] },
] as const;

const DEMO_SNIPPETS: Record<DemoCategory, string> = {
  actions: `<Button label="저장" onPress={save} />\n<Button variant="secondary" label="미리보기" />\n<IconButton accessibilityLabel="설정 열기" icon={Settings} />`,
  forms: `<SearchField value={query} onChangeText={setQuery} />\n<TextField\n  label="프로젝트 이름"\n  counter={\`\${name.length}/30\`}\n/>`,
  selection: `<SelectableRow\n  selected={selected}\n  onPress={() => setSelected(!selected)}\n>\n  <Text>주간 회고 알림</Text>\n</SelectableRow>`,
  layout: `<Surface padding="xl" radius="lg" elevation="sm">\n  <Text role="title">토큰으로 조립하세요.</Text>\n  <Text color="textMuted">간격, 라운드, 그림자까지.</Text>\n</Surface>`,
  feedback: `<EmptyState\n  body="첫 번째 프로젝트를 만들어보세요."\n  action={{ label: '프로젝트 만들기', onPress: create }}\n/>`,
  dialog: `<Dialog visible={open} onDismiss={close}>\n  <DialogPanel title="프로젝트를 삭제할까요?">\n    <ConfirmActionRow destructive onCancel={close} onConfirm={remove} />\n  </DialogPanel>\n</Dialog>`,
};

const QUICK_START = `import { UiProvider, Button, koStrings } from '@gj-kit/expo-ui';\nimport { createThemes } from '@gj-kit/expo-ui/theme';\n\nconst themes = createThemes({\n  shared: { colors: { primary: '#635BFF' } },\n});\n\nexport function App() {\n  return (\n    <UiProvider theme={themes} strings={koStrings}>\n      <Button label="시작하기" onPress={() => {}} />\n    </UiProvider>\n  );\n}`;

export default function Home(): ReactElement {
  const [colorScheme, setColorScheme] = useState<ColorScheme>('light');

  return (
    <>
      <Head>
        <title>@gj-kit/expo-ui — 타입으로 지키는 Expo UI Kit</title>
        <meta
          name="description"
          content="타입 안전한 API, 토큰 기반 라이트·다크 테마, 20개의 Expo·React Native 컴포넌트를 만나보세요."
        />
        <link rel="canonical" href="https://gj-kit-expo-ui.expo.app/" />
      </Head>
      <UiProvider
        theme={siteThemes}
        colorScheme={colorScheme}
        strings={koStrings}
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const compact = width < 680;
  const [heroTab, setHeroTab] = useState<'today' | 'week'>('today');
  const [heroSelected, setHeroSelected] = useState(true);
  const [category, setCategory] = useState<DemoCategory>('actions');
  const [query, setQuery] = useState('');
  const [projectName, setProjectName] = useState('My Expo App');
  const [selected, setSelected] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { toast, showToast } = useToastController({ durationMs: 2200 });

  const toggleTheme = () =>
    onColorSchemeChange(colorScheme === 'light' ? 'dark' : 'light');

  const copy = async (value: string, key: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    }
    setCopied(key);
    showToast({ message: '클립보드에 복사했습니다.', variant: 'success' });
    setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
  };

  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <SiteHeader
        compact={compact}
        colorScheme={colorScheme}
        onToggleTheme={toggleTheme}
        onOpenDocs={() => router.push('/docs')}
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
            onOpenDocs={() => router.push('/docs')}
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
            dialogVisible={dialogVisible}
            projectName={projectName}
            query={query}
            selected={selected}
            copied={copied === 'demo'}
            onCategoryChange={setCategory}
            onCloseDialog={() => setDialogVisible(false)}
            onCopyCode={() => copy(DEMO_SNIPPETS[category], 'demo')}
            onOpenDialog={() => setDialogVisible(true)}
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
            onCopy={() => copy(QUICK_START, 'quick-start')}
            onColorSchemeChange={onColorSchemeChange}
          />
        </View>

        <PlatformSection desktop={desktop} />

        <FinalCta
          compact={compact}
          copied={copied === 'install-bottom'}
          onCopy={() => copy(INSTALL_COMMAND, 'install-bottom')}
          onOpenDocs={() => router.push('/docs')}
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
  onOpenDocs,
}: {
  compact: boolean;
  colorScheme: ColorScheme;
  onToggleTheme: () => void;
  onOpenDocs: () => void;
}): ReactElement {
  const theme = useTheme();
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
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="@gj-kit/expo-ui 홈"
            onPress={() => scrollToSection('top')}
            style={({ pressed }) => [styles.brand, pressed ? styles.pressed : null]}
          >
            <BrandMark size={34} />
            <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
          </Pressable>

          {!compact ? (
            <View style={styles.navLinks}>
              <NavLink label="Why gj-kit" onPress={() => scrollToSection('why')} />
              <NavLink label="Components" onPress={() => scrollToSection('components')} />
              <NavLink label="Theme" onPress={() => scrollToSection('theme')} />
            </View>
          ) : null}

          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={colorScheme === 'light' ? '다크 모드로 전환' : '라이트 모드로 전환'}
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
            <SiteButton compact={compact} label="Docs" onPress={onOpenDocs} />
          </View>
        </View>
      </ContentFrame>
    </View>
  );
}

function NavLink({ label, onPress }: { label: string; onPress: () => void }): ReactElement {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.navLink, pressed ? styles.pressed : null]}
    >
      <RNText style={[styles.navLabel, { color: theme.colors.textMuted }]}>{label}</RNText>
    </Pressable>
  );
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
  onOpenDocs,
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
  onOpenDocs: () => void;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.heroShell}>
      <View
        pointerEvents="none"
        style={[styles.heroGlow, { backgroundColor: theme.colors.primarySoft }]}
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
              <RNText style={[styles.releaseText, { color: theme.colors.textMuted }]}>v0.1.0 · MIT · npm 공개</RNText>
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
              앱 UI,{compact ? '\n' : ' '}<RNText style={{ color: theme.colors.primary }}>실수할 수 없게.</RNText>
            </RNText>
            <RNText style={[styles.heroDescription, { color: theme.colors.textMuted }]}> 
              토큰 기반 테마와 접근성 계약을 TypeScript API에 담았습니다. Expo, bare React Native,
              Web에서 같은 설계 언어를 더 안전하게 유지하세요.
            </RNText>

            <InstallBar copied={copied} onCopy={onCopyInstall} />

            <View style={styles.heroActions}>
              <SiteButton label="빠르게 시작하기" onPress={onOpenDocs} showArrow />
              <SiteButton
                label="컴포넌트 보기"
                variant="secondary"
                onPress={() => scrollToSection('components')}
              />
            </View>

            <View style={styles.inlineProofs}>
              {['Expo & bare RN', 'React Native ≥ 0.79', 'TypeScript first'].map((item) => (
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
  return (
    <View
      style={[
        styles.previewStage,
        compact ? styles.previewStageCompact : null,
        { borderColor: colorScheme === 'dark' ? '#30344C' : '#252941' },
      ]}
    >
      <View pointerEvents="none" style={styles.previewOrbOne} />
      <View pointerEvents="none" style={styles.previewOrbTwo} />
      <View style={styles.previewTopline}>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <RNText style={styles.liveText}>LIVE PREVIEW</RNText>
        </View>
        <RNText style={styles.previewMode}>{colorScheme === 'dark' ? 'DARK' : 'LIGHT'} THEME</RNText>
      </View>

      <View style={[styles.phone, { backgroundColor: theme.colors.background, borderColor: theme.colors.line }]}> 
        <View style={styles.phoneTopbar}>
          <View>
            <Text role="caption" color="textMuted">MONDAY, AUG 10</Text>
            <RNText style={[styles.phoneTitle, { color: theme.colors.text }]}>오늘의 포커스</RNText>
          </View>
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}> 
            <RNText style={styles.avatarText}>G</RNText>
          </View>
        </View>

        <SearchField value="" onChangeText={() => undefined} placeholder="기록 검색" />

        <Surface padding="lg" radius="lg" style={styles.focusCard}>
          <View style={styles.focusCardTop}>
            <View style={[styles.focusIcon, { backgroundColor: theme.colors.primarySoft }]}> 
              <RNText style={{ color: theme.colors.primary, fontWeight: '800' }}>✦</RNText>
            </View>
            <View style={styles.focusCopy}>
              <Text role="label">UI 라이브러리 다듬기</Text>
              <Text role="caption" color="textMuted">완료까지 2개의 작업</Text>
            </View>
            <SelectionIndicator selected={selected} size={20} />
          </View>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.surfaceSubtle }]}> 
            <View style={[styles.progressFill, { backgroundColor: theme.colors.primary }]} />
          </View>
        </Surface>

        <Tabs
          items={[
            { label: '오늘', value: 'today' },
            { label: '이번 주', value: 'week' },
          ] as const}
          value={tab}
          onChange={onTabChange}
        />

        <View style={styles.phoneList}>
          <SelectableRow selected={selected} onPress={() => onSelectedChange(!selected)}>
            <View style={styles.rowCopy}>
              <Text role="label">컴포넌트 API 검토</Text>
              <Text role="caption" color="textMuted">타입 계약 27개 통과</Text>
            </View>
          </SelectableRow>
          <SelectableRow selected={false} onPress={() => onSelectedChange(true)}>
            <View style={styles.rowCopy}>
              <Text role="label">다크 테마 확인</Text>
              <Text role="caption" color="textMuted">토큰 누락 없이</Text>
            </View>
          </SelectableRow>
        </View>

        <Button label={selected ? '오늘 작업 완료' : '작업 선택하기'} onPress={() => onSelectedChange(!selected)} />
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
  const proofs = [
    { value: '20', label: 'Components' },
    { value: '24', label: 'Color roles' },
    { value: '0', label: 'Direct runtime deps' },
    { value: '152', label: 'Tests passing' },
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
  return (
    <SectionShell>
      <SectionEyebrow>TYPE CONTRACTS</SectionEyebrow>
      <SectionHeading
        title="깨진 UI보다 먼저 오는 컴파일 에러."
        description="접근성 라벨 누락, 죽은 액션, 존재하지 않는 토큰 키를 사용 지점에서 바로 드러냅니다. 앱이 실행된 뒤 발견할 문제를 코드 작성 중에 줄이세요."
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
            <RNText style={[styles.errorText, { color: theme.colors.dangerStrong }]}>× accessibilityLabel 속성이 필요합니다.</RNText>
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
              { text: '  accessibilityLabel="설정 열기"', tone: 'accent' },
              { text: '  icon={Settings}', tone: 'normal' },
              { text: '  onPress={openSettings}', tone: 'normal' },
              { text: '/>', tone: 'muted' },
            ]}
          />
          <View style={[styles.errorMessage, { backgroundColor: theme.colors.primarySoft }]}> 
            <RNText style={[styles.errorText, { color: theme.colors.primary }]}>✓ 스크린리더 계약이 props에 포함됩니다.</RNText>
          </View>
        </View>
      </View>

      <View style={[styles.featureGrid, desktop ? styles.threeColumns : null]}>
        <FeatureCard
          symbol="T"
          title="완성된 테마만"
          description="createTheme을 거친 완전한 토큰 객체만 Provider가 받습니다. 반쪽 테마가 숨어들지 않습니다."
        />
        <FeatureCard
          symbol="A"
          title="접근성을 API로"
          description="IconButton의 라벨과 액션 핸들러처럼 빠뜨리기 쉬운 계약을 필수 prop으로 표현합니다."
        />
        <FeatureCard
          symbol="↗"
          title="앱이 소유하는 확장"
          description="문구와 아이콘은 주입하고, NativeWind는 선택합니다. 라이브러리가 앱의 결정을 가로채지 않습니다."
        />
      </View>
    </SectionShell>
  );
}

function ComponentsSection({
  category,
  compact,
  desktop,
  dialogVisible,
  projectName,
  query,
  selected,
  copied,
  onCategoryChange,
  onCloseDialog,
  onCopyCode,
  onOpenDialog,
  onProjectNameChange,
  onQueryChange,
  onSelectedChange,
  onShowToast,
}: {
  category: DemoCategory;
  compact: boolean;
  desktop: boolean;
  dialogVisible: boolean;
  projectName: string;
  query: string;
  selected: boolean;
  copied: boolean;
  onCategoryChange: (category: DemoCategory) => void;
  onCloseDialog: () => void;
  onCopyCode: () => void;
  onOpenDialog: () => void;
  onProjectNameChange: (name: string) => void;
  onQueryChange: (query: string) => void;
  onSelectedChange: (selected: boolean) => void;
  onShowToast: (message: string, variant: 'error' | 'success' | 'info' | 'warning') => void;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surface }}>
      <SectionShell>
        <SectionEyebrow>COMPONENTS</SectionEyebrow>
        <SectionHeading
          title="설명보다 빠른, 실제 컴포넌트."
          description="이 페이지의 데모는 배포 패키지를 직접 import합니다. 테마를 바꾸고, 입력하고, 눌러보세요."
          aside={
            <SiteButton
              label="npm에서 보기"
              variant="secondary"
              onPress={() => void Linking.openURL(NPM_URL)}
              showArrow
            />
          }
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {DEMO_CATEGORIES.map((item) => {
            const active = item.value === category;
            return (
              <Pressable
                key={item.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onCategoryChange(item.value)}
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
                  {item.label}
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
                <RNText style={[styles.demoCaption, { color: theme.colors.textMuted }]}>실제 상태를 바꿔보세요.</RNText>
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
              <RNText selectable style={styles.codeBlockText}>{DEMO_SNIPPETS[category]}</RNText>
            </ScrollView>
            <View style={styles.codeFooter}>
              <View style={styles.codeStatusDot} />
              <RNText style={styles.codeStatus}>TypeScript · no errors</RNText>
            </View>
          </View>
        </View>

        <View style={styles.componentIndex}>
          <RNText style={[styles.componentIndexTitle, { color: theme.colors.text }]}>20개의 작은 조각, 하나의 설계 언어</RNText>
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
          title="프로젝트를 삭제할까요?"
          description="Dialog, DialogPanel, ConfirmActionRow를 조합한 실제 예제입니다."
        >
          <ConfirmActionRow
            destructive
            cancelLabel="아니요"
            confirmLabel="삭제"
            onCancel={onCloseDialog}
            onConfirm={() => {
              onCloseDialog();
              onShowToast('삭제 예제를 확인했습니다.', 'info');
            }}
          />
        </DialogPanel>
      </Dialog>
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
  onShowToast: (message: string, variant: 'error' | 'success' | 'info' | 'warning') => void;
}): ReactElement {
  const theme = useTheme();
  const [demoTab, setDemoTab] = useState<'preview' | 'code'>('preview');
  const icon = (props: IconRenderProps) => <Glyph {...props}>✦</Glyph>;

  switch (category) {
    case 'actions':
      return (
        <View style={styles.demoStack}>
          <View style={styles.demoRow}>
            <Button label="저장" onPress={() => onShowToast('안전하게 저장했습니다.', 'success')} />
            <Button label="미리보기" variant="secondary" onPress={() => onShowToast('미리보기입니다.', 'info')} />
          </View>
          <View style={styles.demoRow}>
            <Button label="삭제" size="sm" variant="destructive-outline" onPress={onOpenDialog} />
            <Button label="동기화 중" size="sm" loading />
            <IconButton accessibilityLabel="즐겨찾기" icon={icon} onPress={() => onShowToast('즐겨찾기에 추가했습니다.', 'success')} />
          </View>
          <Text role="caption" color="textMuted">6 variants · 3 sizes · loading · disabled · icon</Text>
        </View>
      );
    case 'forms':
      return (
        <View style={styles.demoStack}>
          <SearchField value={query} onChangeText={onQueryChange} />
          <TextField
            label="프로젝트 이름"
            value={projectName}
            onChangeText={onProjectNameChange}
            counter={`${projectName.length}/30`}
            helperText="입력, 라벨, 헬퍼가 같은 토큰을 사용합니다."
          />
          <Tabs
            items={[
              { label: 'Preview', value: 'preview' },
              { label: 'Code', value: 'code' },
            ] as const}
            value={demoTab}
            onChange={setDemoTab}
          />
        </View>
      );
    case 'selection':
      return (
        <Surface radius="lg" padding="xl" style={styles.selectionCard}>
          <Text role="title">알림 설정</Text>
          <Text role="caption" color="textMuted">선택 상태와 접근성 상태가 함께 바뀝니다.</Text>
          <SelectableRow selected={selected} onPress={() => onSelectedChange(!selected)}>
            <View style={styles.rowCopy}>
              <Text role="label">주간 회고 알림</Text>
              <Text role="caption" color="textMuted">매주 일요일 오후 8시</Text>
            </View>
          </SelectableRow>
          <SelectableRow selected={!selected} onPress={() => onSelectedChange(!selected)}>
            <View style={styles.rowCopy}>
              <Text role="label">제품 업데이트</Text>
              <Text role="caption" color="textMuted">새로운 컴포넌트 소식</Text>
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
                <Text role="title">토큰으로 조립하세요.</Text>
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
    case 'feedback':
      return (
        <View style={styles.demoStack}>
          <View style={styles.feedbackDemoRow}>
            <EmptyState
              title="아직 프로젝트가 없어요"
              body="첫 번째 프로젝트를 만들어보세요."
              action={{ label: '프로젝트 만들기', onPress: () => onShowToast('새 프로젝트를 시작합니다.', 'success') }}
              style={styles.feedbackItem}
            />
            <ErrorState
              message="네트워크 연결을 확인해주세요."
              onRetry={() => onShowToast('다시 시도합니다.', 'info')}
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
        </View>
      );
    case 'dialog':
      return (
        <View style={styles.dialogDemo}>
          <View style={[styles.dialogIllustration, { backgroundColor: theme.colors.primarySoft }]}> 
            <RNText style={[styles.dialogIllustrationMark, { color: theme.colors.primary }]}>◇</RNText>
          </View>
          <Text role="title">확인이 필요한 순간도 같은 언어로.</Text>
          <Text role="body" color="textMuted" style={styles.dialogDemoCopy}>
            최소 Modal 조각을 앱 흐름에 맞춰 조합하세요. 포털과 바텀시트 정책은 앱이 소유합니다.
          </Text>
          <Button label="Dialog 열기" onPress={onOpenDialog} />
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
  return (
    <SectionShell>
      <SectionEyebrow>THEME SYSTEM</SectionEyebrow>
      <SectionHeading
        title="한 번 정하면, 모든 화면이 함께 움직입니다."
        description="색상 24롤, 서체 7롤, 간격·라운드·그림자·치수까지 하나의 완성된 테마로 관리합니다. 라이트와 다크를 쌍으로 만들고 시스템 설정을 따르세요."
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
              <RNText style={[styles.themeGuaranteeTitle, { color: theme.colors.text }]}>ThemePair 완전성 보장</RNText>
              <RNText style={[styles.themeGuaranteeBody, { color: theme.colors.textMuted }]}>라이트나 다크 한쪽이 비어 있는 상태를 만들 수 없습니다.</RNText>
            </View>
          </View>
        </View>

        <View style={styles.quickStartCard}>
          <View style={styles.quickStartHeader}>
            <View>
              <RNText style={styles.quickStartEyebrow}>QUICK START</RNText>
              <RNText style={styles.quickStartTitle}>첫 화면까지 3분.</RNText>
            </View>
            <CopyButton dark copied={copied} onPress={onCopy} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <RNText selectable style={styles.quickStartCode}>{QUICK_START}</RNText>
          </ScrollView>
          <View style={styles.quickStartFooter}>
            <View style={styles.quickStartStep}>
              <RNText style={styles.quickStartNumber}>1</RNText>
              <RNText style={styles.quickStartStepText}>테마 생성</RNText>
            </View>
            <View style={styles.quickStartLine} />
            <View style={styles.quickStartStep}>
              <RNText style={styles.quickStartNumber}>2</RNText>
              <RNText style={styles.quickStartStepText}>Provider 연결</RNText>
            </View>
            <View style={styles.quickStartLine} />
            <View style={styles.quickStartStep}>
              <RNText style={styles.quickStartNumber}>3</RNText>
              <RNText style={styles.quickStartStepText}>컴포넌트 사용</RNText>
            </View>
          </View>
        </View>
      </View>
    </SectionShell>
  );
}

function PlatformSection({ desktop }: { desktop: boolean }): ReactElement {
  const theme = useTheme();
  const items = [
    {
      eyebrow: '/INSETS',
      symbol: '⌁',
      title: 'Safe area와 키보드까지',
      description: 'Android edge-to-edge Modal의 키보드 겹침과 하단 inset을 다루는 검증된 유틸을 제공합니다.',
      code: 'useModalKeyboardOverlap()',
    },
    {
      eyebrow: '/TAILWIND',
      symbol: '#',
      title: 'NativeWind는 선택 사항',
      description: '의존하지 않으면서 className passthrough와 테마에서 파생한 Tailwind preset을 제공합니다.',
      code: 'createTailwindPreset(theme)',
    },
    {
      eyebrow: 'STRINGS + ICONS',
      symbol: '文',
      title: '앱의 언어를 그대로',
      description: '한국어·영어 문구와 아이콘 렌더러를 Provider에서 주입합니다. 별도 래퍼가 필요 없습니다.',
      code: 'strings={koStrings}',
    },
  ];
  return (
    <View style={{ backgroundColor: theme.colors.surface }}>
      <SectionShell>
        <SectionEyebrow>NATIVE-FIRST</SectionEyebrow>
        <SectionHeading
          title="웹 데모 뒤에도, 네이티브 현실을 압니다."
          description="Expo 앱에서 실제로 반복되는 플랫폼 문제를 작은 유틸과 명확한 경계로 해결합니다."
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
  onOpenDocs,
}: {
  compact: boolean;
  copied: boolean;
  onCopy: () => void;
  onOpenDocs: () => void;
}): ReactElement {
  return (
    <ContentFrame maxWidth={1180} center padding={compact ? 20 : 28} style={styles.finalFrame}>
      <View style={[styles.finalCta, compact ? styles.finalCtaCompact : null]}>
        <View pointerEvents="none" style={styles.finalOrb} />
        <View style={styles.finalCopy}>
          <RNText style={styles.finalEyebrow}>BUILD WITH CONFIDENCE</RNText>
          <RNText style={[styles.finalTitle, compact ? styles.finalTitleCompact : null]}>좋은 UI는, 좋은 제약에서 시작됩니다.</RNText>
          <RNText style={styles.finalDescription}>설치는 가볍게. 테마와 접근성 계약은 단단하게.</RNText>
        </View>
        <View style={styles.finalActions}>
          <Pressable onPress={onCopy} style={({ pressed }) => [styles.finalInstall, pressed ? styles.pressed : null]}>
            <RNText style={styles.finalPrompt}>$</RNText>
            <RNText selectable style={styles.finalInstallText}>{INSTALL_COMMAND}</RNText>
            <RNText style={styles.finalCopyLabel}>{copied ? 'COPIED' : 'COPY'}</RNText>
          </Pressable>
          <Pressable onPress={onOpenDocs} style={({ pressed }) => [styles.finalDocs, pressed ? styles.pressed : null]}>
            <RNText style={styles.finalDocsText}>문서에서 시작하기</RNText>
            <RNText style={styles.finalDocsArrow}>→</RNText>
          </Pressable>
        </View>
      </View>
    </ContentFrame>
  );
}

function SiteFooter(): ReactElement {
  const theme = useTheme();
  return (
    <ContentFrame maxWidth={1180} center padding={20} style={styles.footerFrame}>
      <View style={[styles.footer, { borderTopColor: theme.colors.line }]}> 
        <View style={styles.brand}>
          <BrandMark size={30} />
          <View>
            <RNText style={[styles.footerBrand, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
            <RNText style={[styles.footerCaption, { color: theme.colors.textMuted }]}>Type-safe primitives for Expo & React Native.</RNText>
          </View>
        </View>
        <View style={styles.footerLinks}>
          <Pressable onPress={() => scrollToSection('top')}><RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>Top</RNText></Pressable>
          <Pressable onPress={() => scrollToSection('components')}><RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>Components</RNText></Pressable>
          <Pressable onPress={() => void Linking.openURL(NPM_URL)}><RNText style={[styles.footerLink, { color: theme.colors.textMuted }]}>npm ↗</RNText></Pressable>
        </View>
        <RNText style={[styles.footerLicense, { color: theme.colors.textSubtle }]}>MIT · v0.1.0</RNText>
      </View>
    </ContentFrame>
  );
}

function InstallBar({ copied, onCopy }: { copied: boolean; onCopy: () => void }): ReactElement {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${INSTALL_COMMAND} 설치 명령 복사`}
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
  label,
  onPress,
  showArrow = false,
  variant = 'primary',
}: {
  compact?: boolean;
  label: string;
  onPress: () => void;
  showArrow?: boolean;
  variant?: 'primary' | 'secondary';
}): ReactElement {
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.siteButton,
        compact ? styles.siteButtonCompact : null,
        {
          backgroundColor: primary ? theme.colors.text : theme.colors.surface,
          borderColor: primary ? theme.colors.text : theme.colors.line,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      <RNText
        style={[
          styles.siteButtonLabel,
          compact ? styles.siteButtonLabelCompact : null,
          { color: primary ? theme.colors.background : theme.colors.text },
        ]}
      >
        {label}
      </RNText>
      {showArrow ? (
        <RNText style={[styles.siteButtonArrow, { color: primary ? theme.colors.background : theme.colors.text }]}>→</RNText>
      ) : null}
    </Pressable>
  );
}

function SectionShell({ children }: { children: ReactNode }): ReactElement {
  const { width } = useWindowDimensions();
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="코드 복사"
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

function scrollToSection(id: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  footerLinks: { flexDirection: 'row', gap: 20 },
  footerLink: { fontFamily: FONT_FAMILY, fontSize: 12, fontWeight: '600' },
  footerLicense: { fontFamily: MONO_FAMILY, fontSize: 9 },
  toast: { alignSelf: 'center', left: 'auto', maxWidth: 420, right: 24 },
});
