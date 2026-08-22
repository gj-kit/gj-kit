# @gj-kit/toss-payments — 최종 공개 API 표면 (Phase 1 합성 결과)

> 설계안 3개(TypeSafetyFirst / DXFirst / MinimalSurface) + judge 3건(오용 공격 / 실사용 DX / 문서·실측 정합)을 합성한 확정 표면.
> 권위 순서: `docs/research/toss-payments-v2.md`의 **Phase 0 확인 결과(실측)** > 공식 문서 > 설계안.
> `prompts/toss-payments.md`의 타협 불가 요구는 전부 반영되었다.

---

## 1. 설계 철학과 채택 출처

**골격 = TypeSafetyFirst.** judge 3건 중 2건(오용 공격, 문서·실측 정합)에서 1위, misusePrevention·docFidelity 합산 최고점. "검증을 통과한 증거 = 브랜디드 타입, 검증 생략 = 컴파일 에러"라는 핵심 가치에 가장 충실하다. 다만 judge들이 공통 지적한 DX 비용(취소 4단계, 프레임워크 글루 부재, WeakMap 봉인의 직렬화 함정)은 DXFirst·MinimalSurface의 mustAdopt로 교체했다.

### 채택 맵

| 출처 | 채택한 것 |
|---|---|
| **TypeSafetyFirst** (골격) | 단일 비공개 `unique symbol` 브랜드 체계(값·타입 모두 미export) / secret key 파서의 `./server` 전용 격리 / `CustomerKey`(≤300) + `WidgetCustomerKey`(≤50) 서브타입 분리 / `testCode`의 비분배 조건부 `[E] extends ['test']` / 서버 클라이언트의 ApiSecretKey·WidgetSecretKey 이중 수용(KeyKind 각인) — 위젯 confirm에 gsk 필요(3안 중 유일 정합) / 멱등키를 **실행 전에 body와 함께 봉인**하는 구조(단, 공개 표면은 4단계가 아닌 3단계 + 실패 시 RetryTicket으로 재구성) / `AuthKeyReceived`·`BillingProfile` typestate 체인 / OrderId 보수적 문자 집합(`=` 거부, 근거 TSDoc) / 웹훅 봉투 3종 구조 판별 + `parseTossTimestamp` 3형식 파서 |
| **DXFirst** | `confirmCallback` 원스톱 헬퍼(검증 생략이 아닌 내장) / 웹훅 `fetchHandler`(Next.js·Hono) + `nodeHandler`(Express) 어댑터 — raw body·dedupe·10초 200 규약을 라이브러리가 소유(+ waitUntil 미제공 감지 경고) / `Unverified.refetch(client)` 한 줄 재확인 / 금지 필드 `?: never` 차단(초과 프로퍼티 검사보다 강함) / `createOrder` + `OrderStore.save` — 금액 단일 진실 공급원을 저장 시점에 고정(prompts의 saveOrder/loadOrder 의도 정합) / 에러 `source` 판별자('library'/'toss'/'network') / API별 에러 코드 리터럴 유니언 / `orThrow` 부팅 전용 탈출구(자유 함수형으로 변형) / 취소 유니언 미내로잉 호출 차단(오버로드) |
| **MinimalSurface** | Result = plain 판별 유니언 + 자유 함수(메서드 클래스 금지 — 직렬화 안전) / `Payment.raw: unknown` 탈출구 / `UNKNOWN` 이벤트 전방 호환 래퍼 / dedupe 원자적 단일 메서드(`claim`) / duplicate를 Err가 아닌 정상 verdict variant로(judge 지적으로 수정: MinimalSurface는 Err였음 — DXFirst의 verdict 방식 채택) / 검증 함수의 파라미터 강제(스토어가 인자 — 조건부 클라이언트 타입 회피) |

### judge topIssues / mustAvoid 해소 확인

- ~~파서 없는 템플릿 리터럴 키 + as 캐스팅 골든패스~~(MinimalSurface) → 키 4종 전부 브랜드 + parse 스마트 생성자. 예제·README에서 `as` 금지.
- ~~분배형 `M extends 'test'`~~(MinimalSurface) → 비분배 `[E] extends ['test']`.
- ~~seen/markSeen 2단계 dedupe~~(DXFirst) → 원자적 `claim(id): Promise<boolean>` 단일 메서드.
- ~~멱등키를 성공 outcome에만 에코~~(DXFirst/MinimalSurface) → 실패(transport) 시에도 봉인된 `CancelRetryTicket`으로 반환 — 재시도가 자동으로 같은 키+같은 body를 재사용.
- ~~WeakMap 봉인의 스프레드/직렬화/재수화 함정~~(TypeSafetyFirst) → 비공개 심볼 필드(비열거) + 봉인 소실 시 **명시적 런타임 Err(`profile-detached`) + 재수화 API(`billing.load`)** 안내.
- ~~CancelPlan/executeCancel 공개 4단계~~(TypeSafetyFirst) → 공개 표면은 3단계(조회→asCancelable→cancelFully/cancelPartially). 봉인은 내부화, 실패 시에만 RetryTicket으로 표면화.
- ~~recheckHint 생문자열 이중 단언~~(TypeSafetyFirst) → `refetch(client)` 메서드.
- ~~서버 클라이언트의 gsk 배제~~(DXFirst/MinimalSurface) → 오버로드 이중 수용.
- ~~DUPLICATE를 Err로~~(MinimalSurface) → 정상 verdict variant.
- ~~orderId에 `=` 허용(합집합)~~(DXFirst) → 보수적 교집합 `^[A-Za-z0-9_-]{6,64}$` (빌링 승인 orderId 규격과 충돌 회피, 근거 TSDoc).
- ~~ConfirmErrorCode에 PAY_PROCESS_ABORTED 누락~~(TypeSafetyFirst) → 포함.
- ~~widget setAmount currency 'KRW' 고정~~(MinimalSurface) → `'KRW' | 'USD' | 'JPY'`.
- ~~PendingMethodPayment status 과잉 협착~~(TypeSafetyFirst) → method:null 변형의 status는 전체 유니언 유지(미검증 불변식 배제).
- ~~Payment 수단 상세 타입 생략~~(MinimalSurface) → easyPay/transfer/mobilePhone/giftCertificate 전부 정의 + `raw` 병행.
- ~~requestBillingAuth 래퍼 v1 제외~~(MinimalSurface) → 포함(결제창 전체 래퍼는 남은 결정 §7).
- ~~expectedAmount에 서버 balanceAmount 되돌려 넣는 항진식 예제~~ → 모든 예제에서 기대 금액은 호출자 장부(자체 DB)에서 온다.
- ~~waitUntil 가드 없는 즉시 200 + 백그라운드~~(DXFirst) → 런타임 감지 + 경고 + 동기 완료 폴백 옵션.

---

## 2. 모듈 구조와 exports 맵

```
toss-payments/                        # @gj-kit/toss-payments
├─ package.json                       # sideEffects: false, ESM+CJS (tsup)
│    peerDependencies: { "@tosspayments/tosspayments-sdk": "^2" }  (browser 전용, peerDependenciesMeta.optional)
└─ src/
   ├─ core/                           # "." — 환경 중립, 시크릿 키를 다루는 심볼 없음
   │  ├─ brand.ts                     # (비공개) declare const brand: unique symbol — 어떤 엔트리에서도 재export 금지
   │  ├─ result.ts                    # Result<T,E> plain 유니언 + 자유 함수 콤비네이터
   │  ├─ keys.ts                      # 키 4종 템플릿 리터럴+브랜드+EnvTag / client key 파서만 export
   │  ├─ ids.ts                       # OrderId/CustomerKey/WidgetCustomerKey/... 스마트 생성자
   │  ├─ payment.ts                   # Payment 판별 유니언(한글 method), 상태 가드
   │  └─ errors.ts                    # TossError(source 판별) + ErrorCategory + 코드 테이블
   ├─ server/                         # "./server" — Node 전용. core 전체 재export
   │  ├─ keys.ts                      # secret key 파서 (이 엔트리에서만 export)
   │  ├─ client.ts                    # createTossClient (Basic 인증 내부 캡슐화)
   │  ├─ confirm.ts                   # parseSuccessCallback / parseFailCallback / createConfirmFlow
   │  ├─ cancel.ts                    # asCancelable / cancels 네임스페이스
   │  ├─ billing.ts                   # parseBillingAuthCallback / confirmPendingAuth / createBillingFlow
   │  └─ stores.ts                    # OrderStore / BillingKeyStore
   ├─ webhook/                        # "./webhook" — 서버 전용(HMAC은 WebCrypto — Edge 호환)
   │  ├─ verifier.ts                  # createWebhookVerifier — verify(rawBody, headers)
   │  ├─ envelope.ts                  # 봉투 3종 구조 판별 파서
   │  ├─ events.ts                    # 이벤트 타입 + 신뢰 3등급
   │  └─ adapters.ts                  # fetchHandler / nodeHandler
   ├─ browser/                        # "./browser" — @tosspayments/tosspayments-sdk peer
   │  ├─ widgets.ts                   # loadWidgets 3단계 typestate
   │  └─ billing-auth.ts              # requestBillingAuth (CARD|TRANSFER 판별 유니언)
   └─ testing/                        # "./testing" — 웹훅 픽스처 + 인메모리 스토어 + 표준 테스트 카드
```

```jsonc
// package.json exports
{
  ".":         { "types": "./dist/index.d.ts",   "import": "./dist/index.js",   "require": "./dist/index.cjs" },
  "./server":  { "types": "./dist/server.d.ts",  "node": "./dist/server.js",
                 "import": "./dist/server.js",   "require": "./dist/server.cjs" },
  "./webhook": { "types": "./dist/webhook.d.ts", "import": "./dist/webhook.js", "require": "./dist/webhook.cjs" },
  "./browser": { "types": "./dist/browser.d.ts", "browser": "./dist/browser.js",
                 "import": "./dist/browser.js",  "require": "./dist/browser.cjs" },
  "./testing": { "types": "./dist/testing.d.ts", "import": "./dist/testing.js", "require": "./dist/testing.cjs" }
}
```

**격리 규칙 (구조적 시크릿 키 차단):**
- `parseApiSecretKey`/`parseWidgetSecretKey`는 `"./server"`에서만 export. 브랜드 심볼이 비공개이므로 **브라우저 번들에서 `ApiSecretKey` 타입의 값을 만들 방법 자체가 없다** (파서 부재 + 브랜드 비공개 + `as` 없이는 제조 불가).
- `"."` 루트는 타입·Result·스마트 생성자·client key 파서만 — 클라이언트 번들에 섞여도 무해.
- `"./server"`는 `node` 조건 우선 — 번들러가 브라우저 타깃에서 끌어가면 resolve 실패로 조기 발각.
- Basic 인증 문자열 생성(`base64(secretKey + ":")`, 콜론 필수, BOM 금지)은 내부 캡슐화 — 공개 API 없음.

> 주: prompts의 산출물 명세는 subpath를 `/server`, `/browser` 2종으로 적었다. `/webhook`(Edge 런타임에서 서버 클라이언트 없이 사용)과 `/testing`(실수신 불가 대응)은 3안 중 2안 + judge mustAdopt에 근거해 추가했다 — §7 남은 결정 6에서 확정 필요.

---

## 3. 플로우별 공개 시그니처 + 사용 예제 + 오용 차단

표기: `Brand<Name>`은 비공개 `unique symbol` 팬텀 필드다. `declare`된 심볼로만 존재하며 값·심볼 모두 export되지 않는다.

```ts
// src/core/brand.ts — 패키지 외부로 절대 export되지 않는다
declare const brand: unique symbol;
type Brand<Name extends string> = { readonly [brand]: Name };
```

### 3.1 confirm — parse → verify(OrderStore) → confirm (+ 원스톱)

```ts
// ─── "./server" ───────────────────────────────────────────────

/** 프레임워크 무관 콜백 입력 — Next.js req.url, Express req.query, Hono c.req.url, URL 전부 수용 */
export type CallbackQueryInput =
  | string | URL | URLSearchParams
  | Readonly<Record<string, string | readonly string[] | undefined>>;

/** successUrl 쿼리의 유일한 파싱 결과 — confirm은 이 타입을 받지 않는다 */
export interface UnverifiedCallback extends Brand<'UnverifiedCallback'> {
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly amount: number;                       // 쿼리 문자열 → number 변환·검증 완료
  readonly paymentType: 'NORMAL' | 'BILLING' | 'BRANDPAY' | null;  // 문서 간 불일치 — 옵셔널 파싱
  readonly receivedAt: Date;                     // 10분 승인 시한 판정 기준
}
export function parseSuccessCallback(
  input: CallbackQueryInput,
  options?: { readonly receivedAt?: Date }       // 기본 now
): Result<UnverifiedCallback, CallbackParseError>;

/** failUrl 파싱 — 사용자 취소는 에러가 아닌 별도 variant */
export type FailCallbackResult =
  | { readonly kind: 'user-canceled'; readonly code: 'PAY_PROCESS_CANCELED' | 'USER_CANCEL'; readonly orderId: OrderId | null }
  | { readonly kind: 'failed'; readonly code: string; readonly message: string; readonly orderId: OrderId | null };
export function parseFailCallback(input: CallbackQueryInput): Result<FailCallbackResult, CallbackParseError>;

export interface CallbackParseError {
  readonly source: 'library'; readonly kind: 'callback-parse';
  readonly missing: readonly string[];
  readonly reason: 'missing-param' | 'bad-amount' | 'bad-order-id';
}

/** 금액 비교의 원본 — save/load 양쪽 강제 (prompts: saveOrder/loadOrder).
 *  createOrder가 save를 호출하므로 '저장을 잊는' 실수가 플로우 안에서 불가능해진다. */
export interface OrderStore {
  saveOrder(order: StoredOrder): Promise<void>;
  loadOrder(orderId: OrderId): Promise<StoredOrder | null>;
}
export interface StoredOrder {
  readonly orderId: OrderId;
  readonly amount: number;                       // requestPayment 시점에 고정한 금액 — 단일 진실 공급원
  readonly currency: 'KRW' | 'USD' | 'JPY';
  readonly orderName: string;
  readonly createdAt: string;                    // ISO 8601
}

export interface ConfirmFlowOptions {
  /** 기본 10분(Phase 0 확정: 인증 완료 후 10분, 초과 시 EXPIRED → confirm은 404 NOT_FOUND_PAYMENT_SESSION·재시도 불가).
   *  30분은 결제창(READY→인증) 시한으로 별개 — 라이브러리 통제 밖 (TSDoc에 관계 명시). */
  readonly approvalWindowMs?: number;
  readonly clock?: () => Date;
}

export function createConfirmFlow<E extends Env>(
  client: TossServerClient<E, KeyKind>,          // 위젯 상점은 WidgetSecretKey 클라이언트로 생성 (키 쌍 규칙)
  store: OrderStore,                             // 필수 위치 인자 — 없으면 플로우 생성 자체가 불가
  options?: ConfirmFlowOptions
): ConfirmFlow<E>;

export interface ConfirmFlow<E extends Env> {
  /** 검증 + store.saveOrder까지 완료된 뒤에만 Ok — 금액을 저장 시점에 고정 */
  createOrder(input: {
    amount: number;
    orderName: string;                           // ≤100자 precheck
    orderId?: OrderId;                           // 생략 시 generateOrderId()
    currency?: 'KRW' | 'USD' | 'JPY';            // 기본 'KRW'
  }): Promise<Result<PendingOrder, CreateOrderError>>;

  /** 저장 주문 로드 → amount 일치 → 시한 검증. 통과해야만 VerifiedCheckout */
  verify(callback: UnverifiedCallback): Promise<Result<VerifiedCheckout, VerifyCheckoutError>>;

  /** VerifiedCheckout만 받는다 — UnverifiedCallback은 컴파일 에러. Idempotency-Key 일급 옵션 */
  confirm(checkout: VerifiedCheckout, options?: CallOptions<E>): Promise<Result<ConfirmedPayment, ConfirmError>>;

  /** 원스톱: parse → verify → confirm. 검증을 생략이 아니라 내장 — 단계별 에러가 union으로 구분됨.
   *  README는 명시적 3단계를 먼저 보여준다 (judge 지시). */
  confirmCallback(input: CallbackQueryInput, options?: CallOptions<E>):
    Promise<Result<ConfirmedPayment, CallbackParseError | VerifyCheckoutError | ConfirmError>>;
}

export interface PendingOrder extends StoredOrder, Brand<'PendingOrder'> {
  /** 브라우저로 넘길 직렬화 페이로드 — 위젯 requestPayment 입력과 필드명 일치 */
  toClientProps(): { orderId: string; amount: number; orderName: string; currency: string };
}
export type CreateOrderError =
  | { readonly source: 'library'; readonly kind: 'invalid-input'; readonly field: string; readonly reason: string }
  | { readonly source: 'library'; readonly kind: 'store-failure'; readonly operation: 'save'; readonly cause: unknown };

export interface VerifiedCheckout extends Brand<'VerifiedCheckout'> {
  readonly paymentKey: PaymentKey;
  readonly orderId: OrderId;
  readonly amount: number;
  readonly verifiedAt: Date;
  readonly approvalDeadline: Date;               // receivedAt + approvalWindowMs — UI 시한 안내용
}

export type VerifyCheckoutError =
  | { readonly source: 'library'; readonly kind: 'order-not-found'; readonly orderId: OrderId }
  | { readonly source: 'library'; readonly kind: 'amount-mismatch';                      // 문서 "반드시 확인하세요"의 강제 지점
      readonly orderId: OrderId; readonly expected: number; readonly received: number }
  | { readonly source: 'library'; readonly kind: 'approval-window-exceeded'; readonly deadline: Date; readonly now: Date }
  | { readonly source: 'library'; readonly kind: 'store-failure'; readonly operation: 'load'; readonly cause: unknown };

/** 가상계좌 confirm은 DONE이 아니다 — WAITING_FOR_DEPOSIT 포함 (docFidelity judge mustAdopt) */
export type ConfirmedPayment = Payment & { readonly status: 'DONE' | 'WAITING_FOR_DEPOSIT' };
export type ConfirmError =
  | TossApiFailure<ConfirmErrorCode>
  | TransportFailure
  | { readonly source: 'library'; readonly kind: 'approval-window-exceeded'; readonly deadline: Date; readonly now: Date };
```

#### 사용 예제 — Next.js App Router

```ts
// lib/toss.ts — 부팅 시 1회. orThrow는 부팅 설정 파싱 전용 탈출구(자유 함수)
import { orThrow } from '@gj-kit/toss-payments';
import { parseApiSecretKey, createTossClient, createConfirmFlow, type OrderStore } from '@gj-kit/toss-payments/server';

const client = createTossClient(orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)));
const orders: OrderStore = {
  saveOrder: async (o) => { await db.tossOrder.create({ data: o }); },
  loadOrder: (id) => db.tossOrder.findUnique({ where: { orderId: id } }),
};
export const confirmFlow = createConfirmFlow(client, orders);
```

```ts
// app/api/checkout/route.ts — 주문 생성 (금액 고정 + 저장이 한 호출)
export async function POST(req: Request) {
  const { planId } = await req.json();
  const order = await confirmFlow.createOrder({ amount: priceOf(planId), orderName: '프리미엄 플랜' });
  if (!order.ok) return Response.json(order.error, { status: 400 });
  return Response.json(order.value.toClientProps());
}
```

```ts
// app/api/payments/confirm/route.ts — successUrl 콜백. 명시적 3단계 (원스톱은 아래)
import { isErr, generateIdempotencyKey } from '@gj-kit/toss-payments';
import { parseSuccessCallback } from '@gj-kit/toss-payments/server';
import { confirmFlow } from '@/lib/toss';

export async function GET(req: Request) {
  const parsed = parseSuccessCallback(req.url);
  if (isErr(parsed)) return new Response('bad callback', { status: 400 });

  const verified = await confirmFlow.verify(parsed.value);          // 금액 대조 + 10분 시한
  if (isErr(verified)) {
    if (verified.error.kind === 'amount-mismatch') alertFraud(verified.error);   // 금액 변조 시도
    return Response.redirect(new URL('/checkout/fail', req.url));
  }

  const done = await confirmFlow.confirm(verified.value, { idempotencyKey: generateIdempotencyKey() });
  if (isErr(done)) {
    if (done.error.source === 'toss' && done.error.retryable) return new Response(null, { status: 503 });
    return Response.redirect(new URL('/checkout/fail', req.url));   // DEADLINE(404)은 결제 재요청 안내
  }
  // 가상계좌면 secret 저장 (DEPOSIT_CALLBACK 웹훅 검증 원본)
  if (done.value.method === '가상계좌') await db.deposits.save(done.value.orderId, done.value.secret);
  return Response.redirect(new URL(`/orders/${done.value.orderId}/complete`, req.url));
}

// 동일한 강제를 내장한 원스톱 (검증이 생략되는 게 아니라 흡수됨):
// const result = await confirmFlow.confirmCallback(req.url);
```

#### 오용 = 컴파일 에러

```ts
declare const unverified: UnverifiedCallback;
declare const flow: ConfirmFlow<'test'>;
// @ts-expect-error 검증 안 된 콜백을 confirm에 직접 — VerifiedCheckout만 허용
flow.confirm(unverified);
// @ts-expect-error VerifiedCheckout 수제 조립 — 브랜드 심볼이 비공개라 충족 불가
flow.confirm({ paymentKey: pk, orderId: oid, amount: 1000, verifiedAt: new Date(), approvalDeadline: new Date() });
// @ts-expect-error OrderStore 없이 플로우 생성 불가 — 금액 비교 원본 강제
createConfirmFlow(client);
```

### 3.2 cancel — 조회 → asCancelable → 실행 (3단계 강제 + 실패 시 재시도 티켓)

```ts
// ─── "./server" ───────────────────────────────────────────────

/** asCancelable을 통과해야만 얻는 3-변형 판별 유니언. paymentKey 문자열로 바로 취소하는 API는 존재하지 않는다.
 *  취소 가능 상태 DONE|PARTIAL_CANCELED|WAITING_FOR_DEPOSIT는 비공식 유도 — 흐름도+서술 근거를 TSDoc에 명시. */
export type CancelablePayment = SettledCancelable | DepositedVaCancelable | AwaitingDepositCancelable;

export interface SettledCancelable extends Brand<'Cancelable'> {
  readonly kind: 'settled';                      // DONE|PARTIAL_CANCELED, 가상계좌 아님
  readonly payment: Exclude<Payment, VirtualAccountPayment> & { readonly status: 'DONE' | 'PARTIAL_CANCELED' };
  readonly balanceAmount: number;                // 조회 시점 서버 잔액 — refundableAmount로 항상 전송됨
}
export interface DepositedVaCancelable extends Brand<'Cancelable'> {
  readonly kind: 'deposited-virtual-account';    // 가상계좌 + 입금 완료 → refundAccount 필수
  readonly payment: VirtualAccountPayment & { readonly status: 'DONE' | 'PARTIAL_CANCELED' };
  readonly balanceAmount: number;
}
export interface AwaitingDepositCancelable extends Brand<'Cancelable'> {
  readonly kind: 'awaiting-deposit';             // WAITING_FOR_DEPOSIT → 전액만 + refundAccount 금지
  readonly payment: Payment & { readonly status: 'WAITING_FOR_DEPOSIT' };
  readonly balanceAmount: number;
}

export function asCancelable(payment: Payment): Result<CancelablePayment, NotCancelableError>;
export type NotCancelableError =
  | { readonly source: 'library'; readonly kind: 'not-cancelable-status';
      readonly status: Exclude<PaymentStatus, 'DONE' | 'PARTIAL_CANCELED' | 'WAITING_FOR_DEPOSIT'> }
  /** balanceAmount === 0 — status가 PARTIAL_CANCELED여도 이미 완전 취소다 (Phase 0 실측) */
  | { readonly source: 'library'; readonly kind: 'already-fully-canceled';
      readonly paymentKey: PaymentKey; readonly status: 'CANCELED' | 'PARTIAL_CANCELED' };

/** 환불 계좌 스마트 생성자 (필드명 bank — bankCode 아님 / accountNumber ≤20 숫자 / holderName ≤60) */
export interface RefundAccount extends Brand<'RefundAccount'> {
  readonly bank: string; readonly accountNumber: string; readonly holderName: string;
}
export function refundAccount(input: { bank: string; accountNumber: string; holderName: string })
  : Result<RefundAccount, InvalidInput<'refundAccount'>>;

export interface CancelOutcome {
  readonly payment: Payment & { readonly status: 'CANCELED' | 'PARTIAL_CANCELED' };  // 전액 취소여도 CANCELED 단정 금지 (실측)
  readonly cancel: CancelTransaction;            // 이번 취소 건
  /** 완전 취소 판정의 유일한 기준: balanceAmount === 0. status로 판정하지 않는다 */
  readonly fullyCanceled: boolean;
  /** cancelStatus === 'IN_PROGRESS' (PayPal 등 해외 비동기) → CANCEL_STATUS_CHANGED 웹훅 대기 */
  readonly pending: boolean;
  readonly idempotencyKey: IdempotencyKey;       // 실제 사용된 키 (자동 생성분 포함)
}

/** transport 실패 시 봉인된 재시도 티켓 — 같은 멱등키 + 같은 body가 각인되어 있다 (TypeSafetyFirst의 CancelPlan을
 *  실패 경로 전용으로 축소). 멱등 판정은 body를 포함하지 않으므로(실측) body 동일성은 이 봉인이 보장한다. */
export interface CancelRetryTicket extends Brand<'CancelRetryTicket'> {
  readonly paymentKey: PaymentKey;
  readonly idempotencyKey: IdempotencyKey;       // 15일 TTL 경계는 TSDoc 문서화
  readonly issuedAt: Date;
}
export type CancelError =
  | TossApiFailure<CancelErrorCode>
  | (TransportFailure & { readonly retry: CancelRetryTicket })   // 응답 유실 — retry로 동일 요청 재실행
  | CancelPreflightError;
export type CancelPreflightError =
  | { readonly source: 'library'; readonly kind: 'amount-exceeds-balance';   // 우회 시 서버: 403 NOT_CANCELABLE_AMOUNT (실측)
      readonly cancelAmount: number; readonly balanceAmount: number }
  | { readonly source: 'library'; readonly kind: 'expected-amount-mismatch'; readonly expected: number; readonly actual: number }
  | { readonly source: 'library'; readonly kind: 'invalid-input'; readonly field: string; readonly reason: string };

export interface TossServerClient<E extends Env = Env, K extends KeyKind = KeyKind> {
  readonly env: E;
  readonly keyKind: K;
  getPayment(key: PaymentKey, options?: Pick<CallOptions<E>, 'signal'>): Promise<Result<Payment, LookupError>>;
  /** DEPOSIT_CALLBACK에는 paymentKey가 없다 — orderId 재조회가 1급 경로 */
  getPaymentByOrderId(orderId: OrderId, options?: Pick<CallOptions<E>, 'signal'>): Promise<Result<Payment, LookupError>>;

  readonly cancels: {
    /**
     * 전액 환불. expectedAmount는 필수이며 **호출자 장부(자체 DB)의 기대 금액**이어야 한다 —
     * 서버 balanceAmount를 되돌려 넣으면 검증이 항진식이 된다 (TSDoc + 예제 경고).
     * 불일치 시 API 호출 전 Err. refundableAmount는 항상 자동 전송(서버 낙관적 잠금).
     * 멱등키 미지정 시 실행 전에 UUID 생성·body와 함께 봉인 — 실패 시 retry 티켓으로 회수.
     * ⚠ 유니언 오버로드 없음 — kind 내로잉 없이는 호출 자체가 컴파일 에러.
     */
    cancelFully(target: SettledCancelable, request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      readonly refundAccount?: never;            // 가상계좌 아님 — 변수/스프레드 경유도 차단
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      readonly cancelRequestId?: CancelRequestId;   // 중국·동남아 비동기(Alipay 등) 취소에만 필수 — 문서 ID 53
    }, options?: CallOptions<E>): Promise<Result<CancelOutcome, CancelError>>;
    cancelFully(target: DepositedVaCancelable, request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      readonly refundAccount: RefundAccount;     // 입금 완료 가상계좌 — 필수
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      readonly cancelRequestId?: CancelRequestId;   // 중국·동남아 비동기(Alipay 등) 취소에만 필수 — 문서 ID 53
    }, options?: CallOptions<E>): Promise<Result<CancelOutcome, CancelError>>;
    cancelFully(target: AwaitingDepositCancelable, request: {
      readonly reason: CancelReason;
      readonly expectedAmount: number;
      readonly refundAccount?: never;            // 입금 전 — 환불할 금액이 없으므로 금지
      readonly cancelRequestId?: CancelRequestId;   // 중국·동남아 비동기(Alipay 등) 취소에만 필수 — 문서 ID 53
    }, options?: CallOptions<E>): Promise<Result<CancelOutcome, CancelError>>;

    /** 부분 환불. AwaitingDepositCancelable 오버로드 없음 → 입금 전 부분취소는 컴파일 에러.
     *  사전검증: amount ≤ balanceAmount (위반 시 API 호출 전 Err). */
    cancelPartially(target: SettledCancelable, request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount?: never;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      readonly cancelRequestId?: CancelRequestId;   // 중국·동남아 비동기(Alipay 등) 취소에만 필수 — 문서 ID 53
    }, options?: CallOptions<E>): Promise<Result<CancelOutcome, CancelError>>;
    cancelPartially(target: DepositedVaCancelable, request: {
      readonly reason: CancelReason;
      readonly amount: number;
      readonly refundAccount: RefundAccount;
      readonly taxFreeAmount?: number;
      readonly currency?: 'KRW' | 'USD' | 'JPY';
      readonly cancelRequestId?: CancelRequestId;   // 중국·동남아 비동기(Alipay 등) 취소에만 필수 — 문서 ID 53
    }, options?: CallOptions<E>): Promise<Result<CancelOutcome, CancelError>>;

    /** transport 실패 티켓 재실행 — 봉인된 동일 멱등키+body. 서버에 도달했었다면 멱등 재생, 아니면 재실행 */
    retry(ticket: CancelRetryTicket, options?: Pick<CallOptions<E>, 'signal'>): Promise<Result<CancelOutcome, CancelError>>;
  };
}
export type LookupError = TossApiFailure<'NOT_FOUND_PAYMENT' | 'UNAUTHORIZED_KEY' | (string & {})> | TransportFailure;
```

#### 사용 예제 — Express

```ts
import { isErr, paymentKey, cancelReason } from '@gj-kit/toss-payments';
import { asCancelable, refundAccount } from '@gj-kit/toss-payments/server';

app.post('/admin/refunds', async (req, res) => {
  const pk = paymentKey(req.body.paymentKey);
  if (isErr(pk)) return res.status(400).json(pk.error);

  const found = await client.getPayment(pk.value);                  // [1] 조회
  if (isErr(found)) return res.status(404).json(found.error);

  const checked = asCancelable(found.value);                        // [2] 상태 검증 → 브랜드 획득
  if (isErr(checked)) return res.status(409).json(checked.error);   //     balanceAmount 0이면 status 무관하게 already-fully-canceled

  const reason = orThrow(cancelReason('고객 요청 환불'));
  const order = await db.orders.byPaymentKey(pk.value);             // 기대 금액은 **우리 장부**에서 — 서버 잔액 아님!

  const c = checked.value;
  const result = c.kind === 'deposited-virtual-account'             // [3] 실행 — kind 내로잉이 컴파일 타임 강제
    ? await client.cancels.cancelFully(c, {
        reason, expectedAmount: order.paidAmount,
        refundAccount: orThrow(refundAccount({ bank: '88', accountNumber: req.body.account, holderName: req.body.holder })),
      })
    : c.kind === 'settled' && req.body.amount != null
    ? await client.cancels.cancelPartially(c, { reason, amount: req.body.amount })
    : await client.cancels.cancelFully(c, { reason, expectedAmount: order.paidAmount });

  if (isErr(result)) {
    if (result.error.source === 'network') {
      await retryQueue.push(result.error.retry);                    // 봉인 티켓 — client.cancels.retry(ticket)로 동일 요청
      return res.status(503).end();
    }
    if (result.error.source === 'toss' && result.error.category === 'CONCURRENCY')
      return res.status(409).json({ hint: '재조회 후 다시 시도' }); // NOT_MATCHES_REFUNDABLE_AMOUNT
    return res.status(422).json(result.error);
  }
  // 완전 취소 판정은 fullyCanceled — status 'CANCELED' 단정 금지 (실측: PARTIAL_CANCELED 유지 사례)
  if (result.value.pending) await markAwaitingCancelWebhook(result.value);   // PayPal IN_PROGRESS
  res.json({ fullyCanceled: result.value.fullyCanceled });
});
```

#### 오용 = 컴파일 에러

```ts
declare const payment: Payment;
declare const some: CancelablePayment;
declare const awaiting: AwaitingDepositCancelable;
declare const vaDeposited: DepositedVaCancelable;
declare const settled: SettledCancelable;
declare const reason: CancelReason;
declare const acct: RefundAccount;
// @ts-expect-error paymentKey 문자열로 바로 취소하는 시그니처는 존재하지 않는다
client.cancels.cancelFully('tviva20260809xxxx', { reason, expectedAmount: 1000 });
// @ts-expect-error 조회한 Payment 그대로는 불가 — asCancelable 검증 통과 필수
client.cancels.cancelFully(payment, { reason, expectedAmount: 1000 });
// @ts-expect-error 유니언 상태로는 호출 불가 — kind 내로잉(가상계좌 분기)을 건너뛸 수 없다
client.cancels.cancelFully(some, { reason, expectedAmount: 1000 });
// @ts-expect-error 입금 전 가상계좌 부분취소 — 해당 오버로드 자체가 없다
client.cancels.cancelPartially(awaiting, { reason, amount: 1000 });
// @ts-expect-error 입금 완료 가상계좌 전액취소에 refundAccount 누락
client.cancels.cancelFully(vaDeposited, { reason, expectedAmount: 10_000 });
// @ts-expect-error 전액 환불에 expectedAmount 누락 — 금액 동일성 검증 생략 불가
client.cancels.cancelFully(settled, { reason });
const viaVar = { reason, expectedAmount: 10_000, refundAccount: acct };
// @ts-expect-error 일반 결제 취소에 refundAccount — ?: never라 변수 경유도 차단 (DXFirst 채택)
client.cancels.cancelFully(settled, viaVar);
```

### 3.3 billing — PendingBillingAuth → confirmPendingAuth → issue → BillingProfile → approve

```ts
// ─── "./server" ───────────────────────────────────────────────

/** successUrl 콜백 파싱 — authKey는 공개 필드가 아니다(비공개 심볼·비열거 내부 보관, 로그/JSON에 새지 않음).
 *  returnedCustomerKey는 위변조 가능한 쿼리 값 — 세션 대조 전까지 plain string. */
export function parseBillingAuthCallback(input: CallbackQueryInput): Result<BillingAuthCallback, CallbackParseError>;

export type BillingAuthCallback =
  | { readonly status: 'authorized'; readonly pending: PendingBillingAuth }
  | { readonly status: 'user-canceled'; readonly code: string }
  | { readonly status: 'failed'; readonly code: string; readonly message: string };

export interface PendingBillingAuth extends Brand<'PendingBillingAuth'> {
  /** 쿼리스트링으로 돌아온 값 — 신뢰 금지. confirmPendingAuth로 세션 값과 대조 전에는 사용 불가 */
  readonly returnedCustomerKey: string;
}

/** 세션에 저장된 customerKey와 대조 — 통과해야만 AuthKeyReceived. 이 단계를 건너뛰고 issue를 호출할 방법이 없다 */
export function confirmPendingAuth(
  pending: PendingBillingAuth,
  expectedCustomerKey: CustomerKey
): Result<AuthKeyReceived, { readonly source: 'library'; readonly kind: 'customer-key-mismatch';
                             readonly expected: string; readonly returned: string }>;   // 값은 마스킹

export interface AuthKeyReceived extends Brand<'AuthKeyReceived'> {
  readonly customerKey: CustomerKey;             // 대조 완료된 **세션 유래** 값 — 콜백 값 아님. authKey는 계속 봉인
}

/** 저장소 필수 주입 — 토스에 빌링키 조회 API가 없다: 저장 실패 = 복구 불가 */
export interface BillingKeyStore {
  /** issue의 idempotencyKey는 operationId로 자동 전달된다. raw credential을 넣지 말 것. */
  save(record: BillingKeyRecord, options?: BillingKeySaveOptions): Promise<void>;
  find(customerKey: CustomerKey): Promise<BillingKeyRecord | null>;
  /**
   * 현재 key가 expected와 같을 때만 DB CAS/transaction 안에서 삭제한다.
   * false = missing/stale이며, find 후 delete 두 호출 구현은 금지.
   */
  delete(request: BillingKeyDeleteRequest): Promise<boolean>;
}

/** Required object shape prevents a legacy delete(customerKey) implementation from structurally matching. */
export interface BillingKeyDeleteRequest {
  readonly customerKey: BillingKeyRecord['customerKey'];
  readonly expectedBillingKey: BillingKeyRecord['billingKey'];
}

export interface BillingKeySaveOptions {
  /** 고객별 발급 시도마다 고유한, 비밀 아닌 lifecycle correlation id. */
  readonly operationId?: string;
}
/** 영속화 경계 — 여기만 raw 쌍이 보인다. billingKey와 customerKey를 같은 로그에 남기지 말 것(TSDoc 경고) */
export interface BillingKeyRecord {
  readonly customerKey: string;
  readonly billingKey: string;
  readonly method: '카드' | '계좌이체';          // 응답 원문 한글 리터럴 (요청 enum CARD/TRANSFER와 비대칭)
  readonly issuedAt: string;                     // authenticatedAt
  readonly card: { readonly issuerCode: string; readonly number: string;
                   readonly cardType: '신용' | '체크' | '기프트' | '미확인';
                   readonly ownerType: '개인' | '법인' | '미확인' } | null;
  readonly transfers: readonly { readonly bankName: string; readonly bankAccountNumber: string }[] | null;  // 배열!
}

export interface BillingCapabilities { readonly directCardIssue?: true }

export function createBillingFlow<E extends Env, C extends BillingCapabilities = {}>(
  client: TossServerClient<E, 'api'>,            // 빌링은 API 개별키 전용 — 위젯 키 클라이언트는 컴파일 에러
  store: BillingKeyStore,
  options?: { readonly capabilities?: C }
): BillingFlow<E, C>;

export type BillingFlow<E extends Env, C extends BillingCapabilities = {}> = BillingFlowBase<E> &
  (C extends { directCardIssue: true }
    ? { /** 추가 계약 필요. 테스트 표준 카드 9410001234567890 (Phase 0 실측 — BIN 6자리 단독은 INVALID_CARD_NUMBER) */
        issueWithCard(input: DirectCardIssueInput, options?: CallOptions<E>): Promise<Result<BillingProfile, IssueBillingKeyError>> }
    : {});                                        // capability 미선언 → 메서드 부재 → 호출은 컴파일 에러

export interface BillingFlowBase<E extends Env> {
  /** POST /v1/billing/authorizations/issue → store.save 성공 후에만 Ok.
   *  저장 실패면 Err에 발급된 record 동봉 — 키 유실 방지(수동 복구용). */
  issue(auth: AuthKeyReceived, options?: CallOptions<E>): Promise<Result<BillingProfile, IssueBillingKeyError>>;
  /** 스토어에서 재수화 — BillingProfile을 얻는 유일한 다른 경로 (스프레드/직렬화로 봉인이 소실된 경우의 복구 API) */
  load(customerKey: CustomerKey): Promise<Result<BillingProfile | null, StoreFailure>>;
  /** BillingOrder에는 customerKey 필드가 없다 — 봉인 쌍으로만 승인 → NOT_MATCHES_CUSTOMER_KEY 구조적 방지.
   *  봉인이 소실된 profile(스프레드 복제본 등)은 런타임 Err('profile-detached') — billing.load로 재수화 안내. */
  approve(profile: BillingProfile, order: BillingOrder, options?: CallOptions<E>): Promise<Result<BillingPayment, BillingApproveError>>;
  /**
   * DELETE /v1/billing/{billingKey} + 조건부 store.delete.
   * false면 remote stale key 처리는 성공했지만 현재 local credential은 건드리지 않았다.
   */
  revoke(profile: BillingProfile, options?: CallOptions<E>): Promise<Result<RevokeBillingKeyOutcome, RevokeBillingKeyError>>;
}

export interface RevokeBillingKeyOutcome {
  readonly currentStoredKeyDeleted: boolean;
}

/** billingKey는 공개 필드·JSON 직렬화·열거 어디에도 노출되지 않는다(비공개 심볼, 비열거).
 *  WeakMap이 아니므로 일반 전달은 안전하지만, 스프레드/직렬화 복제본은 approve에서 명시적 Err. */
export interface BillingProfile extends Brand<'BillingProfile'> {
  readonly customerKey: CustomerKey;
  readonly method: '카드' | '계좌이체';
  readonly maskedSource: string;                 // "433012******890" — 표시용
  readonly issuedAt: string;
}

export interface BillingOrder {                  // customerKey 없음이 핵심
  readonly orderId: OrderId;
  readonly orderName: OrderName;
  readonly amount: number;
  readonly customerEmail?: string;
  readonly customerName?: string;
  readonly customerIp?: string;
  readonly taxFreeAmount?: number;
  readonly taxExemptionAmount?: number;
}

export interface DirectCardIssueInput {
  readonly customerKey: CustomerKey;
  readonly cardNumber: string;
  readonly cardExpirationYear: string;
  readonly cardExpirationMonth: string;
  readonly customerIdentityNumber: string;       // YYMMDD 6자리 or 사업자 10자리
  readonly cardPassword: string;                 // 앞 2자리 — 로그 금지(TSDoc)
  readonly customerName?: string;
  readonly customerEmail?: string;
}

export type BillingPayment = Payment & { readonly type: 'BILLING'; readonly status: 'DONE' };
export interface StoreFailure { readonly source: 'library'; readonly kind: 'store-failure';
                                readonly operation: 'save' | 'find' | 'delete'; readonly cause: unknown; }
/** store-save-failed 동봉용 — billingKey는 봉인(비열거·비공개 심볼): JSON.stringify(error)로도 새지 않는다.
 *  회수는 recoverBillingKeyRecord로만 가능(반환 record는 로그 금지, store.save 재시도 전용). */
export interface SealedBillingKeyRecord extends Omit<BillingKeyRecord, 'billingKey'>, Brand<'SealedBillingKeyRecord'> {}
export function recoverBillingKeyRecord(sealed: SealedBillingKeyRecord)
  : Result<BillingKeyRecord, { readonly source: 'library'; readonly kind: 'record-detached'; readonly customerKey: string }>;

export type IssueBillingKeyError =
  | TossApiFailure<BillingErrorCode> | TransportFailure
  | { readonly source: 'library'; readonly kind: 'store-save-failed'; readonly cause: unknown;
      readonly issuedRecord: SealedBillingKeyRecord }; // 키는 발급됨 — 봉인 동봉(유실 방지 + 로그 유출 방지)
export type BillingApproveError =
  | TossApiFailure<BillingErrorCode> | TransportFailure
  | { readonly source: 'library'; readonly kind: 'profile-detached';   // 봉인 소실 복제본 — load()로 재수화하라
      readonly customerKey: CustomerKey };
export type RevokeBillingKeyError =
  | TossApiFailure<'ALREADY_REMOVED_BILLING_KEY' | (string & {})> | TransportFailure | StoreFailure;
// 참고: '빌링 승인 완료 웹훅'은 존재하지 않는다(BILLING_DELETED만 존재) — approve 반환값 + getPayment 재확인이 완결 신호 (TSDoc + README)
```

#### 사용 예제 — Hono

```ts
import { isErr, customerKey, orderName, generateOrderId, generateIdempotencyKey } from '@gj-kit/toss-payments';
import { parseBillingAuthCallback, confirmPendingAuth, createBillingFlow } from '@gj-kit/toss-payments/server';

const billing = createBillingFlow(client, {
  save: (r, options) => db.billingKeys.upsert(r, options), // 저장이 유일한 보관 수단; operationId도 전달
  find: (ck) => db.billingKeys.find(ck),
  // 반드시 DB 한 문/CAS 또는 잠금 transaction — stale profile이 새 키를 지우지 않게 한다.
  delete: ({ customerKey, expectedBillingKey }) =>
    db.billingKeys.deleteIfCurrentKey(customerKey, expectedBillingKey),
});

// (A) successUrl 콜백: 파싱 → 세션 대조 → 발급(저장까지 보장)
app.get('/billing/callback', async (c) => {
  const parsed = parseBillingAuthCallback(c.req.url);
  if (isErr(parsed)) return c.json(parsed.error, 400);
  if (parsed.value.status !== 'authorized') return c.redirect('/billing/canceled');

  const sessionCk = customerKey(await session.get(c, 'customerKey'));    // 세션 값이 진실
  if (isErr(sessionCk)) return c.json({ error: 'no session' }, 401);

  const auth = confirmPendingAuth(parsed.value.pending, sessionCk.value);
  if (isErr(auth)) return c.json({ error: 'customerKey mismatch' }, 403);  // authKey는 봉인된 채 폐기

  const profile = await billing.issue(auth.value);
  if (isErr(profile)) {
    if (profile.error.kind === 'store-save-failed') {
      // issuedRecord는 billingKey 봉인 상태 — 통째 로깅 안전. 재저장 시에만 회수한다
      const rec = recoverBillingKeyRecord(profile.error.issuedRecord);
      if (rec.ok) await retrySaveLater(rec.value);                       // 수동 복구 (record는 로그 금지)
    }
    return c.json(profile.error, 502);
  }
  return c.redirect('/subscription/active');
});

// (B) 스케줄러 (토스 미제공 — 자체 cron): 재수화 → 승인
async function chargeMonthly(rawCk: string, amount: number) {
  const ck = orThrow(customerKey(rawCk));
  const loaded = await billing.load(ck);
  if (isErr(loaded) || loaded.value === null) return notifyReissueNeeded(ck);

  const paid = await billing.approve(loaded.value, {
    orderId: generateOrderId('sub'),
    orderName: orThrow(orderName('2026년 8월 구독')),
    amount,
  }, { idempotencyKey: orThrow(idempotencyKey(`sub:2026-08:${ck}`)) });   // 이중 과금 방지
  if (isErr(paid) && paid.error.source === 'toss' && paid.error.code === 'ALREADY_REMOVED_BILLING_KEY')
    await requestReauth(ck);                       // 갱신 API 없음 → 재발급 플로우 재시작
  return paid;
}
```

#### 오용 = 컴파일 에러

```ts
declare const pending: PendingBillingAuth;
declare const profile: BillingProfile;
declare const basicFlow: BillingFlow<'test'>;      // capability 미선언
declare const order: BillingOrder;
// @ts-expect-error customerKey 대조(confirmPendingAuth) 전의 PendingBillingAuth로 issue — AuthKeyReceived만 허용
basicFlow.issue(pending);
// @ts-expect-error billingKey 문자열로 직접 승인 — BillingProfile(봉인 쌍)만 허용
basicFlow.approve('bill_abcdef', order);
// @ts-expect-error BillingOrder에 customerKey 끼워넣기 — 필드 자체가 없음 → NOT_MATCHES_CUSTOMER_KEY 원천 봉쇄
basicFlow.approve(profile, { ...order, customerKey: 'other-user' });
// @ts-expect-error 카드 직접 발급은 옵트인 capability — 미선언 플로우에 메서드가 존재하지 않음
basicFlow.issueWithCard(cardInput);
// @ts-expect-error refresh류는 설계상 부재 — 갱신 API가 없음(revoke + 재발급만)
basicFlow.refresh(profile);
// @ts-expect-error 위젯 키 클라이언트로 빌링 플로우 생성 — 'api' KeyKind만 허용
createBillingFlow(widgetKeyClient, store);
```

### 3.4 webhook — verify(rawBody, headers) + 신뢰 3등급 + 어댑터

```ts
// ─── "./webhook" ──────────────────────────────────────────────

export type SecurityKey = string & Brand<'SecurityKey'>;   // 64자 hex — HMAC + JWE 공용
export function parseSecurityKey(raw: string): Result<SecurityKey, KeyParseError>;

/** 원자적 단일 메서드 — seen/markSeen 2단계 금지(judge mustAvoid: TOCTOU).
 *  처음 봤으면 점유 후 true, 이미 봤으면 false. 예: Redis SET NX. */
export interface WebhookDedupeStore {
  claim(transmissionId: string): Promise<boolean>;
}
export interface DepositSecretSource {
  /** 승인 시 저장해 둔 Payment.secret 조회 — DEPOSIT_CALLBACK에는 paymentKey가 없으므로 orderId가 유일한 키 */
  getSecret(orderId: string): Promise<string | null>;
}

export interface WebhookVerifierConfig {
  readonly dedupe: WebhookDedupeStore;                     // 필수 — 재전송 7회 + 가상계좌 이중 이벤트
  readonly securityKeys?: readonly SecurityKey[];          // 키 로테이션(7일 병행) 대비 배열 — 서명×키 중 1개 일치 시 통과
  readonly depositSecrets?: DepositSecretSource;           // 미주입 상태서 DEPOSIT_CALLBACK 수신 → Err missing-config
  readonly allowedSourceIps?: readonly string[] | false;   // 기본: 문서 IP 목록 내장. false = 끔 (Unverified 보조 방어선)
}
export function createWebhookVerifier(config: WebhookVerifierConfig): WebhookVerifier;

export type IncomingHeaders = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

export interface WebhookVerifier {
  /** raw body 강제 — 파싱된 객체를 받는 오버로드는 없다(서명 검증 원천 불가).
   *  봉투 3종(구형 {eventType,data} / 평탄 DEPOSIT_CALLBACK / 신형 {eventId,entityBody})을 내부 구조 판별. */
  verify(rawBody: string | Uint8Array, headers: IncomingHeaders, context?: { readonly sourceIp?: string })
    : Promise<Result<WebhookVerdict, WebhookRejection>>;

  /** Fetch 표준 어댑터(Next.js Route Handler / Hono) — raw body 추출·검증·dedupe·10초 내 200 응답을 소유.
   *  waitUntil 미제공 서버리스 감지 시: 기본은 경고 로그 + **핸들러 동기 완료 후 200** 폴백(이벤트 유실 방지). */
  fetchHandler(handlers: WebhookHandlers, options?: {
    readonly waitUntil?: (p: Promise<unknown>) => void;
    readonly onMissingWaitUntil?: 'sync-complete' | 'warn-and-detach';   // 기본 'sync-complete'
  }): (request: Request) => Promise<Response>;

  /** Express/Node — express.raw({ type: '*/*' }) 뒤에 장착 (JSON 파싱 미들웨어 금지, 스니펫 README) */
  nodeHandler(handlers: WebhookHandlers):
    (req: import('node:http').IncomingMessage & { body?: unknown }, res: import('node:http').ServerResponse) => Promise<void>;
}

/** duplicate는 Err가 아닌 정상 verdict — 200 ack 후 스킵 (400 반환 시 3일 19시간 재전송 폭탄) */
export type WebhookVerdict =
  | { readonly duplicate: false; readonly webhook: AcceptedWebhook }
  | { readonly duplicate: true;  readonly transmissionId: string };

// ── 신뢰 3등급 — '검증됨' 단일 타입은 의도적으로 없다 (토스가 전 이벤트 서명을 제공하지 않음) ──
export type AcceptedWebhook = SignatureVerified | SecretVerified | Unverified;

export interface WebhookMeta { readonly transmissionId: string; readonly transmissionTime: string; readonly retriedCount: number; }

export interface SignatureVerified {             // payout.changed / seller.changed —
  readonly trust: 'signature';                   //   HMAC-SHA256("{payload}:{transmission-time}"), "v1:" 접두사, 콤마 복수 서명
  readonly event: SignedWebhookEvent;
  readonly meta: WebhookMeta;
}
export interface SecretVerified {                // DEPOSIT_CALLBACK — 저장된 Payment.secret 대조 통과
  readonly trust: 'secret';
  readonly event: DepositCallbackEvent;
  readonly meta: WebhookMeta;
}
export interface Unverified {                    // 나머지 전부 — 이름부터 신뢰 금지
  readonly trust: 'unverified';
  readonly event: UnverifiedWebhookEvent;
  readonly meta: WebhookMeta;
  /** 조회 API 재확인 — Unverified를 신뢰 가능한 Payment로 승격하는 유일한 경로 (한 줄, 단언 없음) */
  refetch<E extends Env>(client: Pick<TossServerClient<E>, 'getPayment' | 'getPaymentByOrderId'>)
    : Promise<Result<Payment, LookupError | { readonly source: 'library'; readonly kind: 'no-payment-reference' }>>;
}

export type WebhookRejection =
  | { readonly kind: 'invalid-signature'; readonly signatureCount: number; readonly keysTried: number }
  | { readonly kind: 'secret-mismatch'; readonly orderId: string }             // 위조 의심
  | { readonly kind: 'unknown-order'; readonly orderId: string }               // depositSecrets가 null 반환(승인 시 저장 누락)
  | { readonly kind: 'missing-config'; readonly needed: 'securityKeys' | 'depositSecrets' }
  | { readonly kind: 'untrusted-source-ip'; readonly ip: string }
  | { readonly kind: 'parse-failed'; readonly detail: string }
  | { readonly kind: 'store-failure'; readonly cause: unknown };

/** 핸들러 키 = 구독 가능한 전체 이벤트. onBillingApproved는 존재하지 않는다 — 토스가 그런 웹훅을 제공하지 않음 */
export interface WebhookHandlers {
  onDepositCallback?:           (w: SecretVerified) => void | Promise<void>;
  onPaymentStatusChanged?:      (w: Unverified & { event: PaymentStatusChangedEvent }) => void | Promise<void>;
  onCancelStatusChanged?:       (w: Unverified & { event: CancelStatusChangedEvent }) => void | Promise<void>;   // 해외 간편결제 전용
  onBillingDeleted?:            (w: Unverified & { event: BillingDeletedEvent }) => void | Promise<void>;
  onMethodUpdated?:             (w: Unverified & { event: MethodUpdatedEvent }) => void | Promise<void>;
  onCustomerStatusChanged?:     (w: Unverified & { event: CustomerStatusChangedEvent }) => void | Promise<void>;
  onOrderPaymentStatusChanged?: (w: Unverified & { event: OrderPaymentStatusChangedEvent }) => void | Promise<void>;
  onPayoutChanged?:             (w: SignatureVerified & { event: PayoutChangedEvent }) => void | Promise<void>;
  onSellerChanged?:             (w: SignatureVerified & { event: SellerChangedEvent }) => void | Promise<void>;
  onArsReservationChanged?:     (w: Unverified & { event: ArsReservationChangedEvent }) => void | Promise<void>;
  onUnknownEvent?:              (w: Unverified & { event: UnknownWebhookEvent }) => void | Promise<void>;  // 전방 호환
}

// ── 이벤트 (봉투 3종 → 구조 판별 후 eventType 세분화) ──
export interface PaymentStatusChangedEvent {
  readonly envelope: 'legacy';
  readonly eventType: 'PAYMENT_STATUS_CHANGED';
  readonly createdAt: string;                    // 마이크로초 6자리 형식 — parseTossTimestamp 권장
  readonly data: Payment & { readonly status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED' };
}
export interface CancelStatusChangedEvent {      // PayPal 등 해외 간편결제 전용
  readonly envelope: 'legacy'; readonly eventType: 'CANCEL_STATUS_CHANGED'; readonly createdAt: string;
  /** data는 문서상 'Cancel 객체'(상세 필드는 열린 질문) — paymentKey/orderId는 문서 근거가 없어 nullable.
   *  판별 기준은 cancelStatus만. refetch는 paymentKey→orderId 폴백, 둘 다 없으면 no-payment-reference.
   *  Phase 5 실측(해외결제 취소 웹훅 수신) 후 재협착 예정. */
  readonly data: { readonly paymentKey: string | null; readonly orderId: string | null;
                   readonly cancelStatus: 'IN_PROGRESS' | 'DONE' | 'ABORTED'; readonly cancelRequestId: string | null;
                   readonly transactionKey: string | null };
}
export interface BillingDeletedEvent {
  readonly envelope: 'legacy'; readonly eventType: 'BILLING_DELETED'; readonly createdAt: string;
  readonly data: { readonly billingKey: string; readonly reason: string };
}
export interface MethodUpdatedEvent           { readonly envelope: 'legacy'; readonly eventType: 'METHOD_UPDATED';           readonly createdAt: string; readonly data: { readonly customerKey: string; readonly methodKey: string; readonly status: 'ENABLED' | 'DISABLED' | 'ALIAS_UPDATED' }; }
export interface CustomerStatusChangedEvent   { readonly envelope: 'legacy'; readonly eventType: 'CUSTOMER_STATUS_CHANGED';  readonly createdAt: string; readonly data: { readonly customerKey: string; readonly status: 'CREATED' | 'REMOVED' | 'PASSWORD_CHANGED' | 'ONE_TOUCH_ACTIVATED' | 'ONE_TOUCH_DEACTIVATED'; readonly changedAt: string }; }
export interface OrderPaymentStatusChangedEvent { readonly envelope: 'legacy'; readonly eventType: 'ORDER_PAYMENT_STATUS_CHANGED'; readonly createdAt: string; readonly data: { readonly orderKey: string; readonly amount: number; readonly currency: string; readonly customerName: string | null; readonly customerPhoneNumber: string | null; readonly payment: Payment; readonly orderItems: readonly unknown[] }; }

export interface DepositCallbackEvent {          // 평탄 구조 — 원문에 eventType 없음(파서가 구조 판별 후 합성)
  readonly envelope: 'flat';
  readonly eventType: 'DEPOSIT_CALLBACK';
  readonly createdAt: string;                    // ±hh:mm 오프셋 형식 (구형과 다름)
  readonly orderId: string;                      // ⚠ paymentKey 없음 — orderId가 1급 키
  readonly status: 'WAITING_FOR_DEPOSIT' | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED';
  readonly transactionKey: string;
  // secret은 검증에 소비된 뒤 이벤트에서 제거 — 로그 유출 방지
}

export interface PayoutChangedEvent { readonly envelope: 'v2'; readonly eventType: 'payout.changed'; readonly createdAt: string; readonly eventId: string; readonly entityType: 'payout'; readonly entityBody: unknown; }   // 지급대행은 v1 범위 밖 — 원문 전달
export interface SellerChangedEvent { readonly envelope: 'v2'; readonly eventType: 'seller.changed'; readonly createdAt: string; readonly eventId: string; readonly entityType: 'seller'; readonly entityBody: unknown; }
export interface ArsReservationChangedEvent { readonly envelope: 'v2'; readonly eventType: 'ars-reservation.changed'; readonly createdAt: string; readonly eventId: string; readonly entityType: 'ars-reservation'; readonly entityBody: unknown; }
export interface UnknownWebhookEvent { readonly envelope: 'legacy' | 'v2' | 'flat'; readonly eventType: 'UNKNOWN'; readonly rawEventType: string; readonly createdAt: string | null; readonly raw: unknown; }   // 전방 호환 — 새 이벤트가 와도 verify는 깨지지 않는다

export type SignedWebhookEvent = PayoutChangedEvent | SellerChangedEvent;
export type UnverifiedWebhookEvent =
  | PaymentStatusChangedEvent | CancelStatusChangedEvent | BillingDeletedEvent
  | MethodUpdatedEvent | CustomerStatusChangedEvent | OrderPaymentStatusChangedEvent
  | ArsReservationChangedEvent | UnknownWebhookEvent;

export function parseTossTimestamp(raw: string): Result<Date, { readonly kind: 'bad-timestamp'; readonly raw: string }>;  // 마이크로초/오프셋 3형식 관대 파서
export const TOSS_WEBHOOK_SOURCE_IPS: readonly string[];   // 문서 IP 목록 (갱신 이력 주석)
```

#### 사용 예제 — Next.js Route Handler (어댑터) / Express (수동)

```ts
// app/api/webhooks/toss/route.ts
import { createWebhookVerifier, parseSecurityKey } from '@gj-kit/toss-payments/webhook';
import { orThrow } from '@gj-kit/toss-payments';
import { client } from '@/lib/toss';

const verifier = createWebhookVerifier({
  dedupe: { claim: (id) => redis.set(`twh:${id}`, '1', { NX: true, EX: 432_000 }).then(Boolean) },
  securityKeys: [orThrow(parseSecurityKey(process.env.TOSS_SECURITY_KEY!))],   // 로테이션 시 [새 키, 옛 키]
  depositSecrets: { getSecret: (orderId) => db.deposits.secretOf(orderId) },   // 승인 시 저장한 Payment.secret
});

export const POST = verifier.fetchHandler({
  onDepositCallback: async ({ event }) => {                  // trust: 'secret' — 대조 통과분만 도달
    if (event.status === 'DONE') await fulfillOrder(event.orderId);            // paymentKey 없음 — orderId 기반
    if (event.status === 'WAITING_FOR_DEPOSIT') await revertToAwaiting(event.orderId);  // DONE→WAITING 역전이(입금 오류)
  },
  onPaymentStatusChanged: async (w) => {                     // trust: 'unverified'
    const fresh = await w.refetch(client);                   // 조회 API 재확인 — 한 줄, 단언 없음
    if (fresh.ok) await syncStatus(fresh.value);             // 웹훅 payload가 아닌 조회 결과로 상태 갱신
  },
  // onBillingApproved: ← 이런 키는 타입에 없다. 빌링 승인 웹훅은 존재하지 않는다.
});
// raw body 보존·서명/secret 검증·dedupe·10초 내 200 — 전부 어댑터가 소유.
// Vercel/Lambda에서 waitUntil 미전달 시 기본 폴백: 핸들러 동기 완료 후 200 (이벤트 유실 방지) + 경고 로그.
```

```ts
// Express 수동 배선 — verify 직접 사용
app.post('/webhooks/toss', express.raw({ type: '*/*' }), async (req, res) => {
  const result = await verifier.verify(req.body, req.headers, { sourceIp: req.ip });
  if (!result.ok) return res.status(400).end();
  if (result.value.duplicate) return res.status(200).end();  // 정상 ack — 재전송 중단
  res.status(200).end();                                     // 10초 규약: 즉시 200, 처리는 이후
  await dispatch(result.value.webhook);
});
```

#### 오용 = 컴파일 에러

```ts
declare const verifier: WebhookVerifier;
declare const headers: IncomingHeaders;
// @ts-expect-error 파싱된 객체로 verify — raw body(string|Uint8Array)만 허용 (서명 검증 원천 보장)
verifier.verify(JSON.parse(raw), headers);
// @ts-expect-error dedupe store 없이 verifier 생성 불가 (재전송 7회 + 가상계좌 이중 이벤트)
createWebhookVerifier({ securityKeys: [secKey] });
// @ts-expect-error 빌링 승인 완료 웹훅은 존재하지 않는다 — 핸들러 키 자체가 없음
verifier.fetchHandler({ onBillingApproved: async () => {} });
declare const accepted: AcceptedWebhook;
if (accepted.trust === 'signature') {
  // @ts-expect-error 서명 등급에서 DEPOSIT_CALLBACK 협착 — 서명은 payout/seller에만 존재
  const _: 'DEPOSIT_CALLBACK' = accepted.event.eventType;
}
declare const deposit: DepositCallbackEvent;
// @ts-expect-error DEPOSIT_CALLBACK에는 paymentKey가 없다 — orderId 기반 설계 강제
deposit.paymentKey;
```

### 3.5 browser — 위젯 typestate + 빌링 인증창

```ts
// ─── "./browser" (peerDependency: @tosspayments/tosspayments-sdk ^2) ──

export type Anonymous = Brand<'Anonymous'>;
export const ANONYMOUS: Anonymous;               // SDK ANONYMOUS 재export(브랜딩) — 빌링 API에는 대입 불가 타입

export interface SdkError { readonly kind: 'sdk'; readonly code: string; readonly message: string; }
export type WidgetError = SdkError | { readonly kind: 'load-failed'; readonly cause: unknown };

// ── 위젯 3단계 typestate: setAmount → render → requestPayment 순서를 메서드 부재로 강제 ──
export function loadWidgets(
  clientKey: WidgetClientKey,                    // ApiSecretKey는 물론 ApiClientKey도 컴파일 에러 (위젯은 gck 전용)
  customer: WidgetCustomerKey | Anonymous        // 2–50자 서브타입만 — 300자 서버용 CustomerKey는 컴파일 에러
): Promise<Result<TossWidgets, WidgetError>>;

export interface WidgetAmount { readonly currency: 'KRW' | 'USD' | 'JPY'; readonly value: number; }

export interface TossWidgets {                   // 상태 0: 금액 미설정 — render/requestPayment 메서드 자체가 없음
  setAmount(amount: WidgetAmount): Promise<Result<TossWidgetsWithAmount, WidgetError>>;
}
export interface TossWidgetsWithAmount {         // 상태 1: 금액 설정됨
  renderPaymentMethods(options: { readonly selector: string; readonly variantKey?: string }): Promise<Result<RenderedTossWidgets, WidgetError>>;
  renderAgreement(options: { readonly selector: string; readonly variantKey?: string }): Promise<Result<AgreementWidget, WidgetError>>;
  setAmount(amount: WidgetAmount): Promise<Result<TossWidgetsWithAmount, WidgetError>>;   // 쿠폰 등 금액 변경
}
export interface RenderedTossWidgets {           // 상태 2: 렌더 완료 — 여기서만 결제 요청 가능
  requestPayment(request: WidgetPaymentRequest): Promise<Result<PaymentRequestOutcome, SdkError>>;
  setAmount(amount: WidgetAmount): Promise<Result<RenderedTossWidgets, WidgetError>>;
  getSelectedPaymentMethod(): Promise<Result<{ readonly code: string }, WidgetError>>;
  on(event: 'paymentMethodSelect', handler: (m: { code: string }) => void): () => void;
  destroy(): Promise<void>;
}
export interface AgreementWidget {
  on(event: 'agreementStatusChange', handler: (s: { agreedRequiredTerms: boolean }) => void): () => void;
  destroy(): Promise<void>;
}

export interface WidgetPaymentRequest {
  readonly orderId: OrderId;                     // 스마트 생성자 산출물만 — 서버 createOrder 값은 orderId(raw)로 재파싱
  readonly orderName: OrderName;
  readonly successUrl: string;                   // origin 포함 완전 URL (런타임 검증)
  readonly failUrl: string;
  readonly customerEmail?: string;
  readonly customerName?: string;
  readonly customerMobilePhone?: string;
  readonly taxFreeAmount?: number;
  readonly metadata?: Readonly<Record<string, string>>;   // ≤5쌍 런타임 검증
}

/** 사용자 취소는 에러가 아니다. 리다이렉트 모드 고정(프로미스 모드는 모바일 미지원 — 문서 근거) */
export type PaymentRequestOutcome =
  | { readonly kind: 'redirecting' }
  | { readonly kind: 'user-canceled'; readonly code: 'USER_CANCEL' | 'PAY_PROCESS_CANCELED'; readonly message: string };

// ── 빌링 등록 인증창 (SDK payment() 경유) — v1 포함. 결제창 일반 결제 래퍼는 §7 남은 결정 1 ──
export function requestBillingAuth(
  clientKey: ApiClientKey,                       // 빌링은 API 개별키(ck) — 위젯 키(gck)는 컴파일 에러
  customer: WidgetCustomerKey,                   // ANONYMOUS 불가 — 파라미터 타입에서 배제 (JSDoc 주장이 아닌 타입 강제)
  request: BillingAuthRequest
): Promise<Result<PaymentRequestOutcome, SdkError>>;

/** SDK v2.7.1 타입 정의로 확정(Phase 0): method 'CARD' | 'TRANSFER' 판별 유니언 */
export type BillingAuthRequest =
  | { readonly method: 'CARD';
      readonly successUrl: string; readonly failUrl: string;
      readonly customerName?: string; readonly customerEmail?: string;
      readonly windowTarget?: 'self' | 'iframe';
      readonly selectableCardTypes?: readonly ('PERSONAL' | 'CORPORATE')[] }
  | { readonly method: 'TRANSFER';
      readonly successUrl: string; readonly failUrl: string;
      readonly customerName?: string; readonly customerEmail?: string;
      readonly windowTarget?: 'self' | 'iframe';
      readonly selectableCardTypes?: never };    // 카드 전용 파라미터 — 변수 경유도 차단
```

#### 사용 예제 — React

```tsx
import { loadWidgets, requestBillingAuth, ANONYMOUS } from '@gj-kit/toss-payments/browser';
import { orThrow, parseWidgetClientKey, orderId, orderName, generateCustomerKey } from '@gj-kit/toss-payments';

const gck = orThrow(parseWidgetClientKey(import.meta.env.VITE_TOSS_WIDGET_KEY));   // as 캐스팅 없는 골든 패스

const widgets = orThrow(await loadWidgets(gck, ANONYMOUS));
const priced = orThrow(await widgets.setAmount({ currency: 'KRW', value: order.amount }));  // setAmount 전엔 render가 타입에 없음
await priced.renderAgreement({ selector: '#agreement' });
const rendered = orThrow(await priced.renderPaymentMethods({ selector: '#methods' }));

payButton.onclick = async () => {
  const outcome = await rendered.requestPayment({
    orderId: orThrow(orderId(serverOrder.orderId)),      // 서버 createOrder가 발급·저장한 값 — JSON 경계 재파싱
    orderName: orThrow(orderName(serverOrder.orderName)),
    successUrl: `${location.origin}/api/payments/confirm`,
    failUrl: `${location.origin}/checkout/fail`,
  });
  if (outcome.ok && outcome.value.kind === 'user-canceled') toast('결제를 취소했어요');   // 에러 경로와 분리
};
```

#### 오용 = 컴파일 에러

```ts
declare const apiSecret: ApiSecretKey<'test'>;
declare const gck: WidgetClientKey<'test'>;
declare const ck: ApiClientKey<'test'>;
declare const serverCk: CustomerKey;               // 300자 허용 서버용
declare const wck: WidgetCustomerKey;
// @ts-expect-error 시크릿 키의 브라우저 유입 — WidgetClientKey만 허용 (INSECURE_KEY_USAGE의 타입 차단)
loadWidgets(apiSecret, wck);
// @ts-expect-error API 클라이언트 키(ck)로 위젯 로드 불가 — 위젯은 gck 전용
loadWidgets(ck, wck);
// @ts-expect-error 300자 허용 서버용 CustomerKey를 위젯에 — WidgetCustomerKey(≤50)만
loadWidgets(gck, serverCk);
// @ts-expect-error 빌링 인증에 ANONYMOUS — 고유 customerKey 전제 (타입 구조로 차단)
requestBillingAuth(ck, ANONYMOUS, { method: 'CARD', successUrl: u, failUrl: f });
// @ts-expect-error 위젯 키로 빌링 인증창 — 빌링은 API 개별키
requestBillingAuth(gck, wck, { method: 'CARD', successUrl: u, failUrl: f });
const transferOpts = { method: 'TRANSFER' as const, successUrl: u, failUrl: f, selectableCardTypes: ['PERSONAL' as const] };
// @ts-expect-error TRANSFER에 selectableCardTypes — ?: never라 변수 경유도 차단 (SDK v2.7.1 타입 정합)
requestBillingAuth(ck, wck, transferOpts);
declare const w: TossWidgets;
// @ts-expect-error setAmount 전에는 renderPaymentMethods가 타입에 없다 (SDK 순서 제약)
w.renderPaymentMethods({ selector: '#pm' });
declare const priced: TossWidgetsWithAmount;
// @ts-expect-error render 전에 requestPayment — 메서드가 타입에 없음
priced.requestPayment(req);
// @ts-expect-error raw string은 OrderId가 아니다 — orderId()/generateOrderId()만이 생성 경로
const bad: WidgetPaymentRequest = { orderId: 'my-order-1', orderName: name, successUrl: u, failUrl: f };
```

### 3.6 "./testing" — 실수신 자동화 불가(Phase 0 확정) 대응

```ts
export const webhookFixture: {
  depositCallback(input: { orderId: string; secret: string; status?: DepositCallbackEvent['status']; transactionKey?: string })
    : { rawBody: string; headers: Record<string, string> };
  paymentStatusChanged(input: { payment: Partial<Payment> & { paymentKey: string; orderId: string;
      status: 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED' } })
    : { rawBody: string; headers: Record<string, string> };
  legacyEvent(eventType: string, data: unknown): { rawBody: string; headers: Record<string, string> };
  signedEvent(input: { eventType: 'payout.changed' | 'seller.changed'; entityBody: unknown;
      securityKey: SecurityKey; transmissionTime?: string })
    : { rawBody: string; headers: Record<string, string> };          // 유효 서명 포함 — 생성→검증 왕복 테스트
};

/** HMAC-SHA256("{rawBody}:{transmissionTime}") → base64, "v1:" 접두사 */
export function signWebhookPayload(rawBody: string, transmissionTime: string, key: SecurityKey): string;

export function memoryOrderStore(): OrderStore;
export function memoryBillingKeyStore(): BillingKeyStore;
export function memoryDedupeStore(): WebhookDedupeStore;

/** Phase 0 실측: 발급(신용/개인)+승인(DONE) 모두 성공하는 유일 확인 카드 — BIN 6자리 단독은 400 */
export const TEST_BILLING_CARD: {
  readonly cardNumber: '9410001234567890';
  readonly cardExpirationYear: '30'; readonly cardExpirationMonth: '12';
  readonly customerIdentityNumber: '900101'; readonly cardPassword: '12';
};
```

---

## 4. 공통 타입

### 4.1 Result — plain 판별 유니언 + 자유 함수 (직렬화 안전)

```ts
// ─── "." ──────────────────────────────────────────────────────
export type Result<T, E> = Ok<T> | Err<E>;
export interface Ok<out T>  { readonly ok: true;  readonly value: T; }
export interface Err<out E> { readonly ok: false; readonly error: E; }

export function ok<T>(value: T): Ok<T>;
export function err<E>(error: E): Err<E>;
export function isOk<T, E>(r: Result<T, E>): r is Ok<T>;
export function isErr<T, E>(r: Result<T, E>): r is Err<E>;
export function map<T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E>;
export function mapErr<T, E, F>(r: Result<T, E>, f: (e: E) => F): Result<T, F>;
export function andThen<T, U, E, F>(r: Result<T, E>, f: (v: T) => Result<U, F>): Result<U, E | F>;
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T;
/** 유일한 throw 탈출구 — **부팅 시 설정 파싱(키 로드) 전용**. 요청 경로 사용 금지(TSDoc + lint 규칙 권장).
 *  메서드가 아닌 자유 함수 — Result 값은 어디서든 plain 객체로 직렬화 안전. */
export function orThrow<T, E>(r: Result<T, E>, context?: string): T;
```

주 사용 패턴은 판별자 내로잉(`if (!r.ok) return ...; r.value`) 또는 `isErr` 가드.

### 4.2 키 4종 — 템플릿 리터럴 + 브랜드 + test/live phantom

```ts
export type Env = 'test' | 'live';
type EnvTag<E extends Env> = Brand<`env:${E}`>;   // phantom — 런타임 표현 없음

/** 형식(템플릿 리터럴)과 명목성(브랜드)을 동시에 강제 — 'test_sk_oops' 리터럴도 parse 없이는 통과 불가 */
export type ApiClientKey<E extends Env = Env> =
  (E extends 'test' ? `test_ck_${string}` : `live_ck_${string}`) & Brand<'ApiClientKey'> & EnvTag<E>;
export type ApiSecretKey<E extends Env = Env> =
  (E extends 'test' ? `test_sk_${string}` : `live_sk_${string}`) & Brand<'ApiSecretKey'> & EnvTag<E>;
export type WidgetClientKey<E extends Env = Env> =
  (E extends 'test' ? `test_gck_${string}` : `live_gck_${string}`) & Brand<'WidgetClientKey'> & EnvTag<E>;
export type WidgetSecretKey<E extends Env = Env> =
  (E extends 'test' ? `test_gsk_${string}` : `live_gsk_${string}`) & Brand<'WidgetSecretKey'> & EnvTag<E>;

export interface KeyParseError {
  readonly source: 'library'; readonly kind: 'invalid-key';
  readonly expected: string;                     // "test_sk_ | live_sk_"
  readonly reason: 'bad-prefix' | 'empty-body' | 'bad-length';
  readonly message: string;                      // 접두사 인식 — "위젯 클라이언트 키(gck)를 넣으셨습니다" 류 진단
}

// client key 파서는 "." (브라우저에서 필요). secret key 파서는 "./server" 전용 — §4.2b
export function parseApiClientKey(raw: string): Result<ApiClientKey<'test'> | ApiClientKey<'live'>, KeyParseError>;
export function parseWidgetClientKey(raw: string): Result<WidgetClientKey<'test'> | WidgetClientKey<'live'>, KeyParseError>;

// env 내로잉 가드 (phantom이라 프로퍼티 판별 불가)
export function isTestKey<K extends string>(key: K): key is K & EnvTag<'test'>;
export function isLiveKey<K extends string>(key: K): key is K & EnvTag<'live'>;
```

```ts
// ─── "./server" 전용 (§2 격리 규칙) ──────────────────────────
export function parseApiSecretKey(raw: string): Result<ApiSecretKey<'test'> | ApiSecretKey<'live'>, KeyParseError>;
export function parseWidgetSecretKey(raw: string): Result<WidgetSecretKey<'test'> | WidgetSecretKey<'live'>, KeyParseError>;
export function parseSecretKey(raw: string): Result<ApiSecretKey | WidgetSecretKey, KeyParseError>;  // 접두사 자동 판별

export type KeyKind = 'api' | 'widget';

export interface TossClientOptions {
  readonly fetch?: typeof fetch;                 // 기본 globalThis.fetch (Node 18+)
  readonly baseUrl?: string;                     // 기본 https://api.tosspayments.com
  readonly timeoutMs?: number;                   // 기본 30_000
}

/** 오버로드로 키 종류가 각인 — 위젯 상점 confirm은 gsk 필수(키 쌍 규칙, INVALID_API_KEY). 3안 중 유일 정합을 채택 */
export function createTossClient<E extends Env>(key: ApiSecretKey<E>,    options?: TossClientOptions): TossServerClient<E, 'api'>;
export function createTossClient<E extends Env>(key: WidgetSecretKey<E>, options?: TossClientOptions): TossServerClient<E, 'widget'>;

export interface CallOptions<E extends Env> {
  readonly idempotencyKey?: IdempotencyKey;      // ≤300자, POST 전용, 최초 사용 후 15일 (멱등 판정에 body 미포함 — 실측)
  /** TossPayments-Test-Code 헤더. 라이브 키에선 서버가 조용히 무시하는 함정 → 타입 차단.
   *  ⚠ 반드시 비분배 조건부 — 미내로잉 union 키(E = Env)도 never (judge mustAdopt). */
  readonly testCode?: [E] extends ['test'] ? string : never;
  readonly signal?: AbortSignal;
}
```

### 4.3 문자열 도메인 타입 — 스마트 생성자

```ts
/** 6–64자, ^[A-Za-z0-9_-]+$ — SDK 문서('=' 포함)와 레퍼런스/빌링('-','_'만)의 보수적 교집합.
 *  '='를 거부하는 근거: 빌링 승인 orderId 규격과의 충돌 회피 (TSDoc 명시). */
export type OrderId = string & Brand<'OrderId'>;
/** 2–300자, ^[A-Za-z0-9\-_=.@]+$ — Phase 0 실측: 서버는 사실상 미검증(301자=500, "bad key!"도 200)
 *  → 이 생성자가 실질 방어선. 특수문자 필수 검증 없음(실측: 순수 영숫자 통과). */
export type CustomerKey = string & Brand<'CustomerKey'>;
/** CustomerKey ∧ 길이 ≤50 (SDK 문서 한도) — 브라우저 API는 이것만 받는다. 50/300 문서 모순의 타입 분리 해소 */
export type WidgetCustomerKey = CustomerKey & Brand<'WidgetCustomerKey'>;
export type OrderName      = string & Brand<'OrderName'>;       // 1–100자
export type CancelReason   = string & Brand<'CancelReason'>;    // 1–200자
export type PaymentKey     = string & Brand<'PaymentKey'>;      // 1–200자
export type CancelRequestId = string & Brand<'CancelRequestId'>; // 6–64자, ^[A-Za-z0-9\-_=]+$ — 중국·동남아 비동기 취소에만 필수(문서 ID 53)
export type IdempotencyKey = string & Brand<'IdempotencyKey'>;  // 1–300자 (15일 TTL: 초과 재사용 시 새 요청 처리 — TSDoc)

export interface InvalidInput<Field extends string> {
  readonly source: 'library'; readonly kind: 'invalid-input';
  readonly field: Field;
  readonly reason: 'too-short' | 'too-long' | 'bad-charset' | 'empty';
}

export function orderId(raw: string): Result<OrderId, InvalidInput<'orderId'>>;
export function generateOrderId(prefix?: string): OrderId;              // `${prefix}${epoch36}${rand}` — 항상 유효
export function customerKey(raw: string): Result<CustomerKey, InvalidInput<'customerKey'>>;
export function widgetCustomerKey(raw: string): Result<WidgetCustomerKey, InvalidInput<'customerKey'>>;
export function generateCustomerKey(): WidgetCustomerKey;               // crypto.randomUUID — 두 규격 모두 만족
export function orderName(raw: string): Result<OrderName, InvalidInput<'orderName'>>;
export function cancelReason(raw: string): Result<CancelReason, InvalidInput<'cancelReason'>>;
export function paymentKey(raw: string): Result<PaymentKey, InvalidInput<'paymentKey'>>;
export function cancelRequestId(raw: string): Result<CancelRequestId, InvalidInput<'cancelRequestId'>>;
export function idempotencyKey(raw: string): Result<IdempotencyKey, InvalidInput<'idempotencyKey'>>;
export function generateIdempotencyKey(): IdempotencyKey;               // crypto.randomUUID
```

### 4.4 Payment — method 한글 리터럴 판별 유니언 + raw 탈출구

```ts
export type PaymentStatus =
  | 'READY' | 'IN_PROGRESS' | 'WAITING_FOR_DEPOSIT' | 'DONE'
  | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED';
// ⚠ 단방향 상태 머신 아님: 입금 오류 시 DONE → WAITING_FOR_DEPOSIT 역전이 존재(v1.5+).
//   상태 전이를 제한하는 타입은 만들지 않는다.

export type PaymentMethod =                      // 영문 enum을 지어내지 않는다 — 응답 원문 그대로
  | '카드' | '가상계좌' | '간편결제' | '휴대폰' | '계좌이체'
  | '문화상품권' | '도서문화상품권' | '게임문화상품권';

export interface PaymentBase {
  readonly version: string;
  readonly paymentKey: PaymentKey;
  readonly type: 'NORMAL' | 'BILLING' | 'BRANDPAY';
  readonly orderId: OrderId;
  readonly orderName: string;
  readonly mId: string;
  readonly currency: 'KRW' | 'USD' | 'JPY';
  readonly totalAmount: number;
  /** '취소할 수 있는 금액(잔고)' — 완전 취소 판정의 유일한 근거 (status 아님 — Phase 0 실측) */
  readonly balanceAmount: number;
  readonly status: PaymentStatus;
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly useEscrow: boolean;
  readonly lastTransactionKey: string | null;
  readonly suppliedAmount: number;
  readonly vat: number;
  readonly taxFreeAmount: number;
  readonly taxExemptionAmount: number;
  readonly cancels: readonly CancelTransaction[] | null;
  readonly isPartialCancelable: boolean;
  readonly secret: string | null;                // 가상계좌 웹훅 검증용 — 승인 시 저장 필수
  readonly metadata: Readonly<Record<string, string>> | null;
  readonly receipt: { readonly url: string } | null;
  readonly checkout: { readonly url: string } | null;
  readonly country: string;
  readonly failure: { readonly code: string; readonly message: string } | null;
  /** 응답 원문 — 타입에 없는 필드의 탈출구 (10년 유지보수, MinimalSurface 채택) */
  readonly raw: unknown;
}

export interface CardPayment            extends PaymentBase { readonly method: '카드';     readonly card: CardDetails; readonly virtualAccount: null; }
export interface VirtualAccountPayment  extends PaymentBase { readonly method: '가상계좌'; readonly virtualAccount: VirtualAccountDetails; readonly secret: string; readonly card: null; }
export interface EasyPayPayment         extends PaymentBase { readonly method: '간편결제'; readonly easyPay: EasyPayDetails; }
export interface TransferPayment        extends PaymentBase { readonly method: '계좌이체'; readonly transfer: TransferDetails; }
export interface MobilePhonePayment     extends PaymentBase { readonly method: '휴대폰';   readonly mobilePhone: MobilePhoneDetails; }
export interface GiftCertificatePayment extends PaymentBase { readonly method: '문화상품권' | '도서문화상품권' | '게임문화상품권'; readonly giftCertificate: GiftCertificateDetails; }
/** 승인 전 결제 — method nullable. status는 전체 유니언 유지(협착은 미검증 불변식 — judge 지적 반영) */
export interface PendingMethodPayment   extends PaymentBase { readonly method: null; }

export type Payment =
  | CardPayment | VirtualAccountPayment | EasyPayPayment | TransferPayment
  | MobilePhonePayment | GiftCertificatePayment | PendingMethodPayment;

export interface CardDetails {
  readonly amount: number; readonly issuerCode: string; readonly acquirerCode: string | null;
  readonly number: string;                       // 마스킹
  readonly installmentPlanMonths: number; readonly approveNo: string; readonly useCardPoint: boolean;
  readonly cardType: '신용' | '체크' | '기프트' | '미확인';
  readonly ownerType: '개인' | '법인' | '미확인';
  readonly acquireStatus: string; readonly isInterestFree: boolean; readonly interestPayer: string | null;
}
export interface VirtualAccountDetails {
  readonly accountNumber: string; readonly accountType: string; readonly bankCode: string;
  readonly customerName: string; readonly dueDate: string; readonly expired: boolean;
  readonly settlementStatus: string; readonly refundStatus: string; readonly refundReceiveAccount: unknown | null;
}
export interface EasyPayDetails    { readonly provider: string; readonly amount: number; readonly discountAmount: number; }
export interface TransferDetails   { readonly bankCode: string; readonly settlementStatus: string; }
export interface MobilePhoneDetails{ readonly customerMobilePhone: string; readonly settlementStatus: string; readonly receiptUrl: string; }
export interface GiftCertificateDetails { readonly approveNo: string; readonly settlementStatus: string; }
// (구현 시 레퍼런스 필드 전체를 생략 없이 반영 — 위는 발췌 표기)

export interface CancelTransaction {
  readonly transactionKey: string;
  readonly cancelAmount: number;
  readonly cancelReason: string;
  readonly taxFreeAmount: number;
  readonly taxExemptionAmount: number;
  readonly refundableAmount: number;             // (응답) 이 취소 후 남은 환불 가능액 — 요청 파라미터와 이름만 같음
  readonly transferDiscountAmount: number;
  readonly easyPayDiscountAmount: number;
  readonly canceledAt: string;
  readonly receiptKey: string | null;
  readonly cancelStatus: 'DONE' | 'IN_PROGRESS' | 'ABORTED';   // 해외 간편결제(PayPal)는 IN_PROGRESS 시작(비동기)
  readonly cancelRequestId: string | null;       // 비동기 취소 전용
}

// 상태 가드
export function isDone(p: Payment): p is Payment & { status: 'DONE'; approvedAt: string };
/** ⚠ status === 'CANCELED' 검사가 아니다. 구현: balanceAmount === 0 && (cancels?.length ?? 0) > 0 (Phase 0 실측) */
export function isFullyCanceled(p: Payment): boolean;
```

### 4.5 에러 모델 — source 판별 + 코드 테이블 retryable + API별 코드 유니언

```ts
/** 최상위 판별자 source: 'library'(API 미도달 보장) / 'toss'(서버 응답) / 'network'(전송) */
export interface TossApiFailure<Code extends string = string> {
  readonly source: 'toss';
  readonly code: Code;                           // {code, message} 원문 무손실 보존
  readonly message: string;
  readonly httpStatus: number;                   // 보존하되 판정에 쓰지 않는다
  readonly category: ErrorCategory;
  /** ⚠ 코드 테이블 판정 — HTTP status 아님: PROVIDER_ERROR(400)→true, REFUND_REJECTED(400)→false */
  readonly retryable: boolean;
  readonly traceId: string | null;               // x-tosspayments-trace-id
}
export interface TransportFailure {
  readonly source: 'network';
  readonly code: 'NETWORK_ERROR' | 'TIMEOUT';
  readonly retryable: true;
  readonly cause: unknown;
}
// 'library' 계열은 각 플로우의 Preflight/Verify 에러 타입 (§3 참조) — 공통 형태: { source: 'library'; kind: ... }

export type ErrorCategory =
  | 'STATE' | 'AMOUNT' | 'PARTIAL_NOT_ALLOWED' | 'DEADLINE' | 'ACCOUNT'
  | 'CONCURRENCY' | 'TRANSIENT' | 'AUTH' | 'NOT_FOUND' | 'REJECTED' | 'REQUEST' | 'UNKNOWN';

/** 취소 API 공식 표 30개 + 실측 보강 (열린 확장 (string & {})) */
export type CancelErrorCode =
  | 'ALREADY_CANCELED_PAYMENT' | 'ALREADY_REFUND_PAYMENT' | 'NOT_CANCELABLE_PAYMENT'
  | 'NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER' | 'NOT_CANCELABLE_AMOUNT'
  | 'EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT' | 'EXCEED_CANCEL_LIMIT' | 'EXCEED_MAX_REFUND_DUE'
  | 'NOT_ALLOWED_PARTIAL_REFUND' | 'NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT'
  | 'INVALID_REFUND_ACCOUNT_INFO' | 'INVALID_REFUND_ACCOUNT_NUMBER' | 'INVALID_BANK'
  | 'NOT_AVAILABLE_BANK' | 'FORBIDDEN_BANK_REFUND_REQUEST'
  | 'NOT_MATCHES_REFUNDABLE_AMOUNT' | 'FORBIDDEN_CONSECUTIVE_REQUEST'
  | 'IDEMPOTENT_REQUEST_PROCESSING' | 'INVALID_IDEMPOTENCY_KEY'
  | 'PROVIDER_ERROR' | 'FAILED_INTERNAL_SYSTEM_PROCESSING' | 'FAILED_REFUND_PROCESS'
  | 'FAILED_METHOD_HANDLING_CANCEL' | 'FAILED_PARTIAL_REFUND' | 'COMMON_ERROR'
  | 'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING' | 'REFUND_REJECTED'
  | 'UNAUTHORIZED_KEY' | 'INCORRECT_BASIC_AUTH_FORMAT' | 'FORBIDDEN_REQUEST'
  | 'INVALID_REQUEST' | 'NOT_FOUND_PAYMENT'
  | (string & {});

export type ConfirmErrorCode =
  | 'ALREADY_PROCESSED_PAYMENT' | 'NOT_FOUND_PAYMENT_SESSION'      // 10분 초과 404 — 재시도 불가 최종 실패
  | 'PAY_PROCESS_ABORTED'                                          // (TypeSafetyFirst 누락분 보강 — judge 지적)
  | 'INVALID_REQUEST' | 'INVALID_PAYMENT_KEY' | 'REJECT_CARD_PAYMENT' | 'PROVIDER_ERROR'
  | 'UNAUTHORIZED_KEY' | 'INVALID_API_KEY' | 'FORBIDDEN_REQUEST' | 'NOT_FOUND_PAYMENT'
  | (string & {});

export type BillingErrorCode =
  | 'NOT_MATCHES_CUSTOMER_KEY'                   // 실측 400 — 봉인 설계가 구조적으로 방지하나 방어적 유지
  | 'ALREADY_REMOVED_BILLING_KEY'                // 실측 400 "이미 삭제된 빌링키입니다"
  | 'NOT_SUPPORTED_METHOD' | 'NOT_SUPPORTED_CARD_TYPE'             // 실측: 발급은 되나 승인 거절되는 카드 존재
  | 'INVALID_BILL_KEY_REQUEST' | 'INVALID_BILLING_AUTH' | 'INVALID_CARD_NUMBER'
  | 'FAILED_BILL_KEY_AUTH_CREATION' | 'FAILED_BILLING_AUTO_CANCEL'
  | (string & {});

export function categorizeCancelError(code: string): ErrorCategory;
export function isRetryable(e: TossApiFailure | TransportFailure): boolean;
/** 재취소 이중 매핑 헬퍼 — 400 ALREADY_CANCELED_PAYMENT와 403 NOT_CANCELABLE_AMOUNT(부분취소 이력) 모두 수용 (실측) */
export function isAlreadyFullyCanceledError(e: TossApiFailure): boolean;
```

---

## 5. 에러 카테고리 매핑 표 (취소 API 공식 표 30개 + 실측 보강 — 1차 소스)

| code | HTTP | category | retryable | 비고 |
|---|---|---|---|---|
| ALREADY_CANCELED_PAYMENT | 400 | STATE | ✗ | 단일 전액 취소 후 재취소 (실측) |
| ALREADY_REFUND_PAYMENT | 400 | STATE | ✗ | |
| NOT_CANCELABLE_PAYMENT | 400 | STATE | ✗ | |
| NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER | 400 | STATE | ✗ | |
| **NOT_CANCELABLE_AMOUNT** | **403** | AMOUNT | ✗ | 잔액 초과 **및** 부분취소 이력 후 재취소(실측) — `isAlreadyFullyCanceledError` 양쪽 수용 |
| EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT | 400 | AMOUNT | ✗ | |
| EXCEED_CANCEL_LIMIT | 400 | AMOUNT | ✗ | |
| NOT_ALLOWED_PARTIAL_REFUND | 400 | PARTIAL_NOT_ALLOWED | ✗ | |
| NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT | 400 | PARTIAL_NOT_ALLOWED | ✗ | 타입이 선차단(오버로드 부재) |
| EXCEED_MAX_REFUND_DUE | 400 | DEADLINE | ✗ | |
| NOT_FOUND_PAYMENT_SESSION | 404 | DEADLINE | ✗ | 인증 후 10분 초과 — 결제 재요청 필요 |
| INVALID_REFUND_ACCOUNT_INFO / _NUMBER | 400 | ACCOUNT | ✗ | |
| INVALID_BANK / NOT_AVAILABLE_BANK | 400 | ACCOUNT | ✗ / 은행 점검은 시간차 재시도 여지(문서화) |
| FORBIDDEN_BANK_REFUND_REQUEST | 403 | ACCOUNT | ✗ | |
| NOT_MATCHES_REFUNDABLE_AMOUNT | 400 | CONCURRENCY | ✗(재조회 후 재시도) | 낙관적 잠금 실패 — 취소 미실행(실측) |
| FORBIDDEN_CONSECUTIVE_REQUEST | 403 | CONCURRENCY | ✓(지연) | |
| IDEMPOTENT_REQUEST_PROCESSING | 409 | CONCURRENCY | ✓ | "다시 요청해서 응답 확인" (문서) |
| INVALID_IDEMPOTENCY_KEY | 400 | REQUEST | ✗ | >300자 |
| **PROVIDER_ERROR** | **400** | TRANSIENT | **✓** | HTTP status 판정 금지의 근거 |
| FAILED_INTERNAL_SYSTEM_PROCESSING 외 5xx 계열 6종 | 500 | TRANSIENT | ✓ | FAILED_REFUND_PROCESS / FAILED_METHOD_HANDLING_CANCEL / FAILED_PARTIAL_REFUND / COMMON_ERROR / FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING |
| **REFUND_REJECTED** | **400** | REJECTED | **✗** | 400이지만 비재시도 |
| REJECT_CARD_PAYMENT / PAY_PROCESS_ABORTED | 400 | REJECTED | ✗ | confirm 계열 |
| UNAUTHORIZED_KEY | 401 | AUTH | ✗ | |
| **INVALID_API_KEY** | **400** | AUTH | ✗ | 키 쌍 불일치 — 400인 점 주의 |
| INCORRECT_BASIC_AUTH_FORMAT | 400 | AUTH | ✗ | 라이브러리 내부 캡슐화로 도달 불가 목표 |
| FORBIDDEN_REQUEST | 403 | AUTH | ✗ | |
| INSECURE_KEY_USAGE | 403 | AUTH | ✗ | 타입이 선차단(시크릿 키 브라우저 유입) |
| NOT_FOUND_PAYMENT | 404 | NOT_FOUND | ✗ | |
| ALREADY_PROCESSED_PAYMENT | 400 | STATE | ✗ | confirm 멱등 성격 — 조회로 확정 후 성공 처리 가능(문서화) |
| NOT_MATCHES_CUSTOMER_KEY | 400 | STATE | ✗ | 봉인 설계로 구조적 도달 불가 목표 (실측 400) |
| ALREADY_REMOVED_BILLING_KEY | 400 | STATE | ✗ | 재발급 플로우 유도 (실측) |
| INVALID_REQUEST | 400 | REQUEST | ✗ | |
| (미등록 코드) | — | UNKNOWN | ✗ (보수 판정) | 원문 code/message/httpStatus 무손실 보존 |

---

## 6. 의도적으로 뺀 것과 이유

| 제외 항목 | 이유 |
|---|---|
| `refresh()` 류 빌링키 갱신 메서드 | 토스에 갱신 API가 존재하지 않는다 — revoke + 재발급만. 오해 소지 메서드 금지 (prompts 타협 불가) |
| `onBillingApproved` 웹훅 핸들러 키 / 빌링 승인 이벤트 타입 | 토스가 빌링 승인 웹훅을 제공하지 않는다. approve 반환값 + getPayment 재확인이 완결 신호 (타입·README 명시) |
| paymentKey 문자열/Payment 직접 취소 시그니처 | 조회→검증→실행 3단계 강제가 핵심 요구. 우회로를 제공하지 않는다 |
| 파싱된 객체를 받는 webhook verify 오버로드 | 서명 검증이 원천 불가능해진다 — raw body만 |
| 단일 `Verified` 웹훅 타입 | 토스가 전 이벤트 서명을 제공하지 않으므로 거짓 보장 — 신뢰 3등급으로 정직하게 노출 |
| 영문 method enum ('CARD' 등을 Payment.method에) | 응답 원문은 한글 리터럴 — 지어내면 런타임 전부 불일치 |
| status 'CANCELED' 단정 / 단방향 상태 머신 타입 | Phase 0 실측: 전액취소 후 PARTIAL_CANCELED 유지, DONE→WAITING_FOR_DEPOSIT 역전이 존재 |
| HTTP status 기반 retryable 판정 | PROVIDER_ERROR=400 재시도 가능, REFUND_REJECTED=400 비재시도 — 코드 테이블만 |
| CancelPlan/executeCancel 공개 4단계 | 오버로드 3단계와 보장이 동일한데 세리머니만 추가(judge DX). 봉인은 내부화 + 실패 시 RetryTicket으로만 표면화 |
| 메서드 보유 Result 클래스 / Result.prototype.orThrow | 직렬화 경계에서 메서드 소실 + 요청 경로 throw 회색지대. plain 유니언 + 자유 함수 `orThrow`(부팅 전용 문서화)로 대체 |
| WeakMap 기반 봉인 | 스프레드/직렬화/테스트 대역에서 조용히 깨짐. 비공개 심볼(비열거) + `profile-detached` 명시적 Err + `load()` 재수화로 대체 |
| seen/markSeen 2단계 dedupe 인터페이스 | TOCTOU 레이스 — 원자적 `claim` 단일 메서드만 |
| 프로미스 모드 위젯 결제(리다이렉트 없는 결과 수신) | 모바일 미지원(문서) — 리다이렉트 모드 고정. 기본 API에서 배제 |
| 위젯 `renderPaymentWindow`(결제창형 위젯) | 주문서형과 트리거 구조가 달라 v1 표면 축소. 필요 시 Phase 2+ (§7 결정 1과 연동) |
| 지급대행(payout/seller) entityBody 상세 타입 | v1 범위 밖 — `unknown` 원문 전달 (서명 검증만 제공) |
| BrandPay 전체 | v1 범위 밖 (prompts) |
| 스케줄러/cron | 토스 미제공 = 사용자 책임. approve 멱등 옵션으로 이중 과금만 방어 |
| Basic 인증 문자열 생성 공개 API | 콜론 누락·BOM이 문서가 경고하는 대표 실수 — 내부 캡슐화 |
| `simulateError`/`testCode`의 라이브 키 허용 | 라이브에선 서버가 조용히 무시하는 함정 — 비분배 조건부로 타입 차단 |
| customerKey "특수문자 최소 1개" 검증 | 실측: 순수 영숫자 200 통과 — 허용 집합 나열이 맞음 |
| OrderStore 없는 confirm 경로 / BillingKeyStore 없는 billing 경로 | 금액 비교 원본·빌링키 보관 없이는 플로우가 성립하지 않음 — 팩토리 필수 인자 |

---

## 7. 사용자에게 물어야 할 남은 결정 (AskUserQuestion 대상)

1. **결제창(payment window) 일반 결제 래퍼의 v1 포함 여부** — 현재 v1 browser 엔트리는 **위젯 + requestBillingAuth(빌링 인증창)만** 포함.
   - (a) 현행 유지: 위젯 + 빌링 인증창만 (일반 결제창 `payment.requestPayment`는 v2로)
   - (b) 결제창 일반 결제 래퍼까지 포함 (method 6종 × 수단별 옵션 타입 — 표면 대폭 증가, 위젯 키 미보유로 E2E 검증 불가 상태)
   - 참고: 빌링 인증창을 빼는 선택지는 judge 3인 모두 mustAvoid로 판정해 제외했다.

2. **라이선스** — MIT / Apache-2.0 / 비공개(UNLICENSED, 외주 재사용 전용) 중 선택. npm 공개 배포 계획과 연동.

3. **최소 Node 버전** — 18 (내장 fetch 최소선, LTS 종료됨) vs 20 (현행 LTS, `--env-file`·안정 WebCrypto). engines 필드와 CI 매트릭스에 직결.

4. **confirm의 멱등키 기본 정책** — 설계안 간 실제로 갈렸던 지점.
   - (a) 기본 미부착, 일급 옵션만 (DXFirst — 토스가 에러 응답도 멱등 재생하는지 미확인이라 보수적)
   - (b) cancel처럼 자동 생성 + 봉인 (일관성 우선 — 단 confirm 실패 재시도 시 같은 키로 인한 에러 재생 리스크 검증 필요)

5. **기존 시스템 보유 billingKey의 마이그레이션 경로** — BillingProfile 봉인 때문에 정식 유입 경로가 없다.
   - (a) 문서화된 우회: BillingKeyRecord를 스토어에 직접 심고 `billing.load()` (현행 가능, README 안내만)
   - (b) 명시적 `billing.import(record)` API 추가 (검증·경고 포함)
   - (c) v1 미지원 명시

6. **subpath 구성 확정** — prompts 산출물 명세는 `/server`, `/browser` 2종. 본 설계는 `/webhook`(Edge 호환 분리), `/testing`(픽스처)을 추가했다.
   - (a) 5종 유지 (본 문서안: `.`, `/server`, `/webhook`, `/browser`, `/testing`)
   - (b) 웹훅을 `/server`로 흡수해 4종 (MinimalSurface 방식 — Edge에서 서버 클라이언트 코드 동반 로드 감수)

7. **웹훅 소스 IP 검사 기본값** — `allowedSourceIps` 기본 켬(문서 IP 목록 내장, Unverified 이벤트 보조 방어선) vs 기본 끔(프록시/로드밸런서 뒤 X-Forwarded-For 신뢰 문제로 오탐 위험). 설계안 중 TypeSafetyFirst만 포함했던 기능.

8. **`orThrow` 자유 함수의 존치 여부** — 부팅 설정 파싱 전용 탈출구로 포함했으나(judge DX mustAdopt), throw 금지 원칙의 순수성을 우선하면 제거하고 `if (isErr(...)) throw` 수동 패턴만 문서화하는 선택지도 있다. lint 규칙(요청 경로 사용 금지) 동봉 여부 포함.

9. **패키지 README 언어** — 한국어 단일 / 한국어+영어 병기 (npm 공개 시 검색성).

### §7 확정 결과 (2026-08-09 사용자 답변)

| # | 결정 |
|---|---|
| 1 | **위젯 + 빌링 인증창만** — 결제창 일반 결제 래퍼는 v2로 |
| 2 | **MIT** |
| 3 | **Node >=20** (engines) |
| 4 | **subpath 5종 유지** — `.`, `/server`, `/webhook`, `/browser`, `/testing` |
| 5 | **confirm 멱등키 기본 미부착** — 일급 옵션만. Phase 5에서 에러 응답 멱등 재생 여부 실측 후 v1.1 재검토 |
| 6 | **`billing.import(record)` API 추가** — 검증 + TSDoc 경고 포함 명시적 이관 경로 |
| 7 (IP) | 세션 결정: `allowedSourceIps` 검사는 `context.sourceIp` 전달 시에만 수행 (기본 목록 내장, `false`로 끔) |
| 8 (orThrow) | 세션 결정: 존치 — 부팅 전용 TSDoc 명시 |
| 9 | **README 한국어 단일** |

---

## 부록 A. 잔존 리스크 (합성 후에도 남는 것 — Phase 4 리뷰 렌즈)

- **취소 가능 status 집합(DONE|PARTIAL_CANCELED|WAITING_FOR_DEPOSIT)은 비공식 유도** — 서버 정책 변경 시 과잉/과소 차단 가능. TSDoc 근거 명시로 완화, 제거 불가.
- **BillingKeyStore 재수화는 서버 재검증 불가** — 토스에 조회 API가 없어 오염된 스토어면 '타입은 맞고 값이 틀린' BillingProfile 발생. 저장/로깅 규율은 사용자 책임(TSDoc 경고).
- **브랜드 심볼의 .d.ts 비노출은 tsup dts 구성 검증 필요** — 빌드 검증 항목에 포함(Phase 2 스캐폴드에서 스냅샷 테스트).
- **위젯 typestate는 SDK v2.x 동작 미러링** — peer 마이너 업데이트로 어긋날 수 있고, 위젯 키 미보유로 E2E 불가 상태 지속(단위+타입 테스트로만 검증, prompts 지시).
- **status×method 2축 내로잉 미완성** — method 축 1차 판별 선택으로 status 불변식(DONE→approvedAt non-null)은 `isDone` 가드 의존.
- **Unverified 이벤트의 payload 직접 사용은 타입이 막지 못함** — `refetch` 유도가 최선(토스 구조적 한계).
- **조건부 타입(capability 교차, 오버로드 5종)의 에러 메시지 품질** — expectTypeOf 회귀로 강제 자체는 검증하되 메시지는 통제 밖. JSDoc 보완 필수.
