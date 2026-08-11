import propsJson from './component-props.json';
import type { PropRow } from './seo-page';

export type ComponentPropsEntry = {
  readonly typeName: string;
  readonly props: readonly PropRow[];
  readonly inheritsPlatformProps?: boolean | undefined;
};

/**
 * scripts/generate-props.mjs가 라이브러리의 실제 TypeScript 타입에서 생성한다.
 * 직접 편집하지 말 것 — 다음 `pnpm run generate:props`에서 덮어써진다.
 */
const catalog = propsJson as Readonly<Record<string, ComponentPropsEntry>>;

export function getComponentProps(slug: string): ComponentPropsEntry | undefined {
  return catalog[slug];
}
