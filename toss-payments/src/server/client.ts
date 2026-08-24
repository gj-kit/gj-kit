/**
 * createTossClient — 토스 서버 API 클라이언트 + 요청 공통 계층.
 *
 * Basic 인증 문자열 생성(`base64(secretKey + ":")` — 콜론 필수, BOM 금지)은 이 모듈
 * 내부에 캡슐화되며 공개 API가 없다 — INCORRECT_BASIC_AUTH_FORMAT 도달 불가 목표(§2).
 */
import { redactForAudit } from '../core/audit';
import type { AuditEntry, AuditOptions } from '../core/audit';
import { classifyTossErrorCode } from '../core/errors';
import type { TossApiFailure, TransportFailure } from '../core/errors';
import { getInternalEmit } from '../core/events';
import {
  orderId as parseOrderId,
  paymentKey as parsePaymentKey,
  type IdempotencyKey,
  type OrderId,
  type PaymentKey,
} from '../core/ids';
import type { ApiSecretKey, Env, WidgetSecretKey } from '../core/keys';
import type { CancelTransaction, Payment } from '../core/payment';
import { err, ok, type Result } from '../core/result';
import { createCancels, type CancelRetryStore, type TossCancels } from './cancel';
import type { TossEventMap, TossEvents } from './events';

export type KeyKind = 'api' | 'widget';

/**
 * retry — 실측 근거 하드 가드 자동 재시도 (설계 §3.4, 기본 꺼짐).
 *
 * 재시도 허용 조건은 **설정으로 확장 불가, 코드에 고정**이다(Phase 5 실측이 근거인 하드 불변식):
 * 1. GET: TransportFailure만 재시도 (자체 멱등 — 문서).
 * 2. Idempotency-Key가 실제 부착된 POST/DELETE:
 *    (a) TransportFailure — 동일 키+동일 body 재전송은 서버 도달 시 바이트 동일 재생,
 *        미도달 시 재실행(Phase 0 실측 — 이중 실행 없음).
 *    (b) 409 IDEMPOTENT_REQUEST_PROCESSING — 문서 지시("다시 요청해서 응답을 확인하세요") 준수.
 * 3. 키 없는 POST/DELETE(confirm 기본 정책): 어떤 실패든 자동 재시도 절대 없음 — 이중 승인
 *    방지. `retryable: true`여도 무시. confirm에 retry 효과를 받으려면
 *    `options.idempotencyKey` 명시가 전제다.
 * 4. 토스 4xx/5xx 에러 응답: 재시도 안 함 — 4xx는 멱등 재생 실측 확정(같은 키 재시도 =
 *    15일간 같은 에러 재생), 5xx는 재생 여부 미실측이라 보수 배제. PROVIDER_ERROR 등
 *    `retryable: true`도 포함해 배제 — 그 재시도는 "새 멱등키 + 상황 판단"이 필요한
 *    호출자 의사결정이다(§7-3).
 *
 * 역할 구분: 이 옵션은 "요청 내" 자동화다 — cancel의 CancelRetryTicket은 "요청 간(큐 저장
 * 후)" 수동 재실행용으로 그대로 유지·동봉된다. 409 재시도 후 원 요청이 4xx로 끝났으면 그
 * 에러를 재생받고 종료한다 — 처리 결과 확인이라는 올바른 동작이다.
 *
 * ⚠ 기본값 최악 지연 +10.5s(+ 시도별 timeout) — 요청 경로가 아닌 배치/큐 소비자에서 켜라.
 * confirm 경로 권장값은 maxAttempts 2. 409 폴링은 테스트 환경 분당 100건 쿼터를 소모한다.
 */
export interface RetryOptions {
  /** 총 시도 횟수(최초 포함). 기본 3. 리터럴 유니언 — 폭주 설정 원천 차단. */
  readonly maxAttempts?: 2 | 3 | 4 | 5;
  /**
   * 시도 간 지연(ms). 기본 [500, 2_000, 8_000], full jitter ±25% 자동. 부족하면 마지막 값 재사용.
   * 각 값은 0~60_000의 안전한 정수여야 하며 빈 배열은 허용하지 않는다.
   */
  readonly delaysMs?: readonly number[];
  /**
   * reason이 2종 리터럴로 고정 — toss retryable류로 확장하려면 공개 타입 변경이 필요하도록
   * 봉인(§7-3). nextDelayMs는 jitter 적용 후 값. 이 콜백의 throw는 삼켜진다(요청 무간섭).
   */
  readonly onRetry?: (info: {
    readonly attempt: number;
    readonly reason: 'transport' | 'idempotent-processing';
    readonly nextDelayMs: number;
    readonly path: string;
  }) => void;
}

export interface TossClientOptions {
  /** 기본 globalThis.fetch (Node 20+ 내장). 테스트에서는 모킹 주입 지점. */
  readonly fetch?: typeof fetch;
  /** 기본 https://api.tosspayments.com */
  readonly baseUrl?: string;
  /**
   * live 키로 공식 API 호스트 외 주소를 사용하는 위험한 탈출구.
   * 일반 운영에서는 절대 켜지 말 것.
   */
  readonly dangerouslyAllowCustomLiveBaseUrl?: true;
  /** 기본 30_000ms — AbortSignal.timeout과 호출자 signal을 결합해 적용한다(재시도 시 시도별 독립 적용). */
  readonly timeoutMs?: number;
  /** §3.2 아웃바운드 req/res 증거 기록 — 기본 꺼짐. 시도 1건 = AuditEntry 1건. */
  readonly audit?: AuditOptions;
  /** §3.4 자동 재시도 — 기본 꺼짐(미설정 시 1회 시도, 현행 동작과 동일). */
  readonly retry?: RetryOptions;
  /** §3.3 이벤트 버스 — 'api.call' 전용(논리 요청당 최종 1회). createTossEvents 산출물만 발행이 흐른다. */
  readonly events?: TossEvents;
  /** 취소 transport 실패 티켓을 프로세스 재시작 후에도 재실행하기 위한 영속 저장소. */
  readonly cancelRetries?: CancelRetryStore;
}

export interface CallOptions<E extends Env> {
  /**
   * ≤300자, POST 전용. 처음 사용일부터 15일 유효 — TTL 초과 후 재사용하면 새 요청으로
   * 실행될 수 있다(문서는 기간만 명시 — 안전하지 않은 것으로 취급). 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"이며 body는 포함되지
   * 않는다(문서 명시) — 키 재사용 시 body 동일성은 호출자(또는 재시도 티켓)가 보장해야 한다.
   */
  readonly idempotencyKey?: IdempotencyKey;
  /**
   * TossPayments-Test-Code 헤더 — 에러 시나리오 시뮬레이션.
   * 라이브 키에선 서버가 조용히 무시하는 함정 → 타입으로 차단.
   * ⚠ 비분배 조건부 — 미내로잉 union 키(E = Env)도 never다.
   */
  readonly testCode?: [E] extends ['test'] ? string : never;
  readonly signal?: AbortSignal;
}

export type LookupError =
  | TossApiFailure<'NOT_FOUND_PAYMENT' | 'UNAUTHORIZED_KEY' | (string & {})>
  | TransportFailure;

export interface TossServerClient<E extends Env = Env, K extends KeyKind = KeyKind> {
  readonly env: E;
  readonly keyKind: K;
  getPayment(
    key: PaymentKey,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<Payment, LookupError>>;
  /** DEPOSIT_CALLBACK에는 paymentKey가 없다 — orderId 재조회가 1급 경로. */
  getPaymentByOrderId(
    orderId: OrderId,
    options?: Pick<CallOptions<E>, 'signal'>,
  ): Promise<Result<Payment, LookupError>>;
  readonly cancels: TossCancels<E>;
}

// ─── 내부 요청 계층 — server/index.ts에서 재export하지 않는다 ───────────────

/** (내부) 요청 서술 — bodyJson은 호출자가 직렬화한다(재시도 티켓의 바이트 동일성 보장). */
export interface TossHttpInit {
  readonly method: 'GET' | 'POST' | 'DELETE';
  /** baseUrl 뒤에 붙는 경로 — 경로 세그먼트는 호출자가 encodeURIComponent 처리. */
  readonly path: string;
  /**
   * 관측 채널(AuditEntry.path · 'api.call' 이벤트 path · onRetry.path) 전용 경로 —
   * path에 민감 세그먼트(빌링키 등)가 들어가는 호출자가 치환본을 전달한다
   * (예: billing approve/revoke의 `/v1/billing/[REDACTED]`).
   *
   * §3.2 redaction은 body 키만 순회하므로 URL 경로의 billingKey는 통과한다 — 이 필드가
   * 그 구멍을 막는다(billing.ts 봉인 원칙: billingKey는 어떤 관측 채널에도 노출 불가).
   * 실제 전송 경로는 언제나 path다 — 이 필드는 fetch에 절대 쓰이지 않는다.
   */
  readonly auditPath?: string | undefined;
  readonly bodyJson?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly testCode?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /** 엔드포인트별 공식 최소 대기시간. 전역 timeoutMs보다 클 때만 상향한다. */
  readonly timeoutMs?: number | undefined;
}

/** (내부) 공통 요청 계층 — 인증/타임아웃/에러 분류를 소유한다. */
export interface TossHttp {
  request(init: TossHttpInit): Promise<Result<unknown, TossApiFailure | TransportFailure>>;
}

/**
 * (내부) 클라이언트에 http 계층을 매다는 비공개 심볼 — 비열거라 JSON/스프레드에 새지 않고,
 * 공개 타입 TossServerClient에도 나타나지 않는다. confirm/billing 플로우가 이 심볼로
 * confirm/빌링 엔드포인트에 접근한다 (공개 표면에 raw request API를 두지 않기 위함).
 */
const internalHttp: unique symbol = Symbol('gj-kit/toss-payments#server-http');

/** (내부) createTossClient 산출물에서 http 계층을 꺼낸다 — 구조적 모조 client면 null. */
export function getInternalHttp(client: TossServerClient): TossHttp | null {
  // 비공개 심볼 프로퍼티 조회 — 공개 타입에 없는 필드라 단언이 불가피 (심볼은 이 모듈 밖 비공개)
  const holder = client as { readonly [internalHttp]?: TossHttp };
  return holder[internalHttp] ?? null;
}

/**
 * (내부) createTossClient 산출물이 아닌 구조적 모조 client가 주입된 경우의 실패 값.
 * 공개 에러 유니언을 늘리지 않기 위해 TransportFailure로 표현한다 — cause에 원인 명시.
 */
export function missingInternalHttpFailure(): TransportFailure {
  return {
    source: 'network',
    code: 'NETWORK_ERROR',
    retryable: true,
    cause: new Error(
      'createTossClient로 생성된 클라이언트가 아닙니다 — 내부 요청 계층이 없어 API를 호출할 수 없습니다.',
    ),
  };
}

/** (내부) 검증된 Payment 원문 → `raw`를 포함하는 불변 스냅샷. */
export function parsePayment(data: unknown): Payment {
  const record: Record<string, unknown> =
    typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  // `parsePaymentChecked`가 판별 유니언의 모든 필드를 검증한 뒤에만 호출한다.
  return { ...record, raw: data } as unknown as Payment;
}

type JsonRecord = Record<string, unknown>;

const PAYMENT_STATUSES = [
  'READY',
  'IN_PROGRESS',
  'WAITING_FOR_DEPOSIT',
  'DONE',
  'CANCELED',
  'PARTIAL_CANCELED',
  'ABORTED',
  'EXPIRED',
] as const;
const PAYMENT_TYPES = ['NORMAL', 'BILLING', 'BRANDPAY'] as const;
const PAYMENT_METHODS = [
  '카드',
  '가상계좌',
  '간편결제',
  '휴대폰',
  '계좌이체',
  '문화상품권',
  '도서문화상품권',
  '게임문화상품권',
] as const;
const CARD_TYPES = ['신용', '체크', '기프트', '미확인'] as const;
const CARD_OWNER_TYPES = ['개인', '법인', '미확인'] as const;
const CANCEL_STATUSES = ['DONE', 'IN_PROGRESS', 'ABORTED'] as const;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(record: JsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNonEmptyStringOrNull(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isOneOf(value: unknown, values: readonly string[]): value is string {
  return typeof value === 'string' && values.includes(value);
}

function isUrlObjectOrNull(value: unknown): boolean {
  return value === null || (isRecord(value) && isNonEmptyString(value['url']));
}

function isMetadataOrNull(value: unknown): boolean {
  return value === null || (isRecord(value) && Object.values(value).every(isString));
}

function isFailureOrNull(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && isString(value['code']) && isString(value['message']))
  );
}

function isCardDetails(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isSafeNonNegativeInteger(value['amount']) &&
    isString(value['issuerCode']) &&
    isStringOrNull(value['acquirerCode']) &&
    isString(value['number']) &&
    isSafeNonNegativeInteger(value['installmentPlanMonths']) &&
    isString(value['approveNo']) &&
    typeof value['useCardPoint'] === 'boolean' &&
    isOneOf(value['cardType'], CARD_TYPES) &&
    isOneOf(value['ownerType'], CARD_OWNER_TYPES) &&
    isString(value['acquireStatus']) &&
    typeof value['isInterestFree'] === 'boolean' &&
    isStringOrNull(value['interestPayer'])
  );
}

function isVirtualAccountDetails(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['accountNumber']) &&
    isString(value['accountType']) &&
    isString(value['bankCode']) &&
    isString(value['customerName']) &&
    isTimestamp(value['dueDate']) &&
    typeof value['expired'] === 'boolean' &&
    isString(value['settlementStatus']) &&
    isString(value['refundStatus']) &&
    // `unknown | null`은 값을 좁히지 않지만, 타입이 약속한 필드는 응답에 존재해야 한다.
    hasOwn(value, 'refundReceiveAccount')
  );
}

function isEasyPayDetails(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['provider']) &&
    isSafeNonNegativeInteger(value['amount']) &&
    isSafeNonNegativeInteger(value['discountAmount'])
  );
}

function isTransferDetails(value: unknown): boolean {
  return isRecord(value) && isString(value['bankCode']) && isString(value['settlementStatus']);
}

function isMobilePhoneDetails(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value['customerMobilePhone']) &&
    isString(value['settlementStatus']) &&
    isNonEmptyString(value['receiptUrl'])
  );
}

function isGiftCertificateDetails(value: unknown): boolean {
  return isRecord(value) && isString(value['approveNo']) && isString(value['settlementStatus']);
}

function isCancelTransaction(value: unknown): value is CancelTransaction {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['transactionKey']) &&
    isSafeNonNegativeInteger(value['cancelAmount']) &&
    value['cancelAmount'] > 0 &&
    isString(value['cancelReason']) &&
    isSafeNonNegativeInteger(value['taxFreeAmount']) &&
    isSafeNonNegativeInteger(value['taxExemptionAmount']) &&
    isSafeNonNegativeInteger(value['refundableAmount']) &&
    isSafeNonNegativeInteger(value['transferDiscountAmount']) &&
    isSafeNonNegativeInteger(value['easyPayDiscountAmount']) &&
    isTimestamp(value['canceledAt']) &&
    isStringOrNull(value['receiptKey']) &&
    isOneOf(value['cancelStatus'], CANCEL_STATUSES) &&
    isStringOrNull(value['cancelRequestId'])
  );
}

/** `Payment` 판별 유니언의 method별 non-null 세부 객체까지 검증한다. */
function hasValidMethodDetails(record: JsonRecord): boolean {
  const method = record['method'];
  if (method === null) return true;
  if (!isOneOf(method, PAYMENT_METHODS)) return false;

  switch (method) {
    case '카드':
      return isCardDetails(record['card']) && record['virtualAccount'] === null;
    case '가상계좌':
      return (
        isVirtualAccountDetails(record['virtualAccount']) &&
        record['card'] === null
      );
    case '간편결제':
      return isEasyPayDetails(record['easyPay']);
    case '계좌이체':
      return isTransferDetails(record['transfer']);
    case '휴대폰':
      return isMobilePhoneDetails(record['mobilePhone']);
    case '문화상품권':
    case '도서문화상품권':
    case '게임문화상품권':
      return isGiftCertificateDetails(record['giftCertificate']);
  }
  return false;
}

/**
 * (내부) Payment 응답의 완전한 런타임 경계.
 *
 * `Payment`는 method별 세부 객체와 가상계좌 secret 의미까지 약속하는 판별 유니언이다.
 * 2xx라는 이유만으로 캐스팅하면 누락된 virtualAccount/secret이 저장소에 `undefined`로
 * 흘러갈 수 있으므로, base·취소 이력·method별 필드를 모두 검증한 뒤에만 값을 만든다.
 *
 * 가상계좌 `secret`은 조회 응답에서는 합법적으로 `null`이다. approval 응답에서만 필요한
 * non-null 보장은 `createConfirmFlow().confirm()`이 별도로 수행한다.
 */
export function parsePaymentChecked(data: unknown): Result<Payment, TransportFailure> {
  const record = isRecord(data) ? data : null;
  const paymentKeyValue = typeof record?.['paymentKey'] === 'string'
    ? parsePaymentKey(record['paymentKey'])
    : null;
  const orderIdValue = typeof record?.['orderId'] === 'string'
    ? parseOrderId(record['orderId'])
    : null;
  const validCancels =
    record?.['cancels'] === null ||
    (Array.isArray(record?.['cancels']) && record['cancels'].every(isCancelTransaction));
  if (
    record === null ||
    paymentKeyValue === null ||
    !paymentKeyValue.ok ||
    orderIdValue === null ||
    !orderIdValue.ok ||
    !isNonEmptyString(record['version']) ||
    !isOneOf(record['type'], PAYMENT_TYPES) ||
    !isString(record['orderName']) ||
    !isString(record['mId']) ||
    (record['currency'] !== 'KRW' && record['currency'] !== 'USD' && record['currency'] !== 'JPY') ||
    !isSafeNonNegativeInteger(record['totalAmount']) ||
    !isSafeNonNegativeInteger(record['balanceAmount']) ||
    !isOneOf(record['status'], PAYMENT_STATUSES) ||
    !isTimestamp(record['requestedAt']) ||
    !(record['approvedAt'] === null || isTimestamp(record['approvedAt'])) ||
    typeof record['useEscrow'] !== 'boolean' ||
    !isStringOrNull(record['lastTransactionKey']) ||
    !isSafeNonNegativeInteger(record['suppliedAmount']) ||
    !isSafeNonNegativeInteger(record['vat']) ||
    typeof record['cultureExpense'] !== 'boolean' ||
    !isSafeNonNegativeInteger(record['taxFreeAmount']) ||
    !isSafeNonNegativeInteger(record['taxExemptionAmount']) ||
    typeof record['isPartialCancelable'] !== 'boolean' ||
    !validCancels ||
    !isNonEmptyStringOrNull(record['secret']) ||
    !isMetadataOrNull(record['metadata']) ||
    !isUrlObjectOrNull(record['receipt']) ||
    !isUrlObjectOrNull(record['checkout']) ||
    !isString(record['country']) ||
    !isFailureOrNull(record['failure']) ||
    !hasValidMethodDetails(record) ||
    (record['status'] === 'DONE' && !isTimestamp(record['approvedAt']))
  ) {
    return err({
      source: 'network',
      code: 'NETWORK_ERROR',
      retryable: true,
      cause: new Error(
        '2xx 응답이 Payment 계약을 만족하지 않습니다 — 필수 필드(base·금액·취소·method별 세부)를 검증하세요. 조회 API로 실제 상태를 재확인하세요.',
      ),
    });
  }
  return ok(parsePayment(record));
}

/** AbortSignal.any는 Node 20.3+ — engines 하한(20.0)에서도 동작하도록 폴백 결합. */
function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([a, b]);
  const controller = new AbortController();
  const forward = (s: AbortSignal) => {
    if (s.aborted) controller.abort(s.reason);
    else s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  };
  forward(a);
  forward(b);
  return controller.signal;
}

/** (내부) 시도 1회의 산출 — 실패 메타는 result.error가 이미 보유하므로 성공 메타만 별도 운반. */
interface AttemptResult {
  readonly result: Result<unknown, TossApiFailure | TransportFailure>;
  /** 2xx 성공 시에만 존재 — audit/events용 httpStatus·traceId. */
  readonly okMeta?: { readonly httpStatus: number; readonly traceId: string | null };
}

/**
 * (내부) 재시도 허용 판정 — 설계 §3.4 하드 가드 4조건, 설정으로 확장 불가(코드 고정).
 * null = 재시도 금지. 근거는 RetryOptions TSDoc 참조.
 */
function retryReasonOf(
  init: TossHttpInit,
  result: Result<unknown, TossApiFailure | TransportFailure>,
): 'transport' | 'idempotent-processing' | null {
  if (result.ok) return null;
  const keyed = init.idempotencyKey !== undefined;
  if (result.error.source === 'network') {
    // 가드 1·2a·3: GET(자체 멱등) 또는 키가 실제 부착된 POST/DELETE만 —
    // 키 없는 POST/DELETE는 절대 불가(이중 승인/이중 실행 위험)
    return init.method === 'GET' || keyed ? 'transport' : null;
  }
  // 가드 2b·4: 토스 에러 응답 중 재시도 가능은 키 부착 + 409 IDEMPOTENT_REQUEST_PROCESSING
  // 단 하나. 그 외 4xx는 멱등 재생 실측 확정, 5xx는 미실측 보수 배제 — retryable:true도 무시.
  return keyed && result.error.code === 'IDEMPOTENT_REQUEST_PROCESSING'
    ? 'idempotent-processing'
    : null;
}

/** (내부) full jitter ±25% — 음수/0은 0으로. */
function applyJitter(baseMs: number): number {
  if (baseMs <= 0) return 0;
  return Math.round(baseMs * (0.75 + Math.random() * 0.5));
}

/** (내부) 호출자 abort 여부 — 함수 경유로 읽어 await 전 검사의 타입 내로잉 고착을 피한다. */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** (내부) abort 가능한 대기 — 호출자 signal abort 시 즉시 resolve(재시도 루프가 직후 중단). */
function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted === true) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** §3.4 확정 기본값 — 최악 지연 +10.5s(README 계산 예시와 일치). */
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [500, 2_000, 8_000];
const MAX_RETRY_DELAY_MS = 60_000;

function validateRetryOptions(retry: RetryOptions): {
  readonly maxAttempts: 2 | 3 | 4 | 5;
  readonly delaysMs: readonly number[];
} {
  if (typeof retry !== 'object' || retry === null || Array.isArray(retry)) {
    throw new TypeError('retry는 RetryOptions 객체여야 합니다.');
  }
  const maxAttempts = retry.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 2 || maxAttempts > 5) {
    throw new TypeError('retry.maxAttempts는 2~5 사이의 안전한 정수여야 합니다.');
  }

  const delaysMs = retry.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  if (!Array.isArray(delaysMs) || delaysMs.length === 0) {
    throw new TypeError('retry.delaysMs는 비어 있지 않은 배열이어야 합니다.');
  }
  if (
    delaysMs.some(
      (delay) =>
        !Number.isSafeInteger(delay) || delay < 0 || delay > MAX_RETRY_DELAY_MS,
    )
  ) {
    throw new TypeError(
      `retry.delaysMs의 각 값은 0~${MAX_RETRY_DELAY_MS} 사이의 안전한 정수여야 합니다.`,
    );
  }

  return { maxAttempts, delaysMs };
}

function createHttp(secretKey: string, env: Env, options: TossClientOptions): TossHttp {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? 'https://api.tosspayments.com').replace(/\/+$/, '');
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new TypeError('baseUrl은 유효한 절대 URL이어야 합니다.');
  }
  if (
    env === 'live' &&
    options.dangerouslyAllowCustomLiveBaseUrl !== true &&
    (parsedBaseUrl.protocol !== 'https:' || parsedBaseUrl.origin !== 'https://api.tosspayments.com')
  ) {
    throw new TypeError(
      'live 키의 baseUrl은 https://api.tosspayments.com만 허용됩니다. ' +
        '프록시가 반드시 필요하면 dangerouslyAllowCustomLiveBaseUrl: true를 명시하세요.',
    );
  }
  const timeoutMs = options.timeoutMs ?? 30_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs는 0보다 큰 안전한 정수여야 합니다.');
  }
  // Basic 인증 캡슐화 — 콜론 필수(문서: 콜론 누락·UTF-8 BOM이 대표 실수)
  const authorization = `Basic ${btoa(`${secretKey}:`)}`;

  const audit = options.audit;
  const retry = options.retry;
  // retry 미설정 = 1회 시도 — 현행 동작과 동일(기본 꺼짐 계약)
  const validatedRetry = retry === undefined ? null : validateRetryOptions(retry);
  const maxAttempts = validatedRetry?.maxAttempts ?? 1;
  const delaysMs = validatedRetry?.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  // 'api.call' 발행 계층 — createTossEvents 산출물이 아니면 null(발행 no-op)
  const emit = getInternalEmit<TossEventMap>(options.events);

  /**
   * audit 기록 — fire-and-forget(협상 불가): await하지 않고 sync throw·async rejection
   * 모두 catch → onSinkError. audit 오류가 결제 요청의 지연·실패에 영향을 주는 경로가 없다.
   */
  const recordAudit = (entry: AuditEntry): void => {
    if (audit === undefined) return;
    const notifySinkError = (cause: unknown): void => {
      try {
        audit.onSinkError?.(cause, entry);
      } catch {
        // onSinkError의 throw도 삼킨다
      }
    };
    try {
      void Promise.resolve(audit.sink.record(entry)).then(undefined, notifySinkError);
    } catch (cause) {
      notifySinkError(cause);
    }
  };

  /** 단일 시도 — 인증/타임아웃(시도별 독립)/에러 분류 소유. 기존 request() 본문과 동일. */
  const attemptOnce = async (init: TossHttpInit): Promise<AttemptResult> => {
    const requestTimeoutMs = Math.max(timeoutMs, init.timeoutMs ?? 0);
    if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      return {
        result: err({
          source: 'network',
          code: 'NETWORK_ERROR',
          retryable: true,
          cause: new TypeError('요청 timeoutMs는 0보다 큰 안전한 정수여야 합니다.'),
        }),
      };
    }
    const timeout = AbortSignal.timeout(requestTimeoutMs);
    const signal = init.signal === undefined ? timeout : combineSignals(timeout, init.signal);

    const headers: Record<string, string> = { Authorization: authorization };
    if (init.bodyJson !== undefined) headers['Content-Type'] = 'application/json';
    if (init.idempotencyKey !== undefined) headers['Idempotency-Key'] = init.idempotencyKey;
    if (init.testCode !== undefined) headers['TossPayments-Test-Code'] = init.testCode;

    const transportErr = (cause: unknown): AttemptResult => ({
      result: err({
        source: 'network',
        code: timeout.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
        retryable: true,
        cause,
      }),
    });

    let response: Response;
    try {
      response = await fetchImpl(baseUrl + init.path, {
        method: init.method,
        headers,
        ...(init.bodyJson !== undefined ? { body: init.bodyJson } : {}),
        signal,
      });
    } catch (cause) {
      return transportErr(cause);
    }

    const traceId = response.headers.get('x-tosspayments-trace-id');

    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      return transportErr(cause);
    }

    let data: unknown = null;
    let parseFailed = false;
    if (text.length > 0) {
      try {
        data = JSON.parse(text);
      } catch {
        parseFailed = true;
      }
    }

    if (!response.ok) {
      // 에러 응답 {code, message} 원문 무손실 보존
      const body =
        typeof data === 'object' && data !== null
          ? (data as { readonly code?: unknown; readonly message?: unknown })
          : {};
      if (typeof body.code !== 'string') {
        // 비-2xx인데 토스 에러 형식({code, message})이 아님 — 게이트웨이/프록시/LB 응답
        // (502 HTML, 504 빈 body 등). 진짜 토스 에러는 항상 {code, message} JSON이므로
        // source:'toss'로 오분류하면 retryable:false 각인 + cancel의 retry 티켓 미발급
        // (응답 유실 복구 구멍)이 된다 — 전송 계층 이상으로 분류한다.
        return transportErr(
          new Error(`비-2xx 비토스 형식 응답: HTTP ${response.status}, body: ${text.slice(0, 200)}`),
        );
      }
      const code = body.code;
      const message = typeof body.message === 'string' ? body.message : text;
      const classified = classifyTossErrorCode(code);
      return {
        result: err({
          source: 'toss',
          code,
          message,
          httpStatus: response.status,
          category: classified.category,
          retryable: classified.retryable,
          traceId,
        }),
      };
    }

    if (parseFailed) {
      // 2xx인데 본문이 JSON이 아님 — 프록시 응답 등 전송 계층 이상으로 분류
      return transportErr(new Error(`2xx 응답 본문 JSON 파싱 실패: ${text.slice(0, 200)}`));
    }
    return { result: ok(data), okMeta: { httpStatus: response.status, traceId } };
  };

  /** (내부) 시도 산출 → AuditEntry.outcome. 실패 메타는 에러 값이 이미 보유한다. */
  const auditOutcomeOf = (attempt: AttemptResult): AuditEntry['outcome'] => {
    if (attempt.result.ok) {
      return {
        kind: 'ok',
        // okMeta는 result.ok일 때 항상 동반 생성된다 — ?? 0은 타입 좁힘용 도달 불가 폴백
        httpStatus: attempt.okMeta?.httpStatus ?? 0,
        responseBody: redactForAudit(attempt.result.value),
      };
    }
    const failure = attempt.result.error;
    if (failure.source === 'toss') {
      return {
        kind: 'toss-error',
        httpStatus: failure.httpStatus,
        code: failure.code,
        message: failure.message,
      };
    }
    return { kind: 'transport', code: failure.code };
  };

  return {
    async request(init) {
      // AuditEntry.path / onRetry.path / 'api.call'.path — pathname만(쿼리 미포함).
      // auditPath가 있으면 그것만 쓴다 — 민감 세그먼트(빌링키) 치환본이며, 실제 전송
      // 경로(attemptOnce의 init.path)에는 손대지 않는다.
      const path = init.auditPath ?? init.path.split('?')[0] ?? init.path;
      const requestStartedAt = Date.now();

      // 요청 body는 시도 간 바이트 동일 — redaction 통과본을 1회만 계산해 재사용
      let auditRequestBody: unknown = null;
      if (audit !== undefined && init.bodyJson !== undefined) {
        try {
          auditRequestBody = redactForAudit(JSON.parse(init.bodyJson));
        } catch {
          auditRequestBody = null; // 라이브러리가 직렬화한 body라 도달 불가 — 방어적 폴백
        }
      }

      let attempt = 0;
      let last: AttemptResult;
      for (;;) {
        attempt += 1;
        const attemptAt = new Date().toISOString();
        const attemptStartedAt = Date.now();
        last = await attemptOnce(init);

        if (audit !== undefined) {
          recordAudit({
            id: globalThis.crypto.randomUUID(),
            at: attemptAt,
            env,
            method: init.method,
            path,
            attempt,
            idempotencyKey: init.idempotencyKey ?? null,
            requestBody: auditRequestBody,
            durationMs: Date.now() - attemptStartedAt,
            traceId: last.result.ok
              ? (last.okMeta?.traceId ?? null)
              : last.result.error.source === 'toss'
                ? last.result.error.traceId
                : null,
            outcome: auditOutcomeOf(last),
          });
        }

        const reason = retryReasonOf(init, last.result);
        // 호출자 abort 시 즉시 중단(대기 진입 전) — 마지막 실패를 원형 그대로 반환
        if (reason === null || attempt >= maxAttempts || isAborted(init.signal)) break;

        const baseDelay = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
        const nextDelayMs = applyJitter(baseDelay);
        try {
          retry?.onRetry?.({ attempt, reason, nextDelayMs, path });
        } catch {
          // 관측 콜백의 throw는 요청에 무간섭 — 삼킨다
        }
        await sleep(nextDelayMs, init.signal);
        // 대기 중 abort → 새 시도 없이 즉시 중단, 마지막 실패 원형 반환
        if (isAborted(init.signal)) break;
      }

      // 'api.call' — 논리 요청당 최종 1회(attempts 집계). Result 확정 후 fire-and-forget,
      // 핸들러 격리는 이미터가 소유 — 이 발화가 반환값을 바꾸는 경로는 없다.
      if (emit !== null) {
        const finalResult = last.result;
        emit.emit('api.call', {
          method: init.method,
          path,
          outcome: finalResult.ok
            ? 'ok'
            : finalResult.error.source === 'toss'
              ? 'toss-error'
              : 'transport',
          httpStatus: finalResult.ok
            ? (last.okMeta?.httpStatus ?? null)
            : finalResult.error.source === 'toss'
              ? finalResult.error.httpStatus
              : null,
          durationMs: Date.now() - requestStartedAt,
          traceId: finalResult.ok
            ? (last.okMeta?.traceId ?? null)
            : finalResult.error.source === 'toss'
              ? finalResult.error.traceId
              : null,
          attempts: attempt,
        });
      }

      return last.result;
    },
  };
}

/**
 * 오버로드로 키 종류가 각인된다 — 위젯 상점의 confirm은 gsk 필수(키 쌍 규칙, 불일치 시
 * INVALID_API_KEY — 400인 점 주의). 빌링 플로우는 'api' KeyKind만 받는다.
 */
export function createTossClient<E extends Env>(
  key: ApiSecretKey<E>,
  options?: TossClientOptions,
): TossServerClient<E, 'api'>;
export function createTossClient<E extends Env>(
  key: WidgetSecretKey<E>,
  options?: TossClientOptions,
): TossServerClient<E, 'widget'>;
export function createTossClient(
  key: string,
  options: TossClientOptions = {},
): TossServerClient<Env, KeyKind> {
  const env: Env = key.startsWith('live_') ? 'live' : 'test';
  const keyKind: KeyKind =
    key.startsWith('test_gsk_') || key.startsWith('live_gsk_') ? 'widget' : 'api';
  const http = createHttp(key, env, options);

  const lookup = async (path: string, signal: AbortSignal | undefined) => {
    const r = await http.request({ method: 'GET', path, signal });
    // 2xx라도 빈 body/비객체 JSON이면 '빈 Payment' 제조 금지 — 가드 통과 후에만 Ok
    return r.ok ? parsePaymentChecked(r.value) : r;
  };

  const client: TossServerClient<Env, KeyKind> = {
    env,
    keyKind,
    getPayment: (paymentKey, callOptions) =>
      lookup(`/v1/payments/${encodeURIComponent(paymentKey)}`, callOptions?.signal),
    getPaymentByOrderId: (orderId, callOptions) =>
      lookup(`/v1/payments/orders/${encodeURIComponent(orderId)}`, callOptions?.signal),
    // §3.3 'cancel.executed'/'cancel.failed' 발행 배선 — createTossEvents 산출물이 아니면
    // null(발행 no-op). 파사드는 events를 client 옵션으로 병합 주입하므로 자동 커버된다.
    cancels: createCancels(
      http,
      getInternalEmit<TossEventMap>(options.events),
      options.cancelRetries,
    ),
  };
  Object.defineProperty(client, internalHttp, { value: http, enumerable: false });
  return client;
}
