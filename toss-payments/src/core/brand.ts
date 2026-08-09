/**
 * 비공개 브랜드 심볼 — **내부 모듈 전용. 어떤 엔트리에서도 재export 금지** (격리 규칙).
 *
 * 심볼 값과 `Brand` 타입이 패키지 밖으로 노출되지 않으므로, 외부 코드는
 * `Brand<Name>`을 구조적으로 충족하는 값을 제조할 수 없다 (`as` 없이는 불가).
 * `Symbol.for`가 아닌 `Symbol()`을 사용해 전역 심볼 레지스트리 경유 위조도 차단한다.
 */
const brand: unique symbol = Symbol('gj-kit/toss-payments#brand');

/**
 * Name을 리터럴 그대로가 아니라 `{ [Name]: true }` 레코드로 각인한다.
 *
 * 리터럴 각인(`{ [brand]: Name }`)은 브랜드 교차 시 — 예: `CustomerKey & Brand<'WidgetCustomerKey'>`,
 * 키 브랜드 & `EnvTag` — 프로퍼티 타입이 서로 다른 리터럴의 교집합인 `never`로 붕괴한다.
 * 그러면 서로 다른 브랜드 조합끼리 브랜드 축에서는 상호 대입 가능해지고,
 * `isTestKey`류 술어의 유니언 내로잉도 무력화된다.
 * 레코드 각인은 교차 시 키가 누적되므로(`{A: true} & {B: true}`)
 * 서브타입 방향성(교차 ⊂ 단일)과 술어 내로잉이 모두 보존된다.
 */
export type Brand<Name extends string> = {
  readonly [brand]: { readonly [K in Name]: true };
};

const envTag: unique symbol = Symbol('gj-kit/toss-payments#env');

/**
 * 상호 배타 phantom 태그(test/live 축) — Brand와 **별도의 최상위 심볼 프로퍼티**를 쓰는 이유:
 *
 * Brand 레코드 내부에 중첩된 유닛 리터럴 충돌(`{env:'test'} & {env:'live'}`)은
 * TypeScript의 공집합 교차 축약이 적용되지 않아(중첩 판별자는 축약 대상이 아님 — 실측)
 * `EnvAxis<'test'> & EnvAxis<'live'>`가 never로 붕괴하지 않고,
 * `isTestKey`류 술어 내로잉이 유니언에서 live 멤버를 걸러내지 못한다.
 * 최상위 유닛 판별자면 충돌 교차가 never로 축약되어 내로잉이 정확해진다.
 * `Brand`와 마찬가지로 심볼·타입 모두 패키지 밖으로 노출되지 않는다.
 */
export type EnvAxis<E extends string> = { readonly [envTag]: E };
