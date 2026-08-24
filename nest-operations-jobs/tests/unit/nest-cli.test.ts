/** §3.9.5 CLI — exit code 계약과 컨텍스트 소유권. */
import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AnyOperationsJob, JobSummary } from '../../src/core/job';
import { silentJobLogger } from '../../src/core/logger';
import {
  OPERATIONS_JOB_CLI_EXIT,
  OperationsJobDefinition,
  OperationsJobsModule,
  runOperationsJobCli,
} from '../../src/index';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import type { MemoryJobRunStore } from '../../src/testing/memory-store';

const SECRET = 'c'.repeat(32);

@Injectable()
@OperationsJobDefinition()
class OkJob implements AnyOperationsJob {
  readonly key = 'cli.ok';
  readonly description = 'ok';
  async run(): Promise<JobSummary> {
    return { ok: true };
  }
}

@Injectable()
@OperationsJobDefinition()
class BoomJob implements AnyOperationsJob {
  readonly key = 'cli.boom';
  readonly description = 'boom';
  async run(): Promise<JobSummary> {
    throw new Error('cli failure');
  }
}

async function makeContext(store: MemoryJobRunStore): Promise<INestApplicationContext> {
  @Module({
    imports: [
      OperationsJobsModule.forRoot({
        store,
        auth: { secret: SECRET },
        logger: silentJobLogger(),
        clock: fakeJobClock(),
      }),
    ],
    providers: [OkJob, BoomJob],
  })
  class AppModule {}

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  return moduleRef.createNestApplication();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('§3.9.5 exit code 계약', () => {
  it('잡 키 누락/빈 문자열 → 2, 앱을 부팅하지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const factory = vi.fn(async () => {
      throw new Error('must not boot');
    });

    for (const jobKey of [undefined, '', '   ']) {
      expect(
        await runOperationsJobCli({ context: factory as never, jobKey, usage: 'Usage: run <jobKey>' }),
      ).toBe(OPERATIONS_JOB_CLI_EXIT.USAGE);
    }
    expect(factory).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Usage: run <jobKey>');
  });

  it('SUCCEEDED → 0, 팩토리로 만든 컨텍스트는 CLI가 닫는다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const context = await makeContext(store);
    await context.init();
    const close = vi.spyOn(context, 'close');

    const code = await runOperationsJobCli({ context: async () => context, jobKey: 'cli.ok' });

    expect(code).toBe(OPERATIONS_JOB_CLI_EXIT.OK);
    expect(close).toHaveBeenCalledTimes(1);
    expect(store.runs()[0]?.trigger).toEqual({ source: 'CLI', triggeredBy: null });
  });

  it('SKIPPED → 0 (중복은 오류가 아니다)', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const context = await makeContext(store);
    await context.init();
    await store.claim({
      jobKey: 'cli.ok',
      overlapKey: 'cli.ok',
      trigger: { source: 'SCHEDULER' },
      input: null,
      startedAt: 1,
    });

    expect(await runOperationsJobCli({ context, jobKey: 'cli.ok' })).toBe(
      OPERATIONS_JOB_CLI_EXIT.OK,
    );
    await context.close();
  });

  it('FAILED → 1, 인스턴스를 넘기면 CLI가 닫지 않는다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const context = await makeContext(store);
    await context.init();
    const close = vi.spyOn(context, 'close');

    expect(await runOperationsJobCli({ context, jobKey: 'cli.boom' })).toBe(
      OPERATIONS_JOB_CLI_EXIT.FAILED,
    );
    expect(close).not.toHaveBeenCalled();
    await context.close();
  });

  it('러너가 던져도 → 1이고 CLI가 만든 컨텍스트는 반드시 닫힌다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const context = await makeContext(store);
    await context.init();
    const close = vi.spyOn(context, 'close');

    const code = await runOperationsJobCli({
      context: async () => context,
      jobKey: 'cli.missing',
    });

    expect(code).toBe(OPERATIONS_JOB_CLI_EXIT.FAILED);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('사용자 지정 trigger가 그대로 기록된다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const context = await makeContext(store);
    await context.init();

    await runOperationsJobCli({
      context,
      jobKey: 'cli.ok',
      trigger: { source: 'ADMIN', triggeredBy: 'ops-console' },
    });

    expect(store.runs()[0]?.trigger).toEqual({ source: 'ADMIN', triggeredBy: 'ops-console' });
    await context.close();
  });
});
