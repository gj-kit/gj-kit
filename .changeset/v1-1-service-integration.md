---
"@gj-kit/toss-payments": minor
---

v1.1 서비스 통합: `createTossPayments` 파사드 + 옵션 7종 추가 (기존 공개 API 파괴 없음 — 전량 추가)

- `createTossPayments` 파사드 — confirm/cancel/billing/webhook 조립만 담당(검증 로직 중복 0), 옵션은 전부 기본 꺼짐·결제 경로 무간섭
- `depositSecrets` — DepositSecretStore 주입으로 가상계좌 DEPOSIT_CALLBACK secret 대조를 파사드 배선에 포함
- `audit` — 아웃바운드 req/res 기록. Authorization은 스키마에 필드 자체 부재, 비설정화 redaction(AUDIT_REDACTED_KEYS), billingKey 경로는 auditPath 치환으로 관측 채널 유출 차단
- `events` — 타입드 in-process pub/sub (payment.confirmed / billing.issued·revoked / webhook.accepted / api.call), Result 흐름 불개입
- `retry` — 실측 근거 하드 가드 자동 재시도(네트워크 실패 + 멱등키 보유 요청만, 토스 4xx/5xx 응답은 재시도 없음)
- webhook `autoRefetch` — Unverified 이벤트에 조회 재확인 결과 자동 첨부(trust 등급 승격 없음)
- `requireApproveIdempotencyKey` — 빌링 approve 멱등키를 타입 수준에서 필수화
- `resolveConfirmFailure` — confirm 실패의 조회 기반 3분기(actually-confirmed / retry-payment / definitively-failed) 복구 헬퍼
