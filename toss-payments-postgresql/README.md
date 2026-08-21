# @gj-kit/toss-payments-postgresql

[`@gj-kit/toss-payments`](../toss-payments/README.md)가 공개한 저장소 주입 seam 6종 — 주문 금액 원본(`OrderStore`), 가상계좌 secret(`DepositSecretStore`), 빌링키(`BillingKeyStore`), 취소 재시도 티켓(`CancelRetryStore`), 웹훅 중복 제거(`WebhookDedupeStore`), 감사 로그(`AuditSink`) — 의 PostgreSQL 구현입니다. 테이블 7종과 마이그레이션을 이 패키지가 소유하므로 프로덕션 채택이 "테이블을 설계하는 일"이 아니라 "설정하는 일"이 됩니다. 웹훅 dedupe의 `claim`은 단일 문 CTE로 원자적으로 전이해 동시 재전송 N건 중 정확히 1건만 처리권을 얻고, 코어에 seam이 없는 이벤트 원문 보존은 웹훅 inbox 헬퍼(`withWebhookInbox`)로 제공합니다.

> **원칙 경계**: direct runtime dependency 0 — **`pg`조차 peer가 아닙니다.** `fromPgPool`은 구조적 타입 `PgPoolLike`만 소비하므로 `pg.Pool`이 그대로 대입되고, TypeORM 등 다른 드라이버 사용자는 `SqlClient`를 직접 구현하면 됩니다. `@nestjs/common`·`reflect-metadata`·`rxjs`는 `./nestjs` 서브패스 전용 optional peer이며, 루트 엔트리 `.`는 Nest 없이 동작합니다. 코어 공개 계약은 **구현만** 하고 재정의·확장하지 않습니다.

## 설치

```sh
pnpm add @gj-kit/toss-payments @gj-kit/toss-payments-postgresql
pnpm add pg   # 앱이 선택한 드라이버 — 이 패키지의 peer가 아닙니다
```

NestJS 배선(`./nestjs`)까지 쓰려면 [`@gj-kit/toss-payments-nestjs`](../toss-payments-nestjs/README.md)를 함께 설치하세요. Nest 앱에는 보통 이미 `@nestjs/common`, `reflect-metadata`, `rxjs`가 있습니다. 모든 주입은 명시적 토큰이므로 `emitDecoratorMetadata` 없이 SWC·esbuild에서도 동작합니다.

## 골든 패스 — Pool 하나로 저장소 6종 + 파사드 배선

`createTossPaymentsPostgres`는 **순수 조립**입니다: 즉시 DB에 접속하지 않고 첫 쿼리가 첫 접점이며, 조립 시점에는 스키마 식별자 검증만 수행합니다(`/^[a-z_][a-z0-9_]{0,62}$/` 위반 시 즉시 throw — 설정 문자열이 SQL에 보간되는 유일한 지점의 봉쇄).

```ts
// payments/toss.ts — Pool → SqlClient → 집합체 → 코어 파사드
import { Pool } from 'pg';
import { orThrow } from '@gj-kit/toss-payments';
import {
  createTossPayments,
  defineTossPaymentsConfig,
  parseApiSecretKey,
} from '@gj-kit/toss-payments/server';
import { createTossPaymentsPostgres, fromPgPool } from '@gj-kit/toss-payments-postgresql';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 순수 조립 — 즉시 DB 접속 없음, 자동 DDL 없음, 자동 cleanup 타이머 없음.
export const pg = createTossPaymentsPostgres({
  sql: fromPgPool(pool),
  // schema: 'toss_payments',                                  // 기본값
  // dedupe: { leaseSeconds: 60, completedTtlSeconds: 432_000 }, // 기본값 (5일)
  // retention: { cancelRetryDays: 15 },                       // 기본값 — 토스 멱등키 유효기간
});

export const tossConfig = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders: pg.orders,                 // 금액 대조의 단일 진실 공급원 — insert-only, 동일값 재저장만 멱등
  depositSecrets: pg.depositSecrets, // 1회 배선 → confirm측 자동 저장 + 웹훅측 대조 양쪽 커버
  billingKeys: pg.billingKeys,
  cancelRetries: pg.cancelRetries,
  webhook: { dedupe: pg.webhookDedupe, autoRefetch: true },
  audit: { sink: pg.audit },
});

export const toss = createTossPayments(tossConfig);
```

부팅 시퀀스는 항상 **migrate → listen** 순서입니다. 이 패키지는 부팅 시 자동 DDL을 실행하지 않습니다 — `migrate()`는 명시 호출 전용입니다.

```ts
// server.ts — migrate가 끝난 뒤에만 트래픽을 받는다
import { pg } from '@/payments/toss';

const result = await pg.migrate();
console.log(`toss migrate — applied: [${result.applied.join(', ')}] skipped: [${result.skipped.join(', ')}]`);
// 이후 서버 listen 시작
```

`migrate()`의 계약:

- **단일 커넥션 + 단일 트랜잭션** — PostgreSQL DDL은 트랜잭셔널이라 중간 실패가 반쪽 스키마를 남기지 않습니다. 실패 시 ROLLBACK 후 `migration-failed`로 감싸 rethrow합니다(원인은 `cause` 체인).
- **동시 부팅 직렬화** — `pg_advisory_xact_lock`으로 여러 인스턴스의 동시 migrate를 직렬화합니다. 락 키는 `'@gj-kit/toss-payments-postgresql:' + schema`의 FNV-1a 64bit 해시이며, `advisoryLockKey(schema)`로 어디서든 재계산할 수 있습니다.
- **멱등** — 적용된 id는 버전 테이블 `toss_pg_migrations`에 기록되고, 두 번째 실행은 전부 `skipped`로 보고됩니다.

Flyway/dbmate 등 자체 마이그레이션 도구를 쓴다면 SQL 원문을 꺼내 저장하세요:

```ts
// scripts/render-toss-sql.ts — 자체 마이그레이션 도구 사용자
import { renderMigrationSql } from '@gj-kit/toss-payments-postgresql';

const script = renderMigrationSql({ schema: 'toss_payments' });
// migrate()와 동일한 SQL(버전 테이블 관리 문 제외) — V0001__toss_payments_init.sql 등으로 저장
console.log(script);
```

## NestJS 배선

`TossPaymentsPostgresModule`은 `TOSS_PAYMENTS_POSTGRES` **단일 토큰**으로 `TossPaymentsPostgres` 집합체 전체를 제공·export합니다. 스토어별 토큰 6개로 쪼개지 않습니다 — 배선 누락 여지를 없애고, 미배선 플로우는 코어 파사드의 조건부 타입이 이미 컴파일 에러로 만듭니다.

config는 `defineTossPaymentsConfig`로 정의 시점에 고정하고, kit 타입은 `TossPaymentsFor`로 복원하세요:

```ts
// payments/toss.config.ts — config 정의 시점에 kit 타입을 고정한다
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import type { TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';

export const buildTossConfig = (pg: TossPaymentsPostgres) =>
  defineTossPaymentsConfig({
    secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
    orders: pg.orders,
    depositSecrets: pg.depositSecrets,
    billingKeys: pg.billingKeys,
    cancelRetries: pg.cancelRetries,
    webhook: { dedupe: pg.webhookDedupe, autoRefetch: true },
    audit: { sink: pg.audit },
  });

export type AppToss = TossPaymentsFor<ReturnType<typeof buildTossConfig>>;
```

```ts
// app.module.ts — 집합체 모듈 → 코어 파사드 모듈 연쇄
import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';
import { fromPgPool } from '@gj-kit/toss-payments-postgresql';
import {
  TOSS_PAYMENTS_POSTGRES,
  TossPaymentsPostgresModule,
} from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import { buildTossConfig } from '@/payments/toss.config';

@Module({
  imports: [
    TossPaymentsModule.forRootAsync({
      // useFactory가 주입받을 provider는 이 imports에서 와야 한다 (Nest DynamicModule 규칙)
      imports: [
        TossPaymentsPostgresModule.forRootAsync({
          useFactory: () => ({
            sql: fromPgPool(new Pool({ connectionString: process.env.DATABASE_URL })),
          }),
        }),
      ],
      inject: [TOSS_PAYMENTS_POSTGRES],
      useFactory: (pg: TossPaymentsPostgres) => buildTossConfig(pg),
    }),
  ],
})
export class AppModule {}
```

두 모듈 모두 기본값이 `global: true`입니다. 모듈 경계를 엄격히 유지하려면 `{ global: false }`를 명시하고 필요한 feature module에 직접 import하세요.

migrate는 모듈이 자동 실행하지 않습니다 — `main.ts`에서 `await pg.migrate()` 후 `app.listen`이 골든 패스입니다:

```ts
// main.ts — migrate 후 listen (모듈은 자동 DDL을 실행하지 않는다)
import { NestFactory } from '@nestjs/core';
import { TOSS_PAYMENTS_POSTGRES } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import { AppModule } from '@/app.module';

const app = await NestFactory.create(AppModule, { rawBody: true }); // rawBody — 웹훅 검증 전제
const pg = app.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES);
await pg.migrate();
await app.listen(3000);
```

## 웹훅 — dedupe 배선과 inbox

`pg.webhookDedupe`는 코어 `WebhookDedupeStore` 계약의 원자적 구현입니다:

- `claim`은 **단일 문 CTE**로 전이합니다 — 조회 후 생성 2단계(TOCTOU)가 없으므로, 동시 재전송 N건 중 정확히 1건만 `'claimed'`를 받습니다. 이미 처리 중이면 `'processing'`(어댑터가 503 → 토스 재전송), 처리 완료면 `'completed'`(어댑터가 200 ack 후 스킵)입니다.
- 처리 중 크래시에 대비한 lease(기본 60초)가 만료되면 다음 수신이 재점유합니다.
- `completed` 행은 기본 5일(코어 권장 — 토스 최장 재전송 기간보다 길게) 보존되어 재전송을 계속 걸러내고, 삭제는 `cleanup()` 호출 시에만 일어납니다.

웹훅 **inbox**는 스토어 seam이 아니라 `WebhookHandlers`를 감싸는 헬퍼입니다(코어 `claim`에는 이벤트 메타가 전달되지 않으므로 — 코어 계약 무변경). 사업 이벤트 1건 = 1행(`dedupe_key` PK)이고 재전송은 `deliveries` 증가로 관측됩니다. record는 핸들러 **앞**에서 실행되어 핸들러가 실패해도 수신 사실은 남습니다(감사·재처리 목적). 저장본에는 두 가지 정화가 적용됩니다: ① 모든 깊이의 `secret` 키는 `'[REDACTED]'`로 마스킹됩니다 — `PAYMENT_STATUS_CHANGED`의 `data`는 코어 `Payment` 통짜라 가상계좌 결제면 입금 웹훅 위조에 쓰일 수 있는 secret이 실려 오는데, 이 테이블은 무기한 보존되기 때문입니다(핸들러가 받는 이벤트는 원본 그대로입니다). ② jsonb가 저장을 거부하는 U+0000·비페어 서로게이트는 U+FFFD로 치환됩니다 — `failOnRecordError: true`에서 특정 웹훅이 영구 재전송 실패 루프(poison message)가 되는 것을 막습니다.

```ts
// app/api/webhooks/toss/route.ts — Next.js Route Handler (Fetch 표준 어댑터)
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { pg, toss } from '@/payments/toss';

export const POST = toss.webhook.fetchHandler(
  withWebhookInbox(pg.inbox, {
    onDepositCallback: async (webhook) => {
      // trust: 'secret' — 저장된 secret 대조 통과. 가상계좌 입금 반영은 여기서.
    },
    onPaymentStatusChanged: async (webhook) => {
      if (webhook.prefetched?.ok) {
        // payload가 아니라 조회 재확인 결과(prefetched.value)로 상태를 갱신한다
      }
    },
  }),
);
```

Nest 컨트롤러에서는 [`toNestWebhookHandler`](../toss-payments-nestjs/README.md#웹훅을-추가한다면-rawbody부터)에 감싼 handlers를 그대로 넘깁니다(부트스트랩의 `rawBody: true` 전제):

```ts
// webhooks/toss-webhook.controller.ts
import { Controller, Post, Req, Res } from '@nestjs/common';
import type { NodeServerResponseLike } from '@gj-kit/toss-payments/webhook';
import { InjectTossPayments, toNestWebhookHandler } from '@gj-kit/toss-payments-nestjs';
import type { NestWebhookRequest } from '@gj-kit/toss-payments-nestjs';
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { InjectTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { AppToss } from '@/payments/toss.config';

@Controller('webhooks')
export class TossWebhookController {
  private readonly handle;

  constructor(
    @InjectTossPayments() toss: AppToss,
    @InjectTossPaymentsPostgres() pg: TossPaymentsPostgres,
  ) {
    this.handle = toNestWebhookHandler(
      toss.webhook,
      withWebhookInbox(pg.inbox, {
        onDepositCallback: async (webhook) => {
          // trust: 'secret' — 입금 주문 반영
        },
      }),
    );
  }

  @Post('toss')
  async receive(@Req() req: NestWebhookRequest, @Res() res: NodeServerResponseLike) {
    await this.handle(req, res);
  }
}
```

record 실패의 기본 동작은 **삼키고 통지**입니다 — 관측 계층이 웹훅 가용성을 볼모로 잡지 않습니다(코어 `AuditOptions.onSinkError` 선례). inbox를 내구 계약으로 쓰려면 `failOnRecordError: true`로 바꾸세요:

```ts
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { pg } from '@/payments/toss';

const handlers = withWebhookInbox(
  pg.inbox,
  {
    onPaymentStatusChanged: async (webhook) => {
      /* ... */
    },
  },
  {
    // 기본: record 실패는 삼키고 meta만 통지한다(이벤트 payload가 로그로 새지 않게)
    onRecordError: (cause, meta) => {
      console.error(`[toss-inbox] record 실패 transmissionId=${meta.transmissionId}`, cause);
    },
    // inbox를 내구 계약으로 쓸 때: record 실패 = throw → 어댑터 500 → 토스 재전송
    // failOnRecordError: true,
  },
);
```

래퍼를 거치지 않는 지점에서는 수동으로 기록할 수 있습니다:

```ts
import { pg } from '@/payments/toss';

await pg.inbox.record(webhook); // upsert — 같은 dedupe_key 재수신은 deliveries 증가로 관측
```

## 운영

### cleanup — TTL 행 정리는 명시 호출 전용

`cleanup()`은 자동 타이머가 없습니다(모든 옵션 기본 꺼짐). 삭제 대상은 두 가지뿐입니다: `webhook_dedupe`의 만료된 `completed` 행(기본 5일)과 `cancel_retries`의 만료 행(기본 15일 — 토스 멱등키 유효기간). 주기 실행은 앱이 소유합니다.

```ts
// payments/toss-maintenance.service.ts — @nestjs/schedule 예시
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';

@Injectable()
export class TossMaintenanceService {
  constructor(@InjectTossPaymentsPostgres() private readonly pg: TossPaymentsPostgres) {}

  @Cron('17 4 * * *')
  async cleanup() {
    const { dedupeDeleted, cancelRetriesDeleted } = await this.pg.cleanup();
    console.log(`toss cleanup — dedupe: ${dedupeDeleted}, cancelRetries: ${cancelRetriesDeleted}`);
  }
}
```

DB 쪽에서 돌리려면 pg_cron으로 동일한 삭제를 스케줄합니다. **interval은 팩토리 옵션(`dedupe.completedTtlSeconds`, `retention.cancelRetryDays`)과 반드시 일치**시키세요:

```sql
SELECT cron.schedule('toss-payments-cleanup', '17 4 * * *', $$
  DELETE FROM toss_payments.webhook_dedupe
    WHERE state = 'completed' AND completed_at < now() - interval '5 days';
  DELETE FROM toss_payments.cancel_retries
    WHERE recorded_at < now() - interval '15 days';
$$);
```

graceful shutdown에서는 `pg.audit.flush()`를 호출하세요 — 코어는 audit `record`를 await하지 않으므로(fire-and-forget), flush가 in-flight insert의 정착을 기다립니다(예: Nest `onApplicationShutdown`).

```ts
import { pg } from '@/payments/toss';

await pg.audit.flush(); // 시작된 모든 audit insert의 정착 대기 — 실패는 삼킨다
```

### 보관 책임 — cleanup이 지우지 않는 테이블

`audit_entries`, `webhook_inbox`, `orders`, `deposit_secrets`는 **어떤 경로로도 이 패키지가 삭제하지 않습니다.** `billing_keys`도 `cleanup()`은 지우지 않습니다 — 단 코어 계약 메서드 `BillingKeyStore.delete(customerKey)`(빌링키 삭제 플로우)가 호출되면 해당 고객의 행 1건은 삭제됩니다. 보관 기간·아카이빙·접근 통제는 소비자 책임입니다 — 특히 `audit_entries`(요청/응답 증거)와 `webhook_inbox`(이벤트 원문)는 분쟁 대응 근거이므로 조직의 감사 보존 정책에 따라 관리하세요.

### cancel_retries는 평문이다 — DB 레벨 암호화를 켜라

`cancel_retries.record_json`에는 취소 요청 본문이 그대로 들어가며, 가상계좌 환불이면 **환불 계좌 정보가 평문으로 포함될 수 있습니다.** v1에는 at-rest 암호화 seam이 없으므로 TDE·디스크/백업 암호화 등 DB 레벨 암호화와 테이블 접근 통제를 반드시 적용하세요. 컬럼이 jsonb가 아닌 text인 것은 의도입니다 — `bodyJson`은 멱등 재생의 바이트 계약이라 jsonb 정규화(NUL 거부, 이스케이프/키 정렬)로 원문이 변형될 위험을 원천 배제합니다.

### 스토어는 반드시 primary를 본다 — 리드 레플리카 금지

모든 스토어의 계약은 "저장 성공 반환 = 커밋 완료"(read-after-write 일관성)입니다. `SqlClient`가 리드 레플리카를 향하면 `loadOrder` 금액 대조·`getSecret` 대조가 복제 지연만큼 뒤처진 값을 읽고, `claim`의 원자성 전제도 깨집니다. **`fromPgPool`에 넘기는 Pool(또는 직접 구현한 `SqlClient`)은 반드시 primary 접속이어야 합니다.**

### 다른 드라이버 — TypeORM DataSource로 SqlClient 직접 구현

`SqlClient`가 이 패키지의 유일한 드라이버 접점입니다. 요구는 세 가지뿐입니다: `$1, $2` 위치 파라미터, 실패는 그대로 throw, `withConnection`은 단일 세션 고정(`migrate()`의 트랜잭션·advisory lock용 — 스토어는 전부 단일 문이라 이 경로를 쓰지 않습니다).

```ts
// payments/typeorm-sql-client.ts — SqlClient 직접 구현 예시 (TypeORM DataSource)
import type { DataSource } from 'typeorm';
import type { SqlClient, SqlRow } from '@gj-kit/toss-payments-postgresql';

export function fromTypeOrmDataSource(dataSource: DataSource): SqlClient {
  return {
    async query(text, params) {
      // TypeORM raw query는 pg 드라이버의 rows 배열을 그대로 반환한다
      const rows: SqlRow[] = await dataSource.query(text, params === undefined ? undefined : [...params]);
      return { rows };
    },
    async withConnection(fn) {
      // migrate()의 BEGIN·advisory lock이 한 커넥션에 고정되도록 QueryRunner 1개를 전용한다
      const runner = dataSource.createQueryRunner();
      try {
        return await fn({
          async query(text, params) {
            const rows: SqlRow[] = await runner.query(text, params === undefined ? undefined : [...params]);
            return { rows };
          },
        });
      } finally {
        // migrate()는 실패 경로에서 스스로 ROLLBACK을 시도한 뒤 throw한다
        await runner.release();
      }
    },
  };
}
```

이 DataSource 역시 primary를 향해야 합니다. Prisma/postgres.js도 같은 방식으로 `SqlClient` 두 메서드만 구현하면 됩니다.

## 공개 표면

### `.` (루트)

| export | 설명 |
|---|---|
| `fromPgPool(pool)` | `pg.Pool` → `SqlClient` 구조적 어댑터 — fn throw 시 `release(err)`로 커넥션 폐기 |
| `SqlClient` / `SqlExecutor` / `SqlResult` / `SqlRow` | 드라이버 중립 seam — `$1` 위치 파라미터, `rowCount` 미의존 |
| `PgPoolLike` / `PgPoolClientLike` / `PgQueryResultLike` | `pg`를 import하지 않고 `pg.Pool`이 대입되는 구조적 타입 |
| `createTossPaymentsPostgres(options)` | 스토어 집합체 팩토리 — 순수 조립, 즉시 DB 접속 없음 (`TossPaymentsPostgres` / `TossPaymentsPostgresOptions` / `CleanupResult`) |
| `migrate(sql, { schema? })` | 명시 호출 마이그레이션 — advisory lock 직렬화 + 단일 트랜잭션 + 멱등 (`MigrateOptions` / `MigrationResult`) |
| `renderMigrationSql({ schema? })` | 동일 SQL 전체 스크립트(버전 테이블 관리 문 제외) — Flyway/dbmate 사용자용 |
| `advisoryLockKey(schema)` | migrate가 잡는 FNV-1a 64bit advisory lock 키 재계산 |
| `createPgOrderStore` / `createPgDepositSecretStore` / `createPgBillingKeyStore` / `createPgCancelRetryStore` / `createPgWebhookDedupeStore` / `createPgAuditSink` | 집합체 없이 개별 스토어만 조립할 때 (`PgStoreOptions` / `PgWebhookDedupeStoreOptions` / `PgAuditSink`) |
| `createPgWebhookInboxStore(sql, options?)` / `withWebhookInbox(inbox, handlers, options?)` | 웹훅 이벤트 원문 보존 (`WebhookInboxStore` / `WithWebhookInboxOptions`) |
| `TossPostgresError` / `isTossPostgresError` / `TossPostgresErrorCode` | 이 패키지가 직접 판정한 실패 전용 — code가 공개 계약 |
| `DEFAULT_SCHEMA` / `IDENTIFIER_PATTERN` | 기본 스키마 이름(`'toss_payments'`)과 식별자 허용 패턴 |

### `./nestjs`

| export | 설명 |
|---|---|
| `TOSS_PAYMENTS_POSTGRES` | `Symbol.for` 기반 단일 토큰 — 집합체 전체가 바인딩 (ESM/CJS 이중 로드에도 동일) |
| `InjectTossPaymentsPostgres()` | 명시적 `@Inject(토큰)` 위임 데코레이터 — `design:paramtypes` 미사용 |
| `TossPaymentsPostgresModule.forRoot(options)` | 동기 조립 — `global` 기본 true |
| `TossPaymentsPostgresModule.forRootAsync({ imports?, inject?, useFactory, global? })` | Nest provider 기반 비동기 조립 |
| `TossPaymentsPostgres` / `TossPaymentsPostgresOptions` (type 재export) | 주입부 타이핑 — 루트 엔트리 없이 사용 가능 |

에러 모델: `TossPostgresError.code`는 `'invalid-identifier'`(스키마 식별자 위반) · `'order-conflict'`(saveOrder가 다른 값으로 재저장 시도 — 금액 대조 원본 보호) · `'unsafe-amount'`(bigint가 `Number.isSafeInteger` 범위 밖) · `'invalid-row'`(DB 행이 코어 계약 형태로 복원 불가) · `'migration-failed'` 5종입니다. 메시지가 아니라 **code가 공개 계약**이고, 드라이버 에러는 감싸지 않고 그대로 통과합니다(SQLSTATE 등 cause 체인 보존). 어떤 에러 메시지에도 secret·billingKey 값은 포함되지 않습니다.

## 배포 산출물 handoff

이 패키지는 `@gj-kit/toss-payments`(Nest 배선을 쓰면 `@gj-kit/toss-payments-nestjs`까지)와 같은 release handoff 단위입니다. source workspace link나 수정된 `node_modules`를 전달하지 말고, 깨끗한 source commit에서 release gate를 통과한 뒤 immutable `.tgz`를 소비 앱의 `vendor/`에 함께 고정하세요.

```sh
corepack pnpm run verify:release
artifact_dir="$(mktemp -d)"
npm pack ./toss-payments --pack-destination "$artifact_dir"
npm pack ./toss-payments-postgresql --pack-destination "$artifact_dir"
```

각 tarball에는 package-owned `dist/gj-kit-provenance.json`이 포함됩니다. handoff에는 package별 정확한 version, 전체 `sourceCommit`, tarball SHA-256, provenance JSON을 기록하고, consumer의 `package.json`은 exact `file:vendor/...tgz` dependency로 lockfile까지 함께 갱신합니다. 소비 앱은 tarball과 인접 provenance JSON을 재검증해야 하며, **자신의 PostgreSQL 인스턴스에 대한 `migrate()` 실행·복원(리허설 DB에서 선실행 권장)과 primary 접속 검증**은 release gate와 별개로 수행해야 합니다. 자세한 명령과 manifest 예시는 코어 README의 [배포 산출물과 소비 앱 handoff](../toss-payments/README.md#배포-산출물과-소비-앱-handoff)를 참고하세요.

## 라이선스

MIT
