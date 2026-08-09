/**
 * 문자열 도메인 타입 — 스마트 생성자.
 * 검증 통과가 브랜드 획득의 유일한 경로다 (`as` 없이는 제조 불가).
 */
import type { Brand } from './brand';
import { err, ok, type Result } from './result';

/**
 * 주문 ID — 6–64자, `^[A-Za-z0-9_-]+$`.
 *
 * `'='`를 거부하는 근거: SDK 문서는 `=`를 포함한 집합을 허용하지만
 * 레퍼런스/빌링 승인의 orderId 규격은 영숫자와 `-`,`_`만 허용한다.
 * 같은 orderId가 일반 결제와 빌링 승인 양쪽에 쓰일 수 있으므로
 * 보수적 교집합을 채택해 빌링 승인 규격과의 충돌을 회피한다.
 */
export type OrderId = string & Brand<'OrderId'>;

/**
 * 고객 키 — 2–300자, `^[A-Za-z0-9\-_=.@]+$`.
 *
 * Phase 0 실측(2026-08-09): 토스 서버는 사실상 검증하지 않는다 —
 * 301자는 400이 아닌 **500 FAILED_DB_PROCESSING**, `"bad key!"`(공백+허용 외 문자)도 200.
 * 따라서 이 생성자가 실질 방어선이다. "특수문자 최소 1개" 문구는 허용 집합
 * 나열로 확인됐으므로(순수 영숫자 200 통과) 특수문자 필수 검증은 하지 않는다.
 */
export type CustomerKey = string & Brand<'CustomerKey'>;

/**
 * CustomerKey ∧ 길이 ≤50 (SDK 문서 한도) — 브라우저 API는 이것만 받는다.
 * 50자(SDK) vs 300자(서버 실측) 문서 모순을 서브타입 분리로 해소한다.
 */
export type WidgetCustomerKey = CustomerKey & Brand<'WidgetCustomerKey'>;

/** 주문명 — 1–100자. */
export type OrderName = string & Brand<'OrderName'>;
/** 취소 사유 — 1–200자. */
export type CancelReason = string & Brand<'CancelReason'>;
/** 결제 키 — 1–200자 (문서: 최대 200자). */
export type PaymentKey = string & Brand<'PaymentKey'>;
/**
 * 멱등키 — 1–300자 (초과 시 400 INVALID_IDEMPOTENCY_KEY).
 * 처음 사용일부터 15일 유효 — TTL 초과 후 재사용하면 새 요청으로 처리된다(문서).
 * 멱등 판정 조합은 "키 + API 키 + 주소 + 메서드"이며 **body는 포함되지 않는다**(문서 명시).
 */
export type IdempotencyKey = string & Brand<'IdempotencyKey'>;

export interface InvalidInput<Field extends string> {
  readonly source: 'library';
  readonly kind: 'invalid-input';
  readonly field: Field;
  readonly reason: 'too-short' | 'too-long' | 'bad-charset' | 'empty';
}

interface Constraint {
  readonly min: number;
  readonly max: number;
  readonly charset?: RegExp;
}

function validate<Field extends string>(
  raw: string,
  field: Field,
  constraint: Constraint,
): Result<string, InvalidInput<Field>> {
  const fail = (reason: InvalidInput<Field>['reason']): Result<never, InvalidInput<Field>> =>
    err({ source: 'library', kind: 'invalid-input', field, reason });
  if (raw.length === 0) return fail('empty');
  if (raw.length < constraint.min) return fail('too-short');
  if (raw.length > constraint.max) return fail('too-long');
  if (constraint.charset !== undefined && !constraint.charset.test(raw)) return fail('bad-charset');
  return ok(raw);
}

const ORDER_ID_CHARSET = /^[A-Za-z0-9_-]+$/;
const CUSTOMER_KEY_CHARSET = /^[A-Za-z0-9\-_=.@]+$/;

export function orderId(raw: string): Result<OrderId, InvalidInput<'orderId'>> {
  const r = validate(raw, 'orderId', { min: 6, max: 64, charset: ORDER_ID_CHARSET });
  // 검증 통과가 브랜드 부여의 유일한 경로 — 팬텀 브랜드는 단언으로만 각인 가능
  return r.ok ? ok(raw as OrderId) : r;
}

/**
 * 항상 유효한 OrderId 생성 — `${prefix}${epoch36}${rand}`.
 * 6–64자 보장: 코어(epoch36 8자 + 난수 10자 = 18자)가 하한을 채우고,
 * prefix는 허용 외 문자 제거 후 총 64자를 넘지 않게 절단한다.
 */
export function generateOrderId(prefix?: string): OrderId {
  const core = Date.now().toString(36) + randomBase36(10);
  const safePrefix =
    prefix === undefined
      ? ''
      : prefix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64 - core.length);
  return (safePrefix + core) as OrderId;
}

function randomBase36(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += (byte % 36).toString(36);
  return out;
}

export function customerKey(raw: string): Result<CustomerKey, InvalidInput<'customerKey'>> {
  const r = validate(raw, 'customerKey', { min: 2, max: 300, charset: CUSTOMER_KEY_CHARSET });
  return r.ok ? ok(raw as CustomerKey) : r;
}

export function widgetCustomerKey(
  raw: string,
): Result<WidgetCustomerKey, InvalidInput<'customerKey'>> {
  const r = validate(raw, 'customerKey', { min: 2, max: 50, charset: CUSTOMER_KEY_CHARSET });
  return r.ok ? ok(raw as WidgetCustomerKey) : r;
}

/** `crypto.randomUUID()` — 36자 `[0-9a-f-]`로 위젯(≤50)·서버(≤300) 두 규격을 모두 만족한다. */
export function generateCustomerKey(): WidgetCustomerKey {
  return globalThis.crypto.randomUUID() as WidgetCustomerKey;
}

export function orderName(raw: string): Result<OrderName, InvalidInput<'orderName'>> {
  const r = validate(raw, 'orderName', { min: 1, max: 100 });
  return r.ok ? ok(raw as OrderName) : r;
}

export function cancelReason(raw: string): Result<CancelReason, InvalidInput<'cancelReason'>> {
  const r = validate(raw, 'cancelReason', { min: 1, max: 200 });
  return r.ok ? ok(raw as CancelReason) : r;
}

export function paymentKey(raw: string): Result<PaymentKey, InvalidInput<'paymentKey'>> {
  const r = validate(raw, 'paymentKey', { min: 1, max: 200 });
  return r.ok ? ok(raw as PaymentKey) : r;
}

export function idempotencyKey(
  raw: string,
): Result<IdempotencyKey, InvalidInput<'idempotencyKey'>> {
  const r = validate(raw, 'idempotencyKey', { min: 1, max: 300 });
  return r.ok ? ok(raw as IdempotencyKey) : r;
}

/** `crypto.randomUUID()` — 36자로 300자 한도 내 항상 유효. */
export function generateIdempotencyKey(): IdempotencyKey {
  return globalThis.crypto.randomUUID() as IdempotencyKey;
}
