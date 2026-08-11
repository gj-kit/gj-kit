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
  componentCategories,
  componentDocsPath,
  componentSeoEntries,
  componentText,
  guideDocsPath,
  guideSeoEntries,
  guideText,
  isReleasedComponent,
  publishedPackageVersion,
} from '../../src/seo-content';
import { useLocale } from '../../src/locale';
import type { Locale } from '../../src/locale';
import { siteStrings } from '../../src/site-strings';
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
/** 카테고리 라벨은 로케일마다 다르므로 '전체'는 내부 센티널로 표현한다. */
const ALL_CATEGORIES = '__all__';

type ReleaseFilter = 'all' | 'released' | 'preview';

const componentCount = componentSeoEntries.length;
const releasedCount = componentSeoEntries.filter(isReleasedComponent).length;
const previewCount = componentCount - releasedCount;

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
  const { locale } = useLocale();
  const t = siteStrings(locale);
  const TITLE = t.catalogMetaTitle(componentCount);
  const DESCRIPTION = t.catalogMetaDescription(componentCount);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>('all');
  const [showcaseChecked, setShowcaseChecked] = useState(true);

  const componentItems = componentSeoEntries.map((entry) => ({
    name: entry.name,
    path: componentDocsPath(entry.slug),
  }));

  const visibleEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return componentSeoEntries.filter((entry) => {
      const text = componentText(entry, locale);
      if (activeCategory !== ALL_CATEGORIES && text.category !== activeCategory) return false;
      const released = isReleasedComponent(entry);
      if (releaseFilter === 'released' && !released) return false;
      if (releaseFilter === 'preview' && released) return false;
      if (!normalizedQuery) return true;
      // 로케일 본문만 검색하면 영어 화면에서 한글 키워드를 못 찾는다. 양쪽을 모두 훑는다.
      return [entry.name, text.category, text.description, entry.ko.description, entry.en.description]
        .join(' ')
        .toLocaleLowerCase(locale)
        .includes(normalizedQuery);
    });
  }, [activeCategory, locale, query, releaseFilter]);

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
        locale={locale}
        schemas={[
          webPageSchema({ path: PATH, title: TITLE, description: DESCRIPTION, type: 'CollectionPage', locale }),
          breadcrumbSchema([
            { name: t.home, path: '/' },
            { name: t.docs, path: '/docs' },
            { name: t.components, path: PATH },
          ]),
          itemListSchema('GJ Kit Expo UI components', componentItems),
        ]}
      />
      <SeoPageShell
        wide
        breadcrumbs={[
          { label: t.home, href: '/' },
          { label: t.docs, href: '/docs' },
          { label: t.componentsCount(componentCount) },
        ]}
      >
        <CssLayout
          className="seo-directory-hero"
          fallbackStyle={styles.heroFallback}
        >
          <View>
            <SeoPageHeading
              eyebrow="COMPONENT LIBRARY"
              title={t.catalogTitle(componentCount)}
              description={t.catalogHeroDescription}
              preview={previewCount > 0
                ? t.catalogPreviewBadge(publishedPackageVersion, previewCount)
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

        <SeoSection title={t.catalogExplore}>
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
                  ? `${t.catalogNoResults} ${t.catalogNoResultsBody}`
                  : t.catalogResults(visibleEntries.length, componentSeoEntries.length)}
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

        <SeoSection title={t.catalogPrinciples}>
          <SeoLinkGrid
            items={guideSeoEntries.map((guide) => ({
              href: guideDocsPath(guide.slug),
              title: guideText(guide, locale).title,
              description: guideText(guide, locale).description,
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
  const t = siteStrings(useLocale().locale);
  const [page, setPage] = useState(1);
  return (
    <Surface
      padding="xl"
      style={[styles.showcase, { borderColor: theme.colors.primary }]}
    >
      <View style={styles.showcaseTopline}>
        <RNText style={[styles.showcaseEyebrow, { color: theme.colors.primaryStrong }]}>{t.showcaseEyebrow}</RNText>
        <Badge label="Type-safe" variant="info" size="sm" />
      </View>
      <RNText style={[styles.showcaseTitle, { color: theme.colors.text }]}>{t.showcaseTitle}</RNText>
      <Text role="caption" color="textMuted" style={styles.showcaseCopy}>
        {t.showcaseCopy}
      </Text>
      <View style={styles.showcaseControl}>
        <Checkbox
          checked={checked}
          onCheckedChange={onCheckedChange}
          label={t.showcaseCheckboxLabel}
          description={t.showcaseCheckboxDescription}
          size="sm"
        />
      </View>
      <View style={styles.progressBlock}>
        <View style={styles.progressLabelRow}>
          <RNText style={[styles.progressLabel, { color: theme.colors.textMuted }]}>{t.showcaseProgressLabel}</RNText>
          <RNText style={[styles.progressValue, { color: theme.colors.primaryStrong }]}>{checked ? '92%' : '64%'}</RNText>
        </View>
        <ProgressBar
          accessibilityLabel={t.showcaseReadiness}
          value={checked ? 92 : 64}
          size="sm"
        />
      </View>
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel={t.showcasePreviewPages}
        page={page}
        pageCount={3}
        siblingCount={0}
        size="sm"
        getPageAccessibilityLabel={({ page, current }) => t.paginationPageLabel(page, current)}
        onPageChange={setPage}
      />
      <Button
        label={checked ? t.showcaseToggle : t.showcaseRecheck}
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
  const { locale } = useLocale();
  const t = siteStrings(locale);
  const options = [ALL_CATEGORIES, ...componentCategories(locale)];
  const content = (
    <Surface padding="lg" style={styles.categorySurface}>
      <RNText style={[styles.railEyebrow, { color: theme.colors.textMuted }]}>{t.catalogBrowse}</RNText>
      <RNText style={[styles.railTitle, { color: theme.colors.text }]}>{t.catalogCategories}</RNText>
      <CssLayout className="seo-category-options" fallbackStyle={styles.categoryOptionsFallback}>
        {options.map((category) => {
          const selected = category === activeCategory;
          const count = category === ALL_CATEGORIES
            ? componentSeoEntries.length
            : componentSeoEntries.filter((entry) => componentText(entry, locale).category === category).length;
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
                {category === ALL_CATEGORIES ? t.catalogAll : category}
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
          {previewCount > 0 ? t.catalogPreviewNote(previewCount) : t.catalogPublishedNote(releasedCount)}
        </RNText>
      </View>
    </Surface>
  );

  if (Platform.OS === 'web') {
    return createElement('aside', { 'aria-label': t.catalogFilterRegion, className: 'seo-category-rail' }, content);
  }
  return <View accessibilityLabel={t.catalogFilterRegion}>{content}</View>;
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
  const t = siteStrings(useLocale().locale);
  // 미리보기가 남아 있을 때만 릴리스 필터를 보여준다. 전부 공개되면 갈래가
  // 'all'과 'released' 두 개로 같아져, 아무것도 거르지 못하는 필터만 남는다.
  const filters: readonly { value: ReleaseFilter; label: string; count: number }[] =
    previewCount > 0
      ? [
          { value: 'all', label: t.catalogFilterAll, count: componentSeoEntries.length },
          { value: 'released', label: t.catalogFilterStable, count: releasedCount },
          { value: 'preview', label: t.catalogFilterPreview, count: previewCount },
        ]
      : [];
  return (
    <Surface padding="lg" style={styles.toolbar}>
      <View style={styles.searchGroup}>
        <RNText style={[styles.controlLabel, { color: theme.colors.text }]}>{t.catalogSearchLabel}</RNText>
        <View style={[styles.searchBox, { backgroundColor: theme.colors.background, borderColor: theme.colors.textSubtle }]}>
          <RNText aria-hidden style={[styles.searchIcon, { color: theme.colors.textMuted }]}>⌕</RNText>
          <TextInput
            accessibilityLabel={t.catalogSearchLabel}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="never"
            nativeID="component-search-input"
            onChangeText={onQueryChange}
            placeholder={t.catalogSearchPlaceholder}
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.colors.text }]}
            value={query}
          />
          {query ? (
            <Pressable
              accessibilityLabel={t.catalogClearSearch}
              onPress={() => onQueryChange('')}
              style={({ pressed }) => [styles.clearButton, pressed ? styles.pressed : null]}
            >
              <RNText aria-hidden style={[styles.clearGlyph, { color: theme.colors.textMuted }]}>×</RNText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {previewCount > 0 ? (
        <View style={styles.filterGroup} accessibilityLabel={t.catalogReleaseLabel}>
          <RNText style={[styles.controlLabel, { color: theme.colors.text }]}>{t.catalogReleaseLabel}</RNText>
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
  const { locale } = useLocale();
  const t = siteStrings(locale);
  const text = componentText(entry, locale);
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
              <RNText style={[styles.categoryTagText, { color: theme.colors.textMuted }]}>{text.category}</RNText>
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
            {text.description}
          </Text>
          <View style={styles.componentFooter}>
            <RNText style={[styles.componentMeta, { color: theme.colors.textMuted }]}>{t.catalogCardMeta}</RNText>
            <RNText aria-hidden style={[styles.componentArrow, { color: theme.colors.primaryStrong }]}>→</RNText>
          </View>
        </Surface>
      </Pressable>
    </Link>
  );
}

function EmptyResults({ onReset }: { readonly onReset: () => void }): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  return (
    <Surface padding="xl" style={styles.emptyResults}>
      <RNText style={[styles.emptyTitle, { color: theme.colors.text }]}>{t.catalogNoResults}</RNText>
      <Text role="body" color="textMuted">{t.catalogNoResultsBody}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onReset}
        style={({ pressed }) => [
          styles.resetButton,
          { backgroundColor: theme.colors.primarySoft },
          pressed ? styles.pressed : null,
        ]}
      >
        <RNText style={[styles.resetLabel, { color: theme.colors.primaryStrong }]}>{t.catalogReset}</RNText>
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
