# @gj-kit/toss-payments

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

  JavaScript 우회 설정도 안전하게 처리하도록 양의 안전한 정수 금액, 1~600,000ms 승인 창,
  2~5회 재시도와 0~60,000ms 비어 있지 않은 retry delay를 런타임에서 검증합니다.

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
