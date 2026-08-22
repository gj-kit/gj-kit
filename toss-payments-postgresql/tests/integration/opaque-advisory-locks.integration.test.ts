/**
 * opaque advisory lifecycle lock — 실 PostgreSQL cross-connection 직렬화 증명.
 *
 * 단위 fake는 advisory lock이 실제 다른 pool connection을 막는지 보장할 수 없다. 이 파일은
 * 두 aggregate instance가 같은 nonsecret blind-index를 잡을 때, 첫 callback이 끝나기 전에는
 * 두 번째 callback이 시작되지 않는다는 PostgreSQL 레벨의 증거다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateCustomerKey } from '@gj-kit/toss-payments/server';

import {
  createOpaqueAdvisoryLockKey,
  createTossPaymentsPostgres,
  unsafePlaintextSensitiveValueProtector,
} from '../../src/index';
import type { SqlClient, TossPaymentsPostgres } from '../../src/index';
import { createTestContext } from './helpers';
import type { PgTestContext } from './helpers';

let ctx: PgTestContext;
let firstInstance: TossPaymentsPostgres;

beforeAll(() => {
  ctx = createTestContext(2);
  // lock facility 자체는 package schema/table/migration을 쓰지 않는다. schema는 advisory
  // namespace 분리에만 사용하므로, aggregate 두 개가 같은 schema 설정을 갖는지만 고정한다.
  firstInstance = createTossPaymentsPostgres({
    sql: ctx.sql,
    schema: ctx.schema,
    sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
  });
});

afterAll(async () => {
  await ctx.pool.end();
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * second instance가 opaque lock query를 session에 제출한 정확한 시점만 관찰한다. scheduler 시간을
 * 임의로 기다리지 않아도, 그 이후 callback이 아직 시작되지 않았음을 증명할 수 있다.
 */
function observeOpaqueLockStart(sql: SqlClient, onLockQueryStarted: () => void): SqlClient {
  let reported = false;
  return {
    query: (text, params) => sql.query(text, params),
    withConnection: (operation) =>
      sql.withConnection((session) =>
        operation({
          query(text, params) {
            const result = session.query(text, params);
            if (
              !reported &&
              text.includes('pg_advisory_xact_lock(hashtext($1), hashtext($2))') &&
              typeof params?.[0] === 'string' &&
              params[0].startsWith('@gj-kit/toss-payments-postgresql:opaque-advisory-lock:')
            ) {
              reported = true;
              onLockQueryStarted();
            }
            return result;
          },
        }),
      ),
  };
}

describe('TossPaymentsPostgres.opaqueLocks', () => {
  it('서로 다른 aggregate/pool connection의 같은 blind-index lifecycle callback을 직렬화한다', async () => {
    const lockKey = createOpaqueAdvisoryLockKey('v1:billing-credential:blind-index-for-integration');
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondLockQueryStarted = deferred<void>();
    const phases: string[] = [];
    const observedSecondInstance = createTossPaymentsPostgres({
      sql: observeOpaqueLockStart(ctx.sql, () => secondLockQueryStarted.resolve()),
      schema: ctx.schema,
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
    });

    const first = firstInstance.opaqueLocks.withLock(lockKey, async () => {
      phases.push('first:entered');
      firstEntered.resolve();
      await releaseFirst.promise;
      phases.push('first:finished');
    });
    await firstEntered.promise;

    const second = observedSecondInstance.opaqueLocks.withLock(lockKey, async () => {
      phases.push('second:entered');
      phases.push('second:finished');
    });
    await secondLockQueryStarted.promise;

    // second lock query는 PostgreSQL에 이미 도달했지만 first xact lock이 살아 있다.
    expect(phases).toEqual(['first:entered']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(phases).toEqual([
      'first:entered',
      'first:finished',
      'second:entered',
      'second:finished',
    ]);
  });

  it('combined billing mutation은 다른 customerKey여도 same opaque lock을 먼저 잡아 cross-connection lifecycle을 직렬화한다', async () => {
    const lockKey = createOpaqueAdvisoryLockKey('v1:billing-credential:combined-blind-index');
    const firstCustomerKey = generateCustomerKey();
    const secondCustomerKey = generateCustomerKey();
    const firstEntered = deferred<void>();
    const releaseFirst = deferred<void>();
    const secondOpaqueLockQueryStarted = deferred<void>();
    const phases: string[] = [];
    const observedSecondInstance = createTossPaymentsPostgres({
      sql: observeOpaqueLockStart(ctx.sql, () => secondOpaqueLockQueryStarted.resolve()),
      schema: ctx.schema,
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
    });

    const first = firstInstance.billingKeys.withOpaqueMutationLock(
      lockKey,
      firstCustomerKey,
      async (mutation) => {
        expect(mutation.customerKey).toBe(firstCustomerKey);
        phases.push('first:entered');
        firstEntered.resolve();
        await releaseFirst.promise;
        phases.push('first:finished');
      },
    );
    await firstEntered.promise;

    const second = observedSecondInstance.billingKeys.withOpaqueMutationLock(
      lockKey,
      secondCustomerKey,
      async (mutation) => {
        expect(mutation.customerKey).toBe(secondCustomerKey);
        phases.push('second:entered');
        phases.push('second:finished');
      },
    );
    await secondOpaqueLockQueryStarted.promise;

    // customer keys differ: this blockage can only be the opaque lock, and the second callback
    // cannot run before it later acquires its own customer mutation lock.
    expect(phases).toEqual(['first:entered']);

    releaseFirst.resolve();
    await Promise.all([first, second]);

    expect(phases).toEqual([
      'first:entered',
      'first:finished',
      'second:entered',
      'second:finished',
    ]);
  });
});
