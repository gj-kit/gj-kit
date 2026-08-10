/**
 * §4.2 TossPaymentsModule — 모듈 컴파일·kit 주입 해석·forRootAsync 조립 (설계 B4).
 *
 * emitDecoratorMetadata: false 환경(esbuild/vitest)에서 돌아간다는 사실 자체가 검증
 * 대상이다 — 모든 주입이 명시적 @Inject(토큰)로만 해석되어야 한다.
 */
import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import type { OrderStore, StoredOrder } from '@gj-kit/toss-payments/server';
import { memoryBillingKeyStore, memoryDedupeStore } from '@gj-kit/toss-payments/testing';

import { InjectTossPayments, TOSS_PAYMENTS, TossPaymentsModule } from '../../src/index';
import type { TossPaymentsFor } from '../../src/index';

const SK_RAW = 'test_sk_nestmodule01';

function sk() {
  return orThrow(parseApiSecretKey(SK_RAW));
}

function memoryOrders(): OrderStore {
  const map = new Map<string, StoredOrder>();
  return {
    saveOrder: async (order) => {
      map.set(order.orderId, order);
    },
    loadOrder: async (id) => map.get(id) ?? null,
  };
}

/** §4.3 타입 보존 패턴 그대로 — config 1회 정의 후 typeof로 kit 타입 복원. */
function makeConfig() {
  return defineTossPaymentsConfig({
    secretKey: sk(),
    orders: memoryOrders(),
    billingKeys: memoryBillingKeyStore(),
    webhook: { dedupe: memoryDedupeStore() },
  });
}
type AppToss = TossPaymentsFor<ReturnType<typeof makeConfig>>;

@Injectable()
class PaymentsService {
  // 명시적 @Inject(토큰)만 사용 — design:paramtypes 미의존(§4.1)
  constructor(@InjectTossPayments() readonly toss: AppToss) {}
}

describe('§4.2 forRoot — 모듈 컴파일과 kit 주입 해석', () => {
  it('TOSS_PAYMENTS 토큰으로 파사드 kit이 해석된다(배선 플로우 전부 보유)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsModule.forRoot(makeConfig())],
    }).compile();

    const kit = moduleRef.get<AppToss>(TOSS_PAYMENTS);
    expect(kit.client).toBeDefined();
    expect(kit.events).toBeDefined();
    // 배선한 플로우는 런타임 값에도 존재한다(파사드 조건부 조립)
    expect(kit.confirm).toBeDefined();
    expect(kit.billing).toBeDefined();
    expect(kit.webhook).toBeDefined();
    await moduleRef.close();
  });

  it('@InjectTossPayments() 생성자 주입 — 토큰 해석 값과 동일 인스턴스(useValue 싱글턴)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsModule.forRoot(makeConfig())],
      providers: [PaymentsService],
    }).compile();

    const service = moduleRef.get(PaymentsService);
    expect(service.toss).toBe(moduleRef.get<AppToss>(TOSS_PAYMENTS));
    await moduleRef.close();
  });

  it('global 기본 true — import하지 않은 별도 모듈의 프로바이더도 주입받는다', async () => {
    @Module({ providers: [PaymentsService], exports: [PaymentsService] })
    class FeatureModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsModule.forRoot(makeConfig()), FeatureModule],
    }).compile();

    expect(moduleRef.get(PaymentsService).toss).toBe(moduleRef.get<AppToss>(TOSS_PAYMENTS));
    await moduleRef.close();
  });

  it('global: false — import 없는 모듈에서는 해석이 실패한다(스코프 존중)', async () => {
    @Module({ providers: [PaymentsService] })
    class IsolatedModule {}

    await expect(
      Test.createTestingModule({
        imports: [TossPaymentsModule.forRoot(makeConfig(), { global: false }), IsolatedModule],
      }).compile(),
    ).rejects.toThrow(/toss-payments-nestjs:facade/);
  });
});

describe('§4.2 forRootAsync — 스토어를 Nest 프로바이더로 조립하는 경로', () => {
  const STORES = Symbol('test:stores');

  interface Stores {
    readonly orders: OrderStore;
  }

  @Module({
    providers: [{ provide: STORES, useValue: { orders: memoryOrders() } satisfies Stores }],
    exports: [STORES],
  })
  class StoresModule {}

  it('inject 의존(스토어 프로바이더)을 useFactory로 받아 kit을 만든다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TossPaymentsModule.forRootAsync({
          imports: [StoresModule],
          inject: [STORES],
          // §4.3 강권 — 팩토리 반환은 defineTossPaymentsConfig로 const 추론 고정
          useFactory: (stores: Stores) =>
            defineTossPaymentsConfig({ secretKey: sk(), orders: stores.orders }),
        }),
      ],
    }).compile();

    const kit = moduleRef.get<{ client: unknown; confirm?: unknown; billing?: unknown }>(
      TOSS_PAYMENTS,
    );
    expect(kit.client).toBeDefined();
    expect(kit.confirm).toBeDefined(); // orders 배선 → confirm 존재
    expect(kit.billing).toBeUndefined(); // billingKeys 미배선 → billing 부재
    await moduleRef.close();
  });

  it('비동기 useFactory(Promise 반환)도 해석된다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TossPaymentsModule.forRootAsync({
          useFactory: async () => defineTossPaymentsConfig({ secretKey: sk() }),
        }),
      ],
    }).compile();

    const kit = moduleRef.get<{ client: unknown; events: unknown; confirm?: unknown }>(
      TOSS_PAYMENTS,
    );
    expect(kit.client).toBeDefined();
    expect(kit.events).toBeDefined(); // 항상 존재(no-op 표면)
    expect(kit.confirm).toBeUndefined();
    await moduleRef.close();
  });
});

describe('§4.2 TOSS_PAYMENTS 토큰', () => {
  it('Symbol.for 기반 — 전역 레지스트리 경유로 이중 로드에도 동일 토큰', () => {
    expect(TOSS_PAYMENTS).toBe(Symbol.for('@gj-kit/toss-payments-nestjs:facade'));
  });
});
