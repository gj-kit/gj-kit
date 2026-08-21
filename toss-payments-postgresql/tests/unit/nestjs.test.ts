/**
 * §7 TossPaymentsPostgresModule — 모듈 컴파일·집합체 주입 해석·forRootAsync 조립.
 *
 * emitDecoratorMetadata: false 환경(esbuild/vitest)에서 돌아간다는 사실 자체가 검증
 * 대상이다 — 모든 주입이 명시적 @Inject(토큰)로만 해석되어야 한다
 * (toss-payments-nestjs 선례 그대로).
 */
import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  InjectTossPaymentsPostgres,
  TOSS_PAYMENTS_POSTGRES,
  TossPaymentsPostgresModule,
} from '../../src/nestjs';
import type { TossPaymentsPostgres } from '../../src/nestjs';
import { createFakeSql } from './helpers/fake-sql';
import type { FakeSql } from './helpers/fake-sql';

@Injectable()
class PaymentsPersistenceService {
  // 명시적 @Inject(토큰)만 사용 — design:paramtypes 미의존(설계 §7)
  constructor(@InjectTossPaymentsPostgres() readonly pg: TossPaymentsPostgres) {}
}

describe('§7 forRoot — 모듈 컴파일과 집합체 주입 해석', () => {
  it('TOSS_PAYMENTS_POSTGRES 토큰으로 집합체가 해석된다(공개 표면 전부 보유)', async () => {
    const fake = createFakeSql();
    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsPostgresModule.forRoot({ sql: fake })],
    }).compile();

    const pg = moduleRef.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES);
    expect(typeof pg.orders.saveOrder).toBe('function');
    expect(typeof pg.depositSecrets.getSecret).toBe('function');
    expect(typeof pg.billingKeys.find).toBe('function');
    expect(typeof pg.cancelRetries.load).toBe('function');
    expect(typeof pg.webhookDedupe.claim).toBe('function');
    expect(typeof pg.audit.flush).toBe('function');
    expect(typeof pg.inbox.record).toBe('function');
    expect(typeof pg.migrate).toBe('function');
    expect(typeof pg.cleanup).toBe('function');
    // 순수 조립 — 모듈 컴파일이 DB에 접속하지 않는다(부팅 시 자동 DDL 금지, 설계 §0)
    expect(fake.calls).toHaveLength(0);
    expect(fake.connections).toBe(0);
    await moduleRef.close();
  });

  it('@InjectTossPaymentsPostgres() 생성자 주입 — 토큰 해석 값과 동일 인스턴스(useValue 싱글턴)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsPostgresModule.forRoot({ sql: createFakeSql() })],
      providers: [PaymentsPersistenceService],
    }).compile();

    const service = moduleRef.get(PaymentsPersistenceService);
    expect(service.pg).toBe(moduleRef.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES));
    await moduleRef.close();
  });

  it('주입된 집합체의 쿼리는 forRoot에 준 SqlClient로 흐른다(schema 옵션 반영)', async () => {
    const fake = createFakeSql();
    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsPostgresModule.forRoot({ sql: fake, schema: 'custom_schema' })],
      providers: [PaymentsPersistenceService],
    }).compile();

    const service = moduleRef.get(PaymentsPersistenceService);
    await service.pg.depositSecrets.getSecret('order_x' as never);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.text).toContain('"custom_schema".deposit_secrets');
    await moduleRef.close();
  });

  it('global 기본 true — import하지 않은 별도 모듈의 프로바이더도 주입받는다', async () => {
    @Module({ providers: [PaymentsPersistenceService], exports: [PaymentsPersistenceService] })
    class FeatureModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TossPaymentsPostgresModule.forRoot({ sql: createFakeSql() }), FeatureModule],
    }).compile();

    expect(moduleRef.get(PaymentsPersistenceService).pg).toBe(
      moduleRef.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES),
    );
    await moduleRef.close();
  });

  it('global: false — import 없는 모듈에서는 해석이 실패한다(스코프 존중)', async () => {
    @Module({ providers: [PaymentsPersistenceService] })
    class IsolatedModule {}

    await expect(
      Test.createTestingModule({
        imports: [
          TossPaymentsPostgresModule.forRoot({ sql: createFakeSql(), global: false }),
          IsolatedModule,
        ],
      }).compile(),
    ).rejects.toThrow(/toss-payments-postgresql:stores/);
  });

  it('잘못된 옵션은 모듈 조립 시점에 그대로 드러난다(fail-fast — 팩토리 검증 위임)', () => {
    expect(() =>
      TossPaymentsPostgresModule.forRoot({ sql: createFakeSql(), schema: 'Bad Schema' }),
    ).toThrow(/invalid|허용 형식/);
  });
});

describe('§7 forRootAsync — SqlClient를 Nest 프로바이더로 받아 조립하는 경로', () => {
  const SQL_CLIENT = Symbol('test:sql-client');

  it('inject 의존(SqlClient 프로바이더)을 useFactory로 받아 집합체를 만든다', async () => {
    const fake = createFakeSql();

    @Module({
      providers: [{ provide: SQL_CLIENT, useValue: fake }],
      exports: [SQL_CLIENT],
    })
    class SqlModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        TossPaymentsPostgresModule.forRootAsync({
          imports: [SqlModule],
          inject: [SQL_CLIENT],
          useFactory: (sql: FakeSql) => ({ sql, schema: 'async_schema' }),
        }),
      ],
      providers: [PaymentsPersistenceService],
    }).compile();

    const service = moduleRef.get(PaymentsPersistenceService);
    await service.pg.orders.loadOrder('order_x' as never);

    expect(fake.calls[0]?.text).toContain('"async_schema".orders'); // 주입된 sql·옵션이 실제 배선됐다
    await moduleRef.close();
  });

  it('비동기 useFactory(Promise 반환)도 해석된다', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TossPaymentsPostgresModule.forRootAsync({
          useFactory: async () => ({ sql: createFakeSql() }),
        }),
      ],
    }).compile();

    const pg = moduleRef.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES);
    expect(typeof pg.webhookDedupe.claim).toBe('function');
    await moduleRef.close();
  });

  it('forRootAsync도 global 기본 true·false 스코프를 지킨다', async () => {
    @Module({ providers: [PaymentsPersistenceService], exports: [PaymentsPersistenceService] })
    class FeatureModule {}

    const globalRef = await Test.createTestingModule({
      imports: [
        TossPaymentsPostgresModule.forRootAsync({ useFactory: () => ({ sql: createFakeSql() }) }),
        FeatureModule,
      ],
    }).compile();
    expect(globalRef.get(PaymentsPersistenceService).pg).toBeDefined();
    await globalRef.close();

    @Module({ providers: [PaymentsPersistenceService] })
    class IsolatedModule {}

    await expect(
      Test.createTestingModule({
        imports: [
          TossPaymentsPostgresModule.forRootAsync({
            useFactory: () => ({ sql: createFakeSql() }),
            global: false,
          }),
          IsolatedModule,
        ],
      }).compile(),
    ).rejects.toThrow(/toss-payments-postgresql:stores/);
  });
});

describe('§7 TOSS_PAYMENTS_POSTGRES 토큰', () => {
  it('Symbol.for 기반 — 전역 레지스트리 경유로 ESM/CJS 이중 로드에도 동일 토큰', () => {
    expect(TOSS_PAYMENTS_POSTGRES).toBe(Symbol.for('@gj-kit/toss-payments-postgresql:stores'));
  });
});
