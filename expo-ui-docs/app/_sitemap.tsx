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
import { useLocale } from '../src/locale';
import { siteStrings } from '../src/site-strings';

/**
 * Expo Router의 개발용 route sitemap을 검색 결과에서 제외한다.
 * 검색엔진용 XML sitemap은 public/sitemap.xml에서 생성한다.
 */
export default function InternalSitemapPage(): ReactElement {
  const { locale } = useLocale();
  const t = siteStrings(locale);
  return (
    <>
      <SeoHead
        title={t.routeIndexMetaTitle}
        description={t.routeIndexMetaDescription}
        path="/_sitemap"
        locale={locale}
        noindex
      />
      <SeoPageShell
        breadcrumbs={[{ label: t.home, href: '/' }, { label: t.routeIndexCrumb }]}
      >
        <SeoPageHeading
          eyebrow="ROUTE INDEX"
          title={t.routeIndexTitle}
          description={t.routeIndexDescription}
        />
        <SeoSection title={t.routeIndexSectionTitle}>
          <SeoParagraph>{t.routeIndexSectionBody}</SeoParagraph>
          <SeoLinkGrid
            items={[
              {
                href: '/docs',
                title: t.routeIndexDocsTitle,
                description: t.routeIndexDocsDescription,
              },
              {
                href: '/docs/components',
                title: t.componentsCount(componentSeoEntries.length),
                description: t.routeIndexComponentsDescription,
              },
              {
                href: '/sitemap.xml',
                title: 'XML sitemap',
                description: t.routeIndexSitemapDescription,
              },
            ]}
          />
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
