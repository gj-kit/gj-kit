import { randomUUID } from 'node:crypto';
import type { JobRunStore, JobTrigger } from '../core/store';
import type { StoredJobRun } from './memory-store';

/**
 * S1–S7 의무의 실행 가능한 형태. 스키마를 소유하지 않는 대가 — 호스트 구현이 계약을
 * 어겨도 라이브러리가 모른다 — 를 **호스트의 테스트 스위트 안에서** 닫는 장치다.
 */

export type JobRunStoreObligation = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';

export interface JobRunStoreContractCase {
  /** e.g. `'S1: a second claim on the same overlap key returns null'`. */
  readonly name: string;
  readonly obligation: JobRunStoreObligation;
  /** Throws with a message naming the violated obligation. */
  readonly run: (store: JobRunStore) => Promise<void>;
}

export interface JobRunStoreContractOptions {
  /** Skip cases an implementation legitimately cannot support, with a reason. */
  readonly skip?: readonly JobRunStoreObligation[] | undefined;
  /**
   * Read one row back. `JobRunStore` has no reader, so the cases that can only
   * be observed through stored values — S6's recorded timestamps, S7's JSON
   * round trip — are omitted unless a host supplies this. Everything else,
   * including all of S1-S4, is observable through the port alone.
   */
  readonly inspect?: ((runId: string) => Promise<StoredJobRun | undefined>) | undefined;
  /**
   * How many concurrent calls the S1 burst case issues. Defaults to 8. The host
   * must point this suite at a connection pool of at least 2: a single-connection
   * client serialises the burst and hides a non-atomic claim.
   */
  readonly concurrency?: number | undefined;
}

const TRIGGER: JobTrigger = { source: 'SCHEDULER', triggeredBy: null };
const T0 = 1_700_000_000_000;

function fail(obligation: JobRunStoreObligation, message: string): never {
  throw new Error(`[JobRunStore ${obligation}] ${message}`);
}

async function claimOrFail(
  store: JobRunStore,
  obligation: JobRunStoreObligation,
  jobKey: string,
  overlapKey: string,
  startedAt = T0,
): Promise<string> {
  const claim = await store.claim({ jobKey, overlapKey, trigger: TRIGGER, input: null, startedAt });
  if (claim === null) {
    fail(obligation, `claim("${overlapKey}") returned null on a key no RUNNING row holds.`);
  }
  return claim.runId;
}

/**
 * The executable form of the S1-S7 obligations. Deliberately framework-free:
 * it returns cases instead of calling `describe`/`it`, so a host can drive them
 * from vitest, jest or `node:test` without this package depending on any of them.
 *
 * **Safe against a persistent store.** Every call mints a fresh key namespace and
 * prefixes every `jobKey`/`overlapKey` with it, and every reap the cases issue is
 * scoped to that namespace. So one shared store instance can drive the whole
 * array, the same table can be reused across CI runs without truncation, and no
 * case can move a row belonging to a job this suite never touched. Rows the
 * cases leave behind are inert: a later call uses different keys.
 *
 * ```ts
 * for (const testCase of jobRunStoreContractCases()) {
 *   it(testCase.name, async () => { await testCase.run(appStore); });
 * }
 * ```
 */
export function jobRunStoreContractCases(
  options?: JobRunStoreContractOptions,
): readonly JobRunStoreContractCase[] {
  const skip = new Set(options?.skip ?? []);
  const inspect = options?.inspect;
  const concurrency = options?.concurrency ?? 8;
  // 호출마다 새 네임스페이스 — 케이스가 남기는 RUNNING 행이 다음 실행의 claim을
  // 막지 못하게 하고, 실패 메시지가 호스트 스키마를 억울하게 지목하지 못하게 한다.
  // `domain.action` 형태를 유지해 키 컬럼 제약이 있는 구현에서도 그대로 쓰인다.
  const namespace = `contract-${randomUUID().replace(/-/gu, '').slice(0, 12)}`;
  const key = (name: string): string => `${namespace}.${name}`;

  const cases: JobRunStoreContractCase[] = [
    {
      obligation: 'S1',
      name: `S1: a burst of ${concurrency} concurrent claims on one overlap key yields exactly one winner`,
      run: async (store) => {
        const results = await Promise.all(
          Array.from({ length: concurrency }, () =>
            store.claim({
              jobKey: key('burst'),
              overlapKey: key('burst'),
              trigger: TRIGGER,
              input: null,
              startedAt: T0,
            }),
          ),
        );
        const winners = results.filter((result) => result !== null);
        if (winners.length !== 1) {
          fail(
            'S1',
            `${winners.length} of ${concurrency} concurrent claims succeeded, expected exactly 1. Either there is no partial unique index on the overlap key (WHERE status = 'RUNNING'), or claim is not an atomic compare-and-set. Point this suite at a pool of at least 2 connections — a single-connection client serialises the burst and hides the defect.`,
          );
        }
      },
    },
    {
      obligation: 'S1',
      name: 'S1: the overlap key is free again once the run is settled',
      run: async (store) => {
        const runId = await claimOrFail(store, 'S1', key('reclaim'), key('reclaim'));
        await store.complete({
          runId,
          status: 'SUCCEEDED',
          finishedAt: T0 + 10,
          durationMs: 10,
        });
        const second = await store.claim({
          jobKey: key('reclaim'),
          overlapKey: key('reclaim'),
          trigger: TRIGGER,
          input: null,
          startedAt: T0 + 20,
        });
        if (second === null) {
          fail(
            'S1',
            'the overlap key was still held after the first run settled. Check that the unique index is PARTIAL (WHERE status = \'RUNNING\'): a plain unique index lets the first row hold the key forever, and every later trigger is reported as a green SKIPPED.',
          );
        }
      },
    },
    {
      obligation: 'S1',
      name: 'S1: distinct overlap keys do not block one another',
      run: async (store) => {
        await claimOrFail(store, 'S1', key('allow'), `${key('allow')}#1`);
        await claimOrFail(store, 'S1', key('allow'), `${key('allow')}#2`);
      },
    },
    {
      obligation: 'S2',
      name: 'S2: a heartbeat on a settled run writes nothing and answers false',
      run: async (store) => {
        const runId = await claimOrFail(store, 'S2', key('beat'), key('beat'));
        await store.complete({ runId, status: 'SUCCEEDED', finishedAt: T0 + 5, durationMs: 5 });
        const alive = await store.heartbeat({ runId, progress: { processed: 99 } });
        if (alive) fail('S2', 'heartbeat returned true for a run that is no longer RUNNING.');
      },
    },
    {
      obligation: 'S2',
      name: 'S2: an accepted heartbeat advances the liveness watermark and never rewinds it',
      run: async (store) => {
        const runId = await claimOrFail(store, 'S2', key('beat2'), key('beat2'));
        const first = await store.heartbeat({ runId });
        if (!first) fail('S2', 'heartbeat returned false for a RUNNING run.');
        const second = await store.heartbeat({ runId, progress: { processed: 1 } });
        if (!second) fail('S2', 'the second heartbeat returned false for a RUNNING run.');
        const reaped = await store.reapStale({
          staleAfterMs: 3_600_000,
          overlapKey: key('beat2'),
        });
        if (reaped !== 0) {
          fail(
            'S2',
            `a run heartbeaten twice was reaped under a one-hour budget (${reaped} rows). The watermark moved backwards or was never advanced.`,
          );
        }
      },
    },
    {
      obligation: 'S3',
      name: 'S3: completing twice writes once and answers false the second time',
      run: async (store) => {
        const runId = await claimOrFail(store, 'S3', key('done'), key('done'));
        const first = await store.complete({
          runId,
          status: 'SUCCEEDED',
          finishedAt: T0 + 7,
          durationMs: 7,
        });
        if (!first) fail('S3', 'the first complete() on a RUNNING run returned false.');
        const second = await store.complete({
          runId,
          status: 'FAILED',
          finishedAt: T0 + 9,
          durationMs: 9,
          error: 'second write must not land',
        });
        if (second) {
          fail('S3', 'complete() overwrote a terminal row. Add WHERE status = \'RUNNING\'.');
        }
      },
    },
    {
      obligation: 'S3',
      name: 'S3: a run the reaper already settled refuses a late completion',
      run: async (store) => {
        const runId = await claimOrFail(store, 'S3', key('reaped'), key('reaped'));
        const reaped = await store.reapStale({ staleAfterMs: 0, overlapKey: key('reaped') });
        if (reaped !== 1) fail('S3', `reapStale should have moved 1 row, moved ${reaped}.`);
        const late = await store.complete({
          runId,
          status: 'SUCCEEDED',
          finishedAt: T0 + 11,
          durationMs: 11,
        });
        if (late) {
          fail('S3', 'a late completion overwrote a row the reaper had already settled.');
        }
      },
    },
    {
      obligation: 'S4',
      name: 'S4: two concurrent reaps of three stale rows report three moves in total',
      run: async (store) => {
        for (const suffix of ['a', 'b', 'c']) {
          await claimOrFail(store, 'S4', key('sweep'), `${key('sweep')}#${suffix}`);
        }
        const [left, right] = await Promise.all([
          store.reapStale({ staleAfterMs: 0, jobKey: key('sweep') }),
          store.reapStale({ staleAfterMs: 0, jobKey: key('sweep') }),
        ]);
        if (left + right !== 3) {
          fail(
            'S4',
            `two concurrent reaps reported ${left} + ${right} = ${left + right} moves for 3 stale rows. Select and update in ONE statement with FOR UPDATE SKIP LOCKED; a SELECT followed by a separate UPDATE double-counts.`,
          );
        }
      },
    },
    {
      obligation: 'S4',
      name: 'S4: a fresh RUNNING row survives a generous liveness budget',
      run: async (store) => {
        await claimOrFail(store, 'S4', key('fresh'), key('fresh'));
        // 범위를 반드시 건다. 범위 없는 reap는 호스트의 실제 데이터베이스에서 이 스위트가
        // 건드린 적 없는 잡의 한 시간 넘은 RUNNING 행까지 전부 TIMED_OUT으로 옮긴다.
        const reaped = await store.reapStale({ staleAfterMs: 3_600_000, jobKey: key('fresh') });
        if (reaped !== 0) fail('S4', `a fresh RUNNING row was reaped (${reaped} rows).`);
      },
    },
    {
      obligation: 'S4',
      name: 'S4: reap narrowed to one overlap key leaves other keys alone',
      run: async (store) => {
        await claimOrFail(store, 'S4', key('narrow'), `${key('narrow')}#kept`);
        await claimOrFail(store, 'S4', key('narrow'), `${key('narrow')}#swept`);
        const reaped = await store.reapStale({
          staleAfterMs: 0,
          overlapKey: `${key('narrow')}#swept`,
        });
        if (reaped !== 1) fail('S4', `overlapKey-scoped reap moved ${reaped} rows, expected 1.`);
        const blocked = await store.claim({
          jobKey: key('narrow'),
          overlapKey: `${key('narrow')}#kept`,
          trigger: TRIGGER,
          input: null,
          startedAt: T0 + 1,
        });
        if (blocked !== null) fail('S4', 'the untargeted key was reaped as collateral.');
      },
    },
    {
      obligation: 'S4',
      name: 'S4: limit caps how many rows one reap may move',
      run: async (store) => {
        await claimOrFail(store, 'S4', key('limit'), `${key('limit')}#1`);
        await claimOrFail(store, 'S4', key('limit'), `${key('limit')}#2`);
        const reaped = await store.reapStale({
          staleAfterMs: 0,
          jobKey: key('limit'),
          limit: 1,
        });
        if (reaped !== 1) fail('S4', `reap with limit 1 moved ${reaped} rows.`);
      },
    },
    {
      obligation: 'S5',
      name: 'S5: every claimed and skipped run gets a distinct id',
      run: async (store) => {
        const first = await claimOrFail(store, 'S5', key('ids'), `${key('ids')}#1`);
        const second = await claimOrFail(store, 'S5', key('ids'), `${key('ids')}#2`);
        const skipped = await store.recordSkipped({
          jobKey: key('ids'),
          trigger: TRIGGER,
          input: null,
          at: T0,
          reason: 'overlap',
        });
        const ids = new Set([first, second, skipped.runId]);
        if (ids.size !== 3) fail('S5', 'run ids repeated across three runs.');
      },
    },
    {
      obligation: 'S6',
      name: 'S6: claim initialises the liveness watermark from the store clock',
      run: async (store) => {
        await claimOrFail(store, 'S6', key('live'), key('live'));
        const reaped = await store.reapStale({ staleAfterMs: 0, overlapKey: key('live') });
        if (reaped !== 1) {
          fail(
            'S6',
            `reapStale({ staleAfterMs: 0 }) moved ${reaped} rows right after a claim, expected 1. A null liveness watermark compares as NULL, is never reapable, and holds the overlap key forever — initialise it in the claim statement (heartbeat_at NOT NULL DEFAULT now()).`,
          );
        }
        const second = await store.claim({
          jobKey: key('live'),
          overlapKey: key('live'),
          trigger: TRIGGER,
          input: null,
          startedAt: T0 + 1,
        });
        if (second === null) fail('S6', 'the overlap key stayed held after its row was reaped.');
      },
    },
  ];

  if (inspect !== undefined) {
    cases.push(
      {
        obligation: 'S6',
        name: 'S6: recording instants are stored verbatim from the runner clock',
        run: async (store) => {
          const startedAt = T0 + 12_345;
          const runId = await claimOrFail(
            store,
            'S6',
            key('stamps'),
            key('stamps'),
            startedAt,
          );
          await store.complete({
            runId,
            status: 'SUCCEEDED',
            finishedAt: startedAt + 250,
            durationMs: 250,
          });
          const row = await inspect(runId);
          if (row === undefined) fail('S6', 'inspect() could not read back a completed run.');
          if (row.startedAt !== startedAt || row.finishedAt !== startedAt + 250) {
            fail(
              'S6',
              `recording instants were rewritten by the store clock: startedAt=${String(row.startedAt)}, finishedAt=${String(row.finishedAt)}, expected ${startedAt} and ${startedAt + 250}. Bind them as parameters instead of using now().`,
            );
          }
        },
      },
      {
        obligation: 'S7',
        name: 'S7: input and summary survive a JSON round trip',
        run: async (store) => {
          const input = { limit: 10, nested: { flag: true, list: [1, 2, 3] } };
          const summary = { ok: true, processed: 3 };
          const claim = await store.claim({
            jobKey: key('json'),
            overlapKey: key('json'),
            trigger: TRIGGER,
            input,
            startedAt: T0,
          });
          if (claim === null) fail('S7', 'claim returned null on a free overlap key.');
          await store.complete({
            runId: claim.runId,
            status: 'SUCCEEDED',
            finishedAt: T0 + 1,
            durationMs: 1,
            summary,
          });
          const row = await inspect(claim.runId);
          if (row === undefined) fail('S7', 'inspect() could not read back a completed run.');
          if (JSON.stringify(row.input) !== JSON.stringify(input)) {
            fail('S7', 'the stored input did not round-trip.');
          }
          if (JSON.stringify(row.summary) !== JSON.stringify(summary)) {
            fail('S7', 'the stored summary did not round-trip.');
          }
        },
      },
      {
        obligation: 'S7',
        name: 'S7: a value that cannot be stored raises instead of being dropped',
        run: async (store) => {
          const cyclic: Record<string, unknown> = {};
          cyclic.self = cyclic;
          let raised = false;
          try {
            await store.claim({
              jobKey: key('cyclic'),
              overlapKey: key('cyclic'),
              trigger: TRIGGER,
              input: cyclic,
              startedAt: T0,
            });
          } catch {
            raised = true;
          }
          if (!raised) {
            fail('S7', 'a non-serialisable input was accepted silently instead of raising.');
          }
        },
      },
    );
  }

  return cases.filter((testCase) => !skip.has(testCase.obligation));
}
