/**
 * (내부) 브랜드 각인 — 설계 문서 §3.1.
 *
 * toss-payments core/brand.ts의 확정 기법을 계승한다:
 * - `Symbol.for`가 아닌 `Symbol` — 전역 심볼 레지스트리 경유 위조 차단.
 * - 레코드 각인(`{ [K in Name]: true }`) — 리터럴 각인은 브랜드 교차 시 never로
 *   붕괴하는 문제가 실측돼 기각됐다(toss-payments Phase 0).
 *
 * 이 모듈은 어떤 엔트리에서도 재export하지 않는다 — 심볼과 Brand 타입이 패키지
 * 밖으로 노출되지 않으므로, 외부에서 `as` 없이 브랜드 값을 제조할 수 없다.
 */
const brand: unique symbol = Symbol('gj-kit/expo-ui#brand');

export type Brand<Name extends string> = {
  readonly [brand]: { readonly [K in Name]: true };
};

/** (내부) 검증·병합을 마친 값에 브랜드를 각인하는 유일한 지점. */
export function stamp<T>(value: unknown): T {
  // 브랜드 부여의 유일한 경로 — createTheme/createThemes만 이 함수를 호출한다.
  return value as T;
}
