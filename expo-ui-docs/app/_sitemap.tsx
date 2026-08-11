import type { ReactElement } from 'react';
import { SeoHead } from '../src/seo';
import {
  SeoLinkGrid,
  SeoPageHeading,
  SeoPageShell,
  SeoParagraph,
  SeoSection,
} from '../src/seo-page';
import { componentSeoEntries } from '../src/seo-content';

/**
 * Expo Router의 개발용 route sitemap을 검색 결과에서 제외한다.
 * 검색엔진용 XML sitemap은 public/sitemap.xml에서 생성한다.
 */
export default function InternalSitemapPage(): ReactElement {
  return (
    <>
      <SeoHead
        title="문서 경로 안내 | GJ Kit Expo UI"
        description="검색엔진용 XML sitemap과 GJ Kit Expo UI 문서 경로를 안내합니다."
        path="/_sitemap"
        noindex
      />
      <SeoPageShell breadcrumbs={[{ label: '홈', href: '/' }, { label: '문서 경로 안내' }]}>
        <SeoPageHeading
          eyebrow="ROUTE INDEX"
          title="GJ Kit Expo UI 문서를 찾고 있나요?"
          description="이 주소는 Expo Router의 내부 경로입니다. 사용자 문서와 검색엔진용 XML sitemap은 아래 링크에서 확인하세요."
        />
        <SeoSection title="공개 문서로 이동">
          <SeoParagraph>
            전체 컴포넌트와 설치·테마·접근성 가이드는 문서 인덱스에서 탐색할 수 있습니다.
          </SeoParagraph>
          <SeoLinkGrid
            items={[
              {
                href: '/docs',
                title: '문서 홈',
                description: '설치, 테마, 컴포넌트, 유틸리티와 타입 계약을 살펴봅니다.',
              },
              {
                href: '/docs/components',
                title: `컴포넌트 ${componentSeoEntries.length}종`,
                description: '현재 소스의 컴포넌트와 npm 릴리스 상태를 확인합니다.',
              },
              {
                href: '/sitemap.xml',
                title: 'XML sitemap',
                description: '검색엔진에 제출하는 canonical URL 목록입니다.',
              },
            ]}
          />
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
