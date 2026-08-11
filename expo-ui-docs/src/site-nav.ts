import { NPM_URL } from './site-theme';

export type SiteNavLink = {
  readonly label: string;
  readonly href: string;
  /** 헤더에서 강조 스타일(채운 배경)을 쓰는 항목. */
  readonly emphasis?: boolean;
};

/**
 * 세 개의 셸(랜딩 app/index.tsx, 문서 허브 app/docs.tsx, SEO 문서 셸 src/seo-page.tsx)이
 * 같은 상단 내비게이션을 쓰도록 하는 단일 출처. 셸마다 다른 링크를 노출하면
 * 방문자가 페이지를 옮길 때마다 이동 경로를 다시 학습해야 한다.
 */
export const SITE_NAV_LINKS: readonly SiteNavLink[] = [
  { label: 'Docs', href: '/docs' },
  { label: 'Components', href: '/docs/components' },
  { label: 'Getting started', href: '/docs/getting-started' },
  { label: 'npm ↗', href: NPM_URL, emphasis: true },
];
