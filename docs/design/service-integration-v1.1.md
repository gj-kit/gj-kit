# @gj-kit/toss-payments v1.1 — 서비스 연동 아키텍처 설계 (리뷰 3렌즈 합성)

> 2026-08-09. 입력: 독립 리뷰 렌즈 3건(렌즈 0/1/2). 본 문서는 must/should 제안만 v1.1 범위로 확정하고,
> could는 §6 "이후 후보"로, 기각과 렌즈 간 충돌 판정은 §7에 기록한다.
>
> **미션**: "서비스에서 사용할 때 자신의 서비스에 필요한 데이터 연동만 하고, 검증과 누락을 방지하는 아키텍처."
> v1은 *잘못 쓸 수 없는* 개별 플로우를 만들었다. v1.1은 *배선을 누락할 수 없는* 조립층과,
> 켜고 끌 수 있는 관측·자동화 옵션을 추가한다.

## 불변 제약 (전 제안 공통)

| 제약 | 적용 |
|---|---|
| 코어 런타임 의존성 0 · 플랫폼 중립 | 신규 코드 전부 WebCrypto·fetch만. `node:fs`는 지연 동적 import + tsup `external: [/^node:/]`로 격리 (§3.2) |
| 기존 공개 API 파괴적 변경 금지 | 모든 변경은 **추가만** — 신규 export, 기존 인터페이스의 옵셔널 필드/옵션, 오버로드 추가. 기존 팩토리 4종(createTossClient/createConfirmFlow/createBillingFlow/createWebhookVerifier) 전부 존치 |
| 모든 옵션 기본 꺼짐 | 미주입 = 현행 동작과 바이트 단위 동일. 옵션 미설정 시 추가 비용 0에 수렴 |
| 검증 강제 원칙 훼손 금지 | 파사드는 조립만(검증 로직 중복 0), 이벤트는 Result 흐름을 바꾸는 경로가 타입상 부재, autoRefetch는 trust 등급 승격 없음 |
| Phase 5 실측 반영 | **4xx 에러 응답도 멱등키에 15일 바인딩·재생**된다 → 동일 키 자동 재시도가 안전한 경우는 ① 응답 미수신(transport) ② 409 `IDEMPOTENT_REQUEST_PROCESSING` **둘뿐**. 4xx 후 재시도는 반드시 새 키 (§3.4, §3.6, §7-3) |

---

## 1. 누락 갭 목록과 해소 방법

서비스 연동 관점에서 "컴파일은 되는데 프로덕션에서 사고가 나는" 갭을 렌즈 3건이 수렴 식별했다.

| # | 갭 | 사고 시나리오 | 해소 (v1.1) | 등급 |
|---|---|---|---|---|
| G1 | **가상계좌 secret 저장이 검증 체인 밖** — README 예제의 수동 한 줄(`db.deposits.save`)에만 의존 | 저장 누락 → DEPOSIT_CALLBACK 전부 `unknown-order` 거부 → 고객이 입금했는데 주문 영구 미이행. 저장(README)과 조회(WebhookVerifierConfig) 배선이 다른 파일이라 리뷰로도 발견 어려움 | `DepositSecretStore` — confirm 성공 시 자동 저장 + 웹훅 조회와 단일 인터페이스로 1회 배선 (§3.1) | must (3/3) |
| G2 | **4팩토리 수동 조립의 부분 배선** — 키 쌍 혼동(gsk/sk → 400 INVALID_API_KEY), depositSecrets 반쪽 배선, billingKeyStore 미배선이 런타임에야 발각 | 배선 누락이 컴파일도 되고 런타임 에러도 즉시 안 나서 가장 늦게 발견 | `createTossPayments` 파사드 — 조건부 반환 타입으로 미배선 플로우는 **프로퍼티 자체가 부재** → 사용 시점 컴파일 에러 (§2) | must (3/3) |
| G3 | **아웃바운드 req/res 증거 부재** — 분쟁·CS 시 traceId·원문이 없거나, 직접 로깅하다 Authorization/카드번호 유출 | 사용자 fetch 래핑 → 민감정보 로그 유출이 전형 사고 | `audit` 옵션 — TossHttp 단일 관문 계측, Authorization은 스키마에 필드 자체 부재, 비설정화 redaction (§3.2) | must (3/3) |
| G4 | **도메인 부수 반응의 경로별 흩어짐** — confirmCallback 라우트 vs 웹훅 refetch 경로에 한쪽만 반영 코드 삽입 | 알림/재고/구독 연장이 일부 진입점에만 배선되는 누락 | `events` 옵션 — 타입드 pub/sub 단일 구독 지점, 핸들러 완전 격리 (§3.3) | must~should (렌즈 2 must, 렌즈 0/1 should → v1.1 채택) |
| G5 | **재시도를 사용자가 직접 구현** — 범용 재시도 라이브러리는 실측 규칙(4xx 멱등 재생)을 모른다 | ① 4xx 후 동일 키 재시도 → 15일간 같은 에러만 재생 ② 키 없는 confirm 재전송 → 이중 승인 위험 | `retry` 옵션 — 안전 집합을 코드에 하드코딩한 자동 재시도 (§3.4) | should (3/3) |
| G6 | **Unverified 웹훅의 refetch 누락** — payload의 `status==='DONE'`을 그대로 믿으면 위조 POST 한 방에 이행이 뚫림 (부록 A 기지 한계) | 서명 없는 이벤트에서 refetch를 잊은 코드가 리뷰를 통과 | `autoRefetch` 옵션 — 조회 재확인을 "잊을 수 있는 호출"에서 "이미 되어 있는 값"으로 (§3.5) | should (3/3) |
| G7 | **billing.approve 멱등키가 옵션** — cron 중복 실행·큐 at-least-once에서 키 없는 approve 2회 = 이중 과금 | 이 라이브러리에서 "옵션 누락 = 금전 사고"인 유일 지점인데 컴파일 방어 없음 | `requireApproveIdempotencyKey` capability — 기존 capability 패턴으로 타입 필수화 (§3.6) | should (렌즈 0) |
| G8 | **confirm Err ≠ 결제 실패** — transport 실패(승인됐는데 응답 유실)·ALREADY_PROCESSED_PAYMENT(새로고침 이중 confirm)를 일괄 실패 처리 | "돈은 나갔는데 실패 안내"라는 최악의 CS 사고. 에러 표에 "조회로 확정 후 성공 처리 가능"이라 적혀 있지만 수행 API가 없음 | `resolveConfirmFailure` 헬퍼 — 조회 기반 3분기(actually-confirmed / retry-payment / definitively-failed) (§3.7) | should (렌즈 0) |
| G9 | **NestJS 통합 보일러플레이트 + rawBody 함정** — Nest가 body를 JSON 선파싱하면 서명/secret 검증 전멸. 이 함정은 Nest 특화라 코어 README로 못 막음 | 프로젝트마다 토큰/DI 재발명, rawBody 미설정으로 웹훅 검증 원천 불가 | `@gj-kit/toss-payments-nestjs` 패키지 (§4) | must (렌즈 0/1) |

---

## 2. `createTossPayments` 파사드 — 확정 시그니처

**설계 원칙**: 파사드는 **순수 조립층**이다. 기존 팩토리 4종에 전량 위임하고 검증 로직 중복이 0이다.
배선하지 않은 플로우는 반환 타입에 **프로퍼티 자체가 없어** 사용 시점에 컴파일 에러가 난다 —
"stores 미제공 시 플로우 생성 불가"라는 기존 런타임 보장을 타입으로 옮긴 것뿐, 새 동작이 없다.

```ts
// ─── "./server" 신규 export (src/server/facade.ts) ───────────────────────────

export interface TossPaymentsBaseConfig<E extends Env> {
  /** confirm 플로우 배선 — 미지정 시 반환 타입에 confirm 부재. */
  readonly orders?: OrderStore;
  /** G1 — 1회 배선으로 confirm측 자동 저장 + webhook측 getSecret 대조 양쪽 커버 (§3.1). */
  readonly depositSecrets?: DepositSecretStore;
  readonly onDepositSecretSaveFailed?: (info: {
    readonly orderId: OrderId;
    readonly paymentKey: PaymentKey;
    readonly cause: unknown;
  }) => void;
  /** webhook 배선 — 미지정 시 반환 타입에 webhook 부재. depositSecrets는 위 필드가 자동 배선. */
  readonly webhook?: {
    readonly dedupe: WebhookDedupeStore;
    readonly securityKeys?: readonly SecurityKey[];
    readonly allowedSourceIps?: readonly string[] | false;
    /** true → 파사드 내부 client를 자동 결속 (§3.5). */
    readonly autoRefetch?: true;
  };
  /** 옵션 3종 — 기본 전부 꺼짐. events는 client·confirm·billing·webhook 4곳에 자동 배선. */
  readonly events?: TossEvents;
  readonly audit?: AuditOptions;
  readonly retry?: RetryOptions;
  /** fetch/baseUrl/timeoutMs — audit/retry/events는 파사드가 위 필드에서 병합 주입한다. */
  readonly client?: Pick<TossClientOptions, 'fetch' | 'baseUrl' | 'timeoutMs'>;
  readonly confirm?: Pick<ConfirmFlowOptions, 'approvalWindowMs' | 'clock'>;
}

export interface TossPaymentsApiConfig<E extends Env> extends TossPaymentsBaseConfig<E> {
  /** 브랜드 키만 수용 — raw string 미수용 (§7-1 기각 근거: Env phantom 소실·실패 시점 이원화). */
  readonly secretKey: ApiSecretKey<E>;
  /** billing 플로우 배선 — 미지정 시 반환 타입에 billing 부재. */
  readonly billingKeys?: BillingKeyStore;
  readonly billing?: { readonly capabilities?: BillingCapabilities };
}

export interface TossPaymentsWidgetConfig<E extends Env> extends TossPaymentsBaseConfig<E> {
  readonly secretKey: WidgetSecretKey<E>;
  /** 빌링은 API 키 전용(키 쌍 규칙) — 위젯 키 + 빌링 배선은 컴파일 에러(400 INVALID_API_KEY 선차단). */
  readonly billingKeys?: never;
  readonly billing?: never;
}

type CapabilitiesOf<C> = C extends { readonly billing: { readonly capabilities: infer Cap extends BillingCapabilities } }
  ? Cap
  : {};

export type TossPaymentsKit<E extends Env, K extends KeyKind, C> = {
  readonly client: TossServerClient<E, K>;
  /** 항상 존재 — config.events 미주입 시 no-op 구독 표면(발행 지점 순회 0회). */
  readonly events: TossEvents;
} & (C extends { readonly orders: OrderStore } ? { readonly confirm: ConfirmFlow<E> } : {})
  & (C extends { readonly billingKeys: BillingKeyStore }
      ? { readonly billing: BillingFlow<E, CapabilitiesOf<C>> }
      : {})
  & (C extends { readonly webhook: object } ? { readonly webhook: WebhookVerifier } : {});

export function createTossPayments<E extends Env, const C extends TossPaymentsApiConfig<E>>(
  config: C,
): TossPaymentsKit<E, 'api', C>;
export function createTossPayments<E extends Env, const C extends TossPaymentsWidgetConfig<E>>(
  config: C,
): TossPaymentsKit<E, 'widget', C>;

/** forRootAsync 등에서 const 추론을 고정하는 identity — 타입 보존용 (§4에서 필수 사용). */
export function defineTossPaymentsConfig<
  E extends Env,
  const C extends TossPaymentsApiConfig<E> | TossPaymentsWidgetConfig<E>,
>(config: C): C;
```

### 사용 예제 — 배선 누락 = 사용 시점 컴파일 에러

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { parseApiSecretKey, createTossPayments, createTossEvents } from '@gj-kit/toss-payments/server';

const toss = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders: {
    saveOrder: async (o) => { await db.tossOrder.create({ data: o }); },
    loadOrder: (id) => db.tossOrder.findUnique({ where: { orderId: id } }),
  },
  depositSecrets: {                          // 1회 배선 → confirm 저장 + webhook 대조 양쪽
    saveSecret: (id, s) => db.deposits.upsert(id, s),
    getSecret: (id) => db.deposits.secretOf(id),
  },
  webhook: { dedupe: { claim: (id) => redis.set(`twh:${id}`, '1', { NX: true, EX: 432_000 }).then(Boolean) } },
  events: createTossEvents(),
});

toss.confirm.confirmCallback(req.url);       // OK — orders 배선됨
toss.webhook.fetchHandler({ /* ... */ });    // OK — webhook 배선됨
toss.billing.approve(profile, order);        // ✗ 컴파일 에러 — billingKeys 미배선: billing 프로퍼티 자체가 없다
```

```ts
// 타입 테스트 픽스처 (tests/types)
// @ts-expect-error 위젯 시크릿 키 + billingKeys — 오버로드 불충족 (키 쌍 규칙)
createTossPayments({ secretKey: gsk, orders, billingKeys });
```

### 확정 판정 사항 (렌즈 간 충돌 해소)

| 쟁점 | 렌즈 0 | 렌즈 1 | 렌즈 2 | 판정 |
|---|---|---|---|---|
| config 형태 | flat | `keys`/`stores`/`options` 중첩 | flat + 오버로드 2종 | **flat + 오버로드 2종** (렌즈 2). 중첩은 조건부 타입 판정 경로(`C['keys'] extends ...`)를 깊게 만들어 추론 취약성만 늘린다 |
| 키 개수 | 단일 | api+widget 동시 수용(client 2개) | 단일 | **단일 키 = 파사드 1개**. 위젯 결제 + 빌링 병용 상점은 파사드 2개(gsk용/sk용)를 만든다 — 키 쌍 규칙이 파사드 경계와 일치해 confirm의 클라이언트 선택 규약("widget 우선")이라는 새 암묵 규칙이 생기지 않는다. 듀얼 키 단일 파사드는 §6 이후 후보 |
| `orders` 필수 여부 | 옵션 | 옵션 | 필수 | **옵션** (2/3). 빌링 전용·웹훅 전용 서비스가 더미 OrderStore를 강요받지 않아야 "필요한 데이터 연동만"이라는 미션에 부합. confirm은 조건부 프로퍼티로 |
| raw string 키 수용 | — | **기각** | — | 기각 확정 (§7-1) |

**기지 리스크**: 조건부 교차 타입의 에러 메시지 품질은 통제 밖(api-surface.md 부록 A와 동일 계열) —
"`billing` 프로퍼티가 없다"는 에러가 원인(billingKeys 미배선)을 직접 말하지 않는다.
완화: ① 각 플로우 프로퍼티 TSDoc에 "이 프로퍼티가 없다면 → 어떤 config가 빠졌는지" 매핑, ② README에 에러↔원인 표,
③ tests/types에 expectTypeOf 회귀 고정. 스프레드로 config를 동적 구성하면 `const` 추론이 풀려 판정이 무너질 수 있음 —
동적 구성은 기존 개별 팩토리 사용을 안내.

**README 재편**: 파사드를 골든 패스로 승격, 기존 개별 팩토리는 "개별 조립" 절로 격하(존치).

---

## 3. 옵션 카탈로그

모든 옵션의 공통 계약: **기본 꺼짐**(미주입 시 현행 동작 동일), **결제 경로 무간섭**(옵션 내부 실패가 Result를 바꾸는 경로가 존재하지 않음), **추가만**(기존 시그니처의 옵셔널 확장).

### 3.1 `depositSecrets` — DepositSecretStore (must, 3/3 수렴)

```ts
// ─── "./server" (src/server/stores.ts 추가) ──────────────────────────────────
import type { DepositSecretSource } from '../webhook/verifier'; // type-only — 런타임 의존 없음

/** 웹훅 DepositSecretSource(getSecret)의 상위 타입 — 한 객체로 confirm측 저장 + 웹훅측 대조 양쪽 배선. */
export interface DepositSecretStore extends DepositSecretSource {
  /** upsert 시맨틱 계약 — 기존 수동 저장과 병용해도 이중 저장이 무해해야 한다. */
  saveSecret(orderId: OrderId, secret: string): Promise<void>;
  // getSecret(orderId: string): Promise<string | null>  ← 상속. 기존 WebhookVerifierConfig.depositSecrets에 그대로 전달 가능
}

// ─── ConfirmFlowOptions 추가 (기존 필드 불변) ────────────────────────────────
export interface ConfirmFlowOptions {
  readonly approvalWindowMs?: number;   // 기존
  readonly clock?: () => Date;          // 기존
  readonly depositSecrets?: DepositSecretStore;                                  // 신규
  readonly onDepositSecretSaveFailed?: (info: {                                  // 신규
    readonly orderId: OrderId;
    readonly paymentKey: PaymentKey;
    readonly cause: unknown;
  }) => void;
  readonly events?: TossEvents;         // 신규 (§3.3 배선 지점)
}
```

| 항목 | 확정 |
|---|---|
| 동작 | `confirm`/`confirmCallback`이 Ok이고 **`payment.method === '가상계좌'`일 때만** `saveSecret`을 await 호출 |
| method 가드 근거 | Phase 5 실측 — **BILLING 카드 결제 응답에도 secret이 non-null**로 내려온다. secret 존재로 판정하면 빌링 결제마다 무의미한 저장 발생 |
| 실패 시맨틱 | saveSecret 실패여도 confirm은 **Ok 유지**. 근거(billing.issue의 Err 선례와 의도적으로 다름): ① 승인은 토스 측에서 이미 완결 — Err로 뒤집으면 "승인됐는데 실패 처리 + 사용자 재confirm"이라는 더 큰 사고 ② 빌링키와 달리 secret은 `getPaymentByOrderId` 재조회 응답에 있어(실측 확인) 유실이 영구적이지 않다. 통지: `onDepositSecretSaveFailed` 콜백 + `deposit.secret-save-failed` 이벤트(§3.3). 콜백 미지정 시 기본 **console.warn 1회**(라이브러리에서 유일하게 시끄러운 기본값 — 침묵 유실 방지) |
| 통지 payload | `{ orderId, paymentKey, cause }` — **secret 원문 미포함**(로그 유출 방지). 복구는 `getPaymentByOrderId(orderId)` → `Payment.secret` → `saveSecret` 재시도 (TSDoc·README 필수 명시). 렌즈 1의 `payment: ConfirmedPayment` 동봉안은 payload에 secret이 포함돼 유출 방지 원칙과 모순 → 기각, paymentKey만 채택 |
| redaction | 해당 없음 (secret이 어떤 통지·이벤트 payload에도 실리지 않음) |
| 파사드 결합 | `config.depositSecrets` 1개 → `ConfirmFlowOptions.depositSecrets` + `WebhookVerifierConfig.depositSecrets` 동시 배선 — README의 수동 저장 한 줄이 사라진다 |
| 기존 API 관계 | `WebhookVerifierConfig.depositSecrets: DepositSecretSource` 시그니처 불변 — DepositSecretStore가 구조적으로 충족(상위 타입 수용). 파괴 없음 |
| 테스트 유틸 | `/testing`에 `memoryDepositSecretStore()` 추가 (기존 인메모리 스토어 3종과 대칭) |

잔존 리스크: 옵션이므로 "주입 자체를 잊는" 갭은 남는다 — 파사드 골든 패스 승격 + README 가상계좌 절에서 depositSecrets를 표준 배선으로 제시해 완화. 저장 1회 await 추가로 confirm 지연 증가(가상계좌 한정, 승인 완결 후) — 수용.

### 3.2 `audit` — 아웃바운드 전 req/res 기록 (must, 3/3 수렴)

**부착 지점**: `src/server/client.ts`의 내부 `createHttp().request()` — 모든 confirm/cancel/billing/조회가 통과하는 **유일 관문**. 흩어짐 없음.

```ts
// ─── 타입: "." core (src/core/audit.ts — 타입뿐이라 환경 중립 무해), "./server"에서 재export ───

export interface AuditEntry {
  readonly id: string;                    // crypto.randomUUID — 시도 1건당 1엔트리
  readonly at: string;                    // ISO 8601 요청 시작 시각
  readonly env: Env;
  readonly method: 'GET' | 'POST' | 'DELETE';
  readonly path: string;                  // '/v1/payments/confirm' 등 pathname만
  readonly attempt: number;               // 1부터 — retry(§3.4) 결합 시 시도마다 엔트리 1건
  readonly idempotencyKey: string | null;
  /** redaction 통과본. ⚠ 헤더 필드가 타입에 없다 — Authorization은 구조적으로 기록 불가. */
  readonly requestBody: unknown | null;
  readonly durationMs: number;
  readonly traceId: string | null;        // x-tosspayments-trace-id — 고객센터 문의 키
  readonly outcome:
    | { readonly kind: 'ok'; readonly httpStatus: number; readonly responseBody: unknown }      // redaction 통과본
    | { readonly kind: 'toss-error'; readonly httpStatus: number; readonly code: string; readonly message: string }
    | { readonly kind: 'transport'; readonly code: 'NETWORK_ERROR' | 'TIMEOUT' };
}

export interface AuditSink {
  record(entry: AuditEntry): void | Promise<void>;
}

export interface AuditOptions {
  readonly sink: AuditSink;
  /** sink 실패 통지. 기본 무시 — 이 콜백의 throw도 삼켜진다. */
  readonly onSinkError?: (cause: unknown, entry: AuditEntry) => void;
}

/** redaction 대상 키 목록 — 단일 상수 export로 감사 가능하게 (버전 관리 대상). */
export const AUDIT_REDACTED_KEYS: readonly string[];

// ─── TossClientOptions 추가 (기존 필드 불변) ─────────────────────────────────
export interface TossClientOptions {
  readonly fetch?: typeof fetch;          // 기존
  readonly baseUrl?: string;              // 기존
  readonly timeoutMs?: number;            // 기존
  readonly audit?: AuditOptions;          // 신규
  readonly retry?: RetryOptions;          // 신규 (§3.4)
  readonly events?: TossEvents;           // 신규 (§3.3 — 'api.call' 전용)
}

// ─── "./server" 참조 구현 ────────────────────────────────────────────────────
export function createFileAuditSink(
  filePath: string,
  options?: { readonly formatter?: (entry: AuditEntry) => string },  // 기본 JSONL 1행
): AuditSink & { flush(): Promise<void>; close(): Promise<void> };
// 내부: Promise 체이닝 append 직렬화 큐(순서 보존) + 최초 record 시 await import('node:fs/promises') 지연 로드.
// tsup에 external: [/^node:/] 추가 — platform:'neutral' 유지, 코어 번들에 정적 node 의존 0.
// Edge에서 createFileAuditSink를 호출하지 않는 한 "./server"의 Edge 호환은 불변.

// ─── "/testing" ──────────────────────────────────────────────────────────────
export function memoryAuditSink(): AuditSink & { readonly entries: readonly AuditEntry[] };
```

| 항목 | 확정 |
|---|---|
| 기본값 | 미설정 = 꺼짐 (계측 코드 자체가 no-op 경로) |
| 실패 시맨틱 (협상 불가) | `record()`는 await하지 않는다(fire-and-forget). sync throw·async rejection 모두 catch → `onSinkError`. **audit 오류가 결제 요청의 지연·실패에 영향을 주는 경로가 없다** (기록 실패 < 결제 실패) |
| redaction (비설정화 — 옵션으로 끌 수 없음, 설정 파라미터 미제공) | ① **Authorization은 AuditEntry에 필드 자체가 없다** — 마스킹이 아니라 구조적 부재. ② req/res body 재귀 순회, 대소문자 무시 denylist 키를 `'[REDACTED]'` 치환: `cardNumber, cardPassword, customerIdentityNumber, accountNumber, secret, billingKey, authKey, customerMobilePhone` + `card`/`refundAccount` 컨텍스트 하위의 `number`. 목록은 `AUDIT_REDACTED_KEYS` 단일 상수로 export. ③ **인바운드 웹훅 rawBody는 audit 범위 밖** — DEPOSIT_CALLBACK 원문에 secret(README §7 경고와 동일 근거). audit은 아웃바운드 API 전용, 웹훅 관측은 events의 secret 제거된 요약(§3.3)으로 |
| 레코드 단위 | **시도 1건 = 엔트리 1건**(outcome 유니언) — 렌즈 0의 request/response 분리 kind안은 상관(join) 비용이 들어 기각, 렌즈 1/2 수렴안 채택 |
| 파사드 결합 | `config.audit` → 내부 client의 `TossClientOptions.audit` |

잔존 리스크: denylist는 토스가 새 민감 필드를 추가하면 누락 가능 — 실측 응답 픽스처 전수 redaction 스냅샷 unit 테스트 + 마이너 업데이트 시 필드 감사로 완화(카드 PAN 패턴 13~19 digits 2차 마스킹은 §6 이후 후보). responseBody에 고객 이름·이메일 등 PII 잔존 — 보관 주체·기간은 사용자 책임(TSDoc/README 명시). fire-and-forget이라 프로세스 즉사 시 마지막 엔트리 유실 — `flush()/close()`를 graceful shutdown 훅으로 문서화. fileAuditSink는 다중 프로세스 병행 쓰기 무방비(단일 인스턴스 전제 TSDoc).

### 3.3 `events` — 타입드 in-process pub/sub (렌즈 2 must, 렌즈 0/1 should → v1.1 채택)

```ts
// ─── 이미터 런타임: "." core (src/core/events.ts — 의존성 0·중립).
//     TossEventMap과 별칭은 "./server"에서 export (server/webhook 타입은 type-only import — dts 순환 스냅샷 검증) ───

export interface TossEventMap {
  /** 요청 라이프사이클 — started/succeeded/failed 3분할 대신 완료 1종(과설계 금지). 논리 요청당 1회(최종 outcome). */
  'api.call': {
    readonly method: string; readonly path: string;
    readonly outcome: 'ok' | 'toss-error' | 'transport';
    readonly httpStatus: number | null; readonly durationMs: number;
    readonly traceId: string | null; readonly attempts: number;   // retry 결합 시 총 시도 수
  };
  'payment.confirmed':      { readonly payment: ConfirmedPayment };   // store 검증 통과 후 Ok 확정 시점
  'payment.confirm-failed': { readonly orderId: OrderId | null;       // parse 단계 실패면 null
                              readonly error: CallbackParseError | VerifyCheckoutError | ConfirmError };
  'cancel.executed':        { readonly outcome: CancelOutcome };
  'cancel.failed':          { readonly paymentKey: PaymentKey; readonly error: CancelError };
  'billing.issued':         { readonly customerKey: CustomerKey };    // billingKey는 payload 원천 부재 — 봉인 원칙 유지
  'billing.approved':       { readonly payment: BillingPayment; readonly customerKey: CustomerKey };
  'billing.approve-failed': { readonly customerKey: CustomerKey; readonly error: BillingApproveError };
  'billing.revoked':        { readonly customerKey: CustomerKey };
  'deposit.secret-saved':        { readonly orderId: OrderId };       // §3.1 연동
  'deposit.secret-save-failed':  { readonly orderId: OrderId; readonly paymentKey: PaymentKey; readonly cause: unknown };
  /** 요약만 — AcceptedWebhook 통짜 전달 대신 secret 제거·타입 순환 회피가 보장되는 최소 필드. */
  'webhook.accepted':       { readonly trust: 'signature' | 'secret' | 'unverified';
                              readonly eventType: string; readonly transmissionId: string };
  'webhook.duplicate':      { readonly transmissionId: string };
  'webhook.rejected':       { readonly rejection: WebhookRejection };
}
export type TossEventName = keyof TossEventMap;
export type TossEvent<K extends TossEventName = TossEventName> =
  { readonly type: K; readonly at: string } & TossEventMap[K];        // at: ISO 8601

/** 공개 표면은 구독 전용 — emit은 내부 인터페이스로만 흐른다(라이브러리만 발행). */
export interface TossEvents {
  on<K extends TossEventName>(
    type: K,
    handler: (event: TossEvent<K>) => void | Promise<void>,
  ): () => void;                                                       // 반환값 = 구독 해제
}

export function createTossEvents(options?: {
  /** 핸들러 예외 통지. 기본 무시 — 이 콜백의 throw도 삼켜진다. */
  readonly onHandlerError?: (info: { readonly type: TossEventName; readonly cause: unknown }) => void;
}): TossEvents;
```

| 항목 | 확정 |
|---|---|
| 배선 지점 (전부 추가 옵션) | `TossClientOptions.events`('api.call' 전용) · `ConfirmFlowOptions.events` · `createBillingFlow(client, store, { capabilities?, events? })` · `WebhookVerifierConfig.events`(웹훅 3종 — 자기 이벤트만 담은 구조적 서브맵으로 emit, server→webhook 런타임 의존 없음). 파사드는 버스 1개를 4곳 전부에 자동 배선 |
| 기본값 | 버스 미주입 시 emit 지점은 no-op(배열 순회 0회 — 비용 0 수렴) |
| 실패 시맨틱 (협상 불가) | emit은 Result 확정 **후** 동기 fire-and-forget 발화, 반환값 무시·await 없음 — **이벤트가 플로우 결과를 바꾸는 경로가 타입상 존재하지 않는다**. 핸들러별 try/catch 격리, sync throw·async rejection 모두 `onHandlerError`로만 보고 |
| 전달 보장 | at-most-once, in-process, 비영속 — **"이벤트로 원장(ledger)을 만들지 말라"** 경고 필수(원장은 OrderStore/DB + Result 트랜잭션 처리, 이벤트는 관측·부수 반응 전용) |
| redaction | `'payment.confirmed'`의 payment에 secret 포함 가능(실측: BILLING 카드도 non-null) — payload 통짜 로깅 금지 TSDoc 경고, 기록 용도는 audit(§3.2)으로. billing.issued/revoked는 customerKey만(billingKey 유출 원천 차단). webhook.accepted는 요약 3필드만 |
| 의도적 부재 (과설계 금지) | wildcard 구독(`onAny` 제외 — 렌즈 1 제안했으나 사용처가 관측뿐이라 v1.1 미포함), once, 버퍼/replay, 우선순위, 중간 단계 이벤트, `onBillingApproved`류 존재하지 않는 웹훅 이벤트 |

잔존 리스크: 서버리스에서 async 핸들러 미대기로 유실 가능 — 웹훅 어댑터 경유 시 어댑터의 waitUntil 경로 합류는 §6(v2 과제)로 명시.

### 3.4 `retry` — 실측 근거 하드 가드 자동 재시도 (should, 3/3 수렴)

```ts
// ─── "./server" ───────────────────────────────────────────────────────────────
export interface RetryOptions {
  /** 총 시도 횟수(최초 포함). 기본 3. 리터럴 유니언 — 폭주 설정 원천 차단. */
  readonly maxAttempts?: 2 | 3 | 4 | 5;
  /** 시도 간 지연(ms). 기본 [500, 2_000, 8_000], full jitter ±25% 자동. */
  readonly delaysMs?: readonly number[];
  /** reason이 2종 리터럴로 고정 — toss retryable류로 확장하려면 공개 타입 변경이 필요하도록 봉인. */
  readonly onRetry?: (info: {
    readonly attempt: number;
    readonly reason: 'transport' | 'idempotent-processing';
    readonly nextDelayMs: number;
    readonly path: string;
  }) => void;
}
// TossClientOptions.retry?: RetryOptions — 기본 미설정(꺼짐). 구현: createHttp.request() 내부 루프 1곳.
```

**재시도 허용 조건 — 설정으로도 확장 불가, 코드에 고정 (Phase 5 실측이 근거인 하드 불변식):**

1. **GET**: TransportFailure만 재시도 (자체 멱등 — 문서).
2. **Idempotency-Key가 실제 부착된 POST/DELETE**: (a) TransportFailure — 동일 키+동일 body 재전송은 서버 도달 시 바이트 동일 재생, 미도달 시 재실행(Phase 0 실측 — 이중 실행 없음). (b) 409 `IDEMPOTENT_REQUEST_PROCESSING` — 문서 지시("다시 요청해서 응답을 확인하세요") 준수.
3. **키 없는 POST**(confirm 기본 정책): 어떤 실패든 **자동 재시도 절대 없음** — 이중 승인 방지. `retryable: true`여도 무시. confirm에 retry 효과를 받으려면 `options.idempotencyKey` 명시가 전제(TSDoc 연결).
4. **토스 4xx/5xx 에러 응답을 받은 경우**: 재시도 안 함 — 4xx는 멱등 재생 실측 확정(같은 키 재시도 = 15일간 같은 에러 재생), 5xx는 재생 여부 미실측이므로 보수 배제. `retryable: true`(PROVIDER_ERROR 등) 포함 — 그 재시도는 "새 멱등키 + 상황 판단"이 필요한 호출자 의사결정이다(§7-3 기각과 동일 근거, TSDoc에 실측 근거 기재).

| 항목 | 확정 |
|---|---|
| 상호작용 | 각 시도에 timeoutMs 독립 적용. 호출자 AbortSignal abort 시 대기 중에도 즉시 중단. 소진 시 마지막 실패를 원형 그대로 반환 — **cancel의 CancelRetryTicket 동봉 유지**(retry 옵션은 "요청 내" 자동화, 티켓은 "요청 간(큐 저장 후)" 수동 재실행 — 역할 구분 TSDoc). audit 결합 시 시도마다 AuditEntry 1건(attempt 필드), events의 'api.call'은 최종 1회(attempts 집계) |
| 실패 시맨틱 | 409 재시도 후 원 요청이 4xx로 끝났으면 그 에러를 재생받고 종료 — 이는 올바른 동작(처리 결과 확인)임을 문서화해 이슈 리포트 선제 예방 |
| 파사드 결합 | `config.retry` → 내부 client |

잔존 리스크: 기본값 최악 지연 +10.5s(+ 시도별 timeout) — confirm의 10분 시한·웹훅 10초 규약 잠식 가능. "요청 경로가 아닌 배치/큐 소비자에서 켜라" + confirm 경로 권장값(maxAttempts 2) README 계산 예시. 409 폴링은 테스트 환경 분당 100건 쿼터 소모. 멱등키 15일 TTL 경계를 넘는 장기 큐 재처리에는 여전히 무방비(기존 문서화된 한계 유지).

### 3.5 webhook `autoRefetch` — Unverified에 조회 재확인 결과 자동 첨부 (should, 3/3 수렴)

```ts
// ─── "./webhook" — WebhookVerifierConfig 추가 (기존 필드 불변) ────────────────
export interface WebhookVerifierConfig {
  // ...기존: dedupe / securityKeys / depositSecrets / allowedSourceIps...
  readonly events?: TossEvents;                       // 신규 (§3.3)
  /**
   * 설정 시 fetchHandler/nodeHandler의 핸들러 디스패치 직전(200 ack 이후)에
   * 결제 참조가 있는 Unverified 이벤트를 자동 재조회해 prefetched로 첨부.
   * 수동 verify() 경로는 불변 — verify에 네트워크 호출을 심지 않는다(순수성 + 10초 규약 보존).
   */
  readonly autoRefetch?: {
    /** 기존 PaymentLookup 구조적 인터페이스 재사용 — webhook→server 런타임 의존 없음. */
    readonly client: PaymentLookup;
    /** 생략 시 결제 참조 보유 이벤트 전부. 분당 100건 쿼터 방어용 필터. */
    readonly eventTypes?: readonly (
      | 'PAYMENT_STATUS_CHANGED' | 'CANCEL_STATUS_CHANGED' | 'ORDER_PAYMENT_STATUS_CHANGED'
    )[];
  };
}

// ─── Unverified에 additive 옵셔널 필드 (기존 refetch() 메서드 존치) ───────────
export interface Unverified {
  readonly trust: 'unverified';                       // 불변 — 승격 없음 (§7-2 기각)
  readonly event: UnverifiedWebhookEvent;             // 기존
  readonly meta: WebhookMeta;                         // 기존
  refetch(client: PaymentLookup): Promise<Result<Payment, LookupError | NoPaymentReference>>;  // 기존
  /** autoRefetch 설정 + 어댑터 경유 시에만 채워짐. undefined = 옵션 꺼짐 또는 수동 verify 경로. */
  readonly prefetched?: Result<Payment, LookupError | NoPaymentReference>;       // 신규
}
```

```ts
// 핸들러의 골든 패스가 3줄 → 1줄로:
onPaymentStatusChanged: async (w) => {
  if (w.prefetched?.ok) await syncStatus(w.prefetched.value);   // payload가 아닌 조회 결과로 갱신
},
```

| 항목 | 확정 |
|---|---|
| 실행 시점 (협상 불가) | **어댑터(fetchHandler/nodeHandler)가 200 응답을 확정한 후**, 핸들러 디스패치 직전 — 조회 왕복이 10초 규약을 건드리지 않는다. dedupe 통과분에만 수행(재전송 7회가 조회 7회가 되지 않음). 렌즈 0의 verify 내부 실행안은 Express 수동 verify 사용자의 10초 규약 잠식으로 기각(렌즈 1/2 수렴안 채택) |
| 타입 전달 | 옵셔널 필드(렌즈 1) 채택 — 렌즈 2의 verifier 2상 제네릭(`WebhookVerifier<'refetched'>`)은 타입 정밀도는 높지만 조건부 핸들러 타입의 에러 메시지 리스크(부록 A)와 표면 복잡도가 편익을 초과. 결제 참조 없는 이벤트(BILLING_DELETED 등)의 핸들러에는 prefetched 미첨부 — 거짓 제공 금지 |
| 실패 시맨틱 | prefetched가 Err여도 이벤트는 버리지 않고 핸들러에 도달(핸들러가 판단). 자동 재시도 없음 — 웹훅 자체가 최대 7회 재전송되므로 다음 전송이 자연 재시도 |
| trust 등급 | **'unverified' 불변** — 조회 결과는 신뢰 가능하지만 웹훅 발신자 진위는 여전히 미검증(§7-2) |
| 파사드 결합 | `config.webhook.autoRefetch: true` → 파사드 내부 client 자동 결속(배선 1비트) |
| 기존 API 관계 | `refetch()` 메서드 존치(수동 경로·이중 조회 회피는 사용자 선택). README 웹훅 골든 패스를 prefetched 사용으로 교체 |

잔존 리스크: prefetched 실패 시 payload 폴백 오용은 여전히 타입이 못 막음(부록 A 기존 한계 — 토스 구조적 문제). 웹훅 폭주 시 조회 호출량 증가 — eventTypes 필터 + dedupe 선행 + 기본 꺼짐이 방어선.

### 3.6 `requireApproveIdempotencyKey` — 빌링 approve 멱등키 타입 필수화 (should, 렌즈 0)

```ts
// ─── "./server" — 기존 capability 패턴(directCardIssue) 재사용, 파괴 없음 ─────
export interface BillingCapabilities {
  readonly directCardIssue?: true;                    // 기존
  readonly requireApproveIdempotencyKey?: true;       // 신규
}

// BillingFlow 조건부 분기 추가:
export type BillingFlow<E extends Env, C extends BillingCapabilities = {}> =
  (C extends { requireApproveIdempotencyKey: true }
    ? Omit<BillingFlowBase<E>, 'approve'> & {
        approve(
          profile: BillingProfile,
          order: BillingOrder,
          options: CallOptions<E> & { readonly idempotencyKey: IdempotencyKey },  // options 자체가 필수
        ): Promise<Result<BillingPayment, BillingApproveError>>;
      }
    : BillingFlowBase<E>)
  & (C extends { directCardIssue: true } ? { /* 기존 issueWithCard */ } : {});
```

| 항목 | 확정 |
|---|---|
| 기본값 | 꺼짐 — 켜지 않으면 기존 BillingFlowBase 그대로(파괴 없음) |
| 파사드 결합 | `billing: { capabilities: { requireApproveIdempotencyKey: true } }` |
| TSDoc 지침 | 키는 청구 주기 결정적 값 권장(`idempotencyKey(\`sub:${period}:${customerKey}\`)`) — 재실행 시 첫 응답 재생으로 무해. **단 4xx 실패 후 파라미터를 고쳐 재시도할 땐 반드시 새 키**(Phase 5 실측 — 동일 키 15일 에러 재생). 일시 오류가 결정적 키에 바인딩되면 해당 주기 재청구가 15일 막히는 함정 → "재시도 시 키에 attempt suffix" 패턴 함께 제시 |
| 기각된 대안 | orderId 기반 키 자동 유도 — 결정적 키 + 4xx 재생 조합 함정을 라이브러리가 사용자 몰래 떠안게 되어 기각. 명시적 필수화만 채택 |

README 빌링 절은 capability 켠 예제를 골든 패스로.

### 3.7 `resolveConfirmFailure` — confirm 실패 복구·안내 분기 헬퍼 (should, 렌즈 0)

```ts
// ─── "./server" ───────────────────────────────────────────────────────────────
export type ConfirmResolution =
  /** 조회로 DONE|WAITING_FOR_DEPOSIT 확인됨 — 성공으로 처리하라. */
  | { readonly resolution: 'actually-confirmed'; readonly payment: ConfirmedPayment }
  /** NOT_FOUND_PAYMENT_SESSION(10분 초과) 등 — 결제 재요청 유도. */
  | { readonly resolution: 'retry-payment' }
  /** 조회로도 미승인 확정. */
  | { readonly resolution: 'definitively-failed'; readonly error: ConfirmError };

export function resolveConfirmFailure<E extends Env>(
  client: Pick<TossServerClient<E>, 'getPaymentByOrderId'>,
  orderId: OrderId,
  error: ConfirmError,
): Promise<Result<ConfirmResolution, LookupError>>;

// ConfirmFlow에 편의 메서드 추가 (additive):
export interface ConfirmFlow<E extends Env> {
  // ...기존 4메서드 불변...
  resolveFailure(orderId: OrderId, error: ConfirmError): Promise<Result<ConfirmResolution, LookupError>>;
}
```

| 항목 | 확정 |
|---|---|
| 판정 로직 | `source === 'network'` 또는 `code === 'ALREADY_PROCESSED_PAYMENT'` → `getPaymentByOrderId` 조회 → status가 `DONE\|WAITING_FOR_DEPOSIT`이면 'actually-confirmed'(**가상계좌면 §3.1 depositSecrets 저장 경로 재사용** — secret이 조회 응답에 있음, 실측). `NOT_FOUND_PAYMENT_SESSION` → 조회 없이 'retry-payment'. 그 외 REJECT/AUTH 계열 → 'definitively-failed' |
| 실패 시맨틱 | 조회 자체가 Err면 진실 미확정 — **"미확정이면 성공/실패 어느 쪽으로도 사용자에게 단정 안내하지 말라"** 지침 TSDoc 필수 |
| fail callback 쪽 | 별도 API 없음 — events 'payment.confirm-failed' 발행 + PendingOrder 정리는 서비스 책임 문서화(OrderStore 메서드 추가는 기존 구현체를 깨는 파괴적 변경이라 기각) |
| 미해결 | ALREADY_PROCESSED_PAYMENT인데 조회 status가 CANCELED인 희귀 케이스(다른 경로로 이미 취소) — 별도 안내 필요 여부 **Phase 6 실측 항목** |

README confirm 라우트 예제의 실패 분기를 이 헬퍼로 교체.

---

## 4. `@gj-kit/toss-payments-nestjs` 패키지 설계 (must, 렌즈 0/1)

**전제**: §2 파사드가 선행 의존 — 파사드 없이는 모듈이 노출할 단일 값이 없다(구현 순서 강제).

### 4.1 패키지 배치와 빌드

```jsonc
// 모노레포 규칙: 루트 폴더 = 독립 패키지 → /toss-payments-nestjs/package.json
{
  "name": "@gj-kit/toss-payments-nestjs",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" } },
  "peerDependencies": {
    "@gj-kit/toss-payments": "workspace:^",     // peer — 앱과 단일 인스턴스 공유(이중 로드 방지), 판정: 렌즈 1안 채택
    "@nestjs/common": "^10 || ^11"
  },
  "devDependencies": { "@gj-kit/toss-payments": "workspace:*", "@nestjs/common": "^11", "reflect-metadata": "^0.2", "tsup": "^8" }
}
// tsup: entry src/index.ts, format esm+cjs, dts, external ['@nestjs/common', '@gj-kit/toss-payments']
// tsconfig: extends 루트 base + experimentalDecorators: true, emitDecoratorMetadata: false  ← 의도적 false
```

**원칙 경계 명시**: 코어의 "런타임 의존성 0" 원칙은 이 패키지에 적용되지 않는다(peer로만 Nest·코어 수용,
dependencies 0은 유지) — CLAUDE.md와 패키지 README에 명시해 혼동 방지.

### 4.2 공개 표면

```ts
import { Inject, type DynamicModule, type InjectionToken } from '@nestjs/common';
import type { Env } from '@gj-kit/toss-payments';
import {
  createTossPayments, defineTossPaymentsConfig,
  type TossPaymentsApiConfig, type TossPaymentsWidgetConfig, type TossPaymentsKit,
  type WebhookVerifier, type WebhookHandlers,
} from '@gj-kit/toss-payments/server';

/** Symbol.for — dual-package(ESM/CJS 이중 로드)에서도 동일 토큰 보장 (렌즈 1안 채택, 렌즈 0 string 토큰 기각). */
export const TOSS_PAYMENTS: unique symbol = Symbol.for('@gj-kit/toss-payments-nestjs:facade');

/** 명시적 @Inject — design:type 메타데이터를 어디서도 읽지 않는다 → SWC/esbuild 빌드 무설정 호환. */
export const InjectTossPayments = (): ParameterDecorator => Inject(TOSS_PAYMENTS);

type AnyTossConfig = TossPaymentsApiConfig<Env> | TossPaymentsWidgetConfig<Env>;

export class TossPaymentsModule {
  /** { provide: TOSS_PAYMENTS, useValue: createTossPayments(config) } — 파사드 로직 재사용, 중복 0. */
  static forRoot<E extends Env, const C extends AnyTossConfig>(
    config: C,
    options?: { readonly global?: boolean },        // 기본 true
  ): DynamicModule;

  /** 스토어(PrismaService 등)를 DI 의존성으로 조립하는 경로. */
  static forRootAsync<C extends AnyTossConfig>(options: {
    readonly imports?: DynamicModule['imports'];
    readonly inject?: readonly InjectionToken[];    // 예: [PrismaService, ConfigService]
    readonly useFactory: (...deps: readonly any[]) => C | Promise<C>;
    readonly global?: boolean;
  }): DynamicModule;
}

/** 앱이 조건부 파사드 타입을 보존하는 별칭 헬퍼 — forRootAsync는 런타임 토큰이라 타입이 소실되므로. */
export type TossPaymentsFor<C extends AnyTossConfig> =
  C extends TossPaymentsApiConfig<infer E> ? TossPaymentsKit<E, 'api', C>
  : C extends TossPaymentsWidgetConfig<infer E> ? TossPaymentsKit<E, 'widget', C>
  : never;

/**
 * 웹훅 컨트롤러 헬퍼 — NestFactory.create(AppModule, { rawBody: true }) 전제.
 * req.rawBody 부재 시 핸들러 미실행 + 명시적 500과 설정 안내 메시지(조용한 검증 전멸 방지).
 */
export function toNestWebhookHandler(
  verifier: WebhookVerifier,
  handlers: WebhookHandlers,
): (req: RawBodyRequest<IncomingMessage>, res: ServerResponse) => Promise<void>;
```

### 4.3 타입 보존 패턴 (문서 제공 — defineTossPaymentsConfig 강권)

```ts
// app/toss.config.ts — const 추론 고정 후 타입을 한 번 정의해 재사용
export const tossConfig = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders: /* ... */, billingKeys: /* ... */,
});
export type AppToss = TossPaymentsFor<typeof tossConfig>;

// 주입부 — 빠진 스토어의 플로우 접근은 여기서도 컴파일 에러
@Injectable()
export class SubscriptionService {
  constructor(@InjectTossPayments() private readonly toss: AppToss) {}
  charge() { return this.toss.billing.approve(/* ... */); }
}
```

### 4.4 rawBody 문서화 (패키지 README 최상단 — 3중 명시)

1. **Express 플랫폼**: `NestFactory.create(AppModule, { rawBody: true })` + 컨트롤러에서
   `@Req() req: RawBodyRequest<Request>` → `verifier.verify(req.rawBody!, req.headers, { sourceIp: req.ip })`,
   또는 `@Req()/@Res()` 확보 후 `toNestWebhookHandler(verifier, handlers)(req, res)`.
2. **Fastify 플랫폼**: rawBody 플러그인 + verify 수동 호출.
3. **경고**: body-parser JSON 미들웨어가 웹훅 경로에 선적용되면 서명/secret 검증 전멸.

### 4.5 리스크

- forRootAsync에서 `C`가 useFactory 반환 추론에 의존 — 복잡한 팩토리에서 const 추론이 풀릴 수 있음(`defineTossPaymentsConfig` 강권으로 완화).
- Nest 메이저 매트릭스(10/11) CI 비용.
- 순수 조립층이므로 테스트는 unit(Nest Testing Module)로 충분 — 통합 테스트 불요.

---

## 5. 구현 작업 분해

### Phase A — 코어 확장 (@gj-kit/toss-payments, 전부 additive)

| # | 작업 | 파일 | 비고 |
|---|---|---|---|
| A1 | `core/events.ts` — createTossEvents 이미터 런타임(제네릭·의존성 0) | 신규 | 격리·no-op 계약 unit |
| A2 | `core/audit.ts` — AuditEntry/AuditSink/AuditOptions 타입 + redaction 순회기 + `AUDIT_REDACTED_KEYS` | 신규 | 실측 응답 픽스처 전수 redaction 스냅샷 unit |
| A3 | `server/client.ts` — TossClientOptions에 `audit`/`retry`/`events` 추가, createHttp.request에 계측+재시도 루프(하드 가드 4규칙) | 수정 | 재시도 오버헤드 벤치 1회 |
| A4 | `server/stores.ts` — `DepositSecretStore`(DepositSecretSource 상속, type-only import) | 수정 | |
| A5 | `server/confirm.ts` — ConfirmFlowOptions에 `depositSecrets`/`onDepositSecretSaveFailed`/`events`, 가상계좌 자동 저장(method 가드), `resolveConfirmFailure` + `ConfirmFlow.resolveFailure` | 수정 | Ok 유지 시맨틱 unit |
| A6 | `server/billing.ts` — `requireApproveIdempotencyKey` capability 분기, createBillingFlow options에 `events` | 수정 | 타입 테스트: 켜면 options 필수 |
| A7 | `webhook/verifier.ts`+`adapters.ts` — config `events`/`autoRefetch`, 어댑터 200 ack 후 prefetch 첨부 | 수정 | 수동 verify 불변 unit |
| A8 | `server/facade.ts` — createTossPayments 오버로드 2종 + defineTossPaymentsConfig + TossPaymentsKit | 신규 | expectTypeOf 회귀(조건부 프로퍼티 존재/부재, @ts-expect-error 픽스처) |
| A9 | `server` — `createFileAuditSink`(지연 node:fs) + tsup `external: [/^node:/]` | 수정 | 빌드 스냅샷: 정적 node 의존 0 검증 |
| A10 | `testing` — `memoryDepositSecretStore()` / `memoryAuditSink()` | 수정 | |
| A11 | `server.ts`/`index.ts` 재export 갱신 + dts 타입 순환 스냅샷(TossEventMap의 server↔webhook type-only) | 수정 | |

### Phase B — @gj-kit/toss-payments-nestjs 신규

| # | 작업 |
|---|---|
| B1 | 패키지 스캐폴드(루트 `toss-payments-nestjs/`, tsup, tsconfig `emitDecoratorMetadata: false`, peer 매트릭스) |
| B2 | TOSS_PAYMENTS 심볼 토큰 + InjectTossPayments + TossPaymentsModule.forRoot/forRootAsync + TossPaymentsFor |
| B3 | toNestWebhookHandler (rawBody 부재 → 명시적 500) |
| B4 | unit 테스트(Nest Testing Module 주입 왕복, forRootAsync 팩토리 조립, rawBody 부재 500) + 타입 테스트(AppToss 패턴 보존) |
| B5 | README(rawBody 3중 경고 최상단) + CLAUDE.md에 "런타임 의존성 0 원칙 비적용(peer만)" 명시 |

### Phase C — 테스트·문서·릴리스

| # | 작업 |
|---|---|
| C1 | unit: 이벤트 격리(sync throw/async rejection), audit sink 예외 삼킴, retry 하드 가드(키 없는 POST 불발·4xx 불발·409/transport 발동), depositSecrets Ok 유지 |
| C2 | type: 파사드 조건부 프로퍼티, widget+billingKeys 오버로드 불충족, capability approve options 필수 — 전부 `@ts-expect-error` 픽스처 |
| C3 | integration(분당 100건 주의, 직렬): ① 파사드 풀 배선 왕복 ② retry 409 시뮬(Test-Code) ③ autoRefetch 실조회 ④ audit 실응답 redaction 스냅샷 |
| C4 | README 재편: 파사드 골든 패스 승격 / 개별 조립 절 격하 / 웹훅 예제 prefetched 교체 / confirm 실패 분기 resolveFailure 교체 / §6에 "PROVIDER_ERROR를 왜 자동 재시도 안 하나"(4xx 멱등 재생 실측) 선제 문단 / 빌링 절 capability 골든 패스 |
| C5 | changeset: toss-payments minor(추가만), toss-payments-nestjs 신규 |

**의존 순서**: A1~A7(병행 가능) → A8(파사드는 옵션 배선 지점 완성 후) → B(파사드 선행 필수) → C는 각 Phase에 동반.

---

## 6. 이후 후보 (could — v1.1 미포함)

| 후보 | 출처 | 요지 | 보류 근거 |
|---|---|---|---|
| `CancelOutcome.remaining` | 렌즈 0 | 부분취소 응답의 fresh Payment로 asCancelable 재수행 결과를 동봉(재조회 왕복 절약) | 사고 방어는 기존 서버 낙관적 잠금(NOT_MATCHES_REFUNDABLE_AMOUNT, 실측)으로 이미 충분 — 남는 것은 마찰뿐 |
| `ConfirmRetryTicket` + `idempotency: 'auto'` | 렌즈 1 | cancel과 대칭인 confirm transport 재시도 티켓 | §3.7 resolveConfirmFailure가 복구 경로를 먼저 제공 — 자동 키 부착의 §7-5 확정(기본 미부착) 변경은 티켓 수요 실증 후 |
| `throttle` 옵션 | 렌즈 2 | 인스턴스 내 분당 요청 상한(테스트 분당 100건 대응) | 사용자 이슈로 실제 보고될 때 승격해도 늦지 않음. 대기 시간의 timeout 불포함 계약 확정 필요 |
| 듀얼 키 단일 파사드 / `createTossPayments.fromEnv()` | 렌즈 1 | 위젯+빌링 병용 상점 1파사드, raw env 진입점 | §2 판정 — 파사드 2개 패턴 문서화로 대체, DX 수요 실증 시 별도 진입점으로 재논의(본체 시그니처 불변) |
| events의 서버리스 waitUntil 합류 | 렌즈 0/1 | 웹훅 어댑터 waitUntil 경로에 async 핸들러 합류 | 어댑터 내부 계약 변경이 필요 — v2 과제 |
| audit 2차 방어선 — PAN 패턴(13~19 digits) 마스킹 | 렌즈 1/2 | denylist 누락 대비 휴리스틱 | 오탐(orderId 등 숫자열) 검증 필요 |
| webhook 인바운드 audit kind | 렌즈 0 | 'webhook-received'/'webhook-verdict' 기록 | v1.1은 아웃바운드 전용 확정(§3.2) — secret 제거 요약의 안전한 기록 형식 설계 후 |
| ALREADY_PROCESSED_PAYMENT + 조회 CANCELED 케이스 | 렌즈 0 | resolveConfirmFailure의 별도 분기 필요 여부 | **Phase 6 실측 항목** |

---

## 7. 기각 제안과 사유 (렌즈 명시 기각 + 합성 판정)

| # | 기각 제안 | 출처 | 사유 |
|---|---|---|---|
| 1 | 파사드가 raw string 키를 받아 내부 파싱 | 렌즈 1 [reject] | ① Env phantom 소실 — 브랜드 파서가 각인하는 `'test'\|'live'`를 raw string에서 추론 불가 → `testCode` 비분배 조건부 차단 붕괴 ② 실패 시점·형태 이원화 — 부팅 시 `orThrow(parse...)` 즉시 실패 관례가 Result<Facade> 또는 throw 예외 확대로 변질 ③ "검증 통과 = 브랜드 보유" 전역 규약의 유일한 구멍. 절약되는 것은 2줄뿐 |
| 2 | autoRefetch 성공 시 trust 'verified' 승격 / payload를 조회 Payment로 대체 | 렌즈 1 [reject] | 조회 성공은 **웹훅 발신자 진위를 증명하지 않는다** — 위조 웹훅이 실존 orderId를 찍으면 조회는 성공한다. trust 3등급은 토스가 서명을 제공하지 않는 구조적 한계의 정직한 노출이며 승격은 거짓 보장. payload 몰래 대체는 "payload를 믿지 않는다" 규율 학습을 파괴. §3.5의 prefetched 첨부가 편의는 동일 제공 |
| 3 | toss retryable 에러(PROVIDER_ERROR 등) 자동 재시도 / 새 멱등키 자동 재발급 재시도 | 렌즈 2 [reject] | Phase 5 실측: 4xx 에러 응답도 멱등키 15일 바인딩 → 동일 키 재시도는 원본 에러 재생만 하고, 새 키 자동 재발급은 멱등 보호를 라이브러리가 스스로 폐기(첫 요청의 부분 처리 가능성을 판별 불가 — 이중 승인/취소를 사용자 몰래 감수). `retryable`의 의미는 "새 키 + 상황 판단으로 재시도할 가치" — 자동화 신호가 아님. `onRetry.reason` 2종 리터럴로 타입 봉인(§3.4). README §6에 선제 답변 문단 |
| 4 | deposit secret 저장 실패 시 confirm을 Err로 반전 | 3렌즈 공통 배제 | 승인은 토스 측에서 이미 완결 — Err는 "승인됐는데 실패 처리 + 재confirm 유도"라는 더 큰 사고. secret은 조회로 복구 가능(실측)해 billing.issue(복구 불가 → Err)와 근거가 다름 |
| 5 | fail callback 대응 OrderStore 메서드 추가 | 렌즈 0 내 판정 | 기존 OrderStore 구현체를 깨는 파괴적 변경 — 문서화로 대체 |
| 6 | billing approve 멱등키 orderId 자동 유도 | 렌즈 0 내 판정 | 결정적 키 + 4xx 15일 재생 조합 함정(일시 오류가 주기 키에 바인딩되면 해당 주기 재청구 15일 봉쇄)을 라이브러리가 떠안음 — 명시적 필수화(capability)만 채택 |
| 7 | audit의 request/response 분리 레코드(kind 5종) | 합성 판정 (렌즈 0안 vs 1/2안) | 시도 1건=1엔트리 outcome 유니언(렌즈 1/2 수렴)이 상관 비용 없이 동일 정보 제공 — 분리안 기각. 웹훅 kind 2종은 §6 이후 후보로 |
| 8 | audit용 신규 `"./node"` 서브패스 | 합성 판정 (렌즈 1안 vs 2안) | §7 확정(subpath 5종 유지)과 충돌. 렌즈 2의 "./server" + 지연 동적 import + tsup external로 Edge 호환·platform neutral을 동일하게 보존 |
| 9 | autoRefetch를 verify 내부에서 실행 | 합성 판정 (렌즈 0안 vs 1/2안) | Express 수동 verify 사용자의 10초 규약 잠식 + verify 순수성(네트워크 무호출) 훼손 — 어댑터 200 ack 이후 실행(렌즈 1/2 수렴) 채택 |
| 10 | verifier 2상 제네릭(`WebhookVerifier<'refetched'>`) | 합성 판정 (렌즈 2안) | 조건부 핸들러 타입의 에러 메시지 품질 리스크(부록 A)와 표면 복잡도가 옵셔널 필드 대비 편익 초과 — additive `prefetched?` 채택 |
| 11 | 듀얼 키 단일 파사드(client+widgetClient 동시) | 합성 판정 (렌즈 1안) | confirm 클라이언트 선택("widget 우선")이라는 새 암묵 규약 발생 + 조건부 타입 판정 경로 복잡화 — 파사드 2개 패턴으로 대체, §6 재논의 |

---

## 부록. 기존 공개 API와의 관계 — 전량 추가만 (파괴 없음 검증표)

| 기존 표면 | v1.1 변경 | 종류 |
|---|---|---|
| `TossClientOptions` | `audit?` / `retry?` / `events?` 필드 | 옵셔널 추가 |
| `ConfirmFlowOptions` | `depositSecrets?` / `onDepositSecretSaveFailed?` / `events?` 필드 | 옵셔널 추가 |
| `ConfirmFlow` | `resolveFailure` 메서드 | 메서드 추가 |
| `createBillingFlow` options | `events?` 필드 | 옵셔널 추가 |
| `BillingCapabilities` | `requireApproveIdempotencyKey?: true` | 옵셔널 추가 (미지정 시 기존 BillingFlowBase 그대로) |
| `WebhookVerifierConfig` | `events?` / `autoRefetch?` 필드 | 옵셔널 추가 |
| `Unverified` | `prefetched?` 필드 (기존 `refetch()` 존치) | 옵셔널 추가 |
| `WebhookVerifierConfig.depositSecrets` | 타입 불변 — `DepositSecretStore`가 `DepositSecretSource`를 구조적 충족 | 무변경 |
| 신규 export | `createTossPayments` / `defineTossPaymentsConfig` / `TossPaymentsKit` / `DepositSecretStore` / `AuditEntry`·`AuditSink`·`AuditOptions`·`AUDIT_REDACTED_KEYS` / `createFileAuditSink` / `TossEventMap`·`TossEvents`·`createTossEvents` / `RetryOptions` / `ConfirmResolution`·`resolveConfirmFailure` / `memoryDepositSecretStore`·`memoryAuditSink` | 신규 |
| 신규 패키지 | `@gj-kit/toss-payments-nestjs` | 신규 |
| 기존 팩토리 4종·subpath 5종·throw 없음 원칙·§7 확정 사항 | 전부 불변 (§7-5 confirm 멱등키 기본 미부착 유지 — 자동화는 §6 티켓 후보로) | 무변경 |
