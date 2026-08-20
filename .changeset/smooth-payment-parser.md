---
"@gj-kit/toss-payments": minor
---

결제 응답을 base 필드, 취소 이력, 결제수단별 세부 객체까지 런타임에서 검증해 누락된 2xx
응답이 `Payment` 또는 가상계좌 secret 저장으로 통과하지 않게 합니다.

가상계좌 조회의 `VirtualAccountPayment.secret`은 `string | null`로 바로잡았습니다. 직접
`confirm`/`confirmCallback`이 성공한 가상계좌만 `ConfirmedPayment.secret: string`을
보장합니다. confirm 실패 뒤 조회에서 secret을 되살릴 수 없으면 `resolveFailure`는 새
`confirmed-without-deposit-secret` 분기를 반환하므로 주문을 보류해 운영 복구로 처리해야
합니다.

JavaScript 우회 설정도 안전하게 처리하도록 양의 안전한 정수 금액, 1~600,000ms 승인 창,
2~5회 재시도와 0~60,000ms 비어 있지 않은 retry delay를 런타임에서 검증합니다.
