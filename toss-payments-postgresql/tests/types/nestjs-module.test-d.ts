/**
 * §7 /nestjs — forRootAsync useFactory 반환 계약 + 토큰/데코레이터 타입 (설계 §7).
 *
 * 모듈은 순수 조립층이라 로직이 없다 — 타입 표면(옵션 수용 범위, useFactory 반환
 * 계약, 단일 토큰의 정체성)이 곧 공개 계약이므로 여기서 회귀 고정한다.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { DynamicModule } from '@nestjs/common';

import {
  InjectTossPaymentsPostgres,
  TOSS_PAYMENTS_POSTGRES,
  TossPaymentsPostgresModule,
} from '../../src/nestjs';
import type { TossPaymentsPostgres } from '../../src/nestjs';
import type { SqlClient, SqlExecutor, TossPaymentsPostgres as RootAggregate } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

const sql = forge<SqlClient>();

describe('§7 forRoot — 팩토리 옵션 + Nest 모듈 스코프', () => {
  it('정상 경로가 DynamicModule로 컴파일된다', () => {
    expectTypeOf(TossPaymentsPostgresModule.forRoot({ sql })).toEqualTypeOf<DynamicModule>();
    void TossPaymentsPostgresModule.forRoot({
      sql,
      schema: 'payments',
      dedupe: { leaseSeconds: 30 },
      retention: { cancelRetryDays: 15 },
      global: false,
    });
  });

  it('오용 = 컴파일 에러', () => {
    // @ts-expect-error sql 누락 — SqlClient 없이는 모듈 조립이 성립하지 않는다
    TossPaymentsPostgresModule.forRoot({});
    // @ts-expect-error global은 boolean
    TossPaymentsPostgresModule.forRoot({ sql, global: 'yes' });
    // @ts-expect-error 잘못된 옵션 키 — 부팅 시 자동 DDL 옵션 같은 것은 존재하지 않는다(설계 §0)
    TossPaymentsPostgresModule.forRoot({ sql, migrateOnBoot: true });
  });
});

describe('§7 forRootAsync — useFactory 반환 계약', () => {
  it('sync/async 반환 모두 TossPaymentsPostgresOptions면 통과한다', () => {
    expectTypeOf(
      TossPaymentsPostgresModule.forRootAsync({ useFactory: () => ({ sql }) }),
    ).toEqualTypeOf<DynamicModule>();
    void TossPaymentsPostgresModule.forRootAsync({
      inject: ['PG_POOL', TOSS_PAYMENTS_POSTGRES],
      useFactory: async () => ({ sql, schema: 'payments' }),
      global: false,
    });
  });

  it('반환 계약 위반 = 컴파일 에러 — 잘못된 배선이 부팅까지 살아남지 못한다', () => {
    // @ts-expect-error useFactory 누락 — 조립 수단 없는 async 모듈은 성립 불가
    TossPaymentsPostgresModule.forRootAsync({});
    // @ts-expect-error 반환에 sql 누락
    TossPaymentsPostgresModule.forRootAsync({ useFactory: () => ({}) });
    // @ts-expect-error 반환의 sql이 SqlExecutor — withConnection(migrate 요건) 없는 실행기는 거부
    TossPaymentsPostgresModule.forRootAsync({ useFactory: () => ({ sql: forge<SqlExecutor>() }) });
    // @ts-expect-error 옵션이 아닌 값 반환 불가
    TossPaymentsPostgresModule.forRootAsync({ useFactory: () => 42 });
    // @ts-expect-error inject 토큰은 InjectionToken(string | symbol | Type 등) — number 불가
    TossPaymentsPostgresModule.forRootAsync({ inject: [123], useFactory: () => ({ sql }) });
  });
});

describe('§7 토큰·데코레이터 — 집합체 단일 토큰, 명시적 Inject 위임', () => {
  it('TOSS_PAYMENTS_POSTGRES는 unique symbol이다 — 토큰 정체성 고정', () => {
    expectTypeOf(TOSS_PAYMENTS_POSTGRES).toExtend<symbol>();
    const token: typeof TOSS_PAYMENTS_POSTGRES = TOSS_PAYMENTS_POSTGRES;
    void token;
    // @ts-expect-error 일반 symbol은 unique symbol 토큰 자리에 대입 불가 — 같은 설명 문자열이라도 다른 토큰이다
    const impostor: typeof TOSS_PAYMENTS_POSTGRES = Symbol(
      '@gj-kit/toss-payments-postgresql:stores',
    );
    void impostor;
  });

  it('InjectTossPaymentsPostgres()는 ParameterDecorator를 반환한다', () => {
    expectTypeOf(InjectTossPaymentsPostgres()).toEqualTypeOf<ParameterDecorator>();
  });

  it('/nestjs 재export 집합체 타입 = 루트 엔트리 타입 — 주입부가 루트 import 없이 타이핑된다', () => {
    expectTypeOf<TossPaymentsPostgres>().toEqualTypeOf<RootAggregate>();
    // 주입부 사용 형태(서비스 코드)가 그대로 컴파일된다
    void ((pg: TossPaymentsPostgres) => pg.migrate().then((result) => result.applied));
  });
});
