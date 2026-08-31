# @gj-kit/toss-payments

## 0.6.2

### Patch Changes

- 73379a8: docs: lead every README with the payoff instead of the taxonomy

  패키지 README와 문서 포털을 전면 개편했다. 기존 문서는 경계와 금지 사항부터 나열해서, 처음 보는 사람이 이 패키지를 왜 써야 하는지 판단할 근거가 없었다.

  각 README는 이제 다음 순서로 읽힌다.

  - npm·CI·types·runtime deps·license 배지
  - tagline — 이 패키지가 무엇을 불가능하게 만드는지 한 줄
  - "왜 필요한가" — 이 패키지 없이 실제로 나는 사고
  - "무엇으로 막는가" — 실제 export 심볼로 추적 가능한 항목 4~5개
  - Golden path — 기존과 동일
  - "실제로는 이렇게 걸립니다" — payoff가 드러나는 두 번째 예제
  - "주장 대신 검증" — 측정한 숫자만

  문구 정본은 `website/src/data/catalog.mjs` 하나이고 README 20종과 포털이 여기서 생성된다. 추가한 예제는 전부 `check:readme`가 dist 타입에 대해 컴파일을 검증하며, `check:docs`와 `check:readme`가 tagline·problem·highlights·배지의 존재를 검사한다. `localize-readmes.mjs`는 "runtime deps 0" 배지가 사실인지도 함께 강제한다.

  공개 API는 변경되지 않았다.

## 0.6.1

### Patch Changes

- 9c3cbc4: Publish English-first and Korean README files, add package discovery metadata, and link every package to the generated global API documentation portal.

## 0.6.0

### Minor Changes

- c8494a2: Idempotency derivation, replay-window and query-first helpers, plus the official card issuer code table — all on the environment-neutral root entry, additive only.

  - **`TOSS_IDEMPOTENCY_KEY_TTL_MS`** (15 days — the provider's documented `Idempotency-Key` binding window; what happens to a key reused after it is not documented and is treated as unsafe) and **`DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS`** (14 days — one day of margin for the provider's day-granularity wording and clock drift).
  - **Cancel retry tickets now expire on the 14-day `DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS` instead of the full 15-day provider TTL**, so the library's own replay path is no wider than the window it recommends. A ticket between 14 and 15 days old now returns `retry-ticket-expired` (API not called); its documented recovery — look the payment up with `getPayment` — is unchanged.
  - **`deriveIdempotencyKey({ operation, parts, attempt? })`** → `Result<IdempotencyKey, InvalidInput<'idempotencyKey'>>`. Builds `<operation>:<parts joined by ':'>` plus `#<attempt>` when an attempt is given (just `<operation>` for empty `parts`), then validates through the existing `idempotencyKey` parser so the 1–300 char rule lives in one place. Deterministic for the same input, and **injective**: every segment must be non-empty (`reason: 'empty'`) and consist of visible ASCII without the two delimiters `:` and `#` (`reason: 'bad-charset'`), so distinct inputs never derive the same key — `_`, `.`, `@`, `=`, `-` (every id charset the library already validates, UUIDs, epochs) pass unchanged; ISO timestamps with `:` do not. Explicit by design: the library still never derives keys automatically.
  - **`idempotencyKey(raw)` now enforces a header-safe charset** — `^[\x21-\x7E]+$` (visible ASCII, no whitespace) — returning `reason: 'bad-charset'` otherwise. Keys containing non-Latin-1 characters or CR/LF could never be sent (fetch `Headers` throws a TypeError, which the transport layer surfaced as a retryable `NETWORK_ERROR`), and whitespace/Latin-1 keys may be altered by intermediaries; an `Ok` key is now guaranteed to reach Toss byte-identical on every resend. Existing ASCII keys (`sub:2026-08:user-1`, UUIDs) are unaffected.
  - **`isWithinIdempotencyReplayWindow(issuedAt, now, windowMs?)`** — `true` while `now - issuedAt < windowMs` (upper bound exclusive; any non-finite operand — invalid `Date`, `NaN`, `±Infinity` in `issuedAt`, `now`, or `windowMs` — → `false`). Within the window, resending the same key and body is a safe replay; after it the same key may execute as a new request, so only a lookup is safe.
  - **`OUTCOME_QUERY_FIRST_ERROR_CODES`** (frozen `readonly string[]`) and **`mustQueryOutcomeBeforeRetry(failure)`** — the failures after which the payment/billing outcome must be looked up before retrying or marking FAILED: every `TransportFailure`, `ALREADY_PROCESSED_PAYMENT`, `IDEMPOTENT_REQUEST_PROCESSING`, `FORBIDDEN_CONSECUTIVE_REQUEST`, and every TRANSIENT code (`PROVIDER_ERROR`, `FAILED_INTERNAL_SYSTEM_PROCESSING`, `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING`, `COMMON_ERROR`, `FAILED_REFUND_PROCESS`, `FAILED_METHOD_HANDLING_CANCEL`, `FAILED_PARTIAL_REFUND`, `FAILED_BILLING_AUTO_CANCEL`, `FAILED_BILL_KEY_AUTH_CREATION`). Decided by `source`/`code` only, never by HTTP status; unregistered codes return `false`. Invariant: every code the library classifies `retryable: true` is in the set — enforced in the unit suite against the new **`CLASSIFIED_TOSS_ERROR_CODES`** (frozen `readonly string[]` — the keys of the internal error-code table, i.e. every code `classifyTossErrorCode` knows), so a retryable code added to the table without being added here fails CI.
  - **`CARD_ISSUER_NAMES_KO`** (frozen `Readonly<Record<KnownCardIssuerCode, string>>`), **`KnownCardIssuerCode`**, and **`cardIssuerName(code, locale?: 'ko')`** — the 30 two-character issuer/acquirer codes from Toss's official "기관 코드" page (24 domestic + 6 overseas) mapped to Korean display names; unknown codes yield `undefined`. Exact-match lookup, prototype keys excluded.

  README gains a "멱등키 유도와 재시도 규율" subsection under §5 (its recipe keeps non-terminal lookups — READY/IN_PROGRESS — out of the failure branch and replays the same key, rather than minting a new attempt, after transport failures and the two CONCURRENCY codes) and a `cardIssuerName` recipe under §4.3. No existing signature changed; the two behavioral tightenings are the `idempotencyKey` charset and the cancel ticket expiry described above.

- c8494a2: Payment-state access outside the branded boundary, ledger-refund reconciliation, and side-effect-free inspection on the `/testing` memory stores — additive only, no existing signature narrowed.

  - **`summarizePaymentState` now accepts `PaymentStateInput | Payment`** — `PaymentStateInput` is `Pick<Payment, 'paymentKey' | 'orderId' | 'status' | 'totalAmount' | 'balanceAmount' | 'lastTransactionKey' | 'isPartialCancelable' | 'cancels'>`, exactly the eight fields the summary reads. A full `Payment` remains assignable (parameter widening — non-breaking) and the explicit `| Payment` union member keeps even fresh inline full-`Payment` literals free of excess-property errors, so existing call sites compile unchanged; app-owned reduced payment views (with `raw`/`secret`/card details stripped) can now produce snapshots too. `isFullyCanceled`'s parameter was widened the same way to the three fields it reads (`status`/`balanceAmount`/`cancels`) `| Payment`.
  - **`SerializedPaymentStateSnapshot` + `serializePaymentStateSnapshot(snapshot)`** — the brand-free, JSON-ready form of `PaymentStateSnapshot` (`paymentKey`/`orderId` as plain `string`), for response DTOs, queues and jsonb columns that must not import the branded id types. Pure structural defensive copy — mutating the result cannot corrupt the source snapshot.
  - **`parsePaymentStateSnapshot(value: unknown)`** → `Result<PaymentStateSnapshot, InvalidPaymentStateSnapshot>` — exhaustive structural validation (schemaVersion 1, every field type, every closed-union literal including per-kind consistency-issue fields) and re-branding of `paymentKey`/`orderId` through the existing id parsers, keeping validation as the only path to a brand. The error extends `InvalidInput<'paymentStateSnapshot', …>` with a snapshot-specific reason union (`'malformed'` for structural failures, the id parsers' four reasons passed through for id failures) plus a `path` pointing at the offending value. To make that instantiation possible, `InvalidInput` gained a **defaulted** second type parameter `Reason` — every existing `InvalidInput<'orderId'>`-style reference keeps its exact shape. Two hardening rules: every own enumerable property of the untrusted value is read **exactly once** (one-shot shallow copy per level, inherited properties ignored), so an accessor cannot return a valid value to the check and a different one into the branded result; and `canceledAmount` must equal `totalAmount - balanceAmount` whenever both are safe integers — the one `schemaVersion: 1`-pinned derivation the ledger comparison hangs on. Otherwise parse is a shape gate, not a re-summarization: the remaining derived fields are trusted as data pinned by `schemaVersion`.
  - **`compareLedgerRefund(snapshot, { expectedRefundedAmount, requestedAmount? })`** → `LedgerRefundComparison` — "has the provider confirmed the refunds my ledger claims?", expressed purely in provider-snapshot terms. Balance model per the kit's Phase-0 field measurements (the same one the cancel path's 2xx validation enforces): an accepted async cancel _already_ reduces `balanceAmount` while `IN_PROGRESS`, so `snapshot.canceledAmount` includes in-flight amounts and the final confirmed amount lies in `[canceledAmount - pendingCancelAmount, canceledAmount]`. Accepts both the branded and the serialized snapshot form. Three-way discriminated union: `'settled'` (confirmed equals the target **and nothing is in flight** — an `IN_PROGRESS` cancel can still resolve `ABORTED` and take the balance back up), `'unconfirmed'` (an in-flight cancel keeps the verdict provisional and the target lies within the possible final range — re-fetch and compare again), `'mismatch'` (the target is outside every possible outcome — `direction` says which side is ahead; `direction: 'indeterminate'` when the snapshot's amounts are untrustworthy — the gating `invalid-amount`/`balance-exceeds-total` issues are attached — or when the ledger target is invalid, flagged `invalidLedgerTarget`). The optional `requestedAmount` (the single refund request being reconciled) makes a `'provider-below-ledger'` mismatch carry `shortfall: 'at-prior-state' | 'unexplained'` — `'at-prior-state'` (provider exactly at the pre-request amount, nothing in flight: the request most likely never reached the provider, replaying a sealed idempotent cancel is safe) vs `'unexplained'` (hold for a human). Note the kit's `'unconfirmed'` is strictly the in-flight case — an app-style "cancel never reached the provider" state surfaces as that `'at-prior-state'` mismatch, not as `'unconfirmed'`. The ledger target stays app-owned; the library never derives or stores it. Deliberately not reproduced: the "status CANCELED with only totalAmount valid ⇒ assume fully refunded" fallback — that is a guess, and a broken snapshot honestly yields `'mismatch'` instead.
  - **`/testing` memory stores gained side-effect-free readonly inspection**, mirroring the `memoryAuditSink().entries` convention: `memoryDedupeStore().stateOf(dedupeKey)` (`'processing' | 'completed' | undefined` — unlike a probing `claim()`, it never re-occupies a released key), `memoryOrderStore().orderOf(orderId)`, `memoryBillingKeyStore().recordOf(customerKey)` (deep copy including nested `card`/`transfers`), `memoryDepositSecretStore().secretOf(orderId)`, `memoryCancelRetryStore().recordOf(ticketId)`. All return defensive copies — mutating them cannot corrupt the store — and every existing store method signature is untouched.

  README: §4.2.2 gains the minimal-input/serialization/ledger-comparison recipes (with the app-owned-ledger note), §7 gains the inspection recipe.

## 0.5.0

### Minor Changes

- Harden billing-key lifecycle persistence against stale revocation and concurrent
  projection races. `BillingKeyStore.delete` now requires the atomic request
  `{ customerKey, expectedBillingKey }` and `billing.revoke` returns the explicit
  `{ currentStoredKeyDeleted }` outcome, emitting `billing.revoked` only when the
  current stored credential was removed. `save` accepts an optional nonsecret
  `operationId` correlation value.

  PostgreSQL billing-key storage now requires `SqlClient`, encrypts the full
  record through the required protector, persists only a SHA-256 operation
  fingerprint, and adds migration `0002_billing_key_operation_fingerprint`.
  `PgBillingKeyStore` provides locked compare/delete, compare/replace, opaque
  previous snapshots, and `withMutationLock` / `isCurrentOperationId` for a
  customer-scoped host projection fence. The fence does not serialize provider
  network calls; applications still need their own durable pre-provider gate.

  Update the Nest peer range so applications can consume core 0.5.

## 0.4.1

### Patch Changes

- f8dcc5a: CJS 소비자의 masquerading-as-ESM(TS1479) 수정 — exports `types` 조건을 `import`/`require` 분기별로 중첩 선언.

  `"type": "module"` 패키지에서 평면 `types` 한 개가 ESM 선언(`.d.ts`)만 가리켜, `moduleResolution: node16/nodenext` CJS 소비자가 런타임은 `.cjs`를 받으면서 타입은 ESM 선언으로 해석해 TS1479가 나던 문제를 고친다. 모든 export 경로(코어 `.`·`./server`·`./webhook`·`./browser`·`./testing`, nestjs `.`)에 `import`→`.d.ts` / `require`→`.d.cts` 중첩 `types`를 선언해, tarball에 실리기만 하고 참조되지 않던 `dist/*.d.cts`를 `require` 타입 경로에 배선했다. `./server`의 Node 전용 런타임 게이트(`node` 조건)·`./browser`의 `browser` 조건·번들러 모드(`moduleResolution: bundler`) 타입 해석은 기존 동작 그대로다.

## 0.4.0

### Minor Changes

- 1a23e37: Fetch/Node 웹훅 어댑터에 `maxBodyBytes`와 기본 256 KiB 수신 상한을 추가했습니다.
  선언된 Content-Length가 상한을 넘거나 실제 stream/body가 상한을 넘으면 검증·dedupe·핸들러
  실행 전에 413을 반환합니다. Express 사용자는 `express.raw({ limit })`를 같은 값으로 맞춰
  라이브러리 진입 전 Buffer 할당도 제한하세요.
- 2196cfe: 결제 응답을 base 필드, 취소 이력, 결제수단별 세부 객체까지 런타임에서 검증해 누락된 2xx
  응답이 `Payment` 또는 가상계좌 secret 저장으로 통과하지 않게 합니다.

  가상계좌 조회의 `VirtualAccountPayment.secret`은 `string | null`로 바로잡았습니다. 직접
  `confirm`/`confirmCallback`이 성공한 가상계좌만 `ConfirmedPayment.secret: string`을
  보장합니다. confirm 실패 뒤 조회에서 secret을 되살릴 수 없으면 `resolveFailure`는 새
  `confirmed-without-deposit-secret` 분기를 반환하므로 주문을 보류해 운영 복구로 처리해야
  합니다.

  JavaScript 우회 설정도 안전하게 처리하도록 양의 안전한 정수 금액, 1~~600,000ms 승인 창,
  2~~5회 재시도와 0~60,000ms 비어 있지 않은 retry delay를 런타임에서 검증합니다.

### Patch Changes

- 43a8a31: Ship a package-owned immutable provenance stamp in both Toss artifacts and reject packing from a dirty checkout. The release gate now installs the packed core and Nest tarballs into fresh Nest 10 and Nest 11 consumers, verifies their ESM/CJS public exports, and boots a named-kit DI context.

## 0.3.1

### Patch Changes

- 5f67c95: Add npm metadata that links each package to its source directory and issue tracker on GitHub.

## 0.3.0

### Minor Changes

- cc0c209: 환불 정책 계산과 결제 상태 관리 API를 추가합니다.

  - 전체·고정 비율·경과시간 구간·잔여 일수/회차/사용량 기반 환불 정책과 custom calculator
  - basis point + BigInt 기반 정수 반올림, 기존 완료 환불 차감, 장부 잔액과 Toss 잔액 대조
  - 정책 ID/버전과 계산 근거가 남는 runtime-sealed `RefundQuote`
  - 5분 기본 TTL·정확한 시간/현지 자정 경계, Payment 상태 지문, 저장 JSON을 비실행 `ParsedRefundQuote`로 읽는 `parseRefundQuote`, 동일 ID/버전 정책으로 exact 재계산하는 `policy.restoreQuote`
  - sealed quote를 현재 취소 가능 결제에 결속하는 `prepareRefund`, 요청 본문과 멱등키를 묶는 `prepareRefundExecution`, 실행 직전 재조회 후 기존 취소 primitive에 위임하는 `executeRefund`
  - 민감정보 없는 `summarizePaymentState`와 가역 상태 변경을 허용하는 `diffPaymentState`; 진행 중 취소는 `cancellation-pending`으로 별도 분류
  - 모순된 status·balance·취소 이력과 진행 중 취소를 `asCancelable`에서 fail-closed 처리하고 provider `ABORTED`는 명시적 오류로 반환

  `@gj-kit/toss-payments-nestjs`는 코어 peer가 0.x minor 범위를 벗어나므로 함께 minor로 올립니다.

## 0.2.0

### Minor Changes

- 결제 안전성·복구 강화 — 취소 재시도 영속화, 부분취소 타입상태, 웹훅 클레임

  `@gj-kit/toss-payments`에 추가된 공개 표면(전부 가산적 변경):

  - **`CancelRetryStore` / `CancelRetryRecord`** — 취소 요청 바이트를 네트워크 호출 **전에** 저장한다. 프로세스가 재시작돼도 동일 멱등키와 동일 body로 복원되므로, 응답을 못 받은 취소가 중복 취소나 미취소로 갈라지지 않는다. `createTossPayments({ cancelRetries })`로 주입한다.
  - **`cancels.retryById(ticketId, options)`** — 저장된 티켓으로 취소를 재개한다. 만료된 티켓은 `retry-ticket-expired`, 저장소 실패는 `retry-store-failure`로 구분되어 호출자가 재시도 가능 여부를 판정할 수 있다.
  - **`PartiallyCancelable` / `SettledCancelable` / `DepositedVaCancelable`** — 부분취소 가능 여부를 타입상태로 표현한다. 부분취소가 불가능한 결제에 금액을 넘기면 컴파일 단계에서 막힌다(`partial-cancel-not-allowed`).
  - **`WebhookClaimState`** — 웹훅 중복 처리 방지의 클레임 상태를 공개한다. 검증 실패 시 클레임을 되돌리는 보상 경로(un-claim)가 있어, 검증에서 튕긴 웹훅이 "처리됨"으로 굳지 않는다.
  - **`NodeHandlerOptions`** — Node 핸들러 어댑터 옵션.

  `@gj-kit/toss-payments-nestjs`는 코드 변경이 없지만 함께 minor로 올린다. peer 범위가 `^0.1.0`인데 **0.x에서 캐럿은 마이너를 고정**하므로(`^0.1.0`은 `>=0.1.0 <0.2.0`) 그대로 두면 두 패키지를 함께 설치한 소비자가 peer 충돌을 만난다.

## 0.1.0

### Minor Changes

- 3ba0dfb: 첫 릴리스: 토스페이먼츠 V2 결제 라이브러리 — 검증 강제 설계

  - confirm: 콜백 파싱 → OrderStore 금액 대조 → 브랜디드 VerifiedCheckout만 승인 가능
  - cancel: 조회 → asCancelable(3-변형) → 실행 3단계 강제, 멱등키 자동 생성 + 재시도 티켓
  - billing: typestate 발급 플로우, billingKey+customerKey 봉인(BillingProfile), 스토어 필수 주입, import 이관
  - webhook: raw body 검증 강제, 신뢰 3등급(signature/secret/unverified), 원자적 dedupe, fetch/node 어댑터
  - browser: 위젯 3단계 typestate, 키 4종 브랜드 타입 (시크릿 키 브라우저 유입 = 컴파일 에러)
  - testing: 웹훅 픽스처(서명 왕복), 인메모리 스토어, 실측 검증 카드 상수

- 6fd6718: v1.1 서비스 통합: `createTossPayments` 파사드 + 옵션 7종 추가 (기존 공개 API 파괴 없음 — 전량 추가)

  - `createTossPayments` 파사드 — confirm/cancel/billing/webhook 조립만 담당(검증 로직 중복 0), 옵션은 전부 기본 꺼짐·결제 경로 무간섭
  - `depositSecrets` — DepositSecretStore 주입으로 가상계좌 DEPOSIT_CALLBACK secret 대조를 파사드 배선에 포함
  - `audit` — 아웃바운드 req/res 기록. Authorization은 스키마에 필드 자체 부재, 비설정화 redaction(AUDIT_REDACTED_KEYS), billingKey 경로는 auditPath 치환으로 관측 채널 유출 차단
  - `events` — 타입드 in-process pub/sub (payment.confirmed / billing.issued·revoked / webhook.accepted / api.call), Result 흐름 불개입
  - `retry` — 실측 근거 하드 가드 자동 재시도(네트워크 실패 + 멱등키 보유 요청만, 토스 4xx/5xx 응답은 재시도 없음)
  - webhook `autoRefetch` — Unverified 이벤트에 조회 재확인 결과 자동 첨부(trust 등급 승격 없음)
  - `requireApproveIdempotencyKey` — 빌링 approve 멱등키를 타입 수준에서 필수화
  - `resolveConfirmFailure` — confirm 실패의 조회 기반 3분기(actually-confirmed / retry-payment / definitively-failed) 복구 헬퍼
