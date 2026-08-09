/**
 * 저장소 인터페이스 — 검증 플로우가 성립하기 위한 필수 주입 지점.
 *
 * - OrderStore: 금액 비교의 단일 진실 공급원. createOrder가 save를 호출하므로
 *   '저장을 잊는' 실수가 플로우 안에서 불가능해진다.
 * - BillingKeyStore: 토스에 빌링키 조회 API가 없다 — 저장 실패 = 복구 불가.
 */
import type { CustomerKey, OrderId } from '../core/ids';

export interface StoredOrder {
  readonly orderId: OrderId;
  /** requestPayment 시점에 고정한 금액 — 단일 진실 공급원. */
  readonly amount: number;
  readonly currency: 'KRW' | 'USD' | 'JPY';
  readonly orderName: string;
  /** ISO 8601. */
  readonly createdAt: string;
}

/** 금액 비교의 원본 — save/load 양쪽 강제. */
export interface OrderStore {
  saveOrder(order: StoredOrder): Promise<void>;
  loadOrder(orderId: OrderId): Promise<StoredOrder | null>;
}

/**
 * 영속화 경계 — 여기서만 raw 쌍(customerKey + billingKey)이 보인다.
 *
 * ⚠ 토스의 빌링 보안 모델은 이 쌍의 분리에 의존한다("빌링키가 노출되어도 매핑된
 * customerKey를 모른다면 결제가 불가능합니다" — 빌링 가이드). billingKey와
 * customerKey를 같은 로그에 함께 남기지 말 것.
 */
export interface BillingKeyRecord {
  readonly customerKey: string;
  readonly billingKey: string;
  /** 응답 원문 한글 리터럴 — 요청 enum(CARD/TRANSFER)과 비대칭. */
  readonly method: '카드' | '계좌이체';
  /** 발급 응답의 authenticatedAt. */
  readonly issuedAt: string;
  readonly card: {
    readonly issuerCode: string;
    readonly number: string;
    readonly cardType: '신용' | '체크' | '기프트' | '미확인';
    readonly ownerType: '개인' | '법인' | '미확인';
  } | null;
  /** 퀵계좌이체 발급 — 배열이다(응답 원문 구조). */
  readonly transfers:
    | readonly {
        readonly bankName: string;
        readonly bankAccountNumber: string;
      }[]
    | null;
}

/** 저장소 필수 주입 — 토스에 빌링키 조회 API가 없다: 저장이 유일한 보관 수단. */
export interface BillingKeyStore {
  save(record: BillingKeyRecord): Promise<void>;
  find(customerKey: CustomerKey): Promise<BillingKeyRecord | null>;
  delete(customerKey: CustomerKey): Promise<void>;
}
