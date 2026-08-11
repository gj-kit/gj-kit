import type { ReactElement } from 'react';
import { SeoHead } from '../src/seo';
import { SeoPageHeading, SeoPageShell, SeoParagraph, SeoSection } from '../src/seo-page';
import { useLocale } from '../src/locale';
import { siteStrings } from '../src/site-strings';

export default function NotFoundPage(): ReactElement {
  const { locale } = useLocale();
  const t = siteStrings(locale);
  return (
    <>
      <SeoHead
        title={t.pageNotFoundMetaTitle}
        description={t.pageNotFoundMetaDescription}
        path="/404"
        locale={locale}
        noindex
      />
      <SeoPageShell breadcrumbs={[{ label: t.home, href: '/' }, { label: '404' }]}>
        <SeoPageHeading
          eyebrow="404"
          title={t.pageNotFoundTitle}
          description={t.pageNotFoundDescription}
        />
        <SeoSection title={t.pageNotFoundSectionTitle}>
          <SeoParagraph>{t.pageNotFoundSectionBody}</SeoParagraph>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
