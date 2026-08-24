import { describe, expect, it } from 'vitest';

import {
  cancelReason,
  cancelRequestId,
  customerKey,
  generateCustomerKey,
  generateIdempotencyKey,
  generateOrderId,
  idempotencyKey,
  isErr,
  isOk,
  orderId,
  orderName,
  paymentKey,
  widgetCustomerKey,
} from '../../src/index';
import type { InvalidInput, Result } from '../../src/index';

function reasonOf<T, F extends string>(r: Result<T, InvalidInput<F>>): string | null {
  return isErr(r) ? r.error.reason : null;
}

describe('orderId — 6-64자, ^[A-Za-z0-9_-]+$', () => {
  it('경계 길이', () => {
    expect(isOk(orderId('a'.repeat(6)))).toBe(true);
    expect(isOk(orderId('a'.repeat(64)))).toBe(true);
    expect(reasonOf(orderId('a'.repeat(5)))).toBe('too-short');
    expect(reasonOf(orderId('a'.repeat(65)))).toBe('too-long');
    expect(reasonOf(orderId(''))).toBe('empty');
  });

  it('문자셋 — 영숫자/-/_만, =는 거부(빌링 승인 규격 교집합)', () => {
    expect(isOk(orderId('Order_01-A'))).toBe(true);
    expect(reasonOf(orderId('order=1'))).toBe('bad-charset');
    expect(reasonOf(orderId('order.001'))).toBe('bad-charset');
    expect(reasonOf(orderId('주문번호123'))).toBe('bad-charset');
  });
});

describe('generateOrderId — 항상 유효·6-64 보장', () => {
  it('생성값이 자체 파서를 통과한다', () => {
    expect(isOk(orderId(generateOrderId()))).toBe(true);
    expect(isOk(orderId(generateOrderId('sub')))).toBe(true);
  });

  it('prefix의 허용 외 문자는 제거되고 초과분은 절단된다', () => {
    const weird = generateOrderId('한글!공백 prefix=');
    expect(isOk(orderId(weird))).toBe(true);

    const long = generateOrderId('p'.repeat(200));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(isOk(orderId(long))).toBe(true);
  });

  it('연속 생성해도 충돌하지 않는다 (난수 부착)', () => {
    const seen = new Set(Array.from({ length: 100 }, () => generateOrderId()));
    expect(seen.size).toBe(100);
  });
});

describe('customerKey — 2-300자, ^[A-Za-z0-9\\-_=.@]+$ (실측: 생성자가 실질 방어선)', () => {
  it('경계 길이 — 301자는 서버에서 500이 나므로 여기서 차단', () => {
    expect(isOk(customerKey('ab'))).toBe(true);
    expect(isOk(customerKey('a'.repeat(300)))).toBe(true);
    expect(reasonOf(customerKey('a'))).toBe('too-short');
    expect(reasonOf(customerKey('a'.repeat(301)))).toBe('too-long');
    expect(reasonOf(customerKey(''))).toBe('empty');
  });

  it('문자셋 — 특수문자 필수 아님(실측), 공백은 거부', () => {
    expect(isOk(customerKey('purealnum123'))).toBe(true);
    expect(isOk(customerKey('u-ser_k=e.y@1'))).toBe(true);
    expect(reasonOf(customerKey('bad key!'))).toBe('bad-charset');
  });
});

describe('widgetCustomerKey — CustomerKey ∧ ≤50자 (SDK 한도)', () => {
  it('경계 길이', () => {
    expect(isOk(widgetCustomerKey('a'.repeat(50)))).toBe(true);
    expect(reasonOf(widgetCustomerKey('a'.repeat(51)))).toBe('too-long');
    expect(reasonOf(widgetCustomerKey('a'))).toBe('too-short');
  });
});

describe('generateCustomerKey', () => {
  it('UUID — 위젯(≤50)·서버(≤300) 두 규격 모두 통과', () => {
    const generated = generateCustomerKey();
    expect(isOk(widgetCustomerKey(generated))).toBe(true);
    expect(isOk(customerKey(generated))).toBe(true);
  });
});

describe('orderName — 1-100자', () => {
  it('경계 + 한글 허용(문자셋 제한 없음)', () => {
    expect(isOk(orderName('프리미엄 플랜'))).toBe(true);
    expect(isOk(orderName('a'))).toBe(true);
    expect(isOk(orderName('a'.repeat(100)))).toBe(true);
    expect(reasonOf(orderName('a'.repeat(101)))).toBe('too-long');
    expect(reasonOf(orderName(''))).toBe('empty');
  });
});

describe('cancelReason — 1-200자', () => {
  it('경계', () => {
    expect(isOk(cancelReason('고객 요청 환불'))).toBe(true);
    expect(isOk(cancelReason('a'.repeat(200)))).toBe(true);
    expect(reasonOf(cancelReason('a'.repeat(201)))).toBe('too-long');
    expect(reasonOf(cancelReason(''))).toBe('empty');
  });
});

describe('paymentKey — 1-200자', () => {
  it('경계', () => {
    expect(isOk(paymentKey('tviva20260809abcdef'))).toBe(true);
    expect(isOk(paymentKey('a'.repeat(200)))).toBe(true);
    expect(reasonOf(paymentKey('a'.repeat(201)))).toBe('too-long');
    expect(reasonOf(paymentKey(''))).toBe('empty');
  });
});

describe('cancelRequestId — 6-64자, ^[A-Za-z0-9\\-_=]+$ (중국·동남아 비동기 취소 전용)', () => {
  it('경계 길이', () => {
    expect(isOk(cancelRequestId('a'.repeat(6)))).toBe(true);
    expect(isOk(cancelRequestId('a'.repeat(64)))).toBe(true);
    expect(reasonOf(cancelRequestId('a'.repeat(5)))).toBe('too-short');
    expect(reasonOf(cancelRequestId('a'.repeat(65)))).toBe('too-long');
    expect(reasonOf(cancelRequestId(''))).toBe('empty');
  });

  it('문자셋 — 영숫자/-/_/=만 허용', () => {
    expect(isOk(cancelRequestId('my-cancel_req=01'))).toBe(true);
    expect(reasonOf(cancelRequestId('req 0001'))).toBe('bad-charset');
    expect(reasonOf(cancelRequestId('req.0001'))).toBe('bad-charset');
    expect(reasonOf(cancelRequestId('취소요청0001'))).toBe('bad-charset');
  });
});

describe('idempotencyKey — 1-300자 (초과 시 서버 400 INVALID_IDEMPOTENCY_KEY) + 헤더 안전 문자셋', () => {
  it('경계', () => {
    expect(isOk(idempotencyKey('sub:2026-08:user-1'))).toBe(true);
    expect(isOk(idempotencyKey('a'.repeat(300)))).toBe(true);
    expect(reasonOf(idempotencyKey('a'.repeat(301)))).toBe('too-long');
    expect(reasonOf(idempotencyKey(''))).toBe('empty');
  });

  it('문자셋 — 공백 없는 출력 가능 ASCII(0x21–0x7E)만 허용: Ok ⇒ Idempotency-Key 헤더로 전송 가능', () => {
    // 출력 가능 ASCII 전 범위가 통과한다 (구분자 후보 `:`/`#` 포함)
    let visible = '';
    for (let c = 0x21; c <= 0x7e; c++) visible += String.fromCharCode(c);
    expect(isOk(idempotencyKey(visible))).toBe(true);
    expect(isOk(idempotencyKey('op:x#attempt-1'))).toBe(true);

    // fetch Headers가 TypeError로 거부하는 값 (비 Latin-1, CR/LF)
    expect(reasonOf(idempotencyKey('구독-01'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('a\r\nb'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('a\nb'))).toBe('bad-charset');
    // 전송은 되지만 중간 프록시가 trim/재인코딩할 수 있는 값 (공백·탭·Latin-1 확장·DEL·NUL)
    expect(reasonOf(idempotencyKey('a b'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey(' a'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('a\tb'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('café'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('a\x7fb'))).toBe('bad-charset');
    expect(reasonOf(idempotencyKey('a\0b'))).toBe('bad-charset');
  });

  it('generateIdempotencyKey는 항상 유효', () => {
    expect(isOk(idempotencyKey(generateIdempotencyKey()))).toBe(true);
  });
});
