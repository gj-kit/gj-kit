/**
 * 두 러너가 같은 저장소를 두고 경쟁한다 — 단일 실행 보장의 정본 테스트.
 * 인메모리 저장소의 원자성은 "read와 write 사이에 await가 없다"에서 온다(S1).
 */
import { describe, expect, it } from 'vitest';

import { createJobRegistry } from '../../src/core/registry';
import { createJobRunner } from '../../src/core/runner';
import type { AnyOperationsJob, JobSummary } from '../../src/core/job';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { recordingJobLogger } from '../../src/testing/recording-logger';
import { deferred, TRIGGER } from './helpers';

describe('§5.1 두 러너의 claim 경쟁', () => {
  it('같은 저장소를 공유하는 러너 2개가 동시에 트리거되면 본문은 정확히 한 번만 돈다', async () => {
    const clock = fakeJobClock();
    const store = memoryJobRunStore({ clock });
    const logger = recordingJobLogger();
    const gate = deferred<JobSummary>();
    let started = 0;

    const job: AnyOperationsJob = {
      key: 'race.single-flight',
      description: 'racing runners share one overlap key',
      run: async () => {
        started += 1;
        return gate.promise;
      },
    };
    const registry = createJobRegistry([job]);

    const instanceA = createJobRunner({ registry, store, logger, clock });
    const instanceB = createJobRunner({ registry, store, logger, clock });

    const pending = Promise.all([
      instanceA.execute('race.single-flight', undefined, TRIGGER),
      instanceB.execute('race.single-flight', undefined, TRIGGER),
    ]);
    await clock.advance(0);
    gate.resolve({ ok: true });
    const [first, second] = await pending;

    expect(started).toBe(1);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['SKIPPED', 'SUCCEEDED']);
    expect(first.runId).not.toBe(second.runId);

    const rows = store.runs();
    expect(rows.filter((row) => row.status === 'SUCCEEDED')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'SKIPPED')).toHaveLength(1);
    expect(rows.filter((row) => row.status === 'RUNNING')).toHaveLength(0);
  });

  it('여덟 러너가 동시에 트리거해도 승자는 하나다', async () => {
    const clock = fakeJobClock();
    const store = memoryJobRunStore({ clock });
    const logger = recordingJobLogger();
    const gate = deferred<JobSummary>();
    let started = 0;

    const registry = createJobRegistry([
      {
        key: 'race.burst',
        description: 'burst',
        run: async () => {
          started += 1;
          return gate.promise;
        },
      } as AnyOperationsJob,
    ]);

    const runners = Array.from({ length: 8 }, () =>
      createJobRunner({ registry, store, logger, clock }),
    );
    const pending = Promise.all(
      runners.map((runner) => runner.execute('race.burst', undefined, TRIGGER)),
    );
    await clock.advance(0);
    gate.resolve({ ok: true });
    const results = await pending;

    expect(started).toBe(1);
    expect(results.filter((result) => result.status === 'SUCCEEDED')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'SKIPPED')).toHaveLength(7);
  });

  it('첫 실행이 끝나면 같은 키를 다시 claim할 수 있다', async () => {
    const clock = fakeJobClock();
    const store = memoryJobRunStore({ clock });
    const registry = createJobRegistry([
      { key: 'race.sequential', description: 's', run: async () => ({ ok: true }) } as AnyOperationsJob,
    ]);
    const runner = createJobRunner({
      registry,
      store,
      logger: recordingJobLogger(),
      clock,
    });

    const first = await runner.execute('race.sequential', undefined, TRIGGER);
    const second = await runner.execute('race.sequential', undefined, TRIGGER);

    expect(first.status).toBe('SUCCEEDED');
    expect(second.status).toBe('SUCCEEDED');
  });
});
