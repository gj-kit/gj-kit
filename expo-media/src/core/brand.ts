// 설계 문서 §5.3 — 브랜드(위조 차단용 타입 각인).
//
// ⚠ **타입 전용 phantom property다. 런타임 값이 존재하지 않는다.**(G14 확정)
// `declare const __brand: unique symbol`은 타입 위치에서만 쓰이는 선언이며
// `verbatimModuleSyntax` 하에서 JS를 방출하지 않는다. 따라서:
//   · 브랜드가 붙은 객체를 만들 때 어떤 프로퍼티도 실제로 쓰지 않는다.
//   · `splitting:false`(§2.4)로 엔트리마다 코어가 복제돼도 **검증 대상이 없으므로 깨질 것이 없다**.
//
// 런타임 `Symbol()` 각인이었다면 §5.2가 `MediaError.instanceof`에 대해 인정한 문제와
// **동종의 파손**이 발생한다 — `./core`에서 만든 StagingCache를 `./device`가 검사할 때
// 두 엔트리의 심볼이 서로 다르기 때문이다. 에러 태그가 `Symbol.for`(전역 레지스트리)를 쓰는 것과
// 목적이 정반대이므로 같은 해법을 쓸 수도 없다 — 브랜드의 목적은 위조 차단이고, 그것은
// 전역 레지스트리를 금지한다.
// **결론: 브랜드는 위조 차단용 타입 각인일 뿐이며 런타임 검증은 하지 않는다.**
//
// `__brand`는 export하지 않는다(위조 차단). `Brand`는 export한다 — staging.ts 등 같은 패키지
// 내부 모듈이 import해야 하기 때문이다. "재export 금지"는 **배럴 기준**이며, 어떤 엔트리
// (`core.ts`/`index.ts`/…)도 이 심볼을 다시 내보내지 않는다는 뜻이다.
//
// 비공개인데 공개 인터페이스가 extends해도 선언 방출은 안전하다 — rollup-plugin-dts가
// `Brand<'StagingCache'>`를 인라인해 `dist/core.d.ts` 안으로 접어 넣으므로
// "has or is using private name"이 발생할 표면이 없다.
// 실측: `export type Brand` + 비export `declare const __brand` 조합이면 tsc가 brand.d.ts에
// `declare const __brand`를 방출해 다중 파일 declaration emit이 TS4023 없이 통과한다.

declare const __brand: unique symbol;

/** 위조 차단용 phantom property. 런타임 값 0 — §5.3. */
export type Brand<TName extends string> = { readonly [__brand]: TName };
