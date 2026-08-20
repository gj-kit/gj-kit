/**
 * TossPaymentsModule — createTossPayments 파사드를 Nest DI에 얹는 DynamicModule (설계 §4.2).
 *
 * 순수 조립층이다: kit 생성은 코어 파사드(createTossPayments)에 전량 위임하고,
 * 이 모듈은 `{ provide: token, useValue/useFactory }` 바인딩만 소유한다 — 로직 중복 0.
 */
import { Module } from '@nestjs/common';
import type { DynamicModule, InjectionToken } from '@nestjs/common';
import { createTossPayments } from '@gj-kit/toss-payments/server';
import type {
  Env,
  KeyKind,
  TossPaymentsApiConfig,
  TossPaymentsKit,
  TossPaymentsWidgetConfig,
} from '@gj-kit/toss-payments/server';

import { getTossPaymentsToken, TOSS_PAYMENTS, type TossPaymentsKitName } from './inject';

/** forRoot/forRootAsync가 수용하는 config 합집합 — 코어 defineTossPaymentsConfig 산출물. */
export type AnyTossPaymentsConfig = TossPaymentsApiConfig<Env> | TossPaymentsWidgetConfig<Env>;

/**
 * 앱이 조건부 파사드 타입을 보존하는 별칭 헬퍼 (설계 §4.3) — forRootAsync는 런타임
 * 토큰 주입이라 kit 타입이 소실되므로, `defineTossPaymentsConfig`로 고정한 config의
 * `typeof`에서 kit 타입을 복원한다. 배선 누락 플로우 접근은 주입부에서도 컴파일 에러.
 *
 * ```ts
 * export const tossConfig = defineTossPaymentsConfig({ ... });
 * export type AppToss = TossPaymentsFor<typeof tossConfig>;
 * ```
 */
export type TossPaymentsFor<C extends AnyTossPaymentsConfig> =
  C extends TossPaymentsApiConfig<infer E>
    ? TossPaymentsKit<E, 'api', C>
    : C extends TossPaymentsWidgetConfig<infer E>
      ? TossPaymentsKit<E, 'widget', C>
      : never;

/** forRootAsync 옵션 (설계 §4.2) — 스토어(PrismaService 등)를 DI 의존성으로 조립하는 경로. */
export interface TossPaymentsModuleAsyncOptions<C extends AnyTossPaymentsConfig> {
  readonly imports?: DynamicModule['imports'];
  /** useFactory 파라미터로 주입할 프로바이더 토큰. 예: [PrismaService, ConfigService] */
  readonly inject?: readonly InjectionToken[];
  /**
   * config 팩토리. **반환값은 반드시 `defineTossPaymentsConfig(...)`로 감싸라**(설계 §4.3 강권) —
   * 팩토리 반환 경로에서는 const 추론이 풀려 조건부 프로퍼티(배선) 판정이 무너질 수 있다.
   */
  readonly useFactory: (...deps: readonly any[]) => C | Promise<C>;
  /** 기본 true — 결제 kit은 전역 싱글턴이 자연스러운 단위다(모듈마다 재조립 금지). */
  readonly global?: boolean;
}

/** `forRoot`/`register`에서 공유하는 Nest module 옵션. */
export interface TossPaymentsModuleOptions {
  /** 기본 true. 모듈 경계를 엄격히 유지하려면 false를 명시한다. */
  readonly global?: boolean;
}

/**
 * 이름 있는 kit의 동기 조립 옵션.
 *
 * API `sk`와 결제위젯 `gsk`처럼 서로 다른 키 쌍을 동시에 써야 할 때 사용한다.
 * `name`은 한 Nest application에서 유일해야 하며, 주입부의
 * `@InjectTossPayments(name)`와 정확히 일치해야 한다.
 */
export interface TossPaymentsModuleRegisterOptions<C extends AnyTossPaymentsConfig>
  extends TossPaymentsModuleOptions {
  readonly name: TossPaymentsKitName;
  readonly config: C;
}

/** 이름 있는 kit의 비동기 조립 옵션. */
export interface TossPaymentsModuleRegisterAsyncOptions<C extends AnyTossPaymentsConfig>
  extends TossPaymentsModuleAsyncOptions<C> {
  readonly name: TossPaymentsKitName;
}

/**
 * 합집합 config 1인자 시그니처 — 파사드의 impl 시그니처와 동일한 형태다.
 *
 * `createTossPayments`는 오버로드 2종(API/위젯 키)이라 합집합 인자로 직접 호출할 수
 * 없다(TS 오버로드 해석 한계). 두 오버로드의 런타임 경로는 동일하므로(키 종류 판별은
 * createTossClient가 접두사로 소유 — facade.ts 주석 참조) 합집합 시그니처로 1회
 * 재타이핑한다. `as any`가 아닌 함수 타입 단언이며, 인자 타입 안전성은
 * forRoot/forRootAsync의 `C extends AnyTossPaymentsConfig` 제약이 이미 보장한다.
 * 반환 타입은 무배선 최소 kit(client+events)로 둔다 — 정밀 타입은 주입부의
 * {@link TossPaymentsFor}가 복원한다(런타임 값은 배선분 전부 보유).
 */
const buildKit = createTossPayments as unknown as (
  config: AnyTossPaymentsConfig,
) => TossPaymentsKit<Env, KeyKind, Record<never, never>>;

@Module({})
export class TossPaymentsModule {
  /**
   * 동기 조립 — `{ provide: TOSS_PAYMENTS, useValue: createTossPayments(config) }`.
   * config는 코어 `defineTossPaymentsConfig` 산출물을 권장(간접 전달 시 타입 보존).
   */
  static forRoot<E extends Env, const C extends AnyTossPaymentsConfig>(
    config: C,
    options?: TossPaymentsModuleOptions, // 기본 true
  ): DynamicModule {
    return createStaticModule(TOSS_PAYMENTS, config, options);
  }

  /** 비동기 조립 — 스토어를 Nest 프로바이더(inject)로 받아 useFactory에서 config를 만든다. */
  static forRootAsync<C extends AnyTossPaymentsConfig>(
    options: TossPaymentsModuleAsyncOptions<C>,
  ): DynamicModule {
    return createAsyncModule(TOSS_PAYMENTS, options);
  }

  /**
   * 이름 있는 동기 조립. `forRoot`는 기존 단일 kit(`TOSS_PAYMENTS`) 호환 API로
   * 유지하고, 여러 키 쌍은 이 메서드로 분리한다.
   */
  static register<const C extends AnyTossPaymentsConfig>(
    options: TossPaymentsModuleRegisterOptions<C>,
  ): DynamicModule {
    return createStaticModule(getTossPaymentsToken(options.name), options.config, options);
  }

  /** 이름 있는 비동기 조립. provider별 config/store를 독립적으로 주입한다. */
  static registerAsync<C extends AnyTossPaymentsConfig>(
    options: TossPaymentsModuleRegisterAsyncOptions<C>,
  ): DynamicModule {
    return createAsyncModule(getTossPaymentsToken(options.name), options);
  }
}

function createStaticModule<C extends AnyTossPaymentsConfig>(
  token: InjectionToken,
  config: C,
  options?: TossPaymentsModuleOptions,
): DynamicModule {
  return {
    module: TossPaymentsModule,
    global: options?.global ?? true,
    providers: [{ provide: token, useValue: buildKit(config) }],
    exports: [token],
  };
}

function createAsyncModule<C extends AnyTossPaymentsConfig>(
  token: InjectionToken,
  options: TossPaymentsModuleAsyncOptions<C>,
): DynamicModule {
  return {
    module: TossPaymentsModule,
    global: options.global ?? true,
    // exactOptionalPropertyTypes — imports 미지정 시 프로퍼티 자체를 만들지 않는다
    ...(options.imports !== undefined ? { imports: options.imports } : {}),
    providers: [
      {
        provide: token,
        inject: options.inject === undefined ? [] : [...options.inject],
        useFactory: async (...deps: readonly unknown[]) =>
          buildKit(await options.useFactory(...deps)),
      },
    ],
    exports: [token],
  };
}
