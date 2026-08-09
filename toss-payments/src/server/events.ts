/**
 * events — TossEventMap 전체와 별칭 (설계 §3.3 확정 시그니처).
 *
 * 이미터 런타임은 core(src/core/events.ts — 의존성 0·중립)에 있고, 이 모듈은
 * TossEventMap으로 인스턴스화한 별칭만 export한다. server/webhook 타입은 전부
 * type-only import — 런타임 의존을 만들지 않는다(웹훅측 발행은 자기 이벤트 3종만 담은
 * 구조적 서브맵으로 emit — webhook→server 런타임 의존 없음).
 *
 * ⚠ 전달 보장: at-most-once, in-process, 비영속 — **이벤트로 원장(ledger)을 만들지 말라.**
 * 원장은 OrderStore/DB + Result 트랜잭션 처리, 이벤트는 관측·부수 반응 전용이다.
 */
import {
  createTossEvents as createGenericTossEvents,
  type TossEventsOf,
} from '../core/events';
import type { CustomerKey, OrderId, PaymentKey } from '../core/ids';
import type {
  BillingApproveError,
  BillingPayment,
} from './billing';
import type { CancelError, CancelOutcome } from './cancel';
import type {
  CallbackParseError,
  ConfirmedPayment,
  ConfirmError,
  VerifyCheckoutError,
} from './confirm';
import type { WebhookRejection } from '../webhook/events';

export interface TossEventMap {
  /**
   * 요청 라이프사이클 — started/succeeded/failed 3분할 대신 완료 1종(과설계 금지).
   * 논리 요청당 1회(최종 outcome). durationMs는 첫 시도 시작부터 최종 outcome 확정까지의
   * 총 경과(재시도 대기 포함) — 시도별 소요는 audit(§3.2)의 AuditEntry.durationMs로.
   */
  'api.call': {
    readonly method: string;
    readonly path: string;
    readonly outcome: 'ok' | 'toss-error' | 'transport';
    readonly httpStatus: number | null;
    readonly durationMs: number;
    readonly traceId: string | null;
    /** retry(§3.4) 결합 시 총 시도 수 — 미결합이면 1. */
    readonly attempts: number;
  };
  /**
   * store 검증 통과 후 Ok 확정 시점.
   * ⚠ payment에 secret 포함 가능(실측: BILLING 카드 결제도 non-null) — payload 통짜 로깅
   * 금지. 기록 용도는 audit(§3.2)으로(redaction 통과본만 기록된다).
   */
  'payment.confirmed': { readonly payment: ConfirmedPayment };
  'payment.confirm-failed': {
    /** parse 단계 실패면 null. */
    readonly orderId: OrderId | null;
    readonly error: CallbackParseError | VerifyCheckoutError | ConfirmError;
  };
  'cancel.executed': { readonly outcome: CancelOutcome };
  'cancel.failed': { readonly paymentKey: PaymentKey; readonly error: CancelError };
  /** billingKey는 payload 원천 부재 — 봉인 원칙 유지(유출 원천 차단). */
  'billing.issued': { readonly customerKey: CustomerKey };
  'billing.approved': { readonly payment: BillingPayment; readonly customerKey: CustomerKey };
  'billing.approve-failed': {
    readonly customerKey: CustomerKey;
    readonly error: BillingApproveError;
  };
  'billing.revoked': { readonly customerKey: CustomerKey };
  /** §3.1 depositSecrets 연동. */
  'deposit.secret-saved': { readonly orderId: OrderId };
  'deposit.secret-save-failed': {
    readonly orderId: OrderId;
    readonly paymentKey: PaymentKey;
    readonly cause: unknown;
  };
  /** 요약만 — AcceptedWebhook 통짜 전달 대신 secret 제거·타입 순환 회피가 보장되는 최소 필드. */
  'webhook.accepted': {
    readonly trust: 'signature' | 'secret' | 'unverified';
    readonly eventType: string;
    readonly transmissionId: string;
  };
  'webhook.duplicate': { readonly transmissionId: string };
  'webhook.rejected': { readonly rejection: WebhookRejection };
}

export type TossEventName = keyof TossEventMap;

/**
 * at: ISO 8601 발화 시각.
 * 분배 조건부 — 구체 K에서는 `{type: K; at} & TossEventMap[K]`와 동일하고,
 * 무인자 별칭(TossEvent)은 type으로 내로잉되는 판별 유니언이 된다.
 */
export type TossEvent<K extends TossEventName = TossEventName> = K extends TossEventName
  ? { readonly type: K; readonly at: string } & TossEventMap[K]
  : never;

/** 공개 표면은 구독 전용 — emit은 내부 인터페이스로만 흐른다(라이브러리만 발행). */
export interface TossEvents {
  /**
   * 반환값 = 구독 해제. 핸들러 파라미터는 구체 K에서 `TossEvent<K>`와 동일한 교차 형태 —
   * 제네릭 K에서 분배 조건부(TossEvent)가 지연 평가되는 것을 피해 core 이미터와의
   * 구조적 호환을 유지한다.
   */
  on<K extends TossEventName>(
    type: K,
    handler: (
      event: { readonly type: K; readonly at: string } & TossEventMap[K],
    ) => void | Promise<void>,
  ): () => void;
}

/**
 * 이벤트 버스 생성 — 각 배선 지점(TossClientOptions.events 등)에 주입한다.
 *
 * ⚠ 발행은 createTossEvents 산출물에만 흐른다 — 구조적으로 흉내 낸 사용자 객체를 주입하면
 * 구독 표면으로는 동작하지 않고 발행 지점이 조용히 no-op이 된다(내부 emit 계층 부재).
 */
export function createTossEvents(options?: {
  /** 핸들러 예외 통지. 기본 무시 — 이 콜백의 throw도 삼켜진다. */
  readonly onHandlerError?: (info: {
    readonly type: TossEventName;
    readonly cause: unknown;
  }) => void;
}): TossEvents {
  const events: TossEventsOf<TossEventMap> = createGenericTossEvents<TossEventMap>(options);
  return events;
}
