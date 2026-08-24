/**
 * §3.4 러너 파이프라인 — 결말 5종 전수와 기록 불일치 2종.
 * 시계·저장소·로거가 전부 주입이므로 모든 단언이 결정적이다.
 */
import { describe, expect, it } from 'vitest';

import { isOperationsJobsError } from '../../src/core/errors';
import type { AnyOperationsJob, JobSummary, OperationsJobContext } from '../../src/core/job';
import { assertJobSucceeded, createJobRunner } from '../../src/core/runner';
import { createJobRegistry } from '../../src/core/registry';
import type { JobRunStore } from '../../src/core/store';
import { silentJobLogger } from '../../src/core/logger';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { deferred, harness, TRIGGER } from './helpers';

function job(
  key: string,
  run: (input: never, context: OperationsJobContext) => Promise<JobSummary | void>,
  extra: Partial<AnyOperationsJob> = {},
): AnyOperationsJob {
  return { key, description: `test job ${key}`, run, ...extra } as AnyOperationsJob;
}

describe('§3.4 결말 5종', () => {
  it('SUCCEEDED — summary 왕복, durationMs가 주입 시계 기준, complete 1회, recorded settled', async () => {
    const { runner, store, memory, clock } = harness([
      job('test.ok', async () => {
        clock.advance(0);
        return { processed: 3 };
      }),
    ]);

    const result = await runner.execute('test.ok', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('settled');
    if (result.status !== 'SUCCEEDED') throw new Error('unreachable');
    expect(result.summary).toEqual({ processed: 3 });
    expect(store.calls.completes).toHaveLength(1);
    expect(result.durationMs).toBe(0);
    const row = memory.runOf(result.runId);
    expect(row?.status).toBe('SUCCEEDED');
    expect(row?.summary).toEqual({ processed: 3 });
    assertJobSucceeded(result);
  });

  it('FAILED (본문 throw) — 에러 텍스트가 errorTextLimit으로 잘리고 코드는 ERR_JOB_FAILED', async () => {
    const { runner, memory } = harness(
      [
        job('test.boom', async () => {
          throw new Error('x'.repeat(4_001));
        }),
      ],
      { errorTextLimit: 4_000 },
    );

    const result = await runner.execute('test.boom', undefined, TRIGGER);

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_FAILED');
    expect(isOperationsJobsError(result.error)).toBe(true);
    expect(memory.runOf(result.runId)?.error).toHaveLength(4_000);
  });

  it('§0.3-① 임의 프레임워크 예외를 던지는 잡도 반드시 마감된다 (RUNNING으로 남지 않는다)', async () => {
    class FrameworkException extends Error {}
    const { runner, memory } = harness([
      job('test.framework', async () => {
        throw new FrameworkException('internal server error');
      }),
    ]);

    const result = await runner.execute('test.framework', undefined, TRIGGER);

    expect(result.status).toBe('FAILED');
    expect(memory.runOf(result.runId)?.status).toBe('FAILED');
    expect(memory.runs().some((row) => row.status === 'RUNNING')).toBe(false);
  });

  it('FAILED (ok:false) — summary는 보존하고 상태만 실패', async () => {
    const { runner, memory } = harness([job('test.partial', async () => ({ ok: false, failed: 2 }))]);

    const result = await runner.execute('test.partial', undefined, TRIGGER);

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.summary).toEqual({ ok: false, failed: 2 });
    expect(memory.runOf(result.runId)?.summary).toEqual({ ok: false, failed: 2 });
  });

  it('§4-18 ok는 === false 엄격 비교 — 0·빈문자열·undefined·null은 성공', async () => {
    for (const value of [0, '', undefined, null]) {
      const { runner } = harness([job('test.okish', async () => ({ ok: value }))]);
      const result = await runner.execute('test.okish', undefined, TRIGGER);
      expect(result.status).toBe('SUCCEEDED');
    }
    const { runner } = harness([job('test.okish', async () => ({ ok: false }))]);
    expect((await runner.execute('test.okish', undefined, TRIGGER)).status).toBe('FAILED');
  });

  it('§4-17 잡이 비객체를 반환하면 summary는 undefined로 접힌다', async () => {
    const { runner, memory } = harness([job('test.array', async () => [1, 2, 3] as never)]);
    const result = await runner.execute('test.array', undefined, TRIGGER);
    expect(result.status).toBe('SUCCEEDED');
    if (result.status !== 'SUCCEEDED') throw new Error('unreachable');
    expect(result.summary).toBeUndefined();
    expect(memory.runOf(result.runId)?.summary).toBeUndefined();
  });

  it('TIMED_OUT — 시계 advance로 정확히 시한에 발화하고 abort reason이 ERR_JOB_TIMEOUT', async () => {
    let observed: AbortSignal | undefined;
    const gate = deferred<JobSummary>();
    const { runner, clock, memory } = harness([
      job(
        'test.slow',
        async (_input, context) => {
          observed = context.signal;
          return gate.promise;
        },
        { timeoutMs: 1_000 },
      ),
    ]);

    const pending = runner.execute('test.slow', undefined, TRIGGER);
    // advance(0)가 먼저다 — 러너가 claim을 마치고 타이머를 세운 뒤라야 시한이 t=0 기준이 된다.
    await clock.advance(0);
    await clock.advance(999);
    expect(observed?.aborted).toBe(false);
    await clock.advance(1);
    const result = await pending;

    expect(result.status).toBe('TIMED_OUT');
    if (result.status !== 'TIMED_OUT') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_TIMEOUT');
    expect(observed?.aborted).toBe(true);
    expect((observed?.reason as { code?: string }).code).toBe('ERR_JOB_TIMEOUT');
    expect(result.durationMs).toBe(1_000);
    expect(memory.runOf(result.runId)?.status).toBe('TIMED_OUT');
    gate.resolve({});
  });

  it('§4-23 분류는 signal.reason으로만 — 잡이 자기 AbortError로 reject해도 TIMED_OUT', async () => {
    const { runner, clock } = harness([
      job(
        'test.selfabort',
        async (_input, context) =>
          new Promise<JobSummary>((_resolve, reject) => {
            context.signal.addEventListener('abort', () => {
              const error = new Error('The operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
        { timeoutMs: 500 },
      ),
    ]);

    const pending = runner.execute('test.selfabort', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(500);
    const result = await pending;

    expect(result.status).toBe('TIMED_OUT');
  });

  it('§4-23 대조군 — 시그널과 무관한 AbortError는 FAILED', async () => {
    const { runner } = harness([
      job('test.unrelated', async () => {
        const error = new Error('unrelated abort');
        error.name = 'AbortError';
        throw error;
      }),
    ]);

    const result = await runner.execute('test.unrelated', undefined, TRIGGER);
    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_FAILED');
  });

  it('SKIPPED — 본문 실행 0회, recordSkipped 1회, 경쟁 overlapKey를 실은 경고 1건', async () => {
    let started = 0;
    const gate = deferred<JobSummary>();
    const { runner, store, logger, clock } = harness([
      job('test.overlap', async () => {
        started += 1;
        return gate.promise;
      }),
    ]);

    const first = runner.execute('test.overlap', undefined, TRIGGER);
    await clock.advance(0);
    const second = await runner.execute('test.overlap', undefined, TRIGGER);

    expect(second.status).toBe('SKIPPED');
    if (second.status !== 'SKIPPED') throw new Error('unreachable');
    expect(second.reason).toBe('overlap');
    expect(second.recorded).toBe('settled');
    expect(second.durationMs).toBe(0);
    expect(started).toBe(1);
    expect(store.calls.skips).toHaveLength(1);

    const warnings = logger.entries.filter(
      (entry) => entry.level === 'warn' && entry.message.includes('skipped'),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.fields.overlapKey).toBe('test.overlap');

    gate.resolve({});
    await first;
  });

  it("overlapPolicy 'allow' — 두 실행이 서로 다른 overlapKey로 동시에 claim한다", async () => {
    let started = 0;
    const gate = deferred<JobSummary>();
    let counter = 0;
    const { runner, store, clock } = harness(
      [
        job(
          'test.allow',
          async () => {
            started += 1;
            return gate.promise;
          },
          { overlapPolicy: 'allow' },
        ),
      ],
      {
        newId: () => {
          counter += 1;
          return `id-${counter}`;
        },
      },
    );

    const first = runner.execute('test.allow', undefined, TRIGGER);
    await clock.advance(0);
    const second = runner.execute('test.allow', undefined, TRIGGER);
    await clock.advance(0);

    expect(started).toBe(2);
    expect(store.calls.claims.map((request) => request.overlapKey)).toEqual([
      'test.allow#id-1',
      'test.allow#id-2',
    ]);

    gate.resolve({});
    expect((await first).status).toBe('SUCCEEDED');
    expect((await second).status).toBe('SUCCEEDED');
  });
});

describe('§4-21 기록 불일치 2종 — status는 본문의 결말, recorded는 기록의 결말', () => {
  function storeWithComplete(result: 'false' | 'throw'): { store: JobRunStore; inner: ReturnType<typeof memoryJobRunStore> } {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      claim: (request) => inner.claim(request),
      heartbeat: (request) => inner.heartbeat(request),
      recordSkipped: (request) => inner.recordSkipped(request),
      reapStale: (request) => inner.reapStale(request),
      complete: async (request) => {
        if (result === 'throw') throw new Error('store unreachable');
        // reaper가 먼저 마감한 상황을 그대로 재현한다.
        await inner.reapStale({ staleAfterMs: 0, jobKey: request.runId ? undefined : undefined });
        return false;
      },
    };
    return { store, inner };
  }

  it("reaper 선점 — status는 SUCCEEDED, recorded는 'superseded', 경고 1건", async () => {
    const { store } = storeWithComplete('false');
    const { runner, logger } = harness([job('test.superseded', async () => ({ done: true }))], {
      store,
    });

    const result = await runner.execute('test.superseded', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('superseded');
    expect(
      logger.entries.filter((entry) => entry.level === 'warn' && entry.message.includes('already settled')),
    ).toHaveLength(1);
  });

  it("complete 실패 — recorded는 'unrecorded', 행은 RUNNING으로 남고 에러 로그 1건", async () => {
    const { store, inner } = storeWithComplete('throw');
    const { runner, logger } = harness([job('test.unrecorded', async () => ({ done: true }))], {
      store,
    });

    const result = await runner.execute('test.unrecorded', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('unrecorded');
    expect(inner.runOf(result.runId)?.status).toBe('RUNNING');
    expect(
      logger.entries.filter((entry) => entry.level === 'error' && entry.message.includes('finalize failed')),
    ).toHaveLength(1);
  });
});

describe('§3.4.1 throw 경계 — 기록이 생기지 않는 경우에만 던진다', () => {
  it('알 수 없는 키 → ERR_JOB_UNKNOWN, claim 0회', async () => {
    const { runner, store } = harness([]);
    await expect(runner.execute('test.nope', undefined, TRIGGER)).rejects.toMatchObject({
      code: 'ERR_JOB_UNKNOWN',
    });
    expect(store.calls.claims).toHaveLength(0);
  });

  it('claim 단계 저장소 장애 → ERR_JOB_STORE', async () => {
    const store: JobRunStore = {
      claim: async () => {
        throw new Error('connection reset');
      },
      heartbeat: async () => true,
      complete: async () => true,
      recordSkipped: async () => ({ runId: 'x' }),
      reapStale: async () => 0,
    };
    const { runner } = harness([job('test.store', async () => ({}))], { store });

    await expect(runner.execute('test.store', undefined, TRIGGER)).rejects.toMatchObject({
      code: 'ERR_JOB_STORE',
    });
  });

  it('assertJobSucceeded는 SKIPPED와 실패를 모두 던진다', async () => {
    const registry = createJobRegistry([job('test.assert', async () => ({ ok: false }))]);
    const clock = fakeJobClock();
    const runner = createJobRunner({
      registry,
      store: memoryJobRunStore({ clock }),
      logger: silentJobLogger(),
      clock,
    });
    const result = await runner.execute('test.assert', undefined, TRIGGER);
    expect(() => {
      assertJobSucceeded(result);
    }).toThrowError();
  });
});
