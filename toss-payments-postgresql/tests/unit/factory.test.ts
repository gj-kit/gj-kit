/**
 * §5 createTossPaymentsPostgres — 순수 조립 팩토리 + §6 cleanup.
 *
 * 계약: 팩토리는 즉시 DB 접속이 없고(첫 쿼리가 첫 접점), 스키마 검증만 조립 시점에
 * 수행한다. cleanup은 명시 호출 전용이며 dedupe/cancel_retries 두 테이블만 지운다 —
 * 건수 판정은 RETURNING rows로 한다(rowCount 미의존).
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { createTossPaymentsPostgres } from '../../src/factory';
import { unsafePlaintextSensitiveValueProtector } from '../../src/sensitive-values';
import { createFakeSql, norm } from './helpers/fake-sql';

const DEVELOPMENT_SENSITIVE_VALUES = { sensitiveValueProtector: unsafePlaintextSensitiveValueProtector } as const;

describe('§5 팩토리 — 순수 조립', () => {
  it('조립 시점에 어떤 쿼리도 실행하지 않고 표면 전체를 반환한다', () => {
    const fake = createFakeSql();

    const pg = createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES });

    expect(fake.calls).toHaveLength(0);
    expect(fake.connections).toBe(0);
    // 스토어 6종 + inbox + migrate/cleanup — 설계 §5 공개 표면 전부
    expect(typeof pg.orders.saveOrder).toBe('function');
    expect(typeof pg.depositSecrets.saveSecret).toBe('function');
    expect(typeof pg.billingKeys.save).toBe('function');
    expect(typeof pg.cancelRetries.save).toBe('function');
    expect(typeof pg.webhookDedupe.claim).toBe('function');
    expect(typeof pg.audit.record).toBe('function');
    expect(typeof pg.audit.flush).toBe('function');
    expect(typeof pg.inbox.record).toBe('function');
    expect(typeof pg.migrate).toBe('function');
    expect(typeof pg.cleanup).toBe('function');
  });

  it('잘못된 스키마는 조립 시점에 invalid-identifier로 throw한다(fail-fast)', () => {
    const fake = createFakeSql();

    let thrown: unknown;
    try {
      createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES, schema: 'Bad Schema' });
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
  });

  it.each([
    ['dedupe.completedTtlSeconds 0', { dedupe: { completedTtlSeconds: 0 } }],
    ['dedupe.completedTtlSeconds 음수', { dedupe: { completedTtlSeconds: -1 } }],
    ['retention.cancelRetryDays NaN', { retention: { cancelRetryDays: Number.NaN } }],
    // make_interval(days => $1)의 days는 PostgreSQL integer — 소수는 첫 cleanup()에서야
    // 드라이버 에러로 터지므로 조립 시점 fail-fast로 막는다
    ['retention.cancelRetryDays 소수', { retention: { cancelRetryDays: 0.5 } }],
    ['dedupe.leaseSeconds Infinity', { dedupe: { leaseSeconds: Number.POSITIVE_INFINITY } }],
  ])('잘못된 수치 옵션(%s)은 조립 시점에 TypeError로 거부한다', (_label, options) => {
    const fake = createFakeSql();
    expect(() =>
      createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES, ...options }),
    ).toThrow(TypeError);
  });

  it('schema 옵션이 스토어 SQL과 migrate에 일관되게 전파된다', async () => {
    const fake = createFakeSql();
    const pg = createTossPaymentsPostgres({
      sql: fake,
      ...DEVELOPMENT_SENSITIVE_VALUES,
      schema: 'custom_schema',
    });

    await pg.orders.loadOrder('order_x' as never);
    expect(fake.calls[0]?.text).toContain('"custom_schema".orders');

    await pg.migrate();
    const migrateTexts = fake.calls.filter((call) => call.via === 'session');
    expect(migrateTexts.some((call) => call.text.includes('"custom_schema".toss_pg_migrations'))).toBe(
      true,
    );
  });

  it('dedupe.leaseSeconds 옵션이 claim 파라미터로 전달된다', async () => {
    const fake = createFakeSql();
    const pg = createTossPaymentsPostgres({
      sql: fake,
      ...DEVELOPMENT_SENSITIVE_VALUES,
      dedupe: { leaseSeconds: 42 },
    });

    await pg.webhookDedupe.claim('evt-1');

    expect(fake.calls[0]?.params).toEqual(['evt-1', 42]);
  });
});

describe('§6 cleanup — TTL 행 정리', () => {
  it('dedupe completed → cancel_retries 순서로 DELETE ... RETURNING을 실행하고 건수를 보고한다', async () => {
    const fake = createFakeSql();
    fake.enqueueRows([{ deleted: 1 }, { deleted: 1 }]); // webhook_dedupe 2건
    fake.enqueueRows([{ deleted: 1 }]); // cancel_retries 1건
    const pg = createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES });

    const result = await pg.cleanup();

    expect(result).toEqual({ dedupeDeleted: 2, cancelRetriesDeleted: 1 });
    expect(fake.calls).toHaveLength(2);

    const dedupeText = norm(fake.calls[0]?.text ?? '');
    expect(dedupeText).toContain('DELETE FROM "toss_payments".webhook_dedupe');
    expect(dedupeText).toContain("state = 'completed'");
    expect(dedupeText).toContain('completed_at < now() - make_interval(secs => $1)');
    expect(dedupeText).toContain('RETURNING 1 AS deleted'); // rowCount 미의존
    expect(fake.calls[0]?.params).toEqual([432_000]); // 기본 5일

    const cancelText = norm(fake.calls[1]?.text ?? '');
    expect(cancelText).toContain('DELETE FROM "toss_payments".cancel_retries');
    expect(cancelText).toContain('recorded_at < now() - make_interval(days => $1)');
    expect(fake.calls[1]?.params).toEqual([15]); // 기본 멱등키 유효기간
  });

  it('TTL 옵션이 파라미터로 전달된다', async () => {
    const fake = createFakeSql();
    const pg = createTossPaymentsPostgres({
      sql: fake,
      ...DEVELOPMENT_SENSITIVE_VALUES,
      dedupe: { completedTtlSeconds: 3600 },
      retention: { cancelRetryDays: 3 },
    });

    await pg.cleanup();

    expect(fake.calls[0]?.params).toEqual([3600]);
    expect(fake.calls[1]?.params).toEqual([3]);
  });

  it('지운 행이 없으면 0건을 보고한다', async () => {
    const fake = createFakeSql();
    const pg = createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES });

    await expect(pg.cleanup()).resolves.toEqual({ dedupeDeleted: 0, cancelRetriesDeleted: 0 });
  });
});

describe('§5 migrate 위임', () => {
  it('pg.migrate()는 팩토리 스키마로 migrate를 실행해 MigrationResult를 반환한다', async () => {
    const fake = createFakeSql();
    const pg = createTossPaymentsPostgres({ sql: fake, ...DEVELOPMENT_SENSITIVE_VALUES });

    const result = await pg.migrate();

    expect(result).toEqual({ applied: ['0001_init'], skipped: [] });
    expect(fake.connections).toBe(1);
  });
});
