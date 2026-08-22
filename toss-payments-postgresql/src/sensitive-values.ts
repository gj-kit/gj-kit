/**
 * 민감값 보호 seam.
 *
 * 이 패키지는 암호 알고리즘·KMS·키 수명주기를 소유하지 않는다. 대신 소비자가 제공하는
 * 비동기 보호기를 통해 민감한 문자열만 DB에 쓰기 직전에 보호하고, 읽은 직후 복원한다.
 * `context`는 각 레코드의 AAD(Additional Authenticated Data)로 쓰기 위한 고정 입력이다.
 * 따라서 올바른 AEAD 구현은 같은 암호문을 다른 purpose/recordId로 옮겨도 복호화하지
 * 못하게 해야 한다.
 */
import type { PgStoreOptions } from './stores/orders';

/** 이 패키지가 보호하는 값의 용도. 보호기 구현은 이 값을 AAD에 반드시 포함해야 한다. */
export const SENSITIVE_VALUE_PURPOSE = {
  billingKey: 'billing-key',
  depositSecret: 'deposit-secret',
  cancelRetryRecord: 'cancel-retry-record',
} as const;

export type SensitiveValuePurpose =
  (typeof SENSITIVE_VALUE_PURPOSE)[keyof typeof SENSITIVE_VALUE_PURPOSE];

/**
 * 보호기 호출마다 전달되는 AAD 결속 정보.
 *
 * `recordId`는 DB의 primary/lookup key와 동일하다(customerKey, orderId, ticketId).
 * 암호문 자체뿐 아니라 저장 위치도 인증하려면 `purpose`와 `recordId`를 둘 다 AAD에
 * 포함해야 한다.
 */
export interface SensitiveValueContext {
  readonly purpose: SensitiveValuePurpose;
  readonly recordId: string;
}

/**
 * 앱이 소유하는 비동기 민감값 보호기.
 *
 * AES-GCM, envelope encryption, KMS 등을 선택할 수 있도록 crypto 의존성을 이 패키지에
 * 들이지 않는다. `encrypt`는 평문과 다른, DB에 안전하게 저장 가능한 문자열을 반환해야
 * 하고 `decrypt`는 같은 context에서만 원문을 복원해야 한다. 구현은 암호화 실패 메시지에
 * 평문을 포함하지 않아야 한다.
 */
export interface SensitiveValueProtector {
  encrypt(plaintext: string, context: SensitiveValueContext): Promise<string>;
  decrypt(ciphertext: string, context: SensitiveValueContext): Promise<string>;
}

/** schema + 필수 민감값 보호기를 함께 받는 세 민감 스토어의 옵션 표면. */
export interface PgSensitiveStoreOptions extends PgStoreOptions {
  readonly sensitiveValueProtector: SensitiveValueProtector;
}

/**
 * 테스트·일회성 개발 DB 전용의 명시적 평문 opt-in.
 *
 * 이 값을 넘기지 않으면 팩토리와 민감 스토어 팩토리는 조립 시점에 거부한다. 즉, 평문
 * 저장은 숨은 기본값이 아니라 호출 코드에서 보이는 의도적인 선택이다. 프로덕션에는
 * 절대 사용하지 말고 KMS/AEAD 기반 `SensitiveValueProtector`를 제공해야 한다.
 */
export const unsafePlaintextSensitiveValueProtector: SensitiveValueProtector = Object.freeze({
  async encrypt(plaintext: string, _context: SensitiveValueContext) {
    return plaintext;
  },
  async decrypt(ciphertext: string, _context: SensitiveValueContext) {
    return ciphertext;
  },
});

/** 내부 스토어가 불변 context를 만들기 위한 단일 경로. */
export function createSensitiveValueContext(
  purpose: SensitiveValuePurpose,
  recordId: string,
): SensitiveValueContext {
  return Object.freeze({ purpose, recordId });
}

/** JS 소비자와 Nest useFactory 경로도 secure-by-default가 되도록 런타임 검증한다. */
export function requireSensitiveValueProtector(
  value: unknown,
): SensitiveValueProtector {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof (value as { encrypt?: unknown }).encrypt !== 'function' ||
    typeof (value as { decrypt?: unknown }).decrypt !== 'function'
  ) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] sensitiveValueProtector는 async encrypt/decrypt를 구현해야 합니다. 개발 DB에서만 unsafePlaintextSensitiveValueProtector를 명시적으로 사용하세요.',
    );
  }
  return value as SensitiveValueProtector;
}

/** 보호기의 잘못된 반환값을 DB 드라이버에 넘기기 전에 안전하게 차단한다. */
export function requireProtectedString(value: unknown, operation: 'encrypt' | 'decrypt'): string {
  if (typeof value !== 'string') {
    throw new TypeError(
      `[@gj-kit/toss-payments-postgresql] sensitiveValueProtector.${operation}은(는) 문자열을 반환해야 합니다.`,
    );
  }
  return value;
}
