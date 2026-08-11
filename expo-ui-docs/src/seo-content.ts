import catalogJson from './seo-catalog.json';

export type ComponentSeoEntry = {
  readonly slug: string;
  readonly name: string;
  readonly category: string;
  readonly since: string;
  readonly headline: string;
  readonly description: string;
  readonly summary: string;
  readonly features: readonly string[];
  readonly accessibility: string;
  readonly snippet: string;
  readonly related: readonly string[];
};

export type GuideSection = {
  readonly title: string;
  readonly body: string;
  readonly bullets?: readonly string[] | undefined;
  readonly code?: string | undefined;
};

export type GuideSeoEntry = {
  readonly slug: string;
  readonly title: string;
  readonly headline: string;
  readonly description: string;
  readonly summary: string;
  readonly sections: readonly GuideSection[];
  readonly relatedComponents: readonly string[];
};

type SeoCatalog = {
  readonly publishedVersion: string;
  readonly components: readonly ComponentSeoEntry[];
  readonly guides: readonly GuideSeoEntry[];
};

const catalog = catalogJson as SeoCatalog;

export const publishedPackageVersion = catalog.publishedVersion;
export const componentSeoEntries = catalog.components;
export const guideSeoEntries = catalog.guides;

export function getComponentSeoEntry(slug: string): ComponentSeoEntry | undefined {
  return componentSeoEntries.find((entry) => entry.slug === slug);
}

export function getComponentSeoEntryByReference(
  reference: string,
): ComponentSeoEntry | undefined {
  return componentSeoEntries.find(
    (entry) => entry.slug === reference || entry.name === reference,
  );
}

export function getGuideSeoEntry(slug: string): GuideSeoEntry | undefined {
  return guideSeoEntries.find((entry) => entry.slug === slug);
}

export function componentDocsPath(slug: string): `/docs/components/${string}` {
  return `/docs/components/${slug}`;
}

export function guideDocsPath(slug: string): `/docs/${string}` {
  return `/docs/${slug}`;
}

function versionParts(version: string): readonly number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function isReleasedComponent(entry: ComponentSeoEntry): boolean {
  const published = versionParts(publishedPackageVersion);
  const introduced = versionParts(entry.since);
  const length = Math.max(published.length, introduced.length);
  for (let index = 0; index < length; index += 1) {
    const publishedPart = published[index] ?? 0;
    const introducedPart = introduced[index] ?? 0;
    if (publishedPart > introducedPart) return true;
    if (publishedPart < introducedPart) return false;
  }
  return true;
}

/**
 * 상세 페이지에서 다음 컴포넌트로 넘어갈 때 목록으로 되돌아가지 않게 한다.
 * 카탈로그가 카테고리 순서로 정렬돼 있어 인접 항목은 대개 같은 카테고리다.
 */
export function getAdjacentComponents(entry: ComponentSeoEntry): {
  readonly previous: ComponentSeoEntry | undefined;
  readonly next: ComponentSeoEntry | undefined;
} {
  const index = componentSeoEntries.findIndex((candidate) => candidate.slug === entry.slug);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: componentSeoEntries[index - 1],
    next: componentSeoEntries[index + 1],
  };
}

export function getRelatedComponents(entry: ComponentSeoEntry): readonly ComponentSeoEntry[] {
  return entry.related
    .map((reference) => getComponentSeoEntryByReference(reference))
    .filter((candidate): candidate is ComponentSeoEntry => candidate !== undefined);
}
