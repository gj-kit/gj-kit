/**
 * `./testing` — the in-memory aggregate is assignable wherever `TossPaymentsPostgres` is,
 * including the core facade config and Nest module typings, and its test-only surface is typed.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createTossPayments, defineTossPaymentsConfig } from '@gj-kit/toss-payments/server';
import type { ApiSecretKey, BillingFlow, BillingKeyRecord, BillingKeyStore } from '@gj-kit/toss-payments/server';

import type { TossPaymentsPostgres as RootTossPaymentsPostgres } from '../../src/index';
import {
  createMemoryTossPaymentsPostgres,
  createOpaqueAdvisoryLockKey,
  isMemoryLockContractError,
  unsafePlaintextSensitiveValueProtector,
} from '../../src/testing';
import type {
  CleanupResult,
  MemoryLockContractError,
  MemoryLockContractErrorCode,
  MemoryTossPaymentsPostgres,
  MemoryTossPaymentsPostgresEvent,
  MemoryTossPaymentsPostgresOptions,
  MemoryWebhookInboxRow,
  MigrationResult,
  PgBillingKeyMutation,
  PgBillingKeyStore,
  PgOpaqueAdvisoryLocks,
  SensitiveValueProtector,
  TossPaymentsPostgres,
} from '../../src/testing';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('createMemoryTossPaymentsPostgres — structural parity with the PostgreSQL aggregate', () => {
  const memory = createMemoryTossPaymentsPostgres();

  it('returns MemoryTossPaymentsPostgres, which extends TossPaymentsPostgres from both entries', () => {
    expectTypeOf(createMemoryTossPaymentsPostgres).returns.toEqualTypeOf<MemoryTossPaymentsPostgres>();
    expectTypeOf<MemoryTossPaymentsPostgres>().toExtend<TossPaymentsPostgres>();
    expectTypeOf<MemoryTossPaymentsPostgres>().toExtend<RootTossPaymentsPostgres>();
    const asAggregate: TossPaymentsPostgres = memory;
    const asRootAggregate: RootTossPaymentsPostgres = memory;
    void [asAggregate, asRootAggregate];

    expectTypeOf(memory.billingKeys).toEqualTypeOf<PgBillingKeyStore>();
    expectTypeOf(memory.billingKeys).toExtend<BillingKeyStore>();
    expectTypeOf(memory.opaqueLocks).toEqualTypeOf<PgOpaqueAdvisoryLocks>();
    expectTypeOf(memory.migrate).toEqualTypeOf<() => Promise<MigrationResult>>();
    expectTypeOf(memory.cleanup).toEqualTypeOf<() => Promise<CleanupResult>>();
    expectTypeOf(memory.audit.flush).toEqualTypeOf<() => Promise<void>>();
    expectTypeOf(memory.reset).toEqualTypeOf<() => void>();
  });

  it('the locked mutation handle and lock keys carry the same types as the PostgreSQL store', () => {
    const customerKey = forge<BillingKeyRecord['customerKey']>();
    const opaqueKey = createOpaqueAdvisoryLockKey('v1:app-blind-index');
    void memory.billingKeys.withMutationLock(customerKey, (mutation) => {
      expectTypeOf(mutation).toEqualTypeOf<PgBillingKeyMutation>();
      return mutation.isCurrentOperationId('op');
    });
    void memory.billingKeys.withOpaqueMutationLock(opaqueKey, customerKey, (mutation) => mutation.find());
    void memory.opaqueLocks.withLock(opaqueKey, () => 1);
    // @ts-expect-error raw strings are not lock keys — createOpaqueAdvisoryLockKey is the explicit decision
    void memory.opaqueLocks.withLock('raw-customer-id', () => 1);
    // @ts-expect-error the combined API takes the opaque key first, then the customerKey
    void memory.billingKeys.withOpaqueMutationLock(customerKey, opaqueKey, (mutation) => mutation.find());
  });

  it('wires into the core facade config without casts — same golden path as the PostgreSQL aggregate', () => {
    const config = defineTossPaymentsConfig({
      secretKey: forge<ApiSecretKey<'test'>>(),
      orders: memory.orders,
      depositSecrets: memory.depositSecrets,
      billingKeys: memory.billingKeys,
      cancelRetries: memory.cancelRetries,
      webhook: { dedupe: memory.webhookDedupe },
      audit: { sink: memory.audit },
    });
    expectTypeOf(createTossPayments(config).billing).toEqualTypeOf<BillingFlow<'test', {}>>();
  });

  it('options mirror the PostgreSQL aggregate minus sql, plus a test clock; misuse is a compile error', () => {
    const options: MemoryTossPaymentsPostgresOptions = {
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
      schema: 'toss_payments',
      dedupe: { leaseSeconds: 60, completedTtlSeconds: 432_000 },
      retention: { cancelRetryDays: 15 },
      now: () => 0,
    };
    void createMemoryTossPaymentsPostgres(options);
    void createMemoryTossPaymentsPostgres();
    expectTypeOf<NonNullable<MemoryTossPaymentsPostgresOptions['sensitiveValueProtector']>>().toEqualTypeOf<SensitiveValueProtector>();
    // @ts-expect-error no sql option — the fake has no database
    createMemoryTossPaymentsPostgres({ sql: forge<unknown>() });
    // @ts-expect-error now() returns epoch milliseconds, not a Date
    createMemoryTossPaymentsPostgres({ now: () => new Date() });
    // @ts-expect-error typo in option key cannot silently become a default
    createMemoryTossPaymentsPostgres({ dedupe: { leaseSecond: 60 } });
  });

  it('recorded is a readonly observation surface and events form a closed discriminated union', () => {
    expectTypeOf(memory.recorded.events).toEqualTypeOf<readonly MemoryTossPaymentsPostgresEvent[]>();
    expectTypeOf(memory.recorded.inbox).toEqualTypeOf<readonly MemoryWebhookInboxRow[]>();
    const event = forge<MemoryTossPaymentsPostgresEvent>();
    switch (event.type) {
      case 'lock-requested':
      case 'lock-acquired':
        expectTypeOf(event.lock).toEqualTypeOf<'opaque' | 'customer'>();
        break;
      case 'lock-released':
        expectTypeOf(event.outcome).toEqualTypeOf<'commit' | 'rollback'>();
        break;
      case 'store':
        expectTypeOf(event.recordId).toEqualTypeOf<string>();
        break;
      case 'migrate':
        expectTypeOf(event.applied).toEqualTypeOf<readonly string[]>();
        break;
      case 'cleanup':
        expectTypeOf(event.dedupeDeleted).toEqualTypeOf<number>();
        break;
      default:
        expectTypeOf(event).toBeNever();
    }
    // @ts-expect-error recorded arrays are readonly views — tests observe, they do not mutate
    memory.recorded.events.push(forge<MemoryTossPaymentsPostgresEvent>());
  });

  it('lock-contract error codes are closed and the guard narrows', () => {
    expectTypeOf(isMemoryLockContractError).guards.toEqualTypeOf<MemoryLockContractError>();
    expectTypeOf<MemoryLockContractErrorCode>().toEqualTypeOf<
      'reentrant-lock' | 'nested-lock-api' | 'handle-outside-callback'
    >();
    const code: MemoryLockContractErrorCode = 'nested-lock-api';
    void code;
    // @ts-expect-error unregistered code
    const bad: MemoryLockContractErrorCode = 'deadlock';
    void bad;
  });
});
