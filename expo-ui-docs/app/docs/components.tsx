import type { ReactElement } from 'react';
import { View } from 'react-native';
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
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoParagraph,
  SeoSection,
} from '../../src/seo-page';

const PATH = '/docs/components';
const TITLE = 'Expo UI 컴포넌트 31종 | GJ Kit Expo UI';
const DESCRIPTION =
  '소스에 포함된 Expo·React Native·Web용 TypeScript UI 컴포넌트 31종의 예제, 접근성, 테마 연동과 릴리스 상태를 확인하세요.';

export default function ComponentsIndexPage(): ReactElement {
  const categories = Array.from(new Set(componentSeoEntries.map((entry) => entry.category)));
  const componentItems = componentSeoEntries.map((entry) => ({
    name: entry.name,
    path: componentDocsPath(entry.slug),
  }));

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
        breadcrumbs={[
          { label: '홈', href: '/' },
          { label: '문서', href: '/docs' },
          { label: '컴포넌트 31종' },
        ]}
      >
        <SeoPageHeading
          eyebrow="COMPONENT LIBRARY"
          title="Expo·React Native UI 컴포넌트 31종"
          description="액션부터 폼 제어, 피드백, 레이아웃과 Dialog까지 같은 테마 토큰과 타입 계약으로 조립합니다. 각 페이지에서 최소 예제, 사용 시점과 접근성 동작을 확인할 수 있습니다."
          preview={`npm v${publishedPackageVersion} 기준 · v0.2 항목은 미리보기`}
        />

        <SeoSection title="버전 표시를 이렇게 읽으세요">
          <SeoParagraph>
            npm latest에 포함된 컴포넌트는 바로 사용할 수 있습니다. “v0.2 예정” 표시는 현재 소스에서 검증되었지만 아직 npm latest에 포함되지 않은 미리보기입니다. 이 페이지들은 릴리스 전까지 검색 색인에서 자동 제외됩니다.
          </SeoParagraph>
        </SeoSection>

        {categories.map((category) => {
          const entries = componentSeoEntries.filter((entry) => entry.category === category);
          return (
            <SeoSection key={category} title={category}>
              <SeoLinkGrid
                items={entries.map((entry) => ({
                  href: componentDocsPath(entry.slug),
                  title: entry.name,
                  description: entry.description,
                  ...(!isReleasedComponent(entry) ? { badge: `v${entry.since} 예정` } : {}),
                }))}
              />
            </SeoSection>
          );
        })}

        <SeoSection title="설계 원칙부터 읽기">
          <View>
            <SeoLinkGrid
              items={guideSeoEntries.map((guide) => ({
                href: guideDocsPath(guide.slug),
                title: guide.title,
                description: guide.description,
              }))}
            />
          </View>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
