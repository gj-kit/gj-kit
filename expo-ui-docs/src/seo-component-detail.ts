import detailJson from './seo-component-detail.json';
import type { Locale } from './locale';

/**
 * 컴포넌트 상세 페이지에서만 쓰는 본문. `app/docs/components/[slug].tsx`
 * 하나만 이 모듈을 import해야 한다 — 다른 라우트가 손대는 순간 Metro가
 * 공용 청크로 끌어올려, 랜딩 방문자까지 모든 컴포넌트의 본문 전체를 내려받게 된다.
 * 목록·검색에 필요한 가벼운 필드는 seo-content.ts에 있다.
 */
export type ComponentDetailText = {
  readonly headline: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly accessibility: string;
  readonly snippet: string;
};

type DetailCatalog = Readonly<Record<string, Readonly<Record<Locale, ComponentDetailText>>>>;

const detail = detailJson as DetailCatalog;

export function getComponentDetail(slug: string, locale: Locale): ComponentDetailText | undefined {
  return detail[slug]?.[locale];
}
