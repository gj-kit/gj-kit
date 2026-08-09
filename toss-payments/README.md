# @gj-kit/toss-payments

**잘못 쓸 수 없는** 토스페이먼츠 V2 연동 라이브러리.

결제 연동 사고의 대부분은 "검증을 깜빡한" 코드에서 나옵니다 — 금액 대조 없이 승인, 상태 확인 없이 취소, 서명 검증 없이 웹훅 신뢰. 이 라이브러리는 *parse, don't validate* 철학을 따릅니다: 검증을 통과했다는 사실이 **브랜디드 타입**으로 남고, 검증을 건너뛴 값은 다음 단계 함수의 파라미터 타입을 충족하지 못해 **컴파일 에러**가 됩니다. 런타임 검사를 잊을 수는 있어도, 타입 체커를 통과하지 못하는 코드를 배포할 수는 없습니다.

- 모든 공개 작업은 `Result<T, E>`를 반환합니다 — throw 없음 (유일한 예외: 부팅 전용 `orThrow`).
- 런타임 의존성 0, Node ≥ 20, Edge 런타임 호환(WebCrypto·fetch만 사용).
- 브라우저 엔트리는 `@tosspayments/tosspayments-sdk` v2를 optional peer로 사용합니다.

---

## 1. 설치와 키 설정

```sh
pnpm add @gj-kit/toss-payments
# 브라우저(위젯·빌링 인증창)를 쓰는 앱이라면:
pnpm add @tosspayments/tosspayments-sdk
```

### 키 4종 구분

토스페이먼츠는 연동 방식(API 개별 / 결제위젯) × 노출 범위(클라이언트 / 시크릿)로 키가 4종입니다. 이 라이브러리는 4종을 서로 다른 타입으로 분리해 **바꿔 끼우면 컴파일 에러**가 나게 합니다.

| 키 | 접두사 | 쓰는 곳 | 파서 | 파서가 있는 엔트리 |
|---|---|---|---|---|
| API 클라이언트 키 | `test_ck_` / `live_ck_` | 브라우저 — 빌링 인증창(`requestBillingAuth`) | `parseApiClientKey` | `.` (루트) |
| API 시크릿 키 | `test_sk_` / `live_sk_` | 서버 — 조회·취소·빌링 API | `parseApiSecretKey` | **`/server` 전용** |
| 위젯 클라이언트 키 | `test_gck_` / `live_gck_` | 브라우저 — 결제위젯(`loadWidgets`) | `parseWidgetClientKey` | `.` (루트) |
| 위젯 시크릿 키 | `test_gsk_` / `live_gsk_` | 서버 — 위젯 결제의 confirm | `parseWidgetSecretKey` | **`/server` 전용** |

```ts
// 서버 부팅 시 1회. orThrow는 부팅 설정 파싱 전용 탈출구입니다 — 요청 경로에서 쓰지 마세요.
import { orThrow } from '@gj-kit/toss-payments';
import { parseApiSecretKey, createTossClient } from '@gj-kit/toss-payments/server';

const client = createTossClient(orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)));
```

**시크릿 키의 브라우저 유입이 컴파일 에러인 이유** — 시크릿 키 파서(`parseApiSecretKey`/`parseWidgetSecretKey`)는 `/server` 엔트리에서만 export 되고, 이 엔트리는 package.json exports 맵에서 `node` 조건으로만 해석됩니다(브라우저 타깃 번들러는 resolve 실패). 브랜드 심볼은 패키지 밖으로 나가지 않으므로 `as` 캐스팅 없이는 브라우저 번들 안에서 `ApiSecretKey` 타입의 값을 **만들 방법 자체가 없고**, `loadWidgets`는 `WidgetClientKey`만 받습니다. 서버가 403 `INSECURE_KEY_USAGE`로 알려주기 전에 타입 체커가 먼저 막습니다.

**키 쌍 규칙** — 위젯으로 일으킨 결제의 승인(confirm)은 위젯 시크릿 키(`gsk`)로, 빌링·일반 API는 API 시크릿 키(`sk`)로 호출해야 합니다. 쌍이 어긋나면 서버가 400 `INVALID_API_KEY`를 반환합니다. `createTossClient`는 키 종류를 클라이언트 타입에 각인하므로(`'api'` / `'widget'`), 빌링 플로우에 위젯 키 클라이언트를 넘기는 실수도 컴파일 에러입니다.

---

## 2. 플로우 1 — 결제위젯: 주문 생성 → 위젯 → 승인

### 서버: 주문 생성 (금액 고정 + 저장이 한 호출)

```ts
// lib/toss.ts
import { orThrow } from '@gj-kit/toss-payments';
import {
  parseWidgetSecretKey, createTossClient, createConfirmFlow, type OrderStore,
} from '@gj-kit/toss-payments/server';

const widgetClient = createTossClient(orThrow(parseWidgetSecretKey(process.env.TOSS_WIDGET_SECRET_KEY!)));
const orders: OrderStore = {
  saveOrder: async (o) => { await db.tossOrder.create({ data: o }); },
  loadOrder: (id) => db.tossOrder.findUnique({ where: { orderId: id } }),
};
export const confirmFlow = createConfirmFlow(widgetClient, orders); // 스토어 없이는 플로우 생성 불가
```

```ts
// app/api/checkout/route.ts
import { confirmFlow } from '@/lib/toss';

export async function POST(req: Request) {
  const { planId } = await req.json();
  const order = await confirmFlow.createOrder({ amount: priceOf(planId), orderName: '프리미엄 플랜' });
  if (!order.ok) return Response.json(order.error, { status: 400 });
  return Response.json(order.value.toClientProps()); // { orderId, amount, orderName, currency }
}
```

### 브라우저: 위젯 렌더 → 결제 요청

```ts
import { loadWidgets, ANONYMOUS } from '@gj-kit/toss-payments/browser';
import { orThrow, parseWidgetClientKey, orderId, orderName } from '@gj-kit/toss-payments';

const gck = orThrow(parseWidgetClientKey(import.meta.env.VITE_TOSS_WIDGET_CLIENT_KEY));

const widgets = orThrow(await loadWidgets(gck, ANONYMOUS));
const priced = orThrow(await widgets.setAmount({ currency: 'KRW', value: serverOrder.amount }));
await priced.renderAgreement({ selector: '#agreement' });
const rendered = orThrow(await priced.renderPaymentMethods({ selector: '#methods' }));

const outcome = await rendered.requestPayment({
  orderId: orThrow(orderId(serverOrder.orderId)),      // 서버가 발급·저장한 값을 재파싱
  orderName: orThrow(orderName(serverOrder.orderName)),
  successUrl: `${location.origin}/api/payments/confirm`,
  failUrl: `${location.origin}/checkout/fail`,
});
if (outcome.ok && outcome.value.kind === 'user-canceled') toast('결제를 취소했어요'); // 취소는 에러가 아님
```

`setAmount` 전에는 `renderPaymentMethods`가, 렌더 전에는 `requestPayment`가 **타입에 존재하지 않습니다** — SDK가 요구하는 호출 순서를 메서드 부재로 강제합니다.

### 서버: successUrl 콜백 — 명시적 3단계

```ts
// app/api/payments/confirm/route.ts
import { isErr } from '@gj-kit/toss-payments';
import { parseSuccessCallback } from '@gj-kit/toss-payments/server';
import { confirmFlow } from '@/lib/toss';

export async function GET(req: Request) {
  const parsed = parseSuccessCallback(req.url);                 // [1] 파싱
  if (isErr(parsed)) return new Response('bad callback', { status: 400 });

  const verified = await confirmFlow.verify(parsed.value);      // [2] 저장 주문과 금액 대조 + 10분 시한
  if (isErr(verified)) {
    if (verified.error.kind === 'amount-mismatch') alertFraud(verified.error); // 금액 변조 시도
    return Response.redirect(new URL('/checkout/fail', req.url));
  }

  const done = await confirmFlow.confirm(verified.value);       // [3] 승인 — VerifiedCheckout만 받는다
  if (isErr(done)) {
    if (done.error.source === 'toss' && done.error.retryable) return new Response(null, { status: 503 });
    return Response.redirect(new URL('/checkout/fail', req.url));
  }
  // 가상계좌면 secret 저장 — DEPOSIT_CALLBACK 웹훅 검증의 원본
  if (done.value.method === '가상계좌') await db.deposits.save(done.value.orderId, done.value.secret);
  return Response.redirect(new URL(`/orders/${done.value.orderId}/complete`, req.url));
}
```

같은 강제를 내장한 원스톱도 있습니다 — 검증이 생략되는 게 아니라 흡수됩니다(단계별 에러가 union으로 구분됨):

```ts
const result = await confirmFlow.confirmCallback(req.url);
```

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **금액 검증은 공식 문서의 의무 사항** — successUrl 쿼리의 `amount`는 브라우저를 거쳐 온 값이라 위변조 가능합니다. `verify`는 `createOrder`가 저장 시점에 고정한 금액(단일 진실 공급원)과 대조하고, 통과해야만 `VerifiedCheckout` 브랜드를 부여합니다. `confirm(unverifiedCallback)`은 컴파일 에러입니다.
> - **10분 시한** — 인증 완료 후 10분 안에 confirm하지 않으면 결제는 `EXPIRED`가 되고, 이후 confirm은 404 `NOT_FOUND_PAYMENT_SESSION`(재시도 불가 최종 실패)입니다. `verify`가 시한을 함께 판정합니다.
> - 가상계좌 confirm의 결과는 `DONE`이 아니라 `WAITING_FOR_DEPOSIT`일 수 있습니다 — `ConfirmedPayment` 타입이 두 상태를 모두 담습니다.

---

## 3. 플로우 2 — 결제 취소: 조회 → asCancelable → 실행

`paymentKey` 문자열로 바로 취소하는 API는 **존재하지 않습니다**. 반드시 조회 → 상태 검증 → 실행 3단계입니다.

```ts
import { isErr, orThrow, paymentKey, cancelReason } from '@gj-kit/toss-payments';
import { asCancelable, refundAccount } from '@gj-kit/toss-payments/server';

app.post('/admin/refunds', async (req, res) => {
  const pk = paymentKey(req.body.paymentKey);
  if (isErr(pk)) return res.status(400).json(pk.error);

  const found = await client.getPayment(pk.value);                  // [1] 조회
  if (isErr(found)) return res.status(404).json(found.error);

  const checked = asCancelable(found.value);                        // [2] 상태 검증 → 브랜드 획득
  if (isErr(checked)) return res.status(409).json(checked.error);

  const reason = orThrow(cancelReason('고객 요청 환불'));
  const order = await db.orders.byPaymentKey(pk.value);             // 기대 금액은 우리 장부에서!

  const c = checked.value;
  const result = c.kind === 'deposited-virtual-account'             // [3] 실행 — kind 내로잉이 컴파일 강제
    ? await client.cancels.cancelFully(c, {
        reason, expectedAmount: order.paidAmount,
        refundAccount: orThrow(refundAccount({ bank: '88', accountNumber: req.body.account, holderName: req.body.holder })),
      })
    : c.kind === 'settled' && req.body.amount != null
      ? await client.cancels.cancelPartially(c, { reason, amount: req.body.amount })
      : await client.cancels.cancelFully(c, { reason, expectedAmount: order.paidAmount });

  if (isErr(result)) {
    if (result.error.source === 'network') {
      await retryQueue.push(result.error.retry);                    // 재시도 티켓 — §6 에러 처리 참고
      return res.status(503).end();
    }
    return res.status(422).json(result.error);
  }
  res.json({ fullyCanceled: result.value.fullyCanceled });          // status로 판정하지 않는다
});
```

`expectedAmount`에 서버가 알려준 `balanceAmount`를 되돌려 넣지 마세요 — 검증이 항진식이 됩니다. 반드시 **자체 DB의 기대 금액**을 넣으세요.

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **전액 취소 후에도 status는 `CANCELED`가 아닐 수 있다(실측)** — 부분취소 이력이 있는 결제를 잔액 전액 취소하면 status가 `PARTIAL_CANCELED`로 남습니다. 완전 취소 판정의 유일한 기준은 `balanceAmount === 0`이고, 라이브러리는 이를 `CancelOutcome.fullyCanceled`로 제공합니다. `asCancelable`도 잔액 0이면 status와 무관하게 `already-fully-canceled`를 반환합니다.
> - **재취소 에러는 두 얼굴(실측)** — 단일 전액취소 후 재취소는 400 `ALREADY_CANCELED_PAYMENT`, 부분취소 이력 후 재취소는 403 `NOT_CANCELABLE_AMOUNT`. `isAlreadyFullyCanceledError`가 양쪽을 수용합니다.
> - **가상계좌 분기는 오버로드로 강제** — 입금 완료 가상계좌는 `refundAccount` 필수, 일반 결제는 `?: never`로 금지, 입금 전(`WAITING_FOR_DEPOSIT`)은 전액취소만 가능(부분취소 오버로드 자체가 없음).
> - **잔액 초과 취소는 API 호출 전에 차단** — 우회해서 보내면 서버가 403 `NOT_CANCELABLE_AMOUNT`를 반환합니다(실측). 동시 취소 경합은 서버 낙관적 잠금(`NOT_MATCHES_REFUNDABLE_AMOUNT`)이 잡아내며, 라이브러리는 조회 시점 잔액을 항상 `refundableAmount`로 전송합니다.

---

## 4. 플로우 3 — 자동결제(빌링): 인증 → 발급 → 승인

### 브라우저: 등록 인증창

```ts
import { requestBillingAuth } from '@gj-kit/toss-payments/browser';
import { orThrow, parseApiClientKey, widgetCustomerKey } from '@gj-kit/toss-payments';

const ck = orThrow(parseApiClientKey(import.meta.env.VITE_TOSS_CLIENT_KEY)); // 빌링은 API 키 — 위젯 키는 컴파일 에러
const customer = orThrow(widgetCustomerKey(session.customerKey));            // ANONYMOUS 불가 — 타입에서 배제

await requestBillingAuth(ck, customer, {
  method: 'CARD',
  successUrl: `${location.origin}/billing/callback`,
  failUrl: `${location.origin}/billing/fail`,
});
```

### 서버: 콜백 → 세션 대조 → 발급 (명시적 단계)

```ts
import { isErr, customerKey } from '@gj-kit/toss-payments';
import {
  parseBillingAuthCallback, confirmPendingAuth, createBillingFlow,
} from '@gj-kit/toss-payments/server';

const billing = createBillingFlow(client, {                  // client는 API 시크릿 키('api') 클라이언트만
  save: (r) => db.billingKeys.upsert(r),                     // 저장이 유일한 보관 수단 — 조회 API 없음
  find: (ck) => db.billingKeys.find(ck),
  delete: (ck) => db.billingKeys.remove(ck),
});

app.get('/billing/callback', async (c) => {
  const parsed = parseBillingAuthCallback(c.req.url);                    // [1] 파싱 — authKey는 봉인
  if (isErr(parsed)) return c.json(parsed.error, 400);
  if (parsed.value.status !== 'authorized') return c.redirect('/billing/canceled');

  const sessionCk = customerKey(await session.get(c, 'customerKey'));    // 세션 값이 진실
  if (isErr(sessionCk)) return c.json({ error: 'no session' }, 401);

  const auth = confirmPendingAuth(parsed.value.pending, sessionCk.value); // [2] 세션 대조 → AuthKeyReceived
  if (isErr(auth)) return c.json({ error: 'customerKey mismatch' }, 403);

  const profile = await billing.issue(auth.value);                       // [3] 발급 + store.save까지 보장
  if (isErr(profile)) {
    if (profile.error.kind === 'store-save-failed') opsAlert(profile.error.issuedRecord); // 키 유실 방지 반출
    return c.json(profile.error, 502);
  }
  return c.redirect('/subscription/active');
});
```

### 서버: 정기 승인 (스케줄러는 직접 — 토스 미제공)

```ts
import { orThrow, customerKey, orderName, generateOrderId, idempotencyKey, isErr } from '@gj-kit/toss-payments';

async function chargeMonthly(rawCk: string, amount: number) {
  const ck = orThrow(customerKey(rawCk));
  const loaded = await billing.load(ck);                     // 스토어에서 재수화
  if (isErr(loaded) || loaded.value === null) return notifyReissueNeeded(rawCk);

  const paid = await billing.approve(loaded.value, {
    orderId: generateOrderId('sub'),
    orderName: orThrow(orderName('2026년 8월 구독')),
    amount,
  }, { idempotencyKey: orThrow(idempotencyKey(`sub:2026-08:${rawCk}`)) }); // 이중 과금 방지

  if (isErr(paid) && paid.error.source === 'toss' && paid.error.code === 'ALREADY_REMOVED_BILLING_KEY')
    await requestReauth(rawCk);                              // 갱신 API 없음 — 재발급 플로우 재시작
  return paid;
}
```

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **`NOT_MATCHES_CUSTOMER_KEY`(실측 400)** — 콜백 쿼리로 돌아온 customerKey는 위변조 가능한 값입니다. `confirmPendingAuth`가 세션에 저장된 값과 대조를 통과해야만 발급 가능한 `AuthKeyReceived`가 됩니다. 승인 단계에서도 `BillingOrder`에는 customerKey 필드 자체가 없고 `BillingProfile` 봉인 쌍으로만 승인하므로, 다른 고객 키로 승인하는 사고가 구조적으로 불가능합니다.
> - **토스에는 빌링키 조회 API가 없다** — 저장 실패 = 영구 유실입니다. 그래서 `createBillingFlow`는 `BillingKeyStore` 없이 생성할 수 없고, `issue`는 `store.save` 성공 후에만 Ok이며, 저장 실패 시 발급된 record를 에러에 동봉해 수동 복구 여지를 남깁니다.
> - **빌링키 갱신 API도 없다** — `refresh` 류 메서드는 의도적으로 없습니다. `ALREADY_REMOVED_BILLING_KEY`를 만나면 revoke 후 새 인증부터 다시입니다.
> - **billingKey는 어디에도 노출되지 않는다** — `BillingProfile`의 공개 필드·JSON 직렬화에 billingKey가 없습니다. 스프레드/직렬화로 봉인이 소실된 복제본은 `approve`에서 `profile-detached` Err — `billing.load(customerKey)`로 재수화하세요.

---

## 5. 플로우 4 — 웹훅 수신: raw body → verify → (필요시) refetch

```ts
import { createWebhookVerifier, parseSecurityKey } from '@gj-kit/toss-payments/webhook';
import { orThrow } from '@gj-kit/toss-payments';

const verifier = createWebhookVerifier({
  dedupe: { claim: (id) => redis.set(`twh:${id}`, '1', { NX: true, EX: 432_000 }).then(Boolean) },
  securityKeys: [orThrow(parseSecurityKey(process.env.TOSS_SECURITY_KEY!))],  // 로테이션 시 [새 키, 옛 키]
  depositSecrets: { getSecret: (orderId) => db.deposits.secretOf(orderId) },  // 승인 시 저장한 Payment.secret
});
```

수동 배선(프레임워크 어댑터는 §7 참고):

```ts
const result = await verifier.verify(rawBody, headers, { sourceIp: clientIp });
if (!result.ok) return respond400();
if (result.value.duplicate) return respond200();   // 재전송 — 정상 ack 후 스킵
respond200();                                       // 10초 규약: 먼저 200
const webhook = result.value.webhook;
if (webhook.trust === 'unverified') {
  const fresh = await webhook.refetch(client);      // 조회 API로 승격 — payload를 믿지 않는다
  if (fresh.ok) await syncStatus(fresh.value);
}
```

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **토스는 모든 이벤트에 서명을 제공하지 않습니다** — 서명(HMAC)이 있는 이벤트는 `payout.changed`/`seller.changed`뿐이고, 가상계좌 입금(`DEPOSIT_CALLBACK`)은 승인 시 저장한 `secret` 대조, 나머지(결제 상태 변경 포함)는 **암호학적 검증 수단이 없습니다**. 그래서 이 라이브러리에는 단일 `Verified` 타입이 없고 신뢰 3등급(§7 표)을 정직하게 노출합니다. `unverified` 등급은 `refetch(client)` 한 줄로 조회 API 재확인을 거쳐야 신뢰 가능한 `Payment`가 됩니다.
> - **verify는 raw body만 받습니다** — 파싱된 객체를 받는 오버로드는 없습니다. JSON 파싱을 먼저 하면 서명 검증이 원천 불가능해지기 때문입니다.
> - **dedupe 스토어는 필수입니다** — 토스는 최대 7회 재전송하고, 가상계좌는 이벤트가 이중으로 옵니다. 중복은 Err가 아닌 정상 verdict(`duplicate: true`)입니다 — 400으로 응답하면 3일 19시간 동안 재전송이 계속됩니다.

---

## 6. 에러 처리 — Result와 3종 판별

모든 실패는 `Result`의 `error`로 돌아오고, 최상위 판별자는 `source`입니다.

| source | 의미 | 보장 |
|---|---|---|
| `'library'` | 사전 검증 실패 (금액 불일치, 상태 부적합, 입력 오류 등) | **토스 API에 도달하지 않았음** |
| `'toss'` | 토스 서버의 에러 응답 | `code`/`message` 원문 무손실 + `retryable` 판정 |
| `'network'` | 전송 실패·타임아웃 — 응답 유실 | 항상 `retryable: true`, 취소는 재시도 티켓 동봉 |

### retryable은 코드 테이블 판정 — HTTP status가 아닙니다

`PROVIDER_ERROR`는 400이지만 **재시도 가능**이고, `REFUND_REJECTED`는 같은 400인데 **재시도 불가**입니다. HTTP status로 재시도를 판정하면 틀립니다. 라이브러리는 취소 API 공식 에러 표 30종 + 실측 보강 기준의 코드 테이블로 `retryable`과 `category`를 채웁니다.

```ts
if (isErr(result) && result.error.source === 'toss') {
  result.error.code;       // 'NOT_CANCELABLE_AMOUNT' 등 리터럴 유니언 + (string & {})
  result.error.retryable;  // 코드 테이블 판정
  result.error.category;   // 'STATE' | 'AMOUNT' | 'CONCURRENCY' | 'TRANSIENT' | ...
  result.error.traceId;    // x-tosspayments-trace-id — 고객센터 문의용
}
```

### 취소 재시도 티켓 — 응답 유실 시 안전한 재실행

취소 요청이 `network` 실패하면 응답을 못 받았을 뿐 서버에는 도달했을 수 있습니다. 에러에 동봉된 `CancelRetryTicket`에는 실행 전에 봉인한 **동일 멱등키 + 동일 body**가 각인되어 있어, `client.cancels.retry(ticket)`은 서버에 도달했었다면 멱등 재생을, 아니면 재실행을 합니다 — 이중 취소가 발생하지 않습니다. 토스의 멱등 판정에 body가 포함되지 않으므로(문서 명시) body 동일성은 티켓 봉인이 보장합니다. 멱등키는 최초 사용 후 15일 유효 — 오래된 티켓 재실행은 새 요청으로 처리될 수 있습니다.

```ts
const retried = await client.cancels.retry(ticket);
```

---

## 7. 웹훅 신뢰 3등급과 프레임워크 어댑터

| trust | 대상 이벤트 | 검증 수단 | 후속 조치 |
|---|---|---|---|
| `'signature'` | `payout.changed`, `seller.changed` | HMAC-SHA256 서명 (키 로테이션 배열 지원) | 그대로 신뢰 가능 |
| `'secret'` | `DEPOSIT_CALLBACK` (가상계좌 입금) | 승인 시 저장한 `Payment.secret` 대조 | 그대로 신뢰 가능 |
| `'unverified'` | 나머지 전부 (`PAYMENT_STATUS_CHANGED`, `BILLING_DELETED` 등) | **없음 — 토스가 미제공** | `refetch(client)`로 조회 API 재확인 |

### Next.js Route Handler (Fetch 표준 어댑터)

```ts
// app/api/webhooks/toss/route.ts
export const POST = verifier.fetchHandler({
  onDepositCallback: async ({ event }) => {                 // trust: 'secret' — 대조 통과분만 도달
    if (event.status === 'DONE') await fulfillOrder(event.orderId);   // paymentKey 없음 — orderId 기반
    if (event.status === 'WAITING_FOR_DEPOSIT') await revertToAwaiting(event.orderId); // 입금 오류 역전이
  },
  onPaymentStatusChanged: async (w) => {                    // trust: 'unverified'
    const fresh = await w.refetch(client);
    if (fresh.ok) await syncStatus(fresh.value);            // 웹훅 payload가 아닌 조회 결과로 갱신
  },
  onBillingDeleted: async (w) => { await deactivateSubscription(w.event.data.billingKey); },
});
// raw body 보존·검증·dedupe·10초 내 200 — 전부 어댑터가 소유합니다.
// Vercel/Lambda에서는 options.waitUntil을 넘기세요. 미제공 감지 시 기본 폴백:
// 핸들러 동기 완료 후 200(이벤트 유실 방지) + 경고 로그.
```

### Express (Node 어댑터) — `express.raw` 주의

```ts
// ⚠ JSON 파싱 미들웨어(express.json)를 이 경로에 두지 마세요 — raw body가 파괴되면 서명 검증이 불가능합니다.
app.post('/webhooks/toss', express.raw({ type: '*/*' }), verifier.nodeHandler({
  onDepositCallback: async ({ event }) => { await fulfillOrder(event.orderId); },
}));
```

`onBillingApproved` 같은 핸들러 키는 **타입에 없습니다** — 토스가 빌링 승인 웹훅을 제공하지 않기 때문입니다(§10 FAQ).

> ⚠ **rawBody를 로그에 남기지 마세요.** DEPOSIT_CALLBACK 원문에는 검증용 `secret`이 들어 있습니다. 라이브러리는 검증 후 이벤트 객체에서 secret을 제거하지만, 수신 원문을 직접 로깅하면 그 방어가 무의미해집니다.

---

## 8. 테스트 유틸 — `/testing`

토스 테스트 환경은 웹훅을 localhost로 보낼 수 없고 등록 API도 없어, CI는 페이로드 시뮬레이션이 정답입니다. `/testing` 엔트리가 실수신과 동일한 형태의 픽스처를 만들어 줍니다.

```ts
import {
  webhookFixture, signWebhookPayload,
  memoryOrderStore, memoryBillingKeyStore, memoryDedupeStore,
  TEST_BILLING_CARD,
} from '@gj-kit/toss-payments/testing';

// 웹훅 왕복 테스트 — 생성한 픽스처를 그대로 verify에 통과
const { rawBody, headers } = webhookFixture.depositCallback({ orderId: 'order_1', secret: 'ps_...' });
const verdict = await verifier.verify(rawBody, headers);

// 유효 서명이 포함된 v2 이벤트 (생성→검증 왕복) — 서명이 WebCrypto라 async
const signed = await webhookFixture.signedEvent({ eventType: 'payout.changed', entityBody: {}, securityKey: secKey });

// 인메모리 스토어 — 플로우 팩토리의 필수 인자를 테스트에서 충족
const flow = createConfirmFlow(client, memoryOrderStore());
const billing = createBillingFlow(client, memoryBillingKeyStore());
const v = createWebhookVerifier({ dedupe: memoryDedupeStore() });
```

`TEST_BILLING_CARD`(`9410001234567890`)는 테스트 환경에서 빌링키 발급(신용/개인)과 승인(DONE)이 **모두 성공하는 실측 확인 카드**입니다 — 문서의 BIN 6자리 단독은 400 `INVALID_CARD_NUMBER`, 다른 테스트 번호는 발급은 되지만 승인이 거절됩니다(`NOT_SUPPORTED_CARD_TYPE`).

---

## 9. 기존 빌링키 이관 — `billing.import`

다른 시스템에서 이미 발급받은 빌링키가 있다면 `import`로 스토어에 이관합니다. 형식 검증 후 `store.save`를 거쳐 `BillingProfile`로 승격됩니다.

```ts
const imported = await billing.import({
  customerKey: 'legacy-user-42',
  billingKey: 'Zm9v...',
  method: '카드',
  issuedAt: '2025-01-15T10:00:00+09:00',
  card: { issuerCode: '61', number: '433012******890', cardType: '신용', ownerType: '개인' },
  transfers: null,
});
if (imported.ok) {
  await billing.approve(imported.value, order); // 이후는 일반 프로필과 동일
}
```

⚠ 토스에는 빌링키 조회 API가 없어 **record 값의 진위를 서버에서 재검증할 수 없습니다.** 오염된 record면 타입은 맞고 값은 틀린 프로필이 만들어져 승인 시점에야 실패합니다. 신뢰할 수 있는 원본(기존 운영 DB)에서만 이관하세요.

---

## 10. FAQ

**Q. 빌링 승인이 끝났는지 웹훅으로 알 수 있나요?**
아니요. 토스는 빌링 승인 완료 웹훅을 제공하지 않습니다(빌링 관련 웹훅은 `BILLING_DELETED`뿐). `billing.approve`의 반환값이 완결 신호이고, 필요하면 `client.getPayment`으로 재확인하세요. 그래서 `WebhookHandlers`에 `onBillingApproved` 키가 타입 차원에서 존재하지 않습니다.

**Q. 승인 시한이 10분이라던데 30분이라는 문서도 있어요.**
둘 다 맞고, 서로 다른 구간입니다. **30분** = 결제창 실행부터 구매자 인증까지(라이브러리 통제 밖), **10분** = 인증 완료(successUrl 리다이렉트)부터 confirm 호출까지. 어느 쪽이든 초과하면 `EXPIRED`로 전이되고 이후 confirm은 404 `NOT_FOUND_PAYMENT_SESSION`입니다. `createConfirmFlow`의 `approvalWindowMs`(기본 10분)가 후자를 로컬에서 선판정합니다.

**Q. 멱등키는 얼마나 유지되나요?**
최초 사용일부터 **15일**입니다. 15일이 지난 키의 재사용은 새 요청으로 처리됩니다(중복 실행 위험). 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"이고 **body는 포함되지 않으므로**, 같은 키로 다른 body를 보내는 실수는 라이브러리의 취소 재시도 티켓 봉인이 방지합니다. confirm은 멱등키를 기본 부착하지 않습니다 — 필요 시 `options.idempotencyKey`로 명시하세요.

**Q. 위젯 키와 API 키는 뭐가 다른가요?**
연동 방식이 다릅니다. 결제위젯은 위젯 키 쌍(`gck`/`gsk`), API 개별 연동(빌링 포함)은 API 키 쌍(`ck`/`sk`)을 씁니다. 위젯으로 결제한 건의 confirm에 API 시크릿 키를 쓰면 400 `INVALID_API_KEY`입니다. 이 라이브러리는 키 4종을 별도 타입으로 분리하고 클라이언트에 키 종류를 각인해, 잘못된 조합(위젯 키로 빌링 플로우 생성 등)을 컴파일 에러로 만듭니다.

---

## 라이선스

MIT
