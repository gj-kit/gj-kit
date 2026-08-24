/**
 * §3.4 러너 옵션의 조립 시점 검증과 시계 이상 처리.
 *
 * 두 값의 **순서**가 단일 실행 보장을 좌우한다: liveness 예산이 비트 주기보다 짧으면
 * 건강한 run이 자기 비트 사이에서 항상 stale로 보이고, 그 사이의 어떤 트리거든 그
 * 행을 reap하고 두 번째 본문을 시작한다. 이 파일이 그 창을 조립 시점에 닫는다.
 */
import { describe, expect, it } from 'vitest';

import { isOperationsJobsError } from '../../src/core/errors';
import type { AnyOperationsJob } from '../../src/core/job';
import { silentJobLogger } from '../../src/core/logger';
import { createJobRegistry } from '../../src/core/registry';
import { createJobRunner } from '../../src/core/runner';
import type { JobRunStore } from '../../src/core/store';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { harness, TRIGGER } from './helpers';

const okJob = (extra: Partial<AnyOperationsJob> = {}): AnyOperationsJob =>
  ({
    key: 'opt.job',
    description: 'options job',
    run: async () => ({ ok: true }),
    ...extra,
  }) as AnyOperationsJob;

function build(overrides: Record<string, unknown>): () => unknown {
  const clock = fakeJobClock();
  return () =>
    createJobRunner({
      registry: createJobRegistry([okJob()]),
      store: memoryJobRunStore({ clock }),
      logger: silentJobLogger(),
      clock,
      ...overrides,
    });
}

describe('createJobRunner 옵션 검증', () => {
  it('staleRunAfterMs <= heartbeatIntervalMs — 단일 실행 보장이 사라지는 쌍은 조립에서 죽는다', () => {
    expect(build({ heartbeatIntervalMs: 60_000, staleRunAfterMs: 10_000 })).toThrowError(
      /at least 2x heartbeatIntervalMs/u,
    );
    // 같은 값도 안 된다 — 비트 직전에 항상 예산이 만료된다.
    expect(build({ heartbeatIntervalMs: 30_000, staleRunAfterMs: 30_000 })).toThrowError(
      /at least 2x heartbeatIntervalMs/u,
    );
    // 2배는 하한이고 통과한다.
    expect(build({ heartbeatIntervalMs: 30_000, staleRunAfterMs: 60_000 })).not.toThrow();
  });

  it('던지는 것은 ERR_JOB_INVALID다', () => {
    let captured: unknown;
    try {
      build({ heartbeatIntervalMs: 60_000, staleRunAfterMs: 10_000 })();
    } catch (error) {
      captured = error;
    }
    expect(isOperationsJobsError(captured)).toBe(true);
    expect((captured as { code: string }).code).toBe('ERR_JOB_INVALID');
  });

  it.each([
    ['heartbeatIntervalMs', 0],
    ['heartbeatIntervalMs', -5],
    ['heartbeatIntervalMs', Number.NaN],
    ['heartbeatIntervalMs', Number.POSITIVE_INFINITY],
    ['staleRunAfterMs', -5],
    ['staleRunAfterMs', 0],
    ['defaultTimeoutMs', 0],
    ['defaultTimeoutMs', Number.NaN],
  ])('%s: %s는 조립에서 거부된다', (option, value) => {
    expect(build({ [option]: value })).toThrowError(/positive, finite number of milliseconds/u);
  });

  it.each(['heartbeatIntervalMs', 'staleRunAfterMs', 'defaultTimeoutMs'])(
    '%s가 32비트 타이머 상한을 넘으면 거부된다 — 넘기면 1ms로 접혀 매 실행 즉시 끝난다',
    (option) => {
      expect(build({ [option]: 2_147_483_648 })).toThrowError(/timer ceiling/u);
    },
  );
});

describe('reapStaleRuns', () => {
  it('저장소 실패는 드라이버 예외가 아니라 ERR_JOB_STORE로 나온다', async () => {
    const clock = fakeJobClock();
    const inner = memoryJobRunStore({ clock });
    const store: JobRunStore = {
      ...inner,
      reapStale: async () => {
        throw new Error('too many clients already');
      },
    };
    const { runner } = harness([okJob()], { store, clock, reapScope: 'off' });

    let captured: unknown;
    try {
      await runner.reapStaleRuns();
    } catch (error) {
      captured = error;
    }

    expect(isOperationsJobsError(captured)).toBe(true);
    expect((captured as { code: string }).code).toBe('ERR_JOB_STORE');
    expect((captured as { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it('성공 경로는 그대로 개수를 돌려준다', async () => {
    const { runner, store } = harness([okJob()], { reapScope: 'off', reapLimit: 7 });
    expect(await runner.reapStaleRuns()).toBe(0);
    expect(store.calls.reaps[0]).toEqual({ staleAfterMs: 300_000, limit: 7 });
  });
});

describe('시계가 뒤로 갈 때', () => {
  it('durationMs는 0으로 바닥을 깔고, 되감김 사실은 경고로 남는다', async () => {
    const clock = fakeJobClock();
    const { runner, logger, memory } = harness(
      [
        okJob({
          run: async () => {
            // NTP step: 실행 중에 벽시계가 한 시간 뒤로 간다.
            await clock.advance(-3_600_000);
            return { ok: true };
          },
        }),
      ],
      { clock },
    );

    const result = await runner.execute('opt.job', undefined, TRIGGER);

    expect(result.durationMs).toBe(0);
    expect(memory.runOf(result.runId)?.durationMs).toBe(0);
    expect(
      logger.entries.filter((entry) => entry.message.includes('clock moved backwards')),
    ).toHaveLength(1);
  });
});
