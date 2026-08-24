/**
 * §3.9.3 디스커버리 수집의 세 규칙 — 인스턴스 동일성 dedupe를 직접 고정한다.
 * 실제 Nest 컨테이너로는 "같은 인스턴스가 두 래퍼로 나타나는" 배치를 만들기 어려워
 * DiscoveryService의 래퍼 계약만 흉내 낸 스텁으로 검사한다.
 */
import 'reflect-metadata';
import { Injectable } from '@nestjs/common';
import type { DiscoveryService, Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import type { AnyOperationsJob, JobSummary } from '../../src/core/job';
import { OPERATIONS_JOB_METADATA, OperationsJobDefinition } from '../../src/nest/decorator';
import {
  createDeferredJobRegistry,
  OperationsJobsRegistrar,
} from '../../src/nest/registry.provider';

interface StubWrapper {
  metatype: unknown;
  instance: unknown;
  isDependencyTreeStatic(): boolean;
}

function registrar(wrappers: StubWrapper[]): {
  run: () => void;
  registry: ReturnType<typeof createDeferredJobRegistry>;
} {
  const registry = createDeferredJobRegistry();
  const discovery = { getProviders: () => wrappers } as unknown as DiscoveryService;
  const reflector = {
    get: (key: unknown, target: unknown) =>
      key === OPERATIONS_JOB_METADATA
        ? (Reflect.getMetadata(OPERATIONS_JOB_METADATA, target as object) as boolean)
        : undefined,
  } as unknown as Reflector;
  const instance = new OperationsJobsRegistrar(discovery, reflector, registry);
  return {
    run: () => {
      instance.onApplicationBootstrap();
    },
    registry,
  };
}

@Injectable()
@OperationsJobDefinition()
class SharedJob implements AnyOperationsJob {
  readonly key = 'shared.job';
  readonly description = 'shared';
  async run(): Promise<JobSummary> {
    return {};
  }
}

function wrap(metatype: unknown, instance: unknown, isStatic = true): StubWrapper {
  return { metatype, instance, isDependencyTreeStatic: () => isStatic };
}

describe('§3.9.3 수집 규칙', () => {
  it('같은 인스턴스가 여러 모듈 래퍼로 나타나면 1회만 등록한다', () => {
    const shared = new SharedJob();
    const { run, registry } = registrar([wrap(SharedJob, shared), wrap(SharedJob, shared)]);

    expect(run).not.toThrow();
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('shared.job')).toBe(shared);
  });

  it('서로 다른 인스턴스가 같은 키를 주장하면 ERR_JOB_DUPLICATE_KEY', () => {
    const { run } = registrar([wrap(SharedJob, new SharedJob()), wrap(SharedJob, new SharedJob())]);
    expect(run).toThrowError(/duplicate operations job key "shared.job"/u);
  });

  it('메타데이터 없는 프로바이더와 metatype 없는 바인딩은 건너뛴다', () => {
    class PlainService {}
    const { run, registry } = registrar([
      wrap(PlainService, new PlainService()),
      wrap(null, { key: 'x.y' }),
      wrap(SharedJob, new SharedJob()),
    ]);
    run();
    expect(registry.list().map((job) => job.key)).toEqual(['shared.job']);
  });

  it('스코프드 프로바이더는 인스턴스가 없어도 조용히 건너뛰지 않고 부팅을 실패시킨다', () => {
    const { run } = registrar([wrap(SharedJob, null, false)]);
    expect(run).toThrowError(/SharedJob is request- or transient-scoped/u);
  });

  it('수집 전 뷰는 읽기를 거부하고, markReady 이후에 열린다', () => {
    const registry = createDeferredJobRegistry();
    expect(() => registry.get('a.b')).toThrowError(/still being collected/u);
    expect(() => registry.list()).toThrowError(/still being collected/u);
    registry.markReady();
    expect(registry.list()).toEqual([]);
  });
});
