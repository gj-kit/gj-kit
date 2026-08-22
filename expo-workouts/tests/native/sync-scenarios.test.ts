// `tests/fixtures/sync-scenarios.json`을 **실행한다** (설계 §9.4).
//
// 이 파일이 픽스처의 정본 드라이버다. XCTest(`HealthStoring` 페이크)와 JUnit(`HealthConnectGateway`
// 페이크)이 같은 JSON을 읽고 같은 결론을 내야 한다 — 그것이 "네이티브↔TS 의미 표류가 기기 발견이
// 아니라 실패하는 테스트가 되는" 지점이다. 스키마는 픽스처의 `$schema` 블록에 있다.

import { describe, expect, it } from 'vitest';

import type { CursorResetReason, Workout, WorkoutsPlatform } from '../../src/core';
import { corruptCursor, createFakeWorkouts, type FakeWorkouts } from '../../src/testing';
import scenarios from '../fixtures/sync-scenarios.json';

interface ExpectBlock {
  readonly reset?: boolean;
  readonly resetReason?: string;
  readonly added?: number;
  readonly removed?: number;
  readonly removedReplaced?: boolean;
  readonly hasMore?: boolean;
}

interface Step {
  readonly op: string;
  readonly count?: number;
  readonly own?: boolean;
  readonly sameClientId?: boolean;
  readonly cursor?: null;
  readonly index?: number;
  readonly reason?: string;
  readonly afterPages?: number;
  readonly expect?: ExpectBlock;
  readonly expectByPlatform?: Readonly<Record<string, ExpectBlock>>;
}

interface Scenario {
  readonly name: string;
  readonly platforms: readonly string[];
  readonly steps: readonly Step[];
  readonly finalStore?: readonly number[];
}

const HORIZON = scenarios.horizonMs;
const NOW = HORIZON + 100_000_000;

/** 논리 번호 -> 현재 native id / clientId. replace가 native id를 바꿔도 번호는 그대로다. */
interface Ledger {
  readonly nativeIdByIndex: Map<number, string>;
  readonly clientIdByIndex: Map<number, string>;
  next: number;
}

function seed(fake: FakeWorkouts, ledger: Ledger, step: Step): void {
  const count = step.count ?? 1;
  for (let i = 0; i < count; i += 1) {
    if (step.sameClientId === true) {
      // f92 — 같은 clientRecordId를 지운 뒤 다시 넣으면 **같은 UUID**가 돌아온다.
      const index = ledger.next - 1;
      const clientId = ledger.clientIdByIndex.get(index);
      const previous = ledger.nativeIdByIndex.get(index);
      if (clientId === undefined || previous === undefined) continue;
      fake.addWorkout({
        nativeId: previous,
        clientId,
        isOwn: true,
        kind: 'running',
        startMs: HORIZON + index * 60_000,
        endMs: HORIZON + index * 60_000 + 30_000,
      });
      ledger.nativeIdByIndex.set(index, previous);
      continue;
    }
    const index = ledger.next;
    ledger.next += 1;
    const clientId = `scenario-${String(index)}`;
    const nativeId = fake.addWorkout({
      ...(step.own === true ? { clientId, isOwn: true } : {}),
      kind: 'running',
      startMs: HORIZON + index * 60_000,
      endMs: HORIZON + index * 60_000 + 30_000,
    });
    ledger.nativeIdByIndex.set(index, nativeId);
    if (step.own === true) ledger.clientIdByIndex.set(index, clientId);
  }
}

describe('공유 시나리오 표 — tests/fixtures/sync-scenarios.json', () => {
  it('스키마 자체가 자기 서술적이다 — 네이티브 레인이 읽을 것이 여기 있다', () => {
    expect(scenarios.schemaVersion).toBe(1);
    expect(Object.keys(scenarios.$schema.ops).sort()).toEqual([
      'backfill',
      'changeScopes',
      'corruptCursor',
      'expireCursor',
      'kill',
      'noOpUpsertion',
      'purgeDeletion',
      'remove',
      'replace',
      'seed',
      'sync',
    ]);
    expect(scenarios.resetReasons).toEqual([
      'noCursor',
      'malformed',
      'formatUnsupported',
      'platformMismatch',
      'expired',
      'scopesChanged',
    ]);
  });

  for (const scenario of scenarios.scenarios as readonly Scenario[]) {
    for (const platform of scenario.platforms as readonly WorkoutsPlatform[]) {
      it(`${scenario.name} [${platform}]`, async () => {
        const fake = createFakeWorkouts({ platform, nowMs: NOW });
        const ledger: Ledger = { nativeIdByIndex: new Map(), clientIdByIndex: new Map(), next: 0 };
        const rows = new Map<string, Workout>();
        const keyByNativeId = new Map<string, string>();
        let cursor: string | null = null;

        const upsert = (workout: Workout): void => {
          const key = workout.clientId ?? workout.id;
          rows.set(key, workout);
          keyByNativeId.set(workout.id, key);
        };
        const removeById = (nativeId: string): void => {
          const key = keyByNativeId.get(nativeId);
          if (key === undefined) return;
          const current = rows.get(key);
          keyByNativeId.delete(nativeId);
          if (current !== undefined && current.id !== nativeId) return;
          rows.delete(key);
        };

        for (const step of scenario.steps) {
          switch (step.op) {
            case 'seed':
              seed(fake, ledger, step);
              break;

            case 'sync': {
              const page = await fake.api.syncWorkouts(step.cursor === null ? null : cursor);
              const wanted = step.expectByPlatform?.[platform] ?? step.expect;
              if (wanted !== undefined) {
                if (wanted.reset !== undefined) expect(page.reset, scenario.name).toBe(wanted.reset);
                if (wanted.resetReason !== undefined && page.reset) {
                  expect(page.resetReason).toBe(wanted.resetReason as CursorResetReason);
                }
                if (wanted.added !== undefined) expect(page.added.length).toBe(wanted.added);
                if (wanted.removed !== undefined) expect(page.removed.length).toBe(wanted.removed);
                if (wanted.removedReplaced !== undefined) {
                  expect(page.removed[0]?.replaced).toBe(wanted.removedReplaced);
                }
                if (wanted.hasMore !== undefined) expect(page.hasMore).toBe(wanted.hasMore);
              }
              for (const workout of page.added) upsert(workout);
              for (const entry of page.removed) removeById(entry.id);
              cursor = page.cursor;
              break;
            }

            case 'backfill': {
              let pageToken: string | undefined;
              let pages = 0;
              let items = 0;
              for (;;) {
                const backfill = await fake.api.listWorkouts({
                  fromMs: HORIZON,
                  toMs: Number.MAX_SAFE_INTEGER,
                  ...(pageToken === undefined ? {} : { pageToken }),
                });
                pages += 1;
                items += backfill.items.length;
                for (const workout of backfill.items) upsert(workout);
                pageToken = backfill.nextPageToken;
                if (pageToken === undefined) break;
              }
              if (step.expect?.added !== undefined) expect(items).toBe(step.expect.added);
              const wanted = step.expect as { pages?: number; items?: number } | undefined;
              if (wanted?.pages !== undefined) expect(pages).toBe(wanted.pages);
              if (wanted?.items !== undefined) expect(items, scenario.name).toBe(wanted.items);
              break;
            }

            case 'replace': {
              const index = step.index ?? 0;
              const current = ledger.nativeIdByIndex.get(index);
              if (current === undefined) throw new Error(`replace: unknown index ${String(index)}`);
              ledger.nativeIdByIndex.set(index, fake.replaceWorkout(current, { kind: 'cycling' }));
              break;
            }

            case 'remove': {
              const current = ledger.nativeIdByIndex.get(step.index ?? 0);
              if (current !== undefined) fake.removeWorkout(current);
              break;
            }

            case 'purgeDeletion': {
              const current = ledger.nativeIdByIndex.get(step.index ?? 0);
              if (current !== undefined) fake.purgeDeletion(current);
              break;
            }

            case 'noOpUpsertion': {
              const current = ledger.nativeIdByIndex.get(step.index ?? 0);
              if (current !== undefined) fake.emitNoOpUpsertion(current);
              break;
            }

            case 'expireCursor':
              fake.expireCursor((step.reason ?? 'expired') as CursorResetReason);
              break;

            case 'changeScopes':
              fake.expireCursor('scopesChanged');
              break;

            case 'corruptCursor': {
              if (cursor === null) throw new Error('corruptCursor before any cursor');
              cursor = corruptCursor(cursor, (step.reason ?? 'malformed') as CursorResetReason);
              break;
            }

            case 'kill': {
              // 한 번 더 sync하되 **아무것도 커밋하지 않는다**. 커서는 그대로다.
              await fake.api.syncWorkouts(cursor);
              break;
            }

            default:
              throw new Error(`unknown op: ${step.op}`);
          }
        }

        if (scenario.finalStore !== undefined) {
          const expected = scenario.finalStore
            .map((index) => ledger.clientIdByIndex.get(index) ?? ledger.nativeIdByIndex.get(index) ?? '')
            .sort();
          expect([...rows.keys()].sort(), scenario.name).toEqual(expected);
        }
      });
    }
  }
});
