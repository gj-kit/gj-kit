/**
 * 봉투 3종 구조 판별 파서 + parseTossTimestamp.
 *
 * eventType 단일 키 판별은 성립하지 않는다(문서 확정):
 * (a) 구형 `{eventType, createdAt, data}` 6종
 * (b) eventType 필드가 아예 없는 평탄 구조 DEPOSIT_CALLBACK
 *     (createdAt/secret/status/transactionKey/orderId — paymentKey 없음)
 * (c) 신형 `{eventType, createdAt, version, eventId, entityType, entityBody}` 3종
 * 출처: docs/research/toss-payments-v2.md "누락 보강 조사: 웹훅 이벤트별 페이로드".
 */
import type { Payment } from '../core/payment';
import { err, ok } from '../core/result';
import type { Result } from '../core/result';
import type {
  DepositCallbackEvent,
  SignedWebhookEvent,
  UnknownWebhookEvent,
  UnverifiedWebhookEvent,
} from './events';

// ── parseTossTimestamp — 3형식 관대 파서 ───────────────────────────────────

/**
 * 토스 웹훅 createdAt 3형식 관대 파서.
 *
 * 이벤트마다 형식이 다르다(문서):
 * 1. 구형 이벤트: `yyyy-MM-dd'T'HH:mm:ss.SSSSSS` — 마이크로초 6자리, 오프셋 없음
 * 2. DEPOSIT_CALLBACK/신형 이벤트: `yyyy-MM-dd'T'HH:mm:ss±hh:mm` — 오프셋 형식
 * 3. 밀리초 형식(`...ss.SSS`, 오프셋 유무 무관) — 관대 수용
 *
 * 오프셋이 없는 형식은 **KST(+09:00)로 해석**한다 — 비공식 유도: 토스 문서의
 * 오프셋 포함 예시가 전부 +09:00이고 무오프셋 형식과 같은 시스템에서 발신되므로,
 * JS 기본(로컬 타임존) 해석은 UTC 서버에서 9시간 어긋난다.
 * 초과 정밀도(마이크로초 이하)는 밀리초로 절단한다.
 */
export function parseTossTimestamp(
  raw: string,
): Result<Date, { readonly kind: 'bad-timestamp'; readonly raw: string }> {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      raw,
    );
  const bad = err({ kind: 'bad-timestamp', raw } as const);
  if (match === null) return bad;
  const [, y, mo, d, h, mi, s, frac, offset] = match;
  if (y === undefined || mo === undefined || d === undefined) return bad;
  if (h === undefined || mi === undefined || s === undefined) return bad;
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  if (month < 1 || month > 12 || day < 1 || day > 31) return bad;
  if (hour > 23 || minute > 59 || second > 60) return bad;
  const millis = frac === undefined ? 0 : Number(`${frac}000`.slice(0, 3));
  let utcMs = Date.UTC(Number(y), month - 1, day, hour, minute, second, millis);
  if (offset === undefined) {
    utcMs -= 9 * 60 * 60_000; // 무오프셋 = KST 가정 (위 TSDoc 근거)
  } else if (offset !== 'Z') {
    const sign = offset.startsWith('-') ? -1 : 1;
    const offsetMinutes =
      sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
    utcMs -= offsetMinutes * 60_000;
  }
  if (Number.isNaN(utcMs)) return bad;
  return ok(new Date(utcMs));
}

// ── 봉투 구조 판별 ─────────────────────────────────────────────────────────

/** 봉투 파싱 결과 — 진위 검증 경로(kind)까지 함께 판별한다 (verifier 내부 전용). */
export type ParsedWebhookEnvelope =
  | { readonly kind: 'signed'; readonly event: SignedWebhookEvent }
  /** secret은 검증에 소비된 뒤 이벤트에서 제거되므로 event 밖으로 분리해 전달한다. */
  | { readonly kind: 'deposit'; readonly event: DepositCallbackEvent; readonly secret: string }
  | { readonly kind: 'unverified'; readonly event: UnverifiedWebhookEvent };

export interface WebhookParseFailure {
  readonly kind: 'parse-failed';
  readonly detail: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * UNKNOWN 래핑 시 최상위 `secret`을 마스킹한다 — 불변식 보호.
 *
 * 평탄 DEPOSIT_CALLBACK 후보가 status/필드 불일치로 deposit 경로(secret이 event 밖으로
 * 분리·소비되는 경로)에 들지 못하고 UNKNOWN으로 떨어지면, raw에 secret 원문이 그대로
 * 남아 'UNKNOWN 이벤트 로깅'이라는 자연스러운 모니터링 패턴에서 secret이 유출된다 —
 * 유출된 secret으로 입금 웹훅 위조가 가능하다(secret 대조 통과). 모든 UNKNOWN 폴백은
 * raw 노출 전에 이 헬퍼를 거친다.
 */
function redactTopLevelSecret(body: Record<string, unknown>): Record<string, unknown> {
  if (!('secret' in body)) return body;
  const { secret: _stripped, ...safe } = body;
  return { ...safe, secret: '[redacted]' };
}

/**
 * 웹훅 data → core Payment 매핑.
 *
 * 판별에 필요한 최소 필드(paymentKey/orderId/status)만 런타임 검사하고 나머지는
 * 원문 구조를 신뢰한다 — data는 Payment 전체 객체라 API 버전에 따라 필드가 변동될
 * 수 있고(전방 호환), 웹훅 전용 타입을 따로 만들면 이중 관리가 된다(리서치 시사점).
 * 원문은 `raw`로 무손실 보존한다. 아래 단언이 그 대가다(불가피한 내부 단언).
 */
function toWebhookPayment(data: Record<string, unknown>): Payment | null {
  if (typeof data['paymentKey'] !== 'string') return null;
  if (typeof data['orderId'] !== 'string') return null;
  if (typeof data['status'] !== 'string') return null;
  return { ...data, raw: data } as unknown as Payment;
}

const TERMINAL_STATUSES = ['DONE', 'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED'] as const;
type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

function hasTerminalStatus(p: Payment): p is Payment & { status: TerminalStatus } {
  return (TERMINAL_STATUSES as readonly string[]).includes(p.status);
}

const DEPOSIT_STATUSES = ['WAITING_FOR_DEPOSIT', 'DONE', 'CANCELED', 'PARTIAL_CANCELED'] as const;

function isDepositStatus(value: unknown): value is DepositCallbackEvent['status'] {
  return typeof value === 'string' && (DEPOSIT_STATUSES as readonly string[]).includes(value);
}

/** 구형 봉투 — 알 수 없는 eventType이거나 data가 기대 구조와 다르면 UNKNOWN(전방 호환). */
function parseLegacy(eventType: string, body: Record<string, unknown>): UnverifiedWebhookEvent {
  const createdAt = asString(body['createdAt']);
  const data = body['data'];
  const unknown = (): UnknownWebhookEvent => ({
    envelope: 'legacy',
    eventType: 'UNKNOWN',
    rawEventType: eventType,
    createdAt,
    raw: redactTopLevelSecret(body),
  });
  if (createdAt === null || !isRecord(data)) return unknown();

  switch (eventType) {
    case 'PAYMENT_STATUS_CHANGED': {
      const payment = toWebhookPayment(data);
      if (payment === null || !hasTerminalStatus(payment)) return unknown();
      return { envelope: 'legacy', eventType, createdAt, data: payment };
    }
    case 'CANCEL_STATUS_CHANGED': {
      // 판별 기준은 cancelStatus만이다 — 문서상 data는 'Cancel 객체'이고 그 필드 목록에
      // paymentKey/orderId가 없다(상세 구성은 열린 질문, 리서치 §웹훅 보강). 두 필드를
      // 필수로 요구하면 공식 Cancel 객체 형태의 정상 웹훅이 UNKNOWN으로 강등된다.
      // Phase 5 실측(테스트 키 해외결제 취소 웹훅)으로 페이로드 확정 후 재협착 예정.
      const cancelStatus = data['cancelStatus'];
      if (cancelStatus !== 'IN_PROGRESS' && cancelStatus !== 'DONE' && cancelStatus !== 'ABORTED') {
        return unknown();
      }
      return {
        envelope: 'legacy',
        eventType,
        createdAt,
        data: {
          paymentKey: asString(data['paymentKey']),
          orderId: asString(data['orderId']),
          cancelStatus,
          cancelRequestId: asString(data['cancelRequestId']),
          transactionKey: asString(data['transactionKey']),
        },
      };
    }
    case 'BILLING_DELETED': {
      const billingKey = asString(data['billingKey']);
      const reason = asString(data['reason']);
      if (billingKey === null || reason === null) return unknown();
      return { envelope: 'legacy', eventType, createdAt, data: { billingKey, reason } };
    }
    case 'METHOD_UPDATED': {
      const customerKey = asString(data['customerKey']);
      const methodKey = asString(data['methodKey']);
      const status = data['status'];
      if (
        customerKey === null ||
        methodKey === null ||
        (status !== 'ENABLED' && status !== 'DISABLED' && status !== 'ALIAS_UPDATED')
      ) {
        return unknown();
      }
      return { envelope: 'legacy', eventType, createdAt, data: { customerKey, methodKey, status } };
    }
    case 'CUSTOMER_STATUS_CHANGED': {
      const customerKey = asString(data['customerKey']);
      const changedAt = asString(data['changedAt']);
      const status = data['status'];
      if (
        customerKey === null ||
        changedAt === null ||
        (status !== 'CREATED' &&
          status !== 'REMOVED' &&
          status !== 'PASSWORD_CHANGED' &&
          status !== 'ONE_TOUCH_ACTIVATED' &&
          status !== 'ONE_TOUCH_DEACTIVATED')
      ) {
        return unknown();
      }
      return { envelope: 'legacy', eventType, createdAt, data: { customerKey, status, changedAt } };
    }
    case 'ORDER_PAYMENT_STATUS_CHANGED': {
      const orderKey = asString(data['orderKey']);
      const currency = asString(data['currency']);
      const amount = typeof data['amount'] === 'number' ? data['amount'] : null;
      const paymentRaw = data['payment'];
      if (orderKey === null || currency === null || amount === null || !isRecord(paymentRaw)) {
        return unknown();
      }
      const payment = toWebhookPayment(paymentRaw);
      if (payment === null) return unknown();
      return {
        envelope: 'legacy',
        eventType,
        createdAt,
        data: {
          orderKey,
          amount,
          currency,
          customerName: asString(data['customerName']),
          customerPhoneNumber: asString(data['customerPhoneNumber']),
          payment,
          orderItems: Array.isArray(data['orderItems']) ? data['orderItems'] : [],
        },
      };
    }
    default:
      return unknown();
  }
}

/** 신형 봉투 — payout/seller는 서명 검증 경로(signed), ars-reservation은 Unverified. */
function parseV2(
  eventType: string,
  body: Record<string, unknown>,
):
  | { readonly kind: 'signed'; readonly event: SignedWebhookEvent }
  | { readonly kind: 'unverified'; readonly event: UnverifiedWebhookEvent } {
  const createdAt = asString(body['createdAt']);
  const eventId = asString(body['eventId']);
  const entityType = asString(body['entityType']);
  const entityBody = body['entityBody'];
  const unknown = (): UnknownWebhookEvent => ({
    envelope: 'v2',
    eventType: 'UNKNOWN',
    rawEventType: eventType,
    createdAt,
    raw: redactTopLevelSecret(body),
  });
  if (createdAt === null || eventId === null) return { kind: 'unverified', event: unknown() };
  if (eventType === 'payout.changed' && entityType === 'payout') {
    return {
      kind: 'signed',
      event: { envelope: 'v2', eventType, createdAt, eventId, entityType, entityBody },
    };
  }
  if (eventType === 'seller.changed' && entityType === 'seller') {
    return {
      kind: 'signed',
      event: { envelope: 'v2', eventType, createdAt, eventId, entityType, entityBody },
    };
  }
  if (eventType === 'ars-reservation.changed' && entityType === 'ars-reservation') {
    return {
      kind: 'unverified',
      event: { envelope: 'v2', eventType, createdAt, eventId, entityType, entityBody },
    };
  }
  return { kind: 'unverified', event: unknown() };
}

/**
 * 봉투 3종 구조 판별 — verifier 내부 전용.
 *
 * parse-failed는 JSON 자체가 깨졌거나 객체가 아닐 때만 반환한다.
 * 유효한 JSON 객체인데 구조·이벤트를 모르는 경우는 UNKNOWN 래퍼로 수용한다
 * (전방 호환 — 새 이벤트에 400을 돌려주면 3일 19시간 재전송 폭탄을 맞는다).
 */
export function parseWebhookEnvelope(
  rawBody: string,
): Result<ParsedWebhookEnvelope, WebhookParseFailure> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return err({ kind: 'parse-failed', detail: 'JSON 파싱 실패' });
  }
  if (!isRecord(json)) return err({ kind: 'parse-failed', detail: 'JSON 객체가 아닌 본문' });

  const eventType = json['eventType'];
  if (typeof eventType === 'string') {
    if ('entityBody' in json) return ok(parseV2(eventType, json));
    if ('data' in json) return ok({ kind: 'unverified', event: parseLegacy(eventType, json) });
    return ok({
      kind: 'unverified',
      event: {
        envelope: 'legacy',
        eventType: 'UNKNOWN',
        rawEventType: eventType,
        createdAt: asString(json['createdAt']),
        raw: redactTopLevelSecret(json),
      },
    });
  }

  // eventType 부재 — 평탄 DEPOSIT_CALLBACK 구조 판별 (secret+transactionKey+orderId)
  const secret = asString(json['secret']);
  const transactionKey = asString(json['transactionKey']);
  const orderId = asString(json['orderId']);
  const createdAt = asString(json['createdAt']);
  const status = json['status'];
  if (
    secret !== null &&
    transactionKey !== null &&
    orderId !== null &&
    createdAt !== null &&
    isDepositStatus(status)
  ) {
    return ok({
      kind: 'deposit',
      secret,
      event: {
        envelope: 'flat',
        eventType: 'DEPOSIT_CALLBACK',
        createdAt,
        orderId,
        status,
        transactionKey,
      },
    });
  }
  // UNKNOWN 폴백 — deposit 판별에 실패한 body에 secret이 남아 있을 수 있다 → 마스킹 필수
  return ok({
    kind: 'unverified',
    event: {
      envelope: 'flat',
      eventType: 'UNKNOWN',
      rawEventType: '',
      createdAt,
      raw: redactTopLevelSecret(json),
    },
  });
}
