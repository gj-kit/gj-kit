import { describe, expectTypeOf, it } from 'vitest';

import { generateCustomerKey, generateOrderId } from '../../src/index';
import type { CustomerKey, OrderId, PaymentKey, WidgetCustomerKey } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('문자열 도메인 타입 — 브랜드 위조 불가', () => {
  it('raw string 대입 불가 — 스마트 생성자만이 생성 경로', () => {
    // @ts-expect-error raw string은 OrderId가 아니다
    const oid: OrderId = 'my-order-1';
    void oid;
    // @ts-expect-error raw string은 CustomerKey가 아니다
    const ck: CustomerKey = 'user-42';
    void ck;
    // @ts-expect-error raw string은 PaymentKey가 아니다
    const pk: PaymentKey = 'tviva20260809xxxx';
    void pk;
  });

  it('브랜드 간 대입 불가 — 같은 string 기반이라도 명목성이 다르다', () => {
    const oid = forge<OrderId>();
    // @ts-expect-error OrderId를 PaymentKey 자리에
    const pk: PaymentKey = oid;
    void pk;
    const ck = forge<CustomerKey>();
    // @ts-expect-error CustomerKey를 OrderId 자리에
    const oid2: OrderId = ck;
    void oid2;
  });
});

describe('WidgetCustomerKey ⊂ CustomerKey — 서브타입 방향성', () => {
  it('위젯 키(≤50)는 서버용 CustomerKey(≤300) 자리에 들어간다', () => {
    const wck = forge<WidgetCustomerKey>();
    const ck: CustomerKey = wck; // OK — 상향은 항상 안전
    void ck;
    expectTypeOf<WidgetCustomerKey>().toExtend<CustomerKey>();
  });

  it('역방향 불가 — 300자 허용 서버용 키를 위젯 자리에 넣을 수 없다', () => {
    const ck = forge<CustomerKey>();
    // @ts-expect-error CustomerKey는 WidgetCustomerKey가 아니다 (길이 ≤50 미검증)
    const wck: WidgetCustomerKey = ck;
    void wck;
    expectTypeOf<CustomerKey>().not.toExtend<WidgetCustomerKey>();
  });
});

describe('생성기 반환 타입', () => {
  it('generateOrderId → OrderId, generateCustomerKey → WidgetCustomerKey(두 규격 만족)', () => {
    expectTypeOf(generateOrderId).returns.toEqualTypeOf<OrderId>();
    expectTypeOf(generateCustomerKey).returns.toEqualTypeOf<WidgetCustomerKey>();
    // WidgetCustomerKey는 CustomerKey로도 쓸 수 있다
    const ck: CustomerKey = generateCustomerKey();
    void ck;
  });
});
