/**
 * 웹훅 이벤트 타입 + 신뢰 3등급 + 전방 호환 UNKNOWN 래퍼.
 *
 * '검증됨' 단일 타입은 의도적으로 없다 — 토스가 전 이벤트에 서명을 제공하지 않는다:
 * 서명(HMAC)은 payout.changed/seller.changed에만, secret 대조는 DEPOSIT_CALLBACK에만
 * 존재하고 나머지는 암호학적 진위 검증 수단이 없다.
 * 출처: docs/research/toss-payments-v2.md "웹훅과 보안".
 */
import type { TossApiFailure, TransportFailure } from '../core/errors';
import { orderId as parseOrderId, paymentKey as parsePaymentKey } from '../core/ids';
import type { OrderId, PaymentKey } from '../core/ids';
import type { Payment } from '../core/payment';
import { err } from '../core/result';
import type { Result } from '../core/result';

// ── 이벤트 (봉투 3종 → 구조 판별 후 eventType 세분화) ──────────────────────

export interface PaymentStatusChangedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'PAYMENT_STATUS_CHANGED';
  /** 마이크로초 6자리 무오프셋 형식(yyyy-MM-dd'T'HH:mm:ss.SSSSSS) — {@link import('./envelope').parseTossTimestamp} 권장. */
  readonly createdAt: string;
  /**
   * core Payment 재사용(웹훅 전용 타입의 이중 관리 회피) + 종결 status 협착 —
   * 문서: EXPIRED/DONE/ABORTED/CANCELED/PARTIAL_CANCELED로의 전이 시에만 발송된다.
   */
  readonly data: Payment & {
    readonly status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
  };
}

/**
 * 해외 간편결제(PayPal 등) 전용 — 국내 결제 취소에는 발송되지 않는다(문서).
 *
 * data는 문서상 'Cancel 객체'이며 상세 필드 구성은 열린 질문이다 — 문서화된 Cancel 필드
 * 목록에 paymentKey/orderId가 없어 **nullable**로 둔다(필수 요구 시 정상 웹훅이 UNKNOWN
 * 강등). 판별 기준은 cancelStatus만이다. Phase 5 실측 후 재협착 예정.
 */
export interface CancelStatusChangedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'CANCEL_STATUS_CHANGED';
  readonly createdAt: string;
  readonly data: {
    /** 문서 근거 없음(Cancel 객체 필드 아님) — 있으면 refetch 1순위 키로만 활용. */
    readonly paymentKey: string | null;
    /** 문서 근거 없음(Cancel 객체 필드 아님) — 있으면 refetch 2순위 키로만 활용. */
    readonly orderId: string | null;
    readonly cancelStatus: 'IN_PROGRESS' | 'DONE' | 'ABORTED';
    readonly cancelRequestId: string | null;
    /** Cancel 객체의 취소 건 구분 키(문서) — 최대 64자, nullable 수용. */
    readonly transactionKey: string | null;
  };
}

export interface BillingDeletedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'BILLING_DELETED';
  readonly createdAt: string;
  readonly data: { readonly billingKey: string; readonly reason: string };
}

/** 브랜드페이 결제수단 변경 통지. */
export interface MethodUpdatedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'METHOD_UPDATED';
  readonly createdAt: string;
  readonly data: {
    readonly customerKey: string;
    readonly methodKey: string;
    readonly status: 'ENABLED' | 'DISABLED' | 'ALIAS_UPDATED';
  };
}

/** 브랜드페이 고객 상태 변경 통지. */
export interface CustomerStatusChangedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'CUSTOMER_STATUS_CHANGED';
  readonly createdAt: string;
  readonly data: {
    readonly customerKey: string;
    readonly status:
      | 'CREATED'
      | 'REMOVED'
      | 'PASSWORD_CHANGED'
      | 'ONE_TOUCH_ACTIVATED'
      | 'ONE_TOUCH_DEACTIVATED';
    readonly changedAt: string;
  };
}

/** 링크페이(Link Pay) 주문 결제 상태 통지. */
export interface OrderPaymentStatusChangedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'ORDER_PAYMENT_STATUS_CHANGED';
  readonly createdAt: string;
  readonly data: {
    readonly orderKey: string;
    readonly amount: number;
    readonly currency: string;
    readonly customerName: string | null;
    readonly customerPhoneNumber: string | null;
    readonly payment: Payment;
    readonly orderItems: readonly unknown[];
  };
}

/**
 * 가상계좌 입금/입금취소 통지 — 원문은 eventType 필드가 없는 평탄 구조라
 * 파서가 구조 판별 후 eventType을 합성한다.
 *
 * ⚠ paymentKey가 없다 — orderId가 1급 키다(승인 시 orderId↔secret 저장 필수).
 * 원문의 secret은 검증에 소비된 뒤 이벤트에서 제거된다(로그 유출 방지) — 타입에도 없다.
 */
export interface DepositCallbackEvent {
  readonly envelope: 'flat';
  readonly eventType: 'DEPOSIT_CALLBACK';
  /** ±hh:mm 오프셋 형식 — 구형(legacy) 이벤트의 마이크로초 형식과 다르다(문서 예시). */
  readonly createdAt: string;
  readonly orderId: string;
  /** DONE → WAITING_FOR_DEPOSIT 역전이(입금 오류) 케이스가 존재한다. */
  readonly status: 'WAITING_FOR_DEPOSIT' | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED';
  readonly transactionKey: string;
}

/** 지급대행 상태 통지 — v1 범위 밖이라 entityBody는 원문(unknown) 전달, 서명 검증만 제공. */
export interface PayoutChangedEvent {
  readonly envelope: 'v2';
  readonly eventType: 'payout.changed';
  readonly createdAt: string;
  readonly eventId: string;
  readonly entityType: 'payout';
  readonly entityBody: unknown;
}

export interface SellerChangedEvent {
  readonly envelope: 'v2';
  readonly eventType: 'seller.changed';
  readonly createdAt: string;
  readonly eventId: string;
  readonly entityType: 'seller';
  readonly entityBody: unknown;
}

/** ARS 결제 예약 상태 통지 — 서명 헤더는 payout/seller에만 명시돼 있어 Unverified 등급이다. */
export interface ArsReservationChangedEvent {
  readonly envelope: 'v2';
  readonly eventType: 'ars-reservation.changed';
  readonly createdAt: string;
  readonly eventId: string;
  readonly entityType: 'ars-reservation';
  readonly entityBody: unknown;
}

/** 전방 호환 래퍼 — 새 이벤트·알 수 없는 구조가 와도 verify는 깨지지 않는다. */
export interface UnknownWebhookEvent {
  readonly envelope: 'legacy' | 'v2' | 'flat';
  readonly eventType: 'UNKNOWN';
  /** 원문의 eventType 문자열 — 구조상 존재하지 않았으면 빈 문자열. */
  readonly rawEventType: string;
  readonly createdAt: string | null;
  readonly raw: unknown;
}

/** 서명(HMAC) 검증이 제공되는 이벤트 — payout/seller 2종뿐이다(문서). */
export type SignedWebhookEvent = PayoutChangedEvent | SellerChangedEvent;

export type UnverifiedWebhookEvent =
  | PaymentStatusChangedEvent
  | CancelStatusChangedEvent
  | BillingDeletedEvent
  | MethodUpdatedEvent
  | CustomerStatusChangedEvent
  | OrderPaymentStatusChangedEvent
  | ArsReservationChangedEvent
  | UnknownWebhookEvent;

// ── 신뢰 3등급 ─────────────────────────────────────────────────────────────

/** 모든 웹훅 공통 HTTP 헤더에서 추출한 메타데이터. */
export interface WebhookMeta {
  /** tosspayments-webhook-transmission-id — dedupe 키. */
  readonly transmissionId: string;
  /** tosspayments-webhook-transmission-time — 서명 대상에 포함되는 전송 시각. */
  readonly transmissionTime: string;
  /** tosspayments-webhook-transmission-retried-count — 누락/비정상이면 0. */
  readonly retriedCount: number;
}

/** payout.changed / seller.changed — HMAC-SHA256 서명 검증 통과. */
export interface SignatureVerified {
  readonly trust: 'signature';
  readonly event: SignedWebhookEvent;
  readonly meta: WebhookMeta;
}

/** DEPOSIT_CALLBACK — 승인 시 저장해 둔 Payment.secret 대조 통과. */
export interface SecretVerified {
  readonly trust: 'secret';
  readonly event: DepositCallbackEvent;
  readonly meta: WebhookMeta;
}

/** 조회 실패 — `./server` 엔트리의 LookupError와 동일 형태(구조적 호환). */
export type LookupError =
  | TossApiFailure<'NOT_FOUND_PAYMENT' | 'UNAUTHORIZED_KEY' | (string & {})>
  | TransportFailure;

export interface NoPaymentReference {
  readonly source: 'library';
  readonly kind: 'no-payment-reference';
}

/**
 * {@link Unverified.refetch}가 요구하는 최소 조회 능력 — 구조적 인터페이스.
 *
 * `@gj-kit/toss-payments/server`의 `TossServerClient`가 그대로 구조 호환된다.
 * webhook 엔트리는 Edge 등에서 서버 클라이언트 없이 단독 사용 가능해야 하므로
 * server 모듈을 import하지 않고 여기서 구조적으로 정의한다.
 */
export interface PaymentLookup {
  getPayment(
    key: PaymentKey,
    options?: { readonly signal?: AbortSignal },
  ): Promise<Result<Payment, LookupError>>;
  getPaymentByOrderId(
    orderId: OrderId,
    options?: { readonly signal?: AbortSignal },
  ): Promise<Result<Payment, LookupError>>;
}

/** 나머지 전부 — 이름부터 신뢰 금지. payload를 직접 믿지 말고 refetch로 승격하라. */
export interface Unverified {
  readonly trust: 'unverified';
  readonly event: UnverifiedWebhookEvent;
  readonly meta: WebhookMeta;
  /** 조회 API 재확인 — Unverified를 신뢰 가능한 Payment로 승격하는 유일한 경로(한 줄, 단언 없음). */
  refetch(client: PaymentLookup): Promise<Result<Payment, LookupError | NoPaymentReference>>;
}

export type AcceptedWebhook = SignatureVerified | SecretVerified | Unverified;

/** duplicate는 Err가 아닌 정상 verdict — 200 ack 후 스킵 (400 반환 시 3일 19시간 재전송 폭탄). */
export type WebhookVerdict =
  | { readonly duplicate: false; readonly webhook: AcceptedWebhook }
  | { readonly duplicate: true; readonly transmissionId: string };

export type WebhookRejection =
  | { readonly kind: 'invalid-signature'; readonly signatureCount: number; readonly keysTried: number }
  /** 위조 의심 — 저장된 secret과 불일치. */
  | { readonly kind: 'secret-mismatch'; readonly orderId: string }
  /** depositSecrets가 null 반환 — 승인 시 저장 누락. */
  | { readonly kind: 'unknown-order'; readonly orderId: string }
  | { readonly kind: 'missing-config'; readonly needed: 'securityKeys' | 'depositSecrets' }
  | { readonly kind: 'untrusted-source-ip'; readonly ip: string }
  | { readonly kind: 'parse-failed'; readonly detail: string }
  | { readonly kind: 'store-failure'; readonly cause: unknown };

/**
 * 핸들러 키 = 구독 가능한 전체 이벤트.
 * `onBillingApproved`는 존재하지 않는다 — 토스가 빌링 승인 웹훅을 제공하지 않는다
 * (BILLING_DELETED만 존재). approve 반환값 + getPayment 재확인이 완결 신호다.
 */
export interface WebhookHandlers {
  onDepositCallback?: (w: SecretVerified) => void | Promise<void>;
  onPaymentStatusChanged?: (
    w: Unverified & { event: PaymentStatusChangedEvent },
  ) => void | Promise<void>;
  /** 해외 간편결제 전용. */
  onCancelStatusChanged?: (
    w: Unverified & { event: CancelStatusChangedEvent },
  ) => void | Promise<void>;
  onBillingDeleted?: (w: Unverified & { event: BillingDeletedEvent }) => void | Promise<void>;
  onMethodUpdated?: (w: Unverified & { event: MethodUpdatedEvent }) => void | Promise<void>;
  onCustomerStatusChanged?: (
    w: Unverified & { event: CustomerStatusChangedEvent },
  ) => void | Promise<void>;
  onOrderPaymentStatusChanged?: (
    w: Unverified & { event: OrderPaymentStatusChangedEvent },
  ) => void | Promise<void>;
  onPayoutChanged?: (w: SignatureVerified & { event: PayoutChangedEvent }) => void | Promise<void>;
  onSellerChanged?: (w: SignatureVerified & { event: SellerChangedEvent }) => void | Promise<void>;
  onArsReservationChanged?: (
    w: Unverified & { event: ArsReservationChangedEvent },
  ) => void | Promise<void>;
  /** 전방 호환 — 새 이벤트가 와도 여기로 흐른다. */
  onUnknownEvent?: (w: Unverified & { event: UnknownWebhookEvent }) => void | Promise<void>;
}

/**
 * 토스 웹훅 발신 IP 목록 — 테스트/라이브 구분 없는 단일 목록(문서).
 *
 * 갱신 이력: 최초 4개(13.124.x, 3.3x.x) + 2024년 12월 추가 6개(115.92.221.121–127 중
 * `.124`는 문서 목록에 없다 — 원문 그대로 반영).
 * 출처: docs/research/toss-payments-v2.md "웹훅과 보안" / "누락 보강 조사".
 */
export const TOSS_WEBHOOK_SOURCE_IPS: readonly string[] = [
  '13.124.18.147',
  '13.124.108.35',
  '3.36.173.151',
  '3.38.81.32',
  '115.92.221.121',
  '115.92.221.122',
  '115.92.221.123',
  '115.92.221.125',
  '115.92.221.126',
  '115.92.221.127',
];

const NO_PAYMENT_REFERENCE: NoPaymentReference = {
  source: 'library',
  kind: 'no-payment-reference',
};

/**
 * Unverified 등급 생성 — refetch 클로저 부착 (verifier 내부 전용, 공개 표면 아님).
 *
 * refetch의 조회 키 우선순위:
 * - PAYMENT_STATUS_CHANGED / ORDER_PAYMENT_STATUS_CHANGED → data의 Payment.paymentKey
 * - CANCEL_STATUS_CHANGED → paymentKey(스마트 생성자 통과 시), 실패하면 orderId
 * - 나머지(빌링/브랜드페이/ARS/UNKNOWN) → 결제 참조 없음(no-payment-reference)
 */
export function createUnverified(event: UnverifiedWebhookEvent, meta: WebhookMeta): Unverified {
  return {
    trust: 'unverified',
    event,
    meta,
    async refetch(client) {
      switch (event.eventType) {
        case 'PAYMENT_STATUS_CHANGED':
          return client.getPayment(event.data.paymentKey);
        case 'ORDER_PAYMENT_STATUS_CHANGED':
          return client.getPayment(event.data.payment.paymentKey);
        case 'CANCEL_STATUS_CHANGED': {
          // paymentKey/orderId는 문서 근거 없는 nullable 필드 — 있을 때만 폴백 순서로 시도
          if (event.data.paymentKey !== null) {
            const pk = parsePaymentKey(event.data.paymentKey);
            if (pk.ok) return client.getPayment(pk.value);
          }
          if (event.data.orderId !== null) {
            const oid = parseOrderId(event.data.orderId);
            if (oid.ok) return client.getPaymentByOrderId(oid.value);
          }
          return err(NO_PAYMENT_REFERENCE);
        }
        default:
          return err(NO_PAYMENT_REFERENCE);
      }
    },
  };
}
