/**
 * §3.4.1-6 abort와 본문 정산이 같은 microtask drain에 도착하는 경계.
 *
 * `Promise.race`는 둘이 같은 drain에 오면 abort에 무조건 우선권을 준다. 그 우선권을
 * 그대로 두면 **이미 성공한 본문**이 "claim을 잃었다"로 기록되고, HTTP 매핑이 500을
 * 내며, 스케줄러가 재시도한다 — 이 패키지가 막으려는 이중 실행이 정확히 그렇게 열린다.
 * 그래서 러너는 본문 정산을 race와 독립적으로 관측하고, 성공한 본문의 결과를 정본으로 쓴다.
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

describe('abort와 본문 완료가 같은 turn에 도착할 때', () => {
  it('하트비트 false + 같은 turn의 본문 성공 → 본문의 결과가 기록된다 (complete가 claim 보유를 증명한다)', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = { ...inner, heartbeat: async () => false };
    const { runner, logger } = harness(
      [
        job('race.beatfalse', async (_input, context) => {
          await context.heartbeat();
          return { ok: true, processed: 42 };
        }),
      ],
      { store, clock },
    );

    const result = await runner.execute('race.beatfalse', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('settled');
    if (result.status !== 'SUCCEEDED') throw new Error('unreachable');
    expect(result.summary).toEqual({ ok: true, processed: 42 });

    const row = inner.runOf(result.runId);
    expect(row?.status).toBe('SUCCEEDED');
    expect(row?.summary).toEqual({ ok: true, processed: 42 });
    expect(row?.error).toBeUndefined();

    // 경합 자체는 감춰지지 않는다 — 운영자가 읽을 경고가 남는다.
    expect(
      logger.entries.filter((entry) =>
        entry.message.includes('completed in the same turn the run was aborted'),
      ),
    ).toHaveLength(1);
  });

  it('저장소 장애로 자기 abort가 걸린 turn에 본문이 성공해도 결과는 SUCCEEDED다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const hung = deferred<boolean>();
    const store: JobRunStore = { ...inner, heartbeat: () => hung.promise };
    const bodyGate = deferred<JobSummary>();
    const { runner } = harness([job('race.outage', async () => bodyGate.promise, { timeoutMs: 600_000 })], {
      store,
      clock,
      heartbeatIntervalMs: 1_000,
      staleRunAfterMs: 2_000,
    });

    const pending = runner.execute('race.outage', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(1_000); // 비트 #1 — 응답이 없다
    await clock.advance(1_000); // t=2000, liveness 예산 소진

    // pg Pool이 큐에 쌓인 쿼리를 한 콜백에서 전부 거절하는 그 순간 본문도 끝난다.
    hung.reject(new Error('pool destroyed: too many clients already'));
    bodyGate.resolve({ ok: true, processed: 42 });

    const result = await pending;

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('settled');
    expect(inner.runOf(result.runId)?.status).toBe('SUCCEEDED');
  });

  it('reaper가 이미 마감한 행이면 본문 성공이라도 recorded는 superseded로 드러난다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      ...inner,
      heartbeat: async () => false,
      complete: async () => false,
    };
    const { runner } = harness(
      [
        job('race.superseded', async (_input, context) => {
          await context.heartbeat();
          return { ok: true };
        }),
      ],
      { store, clock },
    );

    const result = await runner.execute('race.superseded', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(result.recorded).toBe('superseded');
  });

  it('본문이 끝나지 않았으면 abort가 그대로 정본이다 — orphan은 여전히 FAILED(ERR_JOB_ABORTED)', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = { ...inner, heartbeat: async () => false };
    const { runner } = harness(
      [job('race.orphan', async () => new Promise<JobSummary>(() => {}), { timeoutMs: 600_000 })],
      { store, clock, heartbeatIntervalMs: 1_000 },
    );

    const pending = runner.execute('race.orphan', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(1_000);
    const result = await pending;

    expect(result.status).toBe('FAILED');
    if (result.status !== 'FAILED') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_ABORTED');
    expect(inner.runOf(result.runId)?.status).toBe('FAILED');
  });

  it('abort를 관측하고 던진 본문은 예외가 아니다 — 분류는 signal.reason이 그대로 이긴다', async () => {
    const gate = deferred<JobSummary>();
    const { runner, clock } = harness([
      job(
        'race.throws',
        async (_input, context) => {
          await gate.promise;
          throw context.signal.reason;
        },
        { timeoutMs: 500 },
      ),
    ]);

    const pending = runner.execute('race.throws', undefined, TRIGGER);
    await clock.advance(0);
    await clock.advance(500);
    gate.resolve({});
    const result = await pending;

    expect(result.status).toBe('TIMED_OUT');
    if (result.status !== 'TIMED_OUT') throw new Error('unreachable');
    expect(result.error.code).toBe('ERR_JOB_TIMEOUT');
  });
});
