/**
 * §5.4 포트 계약의 실행 가능한 형태 — 우리 자신의 인메모리 구현에 같은 케이스를 돌린다.
 * 이 배열이 곧 호스트 Prisma 구현의 인수 조건이다.
 */
import { describe, expect, it } from 'vitest';

import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';
import { jobRunStoreContractCases } from '../../src/testing/store-contract';
import type { JobRunStore } from '../../src/core/store';

function freshStore(): ReturnType<typeof memoryJobRunStore> {
  return memoryJobRunStore({ clock: fakeJobClock() });
}

describe('jobRunStoreContractCases — memoryJobRunStore', () => {
  const inspected = freshStore();
  const cases = jobRunStoreContractCases({
    inspect: async (runId) => inspected.runOf(runId),
  });

  it('S1–S7 각각에 최소 한 건씩 케이스를 만든다', () => {
    const obligations = new Set(cases.map((testCase) => testCase.obligation));
    expect([...obligations].sort()).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7']);
    expect(cases.length).toBeGreaterThanOrEqual(14);
  });

  for (const testCase of cases) {
    it(testCase.name, async () => {
      // inspect가 필요한 케이스는 그 저장소 인스턴스를 그대로 봐야 한다.
      const store: JobRunStore =
        testCase.obligation === 'S7' || testCase.name.includes('verbatim') ? inspected : freshStore();
      await testCase.run(store);
    });
  }

  it('skip 옵션은 해당 의무의 케이스를 전부 제거한다', () => {
    const filtered = jobRunStoreContractCases({ skip: ['S4', 'S7'] });
    expect(filtered.some((testCase) => testCase.obligation === 'S4')).toBe(false);
    expect(filtered.some((testCase) => testCase.obligation === 'S7')).toBe(false);
  });

  it('inspect가 없으면 저장값을 봐야 하는 케이스는 아예 만들어지지 않는다', () => {
    const portOnly = jobRunStoreContractCases();
    expect(portOnly.some((testCase) => testCase.obligation === 'S7')).toBe(false);
    // S1–S4는 포트만으로 관측 가능하므로 전부 남는다.
    for (const obligation of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const) {
      expect(portOnly.some((testCase) => testCase.obligation === obligation)).toBe(true);
    }
  });

  it('한 저장소 인스턴스로 전 케이스를 돌릴 수 있다 — README 레시피가 실제로 성립한다', async () => {
    const shared = freshStore();
    for (const testCase of jobRunStoreContractCases()) {
      await testCase.run(shared);
    }
  });

  it('같은 테이블을 향한 두 번째 실행도 초록이다 — 영속 저장소에서 재실행 가능하다', async () => {
    // 실제 PostgreSQL 테이블은 CI 실행 사이에 비워지지 않는다. 케이스가 고정 키를 쓰면
    // 지난 실행이 남긴 RUNNING 행이 이번 실행의 claim을 막고, 실패 메시지는 멀쩡한
    // 호스트 스키마를 "부분 유니크 인덱스가 없다"고 지목한다.
    const persistent = freshStore();
    for (const pass of [1, 2]) {
      for (const testCase of jobRunStoreContractCases()) {
        await expect(
          testCase.run(persistent),
          `pass ${pass}: ${testCase.name}`,
        ).resolves.toBeUndefined();
      }
    }
  });

  it('S4 fresh 케이스는 범위 없는 reap로 남의 행을 마감하지 않는다', async () => {
    const clock = fakeJobClock();
    const shared = memoryJobRunStore({ clock });

    // 이 스위트와 무관한, 한 시간보다 오래된 호스트의 RUNNING 행.
    const foreign = await shared.claim({
      jobKey: 'billing.monthly-close',
      overlapKey: 'billing.monthly-close',
      trigger: { source: 'SCHEDULER', triggeredBy: null },
      input: null,
      startedAt: 1_700_000_000_000,
    });
    expect(foreign).not.toBeNull();
    await clock.advance(7_200_000);

    const fresh = jobRunStoreContractCases().find((testCase) =>
      testCase.name.includes('fresh RUNNING row survives'),
    );
    await fresh?.run(shared);

    expect(shared.runOf(foreign?.runId ?? '')?.status).toBe('RUNNING');
  });

  it('실패 메시지는 위반한 의무를 이름으로 지목한다', async () => {
    // 조회 후 삽입으로 흉내 낸 비원자적 claim — S1 버스트 케이스가 이것을 잡는다.
    const broken = brokenNonAtomicStore();
    const burst = cases.find((testCase) => testCase.name.includes('burst'));
    await expect(burst?.run(broken)).rejects.toThrowError(/\[JobRunStore S1\]/u);
  });

  it('워터마크를 초기화하지 않는 구현은 S6-liveness에서 떨어진다', async () => {
    const nullWatermark = neverReapableStore();
    const liveness = cases.find((testCase) => testCase.name.includes('initialises the liveness watermark'));
    await expect(liveness?.run(nullWatermark)).rejects.toThrowError(/\[JobRunStore S6\]/u);
  });

  it('과잉(비부분) 유니크 인덱스를 흉내 낸 구현은 "마감 후 재claim"에서 떨어진다', async () => {
    const overUnique = permanentKeyHolderStore();
    const reclaim = cases.find((testCase) => testCase.name.includes('free again'));
    await expect(reclaim?.run(overUnique)).rejects.toThrowError(/PARTIAL/u);
  });
});

/** read-then-insert: 동시 호출 8건이 전부 "행이 없다"고 본다. */
function brokenNonAtomicStore(): JobRunStore {
  const held = new Set<string>();
  let counter = 0;
  return {
    claim: async (request) => {
      const taken = held.has(request.overlapKey);
      await Promise.resolve(); // read와 write 사이의 양보 — 이것이 결함의 정체다
      if (taken) return null;
      held.add(request.overlapKey);
      counter += 1;
      return { runId: `run-${counter}` };
    },
    heartbeat: async () => true,
    complete: async () => true,
    recordSkipped: async () => ({ runId: 'skip' }),
    reapStale: async () => 0,
  };
}

/** 워터마크가 NULL이라 어떤 컷오프에도 걸리지 않는 구현. */
function neverReapableStore(): JobRunStore {
  let counter = 0;
  return {
    claim: async () => {
      counter += 1;
      return { runId: `run-${counter}` };
    },
    heartbeat: async () => true,
    complete: async () => true,
    recordSkipped: async () => ({ runId: 'skip' }),
    reapStale: async () => 0,
  };
}

/** 부분 조건이 빠진 유니크 인덱스 — 첫 run이 key를 영구 점유한다. */
function permanentKeyHolderStore(): JobRunStore {
  const held = new Set<string>();
  let counter = 0;
  return {
    claim: async (request) => {
      if (held.has(request.overlapKey)) return null;
      held.add(request.overlapKey);
      counter += 1;
      return { runId: `run-${counter}` };
    },
    heartbeat: async () => true,
    complete: async () => true,
    recordSkipped: async () => ({ runId: 'skip' }),
    reapStale: async () => 0,
  };
}
