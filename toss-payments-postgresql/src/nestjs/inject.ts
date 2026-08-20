/**
 * DI 토큰 + 명시적 주입 데코레이터 (설계 §7).
 *
 * - `Symbol.for` 사용 근거: dual-package(ESM/CJS 이중 로드) 상황에서도 전역 심볼
 *   레지스트리를 경유해 동일 토큰이 보장된다 (toss-payments-nestjs 선례 그대로).
 * - `InjectTossPaymentsPostgres`는 명시적 `@Inject(토큰)` 위임이다 — 이 패키지의 어떤
 *   코드도 `design:type`/`design:paramtypes` 메타데이터를 읽지 않으므로
 *   `emitDecoratorMetadata` 없는 SWC/esbuild 빌드에서도 무설정으로 동작한다.
 * - 스토어별 토큰 6개로 쪼개지 않는다 — 집합체 단일 토큰이 배선 누락 여지를 없애고,
 *   코어 파사드가 이미 조건부 타입으로 미배선을 컴파일 에러로 만든다(설계 §7).
 */
import { Inject } from '@nestjs/common';

/** {@link import('../factory').TossPaymentsPostgres} 집합체가 바인딩되는 토큰. */
export const TOSS_PAYMENTS_POSTGRES: unique symbol = Symbol.for(
  '@gj-kit/toss-payments-postgresql:stores',
);

/**
 * 스토어 집합체 주입 데코레이터.
 *
 * ```ts
 * constructor(
 *   @InjectTossPaymentsPostgres() private readonly pg: TossPaymentsPostgres,
 * ) {}
 * ```
 */
export const InjectTossPaymentsPostgres = (): ParameterDecorator =>
  Inject(TOSS_PAYMENTS_POSTGRES);
