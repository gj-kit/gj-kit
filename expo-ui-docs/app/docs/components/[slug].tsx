import type { ReactElement } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  componentDocsPath,
  componentSeoEntries,
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
  const Preview = getComponentPreview(entry.slug);
  const propsEntry = getComponentProps(entry.slug);
  const title = released
    ? `${entry.name} 컴포넌트 — Expo·React Native | GJ Kit Expo UI`
    : `${entry.name} 컴포넌트 v${entry.since} 미리보기 | GJ Kit Expo UI`;
  const description = released
    ? entry.description
    : `${entry.description} 현재 npm latest는 v${publishedPackageVersion}이며 이 API는 v${entry.since} 릴리스 예정입니다.`;
  const related = getRelatedComponents(entry);
  const { previous, next } = getAdjacentComponents(entry);

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
          // headline은 이미 컴포넌트 이름으로 끝난다. 앞에 이름을 또 붙이면
          // "Button — …타입 안전 Button"처럼 제목에서 이름이 두 번 나온다.
          title={entry.headline}
          description={entry.description}
          {...(!released ? { preview: `npm v${publishedPackageVersion} · v${entry.since} 예정` } : {})}
        />

        {!released ? <ReleaseNotice version={entry.since} /> : null}

        {Preview ? (
          <SeoSection title={`${entry.name} 미리보기`}>
            <PreviewPanel note="위 컨트롤은 실제로 동작합니다. 눌러 보고 상태를 바꿔 보세요.">
              <Preview />
            </PreviewPanel>
          </SeoSection>
        ) : null}

        {entry.slug === 'pagination' ? (
          <SeoSection title="Pagination 직접 조작해 보기">
            <PaginationLiveExample />
          </SeoSection>
        ) : null}

        <SeoSection title={`${entry.name} 사용 시점과 역할`}>
          <SeoParagraph>{entry.summary}</SeoParagraph>
          <BulletList items={entry.features} />
        </SeoSection>

        <SeoSection title={released ? '설치와 최소 예제' : `최소 예제 (v${entry.since} 릴리스 후 사용 가능)`}>
          <SeoParagraph>
            {released
              ? `${entry.name}: 패키지 루트 엔트리에서 import한 뒤 앱이 소유한 상태와 이벤트를 연결하세요.`
              : `${entry.name}은 아직 npm에 없습니다. 지금 설치되는 v${publishedPackageVersion}에는 이 export가 없어 아래 코드는 컴파일되지 않습니다. v${entry.since} 공개 후 사용하세요.`}
          </SeoParagraph>
          {/*
            미공개 컴포넌트에 설치 명령을 그대로 두면 "설치하면 쓸 수 있다"는
            잘못된 신호를 준다. 설치 명령은 릴리스된 컴포넌트에만 보인다.
          */}
          {released ? <CommandBlock command="pnpm add @gj-kit/expo-ui" /> : null}
          <CodePanel
            code={`import { ${entry.name} } from '@gj-kit/expo-ui';\n\n${entry.snippet}`}
            label={released ? 'TypeScript' : `TypeScript · v${entry.since} 예정 · npm 미공개`}
          />
        </SeoSection>

        {propsEntry ? (
          <SeoSection title={`${entry.name} props`}>
            <SeoParagraph>
              아래 표는 패키지가 내보내는 {propsEntry.typeName} 타입에서 빌드 시점에 생성됩니다. 문서와 API가 어긋날 수 없습니다.
            </SeoParagraph>
            <PropsTable
              rows={propsEntry.props}
              typeName={propsEntry.typeName}
              inheritsPlatformProps={propsEntry.inheritsPlatformProps}
            />
          </SeoSection>
        ) : null}

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

        <AdjacentNav
          {...(previous ? { previous: { href: componentDocsPath(previous.slug), label: previous.name } } : {})}
          {...(next ? { next: { href: componentDocsPath(next.slug), label: next.name } } : {})}
        />
      </SeoPageShell>
    </>
  );
}
