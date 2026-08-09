/**
 * 비공개 브랜드 심볼 — **내부 모듈 전용. 어떤 엔트리에서도 재export 금지** (격리 규칙).
 *
 * 심볼 값과 `Brand` 타입이 패키지 밖으로 노출되지 않으므로, 외부 코드는
 * `Brand<Name>`을 구조적으로 충족하는 값을 제조할 수 없다 (`as` 없이는 불가).
 * `Symbol.for`가 아닌 `Symbol()`을 사용해 전역 심볼 레지스트리 경유 위조도 차단한다.
 */
const brand: unique symbol = Symbol('gj-kit/toss-payments#brand');

export type Brand<Name extends string> = { readonly [brand]: Name };
