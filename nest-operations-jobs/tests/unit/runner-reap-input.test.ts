/**
 * §3.4.1-2·3 입력 검증과 reap 범위. reap 요청에 컷오프 시각이 실리지 않는다는 것이
 * S6(시간축 분리)의 러너 쪽 단언이다.
 */
import { describe, expect, it } from 'vitest';

import type { AnyOperationsJob } from '../../src/core/job';
import type { JobRunStore } from '../../src/core/store';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { harness, TRIGGER } from './helpers';

const okJob = (extra: Partial<AnyOperationsJob> = {}): AnyOperationsJob =>
  ({ key: 'reap.job', description: 'reap job', run: async () => ({ ok: true }), ...extra }) as AnyOperationsJob;

describe('§3.4.1-3 reap 범위', () => {
  it("기본 'overlap-key' + forbid → overlapKey만, staleAfterMs는 기간으로 실린다", async () => {
    const { runner, store } = harness([okJob()], {
      heartbeatIntervalMs: 1_000,
      staleRunAfterMs: 12_345,
      reapLimit: 50,
    });
    await runner.execute('reap.job', undefined, TRIGGER);

    expect(store.calls.reaps).toHaveLength(1);
    const request = store.calls.reaps[0];
    expect(request).toEqual({ staleAfterMs: 12_345, limit: 50, overlapKey: 'reap.job' });
    expect(request).not.toHaveProperty('jobKey');
    expect(request).not.toHaveProperty('staleBefore');
  });

  it("§4-24 기본 'overlap-key' + allow → jobKey만 (매 run 새 key라 key로 좁히면 아무것도 못 잡는다)", async () => {
    const { runner, store } = harness([okJob({ overlapPolicy: 'allow' })]);
    await runner.execute('reap.job', undefined, TRIGGER);

    const request = store.calls.reaps[0];
    expect(request?.jobKey).toBe('reap.job');
    expect(request).not.toHaveProperty('overlapKey');
  });

  it("'all' → 범위 인자 없음, 'off' → 호출 0회", async () => {
    const all = harness([okJob()], { reapScope: 'all' });
    await all.runner.execute('reap.job', undefined, TRIGGER);
    expect(all.store.calls.reaps[0]).toEqual({ staleAfterMs: 300_000 });

    const off = harness([okJob()], { reapScope: 'off' });
    await off.runner.execute('reap.job', undefined, TRIGGER);
    expect(off.store.calls.reaps).toHaveLength(0);
  });

  it('reap 실패는 경고만 남기고 실행을 막지 않는다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      ...inner,
      reapStale: async () => {
        throw new Error('reaper offline');
      },
    };
    const { runner, logger } = harness([okJob()], { store, clock });

    const result = await runner.execute('reap.job', undefined, TRIGGER);

    expect(result.status).toBe('SUCCEEDED');
    expect(
      logger.entries.filter((entry) => entry.message === 'stale job run reap failed'),
    ).toHaveLength(1);
  });

  it('reapStaleRuns()는 범위 없이 staleAfterMs만 보낸다 — 호스트 스윕 잡의 표면', async () => {
    const { runner, store } = harness([okJob()], { staleRunAfterMs: 60_000 });
    const moved = await runner.reapStaleRuns({ limit: 5 });

    expect(moved).toBe(0);
    expect(store.calls.reaps.at(-1)).toEqual({ staleAfterMs: 60_000, limit: 5 });
  });

  it('§3.2.3 시계 스큐 — 러너 시계가 5분 앞서도 저장소 축의 신선한 행은 reap되지 않는다', async () => {
    const storeClock = fakeJobClock(1_700_000_000_000);
    const runnerClock = fakeJobClock(1_700_000_000_000 + 300_000);
    const store = memoryJobRunStore({ clock: storeClock });

    // 다른 인스턴스가 방금 claim한 건강한 행.
    const held = await store.claim({
      jobKey: 'reap.job',
      overlapKey: 'reap.job',
      trigger: TRIGGER,
      input: null,
      startedAt: storeClock.now(),
    });
    expect(held).not.toBeNull();

    const { runner } = harness([okJob()], { store, clock: runnerClock, staleRunAfterMs: 300_000 });
    const result = await runner.execute('reap.job', undefined, TRIGGER);

    // reap이 러너 축에서 계산됐다면 이 행이 마감되고 두 번째 본문이 돌았을 것이다.
    expect(result.status).toBe('SKIPPED');
    expect(store.runOf(held?.runId ?? '')?.status).toBe('RUNNING');
  });
});

describe('§3.4.1-2 입력 검증 — 실패는 행을 만들지 않는다', () => {
  it('스키마 없음 + 비어 있지 않은 body → ERR_JOB_INPUT_UNEXPECTED, claim 0회', async () => {
    const { runner, store } = harness([okJob()]);
    await expect(runner.execute('reap.job', { a: 1 }, TRIGGER)).rejects.toMatchObject({
      code: 'ERR_JOB_INPUT_UNEXPECTED',
    });
    expect(store.calls.claims).toHaveLength(0);
  });

  it('스키마 있음 + 빈 body 3종 → {}로 정규화된다', async () => {
    const seen: unknown[] = [];
    const jobs = [
      {
        key: 'reap.input',
        description: 'input job',
        inputSchema: { parse: (value: unknown) => value as Record<string, unknown> },
        run: async (input: unknown) => {
          seen.push(input);
          return { ok: true };
        },
      } as unknown as AnyOperationsJob,
    ];
    for (const body of [undefined, null, {}]) {
      const { runner } = harness(jobs);
      await runner.execute('reap.input', body, TRIGGER);
    }
    expect(seen).toEqual([{}, {}, {}]);
  });

  it('parse가 던지면 ERR_JOB_INPUT_INVALID + cause 보존 + claim 0회', async () => {
    const cause = new Error('expected a positive limit');
    const { runner, store } = harness([
      {
        key: 'reap.strict',
        description: 'strict',
        inputSchema: {
          parse: () => {
            throw cause;
          },
        },
        run: async () => ({ ok: true }),
      } as unknown as AnyOperationsJob,
    ]);

    await expect(runner.execute('reap.strict', { limit: -1 }, TRIGGER)).rejects.toMatchObject({
      code: 'ERR_JOB_INPUT_INVALID',
      cause,
    });
    expect(store.calls.claims).toHaveLength(0);
  });

  it('검증된 입력이 claim 요청과 잡 본문에 그대로 흐른다', async () => {
    let received: unknown;
    const { runner, store } = harness([
      {
        key: 'reap.pass',
        description: 'pass',
        inputSchema: { parse: (value: unknown) => ({ limit: Number((value as { limit: unknown }).limit) }) },
        run: async (input: unknown) => {
          received = input;
          return { ok: true };
        },
      } as unknown as AnyOperationsJob,
    ]);

    await runner.execute('reap.pass', { limit: '5' }, TRIGGER);

    expect(received).toEqual({ limit: 5 });
    expect(store.calls.claims[0]?.input).toEqual({ limit: 5 });
  });

  it('serviceRevision은 주입된 값이 claim/skip 요청에 실린다 — 러너는 환경을 읽지 않는다', async () => {
    const { runner, store } = harness([okJob()], { serviceRevision: 'build-42' });
    await runner.execute('reap.job', undefined, TRIGGER);
    expect(store.calls.claims[0]?.serviceRevision).toBe('build-42');
  });
});
