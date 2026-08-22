/**
 * jsonb 파라미터 직렬화 — PostgreSQL jsonb가 하드 거부하는 값의 사전 정화/저장본 마스킹.
 *
 * PostgreSQL jsonb는 문자열 안의 U+0000(`\u0000` 이스케이프)과 비페어 서로게이트
 * 이스케이프를 저장 시점에 하드 에러("unsupported Unicode escape sequence")로
 * 거부한다. 이 패키지가 현재 쓰는 jsonb 컬럼(audit_entries.entry, webhook_inbox.event)
 * 에는 소비자 입력(orderName·cancelReason 등)과 토스가 에코하는 merchant 데이터가
 * 흘러들 수 있어, 그대로 두면 inbox(failOnRecordError=true)가 해당 웹훅의 영구
 * 재전송 실패 루프(poison message)가 된다. billing key는 이제 전체 레코드를 text
 * 보호 payload로 저장해 billing_keys.card/transfers에는 쓰지 않는다. cancel_retries가
 * bodyJson **바이트 계약** 때문에 text 컬럼을 선택한 것과 달리(설계 §3.4), 이 곳은
 * 바이트 왕복 계약이 아니므로 문제 코드유닛만 U+FFFD로
 * 치환해 저장 가능성을 보장한다 — 정상 데이터(페어 서로게이트 이모지 포함)는
 * 바이트까지 동일하게 보존된다. inbox에서는 별도 옵션으로 재귀적인 민감 키 마스킹도
 * 적용한다. 원본 객체는 절대 변형하지 않는다.
 */

const REPLACEMENT = '�';
const REDACTED = '[REDACTED]';

/**
 * 문제 코드유닛 존재 판별용 — 서로게이트 범위는 페어(정상 이모지)도 걸리지만,
 * 느린 경로(sanitizeJsonString)가 페어를 그대로 보존하므로 과잉 매칭은 무해하다.
 * 정상 경로(대부분의 데이터)는 이 테스트만 통과하고 할당 없이 원본을 반환한다.
 */
const NEEDS_SANITIZE = /[\u0000\uD800-\uDFFF]/;

function sanitizeJsonString(value: string): string {
  if (!NEEDS_SANITIZE.test(value)) return value;
  let out = '';
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) {
      out += REPLACEMENT;
      continue;
    }
    // high surrogate — 바로 뒤가 low면 페어로 보존, 아니면 비페어 → 치환
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < value.length ? value.charCodeAt(index + 1) : -1;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += value.slice(index, index + 2);
        index += 1;
      } else {
        out += REPLACEMENT;
      }
      continue;
    }
    // 선행 high 없이 등장한 low surrogate — 비페어 → 치환
    if (code >= 0xdc00 && code <= 0xdfff) {
      out += REPLACEMENT;
      continue;
    }
    out += value.charAt(index);
  }
  return out;
}

export interface JsonbSerializeOptions {
  /**
   * true면 모든 깊이의 credential/secret/billingKey/authKey/token/password/card/account
   * 계열 키 값을 `'[REDACTED]'`로 치환한다.
   *
   * 웹훅 inbox 전용 근거: payload는 provider의 새 필드/중첩 raw를 포함할 수 있고
   * 무기한 보존된다. 입금 secret, billing/auth/API key, bearer token, 비밀번호, 카드·
   * 계좌 식별자가 저장본으로 새지 않게 한다. null/undefined는 치환하지 않는다 — "비어
   * 있었다"는 사실 자체가 증거 가치를 가진다(코어 audit 선례).
   */
  readonly redactSensitiveValues?: boolean;
  /** @deprecated `redactSensitiveValues`를 사용한다. 기존 internal 호출 호환용 별칭. */
  readonly redactSecrets?: boolean;
}

/**
 * jsonb 컬럼용 JSON.stringify 대체 — 정화(+선택적 민감값 마스킹) 후 직렬화한다.
 * 문제 문자가 없는 값은 JSON.stringify와 바이트 동일한 결과를 반환한다.
 */
export function serializeJsonb(value: unknown, options?: JsonbSerializeOptions): string {
  const redactSensitiveValues =
    options?.redactSensitiveValues === true || options?.redactSecrets === true;
  return JSON.stringify(sanitizeValue(value, redactSensitiveValues, new WeakSet()));
}

function sanitizeValue(value: unknown, redactSensitiveValues: boolean, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeJsonString(value);
  if (value === null || typeof value !== 'object') return value;
  // 입력은 JSON 산출물이 전제지만 방어적으로 순환을 끊는다(코어 redactForAudit 선례) —
  // JSON.stringify의 TypeError 대신 저장 가능한 표식을 남긴다.
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, redactSensitiveValues, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const safeKey = sanitizeJsonString(key);
      if (redactSensitiveValues && isSensitiveInboxKey(key)) {
        out[safeKey] = child === null || child === undefined ? child : REDACTED;
        continue;
      }
      out[safeKey] = sanitizeValue(child, redactSensitiveValues, seen);
    }
    return out;
  } finally {
    // DAG(비순환 중복 참조 — 예: Payment.raw가 원본 data를 가리킴)를 순환으로
    // 오판하지 않도록 방문 종료 후 해제한다.
    seen.delete(value);
  }
}

/**
 * 웹훅 provider payload의 관례적인 비밀/자격 증명 키 판별.
 *
 * key를 영문·숫자만 남긴 소문자로 정규화해 camelCase, snake_case, kebab-case, 대소문자
 * 혼합과 제어문자 삽입을 같은 방식으로 다룬다. 저장본은 운영 편의를 위해 일부 필드를
 * 남기는 대신, 오탐보다 유출 방지를 우선한다. 이 함수는 값 자체를 검사하지 않으므로
 * 금액 등의 일반 숫자를 건드리지 않는다.
 */
function isSensitiveInboxKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.length === 0) return false;

  return (
    normalized.includes('secret') ||
    normalized.includes('token') ||
    normalized.includes('password') ||
    normalized.includes('passphrase') ||
    normalized.includes('credential') ||
    normalized.includes('billingkey') ||
    normalized.includes('authkey') ||
    normalized.includes('apikey') ||
    normalized.includes('privatekey') ||
    normalized.includes('securitykey') ||
    normalized === 'authorization' ||
    normalized.startsWith('authorization') ||
    normalized === 'card' ||
    normalized.includes('cardnumber') ||
    normalized.includes('cardno') ||
    normalized.includes('accountnumber') ||
    normalized.includes('accountno') ||
    normalized.includes('bankaccount') ||
    normalized === 'account' ||
    normalized.startsWith('account') ||
    normalized === 'cvv' ||
    normalized === 'cvc' ||
    normalized === 'pin'
  );
}
