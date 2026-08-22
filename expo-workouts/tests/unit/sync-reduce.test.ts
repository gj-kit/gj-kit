// 동기화 페이지 정합 (설계 §4.6 · §4.7 · §5.2 · §9.1).

import { describe, expect, it } from 'vitest';

import { reconcileSyncPage, type RemovedWorkout, type Workout } from '../../src/core';
import { reduceSyncPage } from '../../src/core/sync/reduce';

function workout(id: string, extra?: { clientId?: string; isOwn?: boolean }): Workout {
  return {
    id,
    clientId: extra?.clientId,
    isOwn: extra?.isOwn ?? false,
    kind: 'running',
    startMs: 1_755_000_000_000,
    endMs: 1_755_000_600_000,
    activeDurationS: 600,
    source: { id: 'kit.gj.workouts.test' },
    pauses: [],
    laps: [],
    routeState: 'none',
    platform: 'android',
    platformData: {
      exerciseType: 56,
      packageName: 'kit.gj.workouts.test',
      recordingMethod: 0,
      segments: [],
    },
  };
}

describe('reduceSyncPage — 같은 배치의 added와 removed (f92)', () => {
  it('added에 있는 id는 removed에서 뺀다 — UUID는 삭제로 해제되지 않는다', () => {
    const folded = reduceSyncPage({
      added: [workout('a')],
      removed: [
        { id: 'a', replaced: false },
        { id: 'b', replaced: false },
      ],
    });
    expect(folded.added.map((entry) => entry.id)).toEqual(['a']);
    expect(folded.removed.map((entry) => entry.id)).toEqual(['b']);
  });

  it('added 자체도 id 기준으로 접는다 — 백필/드레인 경계의 중복은 정상이다', () => {
    const folded = reduceSyncPage({
      added: [workout('a'), workout('a'), workout('b')],
      removed: [],
    });
    expect(folded.added.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('reconcileSyncPage — upsert / delete / rekey 3분할', () => {
  it('replaced가 아닌 removal은 delete다', () => {
    const removed: readonly RemovedWorkout[] = [{ id: 'gone', replaced: false }];
    const result = reconcileSyncPage({ added: [], removed });
    expect(result.deletes).toEqual(['gone']);
    expect(result.rekeys).toEqual([]);
  });

  it('iOS 교체는 rekey다 — DELETE + INSERT가 아니다 (로컬 조인 데이터가 살아남아야 한다)', () => {
    const result = reconcileSyncPage({
      added: [workout('new-uuid', { clientId: 'my-id', isOwn: true })],
      removed: [{ id: 'old-uuid', replaced: true }],
    });
    expect(result.rekeys).toEqual([{ fromId: 'old-uuid', toId: 'new-uuid' }]);
    expect(result.deletes).toEqual([]);
    expect(result.upserts.map((entry) => entry.id)).toEqual(['new-uuid']);
  });

  it('replaced인데 짝을 못 찾으면 **삭제하지 않는다** — replaced는 "아직 존재한다"는 뜻이다', () => {
    const result = reconcileSyncPage({ added: [], removed: [{ id: 'old', replaced: true }] });
    expect(result.deletes).toEqual([]);
    expect(result.rekeys).toEqual([]);
  });

  it('Android는 replaced가 언제나 false이므로 rekey가 나오지 않는다 (f92, f97)', () => {
    const result = reconcileSyncPage({
      added: [workout('same-uuid', { clientId: 'my-id', isOwn: true })],
      removed: [],
    });
    expect(result.rekeys).toEqual([]);
    expect(result.deletes).toEqual([]);
    expect(result.upserts.map((entry) => entry.id)).toEqual(['same-uuid']);
  });

  it('남의 워크아웃(clientId 없음)은 rekey 짝이 되지 않는다', () => {
    const result = reconcileSyncPage({
      added: [workout('foreign')],
      removed: [{ id: 'old', replaced: true }],
    });
    expect(result.rekeys).toEqual([]);
  });

  it('교체 2건이 한 배치에 와도 순서대로 짝지어진다', () => {
    const result = reconcileSyncPage({
      added: [
        workout('new-1', { clientId: 'a', isOwn: true }),
        workout('new-2', { clientId: 'b', isOwn: true }),
      ],
      removed: [
        { id: 'old-1', replaced: true },
        { id: 'old-2', replaced: true },
      ],
    });
    expect(result.rekeys).toEqual([
      { fromId: 'old-1', toId: 'new-1' },
      { fromId: 'old-2', toId: 'new-2' },
    ]);
  });

  it('모르는 id의 삭제는 호출자 관점에서 no-op이어야 한다 — 우리는 그 id를 그대로 넘긴다', () => {
    // Android `DeletionChange`는 recordId뿐이라(f97) start instant를 모른다. 따라서 지평선
    // 필터를 적용할 수 없고, 모르는 id를 받는 것이 **정상**이다.
    const result = reconcileSyncPage({
      added: [],
      removed: [{ id: 'never-held', replaced: false }],
    });
    expect(result.deletes).toEqual(['never-held']);
  });
});
