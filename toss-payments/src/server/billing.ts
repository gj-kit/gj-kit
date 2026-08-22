/**
 * 빌링(정기결제) — PendingBillingAuth → confirmPendingAuth → issue → BillingProfile → approve.
 *
 * - authKey/billingKey는 비공개 심볼(비열거)로 봉인 — 공개 필드·JSON 직렬화·스프레드
 *   어디에도 노출되지 않는다. 봉인 소실(복제본)은 명시적 런타임 Err.
 * - BillingOrder에는 customerKey 필드가 없다 — 봉인 쌍으로만 승인해
 *   NOT_MATCHES_CUSTOMER_KEY를 구조적으로 방지한다.
 * - 갱신 API는 존재하지 않는다("빌링키를 갱신하는 별도 과정은 없습니다") — refresh류
 *   메서드 없음. 재발급 = revoke 후 새 인증부터.
 * - '빌링 승인 완료 웹훅'은 존재하지 않는다(BILLING_DELETED만 존재) — approve 반환값 +
 *   getPayment 재확인이 완결 신호다.
 */
import type { Brand } from '../core/brand';
import type { BillingErrorCode, TossApiFailure, TransportFailure } from '../core/errors';
import { getInternalEmit } from '../core/events';
import type { InternalTossEmit } from '../core/events';
import {
  customerKey as parseCustomerKeyRaw,
  type CustomerKey,
  type IdempotencyKey,
  type OrderId,
  type OrderName,
} from '../core/ids';
import type { Env } from '../core/keys';
import type { Payment } from '../core/payment';
import { err, ok, type Result } from '../core/result';
import {
  getInternalHttp,
  missingInternalHttpFailure,
  parsePaymentChecked,
  type CallOptions,
  type TossServerClient,
} from './client';
import { toSearchParams, type CallbackQueryInput, type CallbackParseError } from './confirm';
// 타입 전용 import — events.ts가 이 모듈을 type-only로 참조하므로 런타임 순환이 없다
import type { TossEventMap, TossEvents } from './events';
import type { BillingKeyRecord, BillingKeyStore } from './stores';

/**
 * 관측 채널용 빌링 경로 치환본 — approve/revoke의 실제 경로는 `/v1/billing/{billingKey}`인데,
 * 이를 무가공으로 AuditEntry.path·'api.call' 이벤트·onRetry.path에 실으면 §3.2 redaction
 * (body 키만 순회)을 우회해 billingKey 평문이 유출되고, 같은 audit 엔트리의 requestBody에
 * customerKey가 동거해 "빌링키+customerKey를 같은 로그에 남기지 말 것"(stores.ts, 토스 빌링
 * 보안 모델)을 위반한다. TossHttpInit.auditPath로 이 치환본을 전달해 원천 차단한다 —
 * 실제 전송 경로는 불변이다.
 */
const BILLING_AUDIT_PATH = '/v1/billing/[REDACTED]';
/** 공식 빌링 승인 API의 최소 timeout(60초)보다 여유를 둔 값. */
const BILLING_APPROVE_TIMEOUT_MS = 65_000;

// ─── 봉인 심볼 — 비열거·비공개. JSON.stringify/스프레드에 새지 않는다 ───────────
const authKeySeal: unique symbol = Symbol('gj-kit/toss-payments#billing-auth-key');
const billingKeySeal: unique symbol = Symbol('gj-kit/toss-payments#billing-key');

function seal<T extends object>(target: T, key: symbol, value: string): T {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return target;
}

function readSeal(target: object, key: symbol): string | undefined {
  // 비공개 봉인 심볼 조회 — 공개 타입에 없는 필드라 단언이 불가피
  const value = (target as Record<symbol, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

/** 마스킹 — customer-key-mismatch 에러에 원문 값을 싣지 않는다(로그 유출 방지).
 *  8자 이하는 앞뒤 노출만으로 원문 복원 여지가 커서 전체 마스킹한다. */
function mask(value: string): string {
  return value.length <= 8 ? '****' : `${value.slice(0, 2)}***${value.slice(-2)}`;
}

// ─── 콜백 파싱 → 세션 대조 ──────────────────────────────────────────────────

export interface PendingBillingAuth extends Brand<'PendingBillingAuth'> {
  /** 쿼리스트링으로 돌아온 값 — 신뢰 금지. confirmPendingAuth로 세션 값과 대조 전에는 사용 불가. */
  readonly returnedCustomerKey: string;
}

export type BillingAuthCallback =
  | { readonly status: 'authorized'; readonly pending: PendingBillingAuth }
  | { readonly status: 'user-canceled'; readonly code: string }
  | { readonly status: 'failed'; readonly code: string; readonly message: string };

/**
 * successUrl 콜백 파싱 — authKey는 공개 필드가 아니다(비공개 심볼·비열거 내부 보관,
 * 로그/JSON에 새지 않음). authKey는 일회용·최대 300자.
 */
export function parseBillingAuthCallback(
  input: CallbackQueryInput,
): Result<BillingAuthCallback, CallbackParseError> {
  const q = toSearchParams(input);
  const authKey = q.get('authKey');
  const returnedCustomerKey = q.get('customerKey');
  const code = q.get('code');

  if (authKey !== null && authKey !== '' && returnedCustomerKey !== null && returnedCustomerKey !== '') {
    // 파싱 통과가 브랜드 부여의 유일한 경로 — authKey는 봉인
    const pending = seal({ returnedCustomerKey }, authKeySeal, authKey) as PendingBillingAuth;
    return ok({ status: 'authorized', pending });
  }
  if (code !== null && code !== '') {
    if (code === 'PAY_PROCESS_CANCELED' || code === 'USER_CANCEL') {
      return ok({ status: 'user-canceled', code });
    }
    return ok({ status: 'failed', code, message: q.get('message') ?? '' });
  }
  return err({
    source: 'library',
    kind: 'callback-parse',
    missing: ['authKey', 'customerKey'],
    reason: 'missing-param',
  });
}

export interface AuthKeyReceived extends Brand<'AuthKeyReceived'> {
  /** 대조 완료된 **세션 유래** 값 — 콜백 값이 아니다. authKey는 계속 봉인 상태. */
  readonly customerKey: CustomerKey;
}

/**
 * 세션에 저장된 customerKey와 대조 — 통과해야만 AuthKeyReceived.
 * 이 단계를 건너뛰고 issue를 호출할 방법이 없다 (쿼리 값은 위변조 가능 — 문서도
 * "검증 후 발급 API 호출"을 요구).
 */
export function confirmPendingAuth(
  pending: PendingBillingAuth,
  expectedCustomerKey: CustomerKey,
): Result<
  AuthKeyReceived,
  {
    readonly source: 'library';
    readonly kind: 'customer-key-mismatch';
    readonly expected: string;
    readonly returned: string;
  }
> {
  if (pending.returnedCustomerKey !== expectedCustomerKey) {
    return err({
      source: 'library',
      kind: 'customer-key-mismatch',
      expected: mask(expectedCustomerKey),
      returned: mask(pending.returnedCustomerKey),
    });
  }
  const authKey = readSeal(pending, authKeySeal);
  const base = { customerKey: expectedCustomerKey };
  // 봉인 이월 — pending이 복제본이라 봉인이 없으면 issue 시점에 auth-detached로 표면화된다
  if (authKey !== undefined) seal(base, authKeySeal, authKey);
  // 대조 통과가 브랜드 부여의 유일한 경로
  return ok(base as AuthKeyReceived);
}

// ─── 프로필/플로우 타입 ─────────────────────────────────────────────────────

/**
 * billingKey는 공개 필드·JSON 직렬화·열거 어디에도 노출되지 않는다(비공개 심볼, 비열거).
 * WeakMap이 아니므로 일반 전달은 안전하지만, 스프레드/직렬화 복제본은 approve에서
 * 명시적 Err('profile-detached') — billing.load()로 재수화하라.
 */
export interface BillingProfile extends Brand<'BillingProfile'> {
  readonly customerKey: CustomerKey;
  readonly method: '카드' | '계좌이체';
  /** "433012******890" — 표시용. */
  readonly maskedSource: string;
  readonly issuedAt: string;
}

/** customerKey 필드가 없음이 핵심 — 봉인 쌍(profile)의 값만 전송된다. */
export interface BillingOrder {
  readonly orderId: OrderId;
  readonly orderName: OrderName;
  readonly amount: number;
  readonly customerEmail?: string;
  readonly customerName?: string;
  /** FDS 부정거래 탐지용. */
  readonly customerIp?: string;
  readonly taxFreeAmount?: number;
  readonly taxExemptionAmount?: number;
}

export interface DirectCardIssueInput {
  readonly customerKey: CustomerKey;
  readonly cardNumber: string;
  readonly cardExpirationYear: string;
  readonly cardExpirationMonth: string;
  /** 생년월일 YYMMDD 6자리 또는 사업자등록번호 10자리. */
  readonly customerIdentityNumber: string;
  /** 카드 비밀번호 앞 2자리 — ⚠ 절대 로그에 남기지 말 것. */
  readonly cardPassword: string;
  readonly customerName?: string;
  readonly customerEmail?: string;
}

export type BillingPayment = Payment & { readonly type: 'BILLING'; readonly status: 'DONE' };

export interface StoreFailure {
  readonly source: 'library';
  readonly kind: 'store-failure';
  readonly operation: 'save' | 'find' | 'delete';
  readonly cause: unknown;
}

/**
 * store-save-failed 에러에 동봉되는 발급 record — **billingKey는 봉인 상태**(비공개 심볼,
 * 비열거)다. `JSON.stringify(error)`·스프레드·`Object.values` 어디에도 billingKey 평문이
 * 새지 않는다(BillingProfile과 동일한 봉인 규칙). 재저장하려면 {@link recoverBillingKeyRecord}로
 * 원본 {@link BillingKeyRecord}를 회수해 store.save에 직접 재시도하라.
 */
export interface SealedBillingKeyRecord
  extends Omit<BillingKeyRecord, 'billingKey'>,
    Brand<'SealedBillingKeyRecord'> {}

export type IssueBillingKeyError =
  | TossApiFailure<BillingErrorCode>
  | TransportFailure
  /**
   * 키는 발급됐다 — 유실 방지를 위해 발급 record를 동봉한다(수동 복구용).
   * issuedRecord의 billingKey는 봉인되어 있어 에러 객체를 통째로 로깅해도 유출되지 않는다 —
   * 회수는 {@link recoverBillingKeyRecord}로만 가능하다.
   */
  | {
      readonly source: 'library';
      readonly kind: 'store-save-failed';
      readonly cause: unknown;
      readonly issuedRecord: SealedBillingKeyRecord;
    }
  /** 봉인 소실 복제본(스프레드/직렬화) — 인증 플로우를 다시 시작해야 한다. */
  | {
      readonly source: 'library';
      readonly kind: 'auth-detached';
      readonly customerKey: CustomerKey;
    };

export type BillingApproveError =
  | TossApiFailure<BillingErrorCode>
  | TransportFailure
  | {
      readonly source: 'library';
      readonly kind: 'missing-idempotency-key';
    }
  | {
      readonly source: 'library';
      readonly kind: 'invalid-input';
      readonly field: string;
      readonly reason: string;
    }
  /** 봉인 소실 복제본 — billing.load()로 재수화하라. */
  | {
      readonly source: 'library';
      readonly kind: 'profile-detached';
      readonly customerKey: CustomerKey;
    };

export type RevokeBillingKeyError =
  | TossApiFailure<'ALREADY_REMOVED_BILLING_KEY' | (string & {})>
  | TransportFailure
  | StoreFailure
  /** 봉인 소실 복제본 — billing.load()로 재수화하라. */
  | {
      readonly source: 'library';
      readonly kind: 'profile-detached';
    readonly customerKey: CustomerKey;
  };

/**
 * 원격 billing key revoke 뒤 현재 로컬 credential도 제거됐는지의 명시적 결과.
 *
 * `false`는 profile이 오래되어 같은 customerKey에 더 새 billing key가 있거나, 이미
 * 로컬 행이 없어서 현재 credential을 건드리지 않았다는 뜻이다. 원격 DELETE 자체는
 * 성공했으므로 Err가 아니지만, 호출자가 이를 "현재 결제수단 해제"로 오해하면 안 된다.
 */
export interface RevokeBillingKeyOutcome {
  readonly currentStoredKeyDeleted: boolean;
}

export type ImportBillingKeyError =
  | {
      readonly source: 'library';
      readonly kind: 'invalid-input';
      readonly field: string;
      readonly reason: string;
    }
  | StoreFailure;

export interface BillingCapabilities {
  /** 카드 정보 직접 전달 발급(/v1/billing/authorizations/card) — 추가 계약 필요. */
  readonly directCardIssue?: true;
  /** @deprecated approve는 이제 모든 구성에서 멱등키가 필수다. */
  readonly requireApproveIdempotencyKey?: true;
}

export interface BillingFlowBase<E extends Env> {
  /**
   * POST /v1/billing/authorizations/issue → store.save 성공 후에만 Ok.
   * 저장 실패면 Err에 발급된 record 동봉 — 조회 API가 없으므로 저장 실패 = 키 유실이다.
   */
  issue(
    auth: AuthKeyReceived,
    options?: CallOptions<E>,
  ): Promise<Result<BillingProfile, IssueBillingKeyError>>;

  /** 스토어에서 재수화 — BillingProfile을 얻는 유일한 다른 경로(봉인 소실 복구 API). */
  load(customerKey: CustomerKey): Promise<Result<BillingProfile | null, StoreFailure>>;

  /**
   * ⚠ 마이그레이션 전용 이관 경로(§7 확정 6) — 기존 시스템이 보유한 billingKey를
   * 형식 검증 후 store.save 하고 BillingProfile로 승격한다.
   *
   * 토스에는 빌링키 조회 API가 없어 **record 값의 진위를 서버에서 재검증할 수 없다** —
   * 오염된 record면 '타입은 맞고 값은 틀린' 프로필이 만들어져 approve에서
   * INVALID_BILL_KEY_REQUEST 류로 실패한다. 신뢰할 수 있는 원본에서만 이관할 것.
   */
  import(record: BillingKeyRecord): Promise<Result<BillingProfile, ImportBillingKeyError>>;

  /**
   * BillingOrder에는 customerKey 필드가 없다 — 봉인 쌍으로만 승인 →
   * NOT_MATCHES_CUSTOMER_KEY 구조적 방지. 봉인이 소실된 profile(스프레드 복제본 등)은
   * 런타임 Err('profile-detached') — billing.load로 재수화 안내.
   *
   * options와 idempotencyKey는 모든 구성에서 필수다. TypeScript 우회를 거친 런타임 호출도
   * missing-idempotency-key로 API 전송 전에 거부한다.
   */
  readonly approve: (
    profile: BillingProfile,
    order: BillingOrder,
    options: CallOptions<E> & { readonly idempotencyKey: IdempotencyKey },
  ) => Promise<Result<BillingPayment, BillingApproveError>>;

  /**
   * DELETE /v1/billing/{billingKey} 뒤
   * `store.delete({ customerKey, expectedBillingKey: billingKey })`.
   *
   * 반환의 `currentStoredKeyDeleted`가 false면 profile은 이미 오래됐거나 행이 없어
   * 현재 저장 credential을 지우지 않았다. 갱신 API는 존재하지 않는다 — refresh류
   * 메서드 없음. 재발급 = 새 인증부터.
   */
  revoke(
    profile: BillingProfile,
    options?: CallOptions<E>,
  ): Promise<Result<RevokeBillingKeyOutcome, RevokeBillingKeyError>>;
}

export type BillingFlow<E extends Env, C extends BillingCapabilities = {}> =
  BillingFlowBase<E> &
  (C extends { directCardIssue: true }
    ? {
        /**
         * 추가 계약 필요(NOT_SUPPORTED_METHOD). 테스트 표준 카드 9410001234567890
         * (Phase 0 실측 — BIN 6자리 단독은 400 INVALID_CARD_NUMBER).
         */
        issueWithCard(
          input: DirectCardIssueInput,
          options?: CallOptions<E>,
        ): Promise<Result<BillingProfile, IssueBillingKeyError>>;
      }
    : {});

// ─── 구현 ───────────────────────────────────────────────────────────────────

/** (내부) 발급 응답 원문 → BillingKeyRecord. billingKey 부재 시 null. */
function toBillingKeyRecord(data: unknown, customerKeyValue: string): BillingKeyRecord | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>; // 응답 원문 탐색 — 필드별 typeof 확인 후 사용
  const billingKey = typeof d['billingKey'] === 'string' ? d['billingKey'] : null;
  if (billingKey === null || billingKey.length === 0) return null;

  const cardRaw =
    typeof d['card'] === 'object' && d['card'] !== null
      ? (d['card'] as Record<string, unknown>)
      : null;
  const card =
    cardRaw === null
      ? null
      : {
          issuerCode: typeof cardRaw['issuerCode'] === 'string' ? cardRaw['issuerCode'] : '',
          number: typeof cardRaw['number'] === 'string' ? cardRaw['number'] : '',
          cardType: isCardType(cardRaw['cardType']) ? cardRaw['cardType'] : '미확인',
          ownerType: isOwnerType(cardRaw['ownerType']) ? cardRaw['ownerType'] : '미확인',
        } as const;

  const transfersRaw = Array.isArray(d['transfers']) ? d['transfers'] : null;
  const transfers =
    transfersRaw === null
      ? null
      : transfersRaw.flatMap((t: unknown) => {
          if (typeof t !== 'object' || t === null) return [];
          const tr = t as Record<string, unknown>;
          return [
            {
              bankName: typeof tr['bankName'] === 'string' ? tr['bankName'] : '',
              bankAccountNumber:
                typeof tr['bankAccountNumber'] === 'string' ? tr['bankAccountNumber'] : '',
            },
          ];
        });

  return {
    customerKey: customerKeyValue,
    billingKey,
    method: d['method'] === '계좌이체' ? '계좌이체' : '카드',
    issuedAt:
      typeof d['authenticatedAt'] === 'string' ? d['authenticatedAt'] : new Date().toISOString(),
    card,
    transfers,
  };
}

function isCardType(v: unknown): v is '신용' | '체크' | '기프트' | '미확인' {
  return v === '신용' || v === '체크' || v === '기프트' || v === '미확인';
}
function isOwnerType(v: unknown): v is '개인' | '법인' | '미확인' {
  return v === '개인' || v === '법인' || v === '미확인';
}

/** (내부) record → 에러 동봉용 봉인 record. billingKey를 공개 필드에서 제거하고 봉인한다. */
function sealIssuedRecord(record: BillingKeyRecord): SealedBillingKeyRecord {
  const { billingKey, ...rest } = record;
  // 봉인이 이 생성 경로로만 부여된다 — 브랜드 단언 불가피
  return seal({ ...rest }, billingKeySeal, billingKey) as SealedBillingKeyRecord;
}

/**
 * store-save-failed 에러에 동봉된 봉인 record에서 원본 {@link BillingKeyRecord}를 회수한다 —
 * 반환된 record는 열거 가능한 billingKey 평문을 담으므로 **로그에 남기지 말고** store.save
 * 재시도에만 사용할 것. 스프레드/직렬화 복제본은 봉인이 소실되어 Err('record-detached')다.
 */
export function recoverBillingKeyRecord(
  sealed: SealedBillingKeyRecord,
): Result<
  BillingKeyRecord,
  { readonly source: 'library'; readonly kind: 'record-detached'; readonly customerKey: string }
> {
  const billingKey = readSeal(sealed, billingKeySeal);
  if (billingKey === undefined) {
    return err({ source: 'library', kind: 'record-detached', customerKey: sealed.customerKey });
  }
  return ok({
    customerKey: sealed.customerKey,
    billingKey,
    method: sealed.method,
    issuedAt: sealed.issuedAt,
    card: sealed.card,
    transfers: sealed.transfers,
  });
}

/** (내부) record → 봉인된 BillingProfile. */
function toProfile(record: BillingKeyRecord): BillingProfile {
  const maskedSource =
    record.card?.number ?? record.transfers?.[0]?.bankAccountNumber ?? '';
  const base = {
    // 스토어/발급 응답 재수화 경계 — 서버 재검증 API가 없어 원문을 신뢰한다(TSDoc 경고 참조)
    customerKey: record.customerKey as CustomerKey,
    method: record.method,
    maskedSource,
    issuedAt: record.issuedAt,
  };
  // billingKey 봉인 + 브랜드 부여 — 이 생성 경로(issue/load/import)가 유일하다
  return seal(base, billingKeySeal, record.billingKey) as BillingProfile;
}

/**
 * 빌링 플로우 팩토리 — client는 'api' KeyKind 전용(위젯 키 클라이언트는 컴파일 에러),
 * store는 필수(조회 API가 없어 저장이 유일한 보관 수단).
 */
export function createBillingFlow<E extends Env, C extends BillingCapabilities = {}>(
  client: TossServerClient<E, 'api'>,
  store: BillingKeyStore,
  options?: {
    readonly capabilities?: C;
    /**
     * §3.3 이벤트 버스 — billing.issued/approved/approve-failed/revoked 발행 지점.
     * payload에 billingKey는 원천 부재(봉인 원칙 유지). createTossEvents 산출물만 발행이 흐른다.
     */
    readonly events?: TossEvents;
  },
): BillingFlow<E, C> {
  const http = getInternalHttp(client);
  // 발행 계층 — createTossEvents 산출물이 아니면 null(발행 지점 no-op, 비용 0 수렴)
  const emit: InternalTossEmit<TossEventMap> | null = getInternalEmit<TossEventMap>(
    options?.events,
  );

  const issueAndSave = async (
    path: string,
    bodyJson: string,
    customerKeyValue: CustomerKey,
    callOptions: CallOptions<E> | undefined,
  ): Promise<Result<BillingProfile, IssueBillingKeyError>> => {
    if (http === null) return err(missingInternalHttpFailure());
    const r = await http.request({
      method: 'POST',
      path,
      bodyJson,
      idempotencyKey: callOptions?.idempotencyKey,
      testCode: callOptions?.testCode,
      signal: callOptions?.signal,
    });
    if (!r.ok) return err(r.error);
    const record = toBillingKeyRecord(r.value, customerKeyValue);
    if (record === null) {
      // 200인데 billingKey가 없음 — 응답 이상. 전송 계층 이상으로 분류한다.
      return err({
        source: 'network',
        code: 'NETWORK_ERROR',
        retryable: true,
        cause: new Error('빌링키 발급 응답에 billingKey가 없습니다.'),
      });
    }
    try {
      await store.save(
        record,
        callOptions?.idempotencyKey === undefined
          ? undefined
          : { operationId: callOptions.idempotencyKey },
      );
    } catch (cause) {
      // 키는 발급됐다 — record를 동봉해 유실을 막는다(호출자 수동 복구).
      // billingKey는 봉인 상태로 동봉 — 에러 통째 로깅에도 새지 않는다(recoverBillingKeyRecord로 회수)
      return err({
        source: 'library',
        kind: 'store-save-failed',
        cause,
        issuedRecord: sealIssuedRecord(record),
      });
    }
    // Result 확정 후 발화 — payload는 customerKey만(billingKey 유출 원천 차단, §3.3)
    emit?.emit('billing.issued', { customerKey: customerKeyValue });
    return ok(toProfile(record));
  };

  const approveImpl = async (
    profile: BillingProfile,
    order: BillingOrder,
    callOptions?: CallOptions<E>,
  ): Promise<Result<BillingPayment, BillingApproveError>> => {
    if (callOptions?.idempotencyKey === undefined) {
      return err({ source: 'library', kind: 'missing-idempotency-key' });
    }
    if (!Number.isSafeInteger(order.amount) || order.amount <= 0) {
      return err({
        source: 'library',
        kind: 'invalid-input',
        field: 'amount',
        reason: '금액은 0보다 큰 안전한 정수여야 합니다',
      });
    }
    for (const field of ['taxFreeAmount', 'taxExemptionAmount'] as const) {
      const value = order[field];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
        return err({
          source: 'library',
          kind: 'invalid-input',
          field,
          reason: '0 이상의 안전한 정수여야 합니다',
        });
      }
    }
    const billingKey = readSeal(profile, billingKeySeal);
    if (billingKey === undefined) {
      return err({ source: 'library', kind: 'profile-detached', customerKey: profile.customerKey });
    }
    if (http === null) return err(missingInternalHttpFailure());
    const body: Record<string, unknown> = {
      // customerKey는 봉인 쌍(profile)에서만 온다 — BillingOrder에는 필드 자체가 없다
      customerKey: profile.customerKey,
      orderId: order.orderId,
      orderName: order.orderName,
      amount: order.amount,
    };
    if (order.customerEmail !== undefined) body['customerEmail'] = order.customerEmail;
    if (order.customerName !== undefined) body['customerName'] = order.customerName;
    if (order.customerIp !== undefined) body['customerIp'] = order.customerIp;
    if (order.taxFreeAmount !== undefined) body['taxFreeAmount'] = order.taxFreeAmount;
    if (order.taxExemptionAmount !== undefined) {
      body['taxExemptionAmount'] = order.taxExemptionAmount;
    }
    const r = await http.request({
      method: 'POST',
      path: `/v1/billing/${encodeURIComponent(billingKey)}`,
      // 관측 채널(audit/events/onRetry)에는 치환본만 — billingKey 경로 유출 원천 차단
      auditPath: BILLING_AUDIT_PATH,
      bodyJson: JSON.stringify(body),
      idempotencyKey: callOptions?.idempotencyKey,
      testCode: callOptions?.testCode,
      signal: callOptions?.signal,
      timeoutMs: BILLING_APPROVE_TIMEOUT_MS,
    });
    if (!r.ok) return err(r.error);
    // 2xx라도 빈 body/비객체 JSON이면 '빈 Payment' 제조 금지 — 필수 필드 가드 통과 후에만 Ok
    const parsed = parsePaymentChecked(r.value);
    if (!parsed.ok) return parsed;
    if (
      parsed.value.type !== 'BILLING' ||
      parsed.value.status !== 'DONE' ||
      parsed.value.orderId !== order.orderId ||
      parsed.value.totalAmount !== order.amount
    ) {
      return err({
        source: 'network',
        code: 'NETWORK_ERROR',
        retryable: true,
        cause: new Error('빌링 승인 2xx 응답이 요청(type/status/orderId/amount)과 일치하지 않습니다.'),
      });
    }
    return ok(parsed.value as BillingPayment);
  };

  const revokeImpl = async (
    profile: BillingProfile,
    callOptions?: CallOptions<E>,
  ): Promise<Result<RevokeBillingKeyOutcome, RevokeBillingKeyError>> => {
    const billingKey = readSeal(profile, billingKeySeal);
    if (billingKey === undefined) {
      return err({ source: 'library', kind: 'profile-detached', customerKey: profile.customerKey });
    }
    if (http === null) return err(missingInternalHttpFailure());
    const r = await http.request({
      method: 'DELETE',
      path: `/v1/billing/${encodeURIComponent(billingKey)}`,
      // 관측 채널(audit/events/onRetry)에는 치환본만 — billingKey 경로 유출 원천 차단
      auditPath: BILLING_AUDIT_PATH,
      testCode: callOptions?.testCode,
      signal: callOptions?.signal,
    });
    if (!r.ok && !(r.error.source === 'toss' && r.error.code === 'ALREADY_REMOVED_BILLING_KEY')) {
      return err(r.error);
    }
    let currentStoredKeyDeleted: boolean;
    try {
      // JavaScript 소비자가 오래된 store 구현을 붙여 undefined/임의 truthy를 반환해도
      // "현재 credential 삭제"로 승격하지 않는다. 오직 literal true만 성공이다.
      currentStoredKeyDeleted =
        (await store.delete({
          customerKey: profile.customerKey,
          expectedBillingKey: billingKey,
        })) === true;
    } catch (cause) {
      return err({ source: 'library', kind: 'store-failure', operation: 'delete', cause });
    }
    return ok({ currentStoredKeyDeleted });
  };

  const base: BillingFlowBase<E> = {
    async issue(auth, callOptions) {
      const authKey = readSeal(auth, authKeySeal);
      if (authKey === undefined) {
        return err({ source: 'library', kind: 'auth-detached', customerKey: auth.customerKey });
      }
      return issueAndSave(
        '/v1/billing/authorizations/issue',
        JSON.stringify({ authKey, customerKey: auth.customerKey }),
        auth.customerKey,
        callOptions,
      );
    },

    async load(customerKeyValue) {
      let record: BillingKeyRecord | null;
      try {
        record = await store.find(customerKeyValue);
      } catch (cause) {
        return err({ source: 'library', kind: 'store-failure', operation: 'find', cause });
      }
      return ok(record === null ? null : toProfile(record));
    },

    async import(record) {
      const invalid = (
        field: string,
        reason: string,
      ): Result<never, ImportBillingKeyError> =>
        err({ source: 'library', kind: 'invalid-input', field, reason });

      const ck = parseCustomerKeyRaw(record.customerKey);
      if (!ck.ok) return invalid('customerKey', ck.error.reason);
      if (record.billingKey.length === 0) return invalid('billingKey', 'empty');
      if (record.billingKey.length > 200) return invalid('billingKey', 'too-long');
      if (record.method !== '카드' && record.method !== '계좌이체') {
        return invalid('method', "'카드' 또는 '계좌이체'여야 합니다");
      }
      if (typeof record.issuedAt !== 'string' || record.issuedAt.length === 0) {
        return invalid('issuedAt', 'empty');
      }
      try {
        await store.save(record);
      } catch (cause) {
        return err({ source: 'library', kind: 'store-failure', operation: 'save', cause });
      }
      return ok(toProfile(record));
    },

    async approve(profile, order, callOptions) {
      const r = await approveImpl(profile, order, callOptions);
      // Result 확정 후 발화 — 발화가 반환값을 바꾸는 경로 없음(핸들러 격리는 이미터 소유)
      if (r.ok) {
        emit?.emit('billing.approved', { payment: r.value, customerKey: profile.customerKey });
      } else {
        emit?.emit('billing.approve-failed', { customerKey: profile.customerKey, error: r.error });
      }
      return r;
    },

    async revoke(profile, callOptions) {
      const r = await revokeImpl(profile, callOptions);
      // stale profile의 원격 key revoke는 성공할 수 있어도, 더 새 local key를 건드리지
      // 않았으면 customerKey만 담긴 이벤트를 발화하면 안 된다. 수신자가 현재 entitlement를
      // 비활성화하는 잘못된 해석을 할 수 있기 때문이다.
      if (r.ok && r.value.currentStoredKeyDeleted) {
        emit?.emit('billing.revoked', { customerKey: profile.customerKey });
      }
      return r;
    },
  };

  if (options?.capabilities?.directCardIssue === true) {
    const withCard = {
      ...base,
      issueWithCard(input: DirectCardIssueInput, callOptions?: CallOptions<E>) {
        return issueAndSave(
          '/v1/billing/authorizations/card',
          JSON.stringify({
            customerKey: input.customerKey,
            cardNumber: input.cardNumber,
            cardExpirationYear: input.cardExpirationYear,
            cardExpirationMonth: input.cardExpirationMonth,
            customerIdentityNumber: input.customerIdentityNumber,
            cardPassword: input.cardPassword,
            ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
            ...(input.customerEmail !== undefined ? { customerEmail: input.customerEmail } : {}),
          }),
          input.customerKey,
          callOptions,
        );
      },
    };
    // capability 조건부 교차 타입 반환 — 단언 불가피(C가 런타임 분기와 대응함을 위에서 확인)
    return withCard as BillingFlow<E, C>;
  }
  // capability 조건부 교차 타입 반환 — 단언 불가피(미선언이면 메서드 부재가 올바른 형태)
  return base as BillingFlow<E, C>;
}
