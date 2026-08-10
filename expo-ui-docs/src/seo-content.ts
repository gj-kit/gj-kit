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

export function getRelatedComponents(entry: ComponentSeoEntry): readonly ComponentSeoEntry[] {
  return entry.related
    .map((reference) => getComponentSeoEntryByReference(reference))
    .filter((candidate): candidate is ComponentSeoEntry => candidate !== undefined);
}
