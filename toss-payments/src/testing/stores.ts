/**
 * 인메모리 스토어 4종 + 인메모리 AuditSink — 단위 테스트·프로토타이핑용.
 *
 * 프로세스 생존 기간만 유지된다 — 프로덕션 사용 금지(특히 빌링키는 토스에 조회
 * API가 없어 저장 유실 = 복구 불가).
 *
 * 스토어 인터페이스는 전부 타입 전용 import다 — "./testing" 엔트리가 server/webhook
 * 모듈의 런타임 코드를 번들에 끌고 가지 않는다(격리 규칙 §2 유지).
 */
import type { AuditEntry, AuditSink } from '../core/audit';
import type {
  BillingKeyRecord,
  BillingKeyStore,
  DepositSecretStore,
  OrderStore,
  StoredOrder,
} from '../server/stores';
import type { CancelRetryRecord, CancelRetryStore } from '../server/cancel';
import type { WebhookDedupeStore } from '../webhook/verifier';

/**
 * orderId 키 인메모리 OrderStore — saveOrder는 같은 orderId를 덮어쓴다.
 *
 * `orderOf` is a side-effect-free inspection hook for assertions (mirrors the
 * `memoryAuditSink().entries` convention): it never creates, claims or mutates an entry, and
 * it returns a defensive copy — mutating the returned object cannot corrupt the store.
 */
export function memoryOrderStore(): OrderStore & {
  orderOf(orderId: string): StoredOrder | undefined;
} {
  const orders = new Map<string, StoredOrder>();
  return {
    async saveOrder(order) {
      orders.set(order.orderId, order);
    },
    async loadOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
    orderOf(orderId) {
      const order = orders.get(orderId);
      return order === undefined ? undefined : { ...order };
    },
  };
}

/**
 * customerKey 키 인메모리 BillingKeyStore — save는 같은 customerKey를 덮어쓴다(upsert).
 *
 * `delete` 비교와 제거 사이에 await가 없어 한 JavaScript 프로세스 안에서는 조건부
 * 삭제가 원자적이다. 다중 프로세스/인스턴스 환경에는 DB CAS 또는 transaction 구현을
 * 써야 하며, 이 테스트용 구현을 프로덕션에 사용하면 안 된다.
 */
export function memoryBillingKeyStore(): BillingKeyStore & {
  recordOf(customerKey: string): BillingKeyRecord | undefined;
} {
  const records = new Map<string, BillingKeyRecord>();
  return {
    async save(record) {
      records.set(record.customerKey, record);
    },
    async find(customerKey) {
      return records.get(customerKey) ?? null;
    },
    /**
     * Side-effect-free readonly inspection — returns a deep defensive copy (nested `card`
     * object and `transfers` array included), so mutating it cannot corrupt the store.
     */
    recordOf(customerKey) {
      const record = records.get(customerKey);
      if (record === undefined) return undefined;
      return {
        ...record,
        card: record.card === null ? null : { ...record.card },
        transfers:
          record.transfers === null
            ? null
            : record.transfers.map((transfer) => ({ ...transfer })),
      };
    },
    async delete({ customerKey, expectedBillingKey }) {
      const current = records.get(customerKey);
      if (current === undefined || current.billingKey !== expectedBillingKey) return false;
      records.delete(customerKey);
      return true;
    },
  };
}

/**
 * orderId 키 인메모리 DepositSecretStore — saveSecret은 같은 orderId를 덮어쓴다(upsert 계약).
 * confirm측 자동 저장 + 웹훅측 getSecret 대조를 한 객체로 배선하는 §3.1 인터페이스의
 * 테스트용 구현이다.
 */
export function memoryDepositSecretStore(): DepositSecretStore & {
  secretOf(orderId: string): string | undefined;
} {
  const secrets = new Map<string, string>();
  return {
    async saveSecret(orderId, secret) {
      secrets.set(orderId, secret);
    },
    async getSecret(orderId) {
      return secrets.get(orderId) ?? null;
    },
    /** Side-effect-free readonly inspection — `undefined` when no secret was stored. */
    secretOf(orderId) {
      return secrets.get(orderId);
    },
  };
}

/**
 * 인메모리 AuditSink — 단위 테스트·프로토타이핑용 (설계 §3.2).
 * `entries`는 기록 순서를 보존한다(클라이언트는 시도 순서대로 동기 record 호출).
 */
export function memoryAuditSink(): AuditSink & { readonly entries: readonly AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record(entry) {
      entries.push(entry);
    },
  };
}

/**
 * 인메모리 dedupe — 단일 프로세스 한정. 분산 환경은 Redis `SET NX` 등으로 대체할 것.
 *
 * `stateOf` answers "what state is this key in right now?" without the side effect a probing
 * `claim()` has (a claim after `release` would re-occupy the key as `processing` and poison
 * later assertions). `undefined` means the key is unknown or was released — i.e. claimable.
 */
export function memoryDedupeStore(): WebhookDedupeStore & {
  stateOf(dedupeKey: string): 'processing' | 'completed' | undefined;
} {
  const states = new Map<string, 'processing' | 'completed'>();
  return {
    claim(dedupeKey) {
      // 검사와 점유 사이에 await가 없다 — JS run-to-completion 모델상 원자적 claim.
      const state = states.get(dedupeKey);
      if (state !== undefined) return Promise.resolve(state);
      states.set(dedupeKey, 'processing');
      return Promise.resolve('claimed');
    },
    complete(dedupeKey) {
      states.set(dedupeKey, 'completed');
      return Promise.resolve();
    },
    release(dedupeKey) {
      if (states.get(dedupeKey) === 'processing') states.delete(dedupeKey);
      return Promise.resolve();
    },
    stateOf(dedupeKey) {
      return states.get(dedupeKey);
    },
  };
}

/**
 * 취소 재시도 레코드 인메모리 저장소 — 단위 테스트/프로토타입 전용.
 *
 * `recordOf` is a side-effect-free readonly inspection returning a defensive copy.
 */
export function memoryCancelRetryStore(): CancelRetryStore & {
  recordOf(ticketId: string): CancelRetryRecord | undefined;
} {
  const records = new Map<string, CancelRetryRecord>();
  return {
    async save(record) {
      records.set(record.ticketId, record);
    },
    async load(ticketId) {
      return records.get(ticketId) ?? null;
    },
    async delete(ticketId) {
      records.delete(ticketId);
    },
    recordOf(ticketId) {
      const record = records.get(ticketId);
      return record === undefined ? undefined : { ...record };
    },
  };
}
