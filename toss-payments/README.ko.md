# @gj-kit/toss-payments

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

TypeScript 서버와 브라우저를 위한 타입 안전 Toss Payments 위젯 및 API v2 흐름입니다.

## 설치

```sh
pnpm add @gj-kit/toss-payments
```

## 사용할 때

결제 키 경계, 주문 금액 검증, 웹훅 신뢰도, 멱등 빌링 흐름을 타입으로 강제해야 할 때 사용합니다.

## 사용하지 않을 때

완전한 주문 시스템으로 취급하거나 raw secret, audit payload, 환불 정책을 범용 계층에 저장하지 마세요.

## Golden path

부팅 시 서버 키를 파싱하고 앱 소유 store로 kit을 조합하며 서버 측 주문 레코드와 대조한 경우에만 승인합니다.

```ts
import * as gjKit from '@gj-kit/toss-payments';

void gjKit;
```

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `@tosspayments/tosspayments-sdk` | `^2` |

## 공개 entry point

- `@gj-kit/toss-payments`
- `@gj-kit/toss-payments/server`
- `@gj-kit/toss-payments/webhook`
- `@gj-kit/toss-payments/browser`
- `@gj-kit/toss-payments/testing`

## 안전 경계

server 키 parser를 브라우저 코드에 import하거나 문서화된 검증 경로 없이 redirect/웹훅을 신뢰하지 마세요. secret과 정확한 audit body는 저장 시 암호화하세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/toss-payments/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/toss-payments/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


**잘못 쓸 수 없는** 토스페이먼츠 V2 연동 라이브러리.

결제 연동 사고의 대부분은 "검증을 깜빡한" 코드에서 나옵니다 — 금액 대조 없이 승인, 상태 확인 없이 취소, 서명 검증 없이 웹훅 신뢰. 이 라이브러리는 *parse, don't validate* 철학을 따릅니다: 검증을 통과했다는 사실이 **브랜디드 타입**으로 남고, 검증을 건너뛴 값은 다음 단계 함수의 파라미터 타입을 충족하지 못해 **컴파일 에러**가 됩니다. 런타임 검사를 잊을 수는 있어도, 타입 체커를 통과하지 못하는 코드를 배포할 수는 없습니다.

여기에 더해 v1.1의 `createTossPayments` 파사드는 **배선을 누락할 수 없게** 만듭니다: 배선하지 않은 플로우는 반환 타입에 프로퍼티 자체가 없어, "컴파일은 되는데 프로덕션에서 터지는" 부분 배선이 사용 시점 컴파일 에러가 됩니다(§2).

- 모든 공개 작업은 `Result<T, E>`를 반환합니다 — throw 없음 (유일한 예외: 부팅 전용 `orThrow`).
- 런타임 의존성 0, Node ≥ 20, Edge 런타임 호환(WebCrypto·fetch만 사용).
- 브라우저 엔트리는 `@tosspayments/tosspayments-sdk` v2를 optional peer로 사용합니다.
- 환불 정책(전체·시간 구간 비율·잔여 일수/회차·custom)과 민감정보 없는 결제 상태 스냅샷을 제공합니다(§4.2).
- 모든 부가 옵션은 **기본 꺼짐**이고, 옵션 내부의 실패가 결제 `Result`를 바꾸는 경로는 존재하지 않습니다(§3).

> **0.4 마이그레이션 — 가상계좌 secret**: `getPayment*()`의 `VirtualAccountPayment.secret`은
> `string | null`입니다. Toss 조회 응답은 승인 때 받은 secret을 다시 주지 않을 수 있습니다.
> 반대로 `confirm`/`confirmCallback`의 `ConfirmedPayment` 가상계좌 분기는 non-empty `string`을
> 보장합니다. confirm이 응답 유실로 실패한 뒤 조회가 가상계좌 `secret: null`을 반환하면
> `resolveFailure()`는 `confirmed-without-deposit-secret`을 돌려줍니다. 결제를 실패/재시도하지
> 말고 주문을 보류해 운영 복구로 처리하세요.

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

## 2. 빠른 시작 — `createTossPayments` 파사드

**골든 패스입니다.** 파사드는 순수 조립층으로, 기존 팩토리 4종(`createTossClient`/`createConfirmFlow`/`createBillingFlow`/`createWebhookVerifier`)에 전량 위임합니다 — 검증 로직 중복이 0이고, 파사드를 써도 검증 강제(브랜디드 타입·필수 스토어)는 그대로입니다. 파사드가 추가로 주는 것은 하나입니다: **배선하지 않은 플로우는 반환 타입에 프로퍼티 자체가 없다** — 부분 배선(키 쌍 혼동, depositSecrets 반쪽 배선, billingKeyStore 미배선)이 런타임이 아니라 사용 시점 컴파일 에러가 됩니다.

```ts
import { idempotencyKey, orThrow } from '@gj-kit/toss-payments';
import { createTossEvents, createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

const toss = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),  // 브랜드 키만 수용 — raw string 미수용
  orders: {                                    // confirm 플로우 배선 — 금액 대조의 단일 진실 공급원
    saveOrder: async (o) => { await db.tossOrder.create({ data: o }); },
    loadOrder: (id) => db.tossOrder.findUnique({ where: { orderId: id } }),
  },
  depositSecrets: {                            // 1회 배선 → confirm측 자동 저장 + 웹훅측 대조 양쪽 커버(§3.1)
    saveSecret: (id, s) => db.deposits.upsert(id, s),
    getSecret: (id) => db.deposits.secretOf(id),
  },
  billingKeys: {                               // billing 플로우 배선 — 미지정 시 kit에 billing 부재
    save: (r, options) => db.billingKeys.upsert(r, options), // operationId fence를 지원하면 반드시 전달
    find: (ck) => db.billingKeys.find(ck),
    // 반드시 한 SQL CAS/transaction: find 후 remove를 따로 하면 재발급된 키를 지울 수 있다.
    delete: ({ customerKey, expectedBillingKey }) =>
      db.billingKeys.deleteIfCurrentKey(customerKey, expectedBillingKey),
  },
  cancelRetries: {                             // exact body는 반드시 암호화 at-rest 저장
    save: (record) => db.cancelRetries.saveEncrypted(record),
    load: (ticketId) => db.cancelRetries.loadDecrypted(ticketId),
    delete: (ticketId) => db.cancelRetries.remove(ticketId),
  },
  webhook: {
    dedupe,                                      // PROCESSING/COMPLETED + crash-recovery lease 구현
    autoRefetch: true,                         // Unverified 이벤트에 조회 재확인 결과 자동 첨부(§3.5)
  },
  events: createTossEvents(),                  // 관측·부수 반응 버스 — 4곳(client/confirm/billing/webhook) 자동 배선(§3.3)
});

await toss.confirm.confirmCallback(req.url);   // OK — orders 배선됨
toss.webhook.fetchHandler({ /* ... */ });      // OK — webhook 배선됨
await toss.billing.approve(profile, order, {
  idempotencyKey: orThrow(idempotencyKey('sub:2026-08:customer-1')),
});                                              // OK — 모든 billing approve에 멱등키 필수
```

배선을 빼먹으면 그 플로우를 **쓰는 줄에서** 컴파일 에러가 납니다:

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

const confirmOnly = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders,
});

await confirmOnly.confirm.createOrder({ amount: 1000, orderName: '플랜' }); // OK

// @ts-expect-error billingKeys 미배선 — billing 프로퍼티 자체가 없다 (사용 시점 컴파일 에러)
await confirmOnly.billing.approve(profile, order);
```

### 컴파일 에러 ↔ 원인 표

조건부 타입의 에러 메시지는 "프로퍼티가 없다"고만 말하고 빠진 config를 직접 말하지 않습니다 — 이 표로 역추적하세요(각 프로퍼티의 TSDoc에도 같은 매핑이 있습니다).

| 에러 메시지(요지) | 원인 | 해결 |
|---|---|---|
| `Property 'confirm' does not exist on type 'TossPaymentsKit<...>'` | config에 `orders` 미배선 | `orders: OrderStore` 추가 |
| `Property 'billing' does not exist ...` | `billingKeys` 미배선 — 또는 위젯 시크릿 키 파사드(빌링은 API 키 전용) | `billingKeys: BillingKeyStore` 추가 / `sk` 파사드 분리 |
| `Property 'webhook' does not exist ...` | `webhook` 미배선 | `webhook: { dedupe }` 추가 |
| `No overload matches this call` | ① 위젯 시크릿 키 + `billingKeys`(키 쌍 규칙 선차단 — 서버 400 `INVALID_API_KEY`를 컴파일에 당겨옴) ② raw string 키(파서 미통과) | ① 빌링은 `sk` 파사드로 ② `orThrow(parseApiSecretKey(...))` |
| `Expected 3 arguments, but got 2` (billing.approve) | 모든 빌링 승인은 멱등키가 필수 | `options.idempotencyKey` 전달(§3.6) |

### 알아둘 것

- **단일 키 = 파사드 1개.** 위젯 결제와 빌링을 병용하는 상점은 파사드 2개(`gsk`용/`sk`용)를 만드세요 — 키 쌍 규칙이 파사드 경계와 일치해, "confirm은 어느 클라이언트로?" 같은 암묵 규칙이 생기지 않습니다.
- **live 키의 API origin은 고정입니다.** 기본적으로 `https://api.tosspayments.com` 외 `baseUrl`은 부팅 시 거부됩니다. 사내 프록시가 꼭 필요할 때만 `dangerouslyAllowCustomLiveBaseUrl: true`를 명시하고, 시크릿 키가 프록시 운영자에게 노출되는 위험을 별도로 승인하세요.
- **config를 스프레드로 동적 구성하지 마세요.** `const` 추론이 풀려 조건부 프로퍼티 판정이 무너질 수 있습니다 — 동적 구성이 필요하면 개별 팩토리(§4)를 직접 쓰고, DI 컨테이너 등 간접 전달에는 `defineTossPaymentsConfig`로 정의 시점에 타입을 고정하세요.

```ts
import { defineTossPaymentsConfig, createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import { orThrow } from '@gj-kit/toss-payments';

export const tossConfig = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders,
});
const kit = createTossPayments(tossConfig);    // 배선 판정(confirm 존재) 보존
await kit.confirm.confirmCallback(req.url);
```

---

## 3. 옵션 카탈로그

모든 옵션의 공통 계약 세 가지:

1. **기본 꺼짐** — 미주입 시 현행 동작과 동일하고 추가 비용이 0에 수렴합니다.
2. **결제 경로 무간섭(협상 불가)** — 옵션 내부의 실패(sink 예외, 이벤트 핸들러 throw, secret 저장 실패)가 결제 `Result`를 바꾸는 경로가 존재하지 않습니다.
3. **추가만** — 전부 기존 시그니처의 옵셔널 확장입니다. 기존 코드는 그대로 컴파일됩니다.

### 3.1 `depositSecrets` — 가상계좌 secret 자동 저장 + 웹훅 대조 1회 배선

가상계좌의 입금 웹훅(`DEPOSIT_CALLBACK`)은 승인 시 받은 `Payment.secret` 대조로 검증합니다. **저장을 누락하면 그 주문의 입금 웹훅이 전부 `unknown-order`로 거부됩니다** — 고객이 입금했는데 주문이 영구 미이행되는 최악의 사고입니다. `DepositSecretStore` 하나로 저장(confirm측)과 조회(웹훅측)를 함께 배선하면 이 갭이 구조적으로 사라집니다.

```ts
import { createConfirmFlow, type DepositSecretStore } from '@gj-kit/toss-payments/server';
import { createWebhookVerifier } from '@gj-kit/toss-payments/webhook';

const depositSecrets: DepositSecretStore = {
  saveSecret: (id, s) => db.deposits.upsert(id, s),   // upsert 시맨틱 — 기존 수동 저장과 병용해도 무해
  getSecret: (id) => db.deposits.secretOf(id),
};

// 개별 조립 시 양쪽에 같은 객체를 — 파사드(§2)는 config.depositSecrets 1개로 자동 배선
const flow = createConfirmFlow(client, orders, {
  depositSecrets,
  onDepositSecretSaveFailed: ({ orderId, paymentKey, cause }) => {
    opsAlert({ orderId, paymentKey, cause });         // payload에 secret 원문 없음(로그 유출 방지)
  },
});
const verifier = createWebhookVerifier({ dedupe, depositSecrets });
```

- **동작**: `confirm`/`confirmCallback`이 Ok이고 **`payment.method === '가상계좌'`일 때만** `saveSecret`을 await 합니다. secret 존재 여부로 판정하지 않습니다 — 실측상 BILLING 카드 결제 응답에도 secret이 non-null로 내려와, 존재 판정이면 빌링 결제마다 무의미한 저장이 발생합니다.
- **실패 시맨틱**: `saveSecret`이 실패해도 confirm은 **Ok 유지**입니다. 승인은 토스 측에서 이미 완결이라, Err로 뒤집으면 "승인됐는데 실패 처리 + 사용자 재confirm"이라는 더 큰 사고가 됩니다. 다만 가상계좌 secret은 조회 API로 복구할 수 없으므로, 통지(`onDepositSecretSaveFailed`/`deposit.secret-save-failed`)를 운영 알림으로 연결하고 주문을 보류해야 합니다. 콜백 미지정 시 실패 1건당 `console.warn` 1회가 납니다.
- **복구 경계**: `getPaymentByOrderId(orderId)`의 `Payment.secret`은 `null`일 수 있습니다. 승인 응답을 놓친 뒤 secret을 조회 재시도로 되살리는 코드를 만들지 마세요. 통지 payload에는 secret 원문이 실리지 않습니다.

### 3.2 `audit` — 아웃바운드 전 req/res 증거 기록

분쟁·CS 대응에는 traceId와 요청/응답 원문이 필요하지만, fetch를 직접 래핑해 로깅하면 Authorization·카드번호 유출이 전형 사고입니다. `audit` 옵션은 모든 confirm/cancel/billing/조회가 통과하는 **단일 관문**을 계측합니다 — 시도 1건 = `AuditEntry` 1건.

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { createFileAuditSink, createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

const auditSink = createFileAuditSink('/var/log/toss-audit.jsonl');  // 참조 구현(JSONL, 단일 인스턴스 전제)
const audited = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  audit: { sink: auditSink, onSinkError: (cause) => opsAlert(cause) },
});
// fire-and-forget이라 프로세스 즉사 시 마지막 엔트리가 유실될 수 있다 — graceful shutdown에 flush/close
process.on('SIGTERM', () => { void auditSink.close(); });
```

- **실패 시맨틱(협상 불가)**: `sink.record()`는 await되지 않습니다(fire-and-forget). sync throw·async rejection 모두 삼켜지고 `onSinkError`로만 통지됩니다 — **audit 오류가 결제 요청의 지연·실패에 영향을 주는 경로가 없습니다**(기록 실패 < 결제 실패).
- **redaction은 비설정화** — 끄는 옵션이 없습니다:

| 대상 | 처리 |
|---|---|
| `Authorization` 헤더 | **필드 자체가 없음** — `AuditEntry`에 헤더가 구조적으로 부재(마스킹이 아님) |
| `cardNumber` `cardPassword` `customerIdentityNumber` `accountNumber` `secret` `billingKey` `authKey` `customerMobilePhone` `bankAccountNumber` | req/res body 재귀 순회, 대소문자 무시 매칭 → `'[REDACTED]'` 치환. 목록은 `AUDIT_REDACTED_KEYS` 상수로 export(감사·버전 관리 대상) |
| `card`/`refundAccount` 하위의 `number` | 컨텍스트 규칙으로 치환(마스킹 카드번호·환불 계좌번호) |
| 인바운드 웹훅 rawBody | **audit 범위 밖** — DEPOSIT_CALLBACK 원문에 secret이 있어 기록하지 않습니다(§9 경고와 동일 근거). audit은 아웃바운드 API 전용 |

- ⚠ redaction 후에도 `responseBody`에 고객 이름·이메일 등 PII가 잔존할 수 있습니다 — 보관 주체·기간·접근 통제는 sink 소유자 책임입니다.

### 3.3 `events` — 타입드 in-process pub/sub

알림·재고·구독 연장 같은 도메인 부수 반응을 confirm 라우트와 웹훅 refetch 경로 양쪽에 각각 심으면 한쪽 누락이 사고가 됩니다. `events`는 단일 구독 지점을 제공합니다 — 파사드는 버스 1개를 client(`api.call`)·confirm·billing·webhook 4곳에 자동 배선합니다.

```ts
import { createTossEvents } from '@gj-kit/toss-payments/server';

const events = createTossEvents({ onHandlerError: (info) => opsAlert(info) });

events.on('payment.confirmed', async ({ payment }) => {
  await sendReceiptMail(payment.orderId);   // 어느 진입점에서 승인돼도 여기 한 곳으로
});
events.on('api.call', (e) => {
  metrics.timing('toss.api', e.durationMs, { path: e.path, outcome: e.outcome });
});
events.on('deposit.secret-save-failed', ({ orderId }) => {
  opsAlert({ kind: 'deposit-secret-lost', orderId });  // §3.1 실패 통지의 이벤트 경로
});
```

- **실패 시맨틱(협상 불가)**: 발화는 `Result` 확정 **후** 동기 fire-and-forget입니다 — 반환값 무시, await 없음. **이벤트가 플로우 결과를 바꾸는 경로가 타입상 존재하지 않습니다.** 핸들러는 개별 try/catch로 격리되고, sync throw·async rejection 모두 `onHandlerError`로만 보고됩니다.
- ⚠ **이벤트로 원장(ledger)을 만들지 마세요.** 전달 보장은 at-most-once·in-process·비영속입니다 — 프로세스 재시작·서버리스 콜드스타트에서 유실됩니다. 원장은 `OrderStore`/DB + `Result` 트랜잭션 처리로, 이벤트는 관측·부수 반응 전용입니다.
- ⚠ `'payment.confirmed'`의 payment에는 secret이 포함될 수 있습니다(실측: BILLING 카드도 non-null) — payload를 통짜 로깅하지 마세요. 기록 용도는 audit(§3.2)입니다(redaction 통과본만 기록됨).
- 발행은 `createTossEvents()` 산출물에만 흐릅니다 — 구조적으로 흉내 낸 객체를 주입하면 발행 지점이 조용히 no-op입니다. 파사드에서 `events`를 미주입하면 `kit.events`는 no-op 구독 표면입니다(구독해도 발화 없음).

### 3.4 `retry` — 실측 근거 하드 가드 자동 재시도

범용 재시도 라이브러리는 토스의 실측 규칙을 모릅니다: **4xx 에러 응답도 멱등키에 15일 바인딩·재생**되므로, 4xx 후 같은 키 재시도는 15일간 같은 에러만 돌려받고, 키 없는 confirm 재전송은 이중 승인 위험입니다. `retry` 옵션은 안전한 경우만 코드에 하드코딩했습니다 — **설정으로도 확장할 수 없습니다**.

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

// 배치/큐 소비자용 파사드 — 요청(사용자 대기) 경로에는 켜지 마세요
const batch = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  retry: {
    maxAttempts: 3,                          // 2 | 3 | 4 | 5 리터럴 — 폭주 설정 원천 차단
    onRetry: ({ attempt, reason, nextDelayMs, path }) => {
      metrics.count('toss.retry', { attempt, reason, path, nextDelayMs });
    },
  },
});
```

재시도가 일어나는 조건은 다음 넷뿐입니다(코드 고정):

1. **GET**: 전송 실패(transport)만 — 조회는 자체 멱등.
2. **Idempotency-Key가 실제 부착된 POST/DELETE의 전송 실패**: 동일 키+동일 body 재전송은 서버에 도달했었다면 바이트 동일 재생, 미도달이면 재실행(실측 — 이중 실행 없음).
3. **409 `IDEMPOTENT_REQUEST_PROCESSING`**(키 부착 시): 문서 지시("다시 요청해서 응답을 확인하세요") 준수. 재시도 후 원 요청이 4xx로 끝났으면 그 에러를 재생받고 종료합니다 — 처리 결과 확인이라는 올바른 동작입니다.
4. **그 외 전부 재시도 없음**: 키 없는 POST(confirm 기본 정책)는 어떤 실패든 자동 재시도 절대 없음(이중 승인 방지 — `retryable: true`여도 무시). 토스 4xx/5xx 에러 응답도 재시도하지 않습니다(4xx는 멱등 재생 실측 확정, 5xx는 미실측 보수 배제) — 왜 `PROVIDER_ERROR`를 자동 재시도하지 않는지는 §5 참고.

- confirm에 retry 효과를 받으려면 `options.idempotencyKey` 명시가 전제입니다(기본 미부착 — §12 FAQ).
- 기본 지연은 `[500, 2_000, 8_000]ms` + full jitter ±25% — **최악 +10.5초**(+ 시도별 timeout 독립 적용)입니다. `maxAttempts`는 2~5, 각 `delaysMs`는 0~60,000ms 안전한 정수이며 빈 배열은 부팅 시 거부합니다. 사용자가 기다리는 confirm 경로에 켜야 한다면 `maxAttempts: 2`를 권장합니다. 409 폴링은 테스트 환경 분당 100건 쿼터를 소모합니다.
- cancel의 `CancelRetryTicket`(§5)과 역할이 다릅니다: retry는 "요청 내" 자동화, 티켓은 "요청 간(큐 저장 후)" 수동 재실행 — 티켓 동봉은 그대로 유지됩니다.

### 3.5 webhook `autoRefetch` — Unverified에 조회 재확인 결과 자동 첨부

서명 없는 웹훅(`PAYMENT_STATUS_CHANGED` 등)의 payload를 그대로 믿으면 위조 POST 한 방에 이행이 뚫립니다. 재확인 조회를 "잊을 수 있는 호출"에서 "이미 되어 있는 값"으로 바꿉니다.

```ts
// 파사드: webhook.autoRefetch: true → 내부 client 자동 결속. 핸들러 골든 패스가 1줄이 된다:
export const POST = toss.webhook.fetchHandler({
  onPaymentStatusChanged: async (w) => {
    if (w.prefetched?.ok) await syncStatus(w.prefetched.value);  // payload가 아닌 조회 결과로 갱신
  },
});
```

- **실행 시점**: 어댑터(`fetchHandler`/`nodeHandler`)의 핸들러 디스패치 직전이며 dedupe 통과분에만 수행됩니다. prefetch와 핸들러가 성공하고 claim이 `COMPLETED`가 된 뒤에만 200을 반환합니다. 빠른 응답이 필요하면 핸들러가 내구적 큐에 적재하는 지점까지 책임지세요.
- **실패 시맨틱**: `prefetched`가 Err여도 핸들러에는 도달합니다. 핸들러가 실패를 던지면 claim을 해제하고 5xx로 재전송을 유도합니다. **prefetched 실패 시 payload 폴백은 금물입니다.**
- **trust는 `'unverified'` 그대로입니다** — 조회 성공은 웹훅 발신자 진위를 증명하지 않습니다(위조 웹훅이 실존 orderId를 찍으면 조회는 성공합니다). 개별 조립 시에는 `autoRefetch: { client, eventTypes?: [...] }`로 결속하고, `eventTypes` 필터로 분당 100건 쿼터를 방어할 수 있습니다.

### 3.6 빌링 approve — 멱등키 상시 강제

cron 중복 실행·큐 at-least-once에서 멱등키 없는 `billing.approve` 2회 = **이중 과금**입니다. 그래서 모든 구성에서 `options.idempotencyKey`가 타입 필수이며, JavaScript나 강제 캐스팅으로 우회해도 API 전송 전에 `missing-idempotency-key`로 거부합니다.

```ts
import { idempotencyKey, orThrow } from '@gj-kit/toss-payments';
import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

const strict = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  billingKeys: {
    save: (r, options) => db.billingKeys.upsert(r, options),
    find: (ck) => db.billingKeys.find(ck),
    delete: ({ customerKey, expectedBillingKey }) =>
      db.billingKeys.deleteIfCurrentKey(customerKey, expectedBillingKey),
  },
});

// @ts-expect-error 멱등키 없는 approve — 모든 구성에서 컴파일 차단
await strict.billing.approve(profile, order);

await strict.billing.approve(profile, order, {
  idempotencyKey: orThrow(idempotencyKey(`sub:2026-08:${profile.customerKey}`)),
});
```

- **키 권장**: 청구 주기 결정적 값(`sub:${period}:${customerKey}`) — 재실행 시 첫 응답 재생으로 무해합니다.
- ⚠ **4xx 실패 후 파라미터를 고쳐 재시도할 땐 반드시 새 키**(실측 — 동일 키는 15일간 같은 에러를 재생). 일시 오류가 결정적 키에 바인딩되면 해당 주기 재청구가 15일 막힙니다 — 재시도에는 `sub:${period}:${customerKey}:retry-${attempt}`처럼 attempt suffix를 붙이세요.
- orderId 기반 키 **자동** 유도는 의도적으로 제공하지 않습니다 — 결정적 키 + 4xx 재생 조합의 함정을 라이브러리가 사용자 몰래 떠안게 되기 때문입니다. 명시적 유도는 `deriveIdempotencyKey({ operation, parts, attempt? })`로 합니다(§5 "멱등키 유도와 재시도 규율" — `<operation>:<parts…>#<attempt>` 형식, 서로 다른 입력은 절대 같은 키가 되지 않습니다) — attempt 접미사를 호출자가 직접 결정하므로 같은 함정이 코드에 드러납니다.
- `idempotencyKey(raw)` 파서는 1–300자에 더해 **공백 없는 출력 가능 ASCII**(`^[\x21-\x7E]+$`)만 받습니다(`bad-charset`). 한글·공백·CR/LF가 섞인 키는 `Idempotency-Key` 헤더로 전송되지 못하거나(fetch `Headers`가 TypeError) 중간 프록시가 바꿀 수 있어, Ok인 키만 "같은 바이트로 재전송 가능"을 보장합니다.

### 3.7 `resolveConfirmFailure` — confirm 실패는 결제 실패가 아니다

confirm의 Err에는 "승인됐는데 응답만 유실"(transport)과 "새로고침 이중 confirm"(`ALREADY_PROCESSED_PAYMENT`)이 섞여 있습니다. 일괄 실패 처리하면 **"돈은 나갔는데 실패 안내"** 라는 최악의 CS 사고가 납니다. 조회로 진실을 확정한 뒤 4분기하세요.

```ts
import { isErr } from '@gj-kit/toss-payments';

const done = await confirmFlow.confirm(verified);
if (isErr(done)) {
  const resolved = await confirmFlow.resolveFailure(verified.orderId, done.error);
  if (isErr(resolved)) return respond503();            // 조회도 실패 = 진실 미확정 — 성공/실패 어느 쪽으로도 단정 안내 금지
  switch (resolved.value.resolution) {
    case 'actually-confirmed':                         // 조회로 DONE|WAITING_FOR_DEPOSIT + 안전한 secret 확인
      return completeOrder(resolved.value.payment);
    case 'confirmed-without-deposit-secret':           // 가상계좌 lookup secret:null — 재confirm 금지
      return new Response(null, { status: 202 });      // 주문 보류 + 운영 알림은 앱의 durable queue로
    case 'retry-payment':                              // NOT_FOUND_PAYMENT_SESSION(10분 초과) — 결제 재요청 유도
      return redirectToCheckout();
    case 'definitively-failed':                        // 조회로도 미승인 확정
      return showFailure(resolved.value.error);
  }
}
```

- 판정 로직: transport 실패 또는 `ALREADY_PROCESSED_PAYMENT` → `getPaymentByOrderId` 조회 후 상태로 확정. 가상계좌가 `secret:null`이면 결제 자체는 확인됐지만 DEPOSIT_CALLBACK 대조값을 복구할 수 없으므로 `confirmed-without-deposit-secret`으로 보류합니다. `NOT_FOUND_PAYMENT_SESSION`(및 라이브러리의 시한 초과 선판정) → 조회 없이 `retry-payment`. 그 외 REJECT/AUTH 계열 → 즉시 `definitively-failed`.
- 플로우 없이 쓰는 자유 함수 `resolveConfirmFailure(client, orderId, error)`도 export 됩니다. `ConfirmFlow.resolveFailure`는 플로우의 client를 재사용하며, provider가 예외적으로 secret을 보존한 `actually-confirmed`일 때만 depositSecrets 저장 경로를 재사용합니다.

---

## 4. 개별 조립 — 팩토리 4종 직접 배선

파사드(§2)가 골든 패스지만, config를 동적으로 구성해야 하거나 플로우 하나만 필요할 때는 개별 팩토리를 직접 씁니다. 검증 강제는 동일합니다 — 파사드는 이들을 호출할 뿐입니다.

### 4.1 결제위젯: 주문 생성 → 위젯 → 승인

#### 서버: 주문 생성 (금액 고정 + 저장이 한 호출)

```ts
// lib/toss.ts
import { orThrow } from '@gj-kit/toss-payments';
import {
  parseWidgetSecretKey, createTossClient, createConfirmFlow,
  type DepositSecretStore, type OrderStore,
} from '@gj-kit/toss-payments/server';

const widgetClient = createTossClient(orThrow(parseWidgetSecretKey(process.env.TOSS_WIDGET_SECRET_KEY!)));
const orders: OrderStore = {
  saveOrder: async (o) => { await db.tossOrder.create({ data: o }); },
  loadOrder: (id) => db.tossOrder.findUnique({ where: { orderId: id } }),
};
// §3.1 표준 배선 — 가상계좌 secret은 confirm 성공 시 자동 저장된다(수동 저장 한 줄이 필요 없음)
export const depositSecrets: DepositSecretStore = {
  saveSecret: (id, s) => db.deposits.upsert(id, s),
  getSecret: (id) => db.deposits.secretOf(id),
};
export const confirmFlow = createConfirmFlow(widgetClient, orders, { depositSecrets }); // 스토어 없이는 플로우 생성 불가
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

#### 브라우저: 위젯 렌더 → 결제 요청

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

#### 서버: successUrl 콜백 — 명시적 3단계 + 실패 3분기

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

  const done = await confirmFlow.confirm(verified.value);       // [3] 승인 — 가상계좌면 secret 자동 저장(§3.1)
  if (isErr(done)) {
    // §3.7 — confirm Err ≠ 결제 실패. 조회로 진실을 확정한 뒤 분기한다.
    const resolved = await confirmFlow.resolveFailure(verified.value.orderId, done.error);
    if (isErr(resolved)) return new Response(null, { status: 503 }); // 진실 미확정 — 단정 안내 금지
    if (resolved.value.resolution === 'actually-confirmed')
      return Response.redirect(new URL(`/orders/${resolved.value.payment.orderId}/complete`, req.url));
    if (resolved.value.resolution === 'confirmed-without-deposit-secret')
      return new Response(null, { status: 202 }); // 주문 보류 + 운영 알림은 앱의 durable queue로
    if (resolved.value.resolution === 'retry-payment')
      return Response.redirect(new URL('/checkout?expired=1', req.url));
    return Response.redirect(new URL('/checkout/fail', req.url));
  }
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
> - **금액은 양의 안전한 정수** — `createOrder`와 successUrl parser는 분수·0·음수·안전 범위 밖 수를 API 호출 전에 거부합니다. `approvalWindowMs`도 provider의 10분 시한을 넘길 수 없고 1~600,000ms 안전한 정수만 허용합니다.
> - **10분 시한** — 인증 완료 후 10분 안에 confirm하지 않으면 결제는 `EXPIRED`가 되고, 이후 confirm은 404 `NOT_FOUND_PAYMENT_SESSION`(재시도 불가 최종 실패)입니다. `verify`가 시한을 함께 판정합니다.
> - 가상계좌 confirm의 결과는 `DONE`이 아니라 `WAITING_FOR_DEPOSIT`일 수 있습니다 — `ConfirmedPayment` 타입이 두 상태를 모두 담습니다. secret 저장은 §3.1 배선이 소유하므로 라우트에 수동 저장 코드를 두지 마세요.

### 4.2 결제 취소: 조회 → asCancelable → 실행

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
  const expectedBalanceAmount =
    order.paidAmount - order.providerCompletedRefundAmount;         // 현재 장부상 환불 가능 잔액

  const c = checked.value;
  let result;
  if (c.kind === 'deposited-virtual-account') {                     // [3] 실행 — kind 내로잉이 컴파일 강제
    result = await client.cancels.cancelFully(c, {
      reason, expectedAmount: expectedBalanceAmount,
      refundAccount: orThrow(refundAccount({ bank: '88', accountNumber: req.body.account, holderName: req.body.holder })),
    });
  } else if (c.kind === 'awaiting-deposit') {                       // 입금 전 — 전액취소만 가능
    result = await client.cancels.cancelFully(c, { reason, expectedAmount: expectedBalanceAmount });
  } else if (req.body.amount != null) {
    if (!c.partialAllowed) return res.status(422).json({ error: 'partial cancel not allowed' });
    result = await client.cancels.cancelPartially(c, { reason, amount: req.body.amount });
  } else {
    result = await client.cancels.cancelFully(c, { reason, expectedAmount: expectedBalanceAmount });
  }

  if (isErr(result)) {
    if (result.error.source === 'network') {
      if (!result.error.retry.durable) opsAlert(result.error.retry);
      else await retryQueue.push(result.error.retry.ticketId);      // 불투명 ID만 큐에 적재 — §5
      return res.status(503).end();
    }
    return res.status(422).json(result.error);
  }
  res.json({ fullyCanceled: result.value.fullyCanceled });          // status로 판정하지 않는다
});
```

`expectedAmount`에 서버가 알려준 `balanceAmount`를 되돌려 넣지 마세요 — 검증이 항진식이 됩니다. 반드시 **자체 DB의 현재 환불 가능 잔액**(예: 결제액 - provider 완료로 확정한 누적 환불액)을 넣으세요. 최초 결제액을 그대로 넣으면 부분환불 뒤의 전액환불이 항상 mismatch로 막힙니다.

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **전액 취소 후에도 status는 `CANCELED`가 아닐 수 있다(실측)** — 부분취소 이력이 있는 결제를 잔액 전액 취소하면 status가 `PARTIAL_CANCELED`로 남습니다. 정상 취소 응답의 완전 취소 금액 기준은 `balanceAmount === 0`이고, 라이브러리는 이를 `CancelOutcome.fullyCanceled`로 제공합니다. 일반 `Payment`에서는 잔액 0에 취소 status/이력 신호가 함께 있어야 `isFullyCanceled`이며, status·잔액이 모순이면 `asCancelable`이 `inconsistent-payment-state`로 실행을 막습니다.
> - **재취소 에러는 두 얼굴(실측)** — 단일 전액취소 후 재취소는 400 `ALREADY_CANCELED_PAYMENT`, 부분취소 이력 후 재취소는 403 `NOT_CANCELABLE_AMOUNT`. `isAlreadyFullyCanceledError`가 양쪽을 수용합니다.
> - **가상계좌 분기는 오버로드로 강제** — 입금 완료 가상계좌는 `refundAccount` 필수, 일반 결제는 `?: never`로 금지, 입금 전(`WAITING_FOR_DEPOSIT`)은 전액취소만 가능(부분취소 오버로드 자체가 없음).
> - **부분취소 가능 여부도 강제** — 조회 응답의 `isPartialCancelable`이 `true`인 결제만 `cancelPartially`에 전달할 수 있고, 강제 캐스팅 우회도 런타임에서 거부됩니다.
> - **진행 중 취소에는 새 capability를 발급하지 않음** — 취소 이력에 `IN_PROGRESS`가 하나라도 있으면 `asCancelable`이 `pending-cancellation`을 반환합니다. provider가 `ABORTED`로 최종 거부한 취소 응답도 성공 `CancelOutcome`이 아니라 `cancel-aborted` 오류입니다.
> - **잔액 초과 취소는 API 호출 전에 차단** — 우회해서 보내면 서버가 403 `NOT_CANCELABLE_AMOUNT`를 반환합니다(실측). 동시 취소 경합은 서버 낙관적 잠금(`NOT_MATCHES_REFUNDABLE_AMOUNT`)이 잡아내며, 라이브러리는 조회 시점 잔액을 항상 `refundableAmount`로 전송합니다.

#### 4.2.1 환불 정책: 계산 → quote 저장/복원 → 준비 → 실행

Toss API의 용어는 `cancel`이고, “24시간 이내 100%, 7일 이내 80%, 이후 환불 없음” 같은 규칙은 서비스의 `refund policy`입니다. 두 계층을 섞지 않습니다. 정책은 환경 중립인 루트 엔트리에서 실행 가능한 `RefundQuote`를 만들고, 서버 엔트리의 `prepareRefund`가 quote를 방금 조회한 `CancelablePayment`에 결속합니다. 이어 `prepareRefundExecution`이 요청과 멱등키를 봉인하고, `executeRefund`가 Payment를 재조회한 뒤 기존 `cancelFully`/`cancelPartially`에 위임합니다.

```ts
import {
  REFUND_TIME,
  createRefundPolicy,
  orThrow,
  type Payment,
} from '@gj-kit/toss-payments';

const subscriptionRefundPolicy = orThrow(createRefundPolicy({
  id: 'subscription-cancellation',
  version: '2026-08-01',
  kind: 'elapsed-time-rate',
  rounding: 'floor',                  // 금액 반올림은 정책에서 반드시 명시
  brackets: [                         // [이전 경계, untilMs) 반열린 구간
    { untilMs: 24 * REFUND_TIME.hour, rateBps: 10_000, reason: '24시간 이내' },
    { untilMs: 7 * REFUND_TIME.day, rateBps: 8_000, reason: '7일 이내' },
  ],
  fallbackRateBps: 0,
  fallbackReason: '환불 가능 기간 종료',
  quoteTtlMs: 5 * REFUND_TIME.minute, // 정책 경계와 이 TTL 중 더 이른 시각에 만료
}));

export function quoteSubscriptionRefund(input: {
  payment: Payment;                   // getPayment로 방금 조회한 값
  paidAmount: number;                 // 프로젝트 장부의 정책 기준 금액
  providerCompletedRefundAmount: number;
  expectedBalanceAmount: number;      // 프로젝트 장부의 현재 Toss 환불 가능 잔액
  evaluatedAt: Date;
}) {
  if (input.payment.approvedAt === null) return null;
  return subscriptionRefundPolicy.quote({
    payment: input.payment,
    basisAmount: input.paidAmount,
    alreadyRefundedAmount: input.providerCompletedRefundAmount,
    expectedBalanceAmount: input.expectedBalanceAmount,
    evaluatedAt: input.evaluatedAt,
    anchorAt: new Date(input.payment.approvedAt),
  });
}
```

`rateBps`는 100%를 `10_000`, 80%를 `8_000`으로 표현합니다. 내부 계산은 `BigInt` 곱셈 뒤 `floor | ceil | half-up`으로 정수화합니다. 정책상 누적 entitlement에서 이미 완료된 환불을 빼서 **이번 실행액**을 만들며, 계산액이 최신 잔액을 넘는 경우 조용히 잔액으로 줄이지 않고 오류를 반환합니다.

남은 일자 비율은 달력 경계와 요청 당일 포함 여부를 명시합니다. 기간은 `[startsOn, endsOnExclusive)`입니다.

```ts
import {
  createRefundPolicy,
  isErr,
  orThrow,
  remainingCalendarDays,
  type Payment,
} from '@gj-kit/toss-payments';

const remainingDaysPolicy = orThrow(createRefundPolicy({
  id: 'subscription-remaining-days',
  version: '2026-08-01',
  kind: 'remaining-units',
  rounding: 'floor',
}));

export function quoteRemainingDays(input: {
  payment: Payment;
  paidAmount: number;
  providerCompletedRefundAmount: number;
  expectedBalanceAmount: number;
  startsOn: string;
  endsOnExclusive: string;
  evaluatedAt: Date;
}) {
  const days = remainingCalendarDays({
    startsOn: input.startsOn,
    endsOnExclusive: input.endsOnExclusive,
    evaluatedAt: input.evaluatedAt,
    timeZone: 'Asia/Seoul',
    requestDay: 'consumed',            // 요청 당일은 이미 사용한 날로 계산
  });
  if (isErr(days)) return days;

  return remainingDaysPolicy.quote({
    payment: input.payment,
    basisAmount: input.paidAmount,
    alreadyRefundedAmount: input.providerCompletedRefundAmount,
    expectedBalanceAmount: input.expectedBalanceAmount,
    evaluatedAt: input.evaluatedAt,
    validUntil: new Date(days.value.validUntil), // 다음 Asia/Seoul 자정
    totalUnits: days.value.totalUnits,
    remainingUnits: days.value.remainingUnits,
  });
}
```

일수 외에도 회차·사용량·정확한 밀리초를 `totalUnits`/`remainingUnits`로 넘길 수 있습니다. 프로젝트 고유 규칙은 `createCustomRefundPolicy<Context>({ calculate })`로 연결하며, callback도 `Result<RefundEntitlement, E>`를 반환합니다. 공통 장부 검증·반올림·quote 형식은 그대로 유지됩니다. 모든 quote에는 exclusive `validUntil`이 있으며 기본 TTL은 5분입니다. 경과시간 정책은 다음 구간 경계, 달력 정책은 `remainingCalendarDays().validUntil`을 함께 적용해 더 이른 시각에 자동 만료됩니다.

`RefundQuote`는 JSON으로 감사·저장할 수 있지만, 직렬화하면 비열거 실행 seal은 의도적으로 사라집니다. `parseRefundQuote(unknown)`은 구조와 공통 산술만 검증한 **비실행** `ParsedRefundQuote`를 반환합니다. 저장값을 다시 실행하려면 저장 당시와 같은 `policy.id`/`version` 설정과 quote 입력으로 `policy.restoreQuote`를 호출해야 합니다. `restoreQuote`가 내부에서 parse까지 수행하므로 별도 `parseRefundQuote` 호출은 감사 화면·진단에 구조만 먼저 읽고 싶을 때 선택적으로 사용합니다.

```ts
import {
  createRefundPolicy,
  isErr,
  orThrow,
  parseRefundQuote,
  type ParsedRefundQuote,
  type Payment,
} from '@gj-kit/toss-payments';

const persistedPercentagePolicy = orThrow(createRefundPolicy({
  id: 'subscription-percentage',
  version: '2026-08-01',
  kind: 'percentage',
  rateBps: 8_000,
  rounding: 'floor',
}));

export function restoreStoredPercentageQuote(input: {
  stored: unknown;
  payment: Payment;                    // fresh GET 결과가 저장 시 fingerprint/잔액과 같아야 함
  basisAmount: number;
  alreadyRefundedAmount: number;
  expectedBalanceAmount: number;
  evaluatedAt: string;                 // 저장 당시 quote 입력 시각
}) {
  const inspected = parseRefundQuote(input.stored);
  if (isErr(inspected)) return inspected;
  const parsed: ParsedRefundQuote = inspected.value; // 감사/표시 가능, 실행은 불가

  return persistedPercentagePolicy.restoreQuote(parsed, {
    payment: input.payment,
    basisAmount: input.basisAmount,
    alreadyRefundedAmount: input.alreadyRefundedAmount,
    expectedBalanceAmount: input.expectedBalanceAmount,
    evaluatedAt: new Date(input.evaluatedAt),
  }); // exact 재계산이 일치해야 runtime-sealed RefundQuote 반환
}
```

정책 저장소는 quote의 `policy.id`/`version`으로 **그 견적을 만든 정확한 정책 설정**을 선택해야 합니다. `evaluatedAt`뿐 아니라 경과시간 정책의 `anchorAt`, 달력 정책의 `validUntil`·단위, custom 정책의 context처럼 재계산에 필요한 원본 사실도 프로젝트 DB에서 복원할 수 있어야 합니다. custom calculator는 같은 context에 결정적인 결과를 내야 하며 외부 요금표·사용량을 읽는다면 그 스냅샷 버전도 context에 포함하세요. 최신 정책이나 최신 시각으로 `restoreQuote`하지 마세요. 정책을 새로 평가하려는 경우에는 새 quote와 새 환불 요청·멱등키를 만드세요. `parseRefundQuote`는 서명 검증기가 아니므로 저장 quote와 재계산 입력/context의 무결성·CAS는 여전히 프로젝트 DB가 소유합니다.

실행 계획에는 현재 결제 스냅샷이 비열거 심볼로 봉인됩니다. 정책 실행 API에서는 프로젝트 요청 ID에 대응하는 안정적인 멱등키가 필수입니다.

```ts
import { idempotencyKey, isErr, type RefundQuote } from '@gj-kit/toss-payments';
import {
  executeRefund,
  prepareRefund,
  prepareRefundExecution,
  type CancelReason,
  type SettledCancelable,
} from '@gj-kit/toss-payments/server';

export async function executeSettledRefund(input: {
  target: SettledCancelable;
  quote: RefundQuote;                  // policy.quote 또는 policy.restoreQuote 결과만 허용
  reason: CancelReason;
  refundRequestId: string;             // DB의 프로젝트 환불 요청 ID
}) {
  const prepared = prepareRefund(input.target, input.quote);       // quote → 현재 상태 plan
  if (isErr(prepared) || prepared.value.kind === 'no-refund') return prepared;
  const key = idempotencyKey(input.refundRequestId);
  if (isErr(key)) return key;

  const attempt = prepareRefundExecution(                       // request + key 불변 봉인
    prepared.value,
    { reason: input.reason },
    { idempotencyKey: key.value },
  );
  if (isErr(attempt)) return attempt;

  return executeRefund(client, attempt.value);                  // fresh GET 뒤 Toss cancel
}
```

`prepareRefund`는 `policy.quote` 또는 `policy.restoreQuote`가 발급한 runtime-sealed quote만 받습니다. JSON parse 결과, object spread, 강제 캐스팅에는 seal이 없어 런타임에서도 `invalid-quote`로 거부됩니다. 그다음 paymentKey/orderId/currency·잔액뿐 아니라 status, method, lastTransactionKey, 부분취소 가능 여부와 민감정보 없는 취소 이력 지문을 대조합니다. canonical quote가 `full`이면 전액, `partial`이면 부분취소 가능 여부를 다시 확인합니다. `prepareRefundExecution`은 취소 사유·세금·환불계좌·cancelRequestId와 멱등키를 한 attempt에 봉인하므로 같은 attempt를 다른 본문으로 재사용할 수 없습니다. `executeRefund`는 Toss에서 Payment를 다시 조회한 뒤 상태 지문과 `validUntil`을 재검증하고 기존 cancel primitive에 위임합니다.

기존 취소가 `IN_PROGRESS`면 저수준 `asCancelable`부터 추가 요청을 막고, 입금 완료 가상계좌는 기존과 동일하게 `refundAccount`가 필수입니다. 견적이나 정책 경계가 바뀌면 재조회 → 재견적 → 새 프로젝트 환불 요청 ID/멱등키로 시작하세요. 비열거 봉인이 붙은 plan/attempt는 영속화 대상이 아닙니다.

#### 4.2.2 결제·환불 상태 스냅샷

`PaymentStatus`는 단방향 상태 머신이 아닙니다. 가상계좌 입금 오류에는 `DONE → WAITING_FOR_DEPOSIT` 역전이가 있고, 해외 간편결제 취소는 금액상 잔액이 줄었어도 `cancelStatus: 'IN_PROGRESS'`일 수 있습니다. 그래서 라이브러리는 전이를 임의로 거부하지 않고, 민감 필드를 제거한 스냅샷과 두 스냅샷의 diff를 제공합니다.

```ts
import {
  diffPaymentState,
  summarizePaymentState,
  type Payment,
  type PaymentStateSnapshot,
} from '@gj-kit/toss-payments';

export function inspectPaymentUpdate(previous: PaymentStateSnapshot, fresh: Payment) {
  const next = summarizePaymentState(fresh);     // secret/raw/카드·계좌/취소 사유 제외
  const compared = diffPaymentState(previous, next);
  if (!compared.ok) return compared;             // 다른 paymentKey/orderId만 Err

  if (next.hasPendingCancellation) {
    // provider 완료로 장부 환불액을 올리지 않는다. 재조회로 DONE을 확인해야 한다.
  }
  return compared;                               // 잔액 증가·취소 이력 제거는 warning
}
```

`amountState: 'none' | 'partial' | 'full'`과 `hasPendingCancellation`은 독립 축입니다. 금액상 `full`이어도 provider 확정 전이면 lifecycle은 성공 상태가 아니라 `cancellation-pending`입니다. 따라서 `CancelOutcome.pending === true`인 응답을 곧바로 `REFUND_SUCCEEDED`로 원장에 기록하지 마세요. `CANCEL_STATUS_CHANGED` 웹훅도 `unverified` 등급이므로 payload만 믿지 말고 기존 `prefetched`/`refetch()` 경로로 최신 `Payment`를 조회한 뒤 `summarizePaymentState`를 다시 만드세요. 스냅샷에는 `schemaVersion: 1`이 있고 직렬화 가능하지만, 저장 순서·CAS·원장은 프로젝트 DB가 소유합니다. in-process 이벤트 버스를 원장으로 쓰면 안 됩니다.

**최소 입력 — `PaymentStateInput`.** `summarizePaymentState`는 전체 `Payment`가 아니라 요약이 실제로 읽는 8필드 Pick(`paymentKey`/`orderId`/`status`/`totalAmount`/`balanceAmount`/`lastTransactionKey`/`isPartialCancelable`/`cancels`)을 받습니다. 시그니처는 `PaymentStateInput | Payment` 유니언이라 전체 `Payment`는 인라인 리터럴로 Payment 고유 필드를 나열한 경우(excess-property 검사)까지 포함해 그대로 할당됩니다 — 기존 호출부는 변화가 없고, `raw`/`secret`/카드 상세를 제거한 앱 소유 축약 뷰에서도 스냅샷을 만들 수 있게 된 것입니다. 단, 8필드는 실제 응답값의 충실한 사본이어야 합니다 — 타입을 맞추려고 `lastTransactionKey`나 `isPartialCancelable`을 지어내면 정합성·취소 가능 판정이 provider 상태가 아니라 그 조작을 설명하게 됩니다.

**브랜드 경계 밖으로 — 직렬화와 복원.** `PaymentStateSnapshot`의 `paymentKey`/`orderId`는 브랜드 타입이라 그대로 응답 DTO·큐·저장 컬럼에 실으면 브랜드가 경계를 넘습니다. `serializePaymentStateSnapshot`이 브랜드를 벗긴 `SerializedPaymentStateSnapshot`(plain `string` id, JSON 안전)을 만들고, `parsePaymentStateSnapshot(value: unknown)`이 구조를 전수 검증한 뒤 기존 `paymentKey`/`orderId` 파서로 재브랜딩해 되돌립니다(검증 통과가 브랜드 획득의 유일한 경로 유지). 실패는 `Err`이며 `error.path`가 오염 지점을 지목합니다. 언트러스트 값의 각 own 프로퍼티는 정확히 한 번만 읽으므로(접근자 기반 바꿔치기 차단), 검증된 값이 곧 브랜드 결과에 담기는 값입니다. parse는 형태 게이트이지 재요약이 아닙니다 — 단, 장부 대조가 의존하는 단 하나의 산술 불변식(`canceledAmount === totalAmount - balanceAmount`, 두 금액이 안전 정수일 때)은 교차 검증하며, `lifecycle` 같은 나머지 파생 필드는 `schemaVersion`이 고정한 규칙으로 이미 계산된 데이터로 신뢰합니다.

```ts
import {
  serializePaymentStateSnapshot,
  summarizePaymentState,
  type PaymentStateInput,
  type SerializedPaymentStateSnapshot,
} from '@gj-kit/toss-payments';

// 게이트웨이 안: 스냅샷 생성 → 브랜드 제거 → 경계 밖(DTO/큐/컬럼)으로
export function toStateDto(payment: PaymentStateInput): SerializedPaymentStateSnapshot {
  return serializePaymentStateSnapshot(summarizePaymentState(payment));
}
```

**장부 대조 — `compareLedgerRefund`.** "provider가 내 장부가 주장하는 환불을 확정했는가"를 provider 스냅샷 관점으로만 판정합니다. 누적 취소액은 `snapshot.canceledAmount`, 진행액은 `IN_PROGRESS` 취소 트랜잭션의 `cancelAmount` 합입니다. 잔액 모델은 이 절 서두와 취소 경로의 2xx 검증이 실측으로 고정한 그것입니다 — **접수된 비동기 취소는 `IN_PROGRESS` 상태에서 이미 잔액을 줄였으므로 진행액은 `canceledAmount` 안에 포함되어 있고**, `ABORTED`로 끝나면 잔액이 복원됩니다. 따라서 최종 확정액은 `[canceledAmount - pendingCancelAmount, canceledAmount]` 구간 안이며, `settled`는 "목표 일치 + 진행 중 취소 없음"일 때만 나옵니다. **장부 목표(`expectedRefundedAmount`)는 앱이 소유·검증·영속하는 값이며, 라이브러리는 유도하지도 저장하지도 않습니다.**

```ts
import { compareLedgerRefund, parsePaymentStateSnapshot } from '@gj-kit/toss-payments';

const ledgerTarget = 300; // 장부 목표 — 앱 소유
const revived = parsePaymentStateSnapshot(await db.paymentSnapshots.load('pay_1'));
if (!revived.ok) {
  opsAlert(revived.error); // error.path가 오염 지점을 지목
} else {
  const verdict = compareLedgerRefund(revived.value, { expectedRefundedAmount: ledgerTarget });
  switch (verdict.kind) {
    case 'settled':     // 확정 누적 취소액 = 장부 목표, 진행 중 취소 없음 → 원장 확정 가능
      break;
    case 'unconfirmed': // IN_PROGRESS 취소가 남아 결과가 잠정적(ABORTED로 되돌 수 있음)
      break;            //   → 원장 확정 금지, 재조회로 최신 Payment를 받아 다시 대조
    case 'mismatch':    // 목표가 가능한 결과 밖(direction) 또는 판정 불가('indeterminate')
      opsAlert(verdict);
      break;
  }
}
```

`unconfirmed`는 **엄격히 "취소가 provider에 접수되어 진행 중"인 경우**입니다. 앱 대사 로직이 흔히 두는 "환불 요청이 provider에 도달하지 못한 것 같다 — 봉인된 요청을 재실행해도 안전" 상태(UNCONFIRMED류)는 이 헬퍼에서 `unconfirmed`가 아니라 `mismatch`/`provider-below-ledger`로 나타납니다. 세 이름을 앱의 3분류에 1:1로 매핑하지 마세요. 대신 현재 대사 중인 단일 환불 요청 금액을 `requestedAmount`로 함께 주면, 그 mismatch에 `shortfall`이 동봉됩니다:

```ts
import { compareLedgerRefund } from '@gj-kit/toss-payments';

// providerSnapshot: 재조회한 Payment의 summarizePaymentState 결과
const verdict = compareLedgerRefund(providerSnapshot, {
  expectedRefundedAmount: 3900, // 장부 목표 = 이전 확정 환불 + 이번 요청
  requestedAmount: 3900,        // 이번에 대사 중인 단일 환불 요청 금액
});
if (verdict.kind === 'mismatch' && verdict.direction === 'provider-below-ledger') {
  if (verdict.shortfall === 'at-prior-state') {
    // provider가 정확히 요청 전 금액이고 진행 중 취소도 없음 — 요청이 provider에
    // 도달하지 못했을 가능성이 높다. 봉인된(멱등) 취소 요청 재실행이 자연스러운 복구.
  } else {
    // 'unexplained' (또는 requestedAmount 미제공): 자동 재실행 금지, 사람에게 에스컬레이션.
  }
}
```

`mismatch`의 `direction: 'indeterminate'`는 스냅샷 금액이 신뢰 불가(`invalid-amount`/`balance-exceeds-total` 이슈 — `consistencyIssues`로 동봉)이거나 장부 목표 자체가 유효하지 않을 때(`invalidLedgerTarget: true`)입니다. "status CANCELED이고 totalAmount만 유효하면 전액 환불로 간주" 같은 폴백은 의도적으로 구현하지 않았습니다 — 그건 추측이고, 추측으로 원장을 확정할지는 앱의 명시적 정책이어야 합니다. 스냅샷과 장부 목표가 같은 결제의 것인지는 이 헬퍼가 검증할 수 없는 호출부 책임입니다.

### 4.3 자동결제(빌링): 인증 → 발급 → 승인

#### 브라우저: 등록 인증창

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

#### 서버: 콜백 → 세션 대조 → 발급 (명시적 단계)

정기 승인에서는 모든 구성에서 멱등키 누락이 컴파일 에러입니다(§3.6).

```ts
import { isErr, customerKey } from '@gj-kit/toss-payments';
import {
  parseBillingAuthCallback, confirmPendingAuth, createBillingFlow,
} from '@gj-kit/toss-payments/server';

const billingFlow = createBillingFlow(client, {              // client는 API 시크릿 키('api') 클라이언트만
  save: (r, options) => db.billingKeys.upsert(r, options),   // 저장이 유일한 보관 수단 — operationId도 전달
  find: (ck) => db.billingKeys.find(ck),
  // 조건부 delete를 DB 안에서 끝낸다. find() 뒤 remove() 두 호출은 TOCTOU 취약점이다.
  delete: ({ customerKey, expectedBillingKey }) =>
    db.billingKeys.deleteIfCurrentKey(customerKey, expectedBillingKey),
});

app.get('/billing/callback', async (c) => {
  const parsed = parseBillingAuthCallback(c.req.url);                    // [1] 파싱 — authKey는 봉인
  if (isErr(parsed)) return c.json(parsed.error, 400);
  if (parsed.value.status !== 'authorized') return c.redirect('/billing/canceled');

  const sessionCk = customerKey(await session.get(c, 'customerKey'));    // 세션 값이 진실
  if (isErr(sessionCk)) return c.json({ error: 'no session' }, 401);

  const auth = confirmPendingAuth(parsed.value.pending, sessionCk.value); // [2] 세션 대조 → AuthKeyReceived
  if (isErr(auth)) return c.json({ error: 'customerKey mismatch' }, 403);

  const profile = await billingFlow.issue(auth.value);                   // [3] 발급 + store.save까지 보장
  if (isErr(profile)) {
    if (profile.error.source === 'library' && profile.error.kind === 'store-save-failed')
      opsAlert(profile.error.issuedRecord);                              // 키 유실 방지 반출
    return c.json(profile.error, 502);
  }
  return c.redirect('/subscription/active');
});
```

#### 서버: 정기 승인 (스케줄러는 직접 — 토스 미제공)

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
  }, { idempotencyKey: orThrow(idempotencyKey(`sub:2026-08:${rawCk}`)) }); // 모든 구성에서 필수

  if (isErr(paid) && paid.error.source === 'toss' && paid.error.code === 'ALREADY_REMOVED_BILLING_KEY')
    await requestReauth(rawCk);                              // 갱신 API 없음 — 재발급 플로우 재시작
  return paid;
}
```

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **`NOT_MATCHES_CUSTOMER_KEY`(실측 400)** — 콜백 쿼리로 돌아온 customerKey는 위변조 가능한 값입니다. `confirmPendingAuth`가 세션에 저장된 값과 대조를 통과해야만 발급 가능한 `AuthKeyReceived`가 됩니다. 승인 단계에서도 `BillingOrder`에는 customerKey 필드 자체가 없고 `BillingProfile` 봉인 쌍으로만 승인하므로, 다른 고객 키로 승인하는 사고가 구조적으로 불가능합니다.
> - **토스에는 빌링키 조회 API가 없다** — 저장 실패 = 영구 유실입니다. 그래서 `createBillingFlow`는 `BillingKeyStore` 없이 생성할 수 없고, `issue`는 `store.save` 성공 후에만 Ok이며, 저장 실패 시 발급된 record를 에러에 동봉해 수동 복구 여지를 남깁니다.
> - **삭제는 현재 키 조건부 CAS입니다** — `BillingKeyStore.delete({ customerKey, expectedBillingKey })`는 저장소 안에서 비교와 삭제를 원자적으로 끝내 `stale BillingProfile`이 재발급된 더 새 키를 지우지 않게 해야 합니다. 필수 request 객체라 예전 `delete(customerKey)` 구현이 구조적으로 호환되는 실수도 막습니다. `billing.revoke()`의 Ok 값 `{ currentStoredKeyDeleted }`가 `false`이면 원격의 오래된 키 처리는 성공했어도 현재 로컬 credential은 건드리지 않았다는 뜻입니다. 이때 `billing.revoked` 이벤트도 발행되지 않습니다.
> - **빌링키 갱신 API도 없다** — `refresh` 류 메서드는 의도적으로 없습니다. `ALREADY_REMOVED_BILLING_KEY`를 만나면 revoke 후 새 인증부터 다시입니다.
> - **billingKey는 어디에도 노출되지 않는다** — `BillingProfile`의 공개 필드·JSON 직렬화에 billingKey가 없습니다. 스프레드/직렬화로 봉인이 소실된 복제본은 `approve`에서 `profile-detached` Err — `billing.load(customerKey)`로 재수화하세요.

발급 뒤 앱 자신의 subscription/intent projection을 별도 DB에 완료해야 한다면, `billing.issue(..., { idempotencyKey })`가 같은 값을 `store.save(record, { operationId })`로 전달합니다. 이것은 **post-persistence fence용 상관관계 값**이며 provider 호출 순서를 직렬화하지는 않습니다. 해당 기능을 지원하는 저장소에서는 고유한 intent-derived idempotency key로 현재 operation을 잠금 transaction 안에서 다시 확인하고, 불일치면 finalization을 fail-closed 하세요. raw billing/auth key·카드/계좌 정보는 `operationId`에 넣지 않습니다.

#### 카드 발급사 코드 → 표시명 — `cardIssuerName`

발급 응답과 `Payment.card`의 `issuerCode`/`acquirerCode`는 항상 **두 자리 기관 코드**입니다(`'21'` 하나카드, `'11'` KB국민카드, `'3K'` 기업 BC …). 공식 기관 코드 표(국내 24 + 해외 6)를 `CARD_ISSUER_NAMES_KO`(동결 객체)로 전사했고, `cardIssuerName(code)`는 미등록 코드에 `undefined`를 돌려줍니다 — 폴백 문구는 앱이 정합니다. 표는 문서 전사이지 제품 copy가 아니므로, 더 짧은 라벨이 필요하면 앱 계층에서 덮어쓰세요.

```ts
import { cardIssuerName } from '@gj-kit/toss-payments';
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';

function describeBillingMethod(record: BillingKeyRecord): string {
  if (record.card === null) return '계좌이체';
  const issuer = cardIssuerName(record.card.issuerCode) ?? '카드';   // 토스가 기관을 추가하면 undefined — 중립 폴백
  return `${issuer} ${record.card.number.slice(-4)}`;               // number는 토스가 마스킹한 값
}
```

### 4.4 웹훅 수신: raw body → verify → prefetched

```ts
import { createWebhookVerifier, parseSecurityKey } from '@gj-kit/toss-payments/webhook';
import { orThrow } from '@gj-kit/toss-payments';
import { depositSecrets } from '@/lib/toss';

const verifier = createWebhookVerifier({
  dedupe,                                           // 원자적 claim + complete/release + lease 구현
  securityKeys: [orThrow(parseSecurityKey(process.env.TOSS_SECURITY_KEY!))],  // 로테이션 시 [새 키, 옛 키]
  depositSecrets,                                  // §3.1 — confirm측 자동 저장과 같은 store
  autoRefetch: { client },                         // §3.5 — 어댑터 경유 Unverified에 prefetched 첨부
});
```

수동 배선(프레임워크 어댑터는 §6 참고 — 수동 verify 경로에는 `prefetched`가 첨부되지 않습니다):

```ts
const result = await verifier.verify(rawBody, headers, { sourceIp: clientIp });
if (!result.ok) {
  return result.error.kind === 'store-failure' || result.error.kind === 'processing'
    ? respond503()
    : respond400();
}
if (result.value.duplicate) return respond200();   // 재전송 — 정상 ack 후 스킵
const webhook = result.value.webhook;
try {
  if (webhook.trust === 'unverified') {
    const fresh = await webhook.refetch(client);    // 조회 API로 승격 — payload를 믿지 않는다
    if (!fresh.ok) throw new Error('payment refetch failed');
    await syncStatus(fresh.value);
  }
  await verifier.complete(webhook);                 // 내구적 처리 완료 뒤에만 COMPLETED
  return respond200();
} catch {
  await verifier.release(webhook);                  // 재전송이 다시 처리에 진입하도록 보상
  return respond503();
}
```

> **왜 이 단계를 건너뛸 수 없는가**
>
> - **토스는 모든 이벤트에 서명을 제공하지 않습니다** — 서명(HMAC)이 있는 이벤트는 `payout.changed`/`seller.changed`뿐이고, 가상계좌 입금(`DEPOSIT_CALLBACK`)은 승인 시 저장한 `secret` 대조, 나머지(결제 상태 변경 포함)는 **암호학적 검증 수단이 없습니다**. 그래서 이 라이브러리에는 단일 `Verified` 타입이 없고 신뢰 3등급(§6 표)을 정직하게 노출합니다. `unverified` 등급은 조회 API 재확인(`prefetched` 또는 `refetch`)을 거쳐야 신뢰 가능한 `Payment`가 됩니다.
> - **verify는 raw body만 받습니다** — 파싱된 객체를 받는 오버로드는 없습니다. JSON 파싱을 먼저 하면 서명 검증이 원천 불가능해지기 때문입니다.
> - **일반 이벤트의 source IP는 기본 fail-closed입니다** — 서명·secret이 없는 이벤트는 `sourceIp`가 없거나 내장 허용목록 밖이면 거부됩니다. 프록시가 재작성한 신뢰 가능한 주소만 전달하세요. 로컬 픽스처 테스트에서만 `allowedSourceIps: false`를 명시적으로 사용할 수 있습니다.
> - **서명 이벤트는 전송 시각도 검증합니다** — 기본 과거/미래 허용 폭은 5분이며, 유효한 HMAC이라도 오래된 재생 요청은 거부됩니다.
> - **dedupe 스토어는 필수입니다** — `claim`은 원자적이어야 하고 `PROCESSING`에는 crash-recovery lease, `COMPLETED`에는 최장 재전송 기간보다 긴 TTL을 두어야 합니다. 완료된 중복은 정상 verdict(`duplicate: true`)지만 처리 중 동시 전달은 503 재시도 신호입니다.

---

## 5. 에러 처리 — Result와 3종 판별

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

### 왜 `retryable: true`(PROVIDER_ERROR 등)를 retry 옵션이 자동 재시도하지 않나

실측 확정 사실: **4xx 에러 응답도 멱등키에 15일 바인딩·재생됩니다.** 그래서 —

- **같은 키 자동 재시도**는 15일간 원본 에러만 재생받습니다(무의미).
- **새 키 자동 재발급 재시도**는 멱등 보호를 라이브러리가 스스로 폐기하는 것입니다 — 첫 요청이 부분 처리됐는지 판별할 수 없어, 이중 승인/이중 취소를 사용자 몰래 감수하게 됩니다.

`retryable: true`의 의미는 "**새 멱등키 + 상황 판단**으로 재시도할 가치가 있다"이지 자동화 신호가 아닙니다. retry 옵션(§3.4)이 자동 재시도하는 경우는 응답 미수신(transport)과 409 `IDEMPOTENT_REQUEST_PROCESSING` 둘뿐이며, 이 판정은 설정으로 확장할 수 없습니다(`onRetry.reason`이 2종 리터럴로 봉인된 이유).

### 취소 재시도 티켓 — 응답 유실 시 안전한 재실행

취소 요청이 `network` 실패하면 응답을 못 받았을 뿐 서버에는 도달했을 수 있습니다. 에러에 동봉된 `CancelRetryTicket`에는 동일 요청을 가리키는 불투명 `ticketId`와 멱등키 메타만 있고, 실제 path/body는 `cancelRetries` 저장소에 보관됩니다. 저장소를 배선하면 **네트워크 요청 전에** record를 저장하고, 저장 실패 시 취소 요청을 보내지 않습니다. 따라서 토스 처리 직후 프로세스가 종료돼도 `retryById(ticketId)`로 **동일 멱등키 + 동일 body**를 재실행할 수 있습니다. 정상 응답 또는 확정적인 토스 오류 뒤에는 record를 제거하고, 응답 유실 때만 남깁니다. 티켓은 `DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS`(14일 — provider TTL 15일에서 하루 여유)가 지나면 로컬에서 `retry-ticket-expired`로 거부되어 멱등 TTL 만료 뒤 새 취소로 실행되는 사고를 막습니다. 만료된 티켓의 복구는 재전송이 아니라 `getPayment` 조회입니다.

```ts
const retried = await client.cancels.retry(ticket);
const recoveredAfterRestart = await client.cancels.retryById(ticket.ticketId);
```

confirm 실패의 복구는 §3.7 `resolveConfirmFailure`가 담당합니다 — transport 실패를 티켓 없이 조회로 확정합니다.

### 멱등키 유도와 재시도 규율 — 결정적 키 · 재생 창 · 조회 우선

cron·큐 소비자가 빌링 승인이나 취소를 직접 굴리면 세 가지 provider 지식을 앱마다 손으로 복제하게 됩니다: "같은 논리 이벤트는 같은 키", "15일 안에는 같은 키 재전송이 재생", "이 에러 뒤에는 조회부터". 루트 엔트리가 셋을 순수 함수로 제공합니다 — 네트워크·저장소 접근 없음, 환경 중립.

| 심볼 | 역할 |
|---|---|
| `TOSS_IDEMPOTENCY_KEY_TTL_MS` | 문서상 멱등키 바인딩 기간 **15일**(ms). 15일 뒤 같은 키가 어떻게 처리되는지는 문서에 없으므로 "새 요청으로 실행될 수 있다"로 취급합니다. |
| `DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS` | 보수적 재생 창 **14일** — provider가 "15일"을 일 단위로만 밝히고 경계·시간대를 명시하지 않는 점과 양쪽 시계 편차를 하루로 흡수합니다. 전제는 `issuedAt`을 첫 네트워크 시도 **이전**에 기록하는 것(그래야 provider의 최초 사용 시각의 하한). 라이브러리 자신의 `CancelRetryTicket` 만료도 이 값입니다. |
| `deriveIdempotencyKey({ operation, parts, attempt? })` | `<operation>:<parts…>` (+ `#<attempt>`)를 만들어 기존 `idempotencyKey` 파서로 검증합니다(1–300자). 세그먼트는 비어 있으면 `empty`, 구분자 `:`/`#`·공백·비ASCII를 포함하면 `bad-charset` — 그래서 **서로 다른 입력은 절대 같은 키가 되지 않고**(단사), Ok인 키는 항상 전송 가능합니다. 같은 입력 → 같은 키. |
| `isWithinIdempotencyReplayWindow(issuedAt, now, windowMs?)` | `now - issuedAt < windowMs`일 때 true(상한 **배타** — 정확히 창 길이가 지나면 false). 비유한 입력(Invalid Date·NaN·±Infinity, 세 인자 모두)은 false. |
| `OUTCOME_QUERY_FIRST_ERROR_CODES` / `mustQueryOutcomeBeforeRetry(failure)` | 재시도·실패 처리 **전에 결제 상태를 조회해야 하는** 실패 — transport 전부 + `ALREADY_PROCESSED_PAYMENT`·`IDEMPOTENT_REQUEST_PROCESSING`·`FORBIDDEN_CONSECUTIVE_REQUEST`·TRANSIENT 계열(`PROVIDER_ERROR`, `FAILED_INTERNAL_SYSTEM_PROCESSING` 등). source/code로만 판정하며 HTTP status는 보지 않습니다. 불변식 "retryable 코드 전부 포함"은 코드 테이블의 키 `CLASSIFIED_TOSS_ERROR_CODES`에 대해 테스트로 고정됩니다. |

```ts
import {
  deriveIdempotencyKey, isDone, isErr, isWithinIdempotencyReplayWindow, mustQueryOutcomeBeforeRetry,
} from '@gj-kit/toss-payments';

const subscriptionId = 'sub_01';
const periodStart = new Date('2026-09-01T00:00:00+09:00');

// [1] 결정적 키 — 같은 논리 이벤트(구독 × 청구 주기)는 프로세스가 재시작돼도 같은 키를 재현한다.
//     형식 <operation>:<parts…>(#<attempt>). 세그먼트에 `:`/`#`·공백·비ASCII가 있으면 bad-charset이라
//     서로 다른 입력이 같은 키로 뭉치는 일이 없다. attempt 생략 = "재생 의도" — 4xx를 받고 파라미터를
//     고쳐 다시 보낼 때만 새 attempt(UUID 등)를 붙인다.
const derived = deriveIdempotencyKey({
  operation: 'subscription_renewal',
  parts: [subscriptionId, String(periodStart.getTime())],               // ISO 문자열(`:` 포함)이 아니라 epoch
});
if (isErr(derived)) return opsAlert(derived.error);                    // empty / bad-charset / too-long — 구성 오류. Ok면 전송 가능

// [2] provider 호출 **전에** 제출 시각을 남긴다 — 응답 유실 뒤 "재생 가능한가"의 기준 시각(provider 최초 사용의 하한)
await db.charges.markSubmitted(order.orderId, derived.value, new Date());

const paid = await billing.approve(profile, order, { idempotencyKey: derived.value });
if (isErr(paid)) {
  if (paid.error.source === 'library') return showFailure(paid.error); // API 미도달 — 조회할 결과가 없다
  if (!mustQueryOutcomeBeforeRetry(paid.error)) return showFailure(paid.error); // 확정 거절(REJECT/AUTH/REQUEST 계열)

  // [3] 조회 우선 — 응답 유실·처리 중·일시 오류 뒤에는 돈이 이미 나갔을 수 있다. FAILED로 먼저 적지 않는다.
  const looked = await client.getPaymentByOrderId(order.orderId);
  if (!isErr(looked)) {
    const payment = looked.value;
    if (isDone(payment)) return completeOrder(payment);                // DONE — 성공 확정
    if (payment.status === 'ABORTED' || payment.status === 'EXPIRED' || payment.status === 'CANCELED') {
      return showFailure(paid.error);                                  // 종결 실패 — 실패 확정
    }
    return retryQueue.push({ orderId: order.orderId });                // READY/IN_PROGRESS 등 비종결 — 아직 진행 중. 실패로 적지 말고 재판정
  }

  // 원 요청이 아직 실행 중일 수 있는 경우 — transport 실패, 409 IDEMPOTENT_REQUEST_PROCESSING,
  // 403 FORBIDDEN_CONSECUTIVE_REQUEST — 에는 조회 NOT_FOUND가 "실행 안 됨"의 증거가 아니다.
  // 새 attempt가 아니라 **같은 키**를 지연 후 재전송한다(아래 워커) — 재생이거나 1회 실행이라 안전.
  const stillRunning = paid.error.source === 'network' || paid.error.category === 'CONCURRENCY';
  if (stillRunning) return retryQueue.push({ orderId: order.orderId });

  if (looked.error.source === 'toss' && looked.error.code === 'NOT_FOUND_PAYMENT') {
    return showFailure(paid.error);                                   // 응답을 받은 TRANSIENT 오류 뒤 NOT_FOUND — 기록조차 없음, 새 attempt로 재청구 가능
  }
  return opsAlert({ orderId: order.orderId, error: looked.error });   // 조회도 실패 = 진실 미확정 — 큐에 넣어 나중에 재판정
}
```

나중에 재판정하는 워커는 **창 안이면 같은 키 재전송, 창 밖이면 조회만**입니다. 창 안의 재전송은 요청이 토스에 도달했었다면 첫 응답을 바이트 동일 재생하고(처리 중이면 다시 409 — 다음 턴에 재시도), 미도달이었다면 지금 1회 실행합니다(실측). 창 밖에서는 같은 키가 **새 요청**으로 실행될 수 있으므로 재전송이 곧 이중 과금 위험입니다.

```ts
import { isWithinIdempotencyReplayWindow, type IdempotencyKey } from '@gj-kit/toss-payments';

const submitted: { idempotencyKey: IdempotencyKey; at: Date } = await db.charges.submission(order.orderId);

if (isWithinIdempotencyReplayWindow(submitted.at, Date.now())) {       // 기본 창 14일
  await billing.approve(profile, order, { idempotencyKey: submitted.idempotencyKey }); // 재생 또는 1회 실행
} else {
  await client.getPaymentByOrderId(order.orderId);                     // 재전송 금지 — 조회로만 확정
}
```

- `attempt`가 존재하는 이유: **4xx 에러 응답도 같은 키에 15일 재생**됩니다(§5 위). 결정적 키만 쓰면 일시 오류 한 번이 그 청구 주기를 15일 잠급니다. 재시도는 `attempt: crypto.randomUUID()`처럼 **새 attempt를 명시**하세요 — 라이브러리는 사용자 몰래 키를 바꾸지 않습니다. 단, 원 요청이 아직 실행 중일 수 있는 transport 실패·`IDEMPOTENT_REQUEST_PROCESSING`·`FORBIDDEN_CONSECUTIVE_REQUEST` 뒤에는 attempt를 **바꾸지 말고** 같은 키를 재전송하세요.
- `parts`에는 `orderId`·`customerKey`·`cancelRequestId`·UUID·epoch처럼 라이브러리가 이미 검증하는 문자셋의 값이 그대로 들어갑니다(`_ . @ = -` 허용). 구분자 `:`/`#`가 필요한 값(ISO 타임스탬프 등)은 epoch나 날짜만으로 바꾸세요 — 키는 `reason: 'bad-charset'`으로 구성 시점에 거부됩니다.
- `parts`에 raw billingKey·authKey·카드/계좌번호를 넣지 마세요 — 키는 요청 헤더와 audit 기록에 실립니다.
- `mustQueryOutcomeBeforeRetry`는 미등록 코드에 false를 돌려줍니다(라이브러리가 보증할 수 없는 코드). 알 수 없는 5xx에 대한 보수 정책은 앱이 한 줄로 덧붙이세요. 확정 표는 `OUTCOME_QUERY_FIRST_ERROR_CODES`로, 라이브러리가 분류하는 코드 전체는 `CLASSIFIED_TOSS_ERROR_CODES`로 export 되어 감사·버전 관리 대상입니다.
- confirm 경로에는 §3.7 `resolveConfirmFailure`가 이미 같은 규율(조회로 확정)을 내장하고 있습니다 — 이 절의 헬퍼는 취소·빌링 승인·앱 소유 큐처럼 라이브러리가 조회를 대신할 수 없는 경로용입니다.

---

## 6. 웹훅 신뢰 3등급과 프레임워크 어댑터

| trust | 대상 이벤트 | 검증 수단 | 후속 조치 |
|---|---|---|---|
| `'signature'` | `payout.changed`, `seller.changed` | HMAC-SHA256 서명 (키 로테이션 배열 지원) | 그대로 신뢰 가능 |
| `'secret'` | `DEPOSIT_CALLBACK` (가상계좌 입금) | 승인 시 저장한 `Payment.secret` 대조 | 그대로 신뢰 가능 |
| `'unverified'` | 나머지 전부 (`PAYMENT_STATUS_CHANGED`, `BILLING_DELETED` 등) | **없음 — 토스가 미제공** | `prefetched`(§3.5) 또는 `refetch(client)`로 조회 API 재확인 |

### Next.js Route Handler (Fetch 표준 어댑터)

```ts
// app/api/webhooks/toss/route.ts
export const POST = verifier.fetchHandler({
  onDepositCallback: async ({ event }) => {                 // trust: 'secret' — 대조 통과분만 도달
    if (event.status === 'DONE') await fulfillOrder(event.orderId);   // paymentKey 없음 — orderId 기반
    if (event.status === 'WAITING_FOR_DEPOSIT') await revertToAwaiting(event.orderId); // 입금 오류 역전이
  },
  onPaymentStatusChanged: async (w) => {                    // trust: 'unverified'
    if (w.prefetched?.ok) {
      await syncStatus(w.prefetched.value);                 // §3.5 autoRefetch — 이미 조회된 결과로 갱신
    } else if (w.prefetched === undefined) {
      const fresh = await w.refetch(client);                // autoRefetch 미설정 시 수동 승격
      if (fresh.ok) await syncStatus(fresh.value);
    }
    // prefetched가 Err면 payload 폴백 금물 — 다음 재전송(최대 7회)이 자연 재시도다
  },
  onBillingDeleted: async (w) => { await deactivateSubscription(w.event.data.billingKey); },
}, {
  // 기본은 256 KiB. ingress/body-parser 제한과 같은 값으로 명시해도 됩니다.
  maxBodyBytes: 256 * 1024,
  // 이 헤더는 외부 요청 값을 그대로 통과시키지 않고 ingress가 반드시 덮어써야 합니다.
  sourceIp: (request) => request.headers.get('x-trusted-client-ip'),
});
// raw body 보존·검증·dedupe·complete/release를 어댑터가 소유합니다.
// 핸들러 성공 뒤에만 200, 실패하면 claim 해제 + 500으로 재전송을 유도합니다.
```

### Express (Node 어댑터) — `express.raw` 주의

```ts
// ⚠ JSON 파싱 미들웨어(express.json)를 이 경로에 두지 마세요 — raw body가 파괴되면 서명 검증이 불가능합니다.
import { DEFAULT_WEBHOOK_MAX_BODY_BYTES } from '@gj-kit/toss-payments/webhook';

const maxBodyBytes = DEFAULT_WEBHOOK_MAX_BODY_BYTES;

app.post('/webhooks/toss', express.raw({ type: '*/*', limit: maxBodyBytes }), verifier.nodeHandler({
  onDepositCallback: async ({ event }) => { await fulfillOrder(event.orderId); },
}, {
  maxBodyBytes,
  sourceIp: (request) => {
    const value = request.headers['x-trusted-client-ip'];
    return typeof value === 'string' ? value : undefined;
  },
}));
```

### 수신 body 상한과 핸들러 deadline

`fetchHandler`와 `nodeHandler`는 기본으로 **256 KiB**까지만 raw body를 수용합니다.
`Content-Length`가 상한을 넘으면 body를 읽기 전에 413을 반환하고, 헤더가 없거나 거짓이어도
스트림을 상한까지만 누적한 뒤 413으로 끝냅니다. 이 경로는 검증·dedupe·앱 핸들러에 도달하지
않습니다. 결제 웹훅은 작은 제어 메시지여야 하므로 상한을 크게 풀지 말고, 필요한 경우
`maxBodyBytes`와 ingress/프레임워크의 body limit을 같은 값으로 설정하세요.

특히 Express의 `express.raw()`는 이 라이브러리가 받기 전에 Buffer를 만들 수 있습니다. 따라서
위 예시처럼 `express.raw({ limit: maxBodyBytes })`를 함께 써야 프로세스 메모리 할당까지
제한됩니다. Next.js·Fetch 런타임에서는 어댑터가 직접 stream을 제한합니다.

어댑터는 핸들러를 임의로 timeout/cancel하지 않습니다. DB 반영이 진행된 뒤 핸들러만 중단하면
claim 상태와 실제 부수효과가 어긋날 수 있기 때문입니다. 핸들러는 검증된 이벤트를 **내구성 있는
inbox/outbox에 저장하는 지점까지만** 빠르게 끝내고, entitlement·메일·외부 호출 같은 느린 작업은
worker가 처리하세요. 배포 환경의 request timeout은 현재 provider callback SLA보다 짧지 않게
설정하고, 200 응답 지연·processing lease·재전송 수를 모니터링해야 합니다.

`onBillingApproved` 같은 핸들러 키는 **타입에 없습니다** — 토스가 빌링 승인 웹훅을 제공하지 않기 때문입니다(§9 FAQ).

> ⚠ **rawBody를 로그에 남기지 마세요.** DEPOSIT_CALLBACK 원문에는 검증용 `secret`이 들어 있습니다. 라이브러리는 검증 후 이벤트 객체에서 secret을 제거하지만, 수신 원문을 직접 로깅하면 그 방어가 무의미해집니다. 같은 이유로 audit(§3.2)도 인바운드 웹훅을 기록하지 않으며, `webhook.accepted` 이벤트(§3.3)는 secret이 제거된 요약 3필드만 담습니다.

---

## 7. 테스트 유틸 — `/testing`

토스 테스트 환경은 웹훅을 localhost로 보낼 수 없고 등록 API도 없어, CI는 페이로드 시뮬레이션이 정답입니다. `/testing` 엔트리가 실수신과 동일한 형태의 픽스처를 만들어 줍니다.

```ts
import {
  webhookFixture, signWebhookPayload,
  memoryOrderStore, memoryBillingKeyStore, memoryDedupeStore,
  memoryDepositSecretStore, memoryAuditSink,
  TEST_BILLING_CARD,
} from '@gj-kit/toss-payments/testing';

// 웹훅 왕복 테스트 — 생성한 픽스처를 그대로 verify에 통과
const { rawBody, headers } = webhookFixture.depositCallback({ orderId: 'order_1', secret: 'ps_...' });
const verdict = await verifier.verify(rawBody, headers);

// 유효 서명이 포함된 v2 이벤트 (생성→검증 왕복) — 서명이 WebCrypto라 async
const signed = await webhookFixture.signedEvent({ eventType: 'payout.changed', entityBody: {}, securityKey: secKey });

// 인메모리 스토어 — 플로우 팩토리·파사드의 필수 인자를 테스트에서 충족
const flow = createConfirmFlow(client, memoryOrderStore(), { depositSecrets: memoryDepositSecretStore() });
const billingFlow = createBillingFlow(client, memoryBillingKeyStore());
const v = createWebhookVerifier({ dedupe: memoryDedupeStore() });

// 감사 로그 검증 — 기록된 AuditEntry를 배열로 노출
const sink = memoryAuditSink();
```

`TEST_BILLING_CARD`(`9410001234567890`)는 테스트 환경에서 빌링키 발급(신용/개인)과 승인(DONE)이 **모두 성공하는 실측 확인 카드**입니다 — 문서의 BIN 6자리 단독은 400 `INVALID_CARD_NUMBER`, 다른 테스트 번호는 발급은 되지만 승인이 거절됩니다(`NOT_SUPPORTED_CARD_TYPE`).

### 부작용 없는 상태 단정 — readonly inspection

memory 스토어 5종은 `memoryAuditSink().entries`와 같은 관례의 **부작용 없는 inspection**을 제공합니다. 특히 dedupe는 이것 없이는 상태 단정에 `claim()` 프로브를 다시 불러야 했는데, release 뒤의 프로브는 키를 `processing`으로 재점유해 이후 단정을 오염시킵니다. `stateOf`는 조회만 하고 항목을 만들지 않습니다.

```ts
import {
  memoryBillingKeyStore, memoryCancelRetryStore, memoryDedupeStore,
  memoryDepositSecretStore, memoryOrderStore,
} from '@gj-kit/toss-payments/testing';

const dedupeStore = memoryDedupeStore();
dedupeStore.stateOf('tx-1');               // 'processing' | 'completed' | undefined(미점유·release됨)
memoryOrderStore().orderOf('order_1');     // StoredOrder | undefined
memoryBillingKeyStore().recordOf('cust');  // BillingKeyRecord | undefined
memoryDepositSecretStore().secretOf('order_1'); // string | undefined
memoryCancelRetryStore().recordOf('ticket');    // CancelRetryRecord | undefined
```

반환 객체는 **방어적 복사**(빌링키 레코드는 중첩 `card`/`transfers`까지 깊은 복사)라 테스트가 변이해도 스토어가 오염되지 않고, 타입 수준에서도 전 필드 readonly입니다. 기존 스토어 메서드 시그니처는 그대로입니다.

---

## 8. 기존 빌링키 이관 — `billing.import`

다른 시스템에서 이미 발급받은 빌링키가 있다면 `import`로 스토어에 이관합니다. 형식 검증 후 `store.save`를 거쳐 `BillingProfile`로 승격됩니다.

```ts
import { idempotencyKey, orThrow } from '@gj-kit/toss-payments';

const imported = await billing.import({
  customerKey: 'legacy-user-42',
  billingKey: 'Zm9v...',
  method: '카드',
  issuedAt: '2025-01-15T10:00:00+09:00',
  card: { issuerCode: '61', number: '433012******890', cardType: '신용', ownerType: '개인' },
  transfers: null,
});
if (imported.ok) {
  await billing.approve(imported.value, order, {
    idempotencyKey: orThrow(idempotencyKey('legacy:first-charge:42')),
  }); // 이후는 일반 프로필과 동일
}
```

⚠ 토스에는 빌링키 조회 API가 없어 **record 값의 진위를 서버에서 재검증할 수 없습니다.** 오염된 record면 타입은 맞고 값은 틀린 프로필이 만들어져 승인 시점에야 실패합니다. 신뢰할 수 있는 원본(기존 운영 DB)에서만 이관하세요.

---

## 9. FAQ

**Q. 위젯 결제와 빌링을 한 서비스에서 같이 쓰려면 파사드를 어떻게 구성하나요?**
파사드 2개를 만드세요 — 위젯 confirm용(`gsk` 키 + `orders`)과 빌링·취소·조회용(`sk` 키 + `billingKeys` 등). 단일 키 = 파사드 1개 원칙은 토스의 키 쌍 규칙(위젯 결제 confirm은 `gsk`, 빌링은 `sk`)과 경계가 일치해, "confirm은 어느 클라이언트로 나가나" 같은 암묵 규칙이 생기지 않게 하기 위한 것입니다. 위젯 키 파사드에 `billingKeys`를 넣으면 오버로드 불충족 컴파일 에러입니다(§2 표).

**Q. 빌링 승인이 끝났는지 웹훅으로 알 수 있나요?**
아니요. 토스는 빌링 승인 완료 웹훅을 제공하지 않습니다(빌링 관련 웹훅은 `BILLING_DELETED`뿐). `billing.approve`의 반환값이 완결 신호이고, 필요하면 `client.getPayment`으로 재확인하세요. 그래서 `WebhookHandlers`에 `onBillingApproved` 키가 타입 차원에서 존재하지 않습니다. 승인 완료에 대한 인프로세스 부수 반응이 필요하면 `events`의 `'billing.approved'`(§3.3)를 구독하세요 — 단, 이벤트는 관측 전용이지 원장이 아닙니다.

**Q. 승인 시한이 10분이라던데 30분이라는 문서도 있어요.**
둘 다 맞고, 서로 다른 구간입니다. **30분** = 결제창 실행부터 구매자 인증까지(라이브러리 통제 밖), **10분** = 인증 완료(successUrl 리다이렉트)부터 confirm 호출까지. 어느 쪽이든 초과하면 `EXPIRED`로 전이되고 이후 confirm은 404 `NOT_FOUND_PAYMENT_SESSION`입니다. `createConfirmFlow`의 `approvalWindowMs`(기본 10분)가 후자를 로컬에서 선판정하고, 초과가 이미 벌어졌다면 `resolveFailure`(§3.7)가 `retry-payment` 분기로 안내합니다.

**Q. 멱등키는 얼마나 유지되나요?**
최초 사용일부터 **15일**입니다(`TOSS_IDEMPOTENCY_KEY_TTL_MS`). 큐 재처리의 "같은 키 재전송 가능" 판정은 하루 여유를 둔 `isWithinIdempotencyReplayWindow(issuedAt, now)`(기본 14일)로 하세요(§5). 15일이 지난 키의 재사용은 새 요청으로 실행될 수 있습니다(문서는 기간만 밝히므로 안전하지 않은 것으로 취급 — 중복 실행 위험). 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"이고 **body는 포함되지 않으므로**, 같은 키로 다른 body를 보내는 실수는 라이브러리의 취소 재시도 티켓 봉인이 방지합니다. confirm은 멱등키를 기본 부착하지 않습니다 — 필요 시 `options.idempotencyKey`로 명시하세요(retry 옵션의 자동 재시도도 이 명시가 전제입니다 — §3.4). **4xx 에러 응답도 같은 키에 15일 재생됩니다** — 파라미터를 고쳐 재시도할 땐 반드시 새 키를 쓰세요(§5).

**Q. 위젯 키와 API 키는 뭐가 다른가요?**
연동 방식이 다릅니다. 결제위젯은 위젯 키 쌍(`gck`/`gsk`), API 개별 연동(빌링 포함)은 API 키 쌍(`ck`/`sk`)을 씁니다. 위젯으로 결제한 건의 confirm에 API 시크릿 키를 쓰면 400 `INVALID_API_KEY`입니다. 이 라이브러리는 키 4종을 별도 타입으로 분리하고 클라이언트에 키 종류를 각인해, 잘못된 조합(위젯 키로 빌링 플로우 생성 등)을 컴파일 에러로 만듭니다 — 파사드에서는 아예 오버로드 불충족입니다(§2).

---

## 배포 산출물과 소비 앱 handoff

workspace link나 수정된 `node_modules`로 결제를 검증한 결과는 배포 증거가 아닙니다. 릴리스는
**깨끗한 source commit**에서 아래 gate를 통과한 뒤, core와 Nest를 각각 immutable `.tgz`로
전달합니다.

```sh
corepack pnpm run verify:release
artifact_dir="$(mktemp -d)"
npm pack ./toss-payments --pack-destination "$artifact_dir"
npm pack ./toss-payments-nestjs --pack-destination "$artifact_dir"
```

`--pack-destination`은 repository 밖의 임시 디렉터리를 써야 합니다. 첫 번째 tarball이 source
checkout에 untracked 파일로 남으면 두 번째 package의 `prepack` clean-check가 의도적으로 거부합니다.

각 artifact의 provenance JSON을 tarball에서 꺼내 handoff 파일로 두고 SHA-256도 기록합니다.

```sh
for tarball in "$artifact_dir"/*.tgz; do
  tar -xOf "$tarball" package/dist/gj-kit-provenance.json > "${tarball%.tgz}.provenance.json"
  shasum -a 256 "$tarball"
done
```

각 tarball에는 `dist/gj-kit-provenance.json`이 포함됩니다. 이 파일의
`{ package, version, sourceCommit }`은 빌드한 Git commit을 가리키며, pack 직전에는 source가
깨끗한지와 tarball 내부 stamp가 다시 검증됩니다. handoff에는 두 package의 **정확한 version,
전체 source commit, tarball SHA-256, provenance JSON**을 함께 기록하세요. SHA-256은 같은
version의 다른 파일을 바꿔치기하지 않았다는 artifact 식별자입니다.

소비 앱에는 두 `.tgz`를 version control 대상 `vendor/`에 고정하고 `package.json`과 lockfile을
함께 갱신합니다.

```json
{
  "dependencies": {
    "@gj-kit/toss-payments": "file:vendor/gj-kit-toss-payments-<version>.tgz",
    "@gj-kit/toss-payments-nestjs": "file:vendor/gj-kit-toss-payments-nestjs-<version>.tgz"
  }
}
```

consumer는 vendor tarball의 SHA-256과 인접 provenance JSON을 재확인한 뒤 설치해야 합니다.
registry의 느슨한 range, workspace symlink, 수동 편집한 `node_modules`는 승인·웹훅 경로의
release handoff로 쓰지 마세요. Nest 소비자는 자신의 `@nestjs/common`/`@nestjs/core` major,
실제 raw-body ingress, device/production callback도 별도로 검증해야 합니다.

---

## 라이선스

MIT
