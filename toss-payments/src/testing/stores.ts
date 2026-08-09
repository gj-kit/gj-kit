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
import type { WebhookDedupeStore } from '../webhook/verifier';

/** orderId 키 인메모리 OrderStore — saveOrder는 같은 orderId를 덮어쓴다. */
export function memoryOrderStore(): OrderStore {
  const orders = new Map<string, StoredOrder>();
  return {
    async saveOrder(order) {
      orders.set(order.orderId, order);
    },
    async loadOrder(orderId) {
      return orders.get(orderId) ?? null;
    },
  };
}

/** customerKey 키 인메모리 BillingKeyStore — save는 같은 customerKey를 덮어쓴다(upsert). */
export function memoryBillingKeyStore(): BillingKeyStore {
  const records = new Map<string, BillingKeyRecord>();
  return {
    async save(record) {
      records.set(record.customerKey, record);
    },
    async find(customerKey) {
      return records.get(customerKey) ?? null;
    },
    async delete(customerKey) {
      records.delete(customerKey);
    },
  };
}

/**
 * orderId 키 인메모리 DepositSecretStore — saveSecret은 같은 orderId를 덮어쓴다(upsert 계약).
 * confirm측 자동 저장 + 웹훅측 getSecret 대조를 한 객체로 배선하는 §3.1 인터페이스의
 * 테스트용 구현이다.
 */
export function memoryDepositSecretStore(): DepositSecretStore {
  const secrets = new Map<string, string>();
  return {
    async saveSecret(orderId, secret) {
      secrets.set(orderId, secret);
    },
    async getSecret(orderId) {
      return secrets.get(orderId) ?? null;
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

/** 인메모리 dedupe — 단일 프로세스 한정. 분산 환경은 Redis `SET NX` 등으로 대체할 것. */
export function memoryDedupeStore(): WebhookDedupeStore {
  const claimed = new Set<string>();
  return {
    claim(transmissionId) {
      // 검사와 점유 사이에 await가 없다 — JS run-to-completion 모델상 원자적 claim.
      if (claimed.has(transmissionId)) return Promise.resolve(false);
      claimed.add(transmissionId);
      return Promise.resolve(true);
    },
  };
}
