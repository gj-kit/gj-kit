---
"@gj-kit/toss-payments": minor
---

첫 릴리스: 토스페이먼츠 V2 결제 라이브러리 — 검증 강제 설계

- confirm: 콜백 파싱 → OrderStore 금액 대조 → 브랜디드 VerifiedCheckout만 승인 가능
- cancel: 조회 → asCancelable(3-변형) → 실행 3단계 강제, 멱등키 자동 생성 + 재시도 티켓
- billing: typestate 발급 플로우, billingKey+customerKey 봉인(BillingProfile), 스토어 필수 주입, import 이관
- webhook: raw body 검증 강제, 신뢰 3등급(signature/secret/unverified), 원자적 dedupe, fetch/node 어댑터
- browser: 위젯 3단계 typestate, 키 4종 브랜드 타입 (시크릿 키 브라우저 유입 = 컴파일 에러)
- testing: 웹훅 픽스처(서명 왕복), 인메모리 스토어, 실측 검증 카드 상수
