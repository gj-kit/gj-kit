import { createElement, useEffect, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link, usePathname } from 'expo-router';
import type { Href } from 'expo-router';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { ContentFrame, Surface, Text, UiProvider, koStrings, useTheme } from '@gj-kit/expo-ui';
import { BrandMark, siteIcons, siteThemes } from './site-theme';
import { useHydratedWindowWidth } from './responsive';

type BreadcrumbItem = {
  readonly label: string;
  readonly href?: string | undefined;
};

function Semantic({
  as,
  children,
  className,
  id,
  label,
}: {
  readonly as: 'article' | 'footer' | 'header' | 'main' | 'nav' | 'section';
  readonly children: ReactNode;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
  readonly label?: string | undefined;
}): ReactElement {
  if (Platform.OS === 'web') {
    return createElement(as, { className, id, ...(label ? { 'aria-label': label } : {}) }, children);
  }
  return <View nativeID={id} accessibilityLabel={label}>{children}</View>;
}

function TextLink({
  href,
  children,
  subtle = false,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly subtle?: boolean | undefined;
}): ReactElement {
  const theme = useTheme();
  const external = href.startsWith('http');
  return (
    <Link
      href={href as Href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        style={styles.textLink}
      >
        <RNText
          style={[
            styles.textLinkLabel,
            { color: subtle ? theme.colors.textMuted : theme.colors.primaryStrong },
          ]}
        >
          {children}
        </RNText>
      </Pressable>
    </Link>
  );
}

export function SeoPageShell({
  breadcrumbs,
  children,
  wide = false,
}: {
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly children: ReactNode;
  readonly wide?: boolean | undefined;
}): ReactElement {
  return (
    <UiProvider theme={siteThemes} colorScheme="light" strings={koStrings} icons={siteIcons}>
      <SeoPageFrame breadcrumbs={breadcrumbs} wide={wide}>{children}</SeoPageFrame>
    </UiProvider>
  );
}

function SeoPageFrame({
  breadcrumbs,
  children,
  wide,
}: {
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly children: ReactNode;
  readonly wide: boolean;
}): ReactElement {
  const theme = useTheme();
  const width = useHydratedWindowWidth();
  const compactHeader = width < 760;
  const pathname = usePathname();
  const mainContentId = `main-content-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const componentPath = breadcrumbs.some(
    (item) => item.href === '/docs/components' || item.label.startsWith('컴포넌트'),
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  const documentContent = (
    <View style={styles.documentContent}>
      <Semantic as="main" id={mainContentId}>
        <View style={styles.landmarkHost}>
          <ContentFrame maxWidth={wide ? 1320 : 1040} center padding={wide ? 32 : 28}>
            <Breadcrumbs items={breadcrumbs} />
            <Semantic as="article">{children}</Semantic>
          </ContentFrame>
        </View>
      </Semantic>

      <Semantic as="footer">
        <View style={styles.landmarkHost}>
          <ContentFrame maxWidth={1320} center padding={32}>
            <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
              <View style={styles.footerIdentity}>
                <RNText style={[styles.footerBrand, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
                <RNText style={[styles.footerCopy, { color: theme.colors.textMuted }]}>MIT · Type-safe primitives for Expo and React Native.</RNText>
              </View>
              <View style={styles.footerLinks}>
                <TextLink href="/docs/components" subtle>컴포넌트 31종</TextLink>
                <TextLink href="/docs/accessibility" subtle>접근성</TextLink>
                <TextLink href="/docs/theming" subtle>테마</TextLink>
              </View>
            </View>
          </ContentFrame>
        </View>
      </Semantic>
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        Platform.OS === 'web' ? styles.pageWeb : styles.pageNative,
        { backgroundColor: theme.colors.background },
      ]}
    >
      {Platform.OS === 'web'
        ? createElement('a', { className: 'seo-skip-link', href: `#${mainContentId}` }, '본문으로 건너뛰기')
        : null}
      <Semantic as="header" className="seo-sticky-header">
        <View
          style={[
            styles.header,
            { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.line },
          ]}
        >
          <ContentFrame maxWidth={1320} center padding={compactHeader ? 14 : 18} style={styles.headerInner}>
            <Link href="/" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="GJ Kit Expo UI 홈"
                style={styles.brand}
              >
                <BrandMark size={38} />
                {!compactHeader ? (
                  <View>
                    <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
                    <RNText style={[styles.brandMeta, { color: theme.colors.textMuted }]}>Expo & React Native UI</RNText>
                  </View>
                ) : null}
              </Pressable>
            </Link>

            <Semantic as="nav" label="주요 문서">
              <View style={styles.headerNav}>
                <HeaderNavLink href="/docs" label="Docs" active={!componentPath} compact={compactHeader} />
                <HeaderNavLink href="/docs/components" label="Components" active={componentPath} compact={compactHeader} />
                {!compactHeader ? (
                  <HeaderNavLink href="/docs/getting-started" label="Getting started" />
                ) : null}
                <HeaderNavLink
                  href="https://www.npmjs.com/package/@gj-kit/expo-ui"
                  label="npm ↗"
                  compact={compactHeader}
                  emphasis
                />
              </View>
            </Semantic>
          </ContentFrame>
        </View>
      </Semantic>
      {Platform.OS === 'web' ? documentContent : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {documentContent}
        </ScrollView>
      )}
    </View>
  );
}

function HeaderNavLink({
  href,
  label,
  active = false,
  compact = false,
  emphasis = false,
}: {
  readonly href: string;
  readonly label: string;
  readonly active?: boolean | undefined;
  readonly compact?: boolean | undefined;
  readonly emphasis?: boolean | undefined;
}): ReactElement {
  const theme = useTheme();
  const external = href.startsWith('http');
  return (
    <Link
      href={href as Href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        aria-current={active ? 'page' : undefined}
        style={StyleSheet.flatten([
          styles.headerNavLink,
          compact ? styles.headerNavLinkCompact : null,
          active ? { backgroundColor: theme.colors.primarySoft } : null,
          emphasis
            ? { backgroundColor: theme.colors.text, borderColor: theme.colors.text }
            : null,
        ])}
      >
        <RNText
          style={[
            styles.headerNavLabel,
            {
              color: emphasis
                ? theme.colors.surface
                : active
                  ? theme.colors.primaryStrong
                  : theme.colors.textMuted,
            },
          ]}
        >
          {label}
        </RNText>
      </Pressable>
    </Link>
  );
}

function Breadcrumbs({ items }: { readonly items: readonly BreadcrumbItem[] }): ReactElement {
  const theme = useTheme();
  return (
    <Semantic as="nav" label="현재 문서 경로">
      <View style={styles.breadcrumbs}>
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`} style={styles.breadcrumbItem}>
            {index > 0 ? (
              <RNText aria-hidden style={[styles.breadcrumbSeparator, { color: theme.colors.textSubtle }]}>/</RNText>
            ) : null}
            {item.href ? (
              <TextLink href={item.href} subtle>{item.label}</TextLink>
            ) : (
              <RNText aria-current="page" style={[styles.breadcrumbCurrent, { color: theme.colors.text }]}>{item.label}</RNText>
            )}
          </View>
        ))}
      </View>
    </Semantic>
  );
}

export function SeoPageHeading({
  eyebrow,
  title,
  description,
  preview,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly preview?: string | undefined;
}): ReactElement {
  const theme = useTheme();
  const width = useHydratedWindowWidth();
  const compact = width < 600;
  return (
    <View style={[styles.hero, compact ? styles.heroCompact : null]}>
      <View style={styles.eyebrowRow}>
        <RNText style={[styles.eyebrow, { color: theme.colors.primary }]}>{eyebrow}</RNText>
        {preview ? (
          <View style={[styles.previewBadge, { backgroundColor: theme.colors.warningSoft }]}>
            <RNText style={[styles.previewText, { color: theme.colors.warning }]}>{preview}</RNText>
          </View>
        ) : null}
      </View>
      <RNText
        accessibilityRole="header"
        aria-level={1}
        style={[styles.title, compact ? styles.titleCompact : null, { color: theme.colors.text }]}
      >
        {title}
      </RNText>
      <Text
        role="body"
        color="textMuted"
        style={[styles.description, compact ? styles.descriptionCompact : null]}
      >
        {description}
      </Text>
    </View>
  );
}

export function SeoSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Semantic as="section">
      <View style={styles.section}>
        <RNText accessibilityRole="header" aria-level={2} style={styles.sectionTitle}>{title}</RNText>
        {children}
      </View>
    </Semantic>
  );
}

export function SeoParagraph({ children }: { readonly children: ReactNode }): ReactElement {
  return <Text role="body" color="textMuted" style={styles.paragraph}>{children}</Text>;
}

export function BulletList({ items }: { readonly items: readonly string[] }): ReactElement {
  const theme = useTheme();
  if (Platform.OS === 'web') {
    return createElement(
      'ul',
      { style: { color: theme.colors.textMuted, lineHeight: '1.75', margin: 0, paddingLeft: 24 } },
      items.map((item) => createElement('li', { key: item, style: { marginBottom: 8 } }, item)),
    );
  }
  return (
    <View style={styles.nativeList}>
      {items.map((item) => (
        <Text key={item} role="body" color="textMuted">• {item}</Text>
      ))}
    </View>
  );
}

export function CodePanel({ code, label = 'TypeScript' }: { readonly code: string; readonly label?: string | undefined }): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.codePanel, { backgroundColor: '#121724', borderColor: theme.colors.line }]}>
      <RNText style={styles.codeLabel}>{label}</RNText>
      {Platform.OS === 'web' ? (
        createElement(
          'pre',
          {
            style: {
              color: '#E7ECF5',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 13,
              lineHeight: 1.7,
              margin: 0,
              overflowX: 'auto',
              whiteSpace: 'pre',
            },
          },
          createElement('code', null, code),
        )
      ) : (
        <RNText selectable style={styles.codeText}>{code}</RNText>
      )}
    </View>
  );
}

export function SeoLinkGrid({
  items,
}: {
  readonly items: readonly {
    readonly href: string;
    readonly title: string;
    readonly description: string;
    readonly badge?: string | undefined;
  }[];
}): ReactElement {
  const cards = items.map((item) => <SeoLinkCard key={item.href} {...item} />);
  if (Platform.OS === 'web') {
    return createElement('div', { className: 'seo-link-grid' }, cards);
  }
  return <View style={styles.linkGrid}>{cards}</View>;
}

function SeoLinkCard({
  href,
  title,
  description,
  badge,
}: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly badge?: string | undefined;
}): ReactElement {
  const theme = useTheme();
  return (
    <Link href={href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        style={styles.linkCardPressable}
      >
        <Surface padding="xl" style={styles.linkCard}>
          <View style={styles.linkCardHeading}>
            <RNText accessibilityRole="header" aria-level={3} style={[styles.linkCardTitle, { color: theme.colors.text }]}>{title}</RNText>
            {badge ? (
              <RNText style={[styles.linkCardBadge, { color: theme.colors.warning }]}>{badge}</RNText>
            ) : null}
          </View>
          <Text role="body" color="textMuted" style={styles.linkCardDescription}>{description}</Text>
          <RNText aria-hidden style={[styles.linkCardArrow, { color: theme.colors.primaryStrong }]}>자세히 보기 <RNText>→</RNText></RNText>
        </Surface>
      </Pressable>
    </Link>
  );
}

export function ReleaseNotice({ version }: { readonly version: string }): ReactElement {
  const theme = useTheme();
  return (
    <Surface padding="lg" style={[styles.releaseNotice, { borderColor: theme.colors.warning }]}>
      <RNText style={[styles.releaseTitle, { color: theme.colors.warning }]}>v{version} 공개 예정</RNText>
      <Text role="caption" color="textMuted">
        이 컴포넌트는 현재 소스에 포함된 다음 릴리스 미리보기입니다. npm latest에 반영될 때까지 검색 색인에서 제외됩니다.
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  page: { minHeight: '100%' },
  pageNative: { flex: 1 },
  pageWeb: { minHeight: '100vh' as never },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  documentContent: { width: '100%' },
  landmarkHost: { alignItems: 'center', width: '100%' },
  header: { borderBottomWidth: 1 },
  headerInner: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 44 },
  brandName: { fontSize: 14, fontWeight: '800' },
  brandMeta: { fontSize: 11, marginTop: 2 },
  headerNav: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' },
  headerNavLink: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
  },
  headerNavLinkCompact: { paddingHorizontal: 8 },
  headerNavLabel: { fontSize: 13, fontWeight: '800' },
  textLink: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 36 },
  textLinkLabel: { fontSize: 13, fontWeight: '700' },
  breadcrumbs: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 24 },
  breadcrumbItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  breadcrumbSeparator: { fontSize: 12 },
  breadcrumbCurrent: { fontSize: 13, fontWeight: '700' },
  hero: { paddingBottom: 38, paddingTop: 36 },
  heroCompact: { paddingBottom: 28, paddingTop: 28 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  previewBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  previewText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: 50, maxWidth: 760 },
  titleCompact: { fontSize: 36, letterSpacing: -1.1, lineHeight: 43 },
  description: { fontSize: 17, lineHeight: 28, marginTop: 18, maxWidth: 760 },
  descriptionCompact: { fontSize: 16, lineHeight: 26, marginTop: 16 },
  section: { gap: 16, paddingBottom: 22, paddingTop: 22 },
  sectionTitle: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
  paragraph: { fontSize: 15, lineHeight: 26 },
  nativeList: { gap: 8 },
  codePanel: { borderRadius: 14, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 20 },
  codeLabel: { color: '#8FA4C7', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  codeText: { color: '#E7ECF5', fontFamily: 'monospace', fontSize: 13, lineHeight: 22 },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  linkCardPressable: { flexBasis: 280, flexGrow: 1, minWidth: 260 },
  linkCard: { flex: 1, minHeight: 176 },
  linkCardHeading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  linkCardTitle: { flexShrink: 1, fontSize: 17, fontWeight: '800', lineHeight: 24 },
  linkCardBadge: { fontSize: 10, fontWeight: '800' },
  linkCardDescription: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  linkCardArrow: { fontSize: 12, fontWeight: '800', marginTop: 'auto', paddingTop: 18 },
  releaseNotice: { borderWidth: 1, gap: 6, marginBottom: 8 },
  releaseTitle: { fontSize: 13, fontWeight: '900' },
  footer: {
    alignItems: 'flex-start',
    borderTopWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingTop: 28,
  },
  footerBrand: { fontSize: 14, fontWeight: '800' },
  footerIdentity: { flexShrink: 1, maxWidth: '100%', minWidth: 0 },
  footerCopy: { flexShrink: 1, fontSize: 12, marginTop: 4, maxWidth: '100%' },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});
