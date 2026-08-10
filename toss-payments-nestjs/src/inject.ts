/**
 * DI 토큰 + 명시적 주입 데코레이터 (설계 §4.2).
 *
 * - `Symbol.for` 사용 근거: dual-package(ESM/CJS 이중 로드) 상황에서도 전역 심볼
 *   레지스트리를 경유해 동일 토큰이 보장된다 — string 토큰(렌즈 0안)은 기각,
 *   렌즈 1안(Symbol.for) 채택.
 * - `InjectTossPayments`는 명시적 `@Inject(토큰)` 위임이다 — 이 패키지의 어떤 코드도
 *   `design:type`/`design:paramtypes` 메타데이터를 읽지 않으므로
 *   `emitDecoratorMetadata` 없는 SWC/esbuild 빌드에서도 무설정으로 동작한다(설계 §4.1).
 */
import { Inject } from '@nestjs/common';

/** 파사드 kit(createTossPayments 산출물)이 바인딩되는 토큰. */
export const TOSS_PAYMENTS: unique symbol = Symbol.for('@gj-kit/toss-payments-nestjs:facade');

/**
 * 파사드 kit 주입 데코레이터.
 *
 * 주입 파라미터의 타입은 소실되지 않도록 {@link TossPaymentsFor} 별칭(설계 §4.3 —
 * `defineTossPaymentsConfig` + `typeof config`)으로 선언하라 — 미배선 플로우 접근이
 * 주입부에서도 컴파일 에러가 된다.
 *
 * ```ts
 * constructor(@InjectTossPayments() private readonly toss: AppToss) {}
 * ```
 */
export const InjectTossPayments = (): ParameterDecorator => Inject(TOSS_PAYMENTS);
