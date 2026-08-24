import { Inject, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { OperationsJobsError } from '../core/errors';
import type { AnyOperationsJob } from '../core/job';
import { createJobRegistry } from '../core/registry';
import type { JobRegistry } from '../core/registry';
import { OPERATIONS_JOB_METADATA } from './decorator';
import { JOB_REGISTRY } from './inject';

/**
 * 코어와 Nest 사이의 생명주기 이음매.
 *
 * `createJobRunner()`는 프로바이더 생성 시점에 registry를 받는데 수집은 그보다 늦은
 * `OnApplicationBootstrap`에서 끝난다. 그래서 모듈이 **빈 레지스트리 하나**를 만들어
 * 러너에 그대로 넘기고, 부트스트랩 훅이 채운다. 수집 완료 전의 `get`/`list`는
 * `ERR_JOB_REGISTRY_NOT_READY`를 던진다 — 다른 프로바이더의 `onModuleInit`에서
 * `execute()`를 부르는 배선 오류가 "그런 잡 없음"으로 오진되지 않게 한다.
 *
 * @internal
 */
export interface DeferredJobRegistry extends JobRegistry {
  markReady(): void;
}

/** @internal */
export function createDeferredJobRegistry(): DeferredJobRegistry {
  const inner = createJobRegistry();
  let ready = false;
  const assertReady = (): void => {
    if (ready) return;
    throw new OperationsJobsError(
      'ERR_JOB_REGISTRY_NOT_READY',
      'operations jobs are still being collected: run jobs after onApplicationBootstrap, not from onModuleInit',
    );
  };
  return {
    register: (job) => {
      inner.register(job);
    },
    get: (key) => {
      assertReady();
      return inner.get(key);
    },
    list: () => {
      assertReady();
      return inner.list();
    },
    markReady: () => {
      ready = true;
    },
  };
}

function className(target: unknown): string {
  const name = (target as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.length > 0 ? name : 'unknown class';
}

/**
 * Collects `@OperationsJobDefinition()` providers at bootstrap.
 *
 * @internal — bound by `OperationsJobsModule`; not part of the public surface.
 */
@Injectable()
export class OperationsJobsRegistrar implements OnApplicationBootstrap {
  constructor(
    @Inject(DiscoveryService) private readonly discovery: DiscoveryService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JOB_REGISTRY) private readonly registry: DeferredJobRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const seenInstances = new Set<unknown>();
    const claimedBy = new Map<string, string>();

    for (const wrapper of this.discovery.getProviders()) {
      const metatype = wrapper.metatype;
      if (metatype === null || metatype === undefined) continue;
      if (this.reflector.get<boolean>(OPERATIONS_JOB_METADATA, metatype) !== true) continue;

      const name = className(metatype);
      // 스코프 검사가 인스턴스 검사보다 앞선다 — 스코프드 프로바이더는 부팅 시점에
      // 인스턴스가 없으므로, 순서가 반대면 "등록했는데 404"로 조용히 넘어간다.
      if (!wrapper.isDependencyTreeStatic()) {
        throw new OperationsJobsError(
          'ERR_JOB_INVALID',
          `operations job ${name} is request- or transient-scoped: a scoped provider has no bootstrap instance to register. Give it the default @Injectable() scope.`,
        );
      }
      const instance = wrapper.instance as unknown;
      if (instance === null || instance === undefined) continue;
      // 같은 인스턴스가 여러 모듈 래퍼로 나타나면 1회만 등록한다.
      if (seenInstances.has(instance)) continue;
      seenInstances.add(instance);

      const job = instance as AnyOperationsJob;
      if (typeof job.key === 'string') {
        const previous = claimedBy.get(job.key);
        if (previous !== undefined) {
          throw new OperationsJobsError(
            'ERR_JOB_DUPLICATE_KEY',
            `duplicate operations job key "${job.key}": claimed by ${previous} and ${name}`,
            { jobKey: job.key },
          );
        }
      }
      this.registry.register(job);
      claimedBy.set(job.key, name);
    }

    this.registry.markReady();
  }
}
