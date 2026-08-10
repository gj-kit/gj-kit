/**
 * audit — 아웃바운드 토스 API req/res 증거 기록 (설계 §3.2, must 3/3 수렴).
 *
 * 타입뿐인 계약 + 순수 redaction 순회기 — 환경 중립(core)이며 런타임 의존성 0.
 * 부착 지점은 server/client.ts의 내부 request() 단일 관문이다(흩어짐 없음).
 *
 * 협상 불가 계약:
 * - `record()`는 await되지 않는다(fire-and-forget) — audit 오류가 결제 요청의
 *   지연·실패에 영향을 주는 경로가 없다(기록 실패 < 결제 실패).
 * - redaction은 비설정화 — 끄는 옵션·설정 파라미터를 제공하지 않는다.
 * - Authorization 헤더는 AuditEntry에 **필드 자체가 없다** — 마스킹이 아니라 구조적 부재.
 */
import type { Env } from './keys';

/**
 * 시도 1건 = 엔트리 1건 (outcome 유니언) — request/response 분리 kind안은
 * 상관(join) 비용 때문에 기각(설계 §7-7).
 *
 * ⚠ responseBody에는 redaction 후에도 고객 이름·이메일 등 PII가 잔존할 수 있다 —
 * 보관 주체·기간·접근 통제는 sink 소유자(사용자) 책임이다.
 */
export interface AuditEntry {
  /** crypto.randomUUID — 시도 1건당 1엔트리. */
  readonly id: string;
  /** ISO 8601 요청(시도) 시작 시각. */
  readonly at: string;
  readonly env: Env;
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** '/v1/payments/confirm' 등 pathname만 — 쿼리 미포함. */
  readonly path: string;
  /** 1부터 — retry(§3.4) 결합 시 시도마다 엔트리 1건. */
  readonly attempt: number;
  readonly idempotencyKey: string | null;
  /** redaction 통과본. ⚠ 헤더 필드가 타입에 없다 — Authorization은 구조적으로 기록 불가. body 없는 요청은 null. */
  readonly requestBody: unknown;
  readonly durationMs: number;
  /** x-tosspayments-trace-id — 고객센터 문의 키. */
  readonly traceId: string | null;
  readonly outcome:
    | {
        readonly kind: 'ok';
        readonly httpStatus: number;
        /** redaction 통과본. */
        readonly responseBody: unknown;
      }
    | {
        readonly kind: 'toss-error';
        readonly httpStatus: number;
        readonly code: string;
        readonly message: string;
      }
    | { readonly kind: 'transport'; readonly code: 'NETWORK_ERROR' | 'TIMEOUT' };
}

export interface AuditSink {
  /**
   * 시도 1건당 1회 호출된다. 반환 Promise는 클라이언트가 await하지 않는다 —
   * sync throw·async rejection 모두 삼켜지고 `AuditOptions.onSinkError`로만 통지된다.
   */
  record(entry: AuditEntry): void | Promise<void>;
}

export interface AuditOptions {
  readonly sink: AuditSink;
  /** sink 실패 통지. 기본 무시 — 이 콜백의 throw도 삼켜진다. */
  readonly onSinkError?: (cause: unknown, entry: AuditEntry) => void;
}

/**
 * redaction 대상 키 목록 — 단일 상수 export로 감사 가능하게 (버전 관리 대상, 설계 §3.2 확정 표).
 *
 * 매칭은 **대소문자 무시**이며 req/res body를 재귀 순회해 값이 `'[REDACTED]'`로 치환된다.
 * 이 목록 외 추가 규칙 1건: `card`/`refundAccount` 컨텍스트(부모 키) 하위의 `number`도 치환
 * (카드번호 마스킹본·환불 계좌번호 — 실측 응답 필드).
 *
 * 잔존 리스크: denylist는 토스가 새 민감 필드를 추가하면 누락될 수 있다 — 실측 응답 픽스처
 * 전수 redaction 스냅샷 테스트 + 마이너 업데이트 시 필드 감사로 완화한다.
 */
export const AUDIT_REDACTED_KEYS: readonly string[] = [
  'cardNumber',
  'cardPassword',
  'customerIdentityNumber',
  'accountNumber',
  'secret',
  'billingKey',
  'authKey',
  'customerMobilePhone',
  // 퀵계좌이체 빌링 발급 응답의 transfers[].bankAccountNumber — 토스가 마스킹해 내려주지만
  // (server/stores.ts BillingKeyRecord.transfers 참조) 마스킹 정책은 토스 소유라 변경될 수
  // 있으므로 방어적 이중화로 denylist에 고정한다(v1.1 §3.2 잔존 리스크 완화 — 필드 감사 결과 추가).
  'bankAccountNumber',
];

const REDACTED = '[REDACTED]';

/** 대소문자 무시 매칭용 소문자 집합 (모듈 로드 시 1회 구성). */
const DENYLIST_LOWER: ReadonlySet<string> = new Set(
  AUDIT_REDACTED_KEYS.map((key) => key.toLowerCase()),
);

/** `number` 키가 민감해지는 부모 키 컨텍스트 — card.number(마스킹 카드번호), refundAccount.number. */
const NUMBER_CONTEXT_LOWER: ReadonlySet<string> = new Set(['card', 'refundaccount']);

/**
 * (내부 — 엔트리 미공개) req/res body redaction 재귀 순회기.
 *
 * - 원본을 변조하지 않는다(항상 새 객체/배열 반환).
 * - null/undefined 값은 치환하지 않는다 — "필드가 비어 있었다"는 사실 자체는 증거 가치가
 *   있고(예: secret null 여부), null은 유출할 원문이 없다.
 * - 입력은 JSON.parse 산출물이 전제지만, 방어적으로 순환 참조는 '[CIRCULAR]'로 끊는다.
 */
export function redactForAudit(value: unknown): unknown {
  return redactValue(value, null, new WeakSet());
}

function redactValue(value: unknown, parentKey: string | null, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      // 배열은 부모 키 컨텍스트를 투과한다 — cancels: [...] 요소들의 컨텍스트는 'cancels'
      return value.map((item) => redactValue(item, parentKey, seen));
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const lower = key.toLowerCase();
      const denied =
        DENYLIST_LOWER.has(lower) ||
        (lower === 'number' && parentKey !== null && NUMBER_CONTEXT_LOWER.has(parentKey.toLowerCase()));
      if (denied) {
        out[key] = child === null || child === undefined ? child : REDACTED;
      } else {
        out[key] = redactValue(child, key, seen);
      }
    }
    return out;
  } finally {
    // DAG(비순환 중복 참조)를 순환으로 오판하지 않도록 방문 종료 후 해제
    seen.delete(value);
  }
}
