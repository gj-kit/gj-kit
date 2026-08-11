import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import Head from 'expo-router/head';
import type { Locale } from './locale';
import { DEFAULT_LOCALE } from './locale';

export const SITE_URL = 'https://gj-kit-expo-ui.expo.app';
export const SITE_NAME = 'GJ Kit Expo UI';
export const PACKAGE_NAME = '@gj-kit/expo-ui';
export const NPM_URL = 'https://www.npmjs.com/package/@gj-kit/expo-ui';
// scripts/generate-og.mjs가 굽는 1200x630 카드. 값이 실제 파일과 어긋나면
// 크롤러가 잘못된 비율로 자른다.
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
  readonly locale?: Locale | undefined;
};

/** og:locale은 BCP-47이 아니라 언더스코어 형식을 쓴다. */
const OG_LOCALE: Readonly<Record<Locale, string>> = { en: 'en_US', ko: 'ko_KR' };

/** JSON-LD의 inLanguage는 BCP-47이다. */
const SCHEMA_LANGUAGE: Readonly<Record<Locale, string>> = { en: 'en', ko: 'ko-KR' };

const IMAGE_ALT: Readonly<Record<Locale, string>> = {
  en: `${SITE_NAME} components and documentation preview`,
  ko: `${SITE_NAME} 컴포넌트와 문서 미리보기`,
};

const PACKAGE_DESCRIPTION: Readonly<Record<Locale, string>> = {
  en: 'Type-safe UI component library for Expo and React Native',
  ko: 'Expo와 React Native를 위한 타입 안전한 UI 컴포넌트 라이브러리',
};

export function absoluteUrl(path: string): string {
  if (path === '/') return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function serializeJsonLd(value: JsonLd): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function syncMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const node = document.head.querySelector(`meta[${attribute}="${key}"]`);
  if (node) node.setAttribute('content', content);
}

export function SeoHead({
  title,
  description,
  path,
  schemas = [],
  type = 'website',
  imageAlt,
  noindex = false,
  locale = DEFAULT_LOCALE,
}: SeoHeadProps): ReactElement {
  const url = absoluteUrl(path);
  const alt = imageAlt ?? IMAGE_ALT[locale];

  // expo-router/head는 프리렌더된 <title>·<meta>를 하이드레이션 이후에 갱신하지
  // 않는다. 언어를 바꾸면 본문만 번역되고 탭 제목과 공유 카드는 영어로 남아
  // 있어서, 웹에서는 직접 맞춘다. 크롤러가 보는 초기 HTML은 그대로 영어다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.title = title;
    syncMeta('name', 'description', description);
    syncMeta('property', 'og:title', title);
    syncMeta('property', 'og:description', description);
    syncMeta('property', 'og:locale', OG_LOCALE[locale]);
    syncMeta('property', 'og:image:alt', alt);
    syncMeta('name', 'twitter:title', title);
    syncMeta('name', 'twitter:description', description);
    syncMeta('name', 'twitter:image:alt', alt);
  }, [alt, description, locale, title]);
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
      <meta property="og:locale" content={OG_LOCALE[locale]} />
      <meta property="og:locale:alternate" content={OG_LOCALE[locale === 'en' ? 'ko' : 'en']} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={OG_IMAGE_URL} />
      <meta property="og:image:secure_url" content={OG_IMAGE_URL} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={alt} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={OG_IMAGE_URL} />
      <meta name="twitter:image:alt" content={alt} />

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
    description: PACKAGE_DESCRIPTION[DEFAULT_LOCALE],
    inLanguage: SCHEMA_LANGUAGE[DEFAULT_LOCALE],
  };
}

export function softwareSourceCodeSchema(version: string): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    '@id': `${SITE_URL}/#package`,
    name: PACKAGE_NAME,
    description: PACKAGE_DESCRIPTION[DEFAULT_LOCALE],
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
  locale = DEFAULT_LOCALE,
}: {
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly type?: 'WebPage' | 'CollectionPage' | undefined;
  readonly locale?: Locale | undefined;
}): JsonLd {
  const url = absoluteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    inLanguage: SCHEMA_LANGUAGE[locale],
    isPartOf: { '@id': `${SITE_URL}/#website` },
  };
}

export function techArticleSchema({
  path,
  headline,
  description,
  about,
  locale = DEFAULT_LOCALE,
}: {
  readonly path: string;
  readonly headline: string;
  readonly description: string;
  readonly about: string;
  readonly locale?: Locale | undefined;
}): JsonLd {
  const url = absoluteUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${url}#article`,
    headline,
    description,
    about,
    inLanguage: SCHEMA_LANGUAGE[locale],
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
