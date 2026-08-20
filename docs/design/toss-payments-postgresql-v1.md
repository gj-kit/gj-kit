# @gj-kit/toss-payments-postgresql v1 — 설계 문서

2026-08-20 · 정본. 코어 계약과 충돌 시 권위 순서: **코어 소스(현행) > 이 문서 > api-surface.md/service-integration-v1.1.md의 서술**.
(선례: api-surface §3.4는 `claim(transmissionId): Promise<boolean>`으로 기술하나 현행 소스는
`claim(dedupeKey): Promise<WebhookClaimState>` 3메서드 — 이 문서는 소스를 정본으로 삼는다.)

## 0. 목적과 불변 제약

**목적**: 결제 도메인의 영속화 할일은 명확하다 — 주문 금액 원본, 빌링키, 가상계좌 secret,
취소 재시도 티켓, 웹훅 중복 제거, 감사 로그. 이 패키지는 `@gj-kit/toss-payments`가 이미
공개한 저장소 주입 seam 6종의 **PostgreSQL 구현 + 테이블/마이그레이션 소유 + NestJS 배선**을
제공해, 프로덕션 채택이 "테이블을 설계하는 일"이 아니라 "설정하는 일"이 되게 한다.

| 불변 제약 | 근거 |
|---|---|
| 코어 공개 계약을 구현만 한다 — 코어 타입 재정의·확장 금지 | AGENTS.md §2 (public contract) |
| direct runtime dependency 0 — `pg`조차 peer가 아니다(구조적 타입만 소비) | CLAUDE.md, AGENTS.md §2 |
| `@nestjs/*`는 `/nestjs` 서브패스에서만 import (optional peer 격리) | AGENTS.md §2 optional peer 규칙 |
| 모든 옵션 기본 꺼짐, fail-closed 기본값 | service-integration-v1.1 서두 표 |
| 부팅 시 자동 DDL 실행 없음 — `migrate()`는 항상 명시 호출 | 사용자 결정 (2026-08-20) |
| 저장 성공 반환 = 커밋 완료 (read-after-write 일관성) | 코어 store 계약 공통 전제 |

사용자 확정 결정(2026-08-20): ① 드라이버 중립 `SqlClient` seam + pg Pool 어댑터
② `migrate()` 함수 + SQL 원문 export 동봉 ③ 단일 패키지 + `/nestjs` 서브패스
④ v1 스코프 = 코어 계약 6종 + 마이그레이션 + NestJS 모듈 + **웹훅 inbox**
(payment state snapshot 테이블·at-rest 암호화 seam은 v1 제외 — §8 이후 후보).

## 1. 패키지 형태

- 폴더 `toss-payments-postgresql/` = npm `@gj-kit/toss-payments-postgresql`, MIT, `engines.node >= 20`.
- exports 2종:
  - `.` — SqlClient seam · `fromPgPool` · 스토어 6종 · migrate · inbox · cleanup · 에러.
  - `./nestjs` — `TossPaymentsPostgresModule` · DI 토큰 · 데코레이터.
- peerDependencies:
  - `@gj-kit/toss-payments: ^0.4.0` — **required**. 대부분 `import type`이나, 계약상 이 패키지는
    코어 없이는 무의미하다. (`peerDependenciesMeta` 불필요.)
  - `@nestjs/common: ^10 || ^11`, `reflect-metadata: ^0.1.13 || ^0.2`, `rxjs: ^7` — **optional**,
    `./nestjs` 서브패스 전용 (toss-payments-nestjs 선례 그대로).
  - `pg`는 peer가 아니다. `fromPgPool`은 구조적 타입 `PgPoolLike`만 받는다. `pg`는 devDependency
    (integration 테스트·타입 호환 검증용).
- tsup: entry `['src/index.ts', 'src/nestjs.ts']`, ESM+CJS 듀얼, dts, sourcemap, clean, treeshake,
  target node20, platform `'node'`, external `[/^@nestjs\//, /^@gj-kit\/toss-payments/, 'reflect-metadata', 'rxjs']`.
- tsconfig: 루트 base extends + `experimentalDecorators: true`, `emitDecoratorMetadata: false`
  (nestjs 서브패스가 있으므로 — 주입은 전부 명시적 `@Inject(토큰)`).
- provenance 스크립트 2종(루트 위임 래퍼) + `check-readme.mjs` 복사·개조, build/prepack 배선 동일.

## 2. SqlClient seam — 드라이버 중립 경계

```ts
export interface SqlRow { readonly [column: string]: unknown }
export interface SqlResult { readonly rows: readonly SqlRow[] }
export interface SqlExecutor {
  /** $1, $2 위치 파라미터 규약(PostgreSQL 프로토콜). 실패는 그대로 throw. */
  query(text: string, params?: readonly unknown[]): Promise<SqlResult>;
}
export interface SqlClient extends SqlExecutor {
  /**
   * 단일 세션에 고정된 실행기로 fn을 실행한다 — migrate()의 트랜잭션·advisory lock이
   * 풀의 서로 다른 커넥션으로 흩어지지 않기 위한 유일한 요구다. 스토어 6종은
   * 전부 단일 문(single statement)이라 이 경로를 쓰지 않는다.
   */
  withConnection<T>(fn: (session: SqlExecutor) => Promise<T>): Promise<T>;
}
```

- `rowCount`에 의존하지 않는다 — 존재 판정은 전부 `RETURNING`/`SELECT`로 한다(드라이버 간 이식성).
- `fromPgPool(pool: PgPoolLike): SqlClient` — `PgPoolLike`는 `query(text, values)`와
  `connect()`(→ `query` + `release(err?)`)만 요구하는 구조적 타입. `pg.Pool`이 그대로 대입된다.
  `withConnection`은 connect → try fn → finally release. fn throw 시 `release(err)`로 커넥션 폐기.
- TypeORM/Prisma/postgres.js 사용자는 `SqlClient`를 직접 구현한다(README에 TypeORM DataSource
  예시 1개 수록). 이 seam이 이 패키지의 유일한 드라이버 접점이다.

## 3. 스키마 — 테이블 7종

기본 스키마 이름 `toss_payments`, `schema` 옵션으로 변경 가능. 스키마·식별자는
`/^[a-z_][a-z0-9_]{0,62}$/`로 검증하고 위반 시 즉시 throw(`invalid-identifier`) —
설정 문자열이 SQL에 보간되는 유일한 지점이므로 여기서 봉쇄한다. 테이블 이름은 고정(옵션 없음).

컬럼 원칙: 코어가 string으로 준 시각(`createdAt`, `issuedAt`)은 **원문 text 보존**(계약이
string 왕복이므로 재직렬화 손실 금지). 운영 관측용 `timestamptz`(`recorded_at` 등)는 DB가 찍는다.

### 3.1 `orders` — OrderStore

```sql
CREATE TABLE orders (
  order_id    text PRIMARY KEY,
  amount      bigint NOT NULL CHECK (amount >= 0),
  currency    text NOT NULL CHECK (currency IN ('KRW','USD','JPY')),
  order_name  text NOT NULL,
  created_at  text NOT NULL,           -- StoredOrder.createdAt 원문(ISO 8601)
  recorded_at timestamptz NOT NULL DEFAULT now()
);
```

- `saveOrder` = **insert-only + 동일값 재저장 무해**: `INSERT ... ON CONFLICT (order_id) DO NOTHING
  RETURNING order_id`. 반환 없음 → `SELECT` 후 **amount·currency·orderName 3필드** 비교 →
  다르면 throw(`order-conflict`). `createdAt`은 비교에서 제외한다(2026-08-20 리뷰 반영) —
  코어 createOrder가 호출마다 `clock()`으로 createdAt을 새로 생성하므로 포함 시 정당한
  재제출조차 항상 conflict가 되어 멱등 보장이 도달 불가가 된다. 최초 저장본의 createdAt을
  유지하며 덮어쓰지 않는다. 근거: 금액 대조의 단일 진실 공급원을 조용한 upsert로 덮으면
  검증 전체가 무력화된다. 동일값 재시도(네트워크 재시도 등)는 멱등하게 성공한다.
- `loadOrder`: `SELECT` 후 `Number(row.amount)` 변환 — `Number.isSafeInteger` 실패 시
  throw(`unsafe-amount`). pg 드라이버는 bigint를 string으로 반환한다.

### 3.2 `deposit_secrets` — DepositSecretStore

```sql
CREATE TABLE deposit_secrets (
  order_id   text PRIMARY KEY,
  secret     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- `saveSecret` = upsert(`ON CONFLICT (order_id) DO UPDATE`) — 코어 TSDoc이 명시한 upsert 시맨틱
  계약(수동 저장 병용 시 이중 저장 무해). `getSecret` → 없으면 null.
- secret 값은 어떤 에러 메시지·로그에도 싣지 않는다.

### 3.3 `billing_keys` — BillingKeyStore

```sql
CREATE TABLE billing_keys (
  customer_key text PRIMARY KEY,
  billing_key  text NOT NULL,
  method       text NOT NULL,           -- '카드' | '계좌이체' (응답 원문 한글 리터럴)
  issued_at    text NOT NULL,
  card         jsonb,                   -- BillingKeyRecord.card | null
  transfers    jsonb,                   -- BillingKeyRecord.transfers | null
  updated_at   timestamptz NOT NULL DEFAULT now()
);
```

- `save` = upsert(customer_key) — issue/import 양쪽에서 호출되는 계약이고 코어가 교체 정책을
  규정하지 않으므로 최신 발급본 유지. `find` → null, `delete`.
- **보안 불변식**: 이 스토어가 던지는 어떤 에러 메시지에도 `billing_key` 값을 싣지 않는다.
  customerKey와 billingKey를 같은 문자열(로그 한 줄)에 함께 두지 않는다(코어 stores.ts ⚠ 준수).

### 3.4 `cancel_retries` — CancelRetryStore

```sql
CREATE TABLE cancel_retries (
  ticket_id   text PRIMARY KEY,
  record_json text NOT NULL,            -- JSON.stringify(CancelRetryRecord) 통짜
  recorded_at timestamptz NOT NULL DEFAULT now()
);
```

- **jsonb 금지, text다** — `CancelRetryRecord.bodyJson`은 멱등 재생의 바이트 계약이라
  jsonb 정규화(NUL 거부, 이스케이프/키 정렬)의 위험을 원천 배제한다. record 전체를
  `JSON.stringify`로 1컬럼 저장, `load`는 `JSON.parse` 후 그대로 반환(문자열 필드 왕복 무손실).
- 멱등키 15일 TTL — `cleanup()`(§6)이 `recorded_at < now() - interval '15 days'` 행을 지운다.
- ⚠ record_json에 환불 계좌 정보가 평문으로 들어올 수 있다 — at-rest 암호화는 v1 제외이므로
  README에 보관 책임·DB 레벨 암호화(TDE 등) 안내를 명시한다.

### 3.5 `webhook_dedupe` — WebhookDedupeStore

```sql
CREATE TABLE webhook_dedupe (
  dedupe_key       text PRIMARY KEY,
  state            text NOT NULL CHECK (state IN ('processing','completed')),
  lease_expires_at timestamptz,          -- processing일 때만 의미
  completed_at     timestamptz
);
```

- `claim(dedupeKey)` — **단일 문**으로 원자적 전이(코어 TSDoc: 조회 후 생성 2단계는 TOCTOU 금지):

```sql
WITH attempt AS (
  INSERT INTO webhook_dedupe (dedupe_key, state, lease_expires_at)
  VALUES ($1, 'processing', now() + make_interval(secs => $2))
  ON CONFLICT (dedupe_key) DO UPDATE
    SET state = 'processing', lease_expires_at = now() + make_interval(secs => $2)
    WHERE webhook_dedupe.state = 'processing'
      AND webhook_dedupe.lease_expires_at <= now()   -- crash-recovery lease 재점유
  RETURNING 'claimed'::text AS outcome
)
SELECT coalesce(
  (SELECT outcome FROM attempt),
  (SELECT CASE WHEN state = 'completed' THEN 'completed' ELSE 'processing' END
     FROM webhook_dedupe WHERE dedupe_key = $1)
) AS outcome;
```

  outcome이 null(극단 레이스: 사이에 행 삭제)이면 보수적으로 `'processing'` 반환 —
  어댑터가 503을 내고 토스가 재전송한다(fail-closed).
- `complete`: `UPDATE ... SET state='completed', completed_at=now(), lease_expires_at=NULL`.
- `release`: `DELETE ... WHERE dedupe_key=$1 AND state='processing'` — completed는 지우지 않는다.
- 옵션: `dedupe.leaseSeconds`(기본 60), `dedupe.completedTtlSeconds`(기본 432_000 = 5일 —
  코어 TSDoc "토스 최장 재전송 기간보다 긴 TTL, 권장 5일"). TTL 삭제는 `cleanup()` 소관.
  `retention.cancelRetryDays`는 **정수만** 허용(make_interval days 파라미터가 int — 조립
  시점 fail-fast, 2026-08-20 리뷰 반영).
- 알려진 계약 한계(문서화만): 코어 `release(dedupeKey)`에 소유(fencing) 토큰이 없어, lease
  만료 후 재점유된 활성 claim을 느린 원래 워커의 release가 지울 수 있다 — 스토어 계층에서
  완전 차단 불가. 완화책은 leaseSeconds를 핸들러 최대 처리 시간보다 크게 설정. 코어 계약
  보완 후보로 남긴다.

### 3.6 `audit_entries` — AuditSink

```sql
CREATE TABLE audit_entries (
  id              text PRIMARY KEY,      -- AuditEntry.id (crypto.randomUUID)
  at              text NOT NULL,         -- AuditEntry.at 원문
  env             text NOT NULL,
  method          text NOT NULL,
  path            text NOT NULL,
  attempt         integer NOT NULL,
  idempotency_key text,
  trace_id        text,
  duration_ms     integer NOT NULL,
  outcome_kind    text NOT NULL,         -- 'ok' | 'toss-error' | 'transport'
  entry           jsonb NOT NULL,        -- AuditEntry 통짜 (redaction은 코어가 이미 통과시킴)
  recorded_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entries_trace_id_idx ON audit_entries (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX audit_entries_recorded_at_idx ON audit_entries (recorded_at);
```

- `record(entry)`: 즉시 INSERT 1건(배치 없음 — v1 단순성; 코어가 await하지 않으므로 결제 경로
  지연 없음). 동일 id 재호출은 `ON CONFLICT (id) DO NOTHING`(멱등).
- in-flight insert를 Set으로 추적해 `flush(): Promise<void>` 제공 — graceful shutdown 훅.
  insert 실패는 코어 `AuditOptions.onSinkError`로 흘러가므로 여기서 추가 통지 채널을 만들지 않는다.
- createFileAuditSink의 다중 프로세스 한계를 대체하는 것이 존재 이유 — 다중 인스턴스 동시 insert 안전.

### 3.7 `webhook_inbox` — 이벤트 원문 보존 (코어 seam 없음 → 핸들러 계층 헬퍼)

코어 `WebhookDedupeStore.claim`에는 이벤트 메타가 전달되지 않으므로, inbox는 스토어가 아니라
**`WebhookHandlers`를 감싸는 헬퍼**로 제공한다(코어 계약 무변경).

```sql
CREATE TABLE webhook_inbox (
  dedupe_key        text PRIMARY KEY,    -- WebhookMeta.dedupeKey (사업 이벤트 1건 = 1행)
  transmission_id   text NOT NULL,
  transmission_time text,
  retried_count     integer NOT NULL,
  trust             text NOT NULL,       -- 'signature' | 'secret' | 'unverified'
  event_type        text NOT NULL,
  event             jsonb NOT NULL,      -- 핸들러가 받은 이벤트(코어가 secret 제거 완료)
  deliveries        integer NOT NULL DEFAULT 1,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at  timestamptz NOT NULL DEFAULT now()
);
```

- upsert(dedupe_key): `DO UPDATE SET deliveries = webhook_inbox.deliveries + 1,
  last_received_at = now(), retried_count = excluded.retried_count, event = excluded.event`.
- 공개 표면: `pg.inbox.record(webhook)`(수동) + `withWebhookInbox(pg.inbox, handlers, options?)`
  — handlers의 각 콜백을 record → inner 순서로 감싼 `WebhookHandlers` 반환. record는 핸들러
  **앞**에서 실행한다(핸들러 실패 시에도 수신 사실은 남김 — 감사·재처리 목적). 래퍼는
  고정 키 목록(`satisfies Record<keyof WebhookHandlers, true>`) ∪ own 키로 순회하고
  `inner.call(handlers, w)`로 호출한다 — 클래스 인스턴스(프로토타입 메서드) 핸들러 유실과
  `this` 바인딩 소실 방지(2026-08-20 리뷰 반영).
- **secret 정화(2026-08-20 리뷰 반영)**: PAYMENT_STATUS_CHANGED 등의 event.data(Payment)에는
  `secret`이 남아 있다(코어가 제거하는 것은 DEPOSIT_CALLBACK 경로뿐) — inbox 저장 시 모든
  깊이의 `secret` 키를 `[REDACTED]`로 마스킹한다(코어 AUDIT_REDACTED_KEYS 선례). jsonb
  컬럼 3곳(billing_keys.card/transfers, audit_entries.entry, webhook_inbox.event)은
  `serializeJsonb`로 U+0000·비페어 서로게이트를 치환해 PostgreSQL jsonb 거부(INSERT 실패 =
  빌링키 유실·웹훅 poison message)를 원천 차단한다.
- record 실패 기본 동작: **삼키고 `options.onRecordError(cause, meta)` 통지**(AuditSink 선례 —
  관측 계층이 웹훅 가용성을 볼모로 잡지 않는다). `options.failOnRecordError: true`(기본 false)면
  throw → 어댑터 500 → 토스 재전송(inbox를 내구 계약으로 쓰려는 소비자용).

## 4. migrate() — 라이브러리 소유 마이그레이션

```ts
migrate(sql: SqlClient, options?: { schema?: string }): Promise<MigrationResult>
// MigrationResult = { applied: readonly string[]; skipped: readonly string[] }
renderMigrationSql(options?: { schema?: string }): string   // 자체 도구 사용자용 전체 스크립트
```

- 마이그레이션은 TS 모듈 내 SQL 문자열 배열 `{ id: '0001_init', statements: readonly string[] }[]`
  — dist 동봉이 자동이고 별도 파일 복사 불필요. v1은 `0001_init` 1건(스키마 + 테이블 7종 + 인덱스).
- 실행 절차(`withConnection` 1회):
  1. `BEGIN`
  2. `SELECT pg_advisory_xact_lock($1)` — 키는 `'@gj-kit/toss-payments-postgresql:' + schema`의
     FNV-1a 64bit 해시(문서화된 고정 알고리즘). 동시 부팅 인스턴스 직렬화.
  3. `CREATE SCHEMA IF NOT EXISTS` + 버전 테이블 `toss_pg_migrations(id text PK, applied_at timestamptz)` IF NOT EXISTS
  4. 미적용 id만 순서대로 실행 + 버전 테이블 INSERT
  5. `COMMIT` (실패 시 ROLLBACK 후 rethrow — PostgreSQL DDL은 트랜잭셔널)
- `renderMigrationSql`은 동일 SQL을 주석 헤더와 함께 이어 붙인 순수 문자열(버전 테이블 관리 문 제외) —
  Flyway/dbmate 사용자는 이것을 자기 마이그레이션 파일로 저장한다.
- 향후 마이그레이션 추가는 새 id 추가로만(기존 id의 SQL 수정 = breaking, 금지).

## 5. 팩토리 — createTossPaymentsPostgres

```ts
export interface TossPaymentsPostgresOptions {
  readonly sql: SqlClient;
  readonly schema?: string;                       // 기본 'toss_payments'
  readonly dedupe?: {
    readonly leaseSeconds?: number;               // 기본 60
    readonly completedTtlSeconds?: number;        // 기본 432_000 (5일)
  };
  readonly retention?: {
    readonly cancelRetryDays?: number;            // 기본 15 (멱등키 유효기간)
  };
}

export interface TossPaymentsPostgres {
  readonly orders: OrderStore;
  readonly depositSecrets: DepositSecretStore;
  readonly billingKeys: BillingKeyStore;
  readonly cancelRetries: CancelRetryStore;
  readonly webhookDedupe: WebhookDedupeStore;
  readonly audit: AuditSink & { flush(): Promise<void> };
  readonly inbox: WebhookInboxStore;              // record(webhook): Promise<void>
  migrate(): Promise<MigrationResult>;
  cleanup(): Promise<CleanupResult>;              // { dedupeDeleted, cancelRetriesDeleted }
}
```

- 팩토리는 순수 조립(즉시 DB 접속 없음) — 첫 쿼리가 첫 접점.
- 파사드 배선(골든 패스):

```ts
const pg = createTossPaymentsPostgres({ sql: fromPgPool(pool) });
const toss = createTossPayments(defineTossPaymentsConfig({
  secretKey,
  orders: pg.orders,
  depositSecrets: pg.depositSecrets,
  billingKeys: pg.billingKeys,
  cancelRetries: pg.cancelRetries,
  webhook: { dedupe: pg.webhookDedupe, /* ...verifier config */ },
  audit: { sink: pg.audit },
}));
```

- 에러 모델: 이 패키지의 스토어는 **throw**한다(코어가 store-failure Err로 감싸는 계약).
  던지는 에러는 `TossPostgresError`(code: `'invalid-identifier' | 'order-conflict' |
  'unsafe-amount' | 'invalid-row' | 'migration-failed'`) + `isTossPostgresError` 타입 가드.
  드라이버 에러는 감싸지 않고 그대로 통과(cause 체인 보존 — 코어가 cause로 동봉).
  **어떤 에러 메시지에도 secret·billingKey 값 미포함.**

## 6. cleanup — TTL 행 정리

`cleanup()`은 명시 호출 전용(자동 타이머 없음 — 모든 옵션 기본 꺼짐):
- `webhook_dedupe`: `state='completed' AND completed_at < now() - completedTtl` DELETE.
- `cancel_retries`: `recorded_at < now() - cancelRetryDays` DELETE.
- `audit_entries`·`webhook_inbox`·`orders`·`deposit_secrets`는 지우지 않는다 — 보관 정책은
  소비자 책임(README 명시). 반환값으로 삭제 건수 보고.
- README에 실행 예시: NestJS `@Cron`, pg_cron, 배포 스크립트.

## 7. `/nestjs` 서브패스

toss-payments-nestjs 선례를 그대로 미러링:

- `TOSS_PAYMENTS_POSTGRES: unique symbol = Symbol.for('@gj-kit/toss-payments-postgresql:stores')`
  — ESM/CJS 이중 로드 대비 전역 심볼 레지스트리.
- `InjectTossPaymentsPostgres(): ParameterDecorator` — 명시적 `Inject(토큰)` 위임,
  design:paramtypes 미사용(SWC/esbuild 무설정 동작).
- `TossPaymentsPostgresModule.forRoot(options: TossPaymentsPostgresOptions & { global?: boolean })`
  — `useValue: createTossPaymentsPostgres(options)`, global 기본 true.
- `forRootAsync({ imports?, inject?, useFactory: (...deps) => Options | Promise<Options>, global? })`.
- 모듈은 `TOSS_PAYMENTS_POSTGRES` 단일 토큰으로 `TossPaymentsPostgres` 집합체를 제공·export한다 —
  스토어별 토큰 6개를 쪼개지 않는다(배선 누락 여지 제거, 코어 파사드가 이미 조건부 타입으로
  미배선을 컴파일 에러로 만든다).
- 골든 패스: `TossPaymentsModule.forRootAsync({ imports: [TossPaymentsPostgresModule.forRootAsync(...)],
  inject: [TOSS_PAYMENTS_POSTGRES], useFactory: (pg) => defineTossPaymentsConfig({...}) })`.
- migrate는 모듈이 자동 실행하지 않는다 — README가 `main.ts`에서 `await pg.migrate()` 후
  `app.listen` 순서를 골든 패스로 제시.

## 8. 테스트 3계층

- **unit** (`tests/unit/**/*.test.ts`, 네트워크·DB 없음): 스크립트드 fake `SqlClient`
  (실행된 SQL·파라미터 기록 + 준비된 rows 반환)로 — 식별자 검증, row↔record 매핑(왕복 무손실,
  bigint string→number, unsafe-amount), saveOrder 충돌 판정 분기, claim outcome 매핑
  (`claimed`/`processing`/`completed`/null→processing), audit flush 대기, inbox 래퍼
  (record→handler 순서, 삼킴/failOnRecordError), fromPgPool release(err) 경로,
  NestJS 모듈 주입 왕복(Nest Testing Module + fake SqlClient).
- **type** (`tests/types/**/*.test-d.ts`): 스토어 6종이 코어 인터페이스에 대입 가능
  (`expectTypeOf`), `pg.Pool`이 `PgPoolLike`에 구조적 대입 가능, 파사드 config 스프레드가
  컴파일, `@ts-expect-error` 픽스처(잘못된 옵션 등).
- **integration** (`tests/integration/**/*.integration.test.ts`, **실 PostgreSQL 필요**):
  루트 `.env`의 `TOSS_PG_TEST_DATABASE_URL` 사용(`.env.example`에 추가), 테스트마다 임의
  스키마 생성→검증→DROP으로 격리. 필수 시나리오: migrate 멱등(2회 실행 skipped),
  스토어 6종 왕복, saveOrder 동일값 멱등/상이값 conflict, `Promise.all` 동시 claim N건 중
  정확히 1건 'claimed'(원자성 증명), lease 만료 후 재점유, complete→claim='completed',
  release 후 재claim, cleanup 삭제 건수, inbox deliveries 증가, bodyJson 특수문자
  (유니코드 이스케이프·이모지) 바이트 왕복. `fileParallelism: false` 유지.
  docker 편의: `toss-payments-postgresql/docker-compose.yml`(postgres 1개) 동봉.

## 9. 문서·릴리스

- README 한국어 단일, toss-payments-nestjs 구조 미러링: ① 한 문단 요약 ② 원칙 경계
  (runtime deps 0 — pg조차 peer 아님, `/nestjs`만 optional peer) ③ 설치 ④ 골든 패스
  (pool → fromPgPool → createTossPaymentsPostgres → migrate → defineTossPaymentsConfig 배선)
  ⑤ NestJS 배선 ⑥ 웹훅(dedupe + inbox) ⑦ 운영(cleanup·보관 책임·암호화 안내·리드 레플리카 금지 —
  스토어는 반드시 primary를 보는 SqlClient로) ⑧ 공개 표면 표 ⑨ handoff 절차.
- changeset minor(0.1.0 신규), 커밋 컨벤션 `feat(toss-payments-postgresql): ...` 본문 한국어.
- 루트 스크립트 체인(check:readme 등)에 새 패키지 `--filter` 추가.

## 10. 기각·보류

| 항목 | 판정 | 사유 |
|---|---|---|
| ORM(Drizzle 등) 기반 | 기각 | 런타임 의존 발생 + 소비 앱 ORM 강제 (사용자 결정) |
| 부팅 시 자동 마이그레이션 | 기각 | 프로덕션 DB 임의 DDL 위험 — 명시 호출만 |
| 스토어별 DI 토큰 분리 | 기각 | 배선 누락 여지만 늘림 — 집합체 단일 토큰 |
| jsonb로 CancelRetryRecord 저장 | 기각 | bodyJson 바이트 계약 파괴 위험(NUL 거부·정규화) |
| payment state snapshot 테이블 | 보류(v2 후보) | 코어 계약 없음 — Result 처리 지점 헬퍼로 별도 설계 |
| at-rest 암호화 seam | 보류(v2 후보) | 키 관리 표면 설계 필요 — v1은 DB 레벨 암호화 안내로 갈음 |
| audit 배치 insert | 보류 | v1 즉시 insert로 충분(코어가 비동기 fire-and-forget) |
| pg peer 승격 | 기각 | 구조적 타입으로 충분 — deps·peer 0 유지 |
