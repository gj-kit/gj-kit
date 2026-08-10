import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'expo-router';
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
import { siteThemes } from './site-theme';

type BreadcrumbItem = {
  readonly label: string;
  readonly href?: string | undefined;
};

function Semantic({
  as,
  children,
}: {
  readonly as: 'article' | 'footer' | 'header' | 'main' | 'nav' | 'section';
  readonly children: ReactNode;
}): ReactElement {
  if (Platform.OS === 'web') return createElement(as, null, children);
  return <View>{children}</View>;
}

function BrandMark(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.brandMark, { backgroundColor: theme.colors.primary }]}>
      <RNText style={[styles.brandGlyph, { color: theme.colors.onPrimary }]}>g</RNText>
    </View>
  );
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
    <Link href={href as Href} target={external ? '_blank' : undefined} asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [styles.textLink, pressed ? styles.pressed : null]}
      >
        <RNText
          style={[
            styles.textLinkLabel,
            { color: subtle ? theme.colors.textMuted : theme.colors.primary },
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
}: {
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly children: ReactNode;
}): ReactElement {
  return (
    <UiProvider theme={siteThemes} colorScheme="light" strings={koStrings}>
      <SeoPageFrame breadcrumbs={breadcrumbs}>{children}</SeoPageFrame>
    </UiProvider>
  );
}

function SeoPageFrame({
  breadcrumbs,
  children,
}: {
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly children: ReactNode;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.page, { backgroundColor: theme.colors.background }]}>
      <Semantic as="header">
        <View
          style={[
            styles.header,
            { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.line },
          ]}
        >
          <ContentFrame maxWidth={1100} center padding={20} style={styles.headerInner}>
            <Link href="/" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="GJ Kit Expo UI 홈"
                style={({ pressed }) => [styles.brand, pressed ? styles.pressed : null]}
              >
                <BrandMark />
                <View>
                  <RNText style={[styles.brandName, { color: theme.colors.text }]}>@gj-kit/expo-ui</RNText>
                  <RNText style={[styles.brandMeta, { color: theme.colors.textMuted }]}>Expo & React Native UI</RNText>
                </View>
              </Pressable>
            </Link>

            <Semantic as="nav">
              <View style={styles.headerNav}>
                <TextLink href="/docs" subtle>Docs</TextLink>
                <TextLink href="/docs/components" subtle>Components</TextLink>
                <TextLink href="/docs/getting-started" subtle>Getting started</TextLink>
                <TextLink href="https://www.npmjs.com/package/@gj-kit/expo-ui">npm ↗</TextLink>
              </View>
            </Semantic>
          </ContentFrame>
        </View>
      </Semantic>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Semantic as="main">
          <ContentFrame maxWidth={920} center padding={24}>
            <Breadcrumbs items={breadcrumbs} />
            <Semantic as="article">{children}</Semantic>
          </ContentFrame>
        </Semantic>

        <Semantic as="footer">
          <ContentFrame maxWidth={920} center padding={24}>
            <View style={[styles.footer, { borderTopColor: theme.colors.line }]}>
              <View>
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
        </Semantic>
      </ScrollView>
    </View>
  );
}

function Breadcrumbs({ items }: { readonly items: readonly BreadcrumbItem[] }): ReactElement {
  const theme = useTheme();
  return (
    <Semantic as="nav">
      <View accessibilityLabel="현재 문서 경로" style={styles.breadcrumbs}>
        {items.map((item, index) => (
          <View key={`${item.label}-${index}`} style={styles.breadcrumbItem}>
            {index > 0 ? (
              <RNText aria-hidden style={[styles.breadcrumbSeparator, { color: theme.colors.textSubtle }]}>/</RNText>
            ) : null}
            {item.href ? (
              <TextLink href={item.href} subtle>{item.label}</TextLink>
            ) : (
              <RNText style={[styles.breadcrumbCurrent, { color: theme.colors.text }]}>{item.label}</RNText>
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
  return (
    <View style={styles.hero}>
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
        style={[styles.title, { color: theme.colors.text }]}
      >
        {title}
      </RNText>
      <Text role="body" color="textMuted" style={styles.description}>{description}</Text>
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
  return (
    <View style={styles.linkGrid}>
      {items.map((item) => <SeoLinkCard key={item.href} {...item} />)}
    </View>
  );
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
        style={({ pressed }) => [styles.linkCardPressable, pressed ? styles.pressed : null]}
      >
        <Surface padding="xl" style={styles.linkCard}>
          <View style={styles.linkCardHeading}>
            <RNText accessibilityRole="header" aria-level={3} style={[styles.linkCardTitle, { color: theme.colors.text }]}>{title}</RNText>
            {badge ? (
              <RNText style={[styles.linkCardBadge, { color: theme.colors.warning }]}>{badge}</RNText>
            ) : null}
          </View>
          <Text role="caption" color="textMuted" style={styles.linkCardDescription}>{description}</Text>
          <RNText aria-hidden style={[styles.linkCardArrow, { color: theme.colors.primary }]}>문서 보기 →</RNText>
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
  page: { flex: 1, minHeight: '100%' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  header: { borderBottomWidth: 1 },
  headerInner: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    justifyContent: 'space-between',
  },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandMark: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  brandGlyph: { fontSize: 20, fontWeight: '900' },
  brandName: { fontSize: 14, fontWeight: '800' },
  brandMeta: { fontSize: 11, marginTop: 2 },
  headerNav: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  textLink: { alignSelf: 'flex-start' },
  textLinkLabel: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  breadcrumbs: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 24 },
  breadcrumbItem: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  breadcrumbSeparator: { fontSize: 12 },
  breadcrumbCurrent: { fontSize: 13, fontWeight: '700' },
  hero: { paddingBottom: 38, paddingTop: 36 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.4 },
  previewBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  previewText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 42, fontWeight: '900', letterSpacing: -1.5, lineHeight: 50, maxWidth: 760 },
  description: { fontSize: 17, lineHeight: 28, marginTop: 18, maxWidth: 760 },
  section: { gap: 16, paddingBottom: 22, paddingTop: 22 },
  sectionTitle: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
  paragraph: { fontSize: 15, lineHeight: 26 },
  nativeList: { gap: 8 },
  codePanel: { borderRadius: 14, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 20 },
  codeLabel: { color: '#8FA4C7', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  codeText: { color: '#E7ECF5', fontFamily: 'monospace', fontSize: 13, lineHeight: 22 },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  linkCardPressable: { flexBasis: 270, flexGrow: 1, minWidth: 250 },
  linkCard: { flex: 1, minHeight: 170 },
  linkCardHeading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  linkCardTitle: { flexShrink: 1, fontSize: 17, fontWeight: '800', lineHeight: 24 },
  linkCardBadge: { fontSize: 10, fontWeight: '800' },
  linkCardDescription: { lineHeight: 21, marginTop: 10 },
  linkCardArrow: { fontSize: 12, fontWeight: '800', marginTop: 18 },
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
  footerCopy: { fontSize: 12, marginTop: 4 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
});
