# @gj-kit/toss-payments-postgresql

## 0.5.2

### Patch Changes

- 73379a8: docs: lead every README with the payoff instead of the taxonomy

  패키지 README와 문서 포털을 전면 개편했다. 기존 문서는 경계와 금지 사항부터 나열해서, 처음 보는 사람이 이 패키지를 왜 써야 하는지 판단할 근거가 없었다.

  각 README는 이제 다음 순서로 읽힌다.

  - npm·CI·types·runtime deps·license 배지
  - tagline — 이 패키지가 무엇을 불가능하게 만드는지 한 줄
  - "왜 필요한가" — 이 패키지 없이 실제로 나는 사고
  - "무엇으로 막는가" — 실제 export 심볼로 추적 가능한 항목 4~5개
  - Golden path — 기존과 동일
  - "실제로는 이렇게 걸립니다" — payoff가 드러나는 두 번째 예제
  - "주장 대신 검증" — 측정한 숫자만

  문구 정본은 `website/src/data/catalog.mjs` 하나이고 README 20종과 포털이 여기서 생성된다. 추가한 예제는 전부 `check:readme`가 dist 타입에 대해 컴파일을 검증하며, `check:docs`와 `check:readme`가 tagline·problem·highlights·배지의 존재를 검사한다. `localize-readmes.mjs`는 "runtime deps 0" 배지가 사실인지도 함께 강제한다.

  공개 API는 변경되지 않았다.

## 0.5.1

### Patch Changes

- 9c3cbc4: Publish English-first and Korean README files, add package discovery metadata, and link every package to the generated global API documentation portal.

## 0.5.0

### Minor Changes

- f6e3e81: Additive: a database-free `./testing` subpath and a reference AES-256-GCM protector on the root entry. No existing export, type, error code, default, or peer changes.

  **`./testing` — `createMemoryTossPaymentsPostgres(options?)`**

  - Returns `MemoryTossPaymentsPostgres`, which extends `TossPaymentsPostgres` (`orders`, `depositSecrets`, `billingKeys`, `cancelRetries`, `webhookDedupe`, `audit.flush()`, `inbox`, `opaqueLocks`, `migrate()`, `cleanup()`) with no database, plus the test-only `recorded` view and `reset()`.
  - `billingKeys` is a full `PgBillingKeyStore`: `withMutationLock`, `withOpaqueMutationLock`, `replaceAndGetPrevious`, `deleteIfBillingKeyMatches`, `replaceIfBillingKeyMatches`, and the locked-mutation handle (`find`/`save`/`delete`/`replaceAndGetPrevious`/`isCurrentOperationId`/`deleteIfBillingKeyMatches`/`replaceIfBillingKeyMatches`). Locks are real in-process promise-chain mutexes per customerKey and per opaque key; the combined API acquires **opaque → customer** like the PostgreSQL implementation and releases in reverse. Handle writes stay in a transaction overlay until the callback settles (READ COMMITTED semantics): the handle reads its own staged writes, while lock-free `billingKeys.find` sees committed state only — never an in-flight callback's uncommitted write. A returning callback applies the overlay before the lock releases (COMMIT); a throwing callback discards it (ROLLBACK), so rolled-back values are never observable.
  - Where PostgreSQL would self-deadlock (re-acquiring a held key) or the README forbids nesting public lock APIs, the fake throws `MemoryLockContractError` (`code: 'reentrant-lock' | 'nested-lock-api' | 'handle-outside-callback'`, guard `isMemoryLockContractError`) instead of hanging the test — `'handle-outside-callback'` refuses a locked-mutation handle used after its callback settled instead of silently dropping the write. Nesting is judged by where the lock call starts, so a fire-and-forget lock call launched inside a callback is refused too (model competitors from outside the callback behind a "started" gate, as in the README example). Lock-free reads and other stores stay allowed inside callbacks. PostgreSQL deadlock detection for reversed multi-key orders is not emulated.
  - The `sensitiveValueProtector` option is applied through the same codec as the PostgreSQL stores (same purpose/recordId context, same `invalid-row` checks). Default is `unsafePlaintextSensitiveValueProtector`, acceptable only because this is a test double.
  - `orders` keeps insert-only + identical-value idempotence + `order-conflict`, and `loadOrder` runs the same row projection/validation as PostgreSQL (contract fields only, `invalid-row`/`unsafe-amount`); `audit.record` is idempotent on a repeated id like the sink's `ON CONFLICT (id) DO NOTHING`; `webhookDedupe` keeps lease expiry reclaim and `completed` retention; `inbox` applies the same redaction/sanitization and counts `deliveries`; `migrate()` reports the real migration ids as `applied` then `skipped`; `cleanup()` applies `dedupe.completedTtlSeconds` / `retention.cancelRetryDays` through the injectable `now()` clock (epoch ms, default `Date.now`).
  - `recorded.events` is an ordered discriminated union (`lock-requested` / `lock-acquired` / `lock-released` with `api`, `lock`, `key`, `outcome`; `store` with `store`, `operation`, `recordId`, optional `result`; `migrate`; `cleanup`). It never contains billing keys, secrets, or raw operationIds. `recorded.auditEntries` and `recorded.inbox` expose the two tables that have no read API in PostgreSQL.
  - The subpath also re-exports `createOpaqueAdvisoryLockKey`, `unsafePlaintextSensitiveValueProtector`, and the aggregate/store types so consumer test files need no root import.

  **Root — `createAes256GcmSensitiveValueProtector({ key, keyId? })`**

  - Builds a `SensitiveValueProtector` with `node:crypto` AES-256-GCM: fresh random 12-byte IV per `encrypt`, 16-byte tag, JSON envelope `{ v: 1, alg: 'A256GCM', kid?, iv, tag, value }` (base64 fields, fixed key order), and AAD namespace + `0x00` + a canonical no-whitespace fixed-key-order JSON of `{ purpose, recordId, kid }` so ciphertext cannot be moved across rows or purposes. The exact AAD byte layout (including string-escaping rules) is documented in the README so the format is reimplementable outside ECMAScript, with a fixed test vector and an independent WebCrypto interop test.
  - `key` must be exactly 32 bytes (`Uint8Array`/`Buffer`) or a 64-character hex string; anything else throws `TypeError` at construction. Bytes are copied. `keyId` (1–128 chars) is written as `kid` and bound into the AAD. `encrypt` accepts well-formed UTF-16 plaintext only — a lone surrogate would be silently replaced with U+FFFD by UTF-8 encoding and fail to round-trip, so it is rejected with `TypeError` instead.
  - Key custody and rotation stay with the host: the library never generates, stores, or rotates keys, and it does not count invocations — with random 96-bit IVs, NIST SP 800-38D §8.3 caps a single key at 2^32 `encrypt` calls, so hosts must rotate `keyId` well before that (documented alongside the rotation guidance). Rows sealed under a different `kid` are rejected before decryption with `'key-id-mismatch'`, which a host can use to route old rows to a previous-key protector while it re-encrypts.
  - Decrypt failures throw the new `SensitiveValueProtectorError` (`code: 'invalid-envelope' | 'key-id-mismatch' | 'authentication-failed'`, guard `isSensitiveValueProtectorError`). Wrong key, wrong purpose/recordId, and tampering are deliberately indistinguishable (`'authentication-failed'`, no `cause`). Messages never contain key material, plaintext, or ciphertext. `TossPostgresErrorCode` is unchanged.

  Internal refactor with no behavior change: billing-key protect/unprotect, fingerprint, and snapshot helpers moved to a shared internal module so the PostgreSQL store and the in-memory fake use one implementation.

  Also widen the `@gj-kit/toss-payments` peer range to `^0.5.0 || ^0.6.0` so hosts can adopt core 0.6 (additive) without a peer conflict.

## 0.4.0

### Minor Changes

- Add `TossPaymentsPostgres.opaqueLocks` for cross-process serialization of short
  application lifecycle finalization. Applications explicitly wrap a nonsecret
  HMAC/blind-index with `createOpaqueAdvisoryLockKey()` and call
  `withLock(key, callback)`. The PostgreSQL adapter holds a transaction-scoped
  advisory lock on one connection, passes only a domain-separated SHA-256
  fingerprint to SQL, and rolls back on failures. This is ordering only: provider
  network I/O and cross-connection atomicity remain application responsibilities.

  Add `PgBillingKeyStore.withOpaqueMutationLock(opaqueKey, customerKey, callback)`
  for lifecycle paths that also mutate a billing key. It acquires the opaque lock
  and the customer mutation lock in the fixed opaque-to-customer order on the
  same connection and transaction, then exposes the existing customer-bound
  mutation handle. Applications must use this combined API instead of nesting
  `opaqueLocks.withLock` with `withMutationLock`, which can self-deadlock on a
  pool of one and splits the lock lifecycle across connections.

## 0.3.0

### Minor Changes

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
