// 동기화 프로토콜의 **실행 가능한** 증명 (설계 §4.4 갭 없음 · §4.5 reset 6종 · §9.1 fuzz 행).
//
// §4.4의 증명은 산문이다. 여기서는 그것을 **완화**한다: 무작위 타임라인 × 무작위 크래시 지점 ×
// 두 플랫폼에 대해, 백필 + 드레인을 완주한 소비자의 저장소가 진실 집합과 정확히 같아야 한다.
// ⚠ 정직하게: 플래너와 오라클이 같은 전제를 공유하므로 이것은 증명이 아니라 완화다.
//
// 이 스위트는 `./testing`의 페이크를 **재생 가능한 변경 로그**로 돌린다. 같은 체크포인트로 두 번
// 드레인하면 같은 답이 나온다 — HK 앵커와 HC changes token이 실제로 그렇게 동작하며, 그 성질이
// 없으면 "크래시 후 재개"는 표현조차 불가능하다.

import { describe, expect, it } from 'vitest';

import {
  CURSOR_FORMAT_VERSION,
  describeCursor,
  type CursorResetReason,
  type Workout,
  type WorkoutsPlatform,
} from '../../src/core';
import { decodeCursor, encodeCursor, scopeFingerprint } from '../../src/core/sync/cursor';
import { corruptCursor, createFakeWorkouts, type FakeWorkouts } from '../../src/testing';

/** 결정적 PRNG (mulberry32) — 실패는 seed 하나로 재현된다. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HORIZON = 1_700_000_000_000;

describe('커서 코덱 — fuzz 왕복', () => {
  it('1000개의 무작위 payload가 바이트 동일하게 왕복한다', () => {
    const random = rng(20260822);
    // 멀티바이트 · 서로게이트 쌍 · base64url이 아닌 문자 · JSON 이스케이프 대상까지 섞는다.
    const alphabet = ['a', 'X', '0', '+', '/', '=', '_', '-', ' ', '\t', '\n', '"', '\\', '{', '}', '가', '한', '\u{1F3C3}'];
    for (let i = 0; i < 1000; i += 1) {
      const length = Math.floor(random() * 40);
      let k = '';
      for (let c = 0; c < length; c += 1) {
        k += alphabet[Math.floor(random() * alphabet.length)] ?? '';
      }
      const platform: WorkoutsPlatform = random() < 0.5 ? 'ios' : 'android';
      const g = scopeFingerprint([`p${String(Math.floor(random() * 1000))}`]);
      const s = Math.floor(random() * 2_000_000_000_000);
      const cursor = encodeCursor(platform, { k, g, s });
      const decoded = decodeCursor(cursor, platform, g);
      expect(decoded.ok, k).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.payload).toEqual({ k, g, s });
      expect(decoded.formatVersion).toBe(CURSOR_FORMAT_VERSION);
      const info = describeCursor(cursor);
      expect(info?.platform).toBe(platform);
      expect(info?.issuedAtMs).toBe(s);
      // §5.2 커서 불투명성: 플랫폼 토큰의 어떤 부분도 진단 객체에 새지 않는다.
      // 짧은 문자열은 JSON 문법 문자와 우연히 겹치므로 8자 이상에서만 의미가 있다.
      if (k.length >= 8) expect(JSON.stringify(info)).not.toContain(k);
    }
  });

  it('적대적 문자열 2000개가 던지지 않고 전부 reset 사유가 된다', () => {
    const random = rng(7);
    const bytes = ['g', 'j', 'w', '1', '.', 'i', 'a', '-', '_', '=', '+', '{', '}', '"', '\\', ' ', '9', 'Z'];
    for (let i = 0; i < 2000; i += 1) {
      const length = Math.floor(random() * 30);
      let cursor = '';
      for (let c = 0; c < length; c += 1) cursor += bytes[Math.floor(random() * bytes.length)] ?? '';
      const decoded = decodeCursor(cursor, 'ios', 'stable');
      if (decoded.ok) {
        // 우연히 유효한 커서가 나왔다면 payload는 반드시 온전한 shape이어야 한다.
        expect(typeof decoded.payload.k).toBe('string');
        continue;
      }
      expect(
        ['malformed', 'formatUnsupported', 'platformMismatch', 'scopesChanged'] as CursorResetReason[],
      ).toContain(decoded.reason);
    }
  });
});

interface Consumer {
  readonly rows: Map<string, Workout>;
  readonly keyByNativeId: Map<string, string>;
  cursor: string | null;
}

function newConsumer(): Consumer {
  return { rows: new Map(), keyByNativeId: new Map(), cursor: null };
}

function upsert(consumer: Consumer, workout: Workout): string {
  const key = workout.clientId ?? workout.id;
  consumer.rows.set(key, workout);
  consumer.keyByNativeId.set(workout.id, key);
  return key;
}

function removeById(consumer: Consumer, nativeId: string): void {
  const key = consumer.keyByNativeId.get(nativeId);
  // `remove(모르는 id)`는 no-op이어야 한다 — 두 번째 호출자 의무(§4.4).
  if (key === undefined) return;
  const current = consumer.rows.get(key);
  consumer.keyByNativeId.delete(nativeId);
  // 교체로 새 native id가 같은 키를 이미 차지했다면 그 행은 살아 있어야 한다(§4.7 rekey).
  if (current !== undefined && current.id !== nativeId) return;
  consumer.rows.delete(key);
}

/**
 * §4.4의 다섯 단계를 그대로 실행한다. `crashAt`이 주어지면 그 페이지에서 **커서도 아이템도
 * 커밋하지 않고** 중단한다 — 한 트랜잭션 규칙을 지킨 소비자가 크래시한 모양이다.
 */
async function syncRound(
  fake: FakeWorkouts,
  consumer: Consumer,
  options: { readonly crashAt?: number | undefined; readonly maxPages?: number | undefined },
): Promise<{ readonly reset: boolean; readonly pages: number }> {
  const maxPages = options.maxPages ?? 200;
  let unconfirmed: Set<string> | null = null;
  let sawReset = false;
  let pages = 0;

  for (;;) {
    const page = await fake.api.syncWorkouts(consumer.cursor);
    pages += 1;
    if (options.crashAt !== undefined && pages === options.crashAt) {
      // 아무것도 커밋하지 않는다. 다음 라운드는 같은 커서에서 다시 시작한다.
      return { reset: sawReset, pages };
    }
    if (page.reset) {
      sawReset = true;
      // "테이블을 비우지 말고 미확인으로 표시하라" — §4.5의 정본 문구를 그대로 실행한다.
      unconfirmed = new Set(consumer.rows.keys());
      let pageToken: string | undefined;
      for (;;) {
        const backfill = await fake.api.listWorkouts({
          fromMs: HORIZON,
          toMs: Number.MAX_SAFE_INTEGER,
          ...(pageToken === undefined ? {} : { pageToken }),
        });
        for (const workout of backfill.items) {
          const key = upsert(consumer, workout);
          unconfirmed.delete(key);
        }
        pageToken = backfill.nextPageToken;
        if (pageToken === undefined) break;
      }
    }
    for (const workout of page.added) {
      // ⚠ `unconfirmed?.delete(upsert(...))`로 쓰면 안 된다 — optional chaining은 체인 전체를
      //   단락시키므로 `unconfirmed`가 null일 때 `upsert` 자체가 호출되지 않는다.
      const key = upsert(consumer, workout);
      unconfirmed?.delete(key);
    }
    for (const entry of page.removed) removeById(consumer, entry.id);
    consumer.cursor = page.cursor;
    if (!page.hasMore || pages >= maxPages) break;
  }

  // 드레인이 수렴한 뒤에도 미확인인 행만 지운다.
  if (unconfirmed !== null) for (const key of unconfirmed) consumer.rows.delete(key);
  return { reset: sawReset, pages };
}

describe('갭 없음 · 이중 계상 무해 — 무작위 타임라인 fuzz (§4.4)', () => {
  for (const platform of ['ios', 'android'] as const) {
    it(`${platform} — 200회 무작위 실행에서 저장소가 진실 집합과 일치한다`, async () => {
      for (let run = 0; run < 200; run += 1) {
        const random = rng(1000 + run);
        const fake = createFakeWorkouts({ platform, nowMs: HORIZON + 90_000_000 });
        const consumer = newConsumer();
        const truth = new Set<string>();
        const nativeByClient = new Map<string, string>();
        let minted = 0;

        // 시작 상태: 이미 저장소에 있던 워크아웃 몇 개.
        const seeded = Math.floor(random() * 4);
        for (let i = 0; i < seeded; i += 1) {
          const clientId = `pre-${String(i)}`;
          const nativeId = fake.addWorkout({
            clientId,
            isOwn: true,
            kind: 'running',
            startMs: HORIZON + i * 60_000,
            endMs: HORIZON + i * 60_000 + 30_000,
          });
          nativeByClient.set(clientId, nativeId);
          truth.add(clientId);
        }

        const rounds = 3 + Math.floor(random() * 5);
        for (let round = 0; round < rounds; round += 1) {
          const mutations = Math.floor(random() * 6);
          for (let m = 0; m < mutations; m += 1) {
            const existing = [...truth];
            const roll = random();
            if (roll < 0.5 || existing.length === 0) {
              minted += 1;
              const clientId = `w-${String(minted)}`;
              const startMs = HORIZON + Math.floor(random() * 80_000_000);
              const nativeId = fake.addWorkout({
                clientId,
                isOwn: true,
                kind: 'walking',
                startMs,
                endMs: startMs + 60_000,
              });
              nativeByClient.set(clientId, nativeId);
              truth.add(clientId);
            } else if (roll < 0.78) {
              const clientId = existing[Math.floor(random() * existing.length)] ?? '';
              const current = nativeByClient.get(clientId);
              if (current === undefined) continue;
              nativeByClient.set(clientId, fake.replaceWorkout(current, { kind: 'cycling' }));
            } else {
              const clientId = existing[Math.floor(random() * existing.length)] ?? '';
              const current = nativeByClient.get(clientId);
              if (current === undefined) continue;
              fake.removeWorkout(current);
              nativeByClient.delete(clientId);
              truth.delete(clientId);
            }
          }
          if (random() < 0.15) fake.expireCursor('expired');
          const crash = random() < 0.3 ? 1 + Math.floor(random() * 2) : undefined;
          await syncRound(fake, consumer, { ...(crash === undefined ? {} : { crashAt: crash }) });
        }

        // 완주 — 크래시 없이 수렴시킨다.
        await syncRound(fake, consumer, {});
        await syncRound(fake, consumer, {});

        expect([...consumer.rows.keys()].sort(), `run ${String(run)}`).toEqual([...truth].sort());
      }
    });
  }
});

describe('백필 중단과 재개 — 커서는 백필 **전에** 잡혔다 (§4.4)', () => {
  it('백필 도중 죽어도 재개하면 갭이 없다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: HORIZON + 90_000_000 });
    for (let i = 0; i < 120; i += 1) {
      fake.addWorkout({
        clientId: `back-${String(i)}`,
        isOwn: true,
        kind: 'running',
        startMs: HORIZON + i * 60_000,
        endMs: HORIZON + i * 60_000 + 30_000,
      });
    }
    const consumer = newConsumer();
    // 첫 라운드는 reset을 받고 백필 첫 페이지만 처리한 상태에서 죽는다.
    const first = await fake.api.syncWorkouts(null);
    expect(first.reset).toBe(true);
    const page = await fake.api.listWorkouts({ fromMs: HORIZON, toMs: Number.MAX_SAFE_INTEGER });
    expect(page.items.length).toBe(50);
    expect(page.nextPageToken).toBeDefined();
    // 커서만 커밋하고 죽는 대신, 아무것도 커밋하지 않고 죽는다 — 올바른 소비자의 모양이다.

    // 백필 중에 하나가 새로 생긴다.
    fake.addWorkout({
      clientId: 'during-backfill',
      isOwn: true,
      kind: 'hiking',
      startMs: HORIZON + 10_000_000,
      endMs: HORIZON + 10_060_000,
    });

    await syncRound(fake, consumer, {});
    await syncRound(fake, consumer, {});
    expect(consumer.rows.size).toBe(121);
    expect(consumer.rows.has('during-backfill')).toBe(true);
  });

  it('커서만 커밋하고 아이템을 잃으면 그 워크아웃은 영구 유실된다 — 라이브러리가 막을 수 없다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: HORIZON + 90_000_000 });
    const consumer = newConsumer();
    await syncRound(fake, consumer, {});
    fake.addWorkout({
      clientId: 'lost',
      isOwn: true,
      kind: 'running',
      startMs: HORIZON + 1_000_000,
      endMs: HORIZON + 1_060_000,
    });
    // 잘못된 소비자: 커서는 저장하고 아이템은 버린다.
    const page = await fake.api.syncWorkouts(consumer.cursor);
    expect(page.added.length).toBe(1);
    consumer.cursor = page.cursor;
    // 그 뒤로 몇 번을 더 돌려도 'lost'는 다시 오지 않는다.
    await syncRound(fake, consumer, {});
    await syncRound(fake, consumer, {});
    expect(consumer.rows.has('lost')).toBe(false);
    // 유일한 복구 경로는 전체 재조회다.
    const backfill = await fake.api.listWorkouts({ fromMs: HORIZON, toMs: Number.MAX_SAFE_INTEGER });
    expect(backfill.items.some((workout) => workout.clientId === 'lost')).toBe(true);
  });
});

describe('reset 사유 6종 전수 (§4.5)', () => {
  it('여섯 가지 모두에 도달하고, 어느 것도 예외를 던지지 않는다', async () => {
    const seen: CursorResetReason[] = [];
    const fake = createFakeWorkouts({ platform: 'ios', nowMs: HORIZON + 1000 });

    const first = await fake.api.syncWorkouts(null);
    expect(first.reset).toBe(true);
    if (first.reset) seen.push(first.resetReason);

    for (const reason of ['malformed', 'formatUnsupported', 'platformMismatch'] as const) {
      const doctored = corruptCursor(first.cursor, reason);
      const result = await fake.api.syncWorkouts(doctored);
      expect(result.reset, reason).toBe(true);
      if (result.reset) seen.push(result.resetReason);
    }

    fake.expireCursor('expired');
    const expired = await fake.api.syncWorkouts(first.cursor);
    expect(expired.reset).toBe(true);
    if (expired.reset) seen.push(expired.resetReason);

    fake.expireCursor('scopesChanged');
    const changed = await fake.api.syncWorkouts(first.cursor);
    expect(changed.reset).toBe(true);
    if (changed.reset) seen.push(changed.resetReason);

    expect([...seen].sort()).toEqual([
      'expired',
      'formatUnsupported',
      'malformed',
      'noCursor',
      'platformMismatch',
      'scopesChanged',
    ]);
  });

  it('reset 페이지는 언제나 비어 있고 hasMore가 false다 — 타입이 이미 그렇게 말한다', async () => {
    const fake = createFakeWorkouts({ platform: 'android', nowMs: HORIZON + 1000 });
    fake.addWorkout({ clientId: 'x', isOwn: true, startMs: HORIZON, endMs: HORIZON + 1000 });
    const result = await fake.api.syncWorkouts(null);
    expect(result.reset).toBe(true);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});
