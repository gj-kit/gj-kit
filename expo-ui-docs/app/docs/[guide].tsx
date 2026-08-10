import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  componentDocsPath,
  getComponentSeoEntryByReference,
  getGuideSeoEntry,
  guideDocsPath,
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

export function generateStaticParams(): readonly { guide: string }[] {
  return guideSeoEntries.map((entry) => ({ guide: entry.slug }));
}

export default function GuidePage(): ReactElement {
  const params = useLocalSearchParams<{ guide: string | string[] }>();
  const slug = Array.isArray(params.guide) ? params.guide[0] ?? '' : params.guide;
  const guide = getGuideSeoEntry(slug);

  if (!guide) {
    return (
      <>
        <SeoHead title="가이드를 찾을 수 없습니다 | GJ Kit Expo UI" description="요청한 GJ Kit Expo UI 가이드가 없습니다." path={`/docs/${slug}`} noindex />
        <SeoPageShell breadcrumbs={[{ label: '홈', href: '/' }, { label: '문서', href: '/docs' }, { label: '가이드 없음' }]}>
          <SeoPageHeading eyebrow="NOT FOUND" title="가이드를 찾을 수 없습니다" description="문서 홈에서 현재 공개된 설치·테마·접근성 가이드를 확인해 주세요." />
        </SeoPageShell>
      </>
    );
  }

  const path = guideDocsPath(guide.slug);
  const title = `${guide.title} | GJ Kit Expo UI`;
  const related = guide.relatedComponents
    .map((reference) => getComponentSeoEntryByReference(reference))
    .filter((entry) => entry !== undefined);

  return (
    <>
      <SeoHead
        title={title}
        description={guide.description}
        path={path}
        type="article"
        schemas={[
          webPageSchema({ path, title, description: guide.description }),
          techArticleSchema({ path, headline: guide.headline, description: guide.description, about: guide.title }),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '문서', path: '/docs' },
            { name: guide.title, path },
          ]),
        ]}
      />
      <SeoPageShell
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '문서', href: '/docs' },
          { label: guide.title },
        ]}
      >
        <SeoPageHeading eyebrow="GUIDE" title={guide.headline} description={guide.summary} />

        {guide.sections.map((section) => (
          <SeoSection key={section.title} title={section.title}>
            <SeoParagraph>{section.body}</SeoParagraph>
            {section.bullets ? <BulletList items={section.bullets} /> : null}
            {section.code ? <CodePanel code={section.code} /> : null}
          </SeoSection>
        ))}

        {related.length > 0 ? (
          <SeoSection title="관련 컴포넌트 문서">
            <SeoLinkGrid
              items={related.map((entry) => ({
                href: componentDocsPath(entry.slug),
                title: entry.name,
                description: entry.description,
                ...(!isReleasedComponent(entry) ? { badge: `v${entry.since} 예정` } : {}),
              }))}
            />
          </SeoSection>
        ) : null}
      </SeoPageShell>
    </>
  );
}
