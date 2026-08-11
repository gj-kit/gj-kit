import { createElement, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import {
  Badge,
  Button,
  Checkbox,
  Pagination,
  ProgressBar,
  Surface,
  Text,
  useTheme,
} from '@gj-kit/expo-ui';
import type { ComponentSeoEntry } from '../../src/seo-content';
import {
  componentDocsPath,
  componentSeoEntries,
  guideDocsPath,
  guideSeoEntries,
  isReleasedComponent,
  publishedPackageVersion,
} from '../../src/seo-content';
import {
  SeoHead,
  breadcrumbSchema,
  itemListSchema,
  webPageSchema,
} from '../../src/seo';
import {
  CommandBlock,
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoSection,
} from '../../src/seo-page';

const PATH = '/docs/components';
const ALL_CATEGORIES = '전체';

type ReleaseFilter = 'all' | 'released' | 'preview';

const categories = Array.from(new Set(componentSeoEntries.map((entry) => entry.category)));
const componentCount = componentSeoEntries.length;
const releasedCount = componentSeoEntries.filter(isReleasedComponent).length;
const previewCount = componentCount - releasedCount;
const TITLE = `Expo UI 컴포넌트 ${componentCount}종 | GJ Kit Expo UI`;
const DESCRIPTION =
  `소스에 포함된 Expo·React Native·Web용 TypeScript UI 컴포넌트 ${componentCount}종의 예제, 접근성, 테마 연동과 릴리스 상태를 확인하세요.`;

function CssLayout({
  className,
  children,
  fallbackStyle,
}: {
  readonly className: string;
  readonly children: ReactNode;
  readonly fallbackStyle?: StyleProp<ViewStyle> | undefined;
}): ReactElement {
  if (Platform.OS === 'web') return createElement('div', { className }, children);
  return <View style={fallbackStyle}>{children}</View>;
}

export default function ComponentsIndexPage(): ReactElement {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>('all');
  const [showcaseChecked, setShowcaseChecked] = useState(true);

  const componentItems = componentSeoEntries.map((entry) => ({
    name: entry.name,
    path: componentDocsPath(entry.slug),
  }));

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko');
    return componentSeoEntries.filter((entry) => {
      if (activeCategory !== ALL_CATEGORIES && entry.category !== activeCategory) return false;
      const released = isReleasedComponent(entry);
      if (releaseFilter === 'released' && !released) return false;
      if (releaseFilter === 'preview' && released) return false;
      if (!normalizedQuery) return true;
      return [entry.name, entry.category, entry.description]
        .join(' ')
        .toLocaleLowerCase('ko')
        .includes(normalizedQuery);
    });
  }, [activeCategory, query, releaseFilter]);

  const resetFilters = () => {
    setQuery('');
    setActiveCategory(ALL_CATEGORIES);
    setReleaseFilter('all');
  };

  return (
    <>
      <SeoHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        schemas={[
          webPageSchema({ path: PATH, title: TITLE, description: DESCRIPTION, type: 'CollectionPage' }),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '문서', path: '/docs' },
            { name: '컴포넌트', path: PATH },
          ]),
          itemListSchema('GJ Kit Expo UI 컴포넌트', componentItems),
        ]}
      />
      <SeoPageShell
        wide
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '문서', href: '/docs' },
          { label: `컴포넌트 ${componentCount}종` },
        ]}
      >
        <CssLayout
          className="seo-directory-hero"
          fallbackStyle={styles.heroFallback}
        >
          <View>
            <SeoPageHeading
              eyebrow="COMPONENT LIBRARY"
              title={`Expo·React Native UI 컴포넌트 ${componentCount}종`}
              description="하나의 타입 시스템과 테마 토큰으로 iOS, Android, Web UI를 조립하세요. 각 문서에서 최소 예제, 접근성 동작과 릴리스 상태를 바로 확인할 수 있습니다."
              preview={previewCount > 0
                ? `npm v${publishedPackageVersion} · v0.4 소스 미리보기 ${previewCount}종`
                : undefined}
            />
            <ProofGrid />
            <View style={styles.installRow}>
              <CommandBlock command="pnpm add @gj-kit/expo-ui" />
            </View>
          </View>

          <SourceShowcase
            checked={showcaseChecked}
            onCheckedChange={setShowcaseChecked}
          />
        </CssLayout>

        <SeoSection title="컴포넌트 탐색">
          <CssLayout
            className="seo-directory-layout"
            fallbackStyle={styles.directoryFallback}
          >
            <CategoryRail
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
            />

            <View style={styles.catalogMain}>
              <CatalogToolbar
                query={query}
                onQueryChange={setQuery}
                releaseFilter={releaseFilter}
                onReleaseFilterChange={setReleaseFilter}
                resultCount={visibleEntries.length}
              />

              {/*
                라이브 리전은 조건 분기 바깥에 항상 마운트돼 있어야 한다. 전에는
                결과 0건이 되면 EmptyResults가 새로 마운트되면서 스크린리더가
                아무것도 알리지 않았고, 카운터도 "12 / 49" 숫자쌍만 읽었다.
              */}
              <RNText
                accessibilityLiveRegion="polite"
                aria-live="polite"
                role="status"
                style={styles.visuallyHidden}
              >
                {visibleEntries.length === 0
                  ? '일치하는 컴포넌트가 없습니다. 검색어나 카테고리, 릴리스 상태를 바꿔 보세요.'
                  : `컴포넌트 ${visibleEntries.length}개를 찾았습니다. 전체 ${componentSeoEntries.length}개 중.`}
              </RNText>

              {visibleEntries.length > 0 ? (
                <View style={styles.gridTopGap}>
                  <ComponentGrid entries={visibleEntries} />
                </View>
              ) : (
                <EmptyResults onReset={resetFilters} />
              )}
            </View>
          </CssLayout>
        </SeoSection>

        <SeoSection title="설계 원칙부터 읽기">
          <SeoLinkGrid
            items={guideSeoEntries.map((guide) => ({
              href: guideDocsPath(guide.slug),
              title: guide.title,
              description: guide.description,
            }))}
          />
        </SeoSection>
      </SeoPageShell>
    </>
  );
}

function ProofGrid(): ReactElement {
  const theme = useTheme();
  const proof = previewCount > 0
    ? [
        { value: String(componentCount), label: 'source components' },
        { value: String(releasedCount), label: `npm v${publishedPackageVersion} stable` },
        { value: String(previewCount), label: 'source previews' },
        { value: '625', label: '534 unit + 91 type' },
      ]
    : [
        { value: String(releasedCount), label: 'npm components' },
        { value: '31', label: 'semantic colors' },
        { value: '4', label: 'entry points' },
        { value: '0', label: 'direct deps' },
      ];
  return (
    <CssLayout className="seo-proof-grid" fallbackStyle={styles.proofFallback}>
      {proof.map((item) => (
        <View
          key={item.label}
          style={[
            styles.proofItem,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          ]}
        >
          <RNText style={[styles.proofValue, { color: theme.colors.text }]}>{item.value}</RNText>
          <RNText style={[styles.proofLabel, { color: theme.colors.textMuted }]}>{item.label}</RNText>
        </View>
      ))}
    </CssLayout>
  );
}

function SourceShowcase({
  checked,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}): ReactElement {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  return (
    <Surface
      padding="xl"
      style={[styles.showcase, { borderColor: theme.colors.primary }]}
    >
      <View style={styles.showcaseTopline}>
        <RNText style={[styles.showcaseEyebrow, { color: theme.colors.primaryStrong }]}>LIVE SOURCE PREVIEW</RNText>
        <Badge label="Type-safe" variant="info" size="sm" />
      </View>
      <RNText style={[styles.showcaseTitle, { color: theme.colors.text }]}>한 번 설계하고, 모든 화면에서.</RNText>
      <Text role="caption" color="textMuted" style={styles.showcaseCopy}>
        아래 컨트롤은 문서 장식이 아니라 현재 워크스페이스의 실제 컴포넌트입니다.
      </Text>
      <View style={styles.showcaseControl}>
        <Checkbox
          checked={checked}
          onCheckedChange={onCheckedChange}
          label="접근성 계약 포함"
          description="Space 입력과 타입 안전 상태"
          size="sm"
        />
      </View>
      <View style={styles.progressBlock}>
        <View style={styles.progressLabelRow}>
          <RNText style={[styles.progressLabel, { color: theme.colors.textMuted }]}>Cross-platform readiness</RNText>
          <RNText style={[styles.progressValue, { color: theme.colors.primaryStrong }]}>{checked ? '92%' : '64%'}</RNText>
        </View>
        <ProgressBar
          accessibilityLabel="크로스플랫폼 준비도"
          value={checked ? 92 : 64}
          size="sm"
        />
      </View>
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="컴포넌트 미리보기 페이지"
        page={page}
        pageCount={3}
        siblingCount={0}
        size="sm"
        getPageAccessibilityLabel={({ page, current }) =>
          `${page}페이지${current ? ' (현재)' : ''}`
        }
        onPageChange={setPage}
      />
      <Button
        label={checked ? '상태 바꾸기' : '다시 확인하기'}
        onPress={() => onCheckedChange(!checked)}
        size="sm"
        variant="primary-outline"
        style={styles.showcaseButton}
      />
    </Surface>
  );
}

function CategoryRail({
  activeCategory,
  onCategoryChange,
}: {
  readonly activeCategory: string;
  readonly onCategoryChange: (category: string) => void;
}): ReactElement {
  const theme = useTheme();
  const options = [ALL_CATEGORIES, ...categories];
  const content = (
    <Surface padding="lg" style={styles.categorySurface}>
      <RNText style={[styles.railEyebrow, { color: theme.colors.textMuted }]}>BROWSE</RNText>
      <RNText style={[styles.railTitle, { color: theme.colors.text }]}>카테고리</RNText>
      <CssLayout className="seo-category-options" fallbackStyle={styles.categoryOptionsFallback}>
        {options.map((category) => {
          const selected = category === activeCategory;
          const count = category === ALL_CATEGORIES
            ? componentSeoEntries.length
            : componentSeoEntries.filter((entry) => entry.category === category).length;
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              aria-pressed={selected}
              onPress={() => onCategoryChange(category)}
              style={({ pressed }) => [
                styles.categoryButton,
                selected ? { backgroundColor: theme.colors.primarySoft } : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <RNText
                style={[
                  styles.categoryLabel,
                  { color: selected ? theme.colors.primaryStrong : theme.colors.textMuted },
                ]}
              >
                {category}
              </RNText>
              <RNText
                style={[
                  styles.categoryCount,
                  { color: selected ? theme.colors.primaryStrong : theme.colors.textMuted },
                ]}
              >
                {count}
              </RNText>
            </Pressable>
          );
        })}
      </CssLayout>
      <View style={[styles.railNote, { backgroundColor: previewCount > 0 ? theme.colors.warningSoft : theme.colors.successSoft }]}>
        <RNText style={[styles.railNoteTitle, { color: previewCount > 0 ? theme.colors.warning : theme.colors.success }]}>
          {previewCount > 0 ? `Preview ${previewCount}` : `npm v${publishedPackageVersion}`}
        </RNText>
        <RNText style={[styles.railNoteCopy, { color: theme.colors.textMuted }]}>
          {previewCount > 0
            ? '미리보기 항목은 npm 공개 전까지 상세 페이지가 검색에서 제외됩니다.'
            : `${releasedCount}개 컴포넌트가 모두 공개되어 설치와 검색 색인이 가능합니다.`}
        </RNText>
      </View>
    </Surface>
  );

  if (Platform.OS === 'web') {
    return createElement('aside', { 'aria-label': '컴포넌트 필터', className: 'seo-category-rail' }, content);
  }
  return <View accessibilityLabel="컴포넌트 필터">{content}</View>;
}

function CatalogToolbar({
  query,
  onQueryChange,
  releaseFilter,
  onReleaseFilterChange,
  resultCount,
}: {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly releaseFilter: ReleaseFilter;
  readonly onReleaseFilterChange: (filter: ReleaseFilter) => void;
  readonly resultCount: number;
}): ReactElement {
  const theme = useTheme();
  const filters: readonly { value: ReleaseFilter; label: string; count: number }[] = [
    { value: 'all', label: '전체', count: componentSeoEntries.length },
    { value: 'released', label: 'npm stable', count: releasedCount },
    { value: 'preview', label: 'Preview', count: previewCount },
  ];
  return (
    <Surface padding="lg" style={styles.toolbar}>
      <View style={styles.searchGroup}>
        <RNText style={[styles.controlLabel, { color: theme.colors.text }]}>컴포넌트 검색</RNText>
        <View style={[styles.searchBox, { backgroundColor: theme.colors.background, borderColor: theme.colors.textSubtle }]}>
          <RNText aria-hidden style={[styles.searchIcon, { color: theme.colors.textMuted }]}>⌕</RNText>
          <TextInput
            accessibilityLabel="컴포넌트 검색"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            nativeID="component-search-input"
            onChangeText={onQueryChange}
            placeholder="Button, 접근성, 레이아웃…"
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.colors.text }]}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel="검색어 지우기"
              onPress={() => onQueryChange('')}
              style={({ pressed }) => [styles.clearButton, pressed ? styles.pressed : null]}
            >
              <RNText aria-hidden style={[styles.clearGlyph, { color: theme.colors.textMuted }]}>×</RNText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {previewCount > 0 ? (
        <View style={styles.filterGroup} accessibilityLabel="릴리스 상태 필터">
          <RNText style={[styles.controlLabel, { color: theme.colors.text }]}>릴리스 상태</RNText>
          <View style={styles.filterRow}>
            {filters.map((filter) => {
              const selected = filter.value === releaseFilter;
              return (
                <Pressable
                  key={filter.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  aria-pressed={selected}
                  onPress={() => onReleaseFilterChange(filter.value)}
                  style={({ pressed }) => [
                    styles.filterButton,
                    {
                      backgroundColor: selected ? theme.colors.text : theme.colors.background,
                      borderColor: selected ? theme.colors.text : theme.colors.line,
                    },
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <RNText style={[styles.filterLabel, { color: selected ? theme.colors.surface : theme.colors.textMuted }]}>
                    {filter.label}
                  </RNText>
                  <RNText style={[styles.filterCount, { color: selected ? theme.colors.surface : theme.colors.textMuted }]}>
                    {filter.count}
                  </RNText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* 시각 표시는 짧게, 안내는 그리드 옆의 단일 라이브 리전이 담당한다. */}
      <RNText aria-hidden style={[styles.toolbarCount, { color: theme.colors.textMuted }]}>
        {resultCount} / {componentSeoEntries.length}
      </RNText>
    </Surface>
  );
}

function ComponentGrid({ entries }: { readonly entries: readonly ComponentSeoEntry[] }): ReactElement {
  const cards = entries.map((entry) => <ComponentCard key={entry.slug} entry={entry} />);
  if (Platform.OS === 'web') return createElement('div', { className: 'seo-component-grid' }, cards);
  return <View style={styles.componentGridFallback}>{cards}</View>;
}

function ComponentCard({ entry }: { readonly entry: ComponentSeoEntry }): ReactElement {
  const theme = useTheme();
  const released = isReleasedComponent(entry);
  return (
    <Link href={componentDocsPath(entry.slug) as Href} asChild>
      <Pressable
        accessibilityRole="link"
        style={styles.componentCardLink}
      >
        <Surface padding="lg" style={styles.componentCard}>
          <View style={styles.componentMetaRow}>
            <View style={[styles.categoryTag, { backgroundColor: theme.colors.surfaceSubtle }]}>
              <RNText style={[styles.categoryTagText, { color: theme.colors.textMuted }]}>{entry.category}</RNText>
            </View>
            <View
              style={[
                styles.releaseTag,
                { backgroundColor: released ? theme.colors.successSoft : theme.colors.warningSoft },
              ]}
            >
              <View
                style={[
                  styles.releaseTagDot,
                  { backgroundColor: released ? theme.colors.success : theme.colors.warning },
                ]}
              />
              <RNText
                style={[
                  styles.releaseTagText,
                  { color: released ? theme.colors.success : theme.colors.warning },
                ]}
              >
                {released ? `v${entry.since}` : `v${entry.since} preview`}
              </RNText>
            </View>
          </View>
          <RNText
            accessibilityRole="header"
            aria-level={3}
            style={[styles.componentTitle, { color: theme.colors.text }]}
          >
            {entry.name}
          </RNText>
          <Text role="body" color="textMuted" numberOfLines={3} style={styles.componentDescription}>
            {entry.description}
          </Text>
          <View style={styles.componentFooter}>
            <RNText style={[styles.componentMeta, { color: theme.colors.textMuted }]}>예제 · 접근성 · 연관 API</RNText>
            <RNText aria-hidden style={[styles.componentArrow, { color: theme.colors.primaryStrong }]}>→</RNText>
          </View>
        </Surface>
      </Pressable>
    </Link>
  );
}

function EmptyResults({ onReset }: { readonly onReset: () => void }): ReactElement {
  const theme = useTheme();
  return (
    <Surface padding="xl" style={styles.emptyResults}>
      <RNText style={[styles.emptyTitle, { color: theme.colors.text }]}>일치하는 컴포넌트가 없습니다.</RNText>
      <Text role="body" color="textMuted">검색어나 카테고리, 릴리스 상태를 바꿔 보세요.</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [
          styles.resetButton,
          { backgroundColor: theme.colors.primarySoft },
          pressed ? styles.pressed : null,
        ]}
      >
        <RNText style={[styles.resetLabel, { color: theme.colors.primaryStrong }]}>필터 초기화</RNText>
      </Pressable>
    </Surface>
  );
}

const styles = StyleSheet.create({
  heroFallback: { flexDirection: 'row', gap: 32 },
  proofFallback: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  proofItem: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  proofValue: { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  proofLabel: { fontSize: 10, fontWeight: '800', marginTop: 4, textTransform: 'uppercase' },
  installRow: { alignSelf: 'flex-start', marginTop: 14 },
  showcase: { gap: 14, minWidth: 0 },
  showcaseTopline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  showcaseEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  showcaseTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5, lineHeight: 29 },
  showcaseCopy: { fontSize: 13, lineHeight: 20 },
  showcaseControl: { paddingVertical: 2 },
  progressBlock: { gap: 8 },
  progressLabelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  progressValue: { fontSize: 11, fontWeight: '900' },
  showcaseButton: { alignSelf: 'flex-start' },
  directoryFallback: { flexDirection: 'row', gap: 32 },
  categorySurface: { gap: 14 },
  railEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  railTitle: { fontSize: 18, fontWeight: '900', marginTop: -6 },
  categoryOptionsFallback: { gap: 4 },
  categoryButton: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: 11,
  },
  categoryLabel: { fontSize: 13, fontWeight: '700' },
  categoryCount: { fontSize: 11, fontWeight: '900' },
  railNote: { borderRadius: 10, gap: 4, marginTop: 4, padding: 10 },
  railNoteTitle: { fontSize: 10, fontWeight: '900' },
  railNoteCopy: { fontSize: 10, lineHeight: 16 },
  catalogMain: { flex: 1, minWidth: 0 },
  toolbar: { alignItems: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  searchGroup: { flexBasis: 260, flexGrow: 1, gap: 7, minWidth: 0 },
  filterGroup: { flexShrink: 1, gap: 7, maxWidth: '100%', minWidth: 0 },
  controlLabel: { fontSize: 11, fontWeight: '800' },
  searchBox: {
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    overflow: 'hidden',
    paddingLeft: 13,
  },
  searchIcon: { fontSize: 20, marginRight: 7 },
  searchInput: { flex: 1, fontSize: 14, minHeight: 44, minWidth: 0, outlineStyle: 'none' as never, paddingVertical: 0 },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 42, minWidth: 42 },
  clearGlyph: { fontSize: 19 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, maxWidth: '100%' },
  filterButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  filterLabel: { fontSize: 11, fontWeight: '800' },
  filterCount: { fontSize: 10, fontWeight: '900' },
  toolbarCount: { fontSize: 11, fontWeight: '800', paddingBottom: 13 },
  gridTopGap: { marginTop: 16 },
  // 스크린리더 전용. display:none이면 읽히지 않으므로 화면 밖으로 밀어낸다.
  visuallyHidden: { height: 1, left: -9999, overflow: 'hidden', position: 'absolute', width: 1 },
  componentGridFallback: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  componentCardLink: { height: '100%' },
  componentCard: { flex: 1, minHeight: 218 },
  componentMetaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'space-between' },
  categoryTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  categoryTagText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  releaseTag: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 5 },
  releaseTagDot: { borderRadius: 999, height: 5, width: 5 },
  releaseTagText: { fontSize: 9, fontWeight: '900' },
  componentTitle: { fontSize: 19, fontWeight: '900', lineHeight: 26, marginTop: 18 },
  componentDescription: { fontSize: 14, lineHeight: 22, marginTop: 9 },
  componentFooter: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginTop: 'auto', paddingTop: 18 },
  componentMeta: { fontSize: 10, fontWeight: '700' },
  componentArrow: { fontSize: 20, fontWeight: '800' },
  emptyResults: { alignItems: 'flex-start', gap: 8, minHeight: 200, justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900' },
  resetButton: { borderRadius: 10, justifyContent: 'center', marginTop: 8, minHeight: 40, paddingHorizontal: 14 },
  resetLabel: { fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
