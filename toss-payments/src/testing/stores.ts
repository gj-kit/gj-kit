/**
 * 인메모리 스토어 3종 — 단위 테스트·프로토타이핑용.
 *
 * 프로세스 생존 기간만 유지된다 — 프로덕션 사용 금지(특히 빌링키는 토스에 조회
 * API가 없어 저장 유실 = 복구 불가).
 *
 * 스토어 인터페이스는 전부 타입 전용 import다 — "./testing" 엔트리가 server/webhook
 * 모듈의 런타임 코드를 번들에 끌고 가지 않는다(격리 규칙 §2 유지).
 */
import type { BillingKeyRecord, BillingKeyStore, OrderStore, StoredOrder } from '../server/stores';
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
