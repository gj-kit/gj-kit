/**
 * createMemoryTossPaymentsPostgres — `TossPaymentsPostgres` 전체 표면의 **DB 없는** 인메모리 대역.
 *
 * 목적은 소비 앱의 unit 테스트가 이 aggregate의 lock·rollback·protector 계약을 jest.fn()
 * 더미로 다시 흉내 내지 않게 하는 것이다. 그래서 "빠른 Map"이 아니라 **계약을 그대로
 * 재현하는 대역**이다:
 * - billing-key lock은 customerKey별·opaque key별 promise-chain mutex로 실제 상호 배제를
 *   만든다. `withOpaqueMutationLock`은 PostgreSQL 구현과 같은 **opaque → customer** 순서로
 *   두 lock을 잡는다.
 * - handle의 쓰기는 callback이 끝날 때까지 **transaction overlay**에 머문다(READ COMMITTED
 *   재현): handle의 읽기만 overlay를 보고, lock 없는 바깥 `billingKeys.find`는 callback
 *   안에서든 다른 요청에서든 **committed 상태만** 본다. callback 성공 시 overlay를 적용(COMMIT)
 *   하고 throw 시 버린다(ROLLBACK) — 롤백될 값이 다른 읽기에 새어 나가지 않는다.
 * - PostgreSQL에서 self-deadlock이 되는 재진입과 README가 금지한 public lock API 중첩은
 *   테스트를 멈추게 두지 않고 `MemoryLockContractError`로 즉시 드러낸다. callback 밖으로
 *   빠져나간 handle 사용도 overlay가 조용히 버려지지 않도록 같은 에러로 거부한다.
 * - billing key·deposit secret·cancel retry record는 PostgreSQL 스토어와 **동일한 codec**으로
 *   `sensitiveValueProtector`를 통과한다(같은 purpose/recordId AAD context).
 * - orders insert-only + `order-conflict`, dedupe lease/TTL, inbox redaction/deliveries,
 *   migrate 멱등 보고, cleanup 보존 기간까지 같은 규칙이다.
 *
 * 프로세스 생존 기간만 유지되며 프로덕션 사용은 금지다. 한 인스턴스가 "DB 하나"이므로 여러
 * 앱 인스턴스의 경쟁은 같은 인스턴스에 대한 동시 호출로 모델링한다.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { AuditEntry } from '@gj-kit/toss-payments';
import type {
  BillingKeyRecord,
  BillingKeySaveOptions,
  CancelRetryRecord,
  CancelRetryStore,
  DepositSecretStore,
  OrderStore,
  StoredOrder,
} from '@gj-kit/toss-payments/server';
import type { AcceptedWebhook, WebhookDedupeStore } from '@gj-kit/toss-payments/webhook';

import { TossPostgresError } from '../errors';
import type { CleanupResult, TossPaymentsPostgres } from '../factory';
import { DEFAULT_SCHEMA, assertSqlIdentifier } from '../identifiers';
import { MIGRATION_IDS } from '../migrations';
import type { MigrationResult } from '../migrations';
import { createOpaqueAdvisoryLockKey } from '../opaque-advisory-locks';
import type { OpaqueAdvisoryLockKey, PgOpaqueAdvisoryLocks } from '../opaque-advisory-locks';
import {
  DEFAULT_CANCEL_RETRY_DAYS,
  DEFAULT_COMPLETED_TTL_SECONDS,
  DEFAULT_LEASE_SECONDS,
  assertPositiveFinite,
  assertPositiveInteger,
} from '../options';
import {
  SENSITIVE_VALUE_PURPOSE,
  createSensitiveValueContext,
  requireProtectedString,
  requireSensitiveValueProtector,
  unsafePlaintextSensitiveValueProtector,
} from '../sensitive-values';
import type { SensitiveValueProtector } from '../sensitive-values';
import type { PgAuditSink } from '../stores/audit';
import { mapStoredOrder } from '../stores/orders';
import type { SqlRow } from '../sql';
import {
  assertRecordCustomerKey,
  billingKeysEqualConstantTime,
  fingerprintOperationId,
  operationFingerprintFromReplacement,
  operationFingerprintsEqual,
  protectBillingKeyRecord,
  recordFromReplacement,
  snapshotFromLoaded,
  unprotectBillingKeyRecord,
} from '../stores/billing-key-codec';
import type { LockedBillingKeySnapshot } from '../stores/billing-key-codec';
import type { PgBillingKeyMutation, PgBillingKeyStore } from '../stores/billing-keys';
import type { WebhookInboxStore } from '../stores/inbox';
import { serializeJsonb } from '../stores/jsonb';
import { createKeyedMutex } from './keyed-mutex';

// ── 공개 타입 ────────────────────────────────────────────────────────────────

export interface MemoryTossPaymentsPostgresOptions {
  /**
   * At-rest protector applied exactly where the PostgreSQL stores apply it (billing key record,
   * deposit secret, cancel retry record — same purpose/recordId context). Defaults to
   * `unsafePlaintextSensitiveValueProtector`, which is acceptable only because this aggregate
   * is a test double that never touches a database. Pass the protector your production wiring
   * uses (for example `createAes256GcmSensitiveValueProtector`) to exercise AAD binding end to end.
   */
  readonly sensitiveValueProtector?: SensitiveValueProtector;
  /** Validated like the PostgreSQL aggregate for configuration parity; state is per instance. */
  readonly schema?: string;
  readonly dedupe?: {
    /** Crash-recovery lease of processing dedupe rows in seconds. Default 60. */
    readonly leaseSeconds?: number;
    /** Retention of completed dedupe rows in seconds, applied by `cleanup()`. Default 432_000 (5 days). */
    readonly completedTtlSeconds?: number;
  };
  readonly retention?: {
    /** Retention of cancel retry records in days, applied by `cleanup()`. Default 15. */
    readonly cancelRetryDays?: number;
  };
  /**
   * Clock in epoch milliseconds for dedupe leases and retention. Defaults to `Date.now`, so
   * fake timers that patch `Date.now` work without configuration.
   */
  readonly now?: () => number;
}

/** Which public lock API an event belongs to. */
export type MemoryLockApi =
  | 'opaqueLocks.withLock'
  | 'billingKeys.withMutationLock'
  | 'billingKeys.withOpaqueMutationLock';

/** Lock class — the PostgreSQL aggregate orders them `opaque` then `customer`. */
export type MemoryLockClass = 'opaque' | 'customer';

export type MemoryStoreName =
  | 'orders'
  | 'depositSecrets'
  | 'billingKeys'
  | 'cancelRetries'
  | 'webhookDedupe'
  | 'audit'
  | 'inbox';

export interface MemoryLockRequestedEvent {
  readonly type: 'lock-requested';
  readonly api: MemoryLockApi;
  readonly lock: MemoryLockClass;
  /** The customerKey for `customer`; the nonsecret opaque key as given for `opaque`. */
  readonly key: string;
}

export interface MemoryLockAcquiredEvent {
  readonly type: 'lock-acquired';
  readonly api: MemoryLockApi;
  readonly lock: MemoryLockClass;
  readonly key: string;
}

export interface MemoryLockReleasedEvent {
  readonly type: 'lock-released';
  readonly api: MemoryLockApi;
  readonly lock: MemoryLockClass;
  readonly key: string;
  /**
   * `commit` when the callback returned — the handle's staged billing-key write of that
   * customerKey became visible to lock-free reads; `rollback` when it threw — the staged write
   * was discarded and was never visible outside the callback.
   */
  readonly outcome: 'commit' | 'rollback';
}

export interface MemoryStoreEvent {
  readonly type: 'store';
  readonly store: MemoryStoreName;
  /**
   * Method name as invoked on that store or on the locked-mutation handle. Store methods that
   * delegate to the handle (`billingKeys.save` / `delete` / `replaceAndGetPrevious` / the two
   * conditional methods) are logged once, under the handle method of the same name — so the
   * core `billingKeys.delete(request)` appears as `delete`, not `deleteIfBillingKeyMatches`.
   */
  readonly operation: string;
  /** Lookup key only — orderId, customerKey, ticketId, dedupeKey, audit id. Never a secret. */
  readonly recordId: string;
  /**
   * Boolean outcome of conditional operations, or a short outcome label — the claim state for
   * `webhookDedupe.claim`, `inserted` / `idempotent` / `conflict` for `orders.saveOrder`,
   * `inserted` / `duplicate` for `audit.record` (same-id re-calls are idempotent like the
   * PostgreSQL sink's `ON CONFLICT (id) DO NOTHING`).
   */
  readonly result?: boolean | string;
}

export interface MemoryMigrateEvent {
  readonly type: 'migrate';
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export interface MemoryCleanupEvent {
  readonly type: 'cleanup';
  readonly dedupeDeleted: number;
  readonly cancelRetriesDeleted: number;
}

/** Ordered, readable record of everything the aggregate did — assert ordering against it. */
export type MemoryTossPaymentsPostgresEvent =
  | MemoryLockRequestedEvent
  | MemoryLockAcquiredEvent
  | MemoryLockReleasedEvent
  | MemoryStoreEvent
  | MemoryMigrateEvent
  | MemoryCleanupEvent;

/** Redacted inbox row — the PostgreSQL table has no read API, so the fake exposes it here. */
export interface MemoryWebhookInboxRow {
  readonly dedupeKey: string;
  readonly transmissionId: string;
  readonly transmissionTime: string | null;
  readonly retriedCount: number;
  readonly trust: AcceptedWebhook['trust'];
  readonly eventType: string;
  /** Stored form: same redaction/sanitization as `webhook_inbox.event` (JSON round-tripped). */
  readonly event: unknown;
  readonly deliveries: number;
}

/** Test-only observation surface. All arrays are live views cleared by `reset()`. */
export interface MemoryTossPaymentsPostgresRecorded {
  readonly events: readonly MemoryTossPaymentsPostgresEvent[];
  /**
   * Audit entries in first-`record()` order, one per distinct `id` — the PostgreSQL sink has no
   * read API. A second `record()` with an id already present is a no-op, mirroring the table's
   * `ON CONFLICT (id) DO NOTHING`.
   */
  readonly auditEntries: readonly AuditEntry[];
  /** Inbox rows in first-received order. */
  readonly inbox: readonly MemoryWebhookInboxRow[];
}

/** `TossPaymentsPostgres` plus the test-only `recorded` view and `reset()`. */
export interface MemoryTossPaymentsPostgres extends TossPaymentsPostgres {
  readonly audit: PgAuditSink;
  readonly recorded: MemoryTossPaymentsPostgresRecorded;
  /** Clears every table, the migration ledger, lock bookkeeping, and `recorded`. Call between tests while no lock is held. */
  reset(): void;
}

/** Stable codes of lock-contract violations the fake refuses instead of deadlocking. */
export type MemoryLockContractErrorCode =
  /** Re-acquiring a key already held by the surrounding callback — PostgreSQL would self-deadlock. */
  | 'reentrant-lock'
  /** Any public lock API called inside another lock callback — README forbids nesting; the fake refuses it. */
  | 'nested-lock-api'
  /**
   * A locked-mutation handle used after its callback settled. The PostgreSQL handle is bound to
   * a connection that was already committed/rolled back and released; the fake refuses rather
   * than silently dropping the write or applying it outside the lock.
   */
  | 'handle-outside-callback';

const LOCK_ERROR_NAME = 'MemoryLockContractError';
const LOCK_ERROR_CODES: ReadonlySet<string> = new Set<MemoryLockContractErrorCode>([
  'reentrant-lock',
  'nested-lock-api',
  'handle-outside-callback',
]);

/**
 * Thrown by the in-memory aggregate where the PostgreSQL aggregate would deadlock or lose its
 * single-transaction guarantee. `code` is the contract; messages carry no keys or secrets.
 *
 * Nesting is detected through `AsyncLocalStorage`, so it is judged by where a lock API call is
 * *started*, not by whether the callback awaits it: a lock call launched inside a callback and
 * left un-awaited (for example a "late webhook" fired while the issuance callback still holds
 * the lock) is refused exactly like an awaited one, even though PostgreSQL with a pool larger
 * than one would queue it and serve it after the commit. This is the fake's deliberate stricter
 * direction — it cannot tell the two apart and the awaited form is a real self-deadlock. To model
 * a competing caller, start it from outside the callback after a "started" gate, as in the README
 * contention example. Work scheduled from a callback that runs *after* the callback settled
 * (timers, `setImmediate`) is not nesting and is served normally.
 */
export class MemoryLockContractError extends Error {
  override readonly name = LOCK_ERROR_NAME;
  readonly code: MemoryLockContractErrorCode;

  constructor(code: MemoryLockContractErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** Structural guard — `instanceof` is unreliable across ESM/CJS dual loading. */
export function isMemoryLockContractError(value: unknown): value is MemoryLockContractError {
  if (!(value instanceof Error) || value.name !== LOCK_ERROR_NAME) return false;
  const code = (value as Error & { code?: unknown }).code;
  return typeof code === 'string' && LOCK_ERROR_CODES.has(code);
}

// ── 내부 상태 형태 ────────────────────────────────────────────────────────────

interface BillingKeyEntry {
  readonly protectedRecord: string;
  readonly operationFingerprint: string | null;
}

interface CancelRetryEntry {
  readonly protectedRecord: string;
  readonly recordedAt: number;
}

interface DedupeEntry {
  readonly state: 'processing' | 'completed';
  readonly leaseExpiresAt: number | null;
  readonly completedAt: number | null;
}

interface MutableInboxRow extends MemoryWebhookInboxRow {
  deliveries: number;
  retriedCount: number;
  event: unknown;
}

interface HeldLock {
  readonly lock: MemoryLockClass;
  readonly key: string;
}

interface LockContext {
  readonly api: MemoryLockApi;
  readonly held: readonly HeldLock[];
  active: boolean;
}

/**
 * 한 lock callback의 billing-key transaction overlay(PostgreSQL transaction 대역).
 *
 * handle은 잠근 customerKey 하나만 만지므로 슬롯 하나면 transaction 전체다: `undefined`는
 * 아직 쓰지 않음, `null`은 삭제 예약, entry는 upsert 예약. handle 읽기는 이 슬롯을 먼저 보고
 * 바깥 `find`는 committed Map만 본다. callback 종료 후에는 `open`이 false가 되어 handle을
 * 더 쓸 수 없다.
 */
interface BillingKeyTransaction {
  readonly customerKey: string;
  pending: BillingKeyEntry | null | undefined;
  open: boolean;
}

// ── 팩토리 ───────────────────────────────────────────────────────────────────

export function createMemoryTossPaymentsPostgres(
  options: MemoryTossPaymentsPostgresOptions = {},
): MemoryTossPaymentsPostgres {
  const sensitiveValueProtector = requireSensitiveValueProtector(
    options.sensitiveValueProtector ?? unsafePlaintextSensitiveValueProtector,
  );
  assertSqlIdentifier(options.schema ?? DEFAULT_SCHEMA, 'schema');
  const leaseSeconds = options.dedupe?.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const completedTtlSeconds = options.dedupe?.completedTtlSeconds ?? DEFAULT_COMPLETED_TTL_SECONDS;
  const cancelRetryDays = options.retention?.cancelRetryDays ?? DEFAULT_CANCEL_RETRY_DAYS;
  assertPositiveFinite(leaseSeconds, 'dedupe.leaseSeconds');
  assertPositiveFinite(completedTtlSeconds, 'dedupe.completedTtlSeconds');
  assertPositiveInteger(cancelRetryDays, 'retention.cancelRetryDays');
  const now = options.now ?? (() => Date.now());

  const events: MemoryTossPaymentsPostgresEvent[] = [];
  const auditEntries: AuditEntry[] = [];
  const auditIds = new Set<string>();
  const inboxRows: MutableInboxRow[] = [];
  // PostgreSQL 행과 같은 snake_case 컬럼 형태로 보관해 같은 mapStoredOrder 투영·검증을 거친다.
  const orders = new Map<string, SqlRow>();
  const depositSecrets = new Map<string, string>();
  const billingKeys = new Map<string, BillingKeyEntry>();
  const cancelRetries = new Map<string, CancelRetryEntry>();
  const dedupe = new Map<string, DedupeEntry>();
  const inboxByKey = new Map<string, MutableInboxRow>();
  const appliedMigrations = new Set<string>();
  const mutex = createKeyedMutex();
  const lockContext = new AsyncLocalStorage<LockContext>();

  const emit = (event: MemoryTossPaymentsPostgresEvent): void => {
    events.push(event);
  };
  const storeEvent = (
    store: MemoryStoreName,
    operation: string,
    recordId: string,
    result?: boolean | string,
  ): void => {
    // exactOptionalPropertyTypes — result가 없으면 프로퍼티 자체를 만들지 않는다
    emit(result === undefined
      ? { type: 'store', store, operation, recordId }
      : { type: 'store', store, operation, recordId, result });
  };

  // ── lock 획득 공통 경로 ────────────────────────────────────────────────────

  /** README가 금지한 중첩과 PostgreSQL self-deadlock 재진입을 호출 즉시 거부한다. */
  const assertNotNested = (api: MemoryLockApi, requested: readonly HeldLock[]): void => {
    const outer = lockContext.getStore();
    if (outer === undefined || !outer.active) return;
    const reentrant = requested.some((request) =>
      outer.held.some((held) => held.lock === request.lock && held.key === request.key),
    );
    if (reentrant) {
      throw new MemoryLockContractError(
        'reentrant-lock',
        `${api}이(가) 바깥 ${outer.api} callback이 이미 잡은 lock을 다시 요청했습니다 — PostgreSQL에서는 self-deadlock입니다. 연관 작업은 한 callback에 두세요.`,
      );
    }
    throw new MemoryLockContractError(
      'nested-lock-api',
      `${api}을(를) ${outer.api} callback 안에서 호출했습니다 — public lock API 중첩은 금지입니다(pool max=1 self-deadlock·단일 transaction 보장 상실). host lifecycle + billing mutation은 withOpaqueMutationLock 하나로 결합하세요.`,
    );
  };

  /**
   * lock 순서대로 획득 → callback → 역순 해제. `transaction`이 있으면(billing-key API) callback
   * 성공 시 overlay를 committed Map에 적용하고(COMMIT — lock을 풀기 전에, PostgreSQL advisory
   * xact lock이 COMMIT에 풀리는 것과 같은 순서) throw 시 버린다(ROLLBACK). 어느 쪽이든 이후
   * handle은 닫힌다.
   */
  const runLocked = async <T>(
    api: MemoryLockApi,
    locks: readonly HeldLock[],
    transaction: BillingKeyTransaction | undefined,
    operation: () => Promise<T>,
  ): Promise<T> => {
    assertNotNested(api, locks);
    const releases: (() => void)[] = [];
    const context: LockContext = { api, held: locks, active: true };
    let outcome: MemoryLockReleasedEvent['outcome'] = 'commit';
    try {
      for (const { lock, key } of locks) {
        emit({ type: 'lock-requested', api, lock, key });
        releases.push(await mutex.acquire(`${lock}:${key}`));
        emit({ type: 'lock-acquired', api, lock, key });
      }
      let value: T;
      try {
        value = await lockContext.run(context, operation);
      } catch (cause) {
        outcome = 'rollback';
        throw cause;
      }
      if (transaction !== undefined && transaction.pending !== undefined) {
        if (transaction.pending === null) billingKeys.delete(transaction.customerKey);
        else billingKeys.set(transaction.customerKey, transaction.pending);
      }
      return value;
    } finally {
      context.active = false;
      if (transaction !== undefined) {
        transaction.open = false;
        transaction.pending = undefined;
      }
      // 역순 해제 — 획득 도중 실패해도 잡은 것만 푼다.
      for (let index = releases.length - 1; index >= 0; index -= 1) {
        releases[index]?.();
        const held = locks[index];
        if (held !== undefined) {
          emit({ type: 'lock-released', api, lock: held.lock, key: held.key, outcome });
        }
      }
    }
  };

  // ── billing keys ──────────────────────────────────────────────────────────

  const decodeBillingKey = async (
    customerKey: string,
    entry: BillingKeyEntry | undefined,
  ): Promise<LockedBillingKeySnapshot | null> => {
    if (entry === undefined) return null;
    return {
      record: await unprotectBillingKeyRecord(entry.protectedRecord, customerKey, sensitiveValueProtector),
      operationFingerprint: entry.operationFingerprint,
    };
  };

  /** committed 상태만 — lock 없는 바깥 `find`가 쓴다(다른 connection의 READ COMMITTED 읽기). */
  const loadCommittedBillingKey = (customerKey: string): Promise<LockedBillingKeySnapshot | null> =>
    decodeBillingKey(customerKey, billingKeys.get(customerKey));

  const encodeBillingKey = async (
    record: BillingKeyRecord,
    saveOptions: BillingKeySaveOptions | undefined,
  ): Promise<BillingKeyEntry> => ({
    protectedRecord: await protectBillingKeyRecord(record, sensitiveValueProtector),
    operationFingerprint: fingerprintOperationId(saveOptions?.operationId),
  });

  const createLockedMutation = (transaction: BillingKeyTransaction): PgBillingKeyMutation => {
    const customerKey = transaction.customerKey as BillingKeyRecord['customerKey'];

    const assertOpen = (operation: string): void => {
      if (transaction.open) return;
      throw new MemoryLockContractError(
        'handle-outside-callback',
        `mutation.${operation}을(를) callback이 끝난 뒤 호출했습니다 — PostgreSQL handle은 이미 COMMIT/ROLLBACK되어 반납된 connection에 묶여 있습니다. handle은 callback 안에서만 사용하세요.`,
      );
    };

    /** overlay 우선 — 같은 transaction에서 쓴 값을 읽는다(read-your-writes). */
    const loadInTransaction = (): Promise<LockedBillingKeySnapshot | null> =>
      decodeBillingKey(
        customerKey,
        transaction.pending === undefined ? billingKeys.get(customerKey) : (transaction.pending ?? undefined),
      );

    const stage = (entry: BillingKeyEntry | null): void => {
      transaction.pending = entry;
    };

    const replaceIfBillingKeyMatches = async (
      operation: 'delete' | 'deleteIfBillingKeyMatches' | 'replaceIfBillingKeyMatches',
      expectedBillingKey: BillingKeyRecord['billingKey'],
      replacement: Parameters<PgBillingKeyMutation['replaceIfBillingKeyMatches']>[1],
    ): Promise<boolean> => {
      assertOpen(operation);
      if (typeof expectedBillingKey !== 'string') {
        storeEvent('billingKeys', operation, customerKey, false);
        return false;
      }
      const replacementRecord = replacement === null ? null : recordFromReplacement(replacement);
      if (replacementRecord !== null) {
        assertRecordCustomerKey(replacementRecord, customerKey, 'replacement');
      }
      const replacementFingerprint =
        replacement === null ? null : operationFingerprintFromReplacement(replacement);

      const current = await loadInTransaction();
      if (
        current === null ||
        !billingKeysEqualConstantTime(current.record.billingKey, expectedBillingKey)
      ) {
        storeEvent('billingKeys', operation, customerKey, false);
        return false;
      }
      if (replacementRecord === null) {
        stage(null);
      } else {
        stage({
          protectedRecord: await protectBillingKeyRecord(replacementRecord, sensitiveValueProtector),
          operationFingerprint: replacementFingerprint,
        });
      }
      storeEvent('billingKeys', operation, customerKey, true);
      return true;
    };

    return {
      customerKey,
      async find() {
        assertOpen('find');
        storeEvent('billingKeys', 'find', customerKey);
        return (await loadInTransaction())?.record ?? null;
      },
      async save(record, saveOptions) {
        assertOpen('save');
        assertRecordCustomerKey(record, customerKey, 'record');
        stage(await encodeBillingKey(record, saveOptions));
        storeEvent('billingKeys', 'save', customerKey);
      },
      delete(expectedBillingKey) {
        return replaceIfBillingKeyMatches('delete', expectedBillingKey, null);
      },
      async replaceAndGetPrevious(record, saveOptions) {
        assertOpen('replaceAndGetPrevious');
        assertRecordCustomerKey(record, customerKey, 'record');
        const previous = await loadInTransaction();
        stage(await encodeBillingKey(record, saveOptions));
        storeEvent('billingKeys', 'replaceAndGetPrevious', customerKey);
        return previous === null ? null : snapshotFromLoaded(previous);
      },
      async isCurrentOperationId(operationId) {
        assertOpen('isCurrentOperationId');
        if (typeof operationId !== 'string') return false;
        const current = await loadInTransaction();
        const matched =
          current !== null &&
          current.operationFingerprint !== null &&
          operationFingerprintsEqual(current.operationFingerprint, fingerprintOperationId(operationId));
        storeEvent('billingKeys', 'isCurrentOperationId', customerKey, matched);
        return matched;
      },
      deleteIfBillingKeyMatches(expectedBillingKey) {
        return replaceIfBillingKeyMatches('deleteIfBillingKeyMatches', expectedBillingKey, null);
      },
      replaceIfBillingKeyMatches(expectedBillingKey, replacement) {
        return replaceIfBillingKeyMatches('replaceIfBillingKeyMatches', expectedBillingKey, replacement);
      },
    };
  };

  const beginBillingKeyTransaction = (customerKey: string): BillingKeyTransaction => ({
    customerKey,
    pending: undefined,
    open: true,
  });

  const withMutationLock: PgBillingKeyStore['withMutationLock'] = (customerKey, operation) => {
    const transaction = beginBillingKeyTransaction(customerKey);
    return runLocked(
      'billingKeys.withMutationLock',
      [{ lock: 'customer', key: customerKey }],
      transaction,
      async () => operation(createLockedMutation(transaction)),
    );
  };

  const withOpaqueMutationLock: PgBillingKeyStore['withOpaqueMutationLock'] = (
    opaqueKey,
    customerKey,
    operation,
  ) => {
    // PostgreSQL 구현과 같이 connection(여기서는 mutex)을 잡기 전에 **동기로** fail-fast한다.
    const normalizedOpaqueKey = createOpaqueAdvisoryLockKey(opaqueKey);
    const transaction = beginBillingKeyTransaction(customerKey);
    return runLocked(
      'billingKeys.withOpaqueMutationLock',
      [
        { lock: 'opaque', key: normalizedOpaqueKey },
        { lock: 'customer', key: customerKey },
      ],
      transaction,
      async () => operation(createLockedMutation(transaction)),
    );
  };

  const billingKeyStore: PgBillingKeyStore = {
    async save(record, saveOptions) {
      await withMutationLock(record.customerKey, (mutation) => mutation.save(record, saveOptions));
    },
    async find(customerKey) {
      // lock도 overlay도 없다 — 진행 중인 callback의 미커밋 쓰기는 보이지 않는다(READ COMMITTED).
      storeEvent('billingKeys', 'find', customerKey);
      return (await loadCommittedBillingKey(customerKey))?.record ?? null;
    },
    async delete(request) {
      return withMutationLock(request.customerKey, (mutation) =>
        mutation.delete(request.expectedBillingKey),
      );
    },
    withMutationLock,
    withOpaqueMutationLock,
    replaceAndGetPrevious(record, saveOptions) {
      return withMutationLock(record.customerKey, (mutation) =>
        mutation.replaceAndGetPrevious(record, saveOptions),
      );
    },
    replaceIfBillingKeyMatches(customerKey, expectedBillingKey, replacement) {
      return withMutationLock(customerKey, (mutation) =>
        mutation.replaceIfBillingKeyMatches(expectedBillingKey, replacement),
      );
    },
    deleteIfBillingKeyMatches(request) {
      return withMutationLock(request.customerKey, (mutation) =>
        mutation.deleteIfBillingKeyMatches(request.expectedBillingKey),
      );
    },
  };

  // ── opaque locks ──────────────────────────────────────────────────────────

  const opaqueLocks: PgOpaqueAdvisoryLocks = {
    // PostgreSQL 구현과 같이 async — invalid key는 sync throw가 아니라 rejection이다.
    async withLock(key: OpaqueAdvisoryLockKey, operation) {
      const normalizedKey = createOpaqueAdvisoryLockKey(key);
      return runLocked(
        'opaqueLocks.withLock',
        [{ lock: 'opaque', key: normalizedKey }],
        undefined,
        async () => operation(),
      );
    },
  };

  // ── orders ────────────────────────────────────────────────────────────────

  const orderStore: OrderStore = {
    async saveOrder(order) {
      const existing = orders.get(order.orderId);
      if (existing === undefined) {
        // INSERT 파라미터와 같은 5컬럼만 — 호출자가 붙인 여분 필드는 PostgreSQL처럼 버려진다.
        orders.set(order.orderId, {
          amount: order.amount,
          currency: order.currency,
          order_name: order.orderName,
          created_at: order.createdAt,
        });
        storeEvent('orders', 'saveOrder', order.orderId, 'inserted');
        return;
      }
      // PostgreSQL 구현과 동일 — 기존 행을 같은 투영으로 읽고 대조 원본 3필드만 비교
      // (createdAt은 호출마다 새로 찍힌다).
      const stored = mapStoredOrder(order.orderId, existing);
      const identical =
        stored.amount === order.amount &&
        stored.currency === order.currency &&
        stored.orderName === order.orderName;
      if (!identical) {
        storeEvent('orders', 'saveOrder', order.orderId, 'conflict');
        throw new TossPostgresError(
          'order-conflict',
          `이미 다른 값으로 저장된 orderId입니다(orderId: ${order.orderId}) — 금액 대조 원본은 덮어쓸 수 없습니다.`,
        );
      }
      storeEvent('orders', 'saveOrder', order.orderId, 'idempotent');
    },
    async loadOrder(orderId) {
      storeEvent('orders', 'loadOrder', orderId);
      const row = orders.get(orderId);
      // 같은 투영·검증(계약 5필드, safe-integer amount, 알려진 currency, invalid-row/unsafe-amount).
      return row === undefined ? null : mapStoredOrder(orderId, row);
    },
  };

  // ── deposit secrets ───────────────────────────────────────────────────────

  const depositSecretStore: DepositSecretStore = {
    async saveSecret(orderId, secret) {
      const protectedSecret = requireProtectedString(
        await sensitiveValueProtector.encrypt(
          secret,
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.depositSecret, orderId),
        ),
        'encrypt',
      );
      depositSecrets.set(orderId, protectedSecret);
      storeEvent('depositSecrets', 'saveSecret', orderId);
    },
    async getSecret(orderId) {
      storeEvent('depositSecrets', 'getSecret', orderId);
      const protectedSecret = depositSecrets.get(orderId);
      if (protectedSecret === undefined) return null;
      return requireProtectedString(
        await sensitiveValueProtector.decrypt(
          protectedSecret,
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.depositSecret, orderId),
        ),
        'decrypt',
      );
    },
  };

  // ── cancel retries ────────────────────────────────────────────────────────

  const cancelRetryStore: CancelRetryStore = {
    async save(record) {
      const protectedRecord = requireProtectedString(
        await sensitiveValueProtector.encrypt(
          JSON.stringify(record),
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.cancelRetryRecord, record.ticketId),
        ),
        'encrypt',
      );
      // 재저장은 record만 교체하고 recordedAt은 유지한다(TTL 기준점 고정 — PostgreSQL과 동일).
      const recordedAt = cancelRetries.get(record.ticketId)?.recordedAt ?? now();
      cancelRetries.set(record.ticketId, { protectedRecord, recordedAt });
      storeEvent('cancelRetries', 'save', record.ticketId);
    },
    async load(ticketId) {
      storeEvent('cancelRetries', 'load', ticketId);
      const entry = cancelRetries.get(ticketId);
      if (entry === undefined) return null;
      const json = requireProtectedString(
        await sensitiveValueProtector.decrypt(
          entry.protectedRecord,
          createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.cancelRetryRecord, ticketId),
        ),
        'decrypt',
      );
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new TossPostgresError(
          'invalid-row',
          `cancel_retries.record_json JSON 파싱에 실패했습니다(ticketId: ${ticketId}).`,
        );
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new TossPostgresError(
          'invalid-row',
          `cancel_retries.record_json이 CancelRetryRecord 형태가 아닙니다(ticketId: ${ticketId}).`,
        );
      }
      return parsed as CancelRetryRecord;
    },
    async delete(ticketId) {
      const existed = cancelRetries.delete(ticketId);
      storeEvent('cancelRetries', 'delete', ticketId, existed);
    },
  };

  // ── webhook dedupe ────────────────────────────────────────────────────────

  const webhookDedupeStore: WebhookDedupeStore = {
    async claim(dedupeKey) {
      // 검사와 점유 사이에 await가 없다 — 단일 문 CTE처럼 원자적이다.
      const current = dedupe.get(dedupeKey);
      const at = now();
      let outcome: 'claimed' | 'processing' | 'completed';
      if (current === undefined) {
        dedupe.set(dedupeKey, { state: 'processing', leaseExpiresAt: at + leaseSeconds * 1000, completedAt: null });
        outcome = 'claimed';
      } else if (current.state === 'completed') {
        outcome = 'completed';
      } else if (current.leaseExpiresAt !== null && current.leaseExpiresAt <= at) {
        dedupe.set(dedupeKey, { state: 'processing', leaseExpiresAt: at + leaseSeconds * 1000, completedAt: null });
        outcome = 'claimed';
      } else {
        outcome = 'processing';
      }
      storeEvent('webhookDedupe', 'claim', dedupeKey, outcome);
      return outcome;
    },
    async complete(dedupeKey) {
      const current = dedupe.get(dedupeKey);
      // PostgreSQL UPDATE와 같다 — 행이 없으면 아무 일도 없다.
      if (current !== undefined) {
        dedupe.set(dedupeKey, { state: 'completed', leaseExpiresAt: null, completedAt: now() });
      }
      storeEvent('webhookDedupe', 'complete', dedupeKey, current !== undefined);
    },
    async release(dedupeKey) {
      const current = dedupe.get(dedupeKey);
      const released = current?.state === 'processing';
      if (released) dedupe.delete(dedupeKey);
      storeEvent('webhookDedupe', 'release', dedupeKey, released);
    },
  };

  // ── audit ─────────────────────────────────────────────────────────────────

  const auditSink: PgAuditSink = {
    async record(entry) {
      // ON CONFLICT (id) DO NOTHING — 같은 id 재호출은 행을 늘리지 않지만 호출 자체는 로그에 남는다.
      if (auditIds.has(entry.id)) {
        storeEvent('audit', 'record', entry.id, 'duplicate');
        return;
      }
      auditIds.add(entry.id);
      auditEntries.push(entry);
      storeEvent('audit', 'record', entry.id, 'inserted');
    },
    async flush() {
      // 즉시 기록이라 in-flight가 없다 — 계약상 flush는 항상 성공한다.
    },
  };

  // ── inbox ─────────────────────────────────────────────────────────────────

  const inboxStore: WebhookInboxStore = {
    async record(webhook) {
      // PostgreSQL 저장본과 같은 정화·마스킹 — 원본 webhook 객체는 변형하지 않는다.
      const storedEvent: unknown = JSON.parse(
        serializeJsonb(webhook.event, { redactSensitiveValues: true }),
      );
      const existing = inboxByKey.get(webhook.meta.dedupeKey);
      if (existing === undefined) {
        const row: MutableInboxRow = {
          dedupeKey: webhook.meta.dedupeKey,
          transmissionId: webhook.meta.transmissionId,
          transmissionTime: webhook.meta.transmissionTime ?? null,
          retriedCount: webhook.meta.retriedCount,
          trust: webhook.trust,
          eventType: webhook.event.eventType,
          event: storedEvent,
          deliveries: 1,
        };
        inboxByKey.set(row.dedupeKey, row);
        inboxRows.push(row);
      } else {
        existing.deliveries += 1;
        existing.retriedCount = webhook.meta.retriedCount;
        existing.event = storedEvent;
      }
      storeEvent('inbox', 'record', webhook.meta.dedupeKey);
    },
  };

  // ── aggregate ─────────────────────────────────────────────────────────────

  return {
    orders: orderStore,
    depositSecrets: depositSecretStore,
    billingKeys: billingKeyStore,
    cancelRetries: cancelRetryStore,
    webhookDedupe: webhookDedupeStore,
    audit: auditSink,
    inbox: inboxStore,
    opaqueLocks,
    recorded: { events, auditEntries, inbox: inboxRows },

    async migrate(): Promise<MigrationResult> {
      const applied: string[] = [];
      const skipped: string[] = [];
      for (const id of MIGRATION_IDS) {
        if (appliedMigrations.has(id)) {
          skipped.push(id);
          continue;
        }
        appliedMigrations.add(id);
        applied.push(id);
      }
      emit({ type: 'migrate', applied, skipped });
      return { applied, skipped };
    },

    async cleanup(): Promise<CleanupResult> {
      const at = now();
      let dedupeDeleted = 0;
      for (const [key, entry] of dedupe) {
        if (entry.state === 'completed' && entry.completedAt !== null && entry.completedAt < at - completedTtlSeconds * 1000) {
          dedupe.delete(key);
          dedupeDeleted += 1;
        }
      }
      let cancelRetriesDeleted = 0;
      for (const [key, entry] of cancelRetries) {
        if (entry.recordedAt < at - cancelRetryDays * 86_400_000) {
          cancelRetries.delete(key);
          cancelRetriesDeleted += 1;
        }
      }
      emit({ type: 'cleanup', dedupeDeleted, cancelRetriesDeleted });
      return { dedupeDeleted, cancelRetriesDeleted };
    },

    reset() {
      orders.clear();
      depositSecrets.clear();
      billingKeys.clear();
      cancelRetries.clear();
      dedupe.clear();
      inboxByKey.clear();
      appliedMigrations.clear();
      mutex.clear();
      events.length = 0;
      auditEntries.length = 0;
      auditIds.clear();
      inboxRows.length = 0;
    },
  };
}
