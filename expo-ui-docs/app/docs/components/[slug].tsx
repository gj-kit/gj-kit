import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  componentDocsPath,
  componentSeoEntries,
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
  BulletList,
  CodePanel,
  ReleaseNotice,
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoParagraph,
  SeoSection,
} from '../../../src/seo-page';

export function generateStaticParams(): readonly { slug: string }[] {
  return componentSeoEntries.map((entry) => ({ slug: entry.slug }));
}

export default function ComponentDetailPage(): ReactElement {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] ?? '' : params.slug;
  const entry = getComponentSeoEntry(slug);

  if (!entry) {
    return (
      <>
        <SeoHead
          title="컴포넌트 문서를 찾을 수 없습니다 | GJ Kit Expo UI"
          description="요청한 GJ Kit Expo UI 컴포넌트 문서가 없습니다."
          path={`/docs/components/${slug}`}
          noindex
        />
        <SeoPageShell breadcrumbs={[{ label: '홈', href: '/' }, { label: '컴포넌트', href: '/docs/components' }, { label: '문서 없음' }]}>
          <SeoPageHeading eyebrow="NOT FOUND" title="컴포넌트 문서를 찾을 수 없습니다" description="컴포넌트 목록에서 현재 공개된 API를 확인해 주세요." />
        </SeoPageShell>
      </>
    );
  }

  const path = componentDocsPath(entry.slug);
  const released = isReleasedComponent(entry);
  const title = released
    ? `${entry.name} 컴포넌트 — Expo·React Native | GJ Kit Expo UI`
    : `${entry.name} 컴포넌트 v${entry.since} 미리보기 | GJ Kit Expo UI`;
  const description = released
    ? entry.description
    : `${entry.description} 현재 npm latest는 v${publishedPackageVersion}이며 이 API는 v${entry.since} 릴리스 예정입니다.`;
  const related = getRelatedComponents(entry);

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        path={path}
        type="article"
        noindex={!released}
        imageAlt={`${entry.name} — GJ Kit Expo UI 컴포넌트 문서`}
        schemas={[
          webPageSchema({ path, title, description }),
          techArticleSchema({ path, headline: entry.headline, description, about: `${entry.name} React Native 컴포넌트` }),
          breadcrumbSchema([
            { name: '홈', path: '/' },
            { name: '문서', path: '/docs' },
            { name: '컴포넌트', path: '/docs/components' },
            { name: entry.name, path },
          ]),
        ]}
      />
      <SeoPageShell
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '문서', href: '/docs' },
          { label: '컴포넌트', href: '/docs/components' },
          { label: entry.name },
        ]}
      >
        <SeoPageHeading
          eyebrow={`${entry.category.toUpperCase()} · SINCE v${entry.since}`}
          title={`${entry.name} — ${entry.headline}`}
          description={entry.description}
          {...(!released ? { preview: `npm v${publishedPackageVersion} · v${entry.since} 예정` } : {})}
        />

        {!released ? <ReleaseNotice version={entry.since} /> : null}

        <SeoSection title={`${entry.name} 사용 시점과 역할`}>
          <SeoParagraph>{entry.summary}</SeoParagraph>
          <BulletList items={entry.features} />
        </SeoSection>

        <SeoSection title="설치와 최소 예제">
          <SeoParagraph>
            {entry.name}: 패키지 루트 엔트리에서 import한 뒤 앱이 소유한 상태와 이벤트를 연결하세요.
          </SeoParagraph>
          <CodePanel code={`pnpm add @gj-kit/expo-ui\n\nimport { ${entry.name} } from '@gj-kit/expo-ui';\n\n${entry.snippet}`} />
        </SeoSection>

        <SeoSection title="접근성과 플랫폼 동작">
          <SeoParagraph>{entry.accessibility}</SeoParagraph>
          <SeoParagraph>
            기본 스타일은 현재 UiProvider 테마의 color, spacing, radius, typography, metric 역할에서 파생됩니다. Expo, bare React Native와 React Native Web에서 같은 prop 계약을 사용합니다.
          </SeoParagraph>
        </SeoSection>

        {related.length > 0 ? (
          <SeoSection title="함께 사용하는 컴포넌트">
            <SeoLinkGrid
              items={related.map((candidate) => ({
                href: componentDocsPath(candidate.slug),
                title: candidate.name,
                description: candidate.description,
                ...(!isReleasedComponent(candidate) ? { badge: `v${candidate.since} 예정` } : {}),
              }))}
            />
          </SeoSection>
        ) : null}
      </SeoPageShell>
    </>
  );
}
