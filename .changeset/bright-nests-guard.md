---
'@gj-kit/toss-payments-nestjs': minor
---

여러 Toss 키 쌍을 안전하게 분리하는 named Nest DI API(`register`, `registerAsync`,
`getTossPaymentsToken`, `InjectTossPayments(name)`)를 추가했습니다. Nest 웹훅 헬퍼는
원본 socket과 명시적 trusted-proxy `sourceIp` extractor를 코어 handler에 전달해 일반
상태 웹훅의 fail-closed IP 검증을 유지합니다. 코어 peer 지원 범위에 0.4을 추가했습니다.
