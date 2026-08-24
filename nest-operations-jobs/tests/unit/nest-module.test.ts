/**
 * §3.9 Nest 층 — 모듈 조립·디스커버리 수집·생명주기 순서.
 * emitDecoratorMetadata: false 환경(esbuild/vitest)에서 돈다는 사실 자체가 검증 대상이다:
 * 모든 주입이 명시적 @Inject(토큰)으로만 해석되어야 한다.
 */
import 'reflect-metadata';
import { Inject, Injectable, Module, Scope } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { isOperationsJobsError } from '../../src/core/errors';
import type { AnyOperationsJob, JobSummary } from '../../src/core/job';
import type { JobRegistryView } from '../../src/core/registry';
import type { JobRunner } from '../../src/core/runner';
import type { JobRunStore } from '../../src/core/store';
import {
  InjectJobRegistry,
  InjectJobRunner,
  InjectJobRunStore,
  JOB_CLOCK,
  JOB_REGISTRY,
  JOB_RUN_STORE,
  JOB_RUNNER,
  JOB_TRIGGER_AUTHENTICATOR,
  OperationsJobDefinition,
  OperationsJobsModule,
} from '../../src/index';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { silentJobLogger } from '../../src/core/logger';

const SECRET = 's'.repeat(32);

@Injectable()
@OperationsJobDefinition()
class PurgeDraftsJob implements AnyOperationsJob {
  readonly key = 'drafts.purge-expired';
  readonly description = 'purge expired drafts';
  readonly schedule = { cron: '0 4 * * *', timeZone: 'Asia/Seoul' };
  ran = 0;
  async run(): Promise<JobSummary> {
    this.ran += 1;
    return { purged: 2 };
  }
}

@Injectable()
@OperationsJobDefinition()
class SweepJob implements AnyOperationsJob {
  readonly key = 'platform.sweep';
  readonly description = 'sweep stale rows';
  async run(): Promise<JobSummary> {
    return { ok: true };
  }
}

@Injectable()
class ConsumerService {
  constructor(
    @InjectJobRunner() readonly runner: JobRunner,
    @InjectJobRegistry() readonly registry: JobRegistryView,
    @InjectJobRunStore() readonly store: JobRunStore,
  ) {}
}

function moduleOptions(store: JobRunStore) {
  return {
    store,
    auth: { secret: SECRET },
    logger: silentJobLogger(),
    clock: fakeJobClock(),
  };
}

describe('§3.9.2 모듈 조립과 DI 배선', () => {
  it('forRoot — 모듈이 부팅하고 잡이 수집되며 러너로 실행된다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Module({
      imports: [OperationsJobsModule.forRoot(moduleOptions(store))],
      providers: [PurgeDraftsJob, SweepJob, ConsumerService],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const consumer = app.get(ConsumerService);
    expect(consumer.registry.list().map((job) => job.key)).toEqual([
      'drafts.purge-expired',
      'platform.sweep',
    ]);
    expect(consumer.store).toBe(store);
    expect(app.get<JobRunner>(JOB_RUNNER)).toBe(consumer.runner);
    expect(app.get(JOB_CLOCK)).toBeDefined();
    expect(typeof app.get(JOB_TRIGGER_AUTHENTICATOR)).toBe('function');
    expect(app.get(JOB_RUN_STORE)).toBe(store);
    expect(app.get(JOB_REGISTRY)).toBe(consumer.registry);

    const result = await consumer.runner.execute('drafts.purge-expired', undefined, {
      source: 'ADMIN',
      triggeredBy: 'test',
    });
    expect(result.status).toBe('SUCCEEDED');
    expect(app.get(PurgeDraftsJob).ran).toBe(1);
    expect(store.runs()).toHaveLength(1);

    await app.close();
  });

  it('forRootAsync — 팩토리 의존성을 주입받아 같은 배선을 만든다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Injectable()
    class ConfigLike {
      readonly secret = SECRET;
    }

    @Module({
      providers: [ConfigLike],
      exports: [ConfigLike],
    })
    class ConfigModule {}

    @Module({
      imports: [
        OperationsJobsModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigLike],
          useFactory: (config: ConfigLike) => ({
            store,
            auth: { secret: config.secret },
            logger: silentJobLogger(),
            clock: fakeJobClock(),
          }),
        }),
      ],
      providers: [SweepJob],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const runner = app.get<JobRunner>(JOB_RUNNER);
    expect((await runner.execute('platform.sweep', undefined, { source: 'CLI' })).status).toBe(
      'SUCCEEDED',
    );
    await app.close();
  });

  it('forRoot() 한 번으로 만든 모듈에서 앱을 두 번 부팅해도 각자 자기 레지스트리를 가진다', async () => {
    // e2e 스위트의 표준 패턴이자 서버리스 warm re-init·HMR의 모습이다. forRoot가
    // 인스턴스를 들고 있으면 두 번째 부팅이 ERR_JOB_DUPLICATE_KEY로 죽으면서
    // 잘못 없는 잡 클래스를 지목한다.
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Injectable()
    @OperationsJobDefinition()
    class ReusableJob implements AnyOperationsJob {
      readonly key = 'demo.reuse';
      readonly description = 'reusable';
      async run(): Promise<JobSummary> {
        return { ok: true };
      }
    }

    @Module({
      imports: [OperationsJobsModule.forRoot(moduleOptions(store))],
      providers: [ReusableJob],
    })
    class HostModule {}

    const boot = async (): Promise<{ close: () => Promise<void>; runner: JobRunner; registry: JobRegistryView }> => {
      const moduleRef = await Test.createTestingModule({ imports: [HostModule] }).compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      return {
        close: () => app.close(),
        runner: app.get<JobRunner>(JOB_RUNNER),
        registry: app.get<JobRegistryView>(JOB_REGISTRY),
      };
    };

    const first = await boot();
    expect((await first.runner.execute('demo.reuse', undefined, { source: 'CLI' })).status).toBe(
      'SUCCEEDED',
    );
    await first.close();

    const second = await boot();
    expect(second.registry).not.toBe(first.registry);
    expect(second.runner).not.toBe(first.runner);
    expect(second.registry.list().map((registered) => registered.key)).toEqual(['demo.reuse']);
    expect((await second.runner.execute('demo.reuse', undefined, { source: 'CLI' })).status).toBe(
      'SUCCEEDED',
    );
    await second.close();
  });

  it('§4-9 인증 수단이 하나도 없으면 forRoot 호출 자체가 죽는다', () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    expect(() => OperationsJobsModule.forRoot({ store, auth: {} })).toThrowError(
      /shared secret or a token verifier/u,
    );
  });

  it('forRootAsync에서도 auth 검증은 팩토리 실행 직후 즉시 수행된다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Module({
      imports: [
        OperationsJobsModule.forRootAsync({
          useFactory: () => ({ store, auth: {}, logger: silentJobLogger() }),
        }),
      ],
    })
    class AppModule {}

    await expect(Test.createTestingModule({ imports: [AppModule] }).compile()).rejects.toThrowError(
      /shared secret or a token verifier/u,
    );
  });
});

describe('§3.9.3 수집 규칙과 생명주기', () => {
  it('중복 키를 주장하는 두 인스턴스는 부팅을 실패시키고 메시지가 두 클래스를 모두 싣는다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Injectable()
    @OperationsJobDefinition()
    class FirstClaimant implements AnyOperationsJob {
      readonly key = 'dup.key';
      readonly description = 'first';
      async run(): Promise<JobSummary> {
        return {};
      }
    }

    @Injectable()
    @OperationsJobDefinition()
    class SecondClaimant implements AnyOperationsJob {
      readonly key = 'dup.key';
      readonly description = 'second';
      async run(): Promise<JobSummary> {
        return {};
      }
    }

    @Module({
      imports: [OperationsJobsModule.forRoot(moduleOptions(store))],
      providers: [FirstClaimant, SecondClaimant],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await expect(app.init()).rejects.toThrowError(/FirstClaimant and SecondClaimant/u);
    await app.close().catch(() => undefined);
  });

  it('§4-25 수집 전 execute는 ERR_JOB_REGISTRY_NOT_READY로 원인을 말한다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    let captured: unknown;

    @Injectable()
    class EagerService implements OnModuleInit {
      constructor(@Inject(JOB_RUNNER) private readonly runner: JobRunner) {}
      async onModuleInit(): Promise<void> {
        try {
          await this.runner.execute('platform.sweep', undefined, { source: 'ADMIN' });
        } catch (error) {
          captured = error;
        }
      }
    }

    @Module({
      imports: [OperationsJobsModule.forRoot(moduleOptions(store))],
      providers: [SweepJob, EagerService],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    expect(isOperationsJobsError(captured)).toBe(true);
    expect((captured as { code: string }).code).toBe('ERR_JOB_REGISTRY_NOT_READY');
    expect((captured as Error).message).toMatch(/onApplicationBootstrap/u);

    // 부트스트랩 이후에는 같은 호출이 정상 실행된다.
    const runner = app.get<JobRunner>(JOB_RUNNER);
    expect((await runner.execute('platform.sweep', undefined, { source: 'ADMIN' })).status).toBe(
      'SUCCEEDED',
    );
    await app.close();
  });

  it('request-scoped 잡 프로바이더는 부팅 실패이고 메시지가 해결책을 말한다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Injectable({ scope: Scope.REQUEST })
    @OperationsJobDefinition()
    class ScopedJob implements AnyOperationsJob {
      readonly key = 'scoped.job';
      readonly description = 'scoped';
      async run(): Promise<JobSummary> {
        return {};
      }
    }

    @Module({
      imports: [OperationsJobsModule.forRoot(moduleOptions(store))],
      providers: [ScopedJob],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await expect(app.init()).rejects.toThrowError(/ScopedJob is request- or transient-scoped/u);
    await app.close().catch(() => undefined);
  });
});
