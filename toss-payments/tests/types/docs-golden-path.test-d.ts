/**
 * Published core landing-page golden path — prevent the copyable first-payment
 * example from drifting away from the public API.
 */
import { describe, it } from 'vitest';

import { isErr, orThrow } from '../../src/index';
import {
  createTossPayments,
  parseApiSecretKey,
  parseSuccessCallback,
  type OrderStore,
} from '../../src/server';

describe('core landing-page golden path', () => {
  it('keeps the documented compose and verify-then-confirm route type-safe', () => {
    const localOrders = new Map();
    const orders: OrderStore = {
      saveOrder: async (order) => {
        localOrders.set(order.orderId, order);
      },
      loadOrder: async (orderId) => localOrders.get(orderId) ?? null,
    };

    const toss = createTossPayments({
      secretKey: orThrow(parseApiSecretKey('test_sk_docs-golden-path')),
      orders,
    });

    const created = toss.confirm.createOrder({
      amount: 1000,
      orderName: '테스트 주문',
    });
    void created;

    async function confirmPayment(url: string) {
      const parsed = parseSuccessCallback(url);
      if (isErr(parsed)) return { status: 400, body: parsed.error };

      const verified = await toss.confirm.verify(parsed.value);
      if (isErr(verified)) return { status: 400, body: verified.error };

      const payment = await toss.confirm.confirm(verified.value);
      return payment.ok
        ? { status: 200, body: payment.value }
        : { status: 502, body: payment.error };
    }

    void confirmPayment;
  });
});
