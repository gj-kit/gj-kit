import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  componentDocsPath,
  componentText,
  getComponentSeoEntryByReference,
  getGuideSeoEntry,
  guideDocsPath,
  guideText,
  guideSeoEntries,
  isReleasedComponent,
} from '../../src/seo-content';
import {
  SeoHead,
  breadcrumbSchema,
  techArticleSchema,
  webPageSchema,
} from '../../src/seo';
import {
  BulletList,
  CodePanel,
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoParagraph,
  SeoSection,
} from '../../src/seo-page';
import { useLocale } from '../../src/locale';
import { siteStrings } from '../../src/site-strings';

export function generateStaticParams(): readonly { guide: string }[] {
  return guideSeoEntries.map((entry) => ({ guide: entry.slug }));
}

export default function GuidePage(): ReactElement {
  const params = useLocalSearchParams<{ guide: string | string[] }>();
  const slug = Array.isArray(params.guide) ? params.guide[0] ?? '' : params.guide;
  const guide = getGuideSeoEntry(slug);
  const { locale } = useLocale();
  const t = siteStrings(locale);

  if (!guide) {
    return (
      <>
        <SeoHead
          title={t.guideNotFoundMetaTitle}
          description={t.guideNotFoundMetaDescription}
          path={`/docs/${slug}`}
          locale={locale}
          noindex
        />
        <SeoPageShell breadcrumbs={[{ label: t.home, href: '/' }, { label: t.docs, href: '/docs' }, { label: t.notFoundTitle }]}>
          <SeoPageHeading eyebrow="NOT FOUND" title={t.notFoundTitle} description={t.notFoundDescription} />
        </SeoPageShell>
      </>
    );
  }

  const path = guideDocsPath(guide.slug);
  const text = guideText(guide, locale);
  const title = `${text.title} | GJ Kit Expo UI`;
  const related = guide.relatedComponents
    .map((reference) => getComponentSeoEntryByReference(reference))
    .filter((entry) => entry !== undefined);

  return (
    <>
      <SeoHead
        title={title}
        description={text.description}
        path={path}
        type="article"
        locale={locale}
        schemas={[
          webPageSchema({ path, title, description: text.description, locale }),
          techArticleSchema({ path, headline: text.headline, description: text.description, about: text.title, locale }),
          breadcrumbSchema([
            { name: t.home, path: '/' },
            { name: t.docs, path: '/docs' },
            { name: text.title, path },
          ]),
        ]}
      />
      <SeoPageShell
        breadcrumbs={[
          { label: t.home, href: '/' },
          { label: t.docs, href: '/docs' },
          { label: text.title },
        ]}
      >
        <SeoPageHeading eyebrow="GUIDE" title={text.headline} description={text.summary} />

        {text.sections.map((section) => (
          <SeoSection key={section.title} title={section.title}>
            <SeoParagraph>{section.body}</SeoParagraph>
            {section.bullets ? <BulletList items={section.bullets} /> : null}
            {section.code ? <CodePanel code={section.code} /> : null}
          </SeoSection>
        ))}

        {related.length > 0 ? (
          <SeoSection title={t.sectionRelated}>
            <SeoLinkGrid
              items={related.map((entry) => ({
                href: componentDocsPath(entry.slug),
                title: entry.name,
                description: componentText(entry, locale).description,
                ...(!isReleasedComponent(entry) ? { badge: `v${entry.since}` } : {}),
              }))}
            />
          </SeoSection>
        ) : null}
      </SeoPageShell>
    </>
  );
}
