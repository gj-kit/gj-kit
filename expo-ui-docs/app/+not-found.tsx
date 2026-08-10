import type { ReactElement } from 'react';
import { SeoHead } from '../src/seo';
import { SeoPageHeading, SeoPageShell, SeoParagraph, SeoSection } from '../src/seo-page';

export default function NotFoundPage(): ReactElement {
  return (
    <>
      <SeoHead
        title="페이지를 찾을 수 없습니다 | GJ Kit Expo UI"
        description="요청한 GJ Kit Expo UI 문서 페이지가 없습니다."
        path="/404"
        noindex
      />
      <SeoPageShell breadcrumbs={[{ label: '홈', href: '/' }, { label: '404' }]}>
        <SeoPageHeading
          eyebrow="404"
          title="요청한 문서를 찾을 수 없습니다"
          description="URL을 확인하거나 컴포넌트 목록에서 현재 공개된 문서를 찾아보세요."
        />
        <SeoSection title="다시 시작하기">
          <SeoParagraph>
            헤더의 Docs 또는 Components 링크를 선택하면 설치, 테마, 접근성과 개별 API 문서로 이동할 수 있습니다.
          </SeoParagraph>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
