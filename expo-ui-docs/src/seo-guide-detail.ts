import detailJson from './seo-guide-detail.json';
import type { Locale } from './locale';

/**
 * 가이드 상세 페이지에서만 쓰는 본문. `app/docs/[guide].tsx` 하나만 이 모듈을
 * import해야 한다 — 이유는 seo-component-detail.ts와 같다. 카탈로그 페이지가
 * 링크에 쓰는 title·description은 seo-content.ts에 있다.
 */
export type GuideSection = {
  readonly title: string;
  readonly body: string;
  readonly bullets?: readonly string[] | undefined;
  readonly code?: string | undefined;
};

export type GuideDetailText = {
  readonly headline: string;
  readonly summary: string;
  readonly sections: readonly GuideSection[];
};

type GuideDetailEntry = Readonly<Record<Locale, GuideDetailText>> & {
  readonly relatedComponents: readonly string[];
};

const detail = detailJson as Readonly<Record<string, GuideDetailEntry>>;

export function getGuideDetail(slug: string): GuideDetailEntry | undefined {
  return detail[slug];
}

export function guideDetailText(entry: GuideDetailEntry, locale: Locale): GuideDetailText {
  return entry[locale];
}
