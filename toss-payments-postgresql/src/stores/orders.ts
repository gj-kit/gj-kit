/**
 * OrderStore PostgreSQL 구현 — 금액 대조의 단일 진실 공급원 (설계 §3.1).
 *
 * 코어 계약의 핵심 불변식:
 * - `saveOrder`는 **insert-only + 동일값 재저장 무해**다. 조용한 upsert로 원본 금액을
 *   덮으면 confirm의 금액 대조 검증 전체가 무력화된다 — 다른 값 재저장은
 *   `order-conflict`로 throw하고, 동일값 재시도(네트워크 재시도 등)는 멱등하게 성공한다.
 *   동일값 판정은 **대조 원본인 amount·currency·orderName만** 본다 — createdAt은 코어
 *   createOrder가 호출마다 clock()으로 새로 찍으므로(confirm.ts), 비교에 넣으면
 *   소비자 orderId 재제출(더블클릭 등)이 항상 conflict가 되어 멱등 보장이 도달
 *   불가능해진다. 최초 저장본의 createdAt이 유지된다.
 * - `createdAt`은 코어가 string으로 준 원문을 text로 왕복 보존한다(재직렬화 손실 금지).
 * - pg 드라이버는 bigint를 string으로 반환한다 — `loadOrder`는 Number 변환 후
 *   `Number.isSafeInteger` 검증을 통과한 값만 내보낸다(정밀도 손실 거부).
 */
import type { OrderId } from '@gj-kit/toss-payments';
import type { OrderStore, StoredOrder } from '@gj-kit/toss-payments/server';

import { TossPostgresError } from '../errors';
import { schemaRef } from '../identifiers';
import type { SqlExecutor, SqlRow } from '../sql';

export interface PgStoreOptions {
  /** 기본 'toss_payments'. `/^[a-z_][a-z0-9_]{0,62}$/` 위반 시 즉시 throw. */
  readonly schema?: string;
}

const CURRENCIES: ReadonlySet<string> = new Set(['KRW', 'USD', 'JPY']);

export function createPgOrderStore(sql: SqlExecutor, options?: PgStoreOptions): OrderStore {
  const qs = schemaRef(options?.schema);

  const insertSql = `INSERT INTO ${qs}.orders (order_id, amount, currency, order_name, created_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (order_id) DO NOTHING
RETURNING order_id`;

  const selectSql = `SELECT amount, currency, order_name, created_at
FROM ${qs}.orders
WHERE order_id = $1`;

  return {
    async saveOrder(order) {
      const inserted = await sql.query(insertSql, [
        order.orderId,
        order.amount,
        order.currency,
        order.orderName,
        order.createdAt,
      ]);
      if (inserted.rows.length > 0) return; // 신규 insert 성공 (RETURNING으로 판정 — rowCount 미의존)

      // 충돌 — 기존 행과 4필드 전부 동일할 때만 멱등 성공으로 취급한다.
      const existing = await sql.query(selectSql, [order.orderId]);
      const row = existing.rows[0];
      if (row === undefined) {
        // 극단 레이스(orders는 삭제 경로가 없어 실제로는 도달 불가) — 조용히 넘기지 않는다.
        throw new TossPostgresError(
          'invalid-row',
          'saveOrder 충돌 후 기존 행 조회에 실패했습니다 — orders 테이블 외부 변조 여부를 확인하세요.',
        );
      }
      const stored = mapStoredOrder(order.orderId, row);
      // createdAt은 의도적으로 비교하지 않는다 — 코어 createOrder가 호출마다 새로
      // 생성하는 메타데이터라, 포함하면 정당한 재제출까지 conflict가 된다(헤더 주석).
      const identical =
        stored.amount === order.amount &&
        stored.currency === order.currency &&
        stored.orderName === order.orderName;
      if (!identical) {
        // 금액·통화 등 구체 값은 메시지에 싣지 않는다 — 로그 표면 최소화(orderId만).
        throw new TossPostgresError(
          'order-conflict',
          `이미 다른 값으로 저장된 orderId입니다(orderId: ${order.orderId}) — 금액 대조 원본은 덮어쓸 수 없습니다.`,
        );
      }
    },

    async loadOrder(orderId) {
      const result = await sql.query(selectSql, [orderId]);
      const row = result.rows[0];
      if (row === undefined) return null;
      return mapStoredOrder(orderId, row);
    },
  };
}

function mapStoredOrder(orderId: OrderId, row: SqlRow): StoredOrder {
  const amount = toSafeAmount(row['amount']);
  const currency = row['currency'];
  const orderName = row['order_name'];
  const createdAt = row['created_at'];
  if (
    typeof currency !== 'string' ||
    !CURRENCIES.has(currency) ||
    typeof orderName !== 'string' ||
    typeof createdAt !== 'string'
  ) {
    throw new TossPostgresError(
      'invalid-row',
      `orders 행이 StoredOrder 계약 형태가 아닙니다(orderId: ${orderId}).`,
    );
  }
  return {
    orderId,
    amount,
    currency: currency as StoredOrder['currency'],
    orderName,
    createdAt,
  };
}

/**
 * bigint 컬럼 → number 변환. pg는 int8을 string으로 내려주지만, 커스텀 SqlClient가
 * number/bigint를 내려줄 수도 있어 셋 다 수용한다. Number.isSafeInteger 밖의 값은
 * 반올림된 금액이 검증에 쓰이는 사고를 막기 위해 throw한다.
 */
function toSafeAmount(value: unknown): number {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    amount = Number(value);
  } else if (typeof value === 'bigint') {
    amount = Number(value);
    if (BigInt(Number.isSafeInteger(amount) ? amount : 0) !== value) {
      throw unsafeAmount();
    }
  } else {
    throw new TossPostgresError('invalid-row', 'orders.amount 컬럼이 숫자 형태가 아닙니다.');
  }
  if (!Number.isSafeInteger(amount)) throw unsafeAmount();
  return amount;
}

function unsafeAmount(): TossPostgresError {
  return new TossPostgresError(
    'unsafe-amount',
    'orders.amount가 Number.isSafeInteger 범위를 벗어났습니다 — 정밀도 손실 금액으로 대조할 수 없습니다.',
  );
}
