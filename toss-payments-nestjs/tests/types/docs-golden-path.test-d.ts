/**
 * README의 “Nest 골든 패스”를 타입 검사한다.
 *
 * 핵심은 forRootAsync factory의 provider가 DynamicModule imports에서 export되고,
 * buildTossConfig의 ReturnType으로 주입부의 조건부 kit 타입을 복원하는 것이다.
 */
import { Injectable, Module } from '@nestjs/common';
import { describe, expectTypeOf, it } from 'vitest';

import { orThrow } from '@gj-kit/toss-payments';
import {
  defineTossPaymentsConfig,
  parseApiSecretKey,
  type OrderStore,
  type StoredOrder,
} from '@gj-kit/toss-payments/server';

import { InjectTossPayments, TossPaymentsModule } from '../../src/index';
import type { TossPaymentsFor } from '../../src/index';

@Injectable()
class TossOrderStore implements OrderStore {
  private readonly orders = new Map<string, StoredOrder>();

  async saveOrder(order: StoredOrder): Promise<void> {
    this.orders.set(order.orderId, order);
  }

  async loadOrder(orderId: StoredOrder['orderId']): Promise<StoredOrder | null> {
    return this.orders.get(orderId) ?? null;
  }
}

@Module({
  providers: [TossOrderStore],
  exports: [TossOrderStore],
})
class TossStoresModule {}

const buildTossConfig = (orders: OrderStore) =>
  defineTossPaymentsConfig({
    secretKey: orThrow(parseApiSecretKey('test_sk_docs-golden-path')),
    orders,
  });

type AppToss = TossPaymentsFor<ReturnType<typeof buildTossConfig>>;

@Injectable()
class PaymentsService {
  constructor(@InjectTossPayments() readonly toss: AppToss) {}

  createOrder() {
    return this.toss.confirm.createOrder({ amount: 9_900, orderName: 'Starter 플랜' });
  }
}

@Module({
  imports: [
    TossPaymentsModule.forRootAsync({
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildTossConfig(orders),
    }),
  ],
  providers: [PaymentsService],
})
class AppModule {}

describe('README Nest 골든 패스', () => {
  it('DynamicModule import를 통해 store를 주입하고 confirm 타입을 보존한다', () => {
    void AppModule;

    const service = null as unknown as PaymentsService;
    expectTypeOf(service.toss.confirm).toMatchTypeOf<object>();
    expectTypeOf(service.createOrder).returns.toMatchTypeOf<Promise<unknown>>();
  });
});
