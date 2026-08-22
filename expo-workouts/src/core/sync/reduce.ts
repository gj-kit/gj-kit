// 동기화 페이지 정합 (설계 §4.6 · §4.7 · §5.2).

import type { RemovedWorkout, SyncPage, Workout } from '../types';

/**
 * 내부 축약 — 드레인 배치의 raw `added`/`removed`를 공개 계약으로 접는다.
 *
 * 규칙 (f92): **같은 배치에서 한 id가 `added`와 `removed`에 동시에 나오면 `removed`에서 뺀다.**
 * Health Connect의 UUID는 삭제로 해제되지 않으므로, 같은 `clientRecordId`를 지운 뒤 다시 넣으면
 * 정확히 이 모양이 나온다 — 그 경우 진실은 "존재한다"이다.
 *
 * 그리고 `added` 자체도 id 기준으로 접는다. 백필/드레인 경계의 중복은 정상이고(§4.4), 뒤에 온
 * 것이 더 최신이다.
 */
export function reduceSyncPage(input: {
  readonly added: readonly Workout[];
  readonly removed: readonly RemovedWorkout[];
}): { readonly added: readonly Workout[]; readonly removed: readonly RemovedWorkout[] } {
  const byId = new Map<string, Workout>();
  for (const workout of input.added) byId.set(workout.id, workout);
  const added = [...byId.values()];
  const removed = input.removed.filter((entry) => !byId.has(entry.id));
  return { added, removed };
}

/**
 * Split one sync page into the three operations a local store actually performs.
 *
 * - `rekeys` come from `removed[].replaced === true` matched against the same page's `added` —
 *   iOS replaces a workout's native id when the same sync identifier is re-saved. Apply them as an
 *   UPDATE of the primary key, NEVER as DELETE + INSERT, or you lose your local join data (server
 *   ids, upload state, notes).
 * - `deletes` are the genuinely-gone ids. Applying one for an id you never held must be a no-op.
 *
 * ⚠ Matching heuristic, stated out loud: `RemovedWorkout` deliberately does not carry a
 *   `replacedById` field, so a replaced removal is paired, in order, with the same page's own
 *   writes (`isOwn && clientId != null`). A batch that carries several replacements at once pairs
 *   them positionally, which is what the platform emits. A replaced removal that finds no partner
 *   is NEVER turned into a delete — `replaced: true` means the workout still exists, and deleting
 *   it would destroy the caller's join data.
 */
export function reconcileSyncPage(page: Pick<SyncPage, 'added' | 'removed'>): {
  readonly upserts: readonly Workout[];
  readonly deletes: readonly string[];
  readonly rekeys: readonly { readonly fromId: string; readonly toId: string }[];
} {
  const candidates = page.added.filter(
    (workout) => workout.isOwn && workout.clientId !== undefined && workout.clientId.length > 0,
  );
  const rekeys: { readonly fromId: string; readonly toId: string }[] = [];
  const deletes: string[] = [];
  let next = 0;
  for (const entry of page.removed) {
    if (!entry.replaced) {
      deletes.push(entry.id);
      continue;
    }
    const partner = candidates[next];
    if (partner === undefined) continue;
    next += 1;
    if (partner.id === entry.id) continue;
    rekeys.push({ fromId: entry.id, toId: partner.id });
  }
  return { upserts: page.added, deletes, rekeys };
}
