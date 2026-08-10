/**
 * 아이콘 주입 체계 — 설계 문서 §4.2.
 *
 * 런타임 의존성 0의 핵심: 아이콘 구현은 항상 호스트가 공급하고, 라이브러리는
 * 색·크기만 계산해 넘긴다. 컴포넌트별 renderMark/leading props가 개별
 * 오버라이드 — UiIcons는 Provider 1회 주입의 기본값 계층이다.
 */
import type { ReactNode } from 'react';

export type IconRenderProps = { readonly color: string; readonly size: number };
export type RenderIcon = (props: IconRenderProps) => ReactNode;

/** Toast 변형 — 이름 보존(88 콜사이트, §0 기각: C의 intent 개명). */
export type ToastVariant = 'error' | 'success' | 'info' | 'warning';

export interface UiIcons {
  /** SelectionIndicator/SelectAllRow 마크. 폴백: ✓ 텍스트 글리프. */
  readonly check?: RenderIcon | undefined;
  /** Checkbox mixed 상태. 폴백: − 텍스트 글리프. */
  readonly minus?: RenderIcon | undefined;
  /** Accordion 펼침 어포던스. 폴백: 텍스트 글리프. */
  readonly chevronDown?: RenderIcon | undefined;
  /** SearchField leading. 폴백: 미표시. */
  readonly search?: RenderIcon | undefined;
  /** EmptyState leading. 폴백: 미표시. */
  readonly empty?: RenderIcon | undefined;
  /** ErrorState leading. 폴백: 미표시. */
  readonly error?: RenderIcon | undefined;
  /** Alert 등 닫기 어포던스. */
  readonly close?: RenderIcon | undefined;
  /** Toast leading — variant별. 폴백: 미표시. 키 레벨도 | undefined — EOP 소비자의 조건부 조립 허용. */
  readonly toast?: { readonly [V in ToastVariant]?: RenderIcon | undefined } | undefined;
}

/** (내부) 정적 노드/렌더 함수 겸용 슬롯 해석. */
export function renderIconSlot(
  icon: ReactNode | RenderIcon | undefined,
  props: IconRenderProps,
): ReactNode {
  if (icon === undefined) return null;
  return typeof icon === 'function' ? (icon as RenderIcon)(props) : icon;
}
