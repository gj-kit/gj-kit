/**
 * 저장소 인터페이스 — 검증 플로우가 성립하기 위한 필수 주입 지점.
 *
 * - OrderStore: 금액 비교의 단일 진실 공급원. createOrder가 save를 호출하므로
 *   '저장을 잊는' 실수가 플로우 안에서 불가능해진다.
 * - BillingKeyStore: 토스에 빌링키 조회 API가 없다 — 저장 실패 = 복구 불가.
 */
import type { CustomerKey, OrderId } from '../core/ids';
// 타입 전용 import — server→webhook 런타임 의존을 만들지 않는다(verbatimModuleSyntax로 완전 소거)
import type { DepositSecretSource } from '../webhook/verifier';

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
 * 가상계좌 secret 저장소 — 웹훅 `DepositSecretSource`(getSecret)의 상위 타입 (설계 §3.1, G1).
 *
 * 한 객체로 confirm측 자동 저장(`ConfirmFlowOptions.depositSecrets`) + 웹훅측 대조
 * (`WebhookVerifierConfig.depositSecrets`) 양쪽을 1회 배선한다 — 저장(README 수동 한 줄)과
 * 조회(웹훅 config)가 다른 파일에 흩어져 저장 누락 → DEPOSIT_CALLBACK 전부 unknown-order
 * 거부가 되는 사고를 구조로 막는다.
 */
export interface DepositSecretStore extends DepositSecretSource {
  /**
   * upsert 시맨틱 계약 — 기존 수동 저장과 병용해도 이중 저장이 무해해야 한다.
   * (getSecret(orderId): Promise<string | null>은 DepositSecretSource에서 상속 —
   * 기존 WebhookVerifierConfig.depositSecrets에 그대로 전달 가능, 파괴 없음.)
   */
  saveSecret(orderId: OrderId, secret: string): Promise<void>;
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
