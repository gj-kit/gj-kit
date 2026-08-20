/**
 * TossPaymentsPostgresModule — createTossPaymentsPostgres 집합체를 Nest DI에 얹는
 * DynamicModule (설계 §7, toss-payments-nestjs/module.ts 패턴 미러).
 *
 * 순수 조립층이다: 집합체 생성은 팩토리(createTossPaymentsPostgres)에 전량 위임하고,
 * 이 모듈은 `{ provide: 토큰, useValue/useFactory }` 바인딩만 소유한다 — 로직 중복 0.
 * migrate는 모듈이 자동 실행하지 않는다 — `main.ts`에서 `await pg.migrate()` 후
 * `app.listen`이 골든 패스다(부팅 시 자동 DDL 금지, 설계 §0).
 */
import { Module } from '@nestjs/common';
import type { DynamicModule, InjectionToken } from '@nestjs/common';

import { createTossPaymentsPostgres } from '../factory';
import type { TossPaymentsPostgresOptions } from '../factory';
import { TOSS_PAYMENTS_POSTGRES } from './inject';

/** forRoot 옵션 — 팩토리 옵션 + Nest 모듈 스코프. */
export interface TossPaymentsPostgresModuleOptions extends TossPaymentsPostgresOptions {
  /** 기본 true — 영속화 집합체는 전역 싱글턴이 자연스러운 단위다(모듈마다 재조립 금지). */
  readonly global?: boolean;
}

/** forRootAsync 옵션 — pg Pool 등을 Nest 프로바이더(inject)로 받아 조립하는 경로. */
export interface TossPaymentsPostgresModuleAsyncOptions {
  readonly imports?: DynamicModule['imports'];
  /** useFactory 파라미터로 주입할 프로바이더 토큰. 예: [ConfigService, PG_POOL] */
  readonly inject?: readonly InjectionToken[];
  readonly useFactory: (
    ...deps: readonly any[]
  ) => TossPaymentsPostgresOptions | Promise<TossPaymentsPostgresOptions>;
  /** 기본 true. 모듈 경계를 엄격히 유지하려면 false를 명시한다. */
  readonly global?: boolean;
}

@Module({})
export class TossPaymentsPostgresModule {
  /** 동기 조립 — `{ provide: TOSS_PAYMENTS_POSTGRES, useValue: createTossPaymentsPostgres(options) }`. */
  static forRoot(options: TossPaymentsPostgresModuleOptions): DynamicModule {
    // global은 Nest 모듈 스코프 옵션이다 — 팩토리에 흘려보내지 않고 여기서 소진한다.
    const { global, ...pgOptions } = options;
    return {
      module: TossPaymentsPostgresModule,
      global: global ?? true,
      providers: [
        { provide: TOSS_PAYMENTS_POSTGRES, useValue: createTossPaymentsPostgres(pgOptions) },
      ],
      exports: [TOSS_PAYMENTS_POSTGRES],
    };
  }

  /**
   * 비동기 조립 — 골든 패스는 코어 모듈과의 연쇄다:
   *
   * ```ts
   * TossPaymentsModule.forRootAsync({
   *   imports: [TossPaymentsPostgresModule.forRootAsync({ ... })],
   *   inject: [TOSS_PAYMENTS_POSTGRES],
   *   useFactory: (pg: TossPaymentsPostgres) =>
   *     defineTossPaymentsConfig({ secretKey, orders: pg.orders, ... }),
   * })
   * ```
   */
  static forRootAsync(options: TossPaymentsPostgresModuleAsyncOptions): DynamicModule {
    return {
      module: TossPaymentsPostgresModule,
      global: options.global ?? true,
      // exactOptionalPropertyTypes — imports 미지정 시 프로퍼티 자체를 만들지 않는다
      ...(options.imports !== undefined ? { imports: options.imports } : {}),
      providers: [
        {
          provide: TOSS_PAYMENTS_POSTGRES,
          inject: options.inject === undefined ? [] : [...options.inject],
          useFactory: async (...deps: readonly unknown[]) =>
            createTossPaymentsPostgres(await options.useFactory(...deps)),
        },
      ],
      exports: [TOSS_PAYMENTS_POSTGRES],
    };
  }
}
