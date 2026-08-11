/**
 * 문서 사이트의 반응형 분기점 — 정본은 여기 하나다.
 *
 * 전에는 랜딩(680/960), 문서 허브(560/720/980), 문서 셸(600/760)이 각자 숫자를
 * 들고 있어 서로 다른 폭에서 레이아웃이 꺾였다. 같은 화면 폭에서 헤더는 넓은
 * 배치, 본문은 좁은 배치가 되는 구간이 생긴다.
 *
 * `tablet`은 라이브러리의 `theme.breakpoints.tablet`과 같은 값이다. 문서가
 * 라이브러리와 다른 지점에서 꺾이면 컴포넌트의 adaptive 동작(DataTable,
 * Pagination의 auto presentation 등)과 문서 레이아웃이 어긋난 채 보인다.
 */
export const BREAKPOINTS = {
  /** 아래로는 가장 좁은 배치 — 보조 라벨과 장식을 접는다. */
  phone: 600,
  /** 라이브러리 `theme.breakpoints.tablet`과 동일. 2단 배치가 시작된다. */
  tablet: 768,
  /** 사이드바처럼 폭을 크게 먹는 구조를 꺼내는 지점. */
  desktop: 1024,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;
