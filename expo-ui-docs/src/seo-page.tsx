import { createElement, useEffect, useId, useState } from 'react';
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
import { ContentFrame, Surface, Text, UiProvider, enStrings, koStrings, useTheme } from '@gj-kit/expo-ui';
import type { ColorScheme } from '@gj-kit/expo-ui';
import { BrandMark, CHANGELOG_URL, ISSUES_URL, LICENSE_URL, REPO_URL, siteIcons, siteThemes } from './site-theme';
import { useHydratedWindowWidth } from './responsive';
import { componentSeoEntries } from './seo-content';
import { SITE_NAV_LINKS } from './site-nav';
import { useDocumentChrome, useSiteColorScheme } from './use-site-color-scheme';
import { useLocale } from './locale';
import { siteStrings } from './site-strings';

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
    return createElement(
      as,
      {
        className,
        id,
        // skip link가 <main>으로 포커스를 옮기려면 포커스 가능해야 한다.
        // 없으면 링크만 이동하고 다음 Tab은 헤더로 되돌아간다.
        ...(as === 'main' ? { tabIndex: -1 } : {}),
        ...(label ? { 'aria-label': label } : {}),
      },
      children,
    );
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
  // 랜딩·문서 허브와 같은 훅을 써서 페이지를 옮겨도 선택한 테마가 유지된다.
  const { colorScheme, toggleColorScheme } = useSiteColorScheme();
  const { locale } = useLocale();
  useDocumentChrome(siteThemes[colorScheme].colors.background);

  return (
    // 라이브러리 내장 문구(Pagination의 이전/다음 등)도 화면 언어를 따라야 한다.
    <UiProvider
      theme={siteThemes}
      colorScheme={colorScheme}
      strings={locale === 'ko' ? koStrings : enStrings}
      icons={siteIcons}
    >
      <SeoPageFrame
        breadcrumbs={breadcrumbs}
        wide={wide}
        colorScheme={colorScheme}
        onToggleColorScheme={toggleColorScheme}
      >
        {children}
      </SeoPageFrame>
    </UiProvider>
  );
}

function SeoPageFrame({
  breadcrumbs,
  children,
  colorScheme,
  onToggleColorScheme,
  wide,
}: {
  readonly breadcrumbs: readonly BreadcrumbItem[];
  readonly children: ReactNode;
  readonly colorScheme: ColorScheme;
  readonly onToggleColorScheme: () => void;
  readonly wide: boolean;
}): ReactElement {
  const theme = useTheme();
  const width = useHydratedWindowWidth();
  const compactHeader = width < 760;
  const pathname = usePathname();
  const { locale, toggleLocale } = useLocale();
  const t = siteStrings(locale);
  const mainContentId = `main-content-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

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
                <RNText style={[styles.footerCopy, { color: theme.colors.textMuted }]}>{t.tagline}</RNText>
              </View>
              <View style={styles.footerLinks}>
                <TextLink href="/docs/components" subtle>{t.componentsCount(componentSeoEntries.length)}</TextLink>
                <TextLink href="/docs/accessibility" subtle>{t.accessibility}</TextLink>
                <TextLink href="/docs/theming" subtle>{t.theming}</TextLink>
                <TextLink href="/docs/tailwind" subtle>{t.tailwind}</TextLink>
                <TextLink href="/docs/insets-keyboard" subtle>{t.safeArea}</TextLink>
                <TextLink href="/docs/type-safety" subtle>{t.typeSafety}</TextLink>
                <TextLink href={REPO_URL} subtle>{t.github}</TextLink>
                <TextLink href={CHANGELOG_URL} subtle>{t.changelog}</TextLink>
                <TextLink href={ISSUES_URL} subtle>{t.issues}</TextLink>
                <TextLink href={LICENSE_URL} subtle>{t.license}</TextLink>
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
        ? createElement('a', { className: 'seo-skip-link', href: `#${mainContentId}` }, t.skipToContent)
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
                accessibilityLabel={t.homeLabel}
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

            <Semantic as="nav" label={t.primaryNavLabel}>
              <View style={styles.headerNav}>
                {SITE_NAV_LINKS.map((item) => {
                  // 좁은 헤더에서는 보조 항목을 접는다. 링크는 히어로와 푸터에 남는다.
                  if (compactHeader && (item.href === '/docs/getting-started' || item.href === REPO_URL)) {
                    return null;
                  }
                  // 실제 경로로 판정한다. 전에는 "컴포넌트 페이지가 아니면 Docs"라서
                  // 가이드·404·_sitemap에서도 Docs에 aria-current="page"가 붙었다.
                  const active =
                    item.href === '/docs/components'
                      ? pathname.startsWith('/docs/components')
                      : pathname === item.href;
                  return (
                    <HeaderNavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      active={active}
                      compact={compactHeader}
                      emphasis={item.emphasis}
                    />
                  );
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={locale === 'en' ? t.toKorean : t.toEnglish}
                  onPress={toggleLocale}
                  style={StyleSheet.flatten([
                    styles.headerNavLink,
                    styles.themeToggle,
                    { borderColor: theme.colors.line },
                  ])}
                >
                  <RNText style={[styles.localeToggleLabel, { color: theme.colors.text }]}>
                    {locale === 'en' ? '한' : 'EN'}
                  </RNText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={colorScheme === 'light' ? t.toDark : t.toLight}
                  onPress={onToggleColorScheme}
                  style={StyleSheet.flatten([
                    styles.headerNavLink,
                    styles.themeToggle,
                    { borderColor: theme.colors.line },
                  ])}
                >
                  <RNText aria-hidden style={[styles.themeToggleGlyph, { color: theme.colors.text }]}>
                    {colorScheme === 'light' ? '☾' : '☀'}
                  </RNText>
                </Pressable>
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
  const t = siteStrings(useLocale().locale);
  return (
    <Semantic as="nav" label={t.breadcrumbNavLabel}>
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
  const theme = useTheme();
  return (
    <Semantic as="section">
      <View style={styles.section}>
        <RNText
          accessibilityRole="header"
          aria-level={2}
          // 색 토큰을 빼면 다크 모드에서 검은 제목이 검은 배경에 얹힌다.
          style={[styles.sectionTitle, { color: theme.colors.text }]}
        >
          {title}
        </RNText>
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

/** 실제 컴포넌트를 렌더하는 미리보기 캔버스. 코드 블록보다 먼저 보여야 한다. */
export function PreviewPanel({
  children,
  note,
}: {
  readonly children: ReactNode;
  readonly note?: string | undefined;
}): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  return (
    <View style={[styles.previewPanel, { backgroundColor: theme.colors.surface, borderColor: theme.colors.line }]}>
      <View style={styles.previewTopline}>
        <RNText style={[styles.previewEyebrow, { color: theme.colors.primaryStrong }]}>{t.livePreview}</RNText>
        <RNText style={[styles.previewHint, { color: theme.colors.textMuted }]}>
          {t.livePreviewHint}
        </RNText>
      </View>
      <View style={[styles.previewCanvas, { backgroundColor: theme.colors.background, borderColor: theme.colors.line }]}>
        {children}
      </View>
      {note ? <RNText style={[styles.previewHint, { color: theme.colors.textMuted }]}>{note}</RNText> : null}
    </View>
  );
}

export type PropRow = {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  /** 판별 유니언의 한 갈래에서만 필요한 prop (Chip의 onRemove, Link의 href 등). */
  readonly conditional?: boolean | undefined;
  readonly description?: string | undefined;
};

/**
 * props 표. 내용은 scripts/generate-props.mjs가 라이브러리의 실제 타입에서
 * 뽑아내므로 손으로 고치지 않는다. 웹에서는 진짜 <table>로 렌더해 스크린리더와
 * 검색 엔진이 행·열 관계를 읽을 수 있게 한다.
 */
export function PropsTable({
  rows,
  typeName,
  inheritsPlatformProps = false,
}: {
  readonly rows: readonly PropRow[];
  readonly typeName: string;
  readonly inheritsPlatformProps?: boolean | undefined;
}): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);

  const conditionalCount = rows.filter((row) => row.conditional).length;
  const caption = t.propsCaption(
    typeName,
    rows.length,
    rows.filter((row) => row.required).length,
    conditionalCount,
  );

  if (Platform.OS === 'web') {
    const cell = (content: ReactNode, extra?: Record<string, unknown>) =>
      createElement(
        'td',
        {
          style: {
            borderTop: `1px solid ${theme.colors.line}`,
            padding: '12px 14px',
            verticalAlign: 'top',
            ...(extra ?? {}),
          },
        },
        content,
      );

    return createElement(
      'div',
      { style: { overflowX: 'auto', width: '100%' } },
      createElement(
        'table',
        {
          style: {
            borderCollapse: 'collapse',
            fontSize: 13,
            minWidth: 560,
            textAlign: 'left',
            width: '100%',
          },
        },
        createElement(
          'caption',
          {
            style: {
              color: theme.colors.textMuted,
              fontSize: 12,
              paddingBottom: 10,
              textAlign: 'left',
            },
          },
          caption,
        ),
        createElement(
          'thead',
          null,
          createElement(
            'tr',
            { style: { color: theme.colors.textMuted } },
            ...[t.propsHeaderProp, t.propsHeaderType, t.propsHeaderRequired, t.propsHeaderDescription].map((heading) =>
              createElement(
                'th',
                {
                  key: heading,
                  scope: 'col',
                  style: { fontSize: 11, letterSpacing: 0.4, padding: '0 14px 10px', textTransform: 'uppercase' },
                },
                heading,
              ),
            ),
          ),
        ),
        createElement(
          'tbody',
          null,
          ...rows.map((row) =>
            createElement(
              'tr',
              { key: row.name },
              createElement(
                'th',
                {
                  scope: 'row',
                  style: {
                    borderTop: `1px solid ${theme.colors.line}`,
                    color: theme.colors.text,
                    fontFamily: MONO_STACK,
                    fontSize: 12.5,
                    fontWeight: 700,
                    padding: '12px 14px',
                    textAlign: 'left',
                    verticalAlign: 'top',
                    whiteSpace: 'nowrap',
                  },
                },
                row.name,
              ),
              cell(
                createElement(
                  'code',
                  { style: { color: theme.colors.primaryStrong, fontFamily: MONO_STACK, fontSize: 12 } },
                  row.type,
                ),
                { maxWidth: 320 },
              ),
              cell(
                row.required
                  ? createElement(
                      'span',
                      { style: { color: theme.colors.danger, fontSize: 11, fontWeight: 800 } },
                      t.required,
                    )
                  : row.conditional
                    ? createElement(
                        'span',
                        {
                          style: { color: theme.colors.warning, fontSize: 11, fontWeight: 800 },
                          title: t.conditionalHint,
                        },
                        t.conditional,
                      )
                    : createElement('span', { style: { color: theme.colors.textSubtle, fontSize: 11 } }, t.none),
                { whiteSpace: 'nowrap' },
              ),
              cell(
                createElement(
                  'span',
                  { style: { color: theme.colors.textMuted, lineHeight: 1.65 } },
                  row.description ?? '',
                ),
              ),
            ),
          ),
        ),
      ),
      inheritsPlatformProps
        ? createElement(
            'p',
            { style: { color: theme.colors.textMuted, fontSize: 12, marginTop: 12 } },
            t.inheritsPlatformProps,
          )
        : null,
    );
  }

  return (
    <View style={styles.propsList}>
      <RNText style={[styles.propsCaption, { color: theme.colors.textMuted }]}>{caption}</RNText>
      {rows.map((row) => (
        <View key={row.name} style={[styles.propsRow, { borderTopColor: theme.colors.line }]}>
          <RNText style={[styles.propName, { color: theme.colors.text }]}>
            {row.name}
            {row.required ? ` (${t.required})` : row.conditional ? ` (${t.conditional})` : ''}
          </RNText>
          <RNText style={[styles.propType, { color: theme.colors.primaryStrong }]}>{row.type}</RNText>
          {row.description ? (
            <RNText style={[styles.propDescription, { color: theme.colors.textMuted }]}>{row.description}</RNText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function useCopy(text: string): { readonly copied: boolean; readonly copy: () => void } {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (Platform.OS !== 'web') return;
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  return { copied, copy };
}

/** 설치 명령처럼 그대로 붙여넣어야 하는 한 줄. 선택 대신 버튼으로 복사한다. */
export function CommandBlock({ command }: { readonly command: string }): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  const { copied, copy } = useCopy(command);
  return (
    <View style={styles.commandBlock}>
      <RNText style={styles.commandPrompt}>$</RNText>
      <RNText selectable style={styles.commandText}>{command}</RNText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.copyCommand(command)}
        onPress={copy}
        style={[styles.copyButton, { backgroundColor: theme.colors.primary }]}
      >
        <RNText style={[styles.copyLabel, { color: theme.colors.onPrimary }]}>{copied ? t.copied : t.copy}</RNText>
      </Pressable>
    </View>
  );
}

export function CodePanel({ code, label = 'TypeScript' }: { readonly code: string; readonly label?: string | undefined }): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  const { copied, copy } = useCopy(code);
  return (
    <View style={[styles.codePanel, { backgroundColor: '#121724', borderColor: theme.colors.line }]}>
      <View style={styles.codeTopline}>
        <RNText style={styles.codeLabel}>{label}</RNText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.copyExample}
          onPress={copy}
          style={styles.codeCopyButton}
        >
          <RNText style={styles.codeCopyLabel}>{copied ? t.copied : t.copy}</RNText>
        </Pressable>
      </View>
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
  const t = siteStrings(useLocale().locale);
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
          <RNText aria-hidden style={[styles.linkCardArrow, { color: theme.colors.primaryStrong }]}>{t.readMore} <RNText>→</RNText></RNText>
        </Surface>
      </Pressable>
    </Link>
  );
}

/** 문서 끝에서 목록으로 되돌아가지 않고 이웃 컴포넌트로 바로 넘어가는 이동 줄. */
export function AdjacentNav({
  previous,
  next,
}: {
  readonly previous?: { readonly href: string; readonly label: string } | undefined;
  readonly next?: { readonly href: string; readonly label: string } | undefined;
}): ReactElement | null {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  if (!previous && !next) return null;

  const item = (
    target: { readonly href: string; readonly label: string },
    direction: 'previous' | 'next',
  ) => (
    <Link href={target.href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={direction === 'previous' ? t.previousComponent(target.label) : t.nextComponent(target.label)}
        style={StyleSheet.flatten([
          styles.adjacentItem,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
          direction === 'next' ? styles.adjacentItemEnd : null,
        ])}
      >
        <RNText style={[styles.adjacentDirection, { color: theme.colors.textMuted }]}>
          {direction === 'previous' ? t.previous : t.next}
        </RNText>
        <RNText style={[styles.adjacentLabel, { color: theme.colors.text }]}>{target.label}</RNText>
      </Pressable>
    </Link>
  );

  return (
    <Semantic as="nav" label={t.adjacentNavLabel}>
      <View style={styles.adjacentRow}>
        {previous ? item(previous, 'previous') : <View style={styles.adjacentSpacer} />}
        {next ? item(next, 'next') : <View style={styles.adjacentSpacer} />}
      </View>
    </Semantic>
  );
}

export function ReleaseNotice({ version }: { readonly version: string }): ReactElement {
  const theme = useTheme();
  const t = siteStrings(useLocale().locale);
  return (
    <Surface padding="lg" style={[styles.releaseNotice, { borderColor: theme.colors.warning }]}>
      <RNText style={[styles.releaseTitle, { color: theme.colors.warning }]}>{t.releaseTitle(version)}</RNText>
      <Text role="caption" color="textMuted">{t.releaseBody}</Text>
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
  themeToggle: { borderWidth: 1, marginLeft: 4, minWidth: 44, paddingHorizontal: 10 },
  themeToggleGlyph: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  localeToggleLabel: { fontSize: 12, fontWeight: '900', lineHeight: 20 },
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
  propsList: { gap: 2, width: '100%' },
  propsCaption: { fontSize: 12, paddingBottom: 8 },
  propsRow: { borderTopWidth: 1, gap: 4, paddingVertical: 12 },
  propName: { fontFamily: 'monospace', fontSize: 13, fontWeight: '800' },
  propType: { fontFamily: 'monospace', fontSize: 12 },
  propDescription: { fontSize: 13, lineHeight: 21 },
  previewPanel: { borderRadius: 18, borderWidth: 1, gap: 12, padding: 18, width: '100%' },
  previewTopline: { gap: 4 },
  previewEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  previewHint: { fontSize: 12, lineHeight: 19 },
  previewCanvas: { borderRadius: 14, borderWidth: 1, gap: 14, minWidth: 0, padding: 20 },
  commandBlock: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#121724',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    maxWidth: '100%',
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  commandPrompt: { color: '#9FF5D1', fontFamily: 'monospace', fontSize: 13, fontWeight: '900' },
  commandText: { color: '#FFFFFF', flexShrink: 1, fontFamily: 'monospace', fontSize: 13, fontWeight: '700' },
  copyButton: { borderRadius: 8, justifyContent: 'center', minHeight: 32, paddingHorizontal: 12 },
  copyLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  codePanel: { borderRadius: 14, borderWidth: 1, gap: 12, overflow: 'hidden', padding: 20 },
  codeTopline: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  codeLabel: { color: '#8FA4C7', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  codeCopyButton: {
    backgroundColor: 'rgba(143, 164, 199, 0.16)',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 11,
  },
  codeCopyLabel: { color: '#C8D6EC', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  codeText: { color: '#E7ECF5', fontFamily: 'monospace', fontSize: 13, lineHeight: 22 },
  linkGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  linkCardPressable: { flexBasis: 280, flexGrow: 1, minWidth: 260 },
  linkCard: { flex: 1, minHeight: 176 },
  linkCardHeading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  linkCardTitle: { flexShrink: 1, fontSize: 17, fontWeight: '800', lineHeight: 24 },
  linkCardBadge: { fontSize: 10, fontWeight: '800' },
  linkCardDescription: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  linkCardArrow: { fontSize: 12, fontWeight: '800', marginTop: 'auto', paddingTop: 18 },
  adjacentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 26 },
  adjacentItem: {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 220,
    flexGrow: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  adjacentItemEnd: { alignItems: 'flex-end' },
  adjacentSpacer: { flexBasis: 220, flexGrow: 1 },
  adjacentDirection: { fontSize: 11, fontWeight: '800' },
  adjacentLabel: { fontSize: 15, fontWeight: '800' },
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
