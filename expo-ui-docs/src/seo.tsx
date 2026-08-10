import type { ReactElement } from 'react';
import Head from 'expo-router/head';

export const SITE_URL = 'https://gj-kit-expo-ui.expo.app';
export const SITE_NAME = 'GJ Kit Expo UI';
export const PACKAGE_NAME = '@gj-kit/expo-ui';
export const NPM_URL = 'https://www.npmjs.com/package/@gj-kit/expo-ui';
export const OG_IMAGE_URL = `${SITE_URL}/og.png`;

type JsonLd = Readonly<Record<string, unknown>>;

type SeoHeadProps = {
  readonly title: string;
  readonly description: string;
  readonly path: string;
  readonly schemas?: readonly JsonLd[] | undefined;
  readonly type?: 'website' | 'article' | undefined;
  readonly imageAlt?: string | undefined;
  readonly noindex?: boolean | undefined;
};

export function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function SeoHead({
  title,
  description,
  path,
  schemas = [],
  type = 'website',
  imageAlt = `${SITE_NAME} 컴포넌트와 문서 미리보기`,
  noindex = false,
}: SeoHeadProps): ReactElement {
  const url = absoluteUrl(path);
  const robots = noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robots} />
      <meta name="googlebot" content={robots} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content={type} />
      <meta property="og:locale" content="ko_KR" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={OG_IMAGE_URL} />
      <meta property="og:image:secure_url" content={OG_IMAGE_URL} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1659" />
      <meta property="og:image:height" content="948" />
      <meta property="og:image:alt" content={imageAlt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE_URL} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {schemas.map((schema, index) => (
        <script
          key={`${path}-schema-${index}`}
          type="application/ld+json"
        >
          {serializeJsonLd(schema)}
        </script>
      ))}
    </Head>
  );
}

export function websiteSchema(): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    alternateName: [PACKAGE_NAME, 'gj-kit Expo UI'],
    url: `${SITE_URL}/`,
    description: 'Expo와 React Native를 위한 타입 안전한 UI 컴포넌트 라이브러리',
    inLanguage: 'ko-KR',
  };
}

export function softwareSourceCodeSchema(version: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    '@id': `${SITE_URL}/#package`,
    name: PACKAGE_NAME,
    description: 'Expo와 React Native를 위한 타입 안전한 UI 컴포넌트 라이브러리',
    url: `${SITE_URL}/`,
    sameAs: [NPM_URL],
    programmingLanguage: ['TypeScript', 'JavaScript'],
    runtimePlatform: ['Expo', 'React Native', 'React Native Web'],
    codeSampleType: 'full',
    license: 'https://opensource.org/license/mit',
    version,
    isAccessibleForFree: true,
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function webPageSchema({
  path,
  title,
  description,
  type = 'WebPage',
}: {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly type?: 'WebPage' | 'CollectionPage' | undefined;
}): JsonLd {
  const url = absoluteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function techArticleSchema({
  path,
  headline,
  description,
  about,
}: {
  readonly path: string;
  readonly headline: string;
  readonly description: string;
  readonly about: string;
}): JsonLd {
  const url = absoluteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline,
    description,
    about,
    inLanguage: 'ko-KR',
    mainEntityOfPage: { '@id': `${url}#webpage` },
    author: { '@type': 'Organization', name: 'gj-kit', url: `${SITE_URL}/` },
    publisher: { '@type': 'Organization', name: 'gj-kit', url: `${SITE_URL}/` },
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function breadcrumbSchema(
  items: readonly { readonly name: string; readonly path: string }[],
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function itemListSchema(
  name: string,
  items: readonly { readonly name: string; readonly path: string }[],
): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
