/**
 * 웹훅 inbox — 이벤트 원문 보존 (설계 §3.7).
 *
 * 코어 `WebhookDedupeStore.claim`에는 이벤트 메타가 전달되지 않으므로, inbox는 스토어
 * seam이 아니라 **`WebhookHandlers`를 감싸는 헬퍼**다(코어 계약 무변경). 불변식:
 * - 사업 이벤트 1건 = 1행(dedupe_key PK). 재전송은 deliveries 증가로 관측된다.
 * - record는 핸들러 **앞**에서 실행한다 — 핸들러가 실패해도 수신 사실은 남는다
 *   (감사·재처리 목적).
 * - record 실패 기본 동작은 **삼키고 onRecordError 통지**다(AuditSink 선례 — 관측
 *   계층이 웹훅 가용성을 볼모로 잡지 않는다). `failOnRecordError: true`면 throw →
 *   어댑터 500 → 토스 재전송(inbox를 내구 계약으로 쓰는 소비자용).
 * - 저장 전 이벤트의 모든 깊이 credential/secret/billingKey/authKey/token/password/card/
 *   account 계열 키를 마스킹한다 — provider payload는 새 필드와 중첩 raw를 포함할 수
 *   있고 이 테이블은 cleanup() 대상이 아니라 무기한 보존된다. 핸들러에는 원본을
 *   그대로 주되 저장본만 별도 객체로 마스킹한다.
 */
import type { AcceptedWebhook, WebhookHandlers, WebhookMeta } from '@gj-kit/toss-payments/webhook';

import { schemaRef } from '../identifiers';
import type { SqlExecutor } from '../sql';
import { serializeJsonb } from './jsonb';
import type { PgStoreOptions } from './orders';

/** 수동 기록 표면 — `withWebhookInbox`가 내부에서 쓰는 것과 동일한 단일 메서드. */
export interface WebhookInboxStore {
  record(webhook: AcceptedWebhook): Promise<void>;
}

export function createPgWebhookInboxStore(
  sql: SqlExecutor,
  options?: PgStoreOptions,
): WebhookInboxStore {
  const qs = schemaRef(options?.schema);

  const upsertSql = `INSERT INTO ${qs}.webhook_inbox
  (dedupe_key, transmission_id, transmission_time, retried_count, trust, event_type, event)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (dedupe_key) DO UPDATE
  SET deliveries       = webhook_inbox.deliveries + 1,
      last_received_at = now(),
      retried_count    = excluded.retried_count,
      event            = excluded.event`;

  return {
    async record(webhook) {
      await sql.query(upsertSql, [
        webhook.meta.dedupeKey,
        webhook.meta.transmissionId,
        webhook.meta.transmissionTime,
        webhook.meta.retriedCount,
        webhook.trust,
        webhook.event.eventType,
        // 이벤트는 순수 데이터다(refetch 클로저는 래퍼(webhook) 쪽에 있다).
        // redactSensitiveValues: credential/secret/key/token/card/account 등이 무기한
        // 보존 테이블에 평문으로 남지 않게 재귀적으로 마스킹(원본 webhook은 불변).
        // serializeJsonb: jsonb가 거부하는 U+0000·비페어 서로게이트를 정화해
        // poison message(영구 재전송 실패 루프)를 차단한다.
        serializeJsonb(webhook.event, { redactSensitiveValues: true }),
      ]);
    },
  };
}

export interface WithWebhookInboxOptions {
  /**
   * record 실패 통지(기본 동작: 삼킴). 이벤트 본문 대신 meta만 전달한다 —
   * 통지 콜백이 로그로 흘러도 이벤트 payload가 함께 새지 않게. 이 콜백의 throw도 삼켜진다.
   */
  readonly onRecordError?: (cause: unknown, meta: WebhookMeta) => void;
  /** true면 record 실패를 그대로 throw — 어댑터 500 → 토스 재전송. 기본 false. */
  readonly failOnRecordError?: boolean;
}

/**
 * 코어 WebhookHandlers의 전체 키 목록 — `satisfies Record<keyof WebhookHandlers, true>`가
 * 컴파일 가드다: 코어가 핸들러 키를 추가/삭제하면 이 맵이 컴파일 에러를 낸다.
 *
 * 왜 고정 목록인가: `Object.keys(handlers)`는 own enumerable 키만 본다 — NestJS
 * 서비스처럼 **클래스 인스턴스**로 handlers를 구현하면 메서드가 프로토타입에 있어
 * 키가 하나도 안 잡히고, 래퍼가 빈 객체가 되어 코어 어댑터가 아무 핸들러도 실행하지
 * 않은 채 200 ack + complete하는 조용한 유실이 난다. 고정 목록 + 프로퍼티 접근은
 * 프로토타입 체인의 메서드도 정확히 집는다.
 */
const HANDLER_KEY_MAP = {
  onDepositCallback: true,
  onPaymentStatusChanged: true,
  onCancelStatusChanged: true,
  onBillingDeleted: true,
  onMethodUpdated: true,
  onCustomerStatusChanged: true,
  onOrderPaymentStatusChanged: true,
  onPayoutChanged: true,
  onSellerChanged: true,
  onArsReservationChanged: true,
  onUnknownEvent: true,
} as const satisfies Record<keyof WebhookHandlers, true>;

const KNOWN_HANDLER_KEYS = Object.keys(HANDLER_KEY_MAP) as readonly (keyof WebhookHandlers)[];

/**
 * handlers의 각 콜백을 record → inner 순서로 감싼 `WebhookHandlers`를 반환한다.
 *
 * 배선된 핸들러 키만 감싼다 — 키 집합이 변하지 않으므로 코어 어댑터의 "핸들러 없는
 * 이벤트" 처리 동작(무시)도 그대로 보존된다. 콜백은 `handlers`를 수신자(this)로
 * 호출한다 — 코어 어댑터의 메서드 호출(`handlers.onX?.(w)`)과 동일한 시맨틱이라,
 * `this`를 참조하는 객체 리터럴/클래스 인스턴스 핸들러가 래핑 후에도 깨지지 않는다.
 */
export function withWebhookInbox(
  inbox: WebhookInboxStore,
  handlers: WebhookHandlers,
  options?: WithWebhookInboxOptions,
): WebhookHandlers {
  const recordThenHandle = async (
    inner: (webhook: AcceptedWebhook) => void | Promise<void>,
    webhook: AcceptedWebhook,
  ): Promise<void> => {
    try {
      await inbox.record(webhook);
    } catch (cause) {
      if (options?.failOnRecordError === true) throw cause;
      try {
        options?.onRecordError?.(cause, webhook.meta);
      } catch {
        // 통지 콜백의 실패가 웹훅 처리를 막지 않는다 (AuditOptions.onSinkError 선례)
      }
    }
    await inner(webhook);
  };

  // 고정 목록 ∪ own 키 — own 키를 합집합에 넣어, 코어가 새 핸들러 키를 추가하고 이
  // 패키지가 아직 목록을 못 따라간 사이에도 객체 리터럴 배선은 유실 없이 감싼다.
  const keys = new Set<keyof WebhookHandlers>([
    ...KNOWN_HANDLER_KEYS,
    ...(Object.keys(handlers) as (keyof WebhookHandlers)[]),
  ]);

  const wrapped: Record<string, unknown> = {};
  for (const key of keys) {
    const inner = handlers[key];
    if (typeof inner !== 'function') continue;
    // 핸들러 유니언을 상위 시그니처로 1회 재타이핑한다 — 각 핸들러는 자기 이벤트 타입의
    // webhook만 받고 래퍼는 받은 w를 그대로 통과시키므로 런타임 안전성은 동일하다.
    const innerFn = inner as (this: WebhookHandlers, webhook: AcceptedWebhook) => void | Promise<void>;
    wrapped[key] = (webhook: AcceptedWebhook) =>
      recordThenHandle((w) => innerFn.call(handlers, w), webhook);
  }
  // 래퍼 시그니처(AcceptedWebhook 수용)는 각 키의 협착 시그니처보다 넓다 — 반공변으로 안전.
  return wrapped as WebhookHandlers;
}
