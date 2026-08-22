/**
 * PostgreSQL billing key mutation lock — 실 DB 동시성 검증.
 *
 * 단위 fake는 advisory lock이 실제 세션을 막는지 증명할 수 없다. 이 파일은 서로 다른
 * aggregate 인스턴스(같은 DB의 별도 pool connection)가 같은 customerKey lifecycle을
 * 경합할 때, 첫 callback의 projection 구간이 끝나기 전에는 두 번째 generic mutation도
 * 시작되지 않는다는 것을 실제 PostgreSQL에서 고정한다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generateCustomerKey } from '@gj-kit/toss-payments/server';
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';

import { createTossPaymentsPostgres, unsafePlaintextSensitiveValueProtector } from '../../src/index';
import type { SqlClient, TossPaymentsPostgres } from '../../src/index';
import { createTestContext, dropSchema } from './helpers';
import type { PgTestContext } from './helpers';

let ctx: PgTestContext;
let firstInstance: TossPaymentsPostgres;
let secondInstance: TossPaymentsPostgres;

beforeAll(async () => {
  ctx = createTestContext(10);
  // 이 파일은 lock/transaction만 검증한다. 평문은 isolated test schema에서 명시적으로만 opt-in.
  firstInstance = createTossPaymentsPostgres({
    sql: ctx.sql,
    schema: ctx.schema,
    sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
  });
  secondInstance = createTossPaymentsPostgres({
    sql: ctx.sql,
    schema: ctx.schema,
    sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
  });
  await firstInstance.migrate();
});

afterAll(async () => {
  await dropSchema(ctx.pool, ctx.schema);
  await ctx.pool.end();
});

function record(customerKey: BillingKeyRecord['customerKey'], billingKey: string): BillingKeyRecord {
  return {
    customerKey,
    billingKey,
    method: '카드',
    issuedAt: '2026-08-22T10:00:00.000Z',
    card: null,
    transfers: null,
  };
}

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
 * Second instance가 advisory lock query를 실제 session에 제출한 시점을 관측한다.
 * 고정 sleep으로 "아마 대기 중"이라고 추측하지 않고, 그 query가 첫 transaction lock을
 * 기다리는 동안 callback body가 시작되지 않는지를 검증한다.
 */
function observeBillingKeyLockStart(sql: SqlClient, onLockQueryStarted: () => void): SqlClient {
  let reported = false;
  return {
    query: (text, params) => sql.query(text, params),
    withConnection: (operation) =>
      sql.withConnection((session) =>
        operation({
          query(text, params) {
            const result = session.query(text, params);
            if (!reported && text.includes('pg_advisory_xact_lock(hashtext($1), hashtext($2))')) {
              reported = true;
              onLockQueryStarted();
            }
            return result;
          },
        }),
      ),
  };
}

describe('PgBillingKeyStore.withMutationLock', () => {
  it('두 issuance의 generic write + projection lifecycle을 customerKey별로 직렬화해 reverse completion을 막는다', async () => {
    const customerKey = generateCustomerKey();
    const original = record(customerKey, 'billing-original');
    const firstIssued = record(customerKey, 'billing-issued-a');
    const secondIssued = record(customerKey, 'billing-issued-b');
    await firstInstance.billingKeys.save(original);

    const firstEntered = deferred<void>();
    const releaseFirstProjection = deferred<void>();
    const secondAttempted = deferred<void>();
    const secondLockQueryStarted = deferred<void>();
    const phases: string[] = [];
    const observedSecondInstance = createTossPaymentsPostgres({
      sql: observeBillingKeyLockStart(ctx.sql, () => secondLockQueryStarted.resolve()),
      schema: ctx.schema,
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
    });

    const first = firstInstance.billingKeys.withMutationLock(customerKey, async (mutation) => {
      await expect(mutation.replaceAndGetPrevious(firstIssued)).resolves.toMatchObject({
        record: original,
      });
      phases.push('first:generic');
      firstEntered.resolve();

      // 실제 앱에서는 이 구간이 같은 customerKey projection(예: Prisma transaction)이다.
      await releaseFirstProjection.promise;
      phases.push('first:projection');
    });
    await firstEntered.promise;

    const second = (async () => {
      secondAttempted.resolve();
      return observedSecondInstance.billingKeys.withMutationLock(customerKey, async (mutation) => {
        const previous = await mutation.replaceAndGetPrevious(secondIssued);
        expect(previous).toMatchObject({ record: firstIssued });
        phases.push('second:generic');
        phases.push('second:projection');
      });
    })();
    await secondAttempted.promise;
    await secondLockQueryStarted.promise;

    // second는 실제 advisory-lock SQL을 session에 제출했지만 first가 아직 transaction을
    // 열고 있으므로 callback body를 시작할 수 없다. 고정 시간 대기가 아닌 lock query
    // 시작 신호라 scheduler가 늦어도 이 assertion이 공허해지지 않는다.
    expect(phases).toEqual(['first:generic']);

    releaseFirstProjection.resolve();
    await Promise.all([first, second]);

    expect(phases).toEqual([
      'first:generic',
      'first:projection',
      'second:generic',
      'second:projection',
    ]);
    expect(await firstInstance.billingKeys.find(customerKey)).toEqual(secondIssued);
  });

  it('callback throw는 generic write를 rollback하고 stale conditional delete는 false로 남긴다', async () => {
    const customerKey = generateCustomerKey();
    const original = record(customerKey, 'billing-original-rollback');
    const issued = record(customerKey, 'billing-issued-rollback');
    await firstInstance.billingKeys.save(original);

    const projectionFailure = new Error('projection failed');
    await expect(
      firstInstance.billingKeys.withMutationLock(customerKey, async (mutation) => {
        await mutation.replaceAndGetPrevious(issued);
        throw projectionFailure;
      }),
    ).rejects.toBe(projectionFailure);
    expect(await firstInstance.billingKeys.find(customerKey)).toEqual(original);

    await secondInstance.billingKeys.save(issued);
    await expect(
      firstInstance.billingKeys.deleteIfBillingKeyMatches({
        customerKey,
        expectedBillingKey: original.billingKey,
      }),
    ).resolves.toBe(false);
    expect(await firstInstance.billingKeys.find(customerKey)).toEqual(issued);
  });

  it('post-persistence operation guard는 B가 A를 교체한 뒤 stale A finalization을 fail-closed 한다', async () => {
    const customerKey = generateCustomerKey();
    const firstIssued = record(customerKey, 'billing-operation-a');
    const secondIssued = record(customerKey, 'billing-operation-b');
    const firstOperationId = 'billing-intent-a';
    const secondOperationId = 'billing-intent-b';

    await firstInstance.billingKeys.withMutationLock(customerKey, (mutation) =>
      mutation.save(firstIssued, { operationId: firstOperationId }),
    );
    await secondInstance.billingKeys.withMutationLock(customerKey, (mutation) =>
      mutation.save(secondIssued, { operationId: secondOperationId }),
    );

    const firstMayFinalize = await firstInstance.billingKeys.withMutationLock(
      customerKey,
      (mutation) => mutation.isCurrentOperationId(firstOperationId),
    );
    const secondMayFinalize = await secondInstance.billingKeys.withMutationLock(
      customerKey,
      (mutation) => mutation.isCurrentOperationId(secondOperationId),
    );

    expect(firstMayFinalize).toBe(false);
    expect(secondMayFinalize).toBe(true);
    expect(await firstInstance.billingKeys.find(customerKey)).toEqual(secondIssued);
  });
});
