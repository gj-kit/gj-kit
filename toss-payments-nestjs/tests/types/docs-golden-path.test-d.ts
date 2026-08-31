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
  parseWidgetSecretKey,
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

const buildWidgetConfig = (orders: OrderStore) =>
  defineTossPaymentsConfig({
    secretKey: orThrow(parseWidgetSecretKey('test_gsk_docs-golden-path')),
    orders,
  });

type WidgetToss = TossPaymentsFor<ReturnType<typeof buildWidgetConfig>>;

@Injectable()
class PaymentsService {
  constructor(@InjectTossPayments() readonly toss: AppToss) {}

  createOrder() {
    return this.toss.confirm.createOrder({ amount: 9_900, orderName: 'Starter 플랜' });
  }
}

@Injectable()
class NamedPaymentsService {
  constructor(
    @InjectTossPayments('billing') readonly billing: AppToss,
    @InjectTossPayments('widget') readonly widget: WidgetToss,
  ) {}
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

@Module({
  imports: [
    TossPaymentsModule.registerAsync({
      name: 'billing',
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildTossConfig(orders),
    }),
    TossPaymentsModule.registerAsync({
      name: 'widget',
      imports: [TossStoresModule],
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) => buildWidgetConfig(orders),
    }),
  ],
  providers: [NamedPaymentsService],
})
class NamedAppModule {}

describe('README Nest 골든 패스', () => {
  it('DynamicModule import를 통해 store를 주입하고 confirm 타입을 보존한다', () => {
    void AppModule;
    void NamedAppModule;

    const service = null as unknown as PaymentsService;
    const named = null as unknown as NamedPaymentsService;
    expectTypeOf(service.toss.confirm).toMatchTypeOf<object>();
    expectTypeOf(service.createOrder).returns.toMatchTypeOf<Promise<unknown>>();
    expectTypeOf(named.billing.client.keyKind).toEqualTypeOf<'api'>();
    expectTypeOf(named.widget.client.keyKind).toEqualTypeOf<'widget'>();

    // README의 "실제로는 이렇게 걸립니다" 예제가 주장하는 바로 그 거부.
    // buildTossConfig는 BillingKeyStore를 배선하지 않으므로, DI token을 거쳐
    // 주입된 뒤에도 billing 프로퍼티 자체가 타입에 없어야 한다. 이 패키지의
    // README 코드 블록은 컴파일 검사 대상이 아니므로(scripts/check-readme.mjs는
    // 표식만 확인한다) 그 예제의 핵심 주장은 여기서 고정한다.
    // @ts-expect-error 배선하지 않은 flow는 프로퍼티로 존재하지 않는다.
    void service.toss.billing;
  });
});
