/**
 * §3.4.1-5 · §3.4.2 하트비트/타임아웃/abort 매트릭스.
 * 저장소가 응답하지 않는 구간까지 포함한다 — 완화책 2(하트비트 false → 즉시 abort)가
 * 가장 필요한 순간에 꺼져 있지 않다는 것이 이 파일의 핵심 단언이다.
 */
import { describe, expect, it } from 'vitest';

import type { AnyOperationsJob, JobSummary, OperationsJobContext } from '../../src/core/job';
import type { JobRunStore } from '../../src/core/store';
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

describe('하트비트 주기', () => {
  it('95초 advance → 정확히 3회(30·60·90초), 마감 후 추가 advance → 0회', async () => {
    const gate = deferred<JobSummary>();
    const { runner, store, clock } = harness([
      job('test.beat', async () => gate.promise, { timeoutMs: 600_000 }),
    ]);

    const pending = runner.execute('test.beat', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(95_000);

    expect(store.calls.heartbeats).toHaveLength(3);

    gate.resolve({ ok: true });
    await pending;
    const after = store.calls.heartbeats.length;
    await clock.advance(120_000);
    expect(store.calls.heartbeats).toHaveLength(after);
    expect(clock.pendingTimers).toBe(0);
  });

  it('ctx.heartbeat(progress) → 저장소에 progress가 실리고 true를 돌려준다', async () => {
    let answer: boolean | undefined;
    const { runner, store, memory } = harness([
      job('test.progress', async (_input, context) => {
        answer = await context.heartbeat({ processed: 7 });
        return { ok: true };
      }),
    ]);

    const result = await runner.execute('test.progress', undefined, TRIGGER);

    expect(answer).toBe(true);
    expect(store.calls.heartbeats[0]?.progress).toEqual({ processed: 7 });
    expect(memory.runOf(result.runId)?.summary).toEqual({ ok: true });
  });
});

describe('claim 상실', () => {
  it('store.heartbeat이 false → signal abort + FAILED(ERR_JOB_ABORTED)', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = { ...inner, heartbeat: async () => false };
    let observed: AbortSignal | undefined;
    const { runner } = harness(
      [
        job(
          'test.lost',
          async (_input, context) => {
            observed = context.signal;
            return new Promise<JobSummary>(() => {});
          },
          { timeoutMs: 600_000 },
        ),
      ],
      { store, clock, heartbeatIntervalMs: 1_000 },
    );

    const pending = runner.execute('test.lost', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(1_000);
    const result = await pending;

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_ABORTED');
    expect(observed?.aborted).toBe(true);
  });

  it('정산 후 ctx.heartbeat은 저장소를 건드리지 않고 false를 돌려준다 (§3.4.2)', async () => {
    const gate = deferred<JobSummary>();
    let late: ((progress: JobSummary) => Promise<boolean>) | undefined;
    const { runner, store, memory, clock } = harness([
      job(
        'test.orphan',
        async (_input, context) => {
          late = context.heartbeat;
          return gate.promise;
        },
        { timeoutMs: 1_000 },
      ),
    ]);

    const pending = runner.execute('test.orphan', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(1_000);
    const result = await pending;
    expect(result.status).toBe('TIMED_OUT');

    const before = store.calls.heartbeats.length;
    expect(await late?.({ progress: 9 })).toBe(false);
    expect(store.calls.heartbeats).toHaveLength(before);
    expect(memory.runOf(result.runId)?.summary).toBeUndefined();
    expect(memory.runOf(result.runId)?.status).toBe('TIMED_OUT');
    gate.resolve({});
  });

  it('시한 뒤에 성공 resolve하는 본문 — complete는 1회, 행은 TIMED_OUT, 늦은 정산은 경고 1건', async () => {
    const gate = deferred<JobSummary>();
    const { runner, store, memory, logger, clock } = harness([
      job('test.late', async () => gate.promise, { timeoutMs: 500 }),
    ]);

    const pending = runner.execute('test.late', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(500);
    const result = await pending;

    gate.resolve({ ok: true });
    await clock.advance(0);

    expect(store.calls.completes).toHaveLength(1);
    expect(memory.runOf(result.runId)?.status).toBe('TIMED_OUT');
    expect(
      logger.entries.filter((entry) => entry.message === 'job body settled after the run was recorded'),
    ).toHaveLength(1);
  });

  it('시한 뒤에 reject하는 본문 — unhandledRejection 0건 + 경고 1건', async () => {
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);
    try {
      const gate = deferred<JobSummary>();
      const { runner, logger, clock } = harness([
        job('test.lateboom', async () => gate.promise, { timeoutMs: 500 }),
      ]);

      const pending = runner.execute('test.lateboom', undefined, TRIGGER);
      await clock.advance(0);
      await clock.advance(500);
      await pending;

      gate.reject(new Error('too late'));
      await clock.advance(0);
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });

      expect(rejections).toHaveLength(0);
      expect(
        logger.entries.filter(
          (entry) => entry.message === 'job body settled after the run was recorded',
        ),
      ).toHaveLength(1);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });
});

describe('§3.4.1-5 저장소 장애 인내 — 마지막 성공 하트비트 기준 자기 abort', () => {
  it('계속 throw + staleRunAfterMs 경과 → abort. 경계 2점을 모두 고정한다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      ...inner,
      heartbeat: async () => {
        throw new Error('store unreachable');
      },
    };
    let observed: AbortSignal | undefined;
    const { runner, logger } = harness(
      [
        job(
          'test.blind',
          async (_input, context) => {
            observed = context.signal;
            return new Promise<JobSummary>(() => {});
          },
          { timeoutMs: 600_000 },
        ),
      ],
      { store, clock, heartbeatIntervalMs: 100, staleRunAfterMs: 1_000 },
    );

    let done = false;
    const pending = runner.execute('test.blind', undefined, TRIGGER).then((result) => {
      done = true;
      return result;
    });
    await clock.advance(0);

    await clock.advance(999);
    expect(done).toBe(false);
    expect(observed?.aborted).toBe(false);

    await clock.advance(1);
    const result = await pending;

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_ABORTED');
    expect(observed?.aborted).toBe(true);
    expect(
      logger.entries.filter((entry) => entry.message.includes('unverifiable for the full liveness budget')),
    ).toHaveLength(1);
  });

  it('중간에 한 번 성공하면 인내 창이 리셋된다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    let healthy = false;
    const store: JobRunStore = {
      ...inner,
      heartbeat: async (request) => {
        if (!healthy) throw new Error('store unreachable');
        return inner.heartbeat(request);
      },
    };
    const gate = deferred<JobSummary>();
    const { runner } = harness(
      [job('test.reset', async () => gate.promise, { timeoutMs: 600_000 })],
      { store, clock, heartbeatIntervalMs: 100, staleRunAfterMs: 1_000 },
    );

    let done = false;
    const pending = runner.execute('test.reset', undefined, TRIGGER).then((result) => {
      done = true;
      return result;
    });
    await clock.advance(0);
    await clock.advance(900);
    healthy = true;
    await clock.advance(100); // t=1000: 성공 → 창 리셋
    healthy = false;
    await clock.advance(999); // t=1999: 마지막 성공 이후 999ms
    expect(done).toBe(false);

    await clock.advance(1); // t=2000
    const result = await pending;
    expect(result.status).toBe('FAILED');
    gate.resolve({});
  });

  it('일시적 throw 1회 → 경고 1건, 실행은 계속되고 결과는 불변', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    let calls = 0;
    const store: JobRunStore = {
      ...inner,
      heartbeat: async (request) => {
        calls += 1;
        if (calls === 1) throw new Error('transient');
        return inner.heartbeat(request);
      },
    };
    const gate = deferred<JobSummary>();
    const { runner, logger } = harness(
      [job('test.transient', async () => gate.promise, { timeoutMs: 600_000 })],
      { store, clock, heartbeatIntervalMs: 100, staleRunAfterMs: 1_000 },
    );

    const pending = runner.execute('test.transient', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(200);
    gate.resolve({ ok: true });
    const result = await pending;

    expect(result.status).toBe('SUCCEEDED');
    expect(
      logger.entries.filter((entry) => entry.message === 'job heartbeat write failed'),
    ).toHaveLength(1);
  });

  it('ctx.heartbeat은 저장소 실패를 true로 흡수한다 — 한 번의 오류가 "claim 상실"이 아니다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      ...inner,
      heartbeat: async () => {
        throw new Error('transient');
      },
    };
    let answer: boolean | undefined;
    const { runner } = harness(
      [
        job('test.ctxfail', async (_input, context) => {
          answer = await context.heartbeat();
          return { ok: true };
        }),
      ],
      { store, clock },
    );

    const result = await runner.execute('test.ctxfail', undefined, TRIGGER);
    expect(answer).toBe(true);
    expect(result.status).toBe('SUCCEEDED');
  });
});

describe('호출자 시그널', () => {
  it('외부 signal abort → FAILED(ERR_JOB_ABORTED)', async () => {
    const controller = new AbortController();
    const { runner, clock } = harness([
      job('test.shutdown', async () => new Promise<JobSummary>(() => {}), { timeoutMs: 600_000 }),
    ]);

    const pending = runner.execute('test.shutdown', undefined, TRIGGER, {
      signal: controller.signal,
    });
    await clock.advance(0);
    controller.abort();
    const result = await pending;

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_ABORTED');
  });

  it('이미 abort된 signal → 행도 만들지 않고 본문도 돌지 않는다', async () => {
    const controller = new AbortController();
    controller.abort();
    let started = 0;
    const { runner, store, memory } = harness([
      job('test.prea', async () => {
        started += 1;
        return new Promise<JobSummary>(() => {});
      }),
    ]);

    await expect(
      runner.execute('test.prea', undefined, TRIGGER, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ERR_JOB_ABORTED', jobKey: 'test.prea' });

    // 시작하지 않기로 한 일은 부수효과도, reap도, 행도 남기지 않는다.
    expect(started).toBe(0);
    expect(store.calls.claims).toHaveLength(0);
    expect(store.calls.reaps).toHaveLength(0);
    expect(memory.runs()).toHaveLength(0);
  });

  it('claim 도중 abort되면 본문을 시작하지 않고 그 행을 FAILED로 마감한다', async () => {
    const controller = new AbortController();
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    let started = 0;
    const store: JobRunStore = {
      ...inner,
      claim: async (request) => {
        // claim이 도는 동안 호출자가 종료를 알린다.
        controller.abort();
        return inner.claim(request);
      },
    };
    const { runner } = harness(
      [
        job('test.midclaim', async () => {
          started += 1;
          return new Promise<JobSummary>(() => {});
        }),
      ],
      { store, clock },
    );

    const result = await runner.execute('test.midclaim', undefined, TRIGGER, {
      signal: controller.signal,
    });

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_ABORTED');
    expect(started).toBe(0);
    expect(inner.runOf(result.runId)?.status).toBe('FAILED');
  });
});
