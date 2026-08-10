---
"@gj-kit/toss-payments": minor
"@gj-kit/toss-payments-nestjs": minor
---

환불 정책 계산과 결제 상태 관리 API를 추가합니다.

- 전체·고정 비율·경과시간 구간·잔여 일수/회차/사용량 기반 환불 정책과 custom calculator
- basis point + BigInt 기반 정수 반올림, 기존 완료 환불 차감, 장부 잔액과 Toss 잔액 대조
- 정책 ID/버전과 계산 근거가 남는 runtime-sealed `RefundQuote`
- 5분 기본 TTL·정확한 시간/현지 자정 경계, Payment 상태 지문, 저장 JSON을 비실행 `ParsedRefundQuote`로 읽는 `parseRefundQuote`, 동일 ID/버전 정책으로 exact 재계산하는 `policy.restoreQuote`
- sealed quote를 현재 취소 가능 결제에 결속하는 `prepareRefund`, 요청 본문과 멱등키를 묶는 `prepareRefundExecution`, 실행 직전 재조회 후 기존 취소 primitive에 위임하는 `executeRefund`
- 민감정보 없는 `summarizePaymentState`와 가역 상태 변경을 허용하는 `diffPaymentState`; 진행 중 취소는 `cancellation-pending`으로 별도 분류
- 모순된 status·balance·취소 이력과 진행 중 취소를 `asCancelable`에서 fail-closed 처리하고 provider `ABORTED`는 명시적 오류로 반환

`@gj-kit/toss-payments-nestjs`는 코어 peer가 0.x minor 범위를 벗어나므로 함께 minor로 올립니다.
