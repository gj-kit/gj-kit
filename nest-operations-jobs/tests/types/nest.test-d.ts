/** §5.2 Nest 표면 — 모듈 옵션 필수 필드, 값의 단일 출처, 토큰 타입. */
import { describe, expectTypeOf, it } from 'vitest';

import { OperationsJobsModule } from '../../src/index';
import type {
  JobRunner,
  JobRunStore,
  OperationsJobsError,
  OperationsJobsModuleAsyncOptions,
  OperationsJobsModuleOptions,
} from '../../src/index';
import type { createJobRunner } from '../../src/core';

declare const store: JobRunStore;
declare const maybeRevision: string | undefined;

type IndexModule = typeof import('../../src/index');
type CoreModule = typeof import('../../src/core');

describe('§2.1 값의 단일 출처', () => {
  it('`.` 배럴은 코어 런타임 값을 재수출하지 않는다', () => {
    expectTypeOf<'createJobRunner' extends keyof IndexModule ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'memoryJobRunStore' extends keyof IndexModule ? true : false>().toEqualTypeOf<false>();
    expectTypeOf<'createJobRegistry' extends keyof IndexModule ? true : false>().toEqualTypeOf<false>();
    // 반대로 코어에는 있다 — 대조군
    expectTypeOf<'createJobRunner' extends keyof CoreModule ? true : false>().toEqualTypeOf<true>();
    // 그러나 코어 타입은 `.`에서도 그대로 쓸 수 있다(타입만 재수출).
    expectTypeOf<JobRunner>().toHaveProperty('execute');
  });

  it('createJobRunner의 시그니처가 코어에서만 온다', () => {
    expectTypeOf<typeof createJobRunner>().parameters.toMatchTypeOf<[unknown]>();
  });

  it('§7-7 OperationsJobsError는 `.`에서 타입으로만 보인다 — 값으로 새면 산출 선언이 거짓말을 한다', () => {
    // 클래스를 값으로 재수출하면 dts 롤업이 `type`을 떨어뜨리고, 소비자의 ESM import가
    // 모듈 인스턴스화에서 죽는다. keyof는 값 export만 센다.
    expectTypeOf<
      'OperationsJobsError' extends keyof IndexModule ? true : false
    >().toEqualTypeOf<false>();
    // 대조군: 타입으로는 그대로 쓰인다.
    expectTypeOf<OperationsJobsError>().toHaveProperty('code');
    expectTypeOf<OperationsJobsError>().toMatchTypeOf<Error>();
  });
});

describe('§4-9 모듈 옵션', () => {
  it('auth 누락은 컴파일 에러다 — 인증 없는 트리거 표면은 배선 오류다', () => {
    // @ts-expect-error — auth는 required다
    const missing: OperationsJobsModuleOptions = { store };
    void missing;

    const wired: OperationsJobsModuleOptions = {
      store,
      auth: { secret: 'x'.repeat(32) },
      // §1-8 EOP — `T | undefined`를 그대로 넘길 수 있다
      serviceRevision: maybeRevision,
      trigger: { path: 'internal/jobs', triggeredByHeader: undefined },
    };
    void wired;
  });

  it('forRoot/forRootAsync는 DynamicModule을 돌려준다', () => {
    expectTypeOf(OperationsJobsModule.forRoot).parameter(0).toEqualTypeOf<OperationsJobsModuleOptions>();
    expectTypeOf(OperationsJobsModule.forRootAsync)
      .parameter(0)
      .toEqualTypeOf<OperationsJobsModuleAsyncOptions>();
    expectTypeOf(OperationsJobsModule.forRoot).returns.toHaveProperty('module');
  });

  it('reapScope는 닫힌 유니언이다', () => {
    const scoped: OperationsJobsModuleOptions = {
      store,
      auth: { secret: 'x'.repeat(32) },
      // @ts-expect-error — 'overlap-key' | 'all' | 'off'만 허용된다
      reapScope: 'sometimes',
    };
    void scoped;
  });
});
