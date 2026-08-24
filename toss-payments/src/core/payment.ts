/**
 * Payment 객체 — method 한글 리터럴 판별 유니언 + `raw: unknown` 탈출구.
 * 필드 목록의 근거: docs/research/toss-payments-v2.md "Payment 객체 주요 필드".
 */
import type { OrderId, PaymentKey } from './ids';

export type PaymentStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_DEPOSIT'
  | 'DONE'
  | 'CANCELED'
  | 'PARTIAL_CANCELED'
  | 'ABORTED'
  | 'EXPIRED';
// ⚠ 단방향 상태 머신 아님: 입금 오류 시 DONE → WAITING_FOR_DEPOSIT 역전이 존재(v1.5+).
//   상태 전이를 제한하는 타입은 만들지 않는다.

/** 응답 원문 그대로의 한글 리터럴 — 영문 enum을 지어내면 런타임 전부 불일치한다. */
export type PaymentMethod =
  | '카드'
  | '가상계좌'
  | '간편결제'
  | '휴대폰'
  | '계좌이체'
  | '문화상품권'
  | '도서문화상품권'
  | '게임문화상품권';

export interface CancelTransaction {
  readonly transactionKey: string;
  readonly cancelAmount: number;
  readonly cancelReason: string;
  readonly taxFreeAmount: number;
  readonly taxExemptionAmount: number;
  /** (응답) 이 취소 후 남은 환불 가능액 — 취소 요청 파라미터의 refundableAmount와 이름만 같다. */
  readonly refundableAmount: number;
  readonly transferDiscountAmount: number;
  readonly easyPayDiscountAmount: number;
  readonly canceledAt: string;
  readonly receiptKey: string | null;
  /** 해외 간편결제(PayPal)는 IN_PROGRESS로 시작하는 비동기 취소 — CANCEL_STATUS_CHANGED 웹훅으로 완결. */
  readonly cancelStatus: 'DONE' | 'IN_PROGRESS' | 'ABORTED';
  /** 비동기 취소 전용. */
  readonly cancelRequestId: string | null;
}

export interface PaymentBase {
  /** API 버전 — CalVer 날짜 문자열. */
  readonly version: string;
  readonly paymentKey: PaymentKey;
  readonly type: 'NORMAL' | 'BILLING' | 'BRANDPAY';
  readonly orderId: OrderId;
  readonly orderName: string;
  readonly mId: string;
  readonly currency: 'KRW' | 'USD' | 'JPY';
  readonly totalAmount: number;
  /** '취소할 수 있는 금액(잔고)' — 완전 취소 판정의 유일한 근거 (status 아님 — Phase 0 실측). */
  readonly balanceAmount: number;
  readonly status: PaymentStatus;
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly useEscrow: boolean;
  readonly lastTransactionKey: string | null;
  readonly suppliedAmount: number;
  readonly vat: number;
  /** 문화비(도서·공연비 등) 지출 여부 — 리서치 문서 Payment 필드 목록에 포함 확인. */
  readonly cultureExpense: boolean;
  readonly taxFreeAmount: number;
  readonly taxExemptionAmount: number;
  readonly cancels: readonly CancelTransaction[] | null;
  readonly isPartialCancelable: boolean;
  /** 가상계좌 웹훅(DEPOSIT_CALLBACK) 검증용 — 승인 시 저장 필수. */
  readonly secret: string | null;
  readonly metadata: Readonly<Record<string, string>> | null;
  readonly receipt: { readonly url: string } | null;
  readonly checkout: { readonly url: string } | null;
  readonly country: string;
  readonly failure: { readonly code: string; readonly message: string } | null;
  /** 응답 원문 — 타입에 없는 필드(cashReceipt/cashReceipts/discount 등)의 탈출구. */
  readonly raw: unknown;
}

export interface CardDetails {
  readonly amount: number;
  readonly issuerCode: string;
  readonly acquirerCode: string | null;
  /** 마스킹된 카드번호. */
  readonly number: string;
  readonly installmentPlanMonths: number;
  readonly approveNo: string;
  readonly useCardPoint: boolean;
  readonly cardType: '신용' | '체크' | '기프트' | '미확인';
  readonly ownerType: '개인' | '법인' | '미확인';
  readonly acquireStatus: string;
  readonly isInterestFree: boolean;
  readonly interestPayer: string | null;
}

export interface VirtualAccountDetails {
  readonly accountNumber: string;
  readonly accountType: string;
  readonly bankCode: string;
  readonly customerName: string;
  readonly dueDate: string;
  readonly expired: boolean;
  readonly settlementStatus: string;
  readonly refundStatus: string;
  readonly refundReceiveAccount: unknown | null;
}

export interface EasyPayDetails {
  readonly provider: string;
  readonly amount: number;
  readonly discountAmount: number;
}

export interface TransferDetails {
  readonly bankCode: string;
  readonly settlementStatus: string;
}

export interface MobilePhoneDetails {
  readonly customerMobilePhone: string;
  readonly settlementStatus: string;
  readonly receiptUrl: string;
}

export interface GiftCertificateDetails {
  readonly approveNo: string;
  readonly settlementStatus: string;
}

export interface CardPayment extends PaymentBase {
  readonly method: '카드';
  readonly card: CardDetails;
  readonly virtualAccount: null;
}
export interface VirtualAccountPayment extends PaymentBase {
  readonly method: '가상계좌';
  readonly virtualAccount: VirtualAccountDetails;
  /**
   * 가상계좌 승인 응답에서만 내려오는 DEPOSIT_CALLBACK 대조값.
   *
   * 결제 조회 API는 같은 가상계좌 결제라도 `null`을 반환할 수 있다. 따라서 일반
   * `Payment` 조회 결과에서 이 값을 복구할 수 있다고 가정하면 안 된다. confirm 응답에서
   * secret을 보장해야 하는 코드는 server의 `ConfirmedPayment`를 사용한다.
   */
  readonly secret: string | null;
  readonly card: null;
}
export interface EasyPayPayment extends PaymentBase {
  readonly method: '간편결제';
  readonly easyPay: EasyPayDetails;
}
export interface TransferPayment extends PaymentBase {
  readonly method: '계좌이체';
  readonly transfer: TransferDetails;
}
export interface MobilePhonePayment extends PaymentBase {
  readonly method: '휴대폰';
  readonly mobilePhone: MobilePhoneDetails;
}
export interface GiftCertificatePayment extends PaymentBase {
  readonly method: '문화상품권' | '도서문화상품권' | '게임문화상품권';
  readonly giftCertificate: GiftCertificateDetails;
}
/** 승인 전 결제 — method nullable. status는 전체 유니언 유지(협착은 미검증 불변식). */
export interface PendingMethodPayment extends PaymentBase {
  readonly method: null;
}

export type Payment =
  | CardPayment
  | VirtualAccountPayment
  | EasyPayPayment
  | TransferPayment
  | MobilePhonePayment
  | GiftCertificatePayment
  | PendingMethodPayment;

/** DONE이면 approvedAt은 non-null — 런타임에서도 함께 확인해 거짓 내로잉을 막는다. */
export function isDone(p: Payment): p is Payment & { status: 'DONE'; approvedAt: string } {
  return p.status === 'DONE' && p.approvedAt !== null;
}

/**
 * 완전 취소 판정 — ⚠ `status === 'CANCELED'` 검사가 아니다.
 *
 * Phase 0 실측(2026-08-09): 부분취소 이력이 있으면 잔액 전액 취소 후에도
 * status가 `PARTIAL_CANCELED`로 남는다(balanceAmount 0). 따라서 CANCELED 문자열만
 * 검사하지 않고, `balanceAmount === 0`과 취소 상태/이력 신호를 함께 본다. 취소 신호가
 * 없는 READY의 잔액 0은 완전 취소가 아니다.
 *
 * The parameter is the structural subset this predicate actually reads (`status`,
 * `balanceAmount`, `cancels`), so callers that only hold a reduced payment snapshot
 * (see `PaymentStateInput`) can use it too. A full `Payment` is always assignable —
 * including a fresh inline object literal: the explicit `| Payment` union member exists
 * solely so the excess-property check accepts literals spelling out non-Pick `Payment`
 * fields. Existing call sites compile unchanged.
 */
export function isFullyCanceled(
  p: Pick<Payment, 'status' | 'balanceAmount' | 'cancels'> | Payment,
): boolean {
  return (
    p.balanceAmount === 0 &&
    (p.status === 'CANCELED' ||
      p.status === 'PARTIAL_CANCELED' ||
      (p.cancels?.length ?? 0) > 0)
  );
}
