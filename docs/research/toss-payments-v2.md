# 토스페이먼츠 V2 리서치 (2026-08-08, 문서 기반)

> ultracode 워크플로(에이전트 11개)가 docs.tosspayments.com V2 문서를 직접 읽고 정리한 결과. 추측 금지 원칙으로 수집됨. 열린 질문은 구현 시 MCP(`tosspayments-integration-guide`)로 재확인할 것.

## 결제위젯(Payment Widget) V2 연동 전체 — SDK 로드부터 서버 승인(confirm)까지

토스페이먼츠 V2 결제위젯은 @tosspayments/tosspayments-sdk(npm) 또는 CDN(https://js.tosspayments.com/v2/standard)으로 로드하며, TossPayments(clientKey) → widgets({customerKey}) → setAmount → renderPaymentMethods/renderAgreement(주문서형) 또는 renderPaymentWindow(결제창형) → requestPayment 순서로 호출한다. 비회원은 TossPayments.ANONYMOUS를 customerKey로 사용하고, clientKey는 공개 가능하지만 secretKey는 서버 전용이다. 결제 성공 시 successUrl로 paymentKey/orderId/amount/paymentType 쿼리 파라미터가 붙어 리다이렉트되며, 서버는 이 amount가 원래 주문 금액과 일치하는지 반드시 검증한 뒤 10분 이내에 POST https://api.tosspayments.com/v1/payments/confirm(Basic 인증: base64(secretKey + ":"))으로 승인해야 한다. 승인 성공 시 Payment 객체(status: DONE 등)가 반환되고, 10분 초과 시 NOT_FOUND_PAYMENT_SESSION 에러와 함께 결제 데이터가 소실된다. setAmount가 렌더링·결제요청보다 선행되어야 한다는 순서 제약과 금액 검증 의무가 문서에 명시되어 있어, 타입 상태 머신으로 강제하기 좋은 구조다.

### 연동 플로우

1. SDK 로드: npm `npm install @tosspayments/tosspayments-sdk --save` 후 `import { loadTossPayments, ANONYMOUS } from "@tosspayments/tosspayments-sdk"`, 또는 CDN `<script src="https://js.tosspayments.com/v2/standard"></script>`.
2. `const tossPayments = TossPayments(clientKey)` (npm은 `await loadTossPayments(clientKey)`)로 초기화. clientKey는 브라우저 노출 가능한 공개 키.
3. `const widgets = tossPayments.widgets({ customerKey })` 생성. 회원은 고유 customerKey(2-50자), 비회원은 `TossPayments.ANONYMOUS`.
4. `await widgets.setAmount({ currency: "KRW", value: 금액 })` — 렌더링 메서드보다 반드시 먼저 호출. 쿠폰 등 금액 변경 시 다시 호출.
5. 주문서형: `widgets.renderPaymentMethods({ selector, variantKey })` + `widgets.renderAgreement({ selector, variantKey })` 렌더. 결제창형: `widgets.renderPaymentWindow({ variantKey: { paymentMethod: "DEFAULT", agreement: "AGREEMENT" } })` 후 `paymentWindow.on("paymentRequest", ...)` 구독.
6. 결제 버튼 클릭(또는 paymentRequest 이벤트) 시 `widgets.requestPayment({ orderId, orderName, successUrl, failUrl, customerEmail, customerName, ... })` 호출. 이때 orderId·금액을 서버 DB에 미리 저장해 둔다.
7. 인증 성공 시 `{successUrl}?orderId={ORDER_ID}&paymentKey={PAYMENT_KEY}&paymentType={PAYMENT_TYPE}&amount={AMOUNT}` 로 리다이렉트. 실패 시 `{failUrl}?code={ERROR_CODE}&message={ERROR_MESSAGE}&orderId={ORDER_ID}`.
8. 서버에서 쿼리 파라미터의 amount가 setAmount로 설정하고 서버에 저장해 둔 주문 금액과 일치하는지 반드시 검증 (문서 원문: "쿼리 파라미터의 amount 값과 setAmount()의 amount 파라미터의 값이 같은지 반드시 확인하세요").
9. 검증 통과 시 `POST https://api.tosspayments.com/v1/payments/confirm`, 헤더 `Authorization: Basic base64("{secretKey}:")` (시크릿 키 뒤 콜론 필수), 바디 `{ paymentKey, orderId, amount }`. 결제 요청 완료 후 10분 이내에 승인해야 함.
10. HTTP 200과 함께 Payment 객체(status: DONE 등) 수신 → 주문 완료 처리. 실패 시 `{ code, message }` 형식 에러 응답 처리.

### 엔드포인트 / SDK 메서드

- **POST** `https://api.tosspayments.com/v1/payments/confirm` — 결제 승인(confirm). successUrl 리다이렉트 후 서버에서 호출. 성공 시 Payment 객체 반환(HTTP 200)
  - Authorization: Basic base64(secretKey + ":") — 콜론 필수
  - paymentKey: string (최대 200자, 필수)
  - orderId: string (6-64자, 필수)
  - amount: number (필수, 클라이언트 setAmount 값과 일치해야 함)
- **GET** `/v1/payments/{paymentKey}` — paymentKey로 결제 조회. Payment 객체 반환
  - paymentKey: path param
- **GET** `/v1/payments/orders/{orderId}` — orderId로 결제 조회. Payment 객체 반환
  - orderId: path param
- **POST** `/v1/payments/{paymentKey}/cancel` — 결제 취소(전액/부분)
  - cancelReason: string (최대 200자, 필수)
  - cancelAmount: number (생략 시 전액 취소)
  - refundReceiveAccount: 가상계좌 취소 시 필수
  - 멱등키 헤더 언급됨(정확한 헤더명은 읽은 발췌에서 미확인)
- **SDK** `TossPayments(clientKey) / loadTossPayments(clientKey)` — SDK 초기화. TossPaymentsSDK 객체 반환 (widgets/payment/brandpay 메서드 보유)
  - clientKey: string (공개 가능한 위젯 클라이언트 키)
- **SDK** `tossPayments.widgets({customerKey})` — 결제위젯 인스턴스(TossPaymentsWidgets) 생성
  - customerKey: string (2-50자, 영문 대소문자/숫자/특수문자 -_=.@)
  - 비회원: TossPayments.ANONYMOUS (npm에서는 ANONYMOUS named export)
- **SDK** `widgets.setAmount({currency, value})` — 결제 금액 설정. 렌더링/결제요청 전에 반드시 선행 호출. Promise<void>
  - currency: 'KRW' 등
  - value: number
- **SDK** `widgets.renderPaymentMethods({selector, variantKey})` — 주문서형: 결제수단 위젯 렌더. Promise<WidgetPaymentMethodWidget> 반환
  - selector: string (CSS 선택자, 필수)
  - variantKey: string (선택, 기본 DEFAULT, 어드민에서 발급)
  - 반환 객체: getSelectedPaymentMethod(), on('paymentMethodSelect'), destroy()
- **SDK** `widgets.renderAgreement({selector, variantKey})` — 주문서형: 약관 동의 위젯 렌더. Promise<WidgetAgreementWidget> 반환
  - selector: string (필수)
  - variantKey: string (선택)
  - 반환 객체: on('agreementStatusChange'), destroy()
- **SDK** `widgets.renderPaymentWindow({variantKey})` — 결제창형: 결제창 위젯 렌더. paymentWindow.on('paymentRequest', ...) 이벤트로 결제 트리거
  - variantKey: {paymentMethod: 'DEFAULT', agreement: 'AGREEMENT'} 형태 (integration-window 가이드 기준)
- **SDK** `widgets.requestPayment({...})` — 결제 요청. 리다이렉트 모드 Promise<void>, 프로미스 모드 Promise<WidgetPaymentResult>{paymentKey, orderId, amount}
  - orderId: string (필수, 6-64자, 영문 대소문자/숫자/-_=)
  - orderName: string (필수, 최대 100자)
  - successUrl: string (origin 포함 필수)
  - failUrl: string (origin 포함 필수)
  - customerEmail: string (최대 100자, 선택)
  - customerName: string (최대 100자, 선택)
  - customerMobilePhone: 8-15자리 숫자 문자열 (선택)
  - taxFreeAmount: number (선택)
  - windowTarget: 'self' | 'iframe' (선택)
  - metadata: object (최대 5개 key-value, 선택)
- **SDK** `tossPayments.payment({customerKey})` — (위젯 아닌) 일반 결제창 객체. requestPayment({method, amount, ...}) / requestBillingAuth({method, successUrl, failUrl}) — successUrl에 authKey, customerKey 부착
  - method: CARD | VIRTUAL_ACCOUNT | TRANSFER | MOBILE_PHONE | CULTURE_GIFT_CERTIFICATE | FOREIGN_EASY_PAY

### 제약/규칙 (문서 명시)

- setAmount()는 renderPaymentMethods()/renderPaymentWindow() 및 requestPayment()보다 반드시 선행되어야 한다
- 결제 승인(confirm)은 결제 요청 완료 후 10분 이내에 호출해야 하며, 초과 시 NOT_FOUND_PAYMENT_SESSION 에러가 발생하고 결제 데이터가 소실된다
- confirm 호출 전 successUrl 쿼리의 amount와 원래 주문 금액(setAmount 값)의 일치 검증이 문서상 의무
- Authorization 헤더는 Basic + base64(secretKey + ":") — 시크릿 키 뒤 콜론 필수
- clientKey는 공개 가능, secretKey는 서버 전용(브라우저 노출 금지)
- orderId: 6-64자, 영문 대소문자/숫자/특수문자 -, _, = (SDK 문서 기준; reference.md 요약은 -, _만 언급)
- customerKey: 2-50자, 영문 대소문자/숫자/특수문자 -, _, =, ., @
- orderName 최대 100자, customerEmail 최대 100자, customerName 최대 100자, customerMobilePhone 8-15자리 숫자
- paymentKey 최대 200자
- metadata는 최대 5개의 key-value 쌍
- successUrl/failUrl은 origin을 포함한 완전한 URL이어야 함
- successUrl 부착 파라미터: orderId, paymentKey, paymentType, amount / failUrl 부착 파라미터: code, message, orderId
- requestPayment의 프로미스 모드(리다이렉트 없이 결과 수신)는 모바일 환경에서 사용 불가 — 리다이렉트 모드 필요
- 결제 통화: KRW, USD, JPY (PayPal은 USD만)
- cancelReason 최대 200자, cancelAmount 생략 시 전액 취소, 가상계좌 취소는 refundReceiveAccount 필수
- Payment.status enum: READY | IN_PROGRESS | WAITING_FOR_DEPOSIT | DONE | CANCELED | PARTIAL_CANCELED | ABORTED | EXPIRED
- 에러 응답 형식: { code, message } (message 최대 510자)
- variantKey는 어드민에서 위젯 커스터마이징 후 발급받아 사용 (기본값 DEFAULT)

### 주의점 / 열린 질문

- 주문서형(order-form) 연동 가이드의 .md 버전(guides/v2/payment-widget/integration.md)이 404이고 HTML은 SPA라 본문을 읽지 못함 — 주문서형의 정확한 예제 코드(renderPaymentMethods+renderAgreement를 Promise.all로 묶는지 등)는 SDK 레퍼런스로만 교차 확인한 상태. 열린 질문
- SDK v2인데 REST API 경로는 /v1/payments/confirm — SDK 버전과 API 버전이 다르므로 URL을 v2로 지어내면 안 됨
- successUrl 쿼리에 paymentType이 포함됨(integration-window 가이드 원문 기준). SDK 레퍼런스 요약에는 paymentKey/orderId/amount만 언급되어 있어 paymentType은 옵셔널로 파싱하는 것이 안전
- 10분 승인 시한 초과 시 NOT_FOUND_PAYMENT_SESSION — 결제 데이터 자체가 사라지므로 재시도 불가, 결제 재요청 필요
- 취소 API에 멱등키(idempotency key) 헤더가 언급되나 정확한 헤더명은 읽은 발췌에서 확인 못 함. 열린 질문
- confirm의 amount는 number 타입 — 쿼리 파라미터는 문자열로 오므로 숫자 변환 후 비교/전송 필요(문서에 명시적 언급은 없음, 추론)
- customerKey 형식 설명 원문('특수문자 -,_,=,.,@ 중 최소 1개를 포함하는 최소 2자 이상 최대 50자')이 특수문자 1개가 필수인지 허용 문자 집합 설명인지 다소 모호. 열린 질문
- webhook은 payment-flow 문서에서 비동기 특성 관련 언급만 확인, V2 웹훅 상세 스펙은 이번 리서치 범위에서 미확인
- 테스트 키의 실제 값 형식(test_ck_/test_sk_ 프리픽스 등)은 문서 플레이스홀더(<WidgetClientKey />)로만 표기되어 미확인
- 결제창형은 requestPayment를 직접 호출하는 게 아니라 paymentWindow.on('paymentRequest') 콜백 안에서 호출하는 구조 — 주문서형과 트리거 방식이 다름

### 라이브러리 설계 시사점

- 문서가 명시한 호출 순서(초기화 → widgets 생성 → setAmount → render → requestPayment)를 팬텀 타입/빌더 상태 머신으로 강제 가능: 예를 들어 setAmount 호출 전 타입에는 render 메서드를 노출하지 않고, render 완료 타입에서만 requestPayment를 노출
- confirm 전 금액 검증이 문서상 의무이므로, 추상 클래스의 템플릿 메서드 패턴이 적합: abstract verifyAmount(storedAmount, receivedAmount): boolean을 구현해야만 confirm()이 호출되는 구조로 검증 단계를 컴파일 타임에 강제
- successUrl/failUrl 콜백 파서를 타입으로 제공: SuccessParams { paymentKey, orderId, amount(문자열→number 변환), paymentType? } / FailParams { code, message, orderId } 의 discriminated union
- orderId(6-64자, [A-Za-z0-9-_=])와 customerKey(2-50자)를 브랜디드 타입 + 런타임 검증 팩토리로 제공해 잘못된 형식을 생성 시점에 차단
- ANONYMOUS는 문자열이 아닌 별도 리터럴/심볼 타입으로 분리해 회원/비회원 플로우를 타입으로 구분
- clientKey(브라우저용)와 secretKey(서버 전용)를 별도 브랜디드 타입으로 분리하고, confirm 관련 모듈을 server-only 엔트리포인트로 격리해 secretKey의 클라이언트 번들 유입을 구조적으로 방지
- 10분 승인 시한과 NOT_FOUND_PAYMENT_SESSION을 라이브러리 에러 타입으로 모델링하고, confirm 결과를 Result<Payment, TossPaymentsError{code, message}> 형태로 반환
- Payment.status 8종을 discriminated union으로 정의해 DONE 이외 상태 처리를 컴파일러가 강제하도록 설계
- 모바일에서 프로미스 모드 불가이므로 라이브러리 기본 API는 리다이렉트 모드(successUrl/failUrl 필수)로 설계하는 것이 안전
- amount의 단일 진실 공급원(single source of truth) 설계 필요: setAmount 값 = 서버 저장 값 = confirm 전송 값이 모두 일치해야 하므로, 주문 생성 시점에 amount를 고정하는 Order 객체를 중심으로 API를 구성
- Basic 인증 헤더 생성(base64(secretKey + ":"))은 콜론 누락이 흔한 실수이므로 라이브러리가 내부에서 생성하고 사용자에게 노출하지 않는 것이 좋음

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/payment-widget.md
- https://docs.tosspayments.com/sdk/v2/js.md
- https://docs.tosspayments.com/guides/v2/payment-widget/integration-window.md
- https://docs.tosspayments.com/guides/v2/get-started/payment-flow.md
- https://docs.tosspayments.com/reference.md

## 결제창(payment window) 방식 + 코어 결제 API (confirm/조회, Payment 객체, 인증/버전)

토스페이먼츠 V2 결제창 방식은 브라우저 SDK(TossPayments(clientKey) → tossPayments.payment({customerKey}) → payment.requestPayment(...))로 인증 단계를 수행하고, successUrl로 돌려받은 paymentKey/orderId/amount를 서버에서 검증한 뒤 POST /v1/payments/confirm으로 승인하는 2단계(인증→승인) 구조다. 서버 API 인증은 시크릿 키 뒤에 콜론을 붙여 base64 인코딩한 Basic 인증이며, 모든 POST에 Idempotency-Key 헤더(최대 300자, 15일 유효)를 붙일 수 있다. Payment 객체의 status는 READY, IN_PROGRESS, WAITING_FOR_DEPOSIT, DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED 8개 상태로 문서화되어 있다. 승인 전 리다이렉트 쿼리의 amount와 요청 시 amount 일치 검증이 문서상 필수 규칙이므로, 라이브러리에서 이 검증 단계를 타입으로 강제하는 설계 근거가 명확하다. 다만 API 버전 지정용 요청 헤더는 읽은 문서들에서 확인되지 않았고(개발자센터에서 상점 단위로 관리), 승인 유효시간이 10분(가이드)과 30분(EXPIRED 정의)으로 다르게 기술된 점은 열린 질문이다.

### 연동 플로우

1. 브라우저에서 SDK 로드: <script src="https://js.tosspayments.com/v2/standard"> 또는 npm @tosspayments/tosspayments-sdk의 loadTossPayments 사용 후 TossPayments(clientKey)로 초기화한다.
2. tossPayments.payment({ customerKey })로 결제창 인스턴스를 만든다. 비회원 결제는 customerKey에 TossPayments.ANONYMOUS를 넣는다.
3. payment.requestPayment({ method, amount: { currency, value }, orderId, orderName, successUrl, failUrl, ... })를 호출해 결제창을 연다. 이때 결제는 READY 상태로 생성되고, 구매자가 결제수단 인증을 마치면 IN_PROGRESS가 된다 (모바일에서는 iframe/frame 안에서 결제창 호출 금지).
4. 인증 성공 시 successUrl?orderId={ORDER_ID}&paymentKey={PAYMENT_KEY}&amount={AMOUNT}로 리다이렉트되고, 실패 시 failUrl?code={ERROR_CODE}&message={ERROR_MESSAGE}&orderId={ORDER_ID}로 리다이렉트된다 (주요 에러코드: PAY_PROCESS_CANCELED, PAY_PROCESS_ABORTED, REJECT_CARD_COMPANY).
5. 서버에서 리다이렉트 쿼리의 amount가 requestPayment 때 보낸 amount와 같은지 반드시 검증한다 (금액 변조 방지, 문서상 필수).
6. 서버에서 POST https://api.tosspayments.com/v1/payments/confirm을 호출한다. 헤더는 Authorization: Basic base64("{SECRET_KEY}:") (콜론 필수), Content-Type: application/json, 선택적으로 Idempotency-Key. 바디는 { paymentKey, orderId, amount }. 가이드 기준 결제 요청 완료 후 10분 이내에 승인해야 한다.
7. 200 OK로 Payment 객체를 받으면 status가 DONE이다 (가상계좌는 발급 후 WAITING_FOR_DEPOSIT → 입금 시 DONE). 승인 실패 시 ABORTED, 유효시간 초과 시 EXPIRED.
8. 이후 결제 상태 확인은 GET /v1/payments/{paymentKey} 또는 GET /v1/payments/orders/{orderId}로 조회한다. 취소되면 status가 CANCELED 또는 PARTIAL_CANCELED로 바뀐다.

### 엔드포인트 / SDK 메서드

- **POST** `/v1/payments/confirm` — 인증 완료된 결제를 최종 승인. 성공 시 Payment 객체(status: DONE) 반환
  - paymentKey (string, 최대 200자, 필수)
  - orderId (string, 6-64자, 영숫자와 -,_ 허용, 필수)
  - amount (number, 필수 — requestPayment 시 값 및 리다이렉트 쿼리 값과 일치해야 함)
  - Authorization: Basic base64(secretKey+':') 헤더
  - Idempotency-Key 헤더 (선택, 최대 300자)
  - base URL: https://api.tosspayments.com
- **GET** `/v1/payments/{paymentKey}` — paymentKey로 결제 단건 조회, Payment 객체 반환
  - paymentKey (path, string, 최대 200자)
- **GET** `/v1/payments/orders/{orderId}` — 주문번호(orderId)로 결제 조회, Payment 객체 반환
  - orderId (path, string, 6-64자)
- **SDK** `TossPayments(clientKey) / loadTossPayments(clientKey)` — SDK 초기화. script: https://js.tosspayments.com/v2/standard 또는 npm @tosspayments/tosspayments-sdk
  - clientKey (string) — 결제창용 API 개별 키는 test_ck/live_ck 접두사
- **SDK** `tossPayments.payment({ customerKey })` — 결제창(위젯 아님) 인스턴스 생성. DOM에 마운트되지 않음
  - customerKey (string, 2-50자, [a-zA-Z0-9\-_=.@] 문자 포함, 유추 불가능한 값이어야 함)
  - 비회원: TossPayments.ANONYMOUS 또는 import { ANONYMOUS }
- **SDK** `payment.requestPayment({...})` — 결제창을 열어 인증 단계 수행. Promise<RequestPaymentResult>(paymentKey, orderId, amount) 반환
  - method (예: 'CARD', 'VIRTUAL_ACCOUNT', 'TRANSFER', 'MOBILE_PHONE', 필수)
  - amount: { currency: 'KRW', value: number } (객체 형태, 필수)
  - orderId (string, 6-64자, 필수)
  - orderName (string, 최대 100자, 필수)
  - successUrl / failUrl (리다이렉트 방식에서 사용)
  - customerEmail, customerName, customerMobilePhone (선택, email/name 최대 100자)
  - card: { flowMode: 'DEFAULT', useEscrow, useCardPoint, useAppCardOnly } (선택)
  - windowTarget, metadata (선택)
- **SDK** `payment.requestBillingAuth({...})` — 자동결제(빌링) 등록용 인증창 호출. 성공 리다이렉트에 authKey, customerKey 쿼리 포함
  - method ('CARD' 또는 'TRANSFER')
  - successUrl (필수)
  - failUrl (필수)
  - customerName, customerEmail (선택)

### 제약/규칙 (문서 명시)

- Basic 인증: base64('{SECRET_KEY}:') — 시크릿 키 뒤 콜론(:)을 반드시 붙여 인코딩. 콜론 누락 금지, 인코딩 시 UTF-8 BOM 금지(BOM이 있으면 출력이 77u/로 시작)
- orderId: 6-64자, 영숫자와 -, _ 조합, 상점에서 고유해야 함
- orderName: 최대 100자
- paymentKey: 최대 200자
- customerKey: 2-50자, [a-zA-Z0-9\-_=.@] 문자 포함, 유추 가능한 값 금지
- SDK의 amount는 { currency, value } 객체, confirm API의 amount는 number — 두 값과 리다이렉트 쿼리 amount가 모두 일치해야 함(승인 전 검증 필수)
- confirm은 결제 요청(인증) 완료 후 10분 이내에 호출해야 함(가이드 문서 기준, 초과 시 결제 세션 데이터 소실)
- status=EXPIRED 정의: 30분 유효시간 내 승인 API 미호출 시 만료(레퍼런스 문서 기준)
- Idempotency-Key 헤더: 최대 300자, POST 메서드에만 적용(그 외 메서드는 자체적으로 멱등), 처음 사용일로부터 15일간 유효
- 클라이언트 키와 시크릿 키는 반드시 쌍으로 사용 — 짝이 안 맞거나 test/live 혼용 시 INVALID_API_KEY (통합 가이드에는 UNAUTHORIZED_KEY도 언급)
- 키 접두사: API 개별 키 test_ck/test_sk/live_ck/live_sk, 결제위젯 키 test_gck/test_gsk/live_gck/live_gsk. 위젯 키는 API 버전이 2022-11-16으로 고정, API 개별 키는 개발자센터에서 버전 선택 가능
- 모바일 환경에서 iframe/frame 위에서 결제창 호출 금지
- API 버전은 CalVer(YYYY-MM-DD, 2022-06-08부터), 비호환 변경(필수 파라미터 추가, 필드 삭제, 타입 변경, 엔드포인트 제거)에만 새 버전 발행. 테스트 상점은 최신 버전 자동 할당, 라이브 상점은 계약 시점 버전이며 서로 다를 수 있음
- Payment.status 전체 값: READY(생성 직후, 인증 전), IN_PROGRESS(결제수단 인증 완료, 승인 대기), WAITING_FOR_DEPOSIT(가상계좌 발급 후 입금 대기), DONE(승인 완료), CANCELED(승인된 결제 취소 — 입금 전 가상계좌 취소 포함), PARTIAL_CANCELED(부분 취소), ABORTED(승인 실패), EXPIRED(유효시간 만료)
- Payment 객체 주요 필드: version(날짜 문자열), paymentKey, type(NORMAL|BILLING|BRANDPAY), orderId, orderName, mId(최대 14자), currency, method(한글 값: 카드/가상계좌/간편결제/휴대폰/계좌이체/문화상품권/도서문화상품권/게임문화상품권, nullable), totalAmount, balanceAmount, status, requestedAt/approvedAt(ISO 8601, approvedAt nullable), useEscrow, lastTransactionKey, suppliedAmount, vat, cultureExpense, taxFreeAmount, taxExemptionAmount, cancels(배열, nullable), isPartialCancelable, card/virtualAccount/mobilePhone/giftCertificate/transfer/easyPay/cashReceipt/cashReceipts/discount(수단별 객체, nullable), secret(웹훅 검증용, 최대 50자), metadata(최대 5쌍, 키 40자/값 2000자), receipt.url, checkout.url, country, failure{code,message}
- card 객체 세부: amount, issuerCode, acquirerCode, number, installmentPlanMonths, approveNo, useCardPoint, cardType(신용|체크|기프트|미확인), ownerType(개인|법인|미확인), acquireStatus, isInterestFree, interestPayer

### 주의점 / 열린 질문

- 승인 유효시간 불일치: 통합 가이드는 '결제 요청 완료 후 10분 이내 승인', Payment.status의 EXPIRED 정의는 '30분 유효시간'이라고 기술 — 두 시간의 정확한 관계(인증 후 10분 vs READY 생성 후 30분인지)는 읽은 문서에서 명확히 확인 못함. 열린 질문
- API 버전을 요청별로 지정하는 헤더 이름은 versioning.md와 authorization.md 어디에도 명시돼 있지 않음 — 버전은 개발자센터에서 상점(키) 단위로 관리되는 것으로 보임. 요청 헤더로 오버라이드 가능한지는 열린 질문
- Payment.method 값이 영문 enum이 아니라 한글 문자열('카드', '가상계좌', '간편결제' 등) — TS 타입 정의 시 한글 리터럴을 그대로 써야 하며, SDK requestPayment의 method('CARD' 등 영문)와 표기 체계가 다름
- SDK requestPayment의 amount는 {currency, value} 객체이지만 confirm API 바디의 amount는 숫자 — 라이브러리에서 형태 불일치를 흡수해야 함
- js.md 요약에서 successUrl/failUrl이 '(Redirect mode) optional'로 표기됨 — 리다이렉트 방식이 아닌 경우(프로미스 반환 RequestPaymentResult)의 정확한 동작 조건은 추가 확인 필요. 열린 질문
- CANCELED 상태는 '입금 전 가상계좌 취소'도 포함 — CANCELED가 반드시 DONE을 거쳤다는 의미가 아님(WAITING_FOR_DEPOSIT → CANCELED 경로 존재)
- 명시적인 상태 전이 다이어그램은 읽은 문서에 없었음 — 위 전이는 각 상태 정의문에서 유도한 것. READY → ABORTED 등 모든 전이 조합의 공식 확인은 열린 질문
- 결제창은 위젯과 달리 상점 페이지 DOM에 마운트되지 않음(오버레이/새 창) — 위젯용 renderPaymentMethods 류 API와 혼동 금지
- 위젯 키(gck/gsk)와 API 개별 키(ck/sk)는 용도가 다르고 위젯 키는 API 버전 고정(2022-11-16) — 결제창 방식에 위젯 키를 쓰는 조합의 유효성은 문서에서 명확히 확인 못함. 열린 질문
- GET 조회 API는 '승인된 결제'를 조회한다고 기술 — READY/IN_PROGRESS 상태 결제도 조회 가능한지는 명시 없음. 열린 질문
- Idempotency-Key는 POST에만 의미 있음(나머지 메서드는 자체 멱등), 15일 후 같은 키 재사용 시 새 요청으로 처리될 것으로 보이나 명시적 서술은 확인 못함

### 라이브러리 설계 시사점

- 금액 검증 강제에 최적: 리다이렉트 쿼리(paymentKey, orderId, amount)를 UnverifiedCallback 같은 타입으로 받고, 원 주문 amount와의 일치 검증을 통과해야만 얻는 VerifiedPayment(브랜드 타입)만 confirm()이 받도록 하면 문서의 '반드시 확인' 규칙을 컴파일 타임에 강제할 수 있음
- 클라이언트/서버 표면 분리: clientKey 기반 SDK 래퍼(브라우저)와 secretKey 기반 API 클라이언트(서버)를 별도 엔트리포인트로 분리하고, 키 접두사(test_ck/live_sk 등)를 템플릿 리터럴 타입 + 런타임 검증으로 구분해 시크릿 키의 브라우저 유입과 위젯 키/개별 키 혼용을 방지
- Basic 인증 인코딩(base64(secretKey+':'), 콜론 필수, BOM 금지)은 사용자가 직접 만들지 못하게 라이브러리 내부에서만 생성 — 콜론 누락이 문서가 경고하는 대표적 실수
- Payment.status 8개 값(READY|IN_PROGRESS|WAITING_FOR_DEPOSIT|DONE|CANCELED|PARTIAL_CANCELED|ABORTED|EXPIRED)을 리터럴 유니온으로 정의하고, status·method에 따른 판별 유니온으로 nullable 필드(card, virtualAccount, approvedAt 등)를 내로잉 — 예: status가 DONE이면 approvedAt non-null, method가 가상계좌면 virtualAccount 존재
- orderId(6-64자, [a-zA-Z0-9-_]), customerKey(2-50자), orderName(≤100자) 등은 생성 시점 검증하는 브랜드 타입/스마트 생성자로 제공
- amount 형태 차이({currency,value} vs number)를 라이브러리가 흡수하되, requestPayment에 쓴 amount 값을 세션/저장소에 보관해 confirm 전 검증에 재사용하는 흐름을 인터페이스로 유도(추상 메서드: saveOrder / loadOrderAmount / verify / confirm)
- confirm 재시도 안전성을 위해 Idempotency-Key(≤300자, POST 전용, 15일 유효) 옵션을 confirm 메서드의 일급 파라미터로 노출
- 10분(가이드)/30분(EXPIRED) 승인 시한이 있으므로 requestedAt 기반 만료 경고나 타임아웃 처리를 인터페이스에 포함할 가치가 있음 — 단 정확한 시한은 문서 간 불일치가 있어 보수적으로 10분 기준 권장
- Payment.method의 한글 리터럴('카드' 등)을 그대로 타입에 반영하고 영문 별칭 매핑은 라이브러리 계층에서 제공 — 영문 enum을 지어내면 런타임 불일치 발생
- 비회원 결제(TossPayments.ANONYMOUS)와 회원 결제(customerKey)를 타입 수준에서 구분하면 requestBillingAuth(빌링 등록, customerKey 필수 의미)에 ANONYMOUS가 흘러드는 오류를 막을 수 있음(단, 이 제약 자체는 문서에서 직접 확인 못했으므로 검증 필요)

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/payment-window/integration.md
- https://docs.tosspayments.com/sdk/v2/js.md
- https://docs.tosspayments.com/reference.md
- https://docs.tosspayments.com/reference/using-api/authorization.md
- https://docs.tosspayments.com/reference/using-api/api-keys.md
- https://docs.tosspayments.com/reference/versioning.md
- https://docs.tosspayments.com/guides/v2/payment-window.md

## 정기결제(빌링) — 빌링키 발급(SDK 카드 등록창 / API 직접 전달), customerKey 규칙, 자동결제 승인, 빌링키 삭제

토스페이먼츠 V2 빌링은 "빌링키 발급 → 저장 → 발급 시점과 동일한 customerKey로 자동결제 승인" 구조이며, 발급 경로는 두 가지다: (1) 브라우저 SDK payment.requestBillingAuth()로 카드/계좌 등록창을 띄운 뒤 successUrl로 받은 authKey를 POST /v1/billing/authorizations/issue에 전달, (2) 카드 정보를 서버에서 직접 POST /v1/billing/authorizations/card로 전달(카드만 지원, 리스크 검토·추가 계약 필요). 승인은 POST /v1/billing/{billingKey}이며 body의 customerKey가 발급 시 매핑된 값과 일치해야 하고(불일치 시 NOT_MATCHES_CUSTOMER_KEY), 빌링키 삭제는 DELETE /v1/billing/{billingKey}가 존재한다. 결제 주기 스케줄링은 토스가 제공하지 않으므로 가맹점이 직접 구현해야 하며, 빌링키 갱신 API는 없고 카드 만료/재발급 시 재발급받아야 한다.

### 연동 플로우

1. 서버에서 구매자별 customerKey를 생성·영속화한다 (UUID처럼 무작위·비유추 값, 2~300자).
2-A. [SDK 등록창 경로] 클라이언트에서 TossPayments(clientKey).payment({customerKey}) 인스턴스를 만들고 payment.requestBillingAuth({method, successUrl, failUrl, ...})를 호출해 등록창을 띄운다.
3-A. 본인인증 성공 시 successUrl로 ?customerKey=...&authKey=... 리다이렉트를 받는다 (authKey는 일회용, 최대 300자). 실패 시 failUrl로 code/message가 온다.
4-A. 서버에서 Basic 인증(base64("{SECRET_KEY}:"))으로 POST /v1/billing/authorizations/issue에 {authKey, customerKey}를 보내 billingKey를 발급받는다.
2-B. [API 직접 경로 — 대안] 추가 계약이 된 가맹점은 서버에서 POST /v1/billing/authorizations/card에 카드번호·유효기간·customerIdentityNumber·cardPassword·customerKey를 직접 보내 billingKey를 발급받는다 (등록창 없음, 카드만 지원).
5. 발급 응답의 billingKey를 customerKey와 매핑하여 안전하게 저장한다 (빌링키 조회 API가 없으므로 저장이 유일한 보관 수단).
6. 결제 주기가 되면 (가맹점 자체 스케줄러/cron으로) POST /v1/billing/{billingKey}에 {amount, customerKey, orderId, orderName, ...}를 보내 자동결제를 승인한다. customerKey는 발급 시 값과 반드시 일치해야 한다.
7. 구독 해지·카드 변경 시 DELETE /v1/billing/{billingKey}로 기존 빌링키를 삭제하고, 필요하면 새 빌링키를 재발급한다 (갱신 API 없음).

### 엔드포인트 / SDK 메서드

- **SDK** `TossPayments(clientKey).payment({customerKey})` — 결제 인스턴스 생성. billing 플로우는 고유 customerKey 필수 (SDK 문서상 ANONYMOUS로 빌링 사용 언급 없음)
  - clientKey: string (클라이언트 키)
  - customerKey: string (구매자 고유 ID, 2~300자)
- **SDK** `payment.requestBillingAuth(options)` — 카드/계좌 등록창을 띄워 본인인증 후 successUrl로 authKey+customerKey 리다이렉트
  - method: enum, 필수 (카드 또는 계좌이체; 카드 값은 "CARD", 계좌이체 enum 값은 미확인 — gotchas 참조)
  - successUrl: string, 필수 (성공 시 ?customerKey=...&authKey=... 쿼리로 리다이렉트)
  - failUrl: string, 필수 (실패 시 ?code=...&message=... 리다이렉트; 예: PAY_PROCESS_CANCELED, PAY_PROCESS_ABORTED, REJECT_CARD_COMPANY)
  - customerName: string, 선택, 최대 100자
  - customerEmail: string, 선택, 최대 100자
  - windowTarget: enum, 선택 (self | iframe)
  - selectableCardTypes: array, 선택 (PERSONAL | CORPORATE)
- **POST** `/v1/billing/authorizations/issue` — authKey로 빌링키 발급 (SDK 등록창 경로의 2단계). 인증: Basic base64("{SECRET_KEY}:")
  - authKey: string, 필수, 최대 300자 (successUrl 쿼리로 받은 일회용 키)
  - customerKey: string, 필수, 2~300자 (등록창을 띄운 인스턴스의 customerKey와 동일해야 함)
  - 응답: mId, customerKey, authenticatedAt, method("카드"), billingKey, card{issuerCode, acquirerCode, number(마스킹), cardType, ownerType}
- **POST** `/v1/billing/authorizations/card` — 카드 정보를 직접 전달해 등록창 없이 빌링키 발급 (API 직접 연동 경로, 카드만 지원, 추가 계약 필요)
  - customerKey: string, 필수, 2~300자
  - cardNumber: string, 필수, 최대 20자 (테스트 환경은 BIN 6자리로 충분, 라이브는 전체 번호)
  - cardExpirationYear: string, 필수
  - cardExpirationMonth: string, 필수
  - customerIdentityNumber: string, 필수 (생년월일 YYMMDD 6자리 또는 사업자등록번호 10자리)
  - cardPassword: string, 필수 (카드 비밀번호 앞 2자리)
  - customerName: string, 선택, 최대 100자
  - customerEmail: string, 선택, 최대 100자
- **POST** `/v1/billing/{billingKey}` — 발급된 빌링키로 자동결제 승인. 응답은 card 필드가 채워진 Payment 객체
  - billingKey: string, path, 필수, 최대 200자
  - amount: number, 필수 (결제할 금액)
  - customerKey: string, 필수 (빌링키 발급 시 매핑된 값과 일치해야 함, 불일치 시 NOT_MATCHES_CUSTOMER_KEY)
  - orderId: string, 필수, 6~64자 (영문 대소문자, 숫자, -, _ 만)
  - orderName: string, 필수, 최대 100자
  - customerEmail: string, 선택, 최대 100자
  - customerName: string, 선택, 최대 100자
  - customerIp: string, 선택 (FDS 부정거래 탐지용)
  - taxFreeAmount: number, 선택, 기본 0
  - taxExemptionAmount: number, 선택 (과세 제외 금액, 컵 보증금 등)
- **DELETE** `/v1/billing/{billingKey}` — 발급된 빌링키 삭제. 성공 시 빈 body로 200 응답
  - billingKey: string, path, 필수, 최대 200자

### 제약/규칙 (문서 명시)

- 자동결제는 리스크 검토 및 추가 계약 후 사용 가능 ("자동결제는 리스크 검토 및 추가 계약 후 사용할 수 있습니다"); 계약 없이 호출 시 NOT_SUPPORTED_METHOD 에러
- customerKey: "영문 대소문자, 숫자, 특수문자 -, _, =, ., @를 최소 1개 이상 포함한 최소 2자 이상 최대 300자 이하의 문자열" + "자동 증가하는 숫자 또는 이메일・전화번호・사용자 아이디와 같이 유추가 가능한 값은 안전하지 않습니다. UUID와 같이 충분히 무작위적인 고유 값으로 생성해주세요"
- 자동결제 승인 시 body의 customerKey는 빌링키 발급 시 매핑된 customerKey와 일치해야 함 (불일치 시 NOT_MATCHES_CUSTOMER_KEY)
- authKey는 일회용이며 최대 300자; successUrl 리다이렉트 쿼리로만 전달됨
- orderId: 6~64자, 영문 대소문자·숫자·-·_ 만 허용
- billingKey 최대 200자; 발급된 빌링키를 조회하는 API는 제공되지 않음 (가맹점이 저장 책임)
- 빌링키 갱신 절차 없음: 카드 재발급·유효기간 만료 시 새 빌링키를 다시 발급받아야 함 ("빌링키를 갱신하는 별도 과정은 없습니다")
- 결제 주기 스케줄링은 토스페이먼츠가 제공하지 않음 — 가맹점이 직접 구현 ("결제 주기에 따라 자동결제를 승인하는 것은 직접 스케줄링해야 됩니다")
- API 직접 발급(/v1/billing/authorizations/card)은 카드만 지원, 계좌이체는 SDK 등록창(퀵계좌이체) 경로만 가능
- 서버 API 인증은 시크릿 키 Basic 인증: Authorization: Basic base64("{SECRET_KEY}:") — 콜론 뒤 비밀번호 없음
- 테스트 환경: 등록창 인증 코드 000000 사용 가능, /authorizations/card는 BIN 6자리만으로 테스트 가능

### 주의점 / 열린 질문

- requestBillingAuth의 method enum: 카드는 "CARD"로 확인됐으나 계좌이체(퀵계좌이체)의 정확한 enum 값은 읽은 문서에서 verbatim 확인 못 함 (열린 질문 — 구현 전 SDK 레퍼런스에서 확인 필요)
- customerKey 규칙 문구가 중의적: "특수문자 -,_,=,.,@를 최소 1개 이상 포함"이 '특수문자 1개 이상 필수'인지 '허용 문자 집합'인지 문서 문구만으로 단정 불가 (열린 질문 — 라이브러리 validator는 보수적으로 두 해석 모두 통과하는 값 권장)
- 빌링키 발급은 결제가 아님: issue/card 응답은 Billing 객체이고, 실제 과금은 별도의 승인 호출에서 발생 — 발급 직후 첫 결제도 반드시 POST /v1/billing/{billingKey}를 호출해야 함
- successUrl로 돌아온 customerKey를 신뢰하지 말 것: 쿼리스트링은 위변조 가능하므로 서버 세션에 저장된 customerKey와 대조 후 issue를 호출해야 함 (문서도 "검증 후 발급 API 호출"을 요구)
- 빌링키 삭제 응답이 문서상 빈약함: DELETE /v1/billing/{billingKey}는 빈 body 200으로 확인됐으나, 삭제된 키 재사용 시 에러 코드는 읽은 범위에서 미확인 (열린 질문)
- authKey 만료 시간(유효 기간)이 문서에 명시돼 있는지 읽은 범위에서 확인 못 함 (열린 질문)
- 자동결제 승인 파라미터에 currency·할부(cardInstallmentPlan) 파라미터가 문서에 없음 — 원화 단일 통화 전제로 보이나 verbatim 확인은 못 함 (열린 질문)
- ANONYMOUS customerKey(TossPayments.ANONYMOUS)는 일반 결제용으로 존재하지만 빌링 플로우에서의 사용은 SDK 문서에 언급 없음 — 빌링은 고유 customerKey 전제로 설계할 것
- 보안 모델이 billingKey+customerKey 쌍에 의존: "빌링키가 노출되어도 빌링키와 매핑된 customerKey를 모른다면 결제가 불가능합니다" — 두 값을 같은 저장소·같은 로그에 함께 노출하면 이 방어선이 무너짐
- /v1/billing/authorizations/card는 카드 비밀번호 앞 2자리·생년월일 등 민감정보를 직접 다루므로 별도 계약 외에 보안 요건(PCI-DSS 등)이 있을 가능성이 높으나 읽은 페이지에는 명시 없음 (열린 질문)

### 라이브러리 설계 시사점

- 단계 강제에 적합한 상태 전이: UnverifiedCustomer → (requestBillingAuth 리다이렉트) → AuthKeyReceived → (issue) → BillingKeyIssued → (approve) → Paid. 각 단계를 브랜디드 타입(예: AuthKey, IssuedBillingKey)으로 표현하면 authKey 없이 issue를 호출하거나 발급 전 승인 호출하는 코드를 컴파일 타임에 차단 가능
- customerKey를 string이 아닌 브랜디드 타입(CustomerKey)으로 만들고, 생성자를 factory(2~300자·허용문자·UUID 권장 검증)로만 열어두면 문서의 보안 요구를 타입으로 강제할 수 있음
- 승인 요청의 customerKey 일치 요구(NOT_MATCHES_CUSTOMER_KEY)를 타입으로 표현: 승인 함수를 독립 billingKey가 아니라 {billingKey, customerKey}가 봉인된 BillingProfile 객체의 메서드로만 노출하면 잘못된 쌍 조합을 구조적으로 방지
- 두 발급 경로(SDK authKey 경로 / API 카드 직접 경로)는 같은 결과(Billing 객체)로 수렴하므로, 추상클래스 BillingKeyIssuer에 issueWithAuthKey / issueWithCard 두 구현을 두는 전략 패턴이 자연스러움. 단 카드 직접 경로는 추가 계약 필요이므로 기본 비활성(옵트인 + 명시적 capability 플래그) 권장
- successUrl 콜백 파싱을 라이브러리가 담당하되, 반환 타입을 즉시 사용 가능한 값이 아니라 '서버 검증을 통과해야 열리는' PendingAuth로 만들어 세션의 customerKey 대조 단계를 건너뛸 수 없게 설계
- 빌링키 조회 API가 없으므로 라이브러리는 저장(persistence) 훅 인터페이스(BillingKeyStore: save/find/delete)를 필수 주입으로 요구하는 편이 안전 — 발급 후 저장을 잊는 실수를 인터페이스로 강제
- 스케줄링은 토스 미제공이므로 라이브러리 범위에서 제외하되, approve를 멱등하게 감싸는 인터페이스(orderId 생성 규칙 6~64자 검증 포함)를 제공하면 이중 과금 방지에 기여
- 갱신 API 부재를 반영해 BillingProfile에 revoke(): Promise<void>(DELETE)와 reissue 플로우 재시작만 제공하고 refresh 같은 오해 소지 메서드는 만들지 말 것
- 시크릿 키 Basic 인증 문자열 생성(base64(secretKey + ":"))은 라이브러리 내부에 캡슐화하고, 클라이언트 키/시크릿 키를 타입으로 분리(ClientKey vs SecretKey)해 브라우저 번들에 시크릿 키가 들어가는 실수를 타입 레벨에서 경고
- 에러 모델: PAY_PROCESS_CANCELED/PAY_PROCESS_ABORTED/REJECT_CARD_COMPANY(등록창 실패), NOT_MATCHES_CUSTOMER_KEY(승인), NOT_SUPPORTED_METHOD(계약 없음)를 판별 가능한 discriminated union으로 노출

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/billing.md
- https://docs.tosspayments.com/guides/v2/billing/integration.md
- https://docs.tosspayments.com/guides/v2/billing/integration-api.md
- https://docs.tosspayments.com/reference.md
- https://docs.tosspayments.com/sdk/v2/js.md

## 결제 취소/환불 (Toss Payments V2)

토스페이먼츠 V2에서 결제 취소는 서버 사이드 REST API인 POST /v1/payments/{paymentKey}/cancel 하나로 전액/부분 취소를 모두 처리한다. cancelAmount를 생략하면 전액 취소, 값을 주면 부분 취소이며, 부분 취소는 횟수 제한이 명시되어 있지 않고 취소 가능 잔액은 Payment 객체의 balanceAmount("취소할 수 있는 금액(잔고)")로 추적된다. 가상계좌 결제는 입금 완료 후 취소 시 refundReceiveAccount(bank, accountNumber, holderName)가 필수이고 입금 전에는 일반 결제와 동일하게 취소한다. 모든 POST API는 Idempotency-Key 헤더(최대 300자, 최초 요청일로부터 15일 유효)를 지원해 중복 취소를 방지하며, 취소 결과는 응답 Payment 객체의 cancels 배열(transactionKey로 각 취소 건 구분)에 누적된다.

### 연동 플로우

1. 결제 승인 응답 또는 조회로 확보한 paymentKey와 현재 balanceAmount(취소 가능 잔액)를 준비한다.
2. 멱등키를 UUID처럼 충분히 무작위한 고유 값으로 생성해 Idempotency-Key 헤더에 넣는다 (모든 POST API 지원, 최대 300자).
3. 시크릿 키를 base64 인코딩해 Authorization: Basic 헤더를 구성한다 (SECRET_KEY 뒤에 콜론을 붙여 인코딩).
4. 전액 취소면 cancelReason만, 부분 취소면 cancelReason + cancelAmount를 body에 넣어 POST /v1/payments/{paymentKey}/cancel을 호출한다. 안전성을 높이려면 refundableAmount를 함께 보내 잔액 불일치 시 거절되게 한다.
5. 가상계좌 결제이고 구매자가 이미 입금을 완료한 경우에만 refundReceiveAccount(bank, accountNumber, holderName)를 추가한다. 입금 전이면 일반 결제와 똑같이 취소한다.
6. 응답 Payment 객체에서 status(CANCELED=전액, PARTIAL_CANCELED=부분)와 cancels 배열을 확인한다. 각 취소 건은 transactionKey로 구분되며 cancelStatus가 DONE이면 성공.
7. 부분 취소를 반복하면 cancels 배열에 항목이 누적되고 balanceAmount가 줄어든다. 재시도 시 같은 Idempotency-Key를 쓰면 첫 응답이 그대로 재전송되어 중복 취소가 발생하지 않는다.

### 엔드포인트 / SDK 메서드

- **POST** `/v1/payments/{paymentKey}/cancel` — 승인된 결제의 전액 또는 부분 취소(환불). 응답으로 갱신된 Payment 객체(cancels 배열 포함)를 반환
  - paymentKey (path, string, 필수) — 결제 승인 응답에서 받은 키
  - cancelReason (body, string, 필수) — 취소 이유, 최대 200자
  - cancelAmount (body, number, 선택) — 취소할 금액. 값이 없으면 전액 취소
  - currency (body, string, 조건부) — 취소 통화. 승인된 통화와 동일한 값이어야 함
  - refundReceiveAccount (body, object, 조건부) — 가상계좌 결제 취소 시에만 필수. 다른 결제수단에는 사용하지 않음
  - refundReceiveAccount.bank (string) — 환불받을 계좌의 은행 코드 (필드명은 bankCode가 아니라 bank)
  - refundReceiveAccount.accountNumber (string) — 계좌번호, 최대 20자, 숫자만(하이픈 불가)
  - refundReceiveAccount.holderName (string) — 예금주명, 최대 60자
  - taxFreeAmount (body, number, 선택) — 취소할 금액 중 면세 금액, 기본값 0
  - taxExemptionAmount (body, number, 선택) — 과세 제외 금액(컵 보증금 등)
  - refundableAmount (body, number, 선택) — '현재 환불 가능한 금액입니다. 결제 취소를 안전하게 처리합니다' — 서버가 아는 잔액과 일치하는지 검증하는 안전장치 성격의 파라미터
  - cancelRequestId (body, string, 조건부) — 상점이 발급하는 취소 요청 고유값, 6–64자 `[A-Za-z0-9\-_=]`. **중국 및 동남아(비동기) 결제 취소에만 필수** — 출처: 공식 V2 '해외 간편결제 연동하기'(MCP 문서 ID 53). 응답의 cancels[].cancelRequestId와 별개로 **요청 파라미터**로도 존재한다(2026-08-09 보강 — 기존에는 응답 필드로만 기록돼 있었음)
  - Idempotency-Key (header, string, 선택) — 최대 300자, 중복 취소 방지
  - Authorization (header, 필수) — Basic {base64(SECRET_KEY:)}
  - Content-Type: application/json

### 제약/규칙 (문서 명시)

- cancelReason은 필수이며 최대 200자
- cancelAmount 생략 시 전액 취소 — 부분 취소는 명시적으로 금액을 넣어야 함
- currency는 승인된 통화와 동일한 값을 사용해야 함 (KRW, USD, JPY)
- taxFreeAmount 미입력 시 기본값 0
- refundReceiveAccount는 가상계좌 결제 취소에만 필수 — 다른 결제수단 취소에는 사용하지 않음
- refundReceiveAccount.accountNumber는 최대 20자, 숫자만 가능(- 없이), holderName은 최대 60자
- 가상계좌: 입금 완료 전에는 부분 취소 불가(발급된 계좌 금액 변경 불가) — 입금 전 취소는 전액 취소로 일반 결제와 동일하게 처리
- 가상계좌 환불은 취소일+2일에 은행에서 구매자 계좌로 입금 처리
- 카드 결제의 부분 취소는 요청 후 영업일 기준 3~4일 소요
- 과세 제외 금액(taxExemptionAmount)이 있는 카드 결제는 부분 취소 불가
- 취소 가능 잔액은 Payment.balanceAmount('취소할 수 있는 금액(잔고)')로 표현되며 취소마다 감소
- 부분 취소 횟수의 상한은 문서에 명시되어 있지 않음 ('부분 취소를 여러 번 하면'이라고만 기술)
- Idempotency-Key: 모든 POST API 지원, 최대 300자, 최초 사용일로부터 15일 유효, GET에서는 무시됨
- 같은 멱등키로 재요청 시 실제 처리 없이 첫 요청과 같은 응답 반환; 이전 요청 처리 중이면 409 IDEMPOTENT_REQUEST_PROCESSING, 300자 초과 시 400 INVALID_IDEMPOTENCY_KEY
- 취소 성공 시 Payment.status는 전액이면 CANCELED, 부분이면 PARTIAL_CANCELED
- cancels[] 각 항목: transactionKey(취소 건 구분 키), cancelAmount, cancelReason(최대 200자), taxFreeAmount, taxExemptionAmount, refundableAmount, canceledAt(ISO 8601), transferDiscountAmount, easyPayDiscountAmount, receiptKey(nullable), cancelStatus(DONE이면 성공), cancelRequestId(nullable, 비동기 결제만)

### 주의점 / 열린 질문

- refundReceiveAccount의 은행 필드명은 bankCode가 아니라 bank다 — 가이드 요약과 레퍼런스가 표기를 달리해 혼동 여지가 있으니 구현 전 레퍼런스 원문 재확인 권장
- 요청 파라미터 refundableAmount(잔액 검증용 안전장치)와 응답 cancels[].refundableAmount는 이름이 같지만 역할이 다름
- 열린 질문: 취소가 가능한 status의 정확한 집합이 문서에 명시적으로 열거되어 있지 않음. DONE 상태에서 가능한 것은 확실하고, 가상계좌는 입금 전(WAITING_FOR_DEPOSIT 추정)에도 '일반 결제와 똑같이 취소'가 가능하다고만 기술됨
- 열린 질문: cancelAmount가 balanceAmount를 초과할 때의 에러 코드(NOT_CANCELABLE_AMOUNT 등)가 읽은 문서에는 없음 — 별도 에러 코드 페이지 확인 필요
- 열린 질문: 같은 Idempotency-Key로 다른 body를 보냈을 때의 동작이 명시되지 않음. 서버는 멱등키+API키+주소+HTTP 메서드 조합으로 판단한다고만 기술
- 멱등키는 15일만 유효하므로 15일이 지난 뒤 같은 키로 재요청하면 새 요청으로 처리될 수 있음(중복 취소 위험)
- 취소 관련 웹훅 이벤트는 취소 가이드 문서에 언급되지 않음 — 웹훅 문서를 별도로 확인해야 함
- 취소 전 GET 조회를 요구하는 문구는 없음 — 사전 조회는 라이브러리 설계 차원의 선택사항

### 라이브러리 설계 시사점

- 취소는 서버 전용(시크릿 키 Basic 인증) 작업이므로 브라우저 SDK 타입과 분리된 server-only 모듈로 설계하고, 시크릿 키가 클라이언트 번들에 들어가지 않게 타입 수준에서 격리할 것
- 전액 취소와 부분 취소를 별도 메서드/타입으로 분리 권장: FullCancel { cancelReason }, PartialCancel { cancelReason, cancelAmount } — cancelAmount 생략이 곧 전액 취소라는 암묵적 규칙을 타입으로 명시화
- 가상계좌 입금 후 취소는 refundReceiveAccount가 필수라는 조건부 필수 규칙을 discriminated union으로 강제 가능: 결제수단이 가상계좌+입금완료인 경우에만 refundReceiveAccount를 required로 요구하는 오버로드/제네릭 설계
- 검증 단계 강제에 활용할 훅: (1) cancelReason 200자, accountNumber 20자 숫자만, holderName 60자 등 정적 검증 가능한 제약을 추상클래스의 validate 단계로, (2) refundableAmount 파라미터를 항상 채워 보내도록 강제하면 잔액 불일치 시 서버가 거절하는 안전망을 라이브러리 차원에서 기본화 가능
- Idempotency-Key를 옵션이 아니라 라이브러리가 기본 생성(UUID)하는 필수 단계로 설계 가능 — 단 15일 TTL과 300자 제한, 409 IDEMPOTENT_REQUEST_PROCESSING 재시도 처리를 함께 캡슐화해야 함
- 응답 타입: Payment.status를 'CANCELED' | 'PARTIAL_CANCELED' 등 리터럴 유니온으로, cancels[]는 transactionKey를 식별자로 하는 배열 타입으로 모델링. receiptKey와 cancelRequestId는 nullable로 정확히 표기
- balanceAmount 기반 사전 검증(클라이언트 측에서 cancelAmount <= balanceAmount 체크)을 취소 빌더의 필수 단계로 넣을 수 있으나, 초과 시 서버 에러 코드가 문서에서 확인되지 않았으므로 에러 매핑은 보수적으로 설계할 것
- taxExemptionAmount가 있는 카드 결제는 부분 취소 불가, 카드 부분 취소는 3~4영업일 소요 — 동기 응답의 cancelStatus DONE과 실제 환불 완료 시점이 다를 수 있음을 타입/문서 주석에 반영

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/cancel-payment.md
- https://docs.tosspayments.com/reference.md
- https://docs.tosspayments.com/reference/using-api/authorization.md

## 웹훅과 보안 (Toss Payments V2)

토스페이먼츠 V2 웹훅은 개발자센터 웹훅 메뉴에서 상점아이디(MID)별로 등록하며, 이벤트는 HTTP POST + JSON으로 전달되고 상점 서버는 10초 이내에 200 응답을 보내야 한다. 실패 시 지수 백오프(1, 4, 16, 64, 256, 1024, 4096분)로 최대 7회, 약 3일 19시간 동안 재전송된다. 서명 검증(tosspayments-webhook-signature 헤더, HMAC-SHA256 + Base64, "v1:" 접두사)은 payout.changed와 seller.changed 이벤트에만 제공되며, 서명 키는 개발자센터 API 키 메뉴 > API 개별 키의 "보안 키"(64자 hex 문자열)로, 지급대행 API의 JWE(alg=dir, enc=A256GCM) Request Body 암호화에도 같은 키가 쓰인다. PAYMENT_STATUS_CHANGED 등 일반 결제 이벤트에는 서명이 없고, 가상계좌 DEPOSIT_CALLBACK은 페이로드의 secret 값을 결제 승인 API 응답의 secret과 비교해 진위를 검증하며, 그 외에는 문서에 명시된 인바운드 IP 목록으로 발신지를 제한하는 방법이 있다. 테스트 환경에서의 웹훅 발송 여부는 읽은 문서들에 명시돼 있지 않아 열린 질문으로 남는다.

### 연동 플로우

1. 개발자센터 웹훅 메뉴에서 "웹훅 등록하기"로 웹훅 이름, 공개 접근 가능한 URL, 구독할 이벤트 타입을 등록한다 (MID별 설정, 로컬 포트 URL 불가 — 로컬 개발은 ngrok 사용).
2. 상점 서버에 웹훅 수신 엔드포인트(HTTP POST, JSON)를 만든다. 방화벽을 쓴다면 문서의 인바운드 IP(13.124.18.147, 13.124.108.35, 3.36.173.151, 3.38.81.32, 115.92.221.121–127)를 허용한다.
3. 수신 시 raw body를 보존한 채 파싱하고, eventType으로 이벤트를 분기한다 (페이로드 키가 data인 이벤트와 entityBody인 이벤트(payout.changed, seller.changed)가 다름에 주의).
4. 진위 검증 — payout.changed / seller.changed: 개발자센터의 보안 키로 HMAC-SHA256("{WEBHOOK_PAYLOAD}:{tosspayments-webhook-transmission-time 헤더값}")을 계산하고, tosspayments-webhook-signature 헤더의 콤마로 구분된 각 "v1:<base64>" 값과 비교해 하나라도 일치하면 정상으로 판정한다 (키 재발급 병행 기간 때문에 서명이 2개일 수 있음).
5. 진위 검증 — DEPOSIT_CALLBACK(가상계좌): 페이로드의 secret 값이 결제 승인 API 응답으로 받아 저장해 둔 Payment 객체의 secret과 같은지 비교한다.
6. 그 외 이벤트(PAYMENT_STATUS_CHANGED 등)는 서명이 제공되지 않으므로 IP 제한 및 결제 조회 API로 상태를 재확인하는 방어적 처리를 한다.
7. 검증 후 10초 이내에 200 응답을 반환한다 (무거운 비즈니스 로직은 응답 후 비동기로 처리).
8. 200을 받지 못하면 토스페이먼츠가 1, 4, 16, 64, 256, 1024, 4096분 간격으로 최대 7회(총 약 3일 19시간) 재전송하므로, tosspayments-webhook-transmission-id(및 retried-count)로 중복 수신을 멱등 처리한다.
9. 지급대행 API를 함께 쓰는 경우, 같은 보안 키로 셀러 등록/수정·지급대행 요청의 Request Body를 JWE(alg=dir, enc=A256GCM, iat·nonce 커스텀 헤더, 키는 hex-decode한 바이트)로 암호화한다.

### 엔드포인트 / SDK 메서드

- **POST** `{상점이 개발자센터에 등록한 웹훅 URL}` — 토스페이먼츠가 이벤트 발생 시 상점 서버로 웹훅을 전송 (HTTP POST, JSON body). 상점은 10초 이내 200 응답 필요
  - 헤더 tosspayments-webhook-transmission-time (ISO 8601, 서명 대상에 포함)
  - 헤더 tosspayments-webhook-transmission-retried-count (재전송 횟수)
  - 헤더 tosspayments-webhook-transmission-id (웹훅 고유 식별자, 멱등성 키로 활용 가능)
  - 헤더 tosspayments-webhook-signature (payout.changed/seller.changed에만 존재, 'v1:<base64>' 형식, 콤마로 복수 서명 가능)
  - 바디 eventType (string) — PAYMENT_STATUS_CHANGED | DEPOSIT_CALLBACK | CANCEL_STATUS_CHANGED | BILLING_DELETED | METHOD_UPDATED | CUSTOMER_STATUS_CHANGED | ORDER_PAYMENT_STATUS_CHANGED | payout.changed | seller.changed | ars-reservation.changed
  - 바디 createdAt (string, yyyy-MM-dd'T'HH:mm:ss.SSSSSS)
  - 바디 data (대부분 이벤트) 또는 entityBody (payout.changed/seller.changed) — 이벤트별 객체
- **POST** `(지급대행) 셀러 등록 / 셀러 수정 / 지급대행 요청 — 정확한 path는 reference 미확인` — ENCRYPTION 보안이 적용되는 3개 엔드포인트. Request Body를 보안 키로 JWE 암호화해서 전송해야 함 (지급대행 요청 취소는 바디가 없어 암호화 불필요)
  - JWE 헤더 alg=dir
  - JWE 헤더 enc=A256GCM
  - JWE 커스텀 헤더 iat (ISO 8601 yyyy-MM-dd'T'HH:mm:ss±hh:mm)
  - JWE 커스텀 헤더 nonce (UUID 수준의 무작위 고유값)
  - 암호화 키: 보안 키를 hex-decode한 바이트 (Java: Hex.decode(securityKey), Python: binascii.unhexlify)
- **UI** `개발자센터 > 웹훅 메뉴 > 웹훅 등록하기` — 웹훅 등록 (API가 아닌 대시보드 UI). 웹훅 이름, 웹훅 URL, 구독할 이벤트 타입 선택. MID별로 별도 설정
  - 웹훅 URL은 온라인에서 접근 가능해야 하며 로컬 서버 포트 포함 URL은 등록 불가 (ngrok 등 터널링 필요)
- **UI** `개발자센터 > API 키 메뉴 > API 개별 키 > 보안 키` — 보안 키(64자 Hexadecimal 문자열) 확인. 웹훅 서명 검증(payout/seller)과 지급대행 JWE 암호화에 사용
  - 재발급 시 기존 키는 만료 예정으로 표시되어 7일간 병행 사용 가능 (최대 2개 키 공존, 만료 전 재발급 1회 제한)

### 제약/규칙 (문서 명시)

- 웹훅 수신 후 10초 이내에 200 응답을 보내야 성공으로 처리됨 (문서 원문: "10초 이내로 200 응답을 보내주세요")
- 응답 실패 시 최대 7회 재전송, 간격은 1 → 4 → 16 → 64 → 256 → 1024 → 4096분(지수 백오프), 총 약 3일 19시간 후 최종 실패 처리
- 웹훅은 상점아이디(MID)별로 설정되고 각 MID로 따로 전송됨
- 웹훅 URL은 공개적으로 접근 가능해야 하며 로컬 서버 포트가 포함된 URL은 등록 불가
- 서명 헤더 tosspayments-webhook-signature는 payout.changed, seller.changed 웹훅 헤더에만 포함됨 (다른 이벤트에는 서명 없음)
- 서명 산식: HMAC-SHA256을 "{WEBHOOK_PAYLOAD}:{tosspayments-webhook-transmission-time}"에 적용, Base64 인코딩, 헤더 값은 "v1:" 접두사가 붙고 콤마로 구분된 복수 서명 중 하나만 일치해도 정상 판정
- 보안 키는 64자 Hexadecimal 문자열, 개발자센터 API 키 메뉴 > API 개별 키 > 보안 키에서 확인, 절대 외부 노출 금지
- 보안 키/시크릿 키 재발급 시 기존 키는 7일간 유효(만료 예정 표시), 최대 2개 키 공존, 만료 전 재발급 1회만 가능 (클라이언트 키는 공개 식별값이라 재발급 대상 아님)
- DEPOSIT_CALLBACK 검증: 웹훅 페이로드의 secret이 결제 승인 API 응답의 secret과 같아야 정상 요청
- 지급대행 POST 요청(셀러 등록/수정, 지급대행 요청)은 보안 키로 Request Body를 JWE 암호화해야 함 — alg=dir, enc=A256GCM, iat(ISO 8601)·nonce(무작위 고유값) 필수, 키는 hex를 바이트로 디코딩해 사용
- 페이로드 공통 필드: eventType, createdAt(yyyy-MM-dd'T'HH:mm:ss.SSSSSS), 이벤트별 객체는 data 또는 entityBody
- 웹훅 인바운드 발신 IP: 13.124.18.147, 13.124.108.35, 3.36.173.151, 3.38.81.32, 115.92.221.121–127
- API 호출은 HTTPS(443)만 가능, TLS 1.2 이상만 지원
- 테스트 키는 test로 시작하며 테스트 키 결제는 실제 청구 없이 가상으로 승인됨

### 주의점 / 열린 질문

- 가장 중요한 함정: 서명 검증은 payout.changed / seller.changed에만 제공된다. PAYMENT_STATUS_CHANGED, BILLING_DELETED 등 대부분의 결제 이벤트에는 암호학적 진위 검증 수단이 없다 — 라이브러리가 모든 웹훅에 서명 검증을 강제하는 설계는 불가능
- 가상계좌는 PAYMENT_STATUS_CHANGED와 DEPOSIT_CALLBACK을 둘 다 구독하면 같은 사건에 웹훅이 두 번 온다 — 중복 처리 필요
- 자동결제(빌링) 승인 완료 시에는 웹훅이 전송되지 않는다 (BILLING_DELETED만 존재) — 웹훅만으로 결제 완결성을 보장할 수 없음
- 이벤트 네이밍이 비일관적: SCREAMING_SNAKE_CASE(PAYMENT_STATUS_CHANGED)와 소문자 점 표기(payout.changed, seller.changed, ars-reservation.changed)가 혼재하고, 페이로드 키도 data와 entityBody로 갈림
- 지급대행 웹훅은 COMPLETED/FAILED 상태에서만 전송되며 REJECTED는 FAILED로 전송됨; 셀러 등록 직후에는 웹훅이 오지 않고 이후 상태 전이부터 전송됨
- 열린 질문: 테스트 환경(테스트 키)에서 웹훅이 발송되는지, 테스트용 보안 키가 별도로 있는지 — 읽은 문서 어디에도 명시 없음
- 열린 질문: 문서는 정확히 "200" 응답을 요구하는데, 다른 2xx(201, 204 등)도 성공으로 처리되는지는 명시 없음
- 열린 질문: 서명 대상 {WEBHOOK_PAYLOAD}가 정확히 어떤 바이트(수신한 raw body 그대로인지)인지 명시적 정의 없음 — 안전하게 raw body를 그대로 써야 하며, JSON 재직렬화 후 검증하면 실패할 수 있음
- 열린 질문: 보안 키 재발급 시 2개 키가 공존하는 것과 서명 헤더에 콤마로 2개 서명이 오는 것의 관계(둘 중 하나 일치 시 정상)는 정황상 키 로테이션 대응으로 보이나 문서가 직접 연결해 설명하지는 않음
- 열린 질문: 웹훅 등록을 API로 할 수 있는지 — 읽은 문서에서는 개발자센터 UI 등록만 안내됨
- createdAt이 마이크로초 6자리(yyyy-MM-dd'T'HH:mm:ss.SSSSSS) 형식이라 일부 파서에서 밀리초 3자리 가정 시 파싱 오류 가능
- 서명이 없는 이벤트의 방어책은 인바운드 IP 허용목록 + 결제 조회 API 재확인인데, IP 목록은 문서 갱신으로 추가되는 이력이 있어(2024-12, 2026-05 추가분) 하드코딩 시 주기적 갱신 필요

### 라이브러리 설계 시사점

- 검증 전략을 이벤트 계열별로 다형화해야 함: (a) HMAC 서명 검증(payout.changed, seller.changed), (b) secret 대조 검증(DEPOSIT_CALLBACK — 저장된 Payment.secret 조회 콜백을 인터페이스로 강제), (c) 검증 수단 없음(나머지 — IP 허용목록/결제 조회 재확인 권고). 추상 클래스 WebhookVerifier를 이벤트 타입별 서브클래스로 강제하는 설계가 문서 구조와 정확히 일치
- TypeScript 타입은 eventType을 판별자(discriminant)로 하는 discriminated union이 자연스러움. 단 페이로드 키가 data/entityBody로 갈리므로 정규화 계층이 필요하고, 원본 필드명을 보존하는 raw 타입과 정규화 타입을 분리하는 것이 안전
- 서명 검증은 반드시 raw request body(문자열/버퍼)를 입력으로 받아야 함 — 파싱된 객체만 받는 API 시그니처는 서명 검증을 원천적으로 불가능하게 하므로, verify(rawBody: string, headers) 형태를 인터페이스로 강제할 것
- 서명 파싱 로직: 헤더 값을 콤마로 split → 각 항목의 'v1:' 접두사 제거 → base64 값과 계산값 비교 → 하나라도 일치하면 통과. 버전 접두사(v1)가 있으므로 향후 v2 대비 확장 가능한 파서로 설계
- SecurityKey는 64자 hex 문자열 브랜드 타입으로 모델링하고, 웹훅 HMAC과 지급대행 JWE 암호화가 같은 키를 공유하므로 단일 credential 객체로 관리. 사용 시 hex→bytes 디코딩을 라이브러리 내부에서 처리
- 응답 규약(10초 내 200)을 라이브러리가 보장하도록: 핸들러를 등록하면 프레임워크 어댑터가 검증 즉시 200을 반환하고 비즈니스 로직은 비동기 실행하는 패턴을 기본값으로 제공
- 멱등성 처리를 인터페이스로 강제: tosspayments-webhook-transmission-id를 키로 하는 dedupe store(사용자 구현 주입)를 받도록 설계 — 최대 7회 재전송 + 가상계좌 이중 이벤트 때문에 필수
- 키 로테이션(2개 키 7일 공존)을 지원하려면 verifier가 보안 키를 단일 값이 아닌 배열로 받을 수 있어야 하고, 서명 헤더의 복수 서명과 키 배열의 데카르트 곱 중 하나라도 일치하면 통과하는 로직이 필요
- 서명 없는 이벤트를 처리할 때 라이브러리가 '검증됨'을 표현하는 타입(Verified<T>)을 부여하면 안 됨 — 검증 등급(signature-verified / secret-verified / unverified)을 타입 레벨로 구분해 소비자가 unverified 이벤트는 결제 조회 API 재확인 후 신뢰하도록 유도
- 자동결제는 웹훅이 없으므로 라이브러리 문서/타입에서 빌링 승인 완료 이벤트가 존재하지 않음을 명시해야 함 (있다고 가정한 핸들러 등록을 타입으로 막을 것)
- createdAt 마이크로초 형식 파싱 유틸을 내장하고, 테스트 환경 웹훅 동작·2xx 허용 범위 등 문서에 없는 사항은 라이브러리가 임의로 가정하지 말고 보수적으로(정확히 200 반환) 구현할 것

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/webhook.md
- https://docs.tosspayments.com/reference/using-api/webhook-events.md
- https://docs.tosspayments.com/reference/using-api/security.md
- https://docs.tosspayments.com/guides/v2/payouts.md
- https://docs.tosspayments.com/reference/using-api/api-keys.md

## 테스트 환경과 에러 체계 (Toss Payments V2)

토스페이먼츠 테스트 환경은 test_ 접두사 키로 동작하며 실제 결제수단에서 돈이 출금되지 않고, 전용 테스트 카드번호 없이 실제 카드번호를 그대로 사용해도 청구되지 않는다. 키는 연동 방식별로 구분되는데 결제위젯은 gck/gsk(test_gck_/test_gsk_), API 개별연동은 ck/sk(test_ck_/test_sk_) 접두사를 쓰며, MID(일반결제/자동결제/결제창/브랜드페이)마다 별도 키 쌍이 발급되고 키 혼용 시 INVALID_API_KEY 또는 NOT_SUPPORTED_WIDGET_KEY 에러가 난다. 에러 응답은 항상 {code, message} JSON(message 최대 510자)이고 HTTP 상태는 400(검증/비즈니스), 401(인증), 403(권한/제한), 404(리소스 없음), 500(서버 오류)으로 분포한다. TossPayments-Test-Code 헤더에 에러코드를 지정하면 테스트 환경에서 라이브와 동일한 에러를 재현할 수 있으나 테스트 시크릿 키에서만 동작한다. 테스트 환경은 API당 분당 100건 제한이 있고, 테스트 결제내역은 개발자센터 전용 메뉴에서 조회하며 정산 기록은 라이브에서만 조회된다.

### 연동 플로우

1. 개발자센터에서 상점(MID) 유형에 맞는 테스트 키 쌍을 발급받는다. 결제위젯 상점은 test_gck_(클라이언트)/test_gsk_(시크릿), API 개별연동 상점은 test_ck_/test_sk_. 회원가입 없이 문서 공용 키(test_gck_docs_..., test_gsk_docs_...)로 즉시 체험도 가능하나 기능 제한이 있다.
2. 클라이언트에서 클라이언트 키로 SDK를 초기화하고 requestPayment 등을 호출한다. 동기 실패는 Promise reject, 결제 진행 중 실패는 failUrl 리다이렉트로 전달된다.
3. 서버에서 테스트 시크릿 키를 Basic 인증(base64(secretKey+":"))으로 넣어 POST /v1/payments/confirm을 인증 유효시간 10분 내에 호출한다. 테스트 환경이므로 실제 출금은 발생하지 않는다.
4. 에러 케이스를 재현하려면 confirm 등 API 요청에 TossPayments-Test-Code: {에러코드} 헤더를 추가한다(예: REJECT_CARD_PAYMENT). 반드시 테스트 시크릿 키를 써야 하며 라이브 키에서는 헤더가 무시된다.
5. 취소 테스트는 POST /v1/payments/{paymentKey}/cancel로 하고, 멱등키 헤더를 붙여 중복 취소를 방지한다.
6. 자동결제 테스트는 카드번호 앞 6자리만 유효하면 빌링키가 등록되며, POST /v1/billing/{billingKey}로 승인한다.
7. 테스트 결제내역은 개발자센터 "테스트 결제내역" 메뉴에서 날짜·결제수단별로 조회한다. 테스트 가상계좌(X 접두사)는 실제 입금이 불가하므로 이 메뉴에서 입금 처리한다.
8. 모든 실패 응답은 {code, message} JSON으로 파싱하고 HTTP 상태(400/401/403/404/500)와 함께 분기 처리한다.

### 엔드포인트 / SDK 메서드

- **POST** `/v1/payments/confirm` — 결제 승인. 인증 완료 후 10분 내 호출해야 하며, 테스트 환경에서 TossPayments-Test-Code 헤더로 에러 재현 가능
  - paymentKey (string)
  - orderId (string)
  - amount (number)
  - Authorization: Basic base64(secretKey+":") 헤더
  - TossPayments-Test-Code: {에러코드} 헤더 (테스트 시크릿 키 전용, 예: REJECT_CARD_PAYMENT)
- **POST** `/v1/payments/{paymentKey}/cancel` — 결제 취소. 멱등키 헤더를 추가하면 중복 취소 없이 안전하게 처리됨
  - paymentKey (path)
  - cancelReason 등 취소 파라미터
  - 멱등키 헤더 (정확한 헤더명은 /reference/using-api/authorization 문서에 있음, 미확인)
- **POST** `/v1/billing/{billingKey}` — 빌링키로 자동결제 승인. 테스트 환경에서는 카드번호 앞 6자리만 유효해도 빌링키 등록 가능
  - billingKey (path)
  - customerKey (인증 시와 불일치하면 NOT_MATCHES_CUSTOMER_KEY)
- **SDK** `requestPayment()` — V2 브라우저 SDK 결제 요청. 동기적 실패는 Promise reject, 결제 진행 중 실패는 failUrl 리다이렉트로 code/message가 쿼리 파라미터로 전달됨
  - successUrl
  - failUrl
  - 일부 결제수단은 Promise 방식 미지원 (NOT_SUPPORTED_PROMISE → successUrl/failUrl 필수)
- **SDK** `setAmount()` — 위젯 결제금액 설정. 미호출 시 NOT_SETUP_AMOUNT 에러
  - amount (0 초과 필수, BELOW_ZERO_AMOUNT)
- **SDK** `위젯 렌더링 메서드 (결제수단/약관 위젯)` — 결제수단·약관 위젯 렌더링. 중복 렌더 시 PAYMENT_METHODS_WIDGET_ALREADY_RENDERED / AGREEMENT_WIDGET_ALREADY_RENDERED, 셀렉터 못 찾으면 INVALID_SELECTOR
  - selector (CSS 셀렉터)
  - variantKey (없으면 INVALID_VARIANT_KEY)

### 제약/규칙 (문서 명시)

- 에러 응답은 항상 {code, message} JSON 구조. message는 최대 510자. 과거 결제 조회 시에는 Payment 객체의 failure 필드에 동일 구조로 담김
- HTTP 상태 규칙: 400=검증/비즈니스 규칙 위반(대부분), 401=인증 실패, 403=권한 거부·제한 초과·허용되지 않은 작업, 404=리소스 없음, 500=서버/일시 오류. 라이브 환경 과다 요청 시 429 Too Many Requests
- 키 접두사: 테스트=test, 라이브=live. 결제위젯은 클라이언트 gck/시크릿 gsk(test_gck_, test_gsk_), API 개별연동은 클라이언트 ck/시크릿 sk(test_ck_, test_sk_). 위젯용 키와 API 개별연동용 키는 명확히 구분됨
- 클라이언트 키와 시크릿 키는 쌍(세트)으로 매칭되어야 하며 test/live 혼용 또는 쌍 불일치 시 INVALID_API_KEY
- MID(상점) 유형별로 별도 키 쌍 발급: 일반 결제, 자동결제, 결제창, 브랜드페이 — 다른 서비스의 키로 SDK 초기화하면 에러
- 테스트 환경에서는 결제 승인되어도 실제 출금 없음. 전용 테스트 카드번호는 존재하지 않으며 실제 카드정보를 넣어도 청구되지 않음
- TossPayments-Test-Code 헤더는 Authorization에 테스트 시크릿 키를 쓸 때만 동작. 라이브 키 사용 시 헤더가 무시됨
- 테스트 환경 API는 분당 100건 요청 제한
- 결제 인증 후 10분 내 승인 API 미호출 시 결제 만료(EXPIRED 상태)
- 자동결제(빌링) 테스트: 카드번호 앞 6자리만 유효해도 등록 가능. 라이브는 전체 유효 카드번호 필요
- 간편결제 테스트 제약: 토스페이·네이버페이·애플페이·삼성페이·SSG페이·엘페이·핀페이는 개발 연동 체험 상점 및 MID 테스트 키로 가능, 카카오페이는 계약 후 상점 테스트 키 필요, 페이코는 테스트 키 불가(라이브 키 필요)
- 테스트 가상계좌는 계좌번호에 X 접두사가 붙고 실제 입금 불가 — 개발자센터 테스트 결제내역 메뉴에서 입금 처리
- 정산 기록은 라이브 환경에서만 조회 가능. 테스트 영수증은 링크만 제공되고 실제 영수증 데이터는 생성 안 됨
- 시크릿 키를 클라이언트 코드에 노출하면 INSECURE_KEY_USAGE 에러
- 승인 대표 에러: INVALID_REQUEST(400), INVALID_PAYMENT_KEY(400), ALREADY_PROCESSED_PAYMENT(400), PAY_PROCESS_ABORTED(400), UNAUTHORIZED_KEY(401), FORBIDDEN_REQUEST(403), NOT_FOUND_PAYMENT(404)
- 취소 대표 에러: ALREADY_CANCELED_PAYMENT(400), INVALID_REFUND_AMOUNT(400), NOT_CANCELABLE_PAYMENT(403), EXCEED_MAX_REFUND_DUE(403), NOT_ALLOWED_PARTIAL_REFUND(403), NOT_FOUND_PAYMENT(404), FAILED_REFUND_PROCESS(500)
- 빌링 대표 에러: INVALID_BILL_KEY_REQUEST(400), INVALID_BILLING_AUTH(400), NOT_MATCHES_CUSTOMER_KEY(400), FAILED_BILL_KEY_AUTH_CREATION(500), FAILED_BILLING_AUTO_CANCEL(500)
- SDK 대표 에러: USER_CANCEL, PAY_PROCESS_CANCELED(사용자 취소), PAY_PROCESS_ABORTED, REJECT_CARD_COMPANY, INVALID_PARAMETERS, BELOW_ZERO_AMOUNT, NOT_SETUP_AMOUNT, INVALID_CLIENT_KEY, NOT_SELECTED_PAYMENT_METHOD, NETWORK_ERROR, NOT_SUPPORTED_WIDGET_KEY, NOT_SUPPORTED_PROMISE

### 주의점 / 열린 질문

- 테스트 결제의 자동 취소 정책(일정 기간 후 자동 취소되는지 여부)은 읽은 문서 어디에도 명시되어 있지 않음 — 열린 질문. reference.md의 10분 만료는 인증 후 승인 미호출 시 EXPIRED가 되는 규칙이지 테스트 결제 자동 취소가 아님
- 멱등키 헤더의 정확한 이름과 포맷은 /reference/using-api/authorization 페이지에 있어 이번 리서치에서 미확인 — Idempotency-Key로 추측하지 말 것
- SDK 에러 객체가 {code, message} 필드 구조인지 문서에 명시적으로 나오지 않음(코드 문자열+메시지 쌍으로만 서술). REST API 에러는 {code, message} 확정
- SDK 에러 전달 경로가 이원화됨: 동기 실패는 Promise reject, 결제 진행 중 실패는 failUrl 리다이렉트. failUrl에 전달되는 정확한 쿼리 파라미터 이름은 이번에 읽은 페이지에서 미확인
- 일부 결제수단은 Promise 방식 자체를 지원하지 않음(NOT_SUPPORTED_PROMISE) — successUrl/failUrl 방식이 필수인 경로가 존재
- HTTP 상태만으로 인증 문제를 분류할 수 없음: INVALID_API_KEY는 400인데 UNAUTHORIZED_KEY는 401. 같은 코드(PAY_PROCESS_ABORTED)가 SDK failUrl과 승인 API 양쪽에서 등장
- 취소 관련 에러가 400과 403에 걸쳐 분포(NOT_CANCELABLE_PAYMENT, EXCEED_MAX_REFUND_DUE, NOT_ALLOWED_PARTIAL_REFUND가 403) — 403을 인증 문제로만 매핑하면 오분류
- TossPayments-Test-Code로 시뮬레이션 가능한 전체 에러 코드 목록은 미확인(문서 예시는 REJECT_CARD_PAYMENT 하나). 문서는 '모든 에러를 라이브와 똑같이 재현할 수 있다'고만 서술
- 위젯 키(gsk/gck)와 API 개별연동 키(sk/ck)는 런타임에 구분됨: API 개별연동 기능에 위젯 키를 쓰면 NOT_SUPPORTED_WIDGET_KEY 에러. 반대 방향 에러 코드는 미확인
- 문서 공용 테스트 키(test_gck_docs_..., test_gsk_docs_...)는 기능 제한이 있어 실제 개발에는 회원가입 후 발급받은 자체 테스트 키 필요
- 개발 연동 체험 상점 vs 실제 계약 상점의 테스트 키 발급 절차·차이의 상세는 문서에서 충분히 설명되지 않음 — 열린 질문
- 테스트 환경 분당 100건 제한을 초과했을 때 반환되는 정확한 에러 코드/상태는 미확인(라이브는 429 언급)

### 라이브러리 설계 시사점

- 키 타입을 템플릿 리터럴 타입으로 강제: `test_gck_${string}` | `live_gck_${string}` 등으로 WidgetClientKey/WidgetSecretKey/ApiClientKey/ApiSecretKey를 분리하면, 위젯 키로 API 개별연동 클라이언트를 생성하는 실수(NOT_SUPPORTED_WIDGET_KEY, INVALID_API_KEY)를 컴파일 타임에 차단할 수 있음
- test/live를 phantom type(브랜드 타입)으로 키에 새기면 TossPayments-Test-Code 헤더 옵션을 테스트 키 클라이언트에서만 타입으로 허용 가능 — 라이브 키에서 헤더가 조용히 무시되는 함정을 타입으로 제거
- 에러는 {code, message} 공통 인터페이스 위에 API별 discriminated union(ConfirmErrorCode | CancelErrorCode | BillingErrorCode)으로 모델링. 코드→HTTP 상태 매핑이 1:1이 아니므로 status 필드를 별도로 보존해야 함
- 사용자 취소(USER_CANCEL, PAY_PROCESS_CANCELED)를 실패와 구분되는 별도 결과 타입으로 분리 — 검증 단계 인터페이스에서 '취소 처리'와 '에러 처리'를 각각 추상 메서드로 강제할 근거
- 검증 단계 강제 설계의 핵심 근거: 인증 후 10분 내 confirm 필수(EXPIRED), confirm 전 amount/orderId 검증 필요 — Authenticated→Confirmed 상태를 타입 상태 머신으로 표현하고 confirm을 Authenticated 상태에서만 호출 가능하게 하는 설계가 문서 플로우와 일치
- SDK 에러의 이원 채널(Promise reject vs failUrl 리다이렉트 쿼리 파라미터)을 모두 모델링해야 함 — failUrl 파싱을 추상 클래스의 필수 구현 단계로 강제할 수 있음. 단, failUrl 파라미터 스펙은 추가 확인 필요
- cancel 메서드에 멱등키 옵션을 1급 파라미터로 노출(재시도 안전성). 정확한 헤더명은 authorization 문서 확인 후 확정
- 테스트 클라이언트에 분당 100건 rate limit을 인식하는 재시도/스로틀 정책을 내장하면 통합 테스트 안정성 향상
- 빌링은 별도 MID·별도 키 쌍이므로 BillingClient를 PaymentClient와 분리된 팩토리로 설계하는 것이 토스 키 체계와 일치. customerKey 불일치(NOT_MATCHES_CUSTOMER_KEY)를 막기 위해 빌링키 발급 시의 customerKey를 타입/객체에 캡슐화해 승인 시 재사용 강제
- 테스트 전용 기능(에러 시뮬레이션, 테스트 결제내역 안내 등)은 TestOnly 네임스페이스로 분리해 라이브 코드 경로에 혼입되지 않게 설계

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/get-started/environment.md
- https://docs.tosspayments.com/reference/using-api/api-keys.md
- https://docs.tosspayments.com/reference/error-codes.md
- https://docs.tosspayments.com/blog/how-to-test-toss-payments.md
- https://docs.tosspayments.com/sdk/v2/error-codes.md
- https://docs.tosspayments.com/reference.md

# 보강 조사 (완결성 검증에서 나온 누락 주제)

## 누락 보강 조사: 웹훅 이벤트별 페이로드(data) 스키마 전체 + 테스트 환경 웹훅 발송 여부

웹훅 이벤트는 총 10종이며 페이로드 봉투(envelope)가 세 가지 형태로 나뉜다: (a) {eventType, createdAt, data} 구조(PAYMENT_STATUS_CHANGED, CANCEL_STATUS_CHANGED, BILLING_DELETED, METHOD_UPDATED, CUSTOMER_STATUS_CHANGED, ORDER_PAYMENT_STATUS_CHANGED), (b) eventType 필드가 아예 없는 평탄(flat) 구조인 DEPOSIT_CALLBACK(createdAt/secret/status/transactionKey/orderId — paymentKey 없음), (c) {eventType, createdAt, version, eventId, entityType, entityBody} 신형 구조(payout.changed, seller.changed, ars-reservation.changed). 따라서 eventType 단일 키 기반 discriminated union만으로는 파싱이 불가능하고 DEPOSIT_CALLBACK은 구조 기반 판별이 필요하다. 테스트 환경에서의 웹훅 발송 여부는 어느 문서에도 명시 문장이 없으나, 가상계좌 가이드가 "개발자센터 테스트 거래내역의 입금처리·취소 버튼으로 입금을 시뮬레이션하면 등록된 웹훅 URL로 이벤트 본문이 전송된다"는 흐름을 기술하므로 테스트 키에서도 웹훅이 발송되는 것으로 강하게 암시된다(명시 확인은 열린 질문). 웹훅 등록은 개발자센터 전용이며 API가 없고, localhost URL은 등록 불가(ngrok 안내)라서 자동화된 실수신 통합 테스트는 어렵다.

### 연동 플로우

1. 개발자센터 웹훅 메뉴(https://developers.tosspayments.com/my/webhooks)에서 '웹훅 등록하기'로 이름·URL·이벤트 타입을 선택해 등록한다. 웹훅 등록 API는 존재하지 않으며(레퍼런스에 없음) 개발자센터 전용이다. localhost URL은 등록 불가 — 로컬 개발 시 ngrok 등으로 공개 URL을 만든다.
2. 서버 방화벽에서 토스페이먼츠 인바운드 IP(13.124.18.147, 13.124.108.35, 3.36.173.151, 3.38.81.32 + 2024년 12월 추가분 115.92.221.121/.122/.123/.125/.126/.127)를 허용하고 웹훅 URL 포트를 연다. HTTPS 권장(HTTP도 지원).
3. 가상계좌 결제 승인 API 호출 시 응답 Payment 객체의 secret(최대 50자, "웹훅을 검증하는 값")과 orderId를 반드시 저장한다 — DEPOSIT_CALLBACK에는 paymentKey가 없으므로 orderId가 조회 키가 된다.
4. 웹훅 수신 시 JSON body의 envelope을 판별한다: eventType 필드가 없고 secret/transactionKey/orderId가 있으면 DEPOSIT_CALLBACK, eventType+data면 구형 이벤트, eventType+eventId+entityType+entityBody면 신형 이벤트.
5. 검증한다: DEPOSIT_CALLBACK은 body의 secret을 저장해둔 Payment.secret과 비교("같으면 정상적인 웹훅"), payout.changed/seller.changed는 tosspayments-webhook-signature 헤더를 HMAC-SHA256({페이로드}:{transmission-time}, 시크릿 키) 후 Base64로 검증(헤더의 'v1:' 뒤 두 값 중 하나와 일치하면 정상), 나머지 이벤트는 서명·secret이 없으므로 발신 IP 허용목록으로만 신뢰를 판단한다.
6. 10초 이내에 HTTP 200을 응답한다. 무거운 처리는 응답 후 비동기로 수행한다.
7. 실패 시 최대 7회, 총 3일 19시간에 걸쳐 재전송된다(간격: 1, 4, 16, 64, 256, 1024, 4096분). tosspayments-webhook-transmission-id(또는 신형 이벤트의 eventId)로 중복 수신을 제거한다. 개발자센터에서 '다시 시도' 수동 재전송도 가능하다.
8. 테스트: 테스트 환경에서 발급된 가상계좌(계좌번호가 'X'로 시작)는 실제 입금이 불가능하므로, 개발자센터 테스트 거래내역(https://developers.tosspayments.com/my/payment-logs)의 가장 오른쪽 칼럼 '입금처리·취소' 버튼으로 입금을 시뮬레이션한다. 가이드 흐름상 "입금이 완료되면 이벤트 본문이 등록한 웹훅 URL로 전송됩니다"이므로 이 버튼이 웹훅 발송을 유발하는 것으로 읽힌다.

### 엔드포인트 / SDK 메서드

- **POST** `{가맹점 웹훅 URL} — event: PAYMENT_STATUS_CHANGED` — 결제 상태 변경 통지(카드/계좌이체/휴대폰/상품권 등 모든 결제수단). EXPIRED, DONE, ABORTED, CANCELED, PARTIAL_CANCELED로의 전이 시에만 발송. 자동결제(빌링) 승인은 발송 안 됨
  - eventType: 'PAYMENT_STATUS_CHANGED' (string)
  - createdAt: string (yyyy-MM-dd'T'HH:mm:ss.SSSSSS)
  - data: Payment 전체 객체 (mId, version, paymentKey, orderId, lastTransactionKey, status, requestedAt, approvedAt, useEscrow, card{issuerCode,acquirerCode,number,installmentPlanMonths,amount}, virtualAccount{...}, secret 등)
- **POST** `{가맹점 웹훅 URL} — event: DEPOSIT_CALLBACK` — 가상계좌 입금/입금취소 통지. 유일하게 eventType 필드와 data 래퍼가 없는 평탄 구조. paymentKey 미포함 — 조회 키는 orderId(또는 transactionKey)뿐
  - createdAt: string (예시는 '2022-06-09T15:40:09+09:00' 오프셋 형식)
  - secret: string (최대 50자, 승인 응답 Payment.secret과 비교하여 검증)
  - status: 'WAITING_FOR_DEPOSIT' | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED'
  - transactionKey: string
  - orderId: string
  - (주의) eventType 없음, paymentKey 없음
- **POST** `{가맹점 웹훅 URL} — event: CANCEL_STATUS_CHANGED` — 결제 취소 상태 통지 — 해외 간편결제 전용(국내 결제 취소는 발송 안 됨)
  - eventType: 'CANCEL_STATUS_CHANGED'
  - createdAt: string
  - data: Cancel 객체 (취소 status: IN_PROGRESS | DONE | ABORTED)
- **POST** `{가맹점 웹훅 URL} — event: BILLING_DELETED` — 빌링키 자동 삭제 통지
  - eventType: 'BILLING_DELETED'
  - createdAt: string
  - data.billingKey: string (삭제된 빌링키)
  - data.reason: string (삭제 사유)
- **POST** `{가맹점 웹훅 URL} — event: METHOD_UPDATED` — 브랜드페이 결제수단 변경 통지
  - eventType: 'METHOD_UPDATED'
  - createdAt: string
  - data.customerKey: string
  - data.methodKey: string
  - data.status: 'ENABLED' | 'DISABLED' | 'ALIAS_UPDATED'
- **POST** `{가맹점 웹훅 URL} — event: CUSTOMER_STATUS_CHANGED` — 브랜드페이 고객 상태 변경 통지
  - eventType: 'CUSTOMER_STATUS_CHANGED'
  - createdAt: string
  - data.customerKey: string
  - data.status: 'CREATED' | 'REMOVED' | 'PASSWORD_CHANGED' | 'ONE_TOUCH_ACTIVATED' | 'ONE_TOUCH_DEACTIVATED'
  - data.changedAt: string (yyyy-MM-dd'T'HH:mm:ss±hh:mm)
- **POST** `{가맹점 웹훅 URL} — event: ORDER_PAYMENT_STATUS_CHANGED` — 링크페이(Link Pay) 주문 결제 상태 통지
  - eventType: 'ORDER_PAYMENT_STATUS_CHANGED'
  - createdAt: string
  - data.orderKey: string
  - data.amount: number
  - data.currency: string
  - data.customerName: string
  - data.customerPhoneNumber: string
  - data.payment: Payment 객체 (내장)
  - data.orderItems: array
- **POST** `{가맹점 웹훅 URL} — event: payout.changed` — 지급대행(payout) 상태 통지. COMPLETED/FAILED만 발송(REJECTED는 FAILED로 변환). 신형 envelope + HMAC 서명 헤더 제공
  - eventType: 'payout.changed'
  - createdAt: string (yyyy-MM-dd'T'HH:mm:ss±hh:mm)
  - version: string (API 버전)
  - eventId: string (웹훅 고유 ID)
  - entityType: 'payout'
  - entityBody: {id, refPayoutId, destination, scheduleType, payoutDate, amount{currency,value}, transactionDescription, requestedAt, status, error, metadata}
- **POST** `{가맹점 웹훅 URL} — event: seller.changed` — 셀러 승인/KYC 상태 통지. 최초 APPROVAL_REQUIRED 상태에서는 발송 안 되고 이후 변경부터 발송. 신형 envelope + HMAC 서명 헤더 제공
  - eventType: 'seller.changed'
  - createdAt / version / eventId / entityType: 'seller'
  - entityBody: {id, refSellerId, businessType, company{name,representativeName,businessRegistrationNumber,email,phone}, individual(nullable), account{bankCode,accountNumber,holderName}, status, metadata}
  - entityBody.status: 'APPROVAL_REQUIRED' | 'PARTIALLY_APPROVED' | 'KYC_REQUIRED' | 'APPROVED'
- **POST** `{가맹점 웹훅 URL} — event: ars-reservation.changed` — ARS 결제 예약 상태 통지 (신형 envelope). 단, ARS는 테스트 환경 미제공
  - eventType: 'ars-reservation.changed'
  - createdAt / version / eventId / entityType: 'ars-reservation'
  - entityBody: {arsReservationKey, reserveNumber, requestedAt, reservedAt, status('DONE'|'CANCELED'), canceledAt, cancelReason, completedAt, mId}
- **HEADER** `(모든 웹훅 공통 HTTP 헤더)` — 수신 검증/중복제거용 메타데이터
  - tosspayments-webhook-transmission-time: 전송 시각
  - tosspayments-webhook-transmission-retried-count: 재전송 횟수
  - tosspayments-webhook-transmission-id: 전송 고유 ID (멱등성 키로 활용 가능)
  - tosspayments-webhook-signature: HMAC-SHA256 서명 — payout.changed, seller.changed에만 존재

### 제약/규칙 (문서 명시)

- 웹훅 응답: 10초 이내 HTTP 200 필수 — 그 외는 실패로 간주되어 재전송 대상
- 재전송: 최대 7회, 총 3일 19시간, 간격 1/4/16/64/256/1024/4096분(4^n 지수 백오프). 7회째 실패 시 최종 '실패' 상태
- 웹훅 등록은 개발자센터 전용(API 없음). 온라인 접근 가능한 URL만 등록 가능 — localhost 불가
- DEPOSIT_CALLBACK 페이로드에는 eventType 필드와 paymentKey가 없다. 필드는 createdAt, secret, status, transactionKey, orderId 5개뿐
- DEPOSIT_CALLBACK 검증: body의 secret == 결제 승인 응답 Payment.secret (최대 50자) 이어야 정상 웹훅
- PAYMENT_STATUS_CHANGED는 EXPIRED/DONE/ABORTED/CANCELED/PARTIAL_CANCELED 전이 시에만 발송되고, 자동결제(빌링) 승인은 웹훅을 발생시키지 않는다
- PAYMENT_STATUS_CHANGED와 DEPOSIT_CALLBACK을 둘 다 등록하면 가상계좌 상태 변경 시 웹훅이 두 번 온다
- CANCEL_STATUS_CHANGED는 해외 간편결제 전용 — 국내 결제 취소는 발송되지 않는다
- tosspayments-webhook-signature 헤더는 payout.changed, seller.changed에만 존재. 검증: HMAC-SHA256으로 {페이로드}:{transmission-time}를 해시 후 헤더의 'v1:' 뒤 Base64 값 두 개 중 하나와 일치 확인
- payout.changed는 COMPLETED/FAILED 상태만 발송(REJECTED는 FAILED로 변환되어 전달)
- seller.changed는 최초 APPROVAL_REQUIRED 상태에서는 발송되지 않는다
- 테스트 환경 가상계좌는 'X'로 시작하며 실제 입금 불가 — 개발자센터 '입금처리' 버튼으로만 입금 시뮬레이션 가능
- 테스트 환경 API 요청 제한: API당 분당 100건
- ARS 결제는 테스트 환경이 제공되지 않는다
- 웹훅 발신 IP: 13.124.18.147, 13.124.108.35, 3.36.173.151, 3.38.81.32 및 115.92.221.121/.122/.123/.125/.126/.127 (테스트/라이브 구분 없이 단일 목록)

### 주의점 / 열린 질문

- [핵심 열린 질문] '테스트 키로 결제하면 웹훅이 발송된다'는 명시 문장은 6개 문서 어디에도 없다. 다만 가상계좌 가이드가 테스트 환경의 '입금처리·취소' 버튼 사용 → '입금이 완료되면 이벤트 본문이 등록한 웹훅 URL로 전송됩니다' 흐름을 하나의 문서에서 연속으로 기술하므로 테스트 환경 웹훅 발송이 강하게 암시된다. 확정하려면 실제 테스트 키 결제로 검증 필요
- envelope이 3종이라 eventType 단일 discriminated union이 성립하지 않는다: (a) {eventType, createdAt, data} 6종, (b) eventType 없는 평탄 구조 DEPOSIT_CALLBACK 1종, (c) {eventType, createdAt, version, eventId, entityType, entityBody} 3종
- DEPOSIT_CALLBACK에 paymentKey가 없어 paymentKey 기반 핸들러 설계가 불가능하다 — orderId(+transactionKey)로 조회해야 하며, 승인 시점에 orderId↔결제 매핑과 secret을 저장해두지 않으면 검증도 조회도 불가
- createdAt 형식이 이벤트마다 다르다: 구형 이벤트는 yyyy-MM-dd'T'HH:mm:ss.SSSSSS(마이크로초, 오프셋 없음)로 문서화됐는데 DEPOSIT_CALLBACK 예시는 '2022-06-09T15:40:09+09:00'(오프셋 형식), 신형 이벤트는 yyyy-MM-dd'T'HH:mm:ss±hh:mm — 단일 날짜 파서로 처리하면 깨진다
- 구형 이벤트 6종에는 서명·secret 같은 암호학적 검증 수단이 전혀 없다(IP 허용목록이 유일한 신뢰 근거). DEPOSIT_CALLBACK만 secret 비교, payout/seller.changed만 HMAC 서명
- PAYMENT_STATUS_CHANGED의 data는 Payment 전체 객체라서 API 버전에 따라 필드가 변동될 수 있다 — 웹훅 전용 타입을 따로 만들면 API 응답 타입과 이중 관리가 된다
- 멱등성 처리 가이드가 문서에 없다. 신형 이벤트만 body에 eventId가 있고, 구형/DEPOSIT_CALLBACK은 HTTP 헤더 tosspayments-webhook-transmission-id에 의존해야 한다
- 웹훅 등록/삭제 API가 없어서 CI에서 웹훅 엔드포인트를 프로그래밍 방식으로 등록하는 통합 테스트 자동화가 불가능하다. 개발자센터에 웹훅 시뮬레이션(가짜 발송) 도구가 있다는 문서 기술도 없다
- 웹훅 발신 IP 목록에 테스트/라이브 환경 구분이 없다 — 테스트 웹훅이 같은 IP에서 오는지는 미기재
- CANCEL_STATUS_CHANGED의 data(Cancel 객체) 상세 필드 구성은 webhook-events 문서에서 status 값(IN_PROGRESS/DONE/ABORTED) 외에 완전히 나열되지 않았다 — Cancel 객체 레퍼런스 대조 필요(열린 질문)
- ars-reservation.changed에 서명 헤더가 붙는지 여부는 미기재(서명은 payout.changed, seller.changed에만 명시됨)
- 웹훅으로 결제 조회 시 사용할 orderId 기반 결제 조회 API의 정확한 경로는 이번 조사 범위(웹훅 문서)에서 확인하지 않았다 — 결제 API 담당 조사와 대조 필요

### 라이브러리 설계 시사점

- 웹훅 파서는 2단계 판별이 필요하다: 1단계에서 구조 판별(eventType 부재+secret/transactionKey 존재 → DepositCallback, entityBody 존재 → 신형 envelope, data 존재 → 구형 envelope), 2단계에서 eventType 문자열로 세분화. 즉 TS 타입은 'RawWebhook = LegacyEnvelope<eventType별 data> | DepositCallback | V2Envelope<entityType별 entityBody>' 형태의 3분기 유니온이 되어야 한다
- DEPOSIT_CALLBACK 핸들러의 추상 인터페이스는 paymentKey가 아니라 orderId를 1급 키로 받아야 한다. 검증 강제를 위해 추상 메서드 예: abstract getStoredSecret(orderId: string): Promise<string|null> — 라이브러리가 이 값을 body.secret과 비교한 뒤에만 onDeposit(payload) 훅을 호출하는 템플릿 메서드 패턴이 문서 요구사항과 정확히 일치한다
- 승인 단계와 웹훅 단계의 결합을 타입으로 강제할 수 있다: 가상계좌 승인 응답을 처리하는 인터페이스가 (orderId, secret) 영속화를 반환하도록 강제하지 않으면 웹훅 검증 단계가 컴파일되지 않게 설계 가능(승인 시 secret 미저장이 가장 흔한 실수 경로)
- 10초/200 제약 때문에 핸들러 인터페이스는 '수신 확인'과 '비즈니스 처리'를 분리해야 한다: 라이브러리가 즉시 200을 반환하고 사용자 핸들러를 비동기 실행하는 구조(또는 최소한 타임아웃 경고)를 기본값으로 제공
- 중복 제거 인터페이스: 신형 이벤트는 body.eventId, 구형/DEPOSIT_CALLBACK은 tosspayments-webhook-transmission-id 헤더를 멱등성 키로 쓰는 통합 추상화(예: abstract isDuplicate(idempotencyKey): Promise<boolean>)가 필요 — 페이로드만 받는 파서로는 부족하고 헤더 접근이 필수이므로 파서 입력은 (rawBody, headers) 쌍이어야 한다. HMAC 검증도 rawBody 원문 문자열이 필요하므로 JSON.parse 이전의 원문 보존을 API 계약으로 강제해야 한다
- 서명 검증기는 payout.changed/seller.changed 전용으로만 제공 가능(HMAC-SHA256({payload}:{transmission-time}) vs 헤더 'v1:' 뒤 Base64 값 2개 중 하나 일치). 나머지 이벤트에는 verifySignature를 노출하면 안 되고(문서상 존재하지 않는 기능), 대신 IP 허용목록 검사 유틸(문서의 인바운드 IP 상수 내장)을 선택적 미들웨어로 제공
- PAYMENT_STATUS_CHANGED의 data 타입은 API 응답 Payment 타입을 그대로 재사용해야 이중 관리를 피한다. status는 웹훅에서 EXPIRED|DONE|ABORTED|CANCELED|PARTIAL_CANCELED로 좁혀지므로(전이 시에만 발송) 웹훅 쪽 타입은 Payment & { status: TerminalStatus }로 narrowing 가능
- 통합 테스트 전략은 '페이로드 시뮬레이션'을 기본으로 해야 한다: (1) 웹훅 등록 API가 없어 CI 자동화 불가, (2) localhost 등록 불가, (3) 테스트 발송 명시 문서 부재. 라이브러리는 이벤트별 공식 문서 예시 기반 fixture 생성기(예: createDepositCallbackFixture)를 테스트 유틸로 제공하고, 실수신 E2E는 ngrok+개발자센터 수동 등록+입금처리 버튼을 사용하는 별도 수동 시나리오로 문서화
- createdAt 파싱은 이벤트별 형식 차이(마이크로초 무오프셋 vs ±hh:mm 오프셋)를 모두 수용하는 관대한 파서로 구현하고, 타입은 string으로 두되 Date 변환 헬퍼를 별도 제공하는 편이 안전
- 가상계좌를 쓰는 사용자가 PAYMENT_STATUS_CHANGED와 DEPOSIT_CALLBACK을 동시에 구독하면 이중 수신되므로, 라이브러리 설정에서 둘 다 등록된 경우 경고하거나 가상계좌 이벤트의 단일 소스를 선택하게 하는 설계 필요

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/reference/using-api/webhook-events.md
- https://docs.tosspayments.com/guides/v2/webhook.md
- https://docs.tosspayments.com/guides/v2/get-started/environment.md
- https://docs.tosspayments.com/guides/v2/payment-window/integration-virtual-account.md
- https://docs.tosspayments.com/reference/using-api/security.md
- https://docs.tosspayments.com/reference.md

## customerKey 검증 규칙 확정 (최대 길이 50 vs 300, 특수문자 포함 조건의 해석)

50자 vs 300자 모순은 리서치 오류가 아니라 토스페이먼츠 문서 자체의 불일치다. 브라우저 SDK v2 문서(widgets/payment/brandpay 초기화)는 "최소 2자 이상 최대 50자 이하"를, API 레퍼런스(빌링키 발급·카드 빌링·자동결제 승인·Transaction 객체)와 빌링 API 가이드는 "최소 2자 이상 최대 300자 이하"를 명시한다. '특수문자 최소 1개' 문구는 두 곳 모두 "영문 대소문자, 숫자, 특수문자 -,_,=,.,@를(중) 최소 1개(를) 이상 포함"이라는 형태로, 문법상 '포함'의 목적어가 특수문자만이 아니라 나열된 전체 문자 집합이므로 허용 문자 집합의 나열로 읽히며, 특수문자 필수 조건이라고 단정할 근거는 문서 원문에 없다. 다만 서버가 실제로 무엇을 거부하는지는 문서에 없어 열린 질문으로 남는다.

### 연동 플로우

1. 클라이언트: customerKey를 UUID 등 무작위 고유 값으로 생성한다 (이메일·전화번호·자동증가 숫자 금지).
2. 결제위젯/결제창/브랜드페이 경로: TossPayments(clientKey).widgets({customerKey}) 등으로 초기화 — 이 경로의 문서상 규칙은 2~50자. 비회원은 TossPayments.ANONYMOUS 사용.
3. 빌링(자동결제) 결제창 경로: 결제창에서 카드 등록 후 successUrl로 authKey + customerKey가 쿼리 파라미터로 돌아온다.
4. 서버: POST /v1/billing/authorizations/issue 에 authKey + customerKey를 보내 billingKey를 발급받는다 — 이 경로의 문서상 규칙은 2~300자. billingKey는 customerKey와 매핑해 서버에 저장한다.
5. 서버: POST /v1/billing/{billingKey} 본문에 customerKey + 주문 정보를 넣어 자동결제를 승인한다. 발급 시의 customerKey와 매핑되지 않은 billingKey를 쓰면 NOT_MATCHES_CUSTOMER_KEY 에러: "customerKey와 매핑되지 않은 billingKey를 사용하면 발생합니다."

### 엔드포인트 / SDK 메서드

- **SDK** `TossPayments(clientKey).widgets({ customerKey })` — 결제위젯 초기화. customerKey 규칙의 '2~50자' 버전이 명시된 곳
  - customerKey: string — "영문 대소문자, 숫자, 특수문자 `-`, `_`, `=`, `.`, `@` 중 최소 1개를 포함하는 최소 2자 이상 최대 50자 이하의 문자열이어야 합니다." (sdk/v2/js.md verbatim)
  - customerKey: TossPayments.ANONYMOUS — 비회원 결제 시 customerKey 대신 사용
- **SDK** `TossPayments(clientKey).payment({ customerKey })` — 결제창 초기화. widgets와 동일한 2~50자 규칙 문구가 그대로 반복됨
  - customerKey: string — widgets와 동일 문구 (2~50자)
- **SDK** `TossPayments(clientKey).brandpay({ customerKey })` — 브랜드페이 초기화. 역시 동일한 2~50자 규칙 문구
  - customerKey: string — widgets와 동일 문구 (2~50자)
- **POST** `/v1/billing/authorizations/issue` — authKey로 빌링키 발급. customerKey 규칙의 '2~300자' 버전이 명시된 곳
  - authKey: string — 결제창 리다이렉트로 받은 인증 키
  - customerKey: string — "영문 대소문자, 숫자, 특수문자 `-`, `_`, `=`, `.`, `@`를 최소 1개 이상 포함한 최소 2자 이상 최대 300자 이하의 문자열이어야 합니다." (reference.md verbatim)
- **POST** `/v1/billing/authorizations/card` — 카드 정보로 직접 빌링키 발급 (API-only 방식). customerKey 정의는 issue와 동일 (2~300자)
  - customerKey: string — 2~300자 규칙 동일 문구
- **POST** `/v1/billing/{billingKey}` — 빌링키로 자동결제 승인. 요청 본문에 customerKey 필수, 빌링키와 매핑 불일치 시 NOT_MATCHES_CUSTOMER_KEY
  - customerKey: string — 2~300자 규칙 동일 문구
  - billingKey: string (path) — customerKey와 매핑된 빌링키여야 함

### 제약/규칙 (문서 명시)

- [SDK v2 verbatim — widgets/payment/brandpay 공통] "구매자를 식별하는 고유 아이디입니다. 이메일・전화번호나 자동 증가하는 숫자와 같이 유추가 가능한 값은 안전하지 않아요. UUID와 같이 충분히 무작위적인 고유 값으로 생성해주세요. 영문 대소문자, 숫자, 특수문자 `-`, `_`, `=`, `.`, `@` 중 최소 1개를 포함하는 최소 2자 이상 최대 50자 이하의 문자열이어야 합니다."
- [API 레퍼런스 verbatim — /v1/billing/authorizations/issue, /v1/billing/authorizations/card, /v1/billing/{billingKey}, Transaction 객체 공통] "영문 대소문자, 숫자, 특수문자 `-`, `_`, `=`, `.`, `@`를 최소 1개 이상 포함한 최소 2자 이상 최대 300자 이하의 문자열이어야 합니다." — guides/v2/billing/integration-api.md도 이 300자 문구를 그대로 반복함
- 허용 문자 집합은 양쪽 문서가 완전히 일치: 영문 대소문자, 숫자, 특수문자 -, _, =, ., @ (이 외 문자는 언급 없음)
- 최소 길이는 양쪽 모두 2자로 일치
- 비회원 위젯 결제는 customerKey 대신 TossPayments.ANONYMOUS 상수를 사용
- 자동결제 승인 시 customerKey는 빌링키 발급 시 사용한 값과 매핑되어야 하며, 불일치 시 NOT_MATCHES_CUSTOMER_KEY 에러 발생 (verbatim: "customerKey와 매핑되지 않은 billingKey를 사용하면 발생합니다.")
- guides/v2/billing/integration.md(결제창 방식 가이드)와 guides/v2/payment-widget/integration-window.md에는 자체 길이/문자 규칙이 없고 레퍼런스 링크로만 위임함 — 규칙의 출처는 sdk/v2/js.md(50자)와 reference.md(300자) 두 곳뿐

### 주의점 / 열린 질문

- [모순 확정] 50자 vs 300자는 문서 자체의 불일치다. 브라우저 SDK 문서는 일관되게 '최대 50자', API 레퍼런스와 빌링 API 가이드는 일관되게 '최대 300자'. 어느 쪽이 오기(誤記)인지, 서버가 실제로 몇 자에서 거부하는지는 문서에 없다 — 열린 질문
- [특수문자 해석] 양쪽 문구 모두 '영문 대소문자, 숫자, 특수문자 -,_,=,.,@'를 하나의 나열로 묶고 그 뒤에 '중 최소 1개를 포함하는'(SDK) / '를 최소 1개 이상 포함한'(API)이 붙는다. 문법상 '포함'의 대상은 특수문자만이 아니라 나열 전체이므로, '이 집합의 문자를 최소 1개 이상 포함' = 사실상 허용 문자 집합 설명으로 읽힌다. '특수문자를 반드시 1개 포함해야 한다'고 명시한 문장은 어디에도 없다. 단, 토스가 의도한 뜻이 후자일 가능성을 문서만으로 완전히 배제할 수는 없다 — 열린 질문
- [허용 집합의 배타성] 두 문구 모두 나열된 문자 '이외의 문자는 금지'라고 명시적으로 쓰지는 않았다. 나열이 허용 집합 전체를 뜻한다는 것이 자연스러운 독해이지만, 예컨대 한글이나 공백이 서버에서 실제 거부되는지는 문서상 미확인
- reference.md 전문에서 NOT_MATCHES_CUSTOMER_KEY 에러 설명을 찾지 못했다(가이드 문서에만 등장). 레퍼런스가 매우 커서 변환/요약 과정에서 누락됐을 가능성도 있음
- SDK 문구는 '중 최소 1개를 포함하는', API 문구는 '를 최소 1개 이상 포함한'으로 조사만 다르고 구조는 동일 — 두 문서가 같은 원문을 다르게 다듬은 흔적으로 보이며, 길이 숫자만 갈라진다

### 라이브러리 설계 시사점

- 단일 브랜디드 타입 CustomerKey의 런타임 validator는 문서상 교집합인 '2자 이상 50자 이하 + 허용 문자 [A-Za-z0-9\-_=.@]'로 잡는 것이 안전하다. 50자 이하 키는 300자 규칙도 자동 만족하므로 위젯·빌링키 발급·자동결제 승인 전 구간에서 유효하다
- 50자 초과 ~300자 이하 키는 '서버 API 경로에서만 문서상 유효'하다. 라이브러리가 API-only 빌링(POST /v1/billing/authorizations/card)을 지원한다면, 기본 validator(≤50)와 별도로 ServerOnlyCustomerKey(≤300) 같은 확장 타입을 두거나, 옵션 플래그로 완화하되 '이 키는 브라우저 SDK에 넘길 수 없음'을 타입 수준에서 분리하는 설계가 문서와 정합적이다
- 특수문자 필수 검증은 넣지 말 것을 권장: 문서 원문은 허용 집합 나열로 읽히므로, '특수문자 1개 필수'로 구현하면 순수 영숫자 키(예: 'abc123')를 문서상 근거 없이 거부하게 된다. 정 불안하면 reject가 아니라 warning 수준으로 처리하고, 실 서버 동작 테스트(테스트 키로 순수 영숫자 customerKey 발급 시도) 후 확정하라
- charset validator는 ^[A-Za-z0-9\-_=.@]{2,50}$ (기본) / {2,300} (서버 전용) 정규식으로 표현 가능. 단 '집합 외 문자 금지'가 명시 규칙이 아님을 주석으로 남길 것
- 위젯 초기화 파라미터 타입은 CustomerKey | typeof TossPayments.ANONYMOUS 유니온으로 모델링해야 한다. ANONYMOUS는 빌링 경로에는 등장하지 않으므로 빌링 관련 인터페이스에서는 배제할 것
- NOT_MATCHES_CUSTOMER_KEY는 형식 검증으로 막을 수 없는 페어링 불변식이다. 빌링키 발급 결과를 {billingKey, customerKey} 묶음 객체(브랜디드 페어)로만 반환하고, 자동결제 승인 메서드가 이 묶음 객체만 받도록 강제하면 타입 수준에서 불일치 호출을 차단할 수 있다 — '검증 단계를 인터페이스로 강제'하는 이 라이브러리의 목적에 정확히 부합
- validator의 에러 메시지에 두 문서의 길이 불일치(SDK 50 vs API 300)를 근거 URL과 함께 남겨두면, 추후 토스가 문서를 정정했을 때 추적이 쉽다

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/sdk/v2/js.md
- https://docs.tosspayments.com/reference.md
- https://docs.tosspayments.com/guides/v2/billing/integration.md
- https://docs.tosspayments.com/guides/v2/billing/integration-api.md
- https://docs.tosspayments.com/guides/v2/payment-widget/integration-window.md

## 취소(환불) 가능한 Payment.status 집합과 취소 거절 에러의 공식 매핑 (누락 보강 조사)

토스페이먼츠 V2 문서에는 "취소 가능한 status" 목록이 명시적으로 열거되어 있지 않으나, 상태 흐름도(webhook-events)와 상태 설명을 조합하면 DONE(전액/부분), WAITING_FOR_DEPOSIT(입금 전, 전액만), 그리고 부분 취소 반복이 명시적으로 허용되므로 PARTIAL_CANCELED에서 추가 취소가 가능함이 확인된다. 취소 API(POST /v1/payments/{paymentKey}/cancel)의 공식 엔드포인트별 에러 표(30개, HTML 페이지에서만 렌더링됨)를 전량 확보했는데, 중요한 발견은 INVALID_REFUND_AMOUNT(400)가 이 표에 없고 전체 에러 목록에만 존재한다는 점이다. 금액 관련 거절은 NOT_CANCELABLE_AMOUNT(403, "취소 할 수 없는 금액"), refundableAmount 파라미터 불일치는 NOT_MATCHES_REFUNDABLE_AMOUNT(400, "잔액 결과가 일치하지 않습니다")로 문서화되어 있다. 다만 "cancelAmount > balanceAmount일 때 정확히 어떤 코드가 반환되는가"는 문서 어디에도 조건 문장으로 명시되어 있지 않아 열린 질문으로 남는다.

### 연동 플로우

1. 취소 전 결제 조회 또는 저장된 Payment로 status와 balanceAmount를 확인한다. 문서상 취소가 성립하는 상태: DONE(전액/부분), WAITING_FOR_DEPOSIT(전액만 — '입금 전에는 부분 취소를 할 수 없고 전체 금액 취소만 할 수 있습니다'), PARTIAL_CANCELED(부분 취소 반복이 명시적으로 허용되므로 잔액이 남아 있으면 추가 취소 가능).
2. 부분 취소면 cancelAmount를 지정한다(생략 시 전액 취소). cancelAmount는 balanceAmount('취소할 수 있는 금액(잔고)')를 넘을 수 없다.
3. 가상계좌 + 입금 완료 결제라면 refundReceiveAccount(bank, accountNumber, holderName)를 반드시 포함한다. 입금 전이면 포함하지 않는다(환불할 금액이 없으므로).
4. 안전 장치로 Idempotency-Key 헤더와 refundableAmount 파라미터를 함께 보낸다. 서버 잔액과 refundableAmount가 다르면 취소를 처리하지 않고 에러(NOT_MATCHES_REFUNDABLE_AMOUNT 400)를 반환한다 — 낙관적 동시성 제어.
5. POST /v1/payments/{paymentKey}/cancel 호출. 성공 시 Payment.cancels 배열에 Cancel 객체가 추가되고(각각 고유 transactionKey), status가 CANCELED 또는 PARTIAL_CANCELED로 전환된다.
6. 국내 결제는 cancelStatus가 즉시 DONE. 해외 간편결제(PayPal)는 cancelStatus가 IN_PROGRESS로 시작해 CANCEL_STATUS_CHANGED 웹훅으로 DONE/ABORTED가 통지되는 비동기 흐름이다.
7. 실패 시 HTTP 상태 코드 + 에러 객체(code, message)가 돌아온다. 취소 API 공식 에러 표(아래 constraints/gotchas)로 매핑한다.

### 엔드포인트 / SDK 메서드

- **POST** `/v1/payments/{paymentKey}/cancel` — 승인된 결제를 취소(전액/부분). 성공 시 Payment 객체의 cancels 배열에 Cancel 객체가 돌아옴
  - cancelReason (string, 필수, 최대 200자)
  - cancelAmount (integer, 선택 — 값이 없으면 전액 취소, 값이 있으면 부분 취소)
  - refundReceiveAccount (object, 가상계좌 결제에만 필수 — bank(은행코드), accountNumber(최대 20자, '-' 없이 숫자만), holderName(최대 60자). 입금 전 취소 시에는 불필요)
  - taxFreeAmount (integer, 선택, 기본값 0 — 면세/복합과세 상점에만 적용)
  - currency (string, 선택 — 승인된 통화와 동일해야 함. 일반결제 KRW/USD/JPY, PayPal은 USD만)
  - refundableAmount (integer, 선택 — 서버의 환불 가능 잔액과 다르면 취소를 처리하지 않고 에러 반환. 안전 장치)
  - Idempotency-Key 헤더 (권장 — '멱등키를 요청 헤더에 추가하면 중복 취소 없이 안전하게 처리됩니다')
- **GET(참조)** `/reference#payment-객체 — Payment.status 필드` — status enum 전체: READY, IN_PROGRESS, WAITING_FOR_DEPOSIT, DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED. balanceAmount = '취소할 수 있는 금액(잔고)입니다. 이 값은 결제 취소나 부분 취소가 되고 나서 남은 값입니다.'
  - status.CANCELED 설명: '승인된 결제가 취소된 상태입니다. 가상계좌 입금 전에 결제가 취소된 경우도 이 상태로 전환됩니다.'
  - status.PARTIAL_CANCELED 설명: '승인된 결제가 부분 취소된 상태입니다.'
  - cancels[] Cancel 객체: cancelAmount, cancelReason, taxFreeAmount, taxExemptionAmount, refundableAmount(취소 후 환불 가능 잔액), cardDiscountAmount, transferDiscountAmount, easyPayDiscountAmount, canceledAt(ISO 8601), transactionKey(취소 건 구분 키, 최대 64자), receiptKey(nullable), cancelStatus('DONE'이면 취소 성공), cancelRequestId(비동기 결제 전용, nullable)
- **WEBHOOK** `PAYMENT_STATUS_CHANGED / CANCEL_STATUS_CHANGED` — 상태 흐름도 근거. 일반 결제: DONE →(결제 취소)→ CANCELED, DONE →(결제 부분 취소)→ PARTIAL_CANCELED. 가상계좌: WAITING_FOR_DEPOSIT →(입금 전 취소)→ CANCELED, DONE →(취소/부분 취소)→ CANCELED/PARTIAL_CANCELED. CANCEL_STATUS_CHANGED는 해외 간편결제 전용: cancelStatus IN_PROGRESS →(취소 성공)→ DONE, →(취소 실패)→ ABORTED. 일반 국내 결제에는 이 웹훅이 발송되지 않음
  - 입금 오류 시 DONE → WAITING_FOR_DEPOSIT로 되돌아갈 수 있음(v1.5+, v1.4까지는 DONE → CANCELED)

### 제약/규칙 (문서 명시)

- cancelReason은 필수, 최대 200자
- cancelAmount 생략 시 전액 취소 ('값이 없으면 전액 취소됩니다')
- balanceAmount = '취소할 수 있는 금액(잔고). 결제 취소나 부분 취소가 되고 나서 남은 값' — 취소 가능액의 공식 정의
- 가상계좌 입금 전(WAITING_FOR_DEPOSIT)에는 부분 취소 불가, 전액 취소만 가능. 위반 시 NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT (403, '입금 대기중인 결제는 부분 환불이 불가합니다')
- 가상계좌 입금 완료 후 취소에는 refundReceiveAccount 필수, 계좌 유효성 검사 수행, 환불은 취소일+2영업일
- refundableAmount 파라미터를 보내면 서버 잔액과 불일치 시 취소 미처리 + 에러 → 공식 표의 NOT_MATCHES_REFUNDABLE_AMOUNT (400, '잔액 결과가 일치하지 않습니다')
- currency는 승인된 통화와 동일해야 함
- 과세 제외 금액(taxExemptionAmount)이 있는 카드 결제는 부분 취소 불가
- 에스크로(배송 정보 등록됨), 현금 카드 결제는 부분 환불 불가 → NOT_ALLOWED_PARTIAL_REFUND (403)
- 즉시할인금액보다 적은 금액의 부분취소 불가 → EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT (400)
- 이미 취소된 결제 재취소 → ALREADY_CANCELED_PAYMENT (400, '이미 취소된 결제 입니다')
- 취소 기한(결제수단별): 카드 기한 없음(단 1년 초과 시 카드사 보관 기간 문제로 실패 가능), 계좌이체 180일, 가상계좌 보통 365일(상점 설정에 따라 다름), 휴대폰 결제 당월만, PayPal 180일. 기한 경과 → EXCEED_MAX_REFUND_DUE (403, '환불 가능한 기간이 지났습니다')
- 취소 API 공식 에러 표(HTML의 '결제 취소' 섹션, 30개 전량): 400 = ALREADY_CANCELED_PAYMENT, INVALID_REFUND_ACCOUNT_INFO, EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT, INVALID_REQUEST, INVALID_REFUND_ACCOUNT_NUMBER, INVALID_BANK, NOT_MATCHES_REFUNDABLE_AMOUNT, PROVIDER_ERROR, REFUND_REJECTED, ALREADY_REFUND_PAYMENT, FORBIDDEN_BANK_REFUND_REQUEST / 401 = UNAUTHORIZED_KEY / 403 = NOT_CANCELABLE_AMOUNT, FORBIDDEN_CONSECUTIVE_REQUEST, FORBIDDEN_REQUEST, NOT_CANCELABLE_PAYMENT, EXCEED_MAX_REFUND_DUE, NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT, NOT_ALLOWED_PARTIAL_REFUND, NOT_AVAILABLE_BANK, INCORRECT_BASIC_AUTH_FORMAT, NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER, EXCEED_CANCEL_LIMIT / 404 = NOT_FOUND_PAYMENT / 500 = FAILED_INTERNAL_SYSTEM_PROCESSING, FAILED_REFUND_PROCESS, FAILED_METHOD_HANDLING_CANCEL, FAILED_PARTIAL_REFUND, COMMON_ERROR, FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING
- NOT_CANCELABLE_PAYMENT (403) 메시지: '취소 할 수 없는 결제 입니다' — 발생 조건은 메시지 외 문서화 없음
- NOT_CANCELABLE_AMOUNT (403) 메시지: '취소 할 수 없는 금액 입니다' — 금액 수준 거절이며 취소 API 공식 표에 포함됨

### 주의점 / 열린 질문

- [핵심 발견] INVALID_REFUND_AMOUNT(400, '잘못된 환불 금액입니다')는 '전체 에러 목록'에만 있고, 취소 API의 엔드포인트별 공식 에러 표(30개)에는 없다. HTML 원문을 파싱해 확인했다(EXCEED_MAX_REFUND_AMOUNT, NOT_SUPPORTED_REFUND, NOT_ALLOWED_REFUND_BANK도 취소 표에 없음). 즉 문서 기준으로 취소 API의 금액 거절 코드는 NOT_CANCELABLE_AMOUNT(403)이며, INVALID_REFUND_AMOUNT를 취소 API의 1차 매핑 대상으로 삼는 것은 문서 근거가 없다.
- [열린 질문] cancelAmount > balanceAmount일 때 정확히 어떤 코드가 반환되는지 문서에 조건 문장이 없다. 메시지 의미상 NOT_CANCELABLE_AMOUNT(403)가 유력하지만 공식 확인 불가 — 실제 테스트 결제로 검증 필요. 방어적으로 NOT_CANCELABLE_AMOUNT와 INVALID_REFUND_AMOUNT 둘 다 '금액 초과' 계열로 매핑하는 것이 안전.
- [열린 질문] '취소 가능한 status'의 공식 열거가 문서에 없다. 취소 API 설명은 '승인된 결제를 취소합니다'뿐이고, 상태 흐름도에는 DONE → CANCELED/PARTIAL_CANCELED, WAITING_FOR_DEPOSIT → CANCELED(입금 전 취소) 엣지만 그려져 있다. PARTIAL_CANCELED → (추가 취소) 엣지는 흐름도에 없지만 '부분 취소를 여러 번 하면 cancels에 취소 객체가 여러 개 돌아옵니다'라는 문장이 반복 취소를 명시적으로 지지한다. READY/IN_PROGRESS/ABORTED/EXPIRED의 취소 가능 여부는 언급 자체가 없다(승인 전이므로 취소 대상 아님으로 해석되나 명시 없음).
- [문서 표기 주의] 에러 코드 페이지의 .md 익스포트(reference/error-codes.md)에서는 엔드포인트별 섹션('결제 취소' 등)의 표가 전부 비어서 렌더링된다. 엔드포인트별 매핑은 HTML 페이지에서만 확인 가능하다. 자동화 파이프라인이 .md만 읽으면 이 매핑을 놓친다.
- [문서 예시 모순] cancel-payment 가이드 Case 1(가상계좌 환불) 예시 응답이 totalAmount 10000 전액 취소(cancelAmount 10000, balanceAmount 0)인데 status가 'PARTIAL_CANCELED'로 표기되어 있다. 전액 취소 예시(카드)는 status 'CANCELED'다. 예시 오류이거나 특수 케이스인지 불명 — 라이브러리가 '전액 취소 후 status는 반드시 CANCELED'라고 단정하면 안 되는 근거.
- NOT_MATCHES_REFUNDABLE_AMOUNT(400)는 요청 파라미터 refundableAmount와 서버 잔액의 불일치 검사용이며, cancelAmount 초과와는 다른 에러다. 둘을 혼동하면 오분류.
- PROVIDER_ERROR는 HTTP 400인데 메시지는 '일시적인 오류... 다시 시도해주세요'로 재시도 가능 오류다. 400=비재시도라는 통념이 깨지는 케이스.
- EXCEED_MAX_REFUND_AMOUNT(403, 하루/한달 환불 한도 초과)는 전체 목록에만 있고 취소 표에는 대신 EXCEED_CANCEL_LIMIT(403, '취소 한도 금액을 초과 하였습니다')가 있다. 사전 리서치의 EXCEED_MAX_REFUND_DUE 메시지도 취소 표에서는 '환불 가능한 기간이 지났습니다'로 전체 목록('초과했습니다')과 자구가 약간 다르다.
- 해외 간편결제(PayPal)는 취소가 비동기다: cancelStatus IN_PROGRESS → DONE/ABORTED, CANCEL_STATUS_CHANGED 웹훅으로 통지. 국내 결제는 이 웹훅이 발송되지 않고 즉시 DONE. 취소=동기 성공으로 모델링하면 PayPal에서 깨진다.
- 입금 오류 시 DONE → WAITING_FOR_DEPOSIT로 역전이가 있다(v1.5+). 상태 기계를 단방향으로 모델링하면 안 됨.
- ALREADY_REFUND_PAYMENT(400, '이미 환불된 결제입니다')가 ALREADY_CANCELED_PAYMENT와 별도로 존재한다. 발생 조건 구분은 문서화 없음(열린 질문).
- 휴면 회원 결제는 NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER(403)라는 별도 코드로 거절된다 — NOT_CANCELABLE_PAYMENT의 하위 케이스가 코드로 분리된 예.

### 라이브러리 설계 시사점

- 취소 가능 status 사전 검증(사전 가드): CancelablePayment 타입을 DONE | PARTIAL_CANCELED | WAITING_FOR_DEPOSIT으로 좁히되, WAITING_FOR_DEPOSIT은 전액 취소 전용 타입(cancelAmount 지정 불가)으로 분리하면 NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT을 컴파일 타임에 차단할 수 있다. 이 집합은 문서의 흐름도+서술 조합에서 도출된 것이므로 라이브러리 문서에 근거(비공식 열거임)를 명시할 것.
- 금액 검증: cancelAmount <= balanceAmount 사전 체크는 balanceAmount의 공식 정의('취소할 수 있는 금액(잔고)')에 직접 근거한다. 다만 위반 시 서버 코드가 미문서화이므로, 에러 매퍼는 NOT_CANCELABLE_AMOUNT(403)와 INVALID_REFUND_AMOUNT(400)를 모두 'AmountExceedsBalance' 계열로 수용하는 관대한 매핑이 필요하다.
- 동시성 안전 취소를 추상 클래스로 강제하기 좋은 공식 근거가 있다: refundableAmount 파라미터(불일치 시 미처리+에러)와 Idempotency-Key 헤더('안전하게 취소하려면 멱등키와 함께 사용해주세요'). safeCancel()이 이 둘을 필수로 받게 설계하면 문서 권장 패턴이 타입으로 강제된다. NOT_MATCHES_REFUNDABLE_AMOUNT(400)는 ConcurrentModification 계열로 별도 매핑할 것.
- 에러 매핑 테이블은 '취소 API 엔드포인트별 공식 표 30개'를 1차 소스로 삼아야 한다(전체 목록 기반 매핑은 취소 API에서 실제로 안 나오는 코드까지 포함해 오분류 위험). 분류 제안: (a) 상태 위반 = ALREADY_CANCELED_PAYMENT, ALREADY_REFUND_PAYMENT, NOT_CANCELABLE_PAYMENT, NOT_CANCELABLE_PAYMENT_FOR_DORMANT_USER (b) 금액 위반 = NOT_CANCELABLE_AMOUNT, EXCEED_CANCEL_AMOUNT_DISCOUNT_AMOUNT, EXCEED_CANCEL_LIMIT (c) 부분취소 불가 = NOT_ALLOWED_PARTIAL_REFUND, NOT_ALLOWED_PARTIAL_REFUND_WAITING_DEPOSIT (d) 기한 = EXCEED_MAX_REFUND_DUE (e) 계좌 = INVALID_REFUND_ACCOUNT_INFO, INVALID_REFUND_ACCOUNT_NUMBER, INVALID_BANK, FORBIDDEN_BANK_REFUND_REQUEST, NOT_AVAILABLE_BANK (f) 동시성/중복 = NOT_MATCHES_REFUNDABLE_AMOUNT, FORBIDDEN_CONSECUTIVE_REQUEST (g) 재시도 가능 = 500 전부 + PROVIDER_ERROR(400이지만 일시 오류) (h) 인증/조회 = UNAUTHORIZED_KEY, INCORRECT_BASIC_AUTH_FORMAT, NOT_FOUND_PAYMENT, FORBIDDEN_REQUEST, INVALID_REQUEST.
- HTTP 상태 코드로 재시도 여부를 판정하지 말 것: PROVIDER_ERROR(400)가 일시 오류이고, REFUND_REJECTED(400)는 결제사 거절(비재시도)이다. 코드 이름 기반 판정이 필수.
- 취소 결과 타입: 전액 취소 후 status가 항상 CANCELED라고 단정하는 타입(예: status: 'CANCELED' 리터럴)은 위험하다 — 공식 가이드 예시에 전액 취소인데 PARTIAL_CANCELED인 응답이 존재한다. CANCELED | PARTIAL_CANCELED 유니언 + balanceAmount === 0 여부로 '완전 취소'를 판정하는 것이 문서와 정합적.
- 비동기 취소 모델: cancelStatus('DONE' | 'IN_PROGRESS' | 'ABORTED')와 cancelRequestId(비동기 전용)를 타입에 포함하고, PayPal 등 해외 간편결제 경로에서는 CANCEL_STATUS_CHANGED 웹훅 수신까지 취소 확정을 보류하는 상태를 표현해야 한다.
- 가상계좌 분기 타입: 입금 완료(DONE) 취소 → refundReceiveAccount 필수, 입금 전(WAITING_FOR_DEPOSIT) 취소 → refundReceiveAccount 금지 + 전액만. 판별 유니언으로 표현하면 두 규칙 모두 컴파일 타임 강제 가능.
- 취소 기한 사전 검증(계좌이체 180일, 휴대폰 당월 등)은 결제수단(method)별로 다르므로 method 판별 유니언에 기한 정책을 붙일 수 있으나, '상점마다 설정이 다를 수 있음'(가상계좌)이라 하드코딩 대신 정책 주입(설정 가능)으로 설계하고 서버의 EXCEED_MAX_REFUND_DUE를 최종 판정으로 삼아야 한다.
- 부분 취소 반복: 각 취소 건은 고유 transactionKey를 가지므로, 라이브러리는 취소 이력을 cancels 배열 기준으로 추적하고 마지막 Cancel.refundableAmount(취소 후 잔액)를 다음 취소의 사전 검증 입력으로 쓸 수 있다.

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/cancel-payment.md
- https://docs.tosspayments.com/reference.md
- https://docs.tosspayments.com/reference/error-codes.md
- https://docs.tosspayments.com/reference/error-codes
- https://docs.tosspayments.com/reference/using-api/webhook-events.md

## 누락 보강: requestBillingAuth 퀵계좌이체(TRANSFER) 빌링키 발급 상세 (guides/v2/billing/integration-quick.md)

integration-quick.md에서 requestBillingAuth의 method: "TRANSFER"가 명시적으로 확인되었고, SDK 레퍼런스(sdk/v2/js.md)의 method enum은 CARD와 TRANSFER 두 값을 지원한다. 발급 플로우 자체는 카드 경로와 동일하게 successUrl 리다이렉트로 authKey(최대 300자, 일회성)와 customerKey를 받아 POST /v1/billing/authorizations/issue를 호출하는 구조이며, 엔드포인트 차이는 없다. 차이는 발급 응답(Billing 객체)의 형태로, TRANSFER 경로는 method: "계좌이체"에 transfers 배열([{bankName, bankAccountNumber(마스킹)}])이 채워지고 card와 easyPay는 null이며, 카드 경로는 method: "카드"에 card 객체가 채워지고 transfers는 null이다. authKey의 유효기간(만료 시간)은 integration-quick.md에도 명시가 없어 '최대 300자, 일회용'만 계약으로 삼는 보수적 설계가 타당하다. 테스트 환경은 문서에 개별 연동용 테스트 키 쌍이 제공되어 계약 전 테스트가 가능하다고 명시되어 있다.

### 연동 플로우

1. TossPayments(clientKey)로 SDK 초기화 후 tossPayments.payment({ customerKey })로 Payment 인스턴스를 만든다.
2. payment.requestBillingAuth({ method: "TRANSFER", successUrl, failUrl, customerEmail, customerName })를 호출해 퀵계좌이체 계좌 인증창을 띄운다 (카드 경로와의 유일한 SDK 레벨 차이는 method 값).
3. 사용자가 계좌 인증을 완료하면 successUrl로 리다이렉트되며 쿼리 파라미터로 customerKey와 authKey(최대 300자, 일회성)가 전달된다. 실패 시 failUrl로 code, message가 전달된다.
4. 서버에서 Basic 인증(base64("{시크릿키}:"))으로 POST /v1/billing/authorizations/issue에 { authKey, customerKey }를 보내 빌링키를 발급받는다 — 엔드포인트는 카드 경로와 완전히 동일하다.
5. 응답 Billing 객체를 저장한다. TRANSFER 경로 응답: method: "계좌이체", transfers: [{bankName, bankAccountNumber(마스킹)}], card: null, easyPay: null. (카드 경로는 method: "카드", card 객체 채워짐, transfers: null.) 한 번 발급된 빌링키는 다시 조회할 수 없으므로 반드시 이 시점에 저장해야 한다.
6. 결제 시점마다 POST /v1/billing/{billingKey}에 { customerKey, amount, orderId, orderName, ... }를 보내 자동결제를 승인한다. 반복 스케줄링은 토스페이먼츠가 제공하지 않으므로 자체 구현한다.

### 엔드포인트 / SDK 메서드

- **SDK** `TossPayments(clientKey).payment({customerKey})` — 빌링 인증 요청을 위한 Payment 인스턴스 생성 (customerKey 필수)
  - clientKey: string
  - customerKey: string (2~300자, 영대소문자/숫자/-_=.@, 특수문자 1개 이상, 추측 불가능한 값 권장)
- **SDK** `payment.requestBillingAuth(billingAuthRequest)` — 자동결제(빌링) 등록 인증창 호출. TRANSFER면 퀵계좌이체 계좌 인증, CARD면 카드 등록. 성공 시 successUrl로 authKey+customerKey 쿼리 파라미터 리다이렉트. 반환값은 Promise<void> (리다이렉트 기반)
  - method: enum 'CARD' | 'TRANSFER' (필수)
  - successUrl: string (필수, origin 포함; authKey·customerKey 쿼리 파라미터 부착됨)
  - failUrl: string (필수, origin 포함; code·message 쿼리 파라미터 부착됨)
  - customerName: string (선택, 최대 100자)
  - customerEmail: string (선택, 최대 100자)
  - windowTarget: enum 'self'(모바일 기본) | 'iframe'(PC 기본, 모바일 미지원) (선택)
  - selectableCardTypes: array of 'PERSONAL' | 'CORPORATE' (선택, 카드 경로용)
- **POST** `/v1/billing/authorizations/issue` — authKey를 빌링키로 교환 (카드/퀵계좌이체 공통 엔드포인트). Basic 인증: base64('{SECRET_KEY}:')
  - authKey: string (필수, 최대 300자, 일회성 인증 키)
  - customerKey: string (필수, 2~300자)
  - 응답 Billing 객체: mId(최대 14자), customerKey, authenticatedAt(ISO 8601), method('카드' | '계좌이체'), billingKey(최대 200자), card{issuerCode, acquirerCode, number(마스킹), cardType('신용'|'체크'|'기프트'), ownerType('개인'|'법인')} | null, transfers[{bankName, bankAccountNumber(마스킹)}] | null, easyPay | null
  - deprecated(v2024-06-01): cardCompany→card.issuerCode, cardNumber→card.number
- **POST** `/v1/billing/{billingKey}` — 발급된 빌링키로 자동결제 승인 실행 (스케줄링은 자체 구현 필요)
  - billingKey: path (필수)
  - customerKey: string (필수, 빌링키 발급 시와 동일해야 함)
  - amount: number (필수)
  - orderId: string (필수, 6~64자, 영숫자/-/_)
  - orderName: string (필수, 1~100자)
  - customerEmail: string (선택, 최대 100자)
  - customerName: string (선택, 최대 100자)
  - customerIp: string (선택, FDS용)
  - taxFreeAmount: number (선택, 기본 0)
  - taxExemptionAmount: number (선택)

### 제약/규칙 (문서 명시)

- requestBillingAuth의 method는 필수이며 enum 값은 'CARD'와 'TRANSFER' 두 가지 (퀵계좌이체 = 'TRANSFER')
- successUrl/failUrl은 필수이고 origin을 포함해야 함; 성공 시 authKey·customerKey, 실패 시 code·message 쿼리 파라미터가 부착됨
- authKey: 최대 300자, 일회성(빌링키 발급에 한 번만 사용) — 유효기간(만료 시각)은 어느 문서에도 명시 없음
- customerKey: 2~300자, 영대소문자/숫자/-_=.@ 허용, 허용 특수문자 1개 이상 포함, UUID 수준의 추측 불가능한 값 요구; 빌링키 발급·승인 시 동일 값이어야 함
- billingKey: 최대 200자; 한 번 발급되면 재조회 불가('한 번 발급된 빌링키는 다시 조회할 수 없습니다'); 문서상 만료 기간 명시 없음
- 빌링키 발급과 자동결제 승인은 Basic 인증(base64('{SECRET_KEY}:')) 필요 — 서버 사이드 전용
- 자동결제는 리스크 검토 및 추가 계약 후 사용 가능(구독형 서비스 한정)하나, 계약 전에도 문서 제공 테스트 키(개별 연동 키)로 테스트 가능
- 자동결제 승인: orderId 6~64자(영숫자/-/_), orderName 1~100자, amount 필수; 반복 실행 스케줄러는 미제공(자체 구현)
- windowTarget: 'iframe'은 PC 기본이며 모바일에서는 미지원('self'만)
- customerName/customerEmail 각 최대 100자
- v2024-06-01부터 응답의 cardCompany/cardNumber는 deprecated — card.issuerCode/card.number 사용

### 주의점 / 열린 질문

- 문서 간 모순: 카드 빌링 문서(guides/v2/billing/integration.md)의 코드 주석은 'method: "CARD", // 자동결제(빌링)는 카드만 지원합니다'라고 말하지만, integration-quick.md는 method: "TRANSFER"를 명시 — 주석이 오래된 것으로 보이며 실제로는 두 값 모두 유효
- authKey 유효기간은 integration-quick.md, integration.md, reference.md 어디에도 명시 없음(최대 300자·일회용만 명시) — 재확인 결과 확정. 만료를 가정하지 않는 보수적 설계 근거 확보
- Billing 응답의 transfers는 integration-quick.md 예시 JSON에서 객체의 '배열'([{bankName, bankAccountNumber}])로 확인됨 — 단일 객체로 타입 정의하면 안 됨
- 혼동 주의: 빌링키 발급 응답의 'transfers'(배열, bankName/bankAccountNumber)와 자동결제 '승인' 응답(Payment 객체)의 'transfer'(단수, bankCode/settlementStatus 포함)는 서로 다른 필드
- 응답 method 필드 값이 한국어 문자열('카드', '계좌이체')임 — SDK 요청의 영문 enum(CARD/TRANSFER)과 비대칭이므로 매핑 필요
- 테스트 환경: 계약 전 개별 연동용 테스트 키로 테스트 가능하다고 명시되어 있으나, 퀵계좌이체 계좌 인증창이 테스트 모드에서 실제와 동일하게 동작하는지에 대한 명시적 서술은 없음(열린 질문)
- 빌링키 삭제/해지 엔드포인트(DELETE /v1/billing/{billingKey} 류)는 이번에 읽은 페이지들에서 원문으로 확정하지 못함 — 열린 질문(브랜드페이 빌링과 혼동 가능성 있음)
- requestBillingAuth 자체의 에러 코드 목록은 SDK 문서 추출분에 없었음 — 실패는 failUrl의 code/message 쿼리 파라미터로 전달된다는 것만 확인
- selectableCardTypes는 카드 등록용 파라미터로 보이나 TRANSFER 경로에서 전달 시 동작(무시 여부)은 문서에 명시 없음(열린 질문)

### 라이브러리 설계 시사점

- BillingAuthMethod 타입은 'CARD' | 'TRANSFER' 유니온으로 확정 정의 가능 — 계좌이체 enum 값이 더 이상 열린 질문이 아님
- 발급 응답은 method 값으로 판별하는 discriminated union으로 설계 권장: { method: '카드', card: Card, transfers: null } | { method: '계좌이체', card: null, transfers: Transfer[] } — TRANSFER 경로에서 card가 null임이 문서 예시로 확인됨
- transfers 필드는 반드시 배열 타입(Transfer[])으로 정의할 것 — 문서 예시 JSON이 배열임을 재확인함
- authKey는 만료 시각이 문서화되지 않았으므로 라이브러리는 TTL/만료를 가정하지 말고 'opaque string(최대 300자), 일회용'으로만 모델링 — 발급 API 호출 후 재사용을 타입/런타임에서 차단(브랜디드 타입 + 소비 후 무효화 패턴)하는 것이 문서 계약에 부합
- 발급 엔드포인트가 카드/계좌이체 공통(/v1/billing/authorizations/issue)이므로 IssueBillingKey 단계는 method와 무관한 단일 인터페이스로 두고, method별 차이는 요청(requestBillingAuth 파라미터)과 응답(Billing 판별 유니온)에만 반영하면 됨
- 검증 단계 강제 설계에 부합: '인증(리다이렉트) → authKey 수신 → 발급 → 저장 → 승인'이 순차 의존이며, 빌링키는 재조회 불가이므로 발급 응답을 반환 전에 저장을 강제하는 추상 메서드(예: abstract persistBillingKey)를 두는 근거가 문서에 있음
- selectableCardTypes, windowTarget 등 카드/플랫폼 조건부 파라미터는 method별 오버로드 또는 조건부 타입으로 분리 권장 — 단 TRANSFER에서 selectableCardTypes의 동작은 미문서화이므로 TRANSFER 타입에서는 아예 제외하는 것이 안전
- 응답 method('카드'/'계좌이체' 한국어)와 요청 enum(CARD/TRANSFER)의 매핑 상수를 라이브러리에 내장할 것
- customerKey 제약(2~300자, 허용 문자셋, 특수문자 1개 이상)은 브랜디드 타입 + 런타임 검증 팩토리로 강제 가능
- v2024-06-01 기준 cardCompany/cardNumber deprecated — 타입에서 제외하거나 @deprecated 주석으로만 유지

### 근거 문서

- https://docs.tosspayments.com/llms.txt
- https://docs.tosspayments.com/guides/v2/billing/integration-quick.md
- https://docs.tosspayments.com/sdk/v2/js.md
- https://docs.tosspayments.com/guides/v2/billing/integration.md
- https://docs.tosspayments.com/reference.md

# 완결성 검증 결과

### 설계 리스크

- 웹훅 서명 검증이 payout.changed/seller.changed에만 제공되고 PAYMENT_STATUS_CHANGED 등 결제 이벤트에는 암호학적 검증 수단이 없음 — '웹훅 검증' 기능이 모든 이벤트에 서명 검증을 강제하는 API로 설계되면 구현 불가능하며, 검증 등급(signature/secret/unverified)을 타입으로 구분하는 설계가 필수
- 자동결제(빌링) 승인 완료 웹훅이 존재하지 않음 — 웹훅 기반으로 정기결제 완결성을 보장하는 설계는 불가능하고, 승인 응답 처리 + 조회 API 재확인 구조로 설계해야 함
- 테스트 환경 웹훅 발송 여부 미확인 + 로컬 포트 URL 등록 불가 — 기능 (5)의 웹훅 통합 테스트가 실수신 불가능할 수 있어, 페이로드 시뮬레이션 기반 테스트 유틸을 별도 제공해야 할 위험
- 공식 상태 전이 다이어그램이 문서에 없음 — Payment.status 8종의 전이를 상태 정의문에서 유도해 타입 상태 머신을 만들면 실제 서버 동작(예: WAITING_FOR_DEPOSIT→CANCELED, READY→ABORTED)과 어긋날 수 있어 보수적 모델링 필요
- 키 4종 체계(test/live x 위젯 gck·gsk / API ck·sk)와 MID별 별도 키 발급 — 결제창 방식에 어떤 키가 유효한지 미확인이라 단일 클라이언트 설계 시 NOT_SUPPORTED_WIDGET_KEY/INVALID_API_KEY 런타임 에러 위험; 키 타입 분리가 필수
- Payment.method가 영문 enum이 아닌 한글 리터럴('카드', '가상계좌' 등) — 영문 enum을 임의로 정의하면 응답 파싱이 런타임에 전부 불일치
- 멱등키 15일 TTL — 장기 재시도(예: 큐에 쌓인 취소 재처리)가 15일을 넘기면 같은 키가 새 요청으로 처리되어 중복 환불 위험; 라이브러리가 멱등키를 자동 생성한다면 TTL 경계를 문서화해야 함
- DEPOSIT_CALLBACK 웹훅 페이로드에 paymentKey가 없음(orderId/secret/transactionKey 기반) — paymentKey를 조회 키로 가정한 웹훅 핸들러 인터페이스는 가상계좌 입금 이벤트에서 동작 불능

### 리서치 간 충돌

- customerKey 길이 제한: 결제위젯·결제창 리서치는 '2~50자', 빌링 리서치는 '2~300자'로 직접 모순 — 동일 개념의 validator가 두 값 중 하나를 골라야 함
- 승인 유효시간: 위젯/테스트 리서치는 '결제 요청 후 10분 이내 승인', 결제창 리서치의 EXPIRED 정의는 '30분 유효시간' — 만료 시 결과도 NOT_FOUND_PAYMENT_SESSION 에러(위젯 리서치) vs EXPIRED 상태 전이(결제창·테스트 리서치)로 갈림
- 멱등키 헤더명: 결제창·취소 리서치는 'Idempotency-Key 헤더(최대 300자, 15일 유효)'로 확정 기술했으나, 위젯·테스트 리서치는 '정확한 헤더명 미확인, Idempotency-Key로 추측하지 말 것'이라고 명시 — 확신 수준이 정면 충돌
- orderId 허용 문자: 위젯 리서치(SDK 문서 기준)는 '-, _, =' 허용, 결제창·빌링 리서치(레퍼런스 기준)는 '-, _'만 허용
- successUrl 쿼리 파라미터: 위젯 리서치(integration-window 기준)는 paymentType 포함 4개, 결제창 리서치는 orderId/paymentKey/amount 3개만 기술
# Phase 0 확인 결과 (2026-08-09, 문서 재확인 + 테스트 키 실측)

> fable5 세션의 Phase 0 워크플로(문서 에이전트 4 + 라이브 API 에이전트 2)가 위 "열린 질문"들을 해소한 결과.
> 라이브 실측은 `.env`의 API 개별연동 테스트 키(test_sk_)로 api.tosspayments.com에 실제 호출한 것이다.

## 열린 질문 7개의 확정 답

### 1. 멱등키 헤더 이름 — `Idempotency-Key` 확정 (문서 + 실측)

- 공식 레퍼런스 verbatim: "요청 헤더에 `Idempotency-Key`를 추가하면 멱등한 요청을 보낼 수 있습니다." (reference/using-api/authorization)
- 제약: 최대 300자(초과 시 400 INVALID_IDEMPOTENCY_KEY), 처음 사용일부터 15일 유효, 모든 POST에 적용(GET에서는 무시). 처리 중 재요청 시 409 IDEMPOTENT_REQUEST_PROCESSING → "다시 요청해서 응답을 확인하세요".
- **멱등 판정 조합은 "멱등키 + API 키 + API 주소 + HTTP 메서드"이며 요청 body는 포함되지 않는다** (문서 명시). 같은 키+다른 body의 동작은 미문서화 — 첫 응답 재생으로 추정되므로 라이브러리는 키 재사용 시 body 동일성을 스스로 보장해야 한다.
- 실측: POST cancel에 같은 키+같은 body 재전송 → HTTP 200, **바이트 단위 동일 body 재생**(cancels 1건 유지, balanceAmount 700 유지, 중복 취소 없음). 전용 replay 표시 헤더는 없으나 관측 가능한 표식 존재: 응답 헤더에 `idempotency-key` 에코, 재생 응답에 x-tosspayments-trace-id 2줄(원본 것 포함), 응답 시간 급감.

### 2. customerKey 제약 — 서버 실제 한계는 300자, 특수문자 필수 아님 (실측)

| 케이스 | 결과 |
|---|---|
| 50자 / 51자 / 300자 영숫자 | 전부 200 성공 → SDK 문서의 "50자"는 서버 강제 아님 |
| 301자 | **500 FAILED_DB_PROCESSING** ("잘못된 요청 값으로 처리 중 DB 에러") — 400 검증 에러가 아니라 DB 한계 |
| 2자 "ab" | 200 성공 |
| 순수 영숫자 (특수문자 없음) | 200 성공 → "특수문자 최소 1개" 문구는 허용 집합 나열이 맞음 |
| "bad key!" (공백+허용 외 문자) | **200 성공** — 서버가 허용 문자 집합을 강제하지 않음 |

- 시사점: **서버는 사실상 검증하지 않으므로 라이브러리의 스마트 생성자가 실질 방어선이다.** validator는 문서 규격 `^[A-Za-z0-9\-_=.@]{2,300}$`으로 강제(301자가 500으로 터지는 것, 공백 키가 URL/타 API에서 깨질 위험 차단). 특수문자 필수 검증은 넣지 않는다.

### 3. cancelAmount > balanceAmount — 403 NOT_CANCELABLE_AMOUNT 확정 (실측)

- 잔액 1000에 cancelAmount 2000 → **HTTP 403 `{"code":"NOT_CANCELABLE_AMOUNT","message":"취소 할 수 없는 금액 입니다."}`**. 결제 상태 불변.
- 400 INVALID_REFUND_AMOUNT가 아님 — 취소 API 공식 에러 표 기준 매핑이 실측으로 확인됨.

### 4. 승인 시한 10분 vs 30분 — 모순 아님, 서로 다른 구간의 별개 시한 (문서 확정)

- 관계를 명시한 verbatim (reference/using-api/webhook-events): "결제창이 유효한 **30분** 안에 구매자가 결제창에서 인증을 하지 않거나, 결제 인증이 유효한 **10분** 안에 상점에서 결제 승인 API를 호출하지 않으면 결제 상태가 `EXPIRED`로 변경됩니다."
- 30분 = 결제창 실행(READY)부터 구매자 인증까지 (라이브러리가 통제 불가). 10분 = 인증 완료(successUrl 리다이렉트)부터 confirm 호출까지 (라이브러리가 안내할 대상).
- 초과 시: 상태는 EXPIRED로 전이(READY→EXPIRED, IN_PROGRESS→EXPIRED 모두 존재, PAYMENT_STATUS_CHANGED 웹훅 발송), 만료 후 confirm 호출은 **404 NOT_FOUND_PAYMENT_SESSION** — 같은 만료 사건의 두 표현. 연동 방식(위젯/결제창)별 차이 없음.
- 라이브러리 기준: successUrl 수신 즉시 confirm을 기본 패턴으로, 10분 초과 404는 재시도 불가한 최종 실패로 분류.

### 5. requestBillingAuth method enum — 'CARD' | 'TRANSFER' 확정

- SDK 문서 페이지는 값 목록을 명시하지 않으나, `@tosspayments/tosspayments-sdk` v2.7.1 타입 정의가 `BillingAuthRequest = CardBillingAuthRequest | TransferBillingAuthRequest` (각 `method: 'CARD'` / `method: 'TRANSFER'`) discriminated union으로 확정. 가이드 예제와 교차 일치.
- selectableCardTypes / flowMode / easyPay / cardCompany는 **CardBillingAuthRequest 전용** — TRANSFER 타입에서는 제외해야 SDK 타입과 정합.
- 카드 가이드의 "자동결제는 카드만 지원합니다" 주석은 구(舊) 주석 — 무시.

### 6. 전액 취소 후 status — 부분취소 이력이 있으면 PARTIAL_CANCELED로 남는다 (실측 확정)

- **부분취소(300) 후 잔액(700) 전액 취소 → HTTP 200, status `PARTIAL_CANCELED` 유지, balanceAmount 0.** GET 조회도 동일. 이 상태에서 재취소 → **403 NOT_CANCELABLE_AMOUNT** (ALREADY_CANCELED_PAYMENT 아님!).
- 부분취소 이력 없이 한 번에 전액 취소 → status `CANCELED`, 재취소 → 400 ALREADY_CANCELED_PAYMENT.
- 시사점: "완전 취소" 판정은 반드시 `balanceAmount === 0`으로. 재취소 에러 매핑도 두 코드를 모두 "이미 취소됨" 계열로 수용해야 한다.

### 7. 테스트 환경 웹훅 — 발송됨(문서 확정), 그러나 자동화 불가 → 시뮬레이션 유틸 타당

- 웹훅 가이드 verbatim: "테스트 결제를 해보세요. 등록한 URL로 웹훅이 발송됩니다" — 테스트 키에서도 웹훅 발송 확정.
- 그러나 (a) localhost URL 등록 불가 명시, (b) 웹훅 등록/관리 API 전무(개발자센터 UI 전용), (c) 가상계좌 입금은 개발자센터 수동 버튼 필요 — 셋 다 자동화 불가.
- 결론: CI 통합 테스트는 페이로드 시뮬레이션 기반으로 확정. 이벤트 스키마·헤더·서명 산식이 완전히 문서화되어 있어 서명 생성→검증 왕복, secret 대조, dedupe 전부 시뮬레이션 가능.

## 추가 실측 확정 사항 (통합 테스트에 직접 활용)

- **DELETE /v1/billing/{billingKey} 실존 확정**: HTTP 200 + 빈 body(0바이트). 삭제된 키로 승인 시도 → **400 ALREADY_REMOVED_BILLING_KEY** ("이미 삭제된 빌링키입니다"). billingKey의 `=` 문자는 경로에 raw로도, percent-encoding으로도 동작.
- **테스트 환경 빌링 카드 형식** (문서와 다름 — BIN 6자리 단독은 거부됨):
  - `433012` (6자리) → 400 INVALID_CARD_NUMBER
  - `4330121234567890`, `5520221234567890` → 발급 200이지만 cardType "미확인" → 승인 시 400 NOT_SUPPORTED_CARD_TYPE
  - **`9410001234567890` → 발급(cardType "신용", ownerType "개인", issuerCode 21) + 승인(200 DONE) 모두 성공 — 통합 테스트 표준 카드번호로 사용**
  - 성공 body: `{"customerKey":"<uuid>","cardNumber":"9410001234567890","cardExpirationYear":"30","cardExpirationMonth":"12","customerIdentityNumber":"900101","cardPassword":"12"}`
- **NOT_MATCHES_CUSTOMER_KEY 실측**: 다른 customerKey로 승인 → HTTP **400** `{"code":"NOT_MATCHES_CUSTOMER_KEY","message":"빌링 인증 고객키와 결제 요청 고객키가 일치하지 않습니다."}`. 결제 미발생.
- **NOT_MATCHES_REFUNDABLE_AMOUNT 실측**: refundableAmount 고의 불일치 → HTTP 400, 취소 미실행(잔액 유지) — 낙관적 잠금으로 실제 동작 확인.
- 멱등키 없이도 안전한 배치를 위해: 승인 성공 orderId 형식 `gjp0a<epoch>` 등 6-64자 영숫자면 충분.

# Phase 5 실측 결과 (2026-08-09, 라이브 통합 테스트)

## 멱등키 — 에러 응답도 멱등 재생됨 (확정, §7-5 후속 결정 근거)

- **4xx 에러 응답(403 NOT_CANCELABLE_AMOUNT, 400 INVALID_REQUEST 모두)이 멱등키에 바인딩된다.** 같은 키로 유효한 body를 다시 보내도 원본 에러가 그대로 재생되고 실제 처리는 실행되지 않는다 (balanceAmount 불변으로 확인).
- 재생 판별 시그널: 재생 응답의 `x-tosspayments-trace-id`가 "신규ID, 원본ID" 콤마 병기 형태 (비공식 — 공개 API로 노출 금지, 디버그용). `idempotency-key` 에코는 첫 요청에도 있어 판별 불가.
- **v1.1 confirm 멱등키 자동화 정책**: 자동 생성 키의 동일 키 재시도는 "응답 미수신(네트워크/타임아웃)" 케이스에만 안전. 4xx 수신 후 파라미터를 고쳐 재시도할 때는 반드시 새 키 — 아니면 15일간 같은 에러만 재생된다. 현 라이브러리의 cancel 정책(자동 생성 + TransportFailure 시에만 동일 키 retry 티켓)이 실측으로 정당화됨.

## 빌링(카드) 결제 응답의 secret — 문서와 달리 non-null

- 리서치 문서는 Payment.secret을 가상계좌 DEPOSIT_CALLBACK 검증용으로만 기술하나, 실측(test_sk_)에서는 **type=BILLING, method=카드 결제의 승인/조회 응답에도 secret('ps_…')이 non-null로 내려온다.** 타입(PaymentBase.secret: string | null)은 이미 호환.

## TossPayments-Test-Code — 빌링 승인 경로에서 동작 확인

- POST /v1/billing/{billingKey}에 TossPayments-Test-Code: REJECT_CARD_PAYMENT 헤더 → 서버가 실제로 REJECT_CARD_PAYMENT 에러를 반환 (무시되지 않음). confirm 외 경로에서도 에러 시뮬레이션 유효.
- **IDEMPOTENT_REQUEST_PROCESSING(409)도 시뮬 가능** (2026-08-10 실측, v1.1 통합 테스트): Test-Code 헤더 + Idempotency-Key 부착 시 서버가 실제 HTTP 409 + 해당 코드를 반환. 단 Test-Code는 시도마다 부착되므로 재시도 2회째도 동일 409가 재생된다 — retry 옵션 검증에 결정적(deterministic) 재현 수단으로 사용.

## 통합 테스트 현황

- tests/integration/ 6파일 13테스트 전부 통과 (직렬, 분당 100건 스로틀). 시나리오: 정상 플로우(발급→승인→부분→전액취소 잔액 추적), expectedAmount 불일치 사전 Err(잔액 불변 실증), 잔액 초과 사전 Err + raw 우회 403 대조, 재취소 2종 분기(400/403), NOT_MATCHES_CUSTOMER_KEY raw 대조, 멱등 재생, Test-Code, 무효 키 401, 웹훅 시뮬레이션(서명 로테이션 왕복·secret 대조·dedupe·orderId refetch 실조회).
- README 18개 ts 블록 전부 컴파일 검증 통과 (scripts/check-readme.mjs, pnpm check:readme로 재실행 가능).
