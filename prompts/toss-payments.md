# @gj-kit/toss-payments — 토스페이먼츠 결제 라이브러리 구현

> 이 프롬프트는 fable5 + ultracode 세션용이다. 아래 내용을 그대로 미션으로 삼아 진행하라.
> 사전 리서치·의사결정이 완료된 상태이므로 여기 적힌 결정을 재논의하지 말 것.
> 단, 여기 없는 새로운 결정 지점이 나오면 임의로 정하지 말고 AskUserQuestion으로 선택지를 만들어 물어볼 것 (사용자가 명시적으로 요청한 협업 방식이다).

## 미션

`/Users/apeltop/project/service/gj-kit` 모노레포의 첫 라이브러리로 토스페이먼츠 V2 결제 라이브러리를 구현한다. 외주 프로젝트마다 반복되는 결제 요구사항을 재사용하기 위한 것으로, **모든 기능을 다 감싸는 것이 아니라 필수 기능(단순결제 승인·조회, 환불, 정기결제, 위젯, 웹훅)을 "잘못 쓸 수 없게" 제공하는 것**이 핵심 가치다. 결제는 실수 비용이 크므로, 인터페이스·추상클래스·브랜디드 타입으로 검증 단계를 통과하지 않으면 다음 단계 호출 자체가 불가능한 구조를 강제한다.

## 확정된 의사결정 (2026-08-08 사용자 확정)

| 항목 | 결정 |
|---|---|
| 패키지 이름 | `@gj-kit/toss-payments` (npm 조직 `gj-kit` 생성 필요 — 배포 전 사용자에게 조직 생성 요청) |
| 모노레포 구조 | **루트의 각 폴더 = 독립 라이브러리** (예: `gj-kit/toss-payments/`). `packages/` 하위 아님 |
| 모노레포 도구 | pnpm workspaces + Changesets |
| v1 범위 | 서버 SDK + 브라우저 위젯 래퍼 + 웹훅 검증 유틸 |
| 에러 스타일 | **Result 타입 반환** (throw 아님). Result는 zero-dependency로 직접 구현 |
| 의존성 정책 | 런타임 의존성 0개 목표. HTTP는 내장 fetch (Node 18+). 브라우저 위젯은 `@tosspayments/tosspayments-sdk`를 peerDependency로 |
| 언어/빌드 | TypeScript strict, ESM+CJS 듀얼 (tsup), vitest + `expectTypeOf` 타입 테스트 |

## 프로젝트 리소스

- **리서치 문서(필독)**: `docs/research/toss-payments-v2.md` — 토스 V2 문서를 에이전트 11개가 직접 읽고 정리한 것. 엔드포인트/제약/에러 코드/설계 시사점이 정리되어 있다. **구현 전 반드시 전체를 읽어라.** 여기 없는 내용은 추측하지 말 것.
- **토스 문서 MCP**: `.mcp.json`에 `tosspayments-integration-guide` 서버가 등록되어 있다 (`get-v2-documents`, `get-glossary-documents`, `document-by-id`). 열린 질문 확인에 사용하라. 문서 페이지는 URL 끝에 `.md`를 붙이면 마크다운 원문을 준다 (예: `https://docs.tosspayments.com/reference.md`). 단, `reference/error-codes.md`는 엔드포인트별 에러 표가 비어 나오므로 HTML 버전을 봐야 한다.
- **테스트 키**: 루트 `.env` (커밋 금지, .gitignore 등록됨)
  - `TOSS_CLIENT_KEY` / `TOSS_SECRET_KEY` — **API 개별연동용 키**(test_ck_/test_sk_). 시크릿 키 유효성은 실제 API 호출로 검증 완료.
  - `TOSS_SECURITY_KEY` — 보안 키 (64자 hex). 웹훅 서명 검증(payout.changed/seller.changed 전용) + 지급대행 JWE 암호화용.
  - **주의**: 결제위젯은 별도 키(test_gck_/test_gsk_)가 필요하다. 위젯 E2E 테스트는 사용자가 위젯 키를 발급하기 전까지 불가 — 위젯 래퍼는 단위 테스트 + 타입 테스트로만 검증하고, 위젯 키가 필요해지는 시점에 사용자에게 발급을 요청하라 (개발자센터 > API 키).

## 아키텍처 요구사항 (핵심 — 타협 불가)

설계 원칙: **"parse, don't validate"**. 검증을 통과해야만 얻을 수 있는 브랜디드 타입을 다음 단계의 유일한 입력으로 삼아, 검증 생략이 컴파일 에러가 되게 한다. 아래 4개 플로우 각각에 이 원칙을 적용한다.

### 1. 단순결제 승인 (confirm)

- successUrl 리다이렉트 쿼리(paymentKey/orderId/amount/paymentType?)는 `UnverifiedCallback` 타입으로만 파싱된다.
- confirm은 `VerifiedCheckout` (브랜디드 타입)만 받는다. 이 타입은 라이브러리의 verify 단계 — 저장된 주문 금액과 콜백 amount의 일치 검증 — 를 통과해야만 생성된다 (문서 원문이 "반드시 확인하세요"라고 요구하는 검증).
- 주문 저장/조회는 사용자가 구현하는 인터페이스(`OrderStore`: saveOrder/loadOrder 등)로 강제 주입 — 금액을 비교할 원본이 없으면 플로우가 시작되지 않게.
- 승인 시한(인증 후 10분, EXPIRED 30분 — 문서 간 불일치, 열린 질문 참조)을 보수적으로 안내하는 타임스탬프 검증 포함.
- Idempotency-Key를 confirm의 일급 옵션으로 노출 (최대 300자, POST 전용, 15일 유효).

### 2. 환불 (cancel) — 사용자가 명시한 대표 시나리오

- 환불은 반드시 **기존 결제 조회 → 검증 → 실행**의 3단계를 거친다. paymentKey 문자열로 바로 취소를 호출하는 API는 제공하지 않는다.
- 조회된 Payment에서 취소 가능 상태(`DONE | PARTIAL_CANCELED | WAITING_FOR_DEPOSIT` — 비공식 유도이므로 문서 주석에 근거 명시)를 통과해야 `CancelablePayment`가 된다.
- **전액 환불**: 호출자가 기대 금액(expectedAmount)을 전달해야 하고, 서버의 balanceAmount와 일치해야만 실행된다 (금액 동일성 검증 — 사용자 요구사항).
- **부분 환불**: cancelAmount ≤ balanceAmount 사전 검증 + `refundableAmount` 파라미터를 항상 전송해 서버 측 잔액 불일치 시 거절되게 한다 (문서 권장 안전장치).
- Idempotency-Key는 옵션이 아니라 라이브러리가 기본 생성(UUID)하는 필수 단계. 15일 TTL 경계는 문서화.
- 가상계좌 분기를 판별 유니언으로 강제: 입금 완료 취소 → refundReceiveAccount 필수 / 입금 전(WAITING_FOR_DEPOSIT) → 전액 취소만 + refundReceiveAccount 금지.
- 전액 취소 후 status가 반드시 CANCELED라고 단정하지 말 것 (공식 문서 예시에 반례 존재) — `balanceAmount === 0`으로 완전 취소를 판정.

### 3. 정기결제 (billing)

- typestate 흐름 강제: `AuthKeyReceived` → issue → `BillingProfile` → approve. authKey 없이 issue 호출, 발급 전 approve 호출이 타입상 불가능해야 한다.
- `BillingProfile`은 billingKey + customerKey 쌍을 봉인한 객체 — approve 시 customerKey를 따로 받지 않아 NOT_MATCHES_CUSTOMER_KEY를 구조적으로 방지.
- `BillingKeyStore` 인터페이스(save/find/delete) 필수 주입 — 토스는 빌링키 조회 API가 없으므로 저장을 잊으면 복구 불가. 저장이 인터페이스로 강제되어야 한다.
- successUrl로 돌아온 customerKey는 신뢰하지 않는다: 세션에 저장된 customerKey와 대조하는 검증 단계를 건너뛸 수 없는 구조(PendingAuth 타입)로.
- 빌링키 갱신 API는 없다 — revoke + 재발급 플로우만 제공, refresh류 메서드 금지.
- 카드 직접 발급(/v1/billing/authorizations/card)은 추가 계약 필요 — 옵트인 capability 플래그로 분리 (테스트 환경에서는 BIN 6자리로 동작하므로 통합 테스트의 핵심 경로다).

### 4. 웹훅

- verify는 반드시 **raw body(string/Buffer) + headers**를 받는다. 파싱된 객체만 받는 시그니처 금지 (서명 검증 원천 불가).
- 검증 등급을 타입으로 구분: `SignatureVerified`(payout.changed/seller.changed — HMAC-SHA256, "v1:" 접두사, 콤마 복수 서명, 키 로테이션 대비 키 배열 지원) / `SecretVerified`(DEPOSIT_CALLBACK — 저장된 Payment.secret 대조 콜백 주입) / `Unverified`(나머지 — 결제 조회 API 재확인을 유도하는 타입). **모든 이벤트에 서명 검증을 강제하는 설계는 불가능하다** (토스가 제공하지 않음).
- transmission-id 기반 dedupe store 인터페이스 주입 (재전송 7회 + 가상계좌 이중 이벤트 대응).
- 빌링 승인 완료 웹훅은 존재하지 않음을 타입/문서에 명시.
- DEPOSIT_CALLBACK 페이로드에는 paymentKey가 없다 (orderId/secret 기반) — 핸들러 인터페이스 설계 시 주의.

### 공통

- **키 타입 분리**: 템플릿 리터럴 타입으로 `test_ck_${string}` 등 4종(위젯/API × client/secret) + test/live phantom type. 위젯 키로 API 클라이언트 생성, 시크릿 키의 브라우저 유입이 컴파일 에러가 되게. `TossPayments-Test-Code` 에러 시뮬레이션 헤더는 테스트 키 클라이언트에서만 타입 허용.
- **엔트리 분리**: package.json subpath exports로 `@gj-kit/toss-payments/server`(시크릿 키, Node 전용)와 `@gj-kit/toss-payments/browser`(클라이언트 키, 위젯 래퍼) 분리. Basic 인증 문자열 생성(base64(secretKey+":"), 콜론 필수, BOM 금지)은 내부 캡슐화.
- **Result 타입**: `Result<T, E>` 직접 구현 (ok/err + map/andThen 정도의 최소 콤비네이터). 모든 공개 작업이 Result를 반환. 사용자 취소(USER_CANCEL 등)는 에러가 아닌 별도 variant로.
- **에러 모델**: `{code, message, httpStatus}` 보존 + API별 discriminated union. 취소 에러는 리서치 문서의 "취소 API 공식 표 30개" 기준으로 카테고리 매핑(상태 위반/금액 위반/부분취소 불가/기한/계좌/동시성/재시도 가능/인증). **HTTP status로 재시도 여부를 판정하지 말 것** — PROVIDER_ERROR는 400이지만 재시도 가능, REFUND_REJECTED는 400이지만 비재시도.
- **Payment 타입**: status 8종 리터럴 유니온, method는 **한글 리터럴 그대로**('카드', '가상계좌' 등 — 영문 enum을 지어내면 런타임 전부 불일치), status/method에 따른 판별 유니언으로 nullable 필드 내로잉. DONE → WAITING_FOR_DEPOSIT 역전이 존재(입금 오류) — 상태 머신을 단방향으로 만들지 말 것.
- orderId(6-64자)/customerKey/orderName 등 문자열 제약은 스마트 생성자로 생성 시점 검증.
- 해외 간편결제(PayPal) 취소는 비동기(cancelStatus IN_PROGRESS) — cancelStatus를 타입에 포함하고 동기 성공으로 단정하지 말 것.

## 세션 초반에 해소할 열린 질문 (Phase 0)

MCP + 실제 테스트 API 호출로 확인하고, 결과를 `docs/research/toss-payments-v2.md`에 추가 커밋하라:

1. 멱등키 헤더의 정확한 이름 (`Idempotency-Key`로 추정되나 리서치 간 확신 수준 충돌) — authorization 문서 확인 + 실제 호출로 검증
2. customerKey 길이 제한 (2-50 vs 2-300 문서 간 모순) — 실제 API로 51자/301자 키 테스트
3. cancelAmount > balanceAmount 시 실제 에러 코드 (NOT_CANCELABLE_AMOUNT 403 추정) — 실제 취소로 확인
4. 승인 시한 10분 vs 30분(EXPIRED)의 관계
5. requestBillingAuth의 계좌이체 method enum 값
6. 전액 취소 후 status가 CANCELED가 아닐 수 있는 조건
7. 테스트 환경 웹훅 발송 여부 (로컬 URL 등록 불가이므로 페이로드 시뮬레이션 테스트 유틸로 대체할 근거 확인)

## 검증 단계 (필수 — 실제 테스트 API 호출)

`.env`의 API 개별연동 키로 **서버만으로 완결되는 라이브 E2E 루프**가 가능하다:

```
빌링키 발급(/v1/billing/authorizations/card, 테스트는 카드 BIN 6자리로 가능)
→ 자동결제 승인(/v1/billing/{billingKey}) → Payment 획득
→ 결제 조회(GET /v1/payments/{paymentKey})
→ 부분 취소 → 잔액 확인 → 전액 취소
```

이 루프를 vitest 통합 테스트(`*.integration.test.ts`, 별도 스크립트로 분리)로 구현하고 다음 시나리오를 반드시 포함:

- 정상 플로우: 발급 → 승인 → 조회 → 부분취소 → 전액취소 (balanceAmount 추적 검증)
- 환불 검증 강제: 전액 환불 시 expectedAmount 불일치 → 라이브러리가 API 호출 전에 Err 반환
- cancelAmount > balanceAmount → 사전 검증 Err + (사전 검증 우회 시) 서버 에러 코드 매핑 확인
- ALREADY_CANCELED_PAYMENT: 전액 취소 후 재취소
- NOT_MATCHES_CUSTOMER_KEY: 다른 customerKey로 승인 시도 (BillingProfile 봉인 설계가 이를 막는다는 것의 대조 실험)
- 멱등성: 같은 Idempotency-Key로 취소 2회 → 동일 응답, 중복 취소 없음
- `TossPayments-Test-Code` 헤더로 에러 시뮬레이션 (REJECT_CARD_PAYMENT 등)
- 잘못된 키 조합 → INVALID_API_KEY/UNAUTHORIZED_KEY 매핑
- 웹훅: 실수신이 불가하면 문서의 페이로드 스키마로 시뮬레이션 (서명 생성→검증 왕복, secret 대조, dedupe)

주의: 테스트 환경 분당 100건 제한 — 통합 테스트에 스로틀/직렬 실행 적용. 타입 강제 검증은 `expectTypeOf` + `@ts-expect-error` 픽스처(예: 검증 안 된 콜백을 confirm에 넣으면 컴파일 에러)로 커버.

## 산출물

```
gj-kit/
├─ toss-payments/            # @gj-kit/toss-payments (루트 폴더 = 라이브러리)
│  ├─ src/ (server/, browser/, webhook/, core/(result, errors, keys, types))
│  ├─ tests/ (unit + integration + type)
│  ├─ README.md              # 플로우별 사용 예제 — 검증 단계가 왜 강제되는지 설명 포함
│  └─ package.json           # exports: ./server, ./browser / sideEffects: false
├─ pnpm-workspace.yaml       # packages: ["*"] (package.json 있는 폴더만 인식됨)
├─ package.json              # private 루트
├─ tsconfig.base.json
├─ .changeset/
├─ CLAUDE.md                 # 모노레포 규칙: 루트 폴더 = 독립 라이브러리, 커밋/배포 규칙
└─ (기존: .env, .mcp.json, docs/, prompts/)
```

git init + 초기 커밋도 이 세션에서 수행 (커밋 전 .env가 무시되는지 재확인).

## 진행 방식 (ultracode)

Phase마다 워크플로를 하나씩 돌리고, Phase 사이에 결과를 검토·보고하라:

1. **Phase 0 — 확인**: 리서치 문서 정독 + 열린 질문 7개를 MCP·실제 API로 해소 (병렬 에이전트)
2. **Phase 1 — 설계**: 독립 설계안 3개(타입 안전성 우선 / DX 우선 / 최소 표면 우선) → judge panel로 채점·합성. 공개 API 표면(메서드 시그니처 전부)을 사용자에게 요약 보고하고, 이때 남은 결정(결제창 래퍼 포함 여부, 라이선스, 최소 Node 버전 등)을 AskUserQuestion으로 질문
3. **Phase 2 — 스캐폴드**: 모노레포 + 패키지 골격 + CI 없이 로컬 스크립트(build/test/typecheck)
4. **Phase 3 — 구현**: 모듈별 pipeline (core → server → webhook → browser)
5. **Phase 4 — 리뷰**: adversarial verify (정확성/타입 우회 가능성/보안(키 노출·로그)/문서 근거 대조 렌즈)
6. **Phase 5 — 라이브 검증**: 위 통합 테스트 실행, 실패 시 수정 루프 (테스트를 통과시키기 위해 검증을 약화시키지 말 것)

완료 기준: 통합 테스트 전부 통과 + 타입 테스트 통과 + README 예제가 실제로 컴파일·동작 + Changesets 초기 설정 완료 (배포는 사용자가 npm 조직 생성 후 별도 진행).
