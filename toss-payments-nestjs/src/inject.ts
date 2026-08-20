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
 * Named kit 식별자. 서로 다른 키 쌍(API `sk`, 결제위젯 `gsk` 등)은 반드시 다른 이름으로
 * 등록한다. 이름은 Nest application 안에서 유일해야 한다.
 */
export type TossPaymentsKitName = string;

const NAMED_TOKEN_PREFIX = '@gj-kit/toss-payments-nestjs:facade:';

function requireKitName(name: TossPaymentsKitName): string {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new TypeError(
      '[@gj-kit/toss-payments-nestjs] named TossPayments kit의 name은 비어 있지 않은 문자열이어야 합니다.',
    );
  }
  if (name !== name.trim()) {
    throw new TypeError(
      '[@gj-kit/toss-payments-nestjs] named TossPayments kit의 name 앞뒤 공백을 제거하세요.',
    );
  }
  return name;
}

/**
 * 이름별 kit 바인딩 토큰을 만든다. `Symbol.for`를 써 ESM/CJS 이중 로드에서도 같은
 * 이름은 같은 토큰으로 해석된다. 같은 Nest application에서 같은 이름을 두 번
 * register하면 provider 토큰이 충돌하므로 이름을 유일하게 유지해야 한다.
 */
export function getTossPaymentsToken(name: TossPaymentsKitName): symbol {
  return Symbol.for(`${NAMED_TOKEN_PREFIX}${requireKitName(name)}`);
}

/**
 * 파사드 kit 주입 데코레이터.
 *
 * 주입 파라미터의 타입은 소실되지 않도록 {@link TossPaymentsFor} 별칭(설계 §4.3 —
 * `defineTossPaymentsConfig` + `typeof config`)으로 선언하라 — 미배선 플로우 접근이
 * 주입부에서도 컴파일 에러가 된다.
 *
 * ```ts
 * constructor(@InjectTossPayments() private readonly toss: AppToss) {}
 *
 * // 여러 키 쌍을 쓸 때는 register({ name })와 같은 이름을 명시한다.
 * constructor(@InjectTossPayments('billing') private readonly toss: BillingToss) {}
 * ```
 */
export const InjectTossPayments = (name?: TossPaymentsKitName): ParameterDecorator =>
  Inject(name === undefined ? TOSS_PAYMENTS : getTossPaymentsToken(name));
