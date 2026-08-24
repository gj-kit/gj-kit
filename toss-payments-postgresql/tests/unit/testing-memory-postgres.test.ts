/**
 * `./testing` — createMemoryTossPaymentsPostgres는 DB 없이 aggregate 계약을 재현하는 대역이다.
 *
 * 검증 축: ① 표면 전체 + 옵션 fail-fast ② billing-key lock의 실제 상호 배제·opaque→customer
 * 순서·transaction overlay(READ COMMITTED — 바깥 find는 committed만, handle은 read-your-writes)·
 * rollback ③ PostgreSQL self-deadlock/README 금지 중첩/빠져나간 handle을 throw로 드러내기 ④ 스토어
 * 6종 + inbox의 PostgreSQL 동일 규칙(protector context, insert-only + 투영·검증, audit id 멱등,
 * lease/TTL, redaction) ⑤ recorded 이벤트 로그와 reset.
 */
import { createHash, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { CustomerKey } from '@gj-kit/toss-payments';

import { isTossPostgresError } from '../../src/errors';
import { createAes256GcmSensitiveValueProtector } from '../../src/aes-gcm-protector';
import { MIGRATION_IDS } from '../../src/migrations';
import {
  MemoryLockContractError,
  createMemoryTossPaymentsPostgres,
  createOpaqueAdvisoryLockKey,
  isMemoryLockContractError,
} from '../../src/testing';
import type { MemoryTossPaymentsPostgresEvent } from '../../src/testing';
import { deferred } from './helpers/fake-sql';
import {
  CUSTOMER_KEY,
  ORDER_ID,
  makeAuditEntry,
  makeBillingKeyRecord,
  makeCancelRetryRecord,
  makeSecretVerifiedWebhook,
  makeStoredOrder,
} from './helpers/fixtures';
import { createSensitiveValueProtectorProbe } from './helpers/sensitive-protector';

const OTHER_CUSTOMER = 'cust_20260820_0002' as CustomerKey;
const OPAQUE_KEY = createOpaqueAdvisoryLockKey('v1:billing-credential-lifecycle:blind-index-A');

function lockEvents(events: readonly MemoryTossPaymentsPostgresEvent[]): readonly string[] {
  const lines: string[] = [];
  for (const event of events) {
    if (event.type === 'lock-released') {
      lines.push(`${event.type}:${event.lock}:${event.key}:${event.outcome}`);
    } else if (event.type === 'lock-requested' || event.type === 'lock-acquired') {
      lines.push(`${event.type}:${event.lock}:${event.key}`);
    }
  }
  return lines;
}

/** mutex 대기 hop이 여러 microtask라 한 tick으로는 부족하다 — 매크로태스크 경계까지 흘린다. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  throw new Error('expected rejection');
}

describe('createMemoryTossPaymentsPostgres — 표면과 옵션', () => {
  it('TossPaymentsPostgres 표면 전체 + recorded/reset을 제공하고 조립 시점에 이벤트가 없다', () => {
    const pg = createMemoryTossPaymentsPostgres();

    expect(typeof pg.orders.saveOrder).toBe('function');
    expect(typeof pg.depositSecrets.saveSecret).toBe('function');
    expect(typeof pg.billingKeys.withMutationLock).toBe('function');
    expect(typeof pg.billingKeys.withOpaqueMutationLock).toBe('function');
    expect(typeof pg.billingKeys.replaceAndGetPrevious).toBe('function');
    expect(typeof pg.billingKeys.deleteIfBillingKeyMatches).toBe('function');
    expect(typeof pg.billingKeys.replaceIfBillingKeyMatches).toBe('function');
    expect(typeof pg.cancelRetries.save).toBe('function');
    expect(typeof pg.webhookDedupe.claim).toBe('function');
    expect(typeof pg.audit.record).toBe('function');
    expect(typeof pg.audit.flush).toBe('function');
    expect(typeof pg.inbox.record).toBe('function');
    expect(typeof pg.opaqueLocks.withLock).toBe('function');
    expect(typeof pg.migrate).toBe('function');
    expect(typeof pg.cleanup).toBe('function');
    expect(typeof pg.reset).toBe('function');
    expect(pg.recorded.events).toEqual([]);
    expect(pg.recorded.auditEntries).toEqual([]);
    expect(pg.recorded.inbox).toEqual([]);
  });

  it('잘못된 schema는 PostgreSQL aggregate와 같이 invalid-identifier로 throw한다', () => {
    let thrown: unknown;
    try {
      createMemoryTossPaymentsPostgres({ schema: 'Bad Schema' });
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
  });

  it.each([
    ['dedupe.leaseSeconds 0', { dedupe: { leaseSeconds: 0 } }],
    ['dedupe.completedTtlSeconds 음수', { dedupe: { completedTtlSeconds: -1 } }],
    ['retention.cancelRetryDays 소수', { retention: { cancelRetryDays: 0.5 } }],
  ])('%s는 TypeError(fail-fast)', (_label, options) => {
    expect(() => createMemoryTossPaymentsPostgres(options)).toThrow(TypeError);
  });

  it('sensitiveValueProtector가 encrypt/decrypt를 구현하지 않으면 TypeError', () => {
    expect(() =>
      createMemoryTossPaymentsPostgres({ sensitiveValueProtector: { encrypt: async () => '' } as never }),
    ).toThrow(TypeError);
  });
});

describe('billingKeys — 보호·복원·조건부 연산 (PostgreSQL 동일 codec)', () => {
  it('save는 BillingKeyRecord 전체를 billing-key/customerKey context로 보호해 보관한다', async () => {
    const probe = createSensitiveValueProtectorProbe();
    const pg = createMemoryTossPaymentsPostgres({ sensitiveValueProtector: probe.protector });
    const record = makeBillingKeyRecord();

    await pg.billingKeys.save(record, { operationId: 'op-1' });

    expect(probe.calls).toEqual([
      {
        operation: 'encrypt',
        value: JSON.stringify(record),
        context: { purpose: 'billing-key', recordId: record.customerKey },
      },
    ]);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(record);
    expect(probe.calls[1]).toEqual({
      operation: 'decrypt',
      value: probe.ciphertextFor(JSON.stringify(record), { purpose: 'billing-key', recordId: record.customerKey }),
      context: { purpose: 'billing-key', recordId: record.customerKey },
    });
    await expect(pg.billingKeys.find(OTHER_CUSTOMER)).resolves.toBeNull();
  });

  it('레퍼런스 AES-256-GCM 보호기와 끝까지 왕복한다', async () => {
    const pg = createMemoryTossPaymentsPostgres({
      sensitiveValueProtector: createAes256GcmSensitiveValueProtector({ key: randomBytes(32) }),
    });
    const record = makeBillingKeyRecord({ method: '계좌이체', card: null, transfers: [{ bankName: '토스뱅크', bankAccountNumber: '100012345678' }] });

    await pg.billingKeys.save(record);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(record);
    // 이벤트 로그에는 billingKey·계좌번호가 절대 없다.
    expect(JSON.stringify(pg.recorded.events)).not.toContain(record.billingKey);
    expect(JSON.stringify(pg.recorded.events)).not.toContain('100012345678');
  });

  it('delete는 현재 raw key와 일치할 때만 지운다 — missing/mismatch는 false', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const record = makeBillingKeyRecord();
    await pg.billingKeys.save(record);

    await expect(pg.billingKeys.delete({ customerKey: CUSTOMER_KEY, expectedBillingKey: 'stale-key' })).resolves.toBe(false);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(record);
    await expect(pg.billingKeys.deleteIfBillingKeyMatches({ customerKey: CUSTOMER_KEY, expectedBillingKey: record.billingKey })).resolves.toBe(true);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
    await expect(pg.billingKeys.delete({ customerKey: CUSTOMER_KEY, expectedBillingKey: record.billingKey })).resolves.toBe(false);
    // 이벤트의 operation은 호출한 메서드 이름 그대로다 — 코어 delete는 'delete', 확장은 자기 이름.
    expect(
      pg.recorded.events
        .filter((event) => event.type === 'store' && event.store === 'billingKeys')
        .map((event) => `${(event as { operation: string }).operation}:${String((event as { result?: unknown }).result)}`),
    ).toEqual([
      'save:undefined',
      'delete:false',
      'find:undefined',
      'deleteIfBillingKeyMatches:true',
      'find:undefined',
      'delete:false',
    ]);
  });

  it('handle의 delete / deleteIfBillingKeyMatches / replaceIfBillingKeyMatches도 각자의 이름으로 기록된다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const record = makeBillingKeyRecord({ billingKey: 'bkey_a' });

    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await mutation.save(record);
      await mutation.replaceIfBillingKeyMatches('bkey_a', makeBillingKeyRecord({ billingKey: 'bkey_b' }));
      await mutation.deleteIfBillingKeyMatches('bkey_wrong');
      await mutation.delete('bkey_b');
    });

    expect(
      pg.recorded.events
        .filter((event) => event.type === 'store')
        .map((event) => `${(event as { operation: string }).operation}:${String((event as { result?: unknown }).result)}`),
    ).toEqual(['save:undefined', 'replaceIfBillingKeyMatches:true', 'deleteIfBillingKeyMatches:false', 'delete:true']);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
  });

  it('replaceAndGetPrevious snapshot을 replaceIfBillingKeyMatches에 원본 그대로 넘기면 prior fingerprint까지 복원된다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const first = makeBillingKeyRecord({ billingKey: 'bkey_first' });
    const second = makeBillingKeyRecord({ billingKey: 'bkey_second' });
    await pg.billingKeys.save(first, { operationId: 'op-first' });

    const previous = await pg.billingKeys.replaceAndGetPrevious(second, { operationId: 'op-second' });
    expect(previous?.record).toEqual(first);
    expect(Object.isFrozen(previous)).toBe(true);

    // 보상: 현재가 second일 때만 first(snapshot)로 되돌린다.
    await expect(pg.billingKeys.replaceIfBillingKeyMatches(CUSTOMER_KEY, 'bkey_wrong', previous)).resolves.toBe(false);
    await expect(pg.billingKeys.replaceIfBillingKeyMatches(CUSTOMER_KEY, 'bkey_second', previous)).resolves.toBe(true);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(first);
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId('op-first')),
    ).resolves.toBe(true);

    // spread 복제본은 registry identity가 없어 fingerprint를 잃는다(fail-closed).
    await expect(pg.billingKeys.replaceIfBillingKeyMatches(CUSTOMER_KEY, 'bkey_first', { ...previous!.record })).resolves.toBe(true);
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId('op-first')),
    ).resolves.toBe(false);
  });

  it('isCurrentOperationId — SHA-256 fingerprint 대조, raw operationId는 이벤트에도 없다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    await pg.billingKeys.save(makeBillingKeyRecord(), { operationId: 'billing_auth_intent-1' });

    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await expect(mutation.isCurrentOperationId('billing_auth_intent-1')).resolves.toBe(true);
      await expect(mutation.isCurrentOperationId('billing_auth_intent-0')).resolves.toBe(false);
      await expect(mutation.isCurrentOperationId(undefined as never)).resolves.toBe(false);
    });
    await pg.billingKeys.save(makeBillingKeyRecord());
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId('billing_auth_intent-1')),
    ).resolves.toBe(false);
    const serialized = JSON.stringify(pg.recorded.events);
    expect(serialized).not.toContain('billing_auth_intent-1');
    expect(serialized).not.toContain(createHash('sha256').update('billing_auth_intent-1').digest('hex'));
  });

  it('handle은 잠근 customerKey에 고정된다 — 다른 record 저장은 TypeError, lock은 rollback으로 해제', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const foreign = makeBillingKeyRecord({ customerKey: OTHER_CUSTOMER });

    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.save(foreign)),
    ).rejects.toThrow(TypeError);
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.replaceIfBillingKeyMatches('x', foreign)),
    ).rejects.toThrow(TypeError);
    expect(lockEvents(pg.recorded.events)).toEqual([
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
      `lock-released:customer:${CUSTOMER_KEY}:rollback`,
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
      `lock-released:customer:${CUSTOMER_KEY}:rollback`,
    ]);
    await expect(pg.billingKeys.find(OTHER_CUSTOMER)).resolves.toBeNull();
  });
});

describe('billingKeys lock — 실제 상호 배제와 rollback', () => {
  it('같은 customerKey의 두 withMutationLock은 직렬화된다 — 두 번째 callback은 첫 번째가 끝난 뒤 시작', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const gate = deferred<void>();
    const order: string[] = [];

    const first = pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      order.push('first:start');
      await gate.promise;
      await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_first' }));
      order.push('first:end');
    });
    const second = pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      order.push('second:start');
      // 첫 번째 callback의 저장이 두 번째에게 보인다 — 직렬화 + read-after-write.
      order.push(`second:sees:${(await mutation.find())?.billingKey ?? 'null'}`);
      await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_second' }));
    });
    await settle();
    expect(order).toEqual(['first:start']);
    // 두 호출이 동기적으로 시작되므로 요청 2건이 먼저 기록되고, 획득은 첫 번째만이다.
    expect(lockEvents(pg.recorded.events)).toEqual([
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
    ]);

    gate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:sees:bkey_first']);
    expect(lockEvents(pg.recorded.events)).toEqual([
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
      `lock-released:customer:${CUSTOMER_KEY}:commit`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
      `lock-released:customer:${CUSTOMER_KEY}:commit`,
    ]);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toMatchObject({ billingKey: 'bkey_second' });
  });

  it('다른 customerKey는 서로를 막지 않는다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const gate = deferred<void>();
    const order: string[] = [];

    const blocked = pg.billingKeys.withMutationLock(CUSTOMER_KEY, async () => {
      order.push('A:start');
      await gate.promise;
      order.push('A:end');
    });
    const free = pg.billingKeys.withMutationLock(OTHER_CUSTOMER, async () => {
      order.push('B:start');
      order.push('B:end');
    });
    await free;
    expect(order).toEqual(['A:start', 'B:start', 'B:end']);
    gate.resolve();
    await blocked;
  });

  it('callback throw는 그 customerKey의 generic 변경을 rollback한다 — save도 delete도 되돌린다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const original = makeBillingKeyRecord({ billingKey: 'bkey_original' });
    await pg.billingKeys.save(original, { operationId: 'op-original' });
    const cause = new Error('host projection commit failed');

    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
        await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_new' }), { operationId: 'op-new' });
        throw cause;
      }),
    ).rejects.toBe(cause);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(original);
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, (mutation) => mutation.isCurrentOperationId('op-original')),
    ).resolves.toBe(true);

    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
        await expect(mutation.delete('bkey_original')).resolves.toBe(true);
        throw cause;
      }),
    ).rejects.toBe(cause);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(original);

    // 첫 발급(행 없음) 중 throw → 행이 생기지 않는다.
    await expect(
      pg.billingKeys.withMutationLock(OTHER_CUSTOMER, async (mutation) => {
        await mutation.save(makeBillingKeyRecord({ customerKey: OTHER_CUSTOMER }));
        throw cause;
      }),
    ).rejects.toBe(cause);
    await expect(pg.billingKeys.find(OTHER_CUSTOMER)).resolves.toBeNull();
    expect(pg.recorded.events.filter((event) => event.type === 'lock-released').map((event) => event.outcome)).toEqual([
      'commit', 'rollback', 'commit', 'rollback', 'rollback',
    ]);
  });

  it('withOpaqueMutationLock은 opaque → customer 순서로 잡고 역순으로 푼다', async () => {
    const pg = createMemoryTossPaymentsPostgres();

    await pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, async (mutation) => {
      expect(mutation.customerKey).toBe(CUSTOMER_KEY);
      await mutation.save(makeBillingKeyRecord());
    });

    expect(lockEvents(pg.recorded.events)).toEqual([
      `lock-requested:opaque:${OPAQUE_KEY}`,
      `lock-acquired:opaque:${OPAQUE_KEY}`,
      `lock-requested:customer:${CUSTOMER_KEY}`,
      `lock-acquired:customer:${CUSTOMER_KEY}`,
      `lock-released:customer:${CUSTOMER_KEY}:commit`,
      `lock-released:opaque:${OPAQUE_KEY}:commit`,
    ]);
    expect(pg.recorded.events.find((event) => event.type === 'store')).toEqual({
      type: 'store', store: 'billingKeys', operation: 'save', recordId: CUSTOMER_KEY,
    });
  });

  it('같은 opaque key의 combined mutation은 customerKey가 달라도 직렬화된다 (opaqueLocks.withLock과도)', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const gate = deferred<void>();
    const order: string[] = [];

    const holder = pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, async () => {
      order.push('A:start');
      await gate.promise;
      order.push('A:end');
    });
    const otherCustomer = pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, OTHER_CUSTOMER, async () => {
      order.push('B:start');
    });
    const hostOnly = pg.opaqueLocks.withLock(OPAQUE_KEY, async () => {
      order.push('C:start');
    });
    await settle();
    expect(order).toEqual(['A:start']);
    gate.resolve();
    await Promise.all([holder, otherCustomer, hostOnly]);
    expect(order).toEqual(['A:start', 'A:end', 'B:start', 'C:start']);
  });

  it('잘못된 opaque key는 lock을 잡기 전에 TypeError로 거부한다 — PostgreSQL과 같은 sync/async 형태', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    // combined API는 PostgreSQL 구현처럼 connection을 열기 전에 동기로 throw한다.
    expect(() =>
      pg.billingKeys.withOpaqueMutationLock('' as never, CUSTOMER_KEY, async () => undefined),
    ).toThrow(TypeError);
    // standalone API는 async라 rejection이다.
    await expect(pg.opaqueLocks.withLock('' as never, async () => undefined)).rejects.toThrow(TypeError);
    expect(pg.recorded.events).toEqual([]);
  });
});

describe('lock 계약 위반 — PostgreSQL이 deadlock하거나 README가 금지한 중첩은 throw한다', () => {
  it('standalone withLock 안의 withMutationLock / 반대 순서 모두 nested-lock-api', async () => {
    const pg = createMemoryTossPaymentsPostgres();

    const outerOpaque = await failure(() =>
      pg.opaqueLocks.withLock(OPAQUE_KEY, () =>
        pg.billingKeys.withMutationLock(CUSTOMER_KEY, async () => undefined),
      ),
    );
    const outerCustomer = await failure(() =>
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, () =>
        pg.opaqueLocks.withLock(OPAQUE_KEY, async () => undefined),
      ),
    );
    const insideCombined = await failure(() =>
      pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, () =>
        pg.billingKeys.withMutationLock(OTHER_CUSTOMER, async () => undefined),
      ),
    );
    for (const error of [outerOpaque, outerCustomer, insideCombined]) {
      expect(isMemoryLockContractError(error)).toBe(true);
      expect(error).toBeInstanceOf(MemoryLockContractError);
      expect((error as MemoryLockContractError).code).toBe('nested-lock-api');
      expect((error as Error).message).not.toContain(OPAQUE_KEY);
    }
    // 바깥 lock은 rollback으로 해제됐고 이후 호출은 정상이다(테스트가 멈추지 않는다).
    await expect(pg.billingKeys.withMutationLock(CUSTOMER_KEY, async () => 'ok')).resolves.toBe('ok');
  });

  it('같은 키 재진입(바깥 store 재호출 포함)은 reentrant-lock', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const record = makeBillingKeyRecord();

    const sameCustomer = await failure(() =>
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, () => pg.billingKeys.save(record)),
    );
    const sameOpaque = await failure(() =>
      pg.opaqueLocks.withLock(OPAQUE_KEY, () => pg.opaqueLocks.withLock(OPAQUE_KEY, async () => undefined)),
    );
    const combinedInsideOpaque = await failure(() =>
      pg.opaqueLocks.withLock(OPAQUE_KEY, () =>
        pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, async () => undefined),
      ),
    );
    for (const error of [sameCustomer, sameOpaque, combinedInsideOpaque]) {
      expect((error as MemoryLockContractError).code).toBe('reentrant-lock');
    }
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
  });

  it('callback 안에서 예약한 timer가 callback 종료 뒤 lock API를 호출하면 중첩으로 오판하지 않는다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    let scheduled!: Promise<string>;

    await pg.opaqueLocks.withLock(OPAQUE_KEY, async () => {
      // AsyncLocalStorage context는 timer로 전파되지만, 바깥 callback이 끝난 뒤라면 더 이상 "중첩"이 아니다.
      scheduled = new Promise((resolve, reject) => {
        setTimeout(() => {
          pg.billingKeys.withMutationLock(CUSTOMER_KEY, async () => 'later').then(resolve, reject);
        }, 0);
      });
    });

    await expect(scheduled).resolves.toBe('later');
    expect(pg.recorded.events.filter((event) => event.type === 'lock-acquired').map((event) => event.api)).toEqual([
      'opaqueLocks.withLock',
      'billingKeys.withMutationLock',
    ]);
  });

  it('lock 없는 읽기·다른 스토어·callback 종료 후 호출은 허용된다 — 단, 바깥 find는 committed 상태만 본다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const original = makeBillingKeyRecord({ billingKey: 'bkey_original' });
    await pg.billingKeys.save(original);

    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_staged' }));
      // handle은 자기 transaction의 쓰기를 읽는다(read-your-writes).
      await expect(mutation.find()).resolves.toMatchObject({ billingKey: 'bkey_staged' });
      // 바깥 find는 다른 connection의 READ COMMITTED 읽기 — 아직 COMMIT 전이라 원본이다.
      await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(original);
      await pg.orders.saveOrder(makeStoredOrder());
      await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('claimed');
    });
    // COMMIT 뒤에는 바깥 find도 새 값을 본다.
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toMatchObject({ billingKey: 'bkey_staged' });
    await expect(pg.billingKeys.withMutationLock(CUSTOMER_KEY, async () => 'again')).resolves.toBe('again');
    await expect(pg.opaqueLocks.withLock(OPAQUE_KEY, async () => 'host')).resolves.toBe('host');
  });

  it('첫 발급 중 바깥 find는 null이고, 삭제 예약 중 handle.find는 null·바깥 find는 원본이다', async () => {
    const pg = createMemoryTossPaymentsPostgres();

    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_first' }));
      await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
    });
    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await expect(mutation.delete('bkey_first')).resolves.toBe(true);
      await expect(mutation.find()).resolves.toBeNull();
      await expect(mutation.isCurrentOperationId('op-any')).resolves.toBe(false);
      await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toMatchObject({ billingKey: 'bkey_first' });
    });
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
  });

  it('rollback되는 callback의 쓰기는 동시 lock-free 읽기에 한 번도 보이지 않는다(phantom 없음)', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const saved = deferred<void>();
    const release = deferred<void>();
    const cause = new Error('projection failed');

    const issuance = pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      await mutation.save(makeBillingKeyRecord({ billingKey: 'bkey_phantom' }));
      saved.resolve();
      await release.promise;
      throw cause;
    });
    await saved.promise;
    // 다른 요청(webhook/projection service)의 lock 없는 읽기 — PostgreSQL처럼 committed 상태(null)만 본다.
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
    release.resolve();
    await expect(issuance).rejects.toBe(cause);
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
    expect(lockEvents(pg.recorded.events).at(-1)).toBe(`lock-released:customer:${CUSTOMER_KEY}:rollback`);
  });

  it('callback 밖으로 빠져나간 handle은 handle-outside-callback — 쓰기가 조용히 버려지거나 lock 밖에서 적용되지 않는다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    await pg.billingKeys.save(makeBillingKeyRecord({ billingKey: 'bkey_committed' }));
    let escaped!: Awaited<Parameters<Parameters<typeof pg.billingKeys.withMutationLock>[1]>[0]>;
    await pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
      escaped = mutation;
    });

    const onSave = await failure(() => escaped.save(makeBillingKeyRecord({ billingKey: 'bkey_late' })));
    const onFind = await failure(() => escaped.find());
    const onDelete = await failure(() => escaped.deleteIfBillingKeyMatches('bkey_committed'));
    for (const error of [onSave, onFind, onDelete]) {
      expect(isMemoryLockContractError(error)).toBe(true);
      expect((error as MemoryLockContractError).code).toBe('handle-outside-callback');
      expect((error as Error).message).not.toContain('bkey_');
    }
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toMatchObject({ billingKey: 'bkey_committed' });
    // 에러로 끝난 callback의 handle도 같다.
    const cause = new Error('boom');
    await expect(
      pg.billingKeys.withMutationLock(CUSTOMER_KEY, async (mutation) => {
        escaped = mutation;
        throw cause;
      }),
    ).rejects.toBe(cause);
    expect((await failure(() => escaped.find()) as MemoryLockContractError).code).toBe('handle-outside-callback');
  });

  it('callback 안에서 시작한 lock API는 await하지 않아도(fire-and-forget) 중첩으로 거부된다 — 문서화된 엄격 방향', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const issued = makeBillingKeyRecord({ billingKey: 'bkey_issued' });
    let lateSameKey!: Promise<boolean>;
    let lateOtherKey!: Promise<string>;

    await pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, async (mutation) => {
      await mutation.replaceAndGetPrevious(issued, { operationId: 'op-1' });
      // PostgreSQL(pool > 1)은 이 호출을 줄 세워 COMMIT 뒤에 처리하지만, 대역은 시작 위치로 판정한다.
      lateSameKey = pg.billingKeys.deleteIfBillingKeyMatches({ customerKey: CUSTOMER_KEY, expectedBillingKey: issued.billingKey });
      lateOtherKey = pg.billingKeys.withMutationLock(OTHER_CUSTOMER, async () => 'other');
      // 이 테스트가 거부를 받아 주므로 unhandled rejection은 없다 — 소비 테스트는 README 패턴(바깥에서 started gate 뒤 시작)을 쓴다.
      await Promise.allSettled([lateSameKey, lateOtherKey]);
    });

    expect((await failure(() => lateSameKey) as MemoryLockContractError).code).toBe('reentrant-lock');
    expect((await failure(() => lateOtherKey) as MemoryLockContractError).code).toBe('nested-lock-api');
    // 발급 자체는 COMMIT됐다.
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toEqual(issued);
  });
});

describe('orders / depositSecrets / cancelRetries — PostgreSQL 동일 규칙', () => {
  it('saveOrder는 insert-only — 동일값 재저장은 멱등, 다른 값은 order-conflict', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const order = makeStoredOrder();

    await pg.orders.saveOrder(order);
    await pg.orders.saveOrder({ ...order, createdAt: '2026-08-21T00:00:00+09:00' }); // createdAt은 비교 대상이 아니다
    await expect(pg.orders.loadOrder(ORDER_ID)).resolves.toEqual(order);

    const conflict = await failure(() => pg.orders.saveOrder({ ...order, amount: 9_999 }));
    expect(isTossPostgresError(conflict)).toBe(true);
    expect((conflict as { code: string }).code).toBe('order-conflict');
    await expect(pg.orders.loadOrder(ORDER_ID)).resolves.toEqual(order);
    expect(pg.recorded.events.filter((event) => event.type === 'store' && event.store === 'orders').map((event) => (event as { result?: unknown }).result)).toEqual([
      'inserted', 'idempotent', undefined, 'conflict', undefined,
    ]);
  });

  it('loadOrder는 PostgreSQL과 같은 투영이다 — 여분 필드는 버리고 amount/currency를 검증한다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const order = makeStoredOrder();

    await pg.orders.saveOrder({ ...order, extra: 'leak' } as never);
    await expect(pg.orders.loadOrder(ORDER_ID)).resolves.toEqual(order);
    await expect(pg.orders.loadOrder(ORDER_ID)).resolves.not.toHaveProperty('extra');

    await pg.orders.saveOrder({ ...order, orderId: 'order_unsafe', amount: Number.MAX_SAFE_INTEGER + 2 } as never);
    const unsafe = await failure(() => pg.orders.loadOrder('order_unsafe' as typeof ORDER_ID));
    expect(isTossPostgresError(unsafe)).toBe(true);
    expect((unsafe as { code: string }).code).toBe('unsafe-amount');

    await pg.orders.saveOrder({ ...order, orderId: 'order_currency', currency: 'EUR' } as never);
    const invalid = await failure(() => pg.orders.loadOrder('order_currency' as typeof ORDER_ID));
    expect(isTossPostgresError(invalid)).toBe(true);
    expect((invalid as { code: string }).code).toBe('invalid-row');
  });

  it('depositSecrets는 deposit-secret/orderId context로 보호되고 upsert된다', async () => {
    const probe = createSensitiveValueProtectorProbe();
    const pg = createMemoryTossPaymentsPostgres({ sensitiveValueProtector: probe.protector });

    await pg.depositSecrets.saveSecret(ORDER_ID, 'secret-1');
    await pg.depositSecrets.saveSecret(ORDER_ID, 'secret-2');
    await expect(pg.depositSecrets.getSecret(ORDER_ID)).resolves.toBe('secret-2');
    await expect(pg.depositSecrets.getSecret('order_missing')).resolves.toBeNull();
    expect(probe.calls.map((call) => [call.operation, call.context.purpose, call.context.recordId])).toEqual([
      ['encrypt', 'deposit-secret', ORDER_ID],
      ['encrypt', 'deposit-secret', ORDER_ID],
      ['decrypt', 'deposit-secret', ORDER_ID],
    ]);
    expect(JSON.stringify(pg.recorded.events)).not.toContain('secret-2');
  });

  it('cancelRetries는 record 전체를 cancel-retry-record/ticketId context로 보호하고 bodyJson을 무손실 복원한다', async () => {
    const probe = createSensitiveValueProtectorProbe();
    const pg = createMemoryTossPaymentsPostgres({ sensitiveValueProtector: probe.protector });
    const record = makeCancelRetryRecord({ bodyJson: '{"cancelReason":"\\u0000 고객 요청 \u{1F4B3}","refundReceiveAccount":{"accountNumber":"1234"}}' });

    await pg.cancelRetries.save(record);
    await expect(pg.cancelRetries.load(record.ticketId)).resolves.toEqual(record);
    await expect(pg.cancelRetries.load('ticket-missing')).resolves.toBeNull();
    expect(probe.calls[0]).toMatchObject({ operation: 'encrypt', value: JSON.stringify(record), context: { purpose: 'cancel-retry-record', recordId: record.ticketId } });
    await pg.cancelRetries.delete(record.ticketId);
    await expect(pg.cancelRetries.load(record.ticketId)).resolves.toBeNull();
  });
});

describe('webhookDedupe / cleanup — lease와 보존 기간을 now()로 재현한다', () => {
  it('claim 전이: claimed → processing(lease 내) → lease 만료 재점유 → complete 후 completed, release는 processing만 지운다', async () => {
    let clock = 1_000_000;
    const pg = createMemoryTossPaymentsPostgres({ dedupe: { leaseSeconds: 60 }, now: () => clock });

    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('claimed');
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('processing');
    clock += 59_999;
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('processing');
    clock += 1;
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('claimed');
    await pg.webhookDedupe.complete('evt-1');
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('completed');
    await pg.webhookDedupe.release('evt-1'); // completed는 절대 지우지 않는다
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('completed');

    await expect(pg.webhookDedupe.claim('evt-2')).resolves.toBe('claimed');
    await pg.webhookDedupe.release('evt-2');
    await expect(pg.webhookDedupe.claim('evt-2')).resolves.toBe('claimed');
  });

  it('Promise.all 동시 claim N건 중 정확히 1건만 claimed', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const outcomes = await Promise.all(Array.from({ length: 8 }, () => pg.webhookDedupe.claim('evt-burst')));
    expect(outcomes.filter((outcome) => outcome === 'claimed')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === 'processing')).toHaveLength(7);
  });

  it('cleanup은 TTL 지난 completed dedupe 행과 보존 기간 지난 cancel retry만 지운다', async () => {
    let clock = Date.UTC(2026, 7, 20);
    const pg = createMemoryTossPaymentsPostgres({
      dedupe: { completedTtlSeconds: 432_000 },
      retention: { cancelRetryDays: 15 },
      now: () => clock,
    });
    const day = 86_400_000;
    await pg.webhookDedupe.claim('old-completed');
    await pg.webhookDedupe.complete('old-completed');
    await pg.webhookDedupe.claim('old-processing'); // processing은 TTL 대상이 아니다
    await pg.cancelRetries.save(makeCancelRetryRecord({ ticketId: 'old-ticket' }));
    clock += 12 * day;
    await pg.cancelRetries.save(makeCancelRetryRecord({ ticketId: 'fresh-ticket' }));
    await pg.cancelRetries.save(makeCancelRetryRecord({ ticketId: 'old-ticket' })); // 재저장해도 recordedAt은 최초 시각
    clock += 2 * day;
    await pg.webhookDedupe.claim('fresh-completed');
    await pg.webhookDedupe.complete('fresh-completed');
    clock += 2 * day; // old-completed 16일·fresh-completed 2일 / old-ticket 16일·fresh-ticket 4일

    await expect(pg.cleanup()).resolves.toEqual({ dedupeDeleted: 1, cancelRetriesDeleted: 1 });

    await expect(pg.webhookDedupe.claim('old-completed')).resolves.toBe('claimed'); // 지워져서 재점유 가능
    await expect(pg.webhookDedupe.claim('fresh-completed')).resolves.toBe('completed');
    await expect(pg.cancelRetries.load('old-ticket')).resolves.toBeNull();
    await expect(pg.cancelRetries.load('fresh-ticket')).resolves.not.toBeNull();
    expect(pg.recorded.events.filter((event) => event.type === 'cleanup')).toEqual([
      { type: 'cleanup', dedupeDeleted: 1, cancelRetriesDeleted: 1 },
    ]);
  });
});

describe('audit / inbox / migrate / reset', () => {
  it('audit.record는 entries에 순서대로 남고 flush는 즉시 해소된다 — 같은 id 재호출은 ON CONFLICT DO NOTHING처럼 멱등', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const first = makeAuditEntry({ id: 'audit-1' });
    const second = makeAuditEntry({ id: 'audit-2' });

    await pg.audit.record(first);
    void pg.audit.record(second);
    await pg.audit.record({ ...first, durationMs: 999 }); // 같은 id — 행은 늘지 않고 최초 본이 남는다
    await pg.audit.flush();

    expect(pg.recorded.auditEntries).toEqual([first, second]);
    expect(pg.recorded.events.filter((event) => event.type === 'store' && event.store === 'audit')).toEqual([
      { type: 'store', store: 'audit', operation: 'record', recordId: 'audit-1', result: 'inserted' },
      { type: 'store', store: 'audit', operation: 'record', recordId: 'audit-2', result: 'inserted' },
      { type: 'store', store: 'audit', operation: 'record', recordId: 'audit-1', result: 'duplicate' },
    ]);

    // reset 뒤에는 같은 id가 다시 insert된다(id 집합도 비워진다).
    pg.reset();
    await pg.audit.record(first);
    expect(pg.recorded.auditEntries).toEqual([first]);
  });

  it('inbox.record는 PostgreSQL 저장본과 같은 마스킹을 적용하고 재전송을 deliveries로 센다 — 원본은 불변', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const webhook = makeSecretVerifiedWebhook();
    const poisoned = {
      ...webhook,
      event: { ...webhook.event, secret: 'deposit-secret-raw', nested: { billingKey: 'bkey-raw', amount: 1000, bad: 'x y' } },
    };
    const snapshot = JSON.stringify(poisoned);

    await pg.inbox.record(poisoned as never);
    await pg.inbox.record({ ...poisoned, meta: { ...poisoned.meta, retriedCount: 1 } } as never);

    expect(JSON.stringify(poisoned)).toBe(snapshot);
    expect(pg.recorded.inbox).toHaveLength(1);
    const row = pg.recorded.inbox[0]!;
    expect(row).toMatchObject({
      dedupeKey: webhook.meta.dedupeKey,
      transmissionId: webhook.meta.transmissionId,
      trust: 'secret',
      eventType: 'DEPOSIT_CALLBACK',
      deliveries: 2,
      retriedCount: 1,
    });
    expect(row.event).toMatchObject({ secret: '[REDACTED]', nested: { billingKey: '[REDACTED]', amount: 1000, bad: 'x�y' } });
    expect(JSON.stringify(pg.recorded)).not.toContain('deposit-secret-raw');
    expect(JSON.stringify(pg.recorded)).not.toContain('bkey-raw');
  });

  it('migrate는 실제 migration id를 적용 순서대로 보고하고 두 번째는 전부 skipped다', async () => {
    const pg = createMemoryTossPaymentsPostgres();

    await expect(pg.migrate()).resolves.toEqual({ applied: [...MIGRATION_IDS], skipped: [] });
    await expect(pg.migrate()).resolves.toEqual({ applied: [], skipped: [...MIGRATION_IDS] });
    expect(MIGRATION_IDS).toContain('0001_init');
    expect(MIGRATION_IDS).toContain('0002_billing_key_operation_fingerprint');
    expect(pg.recorded.events).toEqual([
      { type: 'migrate', applied: [...MIGRATION_IDS], skipped: [] },
      { type: 'migrate', applied: [], skipped: [...MIGRATION_IDS] },
    ]);
  });

  it('reset은 모든 테이블·migration 기록·recorded를 비우고 배열 참조는 유지한다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const events = pg.recorded.events;
    await pg.migrate();
    await pg.orders.saveOrder(makeStoredOrder());
    await pg.billingKeys.save(makeBillingKeyRecord());
    await pg.audit.record(makeAuditEntry());
    await pg.inbox.record(makeSecretVerifiedWebhook());
    await pg.webhookDedupe.claim('evt-1');

    pg.reset();

    expect(events).toBe(pg.recorded.events);
    expect(pg.recorded.events).toEqual([]);
    expect(pg.recorded.auditEntries).toEqual([]);
    expect(pg.recorded.inbox).toEqual([]);
    await expect(pg.orders.loadOrder(ORDER_ID)).resolves.toBeNull();
    await expect(pg.billingKeys.find(CUSTOMER_KEY)).resolves.toBeNull();
    await expect(pg.webhookDedupe.claim('evt-1')).resolves.toBe('claimed');
    await expect(pg.migrate()).resolves.toEqual({ applied: [...MIGRATION_IDS], skipped: [] });
  });

  it('recorded.events는 lock·store·lifecycle 이벤트를 호출 순서대로 읽을 수 있게 남긴다', async () => {
    const pg = createMemoryTossPaymentsPostgres();
    const record = makeBillingKeyRecord();

    await pg.billingKeys.withOpaqueMutationLock(OPAQUE_KEY, CUSTOMER_KEY, async (mutation) => {
      await mutation.replaceAndGetPrevious(record, { operationId: 'op-1' });
      await mutation.isCurrentOperationId('op-1');
    });

    expect(pg.recorded.events).toEqual([
      { type: 'lock-requested', api: 'billingKeys.withOpaqueMutationLock', lock: 'opaque', key: OPAQUE_KEY },
      { type: 'lock-acquired', api: 'billingKeys.withOpaqueMutationLock', lock: 'opaque', key: OPAQUE_KEY },
      { type: 'lock-requested', api: 'billingKeys.withOpaqueMutationLock', lock: 'customer', key: CUSTOMER_KEY },
      { type: 'lock-acquired', api: 'billingKeys.withOpaqueMutationLock', lock: 'customer', key: CUSTOMER_KEY },
      { type: 'store', store: 'billingKeys', operation: 'replaceAndGetPrevious', recordId: CUSTOMER_KEY },
      { type: 'store', store: 'billingKeys', operation: 'isCurrentOperationId', recordId: CUSTOMER_KEY, result: true },
      { type: 'lock-released', api: 'billingKeys.withOpaqueMutationLock', lock: 'customer', key: CUSTOMER_KEY, outcome: 'commit' },
      { type: 'lock-released', api: 'billingKeys.withOpaqueMutationLock', lock: 'opaque', key: OPAQUE_KEY, outcome: 'commit' },
    ]);
  });
});
