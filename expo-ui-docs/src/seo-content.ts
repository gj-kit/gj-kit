import catalogJson from './seo-catalog-index.json';
import type { Locale } from './locale';

/**
 * 목록·검색·네비게이션에 필요한 가벼운 부분만 여기 있다. 상세 본문(headline,
 * summary, features, accessibility, snippet)은 seo-component-detail.ts에,
 * 가이드 본문은 seo-guide-detail.ts에 있고 각각 그 라우트에서만 import한다.
 * 손으로 쓰는 정본은 여전히 seo-catalog.json 하나이며, generate-seo.mjs가
 * 여기서 쓰는 세 파일을 파생시킨다.
 */
export type ComponentSeoText = {
  readonly category: string;
  readonly description: string;
};

export type ComponentSeoEntry = {
  readonly slug: string;
  readonly name: string;
  readonly since: string;
  /** A later source-only API addition to an already published component. */
  readonly sourceUpdatesSince?: string | undefined;
  readonly related: readonly string[];
  readonly ko: ComponentSeoText;
  readonly en: ComponentSeoText;
};

export type GuideSeoText = {
  readonly title: string;
  readonly description: string;
};

export type GuideSeoEntry = {
  readonly slug: string;
  readonly ko: GuideSeoText;
  readonly en: GuideSeoText;
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

/** 현재 로케일의 본문을 고른다. 호출부가 `entry.ko`를 직접 읽지 않게 한다. */
export function componentText(entry: ComponentSeoEntry, locale: Locale): ComponentSeoText {
  return entry[locale];
}

export function guideText(entry: GuideSeoEntry, locale: Locale): GuideSeoText {
  return entry[locale];
}

/** 카테고리 목록은 카탈로그 순서를 따른다(중복 제거). */
export function componentCategories(locale: Locale): readonly string[] {
  return Array.from(new Set(componentSeoEntries.map((entry) => entry[locale].category)));
}

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
  return isVersionPublished(entry.since);
}

function isVersionPublished(version: string): boolean {
  const published = versionParts(publishedPackageVersion);
  const introduced = versionParts(version);
  const length = Math.max(published.length, introduced.length);
  for (let index = 0; index < length; index += 1) {
    const publishedPart = published[index] ?? 0;
    const introducedPart = introduced[index] ?? 0;
    if (publishedPart > introducedPart) return true;
    if (publishedPart < introducedPart) return false;
  }
  return true;
}

/** True when a published component page documents source APIs that npm does not yet contain. */
export function hasUnreleasedSourceUpdates(entry: ComponentSeoEntry): boolean {
  return entry.sourceUpdatesSince !== undefined && !isVersionPublished(entry.sourceUpdatesSince);
}

/** A page must stay out of search until both the component and its documented source updates ship. */
export function isSourcePreview(entry: ComponentSeoEntry): boolean {
  return !isReleasedComponent(entry) || hasUnreleasedSourceUpdates(entry);
}

export function sourcePreviewVersion(entry: ComponentSeoEntry): string | undefined {
  if (!isReleasedComponent(entry)) return entry.since;
  return hasUnreleasedSourceUpdates(entry) ? entry.sourceUpdatesSince : undefined;
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
