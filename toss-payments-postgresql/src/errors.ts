/**
 * 에러 모델 — 이 패키지가 스스로 만든 실패만 감싼다 (설계 §5).
 *
 * 코어 계약상 스토어는 **throw**하고, 코어가 store-failure Err로 감싼다(cause 체인 동봉).
 * 따라서 여기의 원칙은 둘뿐이다:
 * - 드라이버 에러는 감싸지 않고 그대로 통과시킨다 — cause 체인·드라이버 고유 필드
 *   (SQLSTATE 등)를 보존해야 소비자가 재시도/알림 정책을 세울 수 있다.
 * - 이 패키지가 직접 판정한 실패(식별자 위반·주문 충돌·안전하지 않은 금액·행 손상·
 *   마이그레이션 실패)만 안정적인 code를 가진 {@link TossPostgresError}로 던진다.
 *
 * ⚠ 보안 불변식: 어떤 에러 메시지에도 secret·billingKey 값을 싣지 않는다.
 * billingKey와 customerKey를 같은 문자열에 함께 두지 않는다(코어 stores.ts ⚠ 준수).
 */

export type TossPostgresErrorCode =
  /** 스키마 식별자가 `/^[a-z_][a-z0-9_]{0,62}$/` 위반 — SQL 보간 유일 지점의 봉쇄. */
  | 'invalid-identifier'
  /** saveOrder가 이미 저장된 orderId에 **다른 값**으로 재저장 시도 — 금액 대조 원본 보호. */
  | 'order-conflict'
  /** bigint 컬럼 값이 Number.isSafeInteger 범위를 벗어남 — 금액 정밀도 손실 거부. */
  | 'unsafe-amount'
  /** DB 행이 코어 계약 형태로 복원 불가(타입/유니언 위반·JSON 손상) — 조용한 오염 전파 거부. */
  | 'invalid-row'
  /** migrate() 실패 — ROLLBACK 후 원인은 cause 체인으로 보존된다. */
  | 'migration-failed';

const ERROR_NAME = 'TossPostgresError';

const KNOWN_CODES: ReadonlySet<string> = new Set<TossPostgresErrorCode>([
  'invalid-identifier',
  'order-conflict',
  'unsafe-amount',
  'invalid-row',
  'migration-failed',
]);

/** 이 패키지가 직접 판정한 실패 전용 에러 — code가 공개 계약이다(메시지는 아니다). */
export class TossPostgresError extends Error {
  override readonly name = ERROR_NAME;
  readonly code: TossPostgresErrorCode;

  constructor(code: TossPostgresErrorCode, message: string, options?: { readonly cause?: unknown }) {
    // exactOptionalPropertyTypes — cause 미지정 시 프로퍼티 자체를 만들지 않는다
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
  }
}

/**
 * 타입 가드 — `instanceof` 대신 구조 판정을 쓴다.
 *
 * 근거: ESM/CJS dual-package 이중 로드 시 클래스 정체성이 갈라져 `instanceof`가
 * 거짓 음성을 낸다(toss-payments-nestjs가 토큰에 `Symbol.for`를 쓰는 것과 같은 이유).
 * name + code 화이트리스트 판정은 로드 경로와 무관하게 안정적이다.
 */
export function isTossPostgresError(value: unknown): value is TossPostgresError {
  if (!(value instanceof Error) || value.name !== ERROR_NAME) return false;
  const code = (value as Error & { code?: unknown }).code;
  return typeof code === 'string' && KNOWN_CODES.has(code);
}
