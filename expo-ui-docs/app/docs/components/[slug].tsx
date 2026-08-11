import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  componentDocsPath,
  componentSeoEntries,
  componentText,
  getAdjacentComponents,
  getComponentSeoEntry,
  getRelatedComponents,
  isReleasedComponent,
  publishedPackageVersion,
} from '../../../src/seo-content';
import {
  SeoHead,
  breadcrumbSchema,
  techArticleSchema,
  webPageSchema,
} from '../../../src/seo';
import {
  AdjacentNav,
  BulletList,
  CodePanel,
  CommandBlock,
  PreviewPanel,
  PropsTable,
  ReleaseNotice,
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoParagraph,
  SeoSection,
} from '../../../src/seo-page';
import { PaginationLiveExample } from '../../../src/pagination-live-example';
import { getComponentPreview } from '../../../src/component-previews';
import { getComponentProps } from '../../../src/component-props';
import { getComponentDetail } from '../../../src/seo-component-detail';
import { useLocale } from '../../../src/locale';
import { siteStrings } from '../../../src/site-strings';

export function generateStaticParams(): readonly { slug: string }[] {
  return componentSeoEntries.map((entry) => ({ slug: entry.slug }));
}

export default function ComponentDetailPage(): ReactElement {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] ?? '' : params.slug;
  const entry = getComponentSeoEntry(slug);
  const { locale } = useLocale();
  const t = siteStrings(locale);

  if (!entry) {
    return (
      <>
        <SeoHead
          title={`${t.notFoundTitle} | GJ Kit Expo UI`}
          description={t.notFoundDescription}
          path={`/docs/components/${slug}`}
          locale={locale}
          noindex
        />
        <SeoPageShell
          breadcrumbs={[
            { label: t.home, href: '/' },
            { label: t.components, href: '/docs/components' },
            { label: t.notFoundTitle },
          ]}
        >
          <SeoPageHeading eyebrow="NOT FOUND" title={t.notFoundTitle} description={t.notFoundDescription} />
        </SeoPageShell>
      </>
    );
  }

  const text = componentText(entry, locale);
  // 상세 본문은 이 라우트에서만 import한다 — seo-component-detail.ts 주석 참고.
  const detail = getComponentDetail(entry.slug, locale);
  const path = componentDocsPath(entry.slug);
  const released = isReleasedComponent(entry);
  const Preview = getComponentPreview(entry.slug);
  const propsEntry = getComponentProps(entry.slug);
  const title = released
    ? `${entry.name} — Expo & React Native | GJ Kit Expo UI`
    : `${entry.name} v${entry.since} preview | GJ Kit Expo UI`;
  const description = released
    ? text.description
    : `${text.description} npm latest is v${publishedPackageVersion}; this API ships in v${entry.since}.`;
  const related = getRelatedComponents(entry);
  const { previous, next } = getAdjacentComponents(entry);

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        path={path}
        type="article"
        locale={locale}
        noindex={!released}
        imageAlt={`${entry.name} — GJ Kit Expo UI component documentation`}
        schemas={[
          webPageSchema({ path, title, description, locale }),
          techArticleSchema({
            path,
            headline: detail?.headline ?? entry.name,
            description,
            about: `${entry.name} React Native component`,
            locale,
          }),
          breadcrumbSchema([
            { name: t.home, path: '/' },
            { name: t.docs, path: '/docs' },
            { name: t.components, path: '/docs/components' },
            { name: entry.name, path },
          ]),
        ]}
      />
      <SeoPageShell
        breadcrumbs={[
          { label: t.home, href: '/' },
          { label: t.docs, href: '/docs' },
          { label: t.components, href: '/docs/components' },
          { label: entry.name },
        ]}
      >
        <SeoPageHeading
          eyebrow={`${text.category.toUpperCase()} · SINCE v${entry.since}`}
          // headline은 이미 컴포넌트 이름으로 끝난다. 앞에 이름을 또 붙이면
          // "Button — …type-safe Button"처럼 제목에서 이름이 두 번 나온다.
          title={detail?.headline ?? entry.name}
          description={text.description}
          {...(!released ? { preview: `npm v${publishedPackageVersion} · v${entry.since}` } : {})}
        />

        {!released ? <ReleaseNotice version={entry.since} /> : null}

        {Preview ? (
          <SeoSection title={t.sectionPreview(entry.name)}>
            <PreviewPanel note={t.previewNote}>
              <Preview />
            </PreviewPanel>
          </SeoSection>
        ) : null}

        {entry.slug === 'pagination' ? <PaginationLiveExample /> : null}

        <SeoSection title={t.sectionWhen(entry.name)}>
          <SeoParagraph>{detail?.summary ?? text.description}</SeoParagraph>
          <BulletList items={detail?.features ?? []} />
        </SeoSection>

        <SeoSection
          title={released ? t.sectionInstall : t.sectionInstallPreview(entry.since)}
        >
          <SeoParagraph>
            {released
              ? t.installParagraph(entry.name)
              : t.installParagraphPreview(entry.name, entry.since, publishedPackageVersion)}
          </SeoParagraph>
          {/*
            미공개 컴포넌트에 설치 명령을 그대로 두면 "설치하면 쓸 수 있다"는
            잘못된 신호를 준다. 설치 명령은 릴리스된 컴포넌트에만 보인다.
          */}
          {released ? <CommandBlock command="pnpm add @gj-kit/expo-ui" /> : null}
          <CodePanel
            code={`import { ${entry.name} } from '@gj-kit/expo-ui';\n\n${detail?.snippet ?? ''}`}
            label={released ? 'TypeScript' : `TypeScript · v${entry.since} · not on npm yet`}
          />
        </SeoSection>

        {propsEntry ? (
          <SeoSection title={t.sectionProps(entry.name)}>
            <SeoParagraph>{t.propsParagraph(propsEntry.typeName)}</SeoParagraph>
            <PropsTable
              rows={propsEntry.props}
              typeName={propsEntry.typeName}
              inheritsPlatformProps={propsEntry.inheritsPlatformProps}
            />
          </SeoSection>
        ) : null}

        <SeoSection title={t.sectionAccessibility}>
          <SeoParagraph>{detail?.accessibility ?? ''}</SeoParagraph>
          <SeoParagraph>{t.accessibilityTail}</SeoParagraph>
        </SeoSection>

        {related.length > 0 ? (
          <SeoSection title={t.sectionRelated}>
            <SeoLinkGrid
              items={related.map((candidate) => ({
                href: componentDocsPath(candidate.slug),
                title: candidate.name,
                description: componentText(candidate, locale).description,
                ...(!isReleasedComponent(candidate) ? { badge: `v${candidate.since}` } : {}),
              }))}
            />
          </SeoSection>
        ) : null}

        <AdjacentNav
          {...(previous ? { previous: { href: componentDocsPath(previous.slug), label: previous.name } } : {})}
          {...(next ? { next: { href: componentDocsPath(next.slug), label: next.name } } : {})}
        />
      </SeoPageShell>
    </>
  );
}
