/**
 * §8 type — 팩토리 옵션 오용 = 컴파일 에러 + 파사드 config 스프레드 컴파일 (설계 §5).
 *
 * 골든 패스(pool → fromPgPool → createTossPaymentsPostgres → defineTossPaymentsConfig
 * 배선)가 캐스팅 없이 컴파일된다는 사실이 이 패키지의 존재 이유("설계하는 일"이 아니라
 * "설정하는 일")의 타입 증거다. 옵션 오타·타입 위반은 첫 쿼리가 아니라 컴파일에서 막는다.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createTossPayments, defineTossPaymentsConfig } from '@gj-kit/toss-payments/server';
import type { ApiSecretKey, BillingFlow, ConfirmFlow } from '@gj-kit/toss-payments/server';
import type { WebhookVerifier } from '@gj-kit/toss-payments/webhook';

import { advisoryLockKey, createTossPaymentsPostgres, migrate, renderMigrationSql } from '../../src/index';
import type {
  CleanupResult,
  MigrationResult,
  PgBillingKeyStore,
  PgBillingKeyMutation,
  SensitiveValueProtector,
  SqlClient,
  SqlExecutor,
  TossPaymentsPostgres,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

const sql = forge<SqlClient>();
const sensitiveValueProtector = forge<SensitiveValueProtector>();

describe('§5 createTossPaymentsPostgres — 옵션 표면', () => {
  it('정상 옵션 전부 지정이 컴파일된다', () => {
    void createTossPaymentsPostgres({ sql, sensitiveValueProtector });
    void createTossPaymentsPostgres({
      sql,
      sensitiveValueProtector,
      schema: 'payments_prod',
      dedupe: { leaseSeconds: 60, completedTtlSeconds: 432_000 },
      retention: { cancelRetryDays: 15 },
    });
  });

  it('오용 = 컴파일 에러 — sql 누락·오타 키·타입 위반', () => {
    // @ts-expect-error sql·sensitiveValueProtector 누락 — secure-by-default 조립은 성립하지 않는다
    createTossPaymentsPostgres({});
    // @ts-expect-error protector 누락 — raw 저장 fallback은 공개 타입에서 차단한다
    createTossPaymentsPostgres({ sql });
    // @ts-expect-error sql은 SqlClient여야 한다 — SqlExecutor에는 withConnection(migrate 단일 세션 요건)이 없다
    createTossPaymentsPostgres({ sql: forge<SqlExecutor>(), sensitiveValueProtector });
    // @ts-expect-error 잘못된 옵션 키(schemas) — 오타가 침묵으로 기본값이 되는 사고 차단
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, schemas: 'toss_payments' });
    // @ts-expect-error schema는 string
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, schema: 123 });
    // @ts-expect-error leaseSeconds에 string — 숫자만
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, dedupe: { leaseSeconds: '60' } });
    // @ts-expect-error completedTtlSeconds에 string — 숫자만
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, dedupe: { completedTtlSeconds: '5d' } });
    // @ts-expect-error dedupe 내부 오타 키(leaseSecond)
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, dedupe: { leaseSecond: 60 } });
    // @ts-expect-error cancelRetryDays에 string — 숫자만
    createTossPaymentsPostgres({ sql, sensitiveValueProtector, retention: { cancelRetryDays: '15' } });
  });

  it('migrate/cleanup — 결과 타입 고정(운영 스크립트가 의존하는 표면)', () => {
    const pg = createTossPaymentsPostgres({ sql, sensitiveValueProtector });
    expectTypeOf(pg.migrate).toEqualTypeOf<() => Promise<MigrationResult>>();
    expectTypeOf(pg.cleanup).toEqualTypeOf<() => Promise<CleanupResult>>();
    expectTypeOf(pg.billingKeys).toEqualTypeOf<PgBillingKeyStore>();
    void pg.billingKeys.withMutationLock(
      forge<import('@gj-kit/toss-payments/server').BillingKeyRecord['customerKey']>(),
      (mutation) => {
        expectTypeOf(mutation).toEqualTypeOf<PgBillingKeyMutation>();
      },
    );
  });
});

describe('§4 migrate — SqlClient 필수(트랜잭션·advisory lock의 단일 세션 요구)', () => {
  it('SqlExecutor만으로는 migrate 불가', () => {
    void migrate(sql);
    void migrate(sql, { schema: 'toss_payments' });
    // @ts-expect-error withConnection 없는 실행기 — 트랜잭션이 풀의 다른 커넥션으로 흩어질 수 있는 형태는 거부
    migrate(forge<SqlExecutor>());
    // @ts-expect-error 잘못된 옵션 키
    migrate(sql, { schemaName: 'x' });

    expectTypeOf(renderMigrationSql).returns.toEqualTypeOf<string>();
    expectTypeOf(advisoryLockKey).returns.toEqualTypeOf<bigint>();
  });
});

describe('§5 골든 패스 — 반환 집합체가 defineTossPaymentsConfig에 그대로 배선된다', () => {
  const sk = forge<ApiSecretKey<'test'>>();
  const pg: TossPaymentsPostgres = createTossPaymentsPostgres({ sql, sensitiveValueProtector });

  it('6개 seam 전부 배선한 실제 코어 config 호출이 컴파일된다 — 캐스팅 0', () => {
    const config = defineTossPaymentsConfig({
      secretKey: sk,
      orders: pg.orders,
      depositSecrets: pg.depositSecrets,
      billingKeys: pg.billingKeys,
      cancelRetries: pg.cancelRetries,
      webhook: { dedupe: pg.webhookDedupe },
      audit: { sink: pg.audit },
    });
    const kit = createTossPayments(config);
    // 배선 판정 보존 — orders → confirm, billingKeys → billing, webhook → webhook
    expectTypeOf(kit.confirm).toEqualTypeOf<ConfirmFlow<'test'>>();
    expectTypeOf(kit.billing).toEqualTypeOf<BillingFlow<'test', {}>>();
    expectTypeOf(kit.webhook).toEqualTypeOf<WebhookVerifier>();
  });

  it('seam끼리 자리를 바꿔 꽂을 수 없다 — 계약 인터페이스가 상호 배타다', () => {
    // @ts-expect-error inbox는 WebhookDedupeStore가 아니다 — 코어 seam이 아닌 이 패키지 고유 표면(§3.7)
    defineTossPaymentsConfig({ secretKey: sk, webhook: { dedupe: pg.inbox } });
    // @ts-expect-error OrderStore 자리에 BillingKeyStore 불가 — 잘못된 배선은 컴파일이 막는다
    defineTossPaymentsConfig({ secretKey: sk, orders: pg.billingKeys });
  });
});
