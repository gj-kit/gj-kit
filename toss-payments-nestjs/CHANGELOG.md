# @gj-kit/toss-payments-nestjs

## 0.4.3

### Patch Changes

- 65ade77: 코어 peer 지원 범위에 `^0.6.0`을 추가한다. 코어 0.6은 additive(멱등키·재생 창 헬퍼, payment-state 상호운용, 카드 발급사 코드표, 테스트 스토어 inspection)라 Nest 어댑터 동작 변화는 없다.

## 0.4.2

### Patch Changes

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

- 509fb4c: 여러 Toss 키 쌍을 안전하게 분리하는 named Nest DI API(`register`, `registerAsync`,
  `getTossPaymentsToken`, `InjectTossPayments(name)`)를 추가했습니다. Nest 웹훅 헬퍼는
  원본 socket과 명시적 trusted-proxy `sourceIp` extractor를 코어 handler에 전달해 일반
  상태 웹훅의 fail-closed IP 검증을 유지합니다. 코어 peer 지원 범위에 0.4을 추가했습니다.

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

### Patch Changes

- Updated dependencies
  - @gj-kit/toss-payments@0.2.0

## 0.1.0

### Minor Changes

- 6fd6718: 첫 릴리스: `@gj-kit/toss-payments` NestJS 어댑터

  - `TossPaymentsModule.forRoot / forRootAsync` — 파사드 싱글턴 DI 등록(글로벌 모듈)
  - `@InjectTossPayments()` — 파사드 주입 데코레이터
  - `toNestWebhookHandler` — rawBody 강제 확인(누락 시 실행 없이 500 + 설정 안내), 검증·dedupe는 코어 웹훅 어댑터에 위임
  - 코어를 번들하지 않고 `@gj-kit/toss-payments/server` import 유지, ESM+CJS 듀얼

### Patch Changes

- Updated dependencies [3ba0dfb]
- Updated dependencies [6fd6718]
  - @gj-kit/toss-payments@0.1.0
