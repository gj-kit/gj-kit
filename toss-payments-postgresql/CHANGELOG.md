# @gj-kit/toss-payments-postgresql

## 0.2.0

### Minor Changes

- **Breaking (0.x minor):** `createTossPaymentsPostgres`, Nest `forRoot`/`forRootAsync`, and the
  three direct sensitive-store factories now require an async `sensitiveValueProtector`. Billing key
  records, deposit secrets, and cancel retry records are persisted only through that protector with
  purpose + record-id context for AEAD AAD binding; there is no raw-storage default. Development-only
  plaintext requires the explicit `unsafePlaintextSensitiveValueProtector` opt-in.

  Webhook inbox persistence now recursively redacts credential, key, token, password, card, and
  account fields without mutating the webhook object delivered to handlers. Existing 0.1.x plaintext
  rows need an explicit export/rewrite cutover (or a development schema reset); `0001_init` remains
  unchanged.

## 0.1.1

### Patch Changes

- 5d173d0: 릴리스 워크플로가 Changesets에도 npm 인증 토큰을 명시적으로 전달합니다. 첫 공개 버전의 npm 설치 경로를 다시 검증합니다.

## 0.1.0

### Minor Changes

- 03e4c50: 신규 패키지 — `@gj-kit/toss-payments` 저장소 주입 seam의 PostgreSQL 구현. 테이블·마이그레이션을 패키지가 소유해 프로덕션 채택을 "테이블 설계"가 아니라 "설정"으로 만든다.

  - **코어 구현 계약 6종**: `OrderStore`(insert-only — 금액 대조 원본 보호, 동일값 재저장만 멱등) · `DepositSecretStore` · `BillingKeyStore` · `CancelRetryStore`(record_json은 의도적 text — bodyJson 바이트 계약 보존) · `WebhookDedupeStore`(단일 문 CTE 원자적 claim + crash-recovery lease) · `AuditSink`(즉시 insert + `flush()`, 다중 인스턴스 동시 기록 안전).
  - **테이블 7종 + `migrate()`**: 부팅 시 자동 DDL 없음(항상 명시 호출), `pg_advisory_xact_lock` 동시 부팅 직렬화, 단일 트랜잭션, 멱등 재실행. 자체 마이그레이션 도구 사용자는 `renderMigrationSql()`로 동일 SQL 원문을 꺼낸다.
  - **`cleanup()`**: `webhook_dedupe` 완료 행(기본 5일)·`cancel_retries`(기본 15일 — 토스 멱등키 유효기간) TTL 정리, 명시 호출 전용. `audit_entries`·`webhook_inbox`·`orders`·`deposit_secrets`는 지우지 않는다(보관 정책은 소비자 책임).
  - **NestJS 모듈**(`./nestjs` 서브패스, optional peer 격리): `TossPaymentsPostgresModule.forRoot/forRootAsync` + `TOSS_PAYMENTS_POSTGRES` 단일 토큰 + `InjectTossPaymentsPostgres()` — 코어 `TossPaymentsModule.forRootAsync` 연쇄가 골든 패스.
  - **웹훅 inbox**: 코어 계약 무변경의 핸들러 래퍼 `withWebhookInbox` + `pg.inbox.record` — 이벤트 원문을 `webhook_inbox`에 보존하고 재전송은 `deliveries` 증가로 관측. record 실패 기본 동작은 삼키고 `onRecordError` 통지, `failOnRecordError: true`로 내구 계약 전환.
  - **direct runtime dependency 0**: `pg`조차 peer가 아니다 — 구조적 `PgPoolLike`를 받는 `fromPgPool`과 드라이버 중립 `SqlClient` seam만 공개(TypeORM 등은 직접 구현). required peer는 `@gj-kit/toss-payments ^0.4.0` 하나다.
