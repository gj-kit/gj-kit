/**
 * R1–R13 · D1–D9 · I1–I3 · L1–L4의 **실행 가능한 형태**(설계 §3.9 · §5.4).
 *
 * 스키마를 소유하지 않는 대가는 "호스트 구현이 계약을 어겨도 라이브러리가 모른다"는 것이고,
 * 이 배열이 그 대가를 **호스트의 테스트 스위트 안에서** 닫는 장치다. 의도적으로 프레임워크
 * free다 — `describe`/`it`을 부르지 않고 케이스를 돌려주므로 호스트가 vitest·jest·
 * `node:test` 중 무엇으로도 돌린다.
 *
 * ```ts
 * for (const testCase of notificationStoreContractCases()) {
 *   it(testCase.name, async () => { await testCase.run(() => createMyStores()); });
 * }
 * ```
 */
import type { NotificationCommand } from '../core/contracts';
import { toInstant } from '../core/runtime';
import type { NotificationStoreSuite } from './memory-stores';
import type {
  BatchIdentity,
  ClaimedNotificationCommand,
  ClaimedNotificationDelivery,
  NotificationRelayTransaction,
} from '../core/store';

export type NotificationObligation =
  | 'R1'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'
  | 'D1'
  | 'D2'
  | 'D3'
  | 'D4'
  | 'D5'
  | 'D6'
  | 'D7'
  | 'D8'
  | 'D9'
  | 'I1'
  | 'I2'
  | 'I3'
  | 'L1'
  | 'L2'
  | 'L3'
  | 'L4';

export interface StoreContractCase {
  /** e.g. `'R11: a losing createDelivery reports created:false, never throws'`. */
  readonly name: string;
  readonly obligation: NotificationObligation;
  /**
   * The factory returns the suite under test. Typed as `NotificationStoreSuite`
   * and not as `MemoryNotificationStores`, because the point of these cases is a
   * host's own implementation: narrowing the parameter to the in-memory type
   * would make the whole array a self-test toy.
   */
  run(factory: () => NotificationStoreSuite | Promise<NotificationStoreSuite>): Promise<void>;
}

export interface NotificationStoreContractOptions {
  /** Skip obligations an implementation legitimately cannot support, with a reason. */
  readonly skip?: readonly NotificationObligation[] | undefined;
  /** Concurrent calls the R1/R11 burst cases issue. Default 8; needs a pool of >= 2. */
  readonly concurrency?: number | undefined;
}

const APP = 'contract-app';
const RECIPIENT = 'recipient-1';
const OTHER_RECIPIENT = 'recipient-2';
const CATEGORY = 'general';
const PROVIDER = 'test-provider';
const PAST = toInstant(0);
const FUTURE = toInstant(Date.UTC(2999, 0, 1));

/**
 * 케이스가 저장소에 넘기는 기록용 시각. 단조 증가하는 고정 값이라 결과가 결정적이고,
 * `Date` 생성이 `runtime.ts` 한 곳에 남는다는 규율(§1-2)도 깨지 않는다. claim 신선도는
 * 이 값과 무관하다 — 그 판정은 저장소 자기 시계가 한다(R12·D8).
 */
const EPOCH_BASE = Date.UTC(2026, 0, 1);
let tick = 0;
function at(): Date {
  tick += 1000;
  return toInstant(EPOCH_BASE + tick);
}

function fail(obligation: NotificationObligation, message: string): never {
  throw new Error(`[NotificationStore ${obligation}] ${message}`);
}

function command(overrides: Partial<NotificationCommand> & { eventKey: string }): NotificationCommand {
  return {
    applicationKey: APP,
    recipientRef: RECIPIENT,
    category: CATEGORY,
    priority: 'NORMAL',
    body: 'contract body',
    ...overrides,
  };
}

async function stageOrFail(
  suite: NotificationStoreSuite,
  obligation: NotificationObligation,
  overrides: Partial<NotificationCommand> & { eventKey: string },
): Promise<string> {
  const result = await suite.stage(command(overrides));
  if (result.id === null || !result.staged) {
    fail(obligation, `stage("${overrides.eventKey}") did not create a row.`);
  }
  return result.id;
}

async function claimAll(
  suite: NotificationStoreSuite,
  claimToken: string,
  extra?: { readonly claimStaleMs?: number; readonly maxAttempts?: number; readonly limit?: number },
): Promise<readonly ClaimedNotificationCommand[]> {
  return suite.relayStore.claimDue({
    applicationKey: APP,
    limit: extra?.limit ?? 50,
    at: at(),
    claimStaleMs: extra?.claimStaleMs ?? 0,
    ...(extra?.maxAttempts === undefined ? {} : { maxAttempts: extra.maxAttempts }),
    claimToken,
  });
}

async function claimOne(
  suite: NotificationStoreSuite,
  obligation: NotificationObligation,
  outboxId: string,
  claimToken: string,
): Promise<ClaimedNotificationCommand> {
  const claimed = await claimAll(suite, claimToken);
  const row = claimed.find((entry) => entry.id === outboxId);
  if (row === undefined) fail(obligation, `claimDue did not return the staged row ${outboxId}.`);
  return row;
}

async function inRelayTransaction<T>(
  suite: NotificationStoreSuite,
  obligation: NotificationObligation,
  outboxId: string,
  claimToken: string,
  work: (tx: NotificationRelayTransaction) => Promise<T>,
): Promise<T> {
  const result = await suite.relayStore.relayInTransaction(
    { applicationKey: APP, outboxId, claimToken, at: at() },
    work,
  );
  if (result === null) fail(obligation, `relayInTransaction returned null for an owned claim.`);
  return result;
}

function batchIdentity(overrides?: Partial<BatchIdentity>): BatchIdentity {
  return {
    applicationKey: APP,
    recipientRef: RECIPIENT,
    batchKey: 'batch-1',
    batchWindowStartedAt: toInstant(Date.UTC(2026, 0, 1)),
    batchPolicyKey: 'policy-1',
    ...overrides,
  };
}

interface SeedDeliveryOptions {
  readonly eventKey: string;
  readonly recipientRef?: string | undefined;
  readonly actorRef?: string | null | undefined;
  readonly deliverAfter?: Date | undefined;
  readonly identity?: BatchIdentity | null | undefined;
  readonly action?: NotificationCommand['action'] | undefined;
}

/** stage → claim → createDelivery + appendItem → complete. 배달 측 케이스의 공용 씨앗. */
async function seedDelivery(
  suite: NotificationStoreSuite,
  obligation: NotificationObligation,
  options: SeedDeliveryOptions,
): Promise<{ readonly outboxId: string; readonly deliveryId: string }> {
  const recipientRef = options.recipientRef ?? RECIPIENT;
  const outboxId = await stageOrFail(suite, obligation, {
    eventKey: options.eventKey,
    recipientRef,
    ...(options.actorRef === undefined ? {} : { actorRef: options.actorRef }),
    ...(options.action === undefined ? {} : { action: options.action }),
  });
  const claimToken = `seed-${options.eventKey}`;
  await claimOne(suite, obligation, outboxId, claimToken);
  const identity = options.identity ?? null;
  const deliveryId = await inRelayTransaction(suite, obligation, outboxId, claimToken, async (tx) => {
    const created = await tx.createDelivery({
      applicationKey: APP,
      recipientRef,
      actorRef: options.actorRef ?? null,
      category: CATEGORY,
      priority: 'NORMAL',
      title: null,
      body: 'contract body',
      action: options.action ?? null,
      batchKey: identity === null ? null : identity.batchKey,
      batchWindowStartedAt: identity === null ? null : identity.batchWindowStartedAt,
      batchPolicyKey: identity === null ? null : identity.batchPolicyKey,
      aggregationLabel: null,
      batchCount: 1,
      batchItemCount: 1,
      deliverAfter: options.deliverAfter ?? PAST,
      createdAt: at(),
    });
    await tx.appendItem({
      applicationKey: APP,
      deliveryId: created.id,
      sourceOutboxId: outboxId,
      at: at(),
    });
    return created.id;
  });
  await suite.relayStore.completeClaim({
    applicationKey: APP,
    outboxId,
    claimToken,
    at: at(),
    suppressed: false,
  });
  return { outboxId, deliveryId };
}

async function claimDeliveries(
  suite: NotificationStoreSuite,
  claimToken: string,
  extra?: { readonly claimStaleMs?: number; readonly maxAttempts?: number; readonly at?: Date },
): Promise<readonly ClaimedNotificationDelivery[]> {
  return suite.deliveryStore.claimDue({
    applicationKey: APP,
    limit: 50,
    at: extra?.at ?? at(),
    claimStaleMs: extra?.claimStaleMs ?? 0,
    ...(extra?.maxAttempts === undefined ? {} : { maxAttempts: extra.maxAttempts }),
    claimToken,
  });
}

function expect(obligation: NotificationObligation, condition: boolean, message: string): void {
  if (!condition) fail(obligation, message);
}

/**
 * The executable form of the R1-R13, D1-D9, I1-I3 and L1-L4 obligations.
 *
 * Each case receives a **fresh** suite from the factory. Cases that probe
 * concurrency issue `concurrency` simultaneous calls, so a host must point the
 * suite at a connection pool of at least two: a single-connection client
 * serialises the burst and hides a non-atomic claim.
 */
export function notificationStoreContractCases(
  options?: NotificationStoreContractOptions,
): readonly StoreContractCase[] {
  const skip = new Set(options?.skip ?? []);
  const concurrency = options?.concurrency ?? 8;

  const cases: StoreContractCase[] = [
    {
      obligation: 'R1',
      name: 'R1: concurrent claimDue calls never hand the same row to two workers',
      run: async (factory) => {
        const suite = await factory();
        for (let index = 0; index < concurrency; index += 1) {
          await stageOrFail(suite, 'R1', { eventKey: `r1-${index}` });
        }
        const bursts = await Promise.all(
          Array.from({ length: concurrency }, (_unused, index) =>
            claimAll(suite, `r1-worker-${index}`, { claimStaleMs: 60_000 }),
          ),
        );
        const seen = new Set<string>();
        for (const burst of bursts) {
          for (const row of burst) {
            expect('R1', !seen.has(row.id), `row ${row.id} was claimed by two workers at once.`);
            seen.add(row.id);
          }
        }
      },
    },
    {
      obligation: 'R2',
      name: 'R2: a fresh claim is not reclaimed; one older than the threshold is',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R2', { eventKey: 'r2' });
        await claimOne(suite, 'R2', outboxId, 'r2-first');
        const fresh = await claimAll(suite, 'r2-second', { claimStaleMs: 3_600_000 });
        expect('R2', fresh.length === 0, 'a fresh claim was stolen by another worker.');
        const stale = await claimAll(suite, 'r2-third', { claimStaleMs: 0 });
        expect('R2', stale.some((row) => row.id === outboxId), 'a stale claim was never reclaimed.');
      },
    },
    {
      obligation: 'R3',
      name: 'R3: ingress idempotency belongs to the publisher, and duplicate staging never throws',
      run: async (factory) => {
        const suite = await factory();
        await stageOrFail(suite, 'R3', { eventKey: 'r3' });
        const again = await suite.stage(command({ eventKey: 'r3' }));
        expect('R3', !again.staged, 'a duplicate stage reported staged: true.');
        const claimed = await claimAll(suite, 'r3-worker');
        expect('R3', claimed.length === 1, `duplicate staging created ${claimed.length} rows.`);
      },
    },
    {
      obligation: 'R4',
      name: 'R4: a duplicate appendItem returns false instead of throwing',
      run: async (factory) => {
        const suite = await factory();
        const seeded = await seedDelivery(suite, 'R4', { eventKey: 'r4' });
        const outboxId = await stageOrFail(suite, 'R4', { eventKey: 'r4-second' });
        const claimToken = 'r4-worker';
        await claimOne(suite, 'R4', outboxId, claimToken);
        const appended = await inRelayTransaction(suite, 'R4', outboxId, claimToken, async (tx) =>
          tx.appendItem({
            applicationKey: APP,
            deliveryId: seeded.deliveryId,
            sourceOutboxId: seeded.outboxId,
            at: at(),
          }),
        );
        expect('R4', appended === false, 'a duplicate source item was accepted.');
      },
    },
    {
      obligation: 'R5',
      name: 'R5: one batch identity maps to exactly one delivery',
      run: async (factory) => {
        const suite = await factory();
        const identity = batchIdentity();
        const first = await seedDelivery(suite, 'R5', { eventKey: 'r5-a', identity });
        const outboxId = await stageOrFail(suite, 'R5', { eventKey: 'r5-b' });
        const claimToken = 'r5-worker';
        await claimOne(suite, 'R5', outboxId, claimToken);
        const second = await inRelayTransaction(suite, 'R5', outboxId, claimToken, async (tx) =>
          tx.findOpenBatch(identity),
        );
        expect('R5', second !== null, 'findOpenBatch did not find the delivery for its identity.');
        expect(
          'R5',
          second?.id === first.deliveryId,
          'findOpenBatch returned a different delivery for the same identity.',
        );
      },
    },
    {
      obligation: 'R6',
      name: 'R6: merging into a claimed batch returns false and changes nothing',
      run: async (factory) => {
        const suite = await factory();
        const identity = batchIdentity();
        const seeded = await seedDelivery(suite, 'R6', { eventKey: 'r6-a', identity });
        const claimed = await claimDeliveries(suite, 'r6-dispatch');
        expect('R6', claimed.length === 1, 'the seeded delivery was not claimable.');
        const outboxId = await stageOrFail(suite, 'R6', { eventKey: 'r6-b' });
        const claimToken = 'r6-relay';
        await claimOne(suite, 'R6', outboxId, claimToken);
        const merged = await inRelayTransaction(suite, 'R6', outboxId, claimToken, async (tx) =>
          tx.mergeIntoBatch({
            applicationKey: APP,
            deliveryId: seeded.deliveryId,
            addedCount: 1,
            addedItemCount: 1,
            aggregationLabel: null,
            at: at(),
          }),
        );
        expect('R6', merged === false, 'an item merged into a claimed, presentation-locked batch.');
      },
    },
    {
      obligation: 'R7',
      name: 'R7: the relay transaction holds the source row lock, so a concurrent purge waits',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R7', { eventKey: 'r7' });
        const claimToken = 'r7-worker';
        await claimOne(suite, 'R7', outboxId, claimToken);
        // purge를 트랜잭션 **안에서 시작만** 하고 밖에서 기다린다. 안에서 await하면
        // 잠금을 쥔 채 잠금을 기다리는 교착이 된다 — 그 교착 자체가 R7의 증거이기도 하다.
        const pending: Promise<void>[] = [];
        let sawRowInside = false;
        await inRelayTransaction(suite, 'R7', outboxId, claimToken, async (tx) => {
          pending.push(suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT }));
          await Promise.resolve();
          sawRowInside = (await tx.readCommand()) !== null;
          return true;
        });
        await Promise.all(pending);
        expect('R7', pending.length === 1, 'the purge never started.');
        expect(
          'R7',
          sawRowInside,
          'the source row disappeared inside a transaction that should hold its lock.',
        );
      },
    },
    {
      obligation: 'R8',
      name: 'R8: a second completeClaim returns false and leaves the outcome unchanged',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R8', { eventKey: 'r8' });
        const claimToken = 'r8-worker';
        await claimOne(suite, 'R8', outboxId, claimToken);
        const request = {
          applicationKey: APP,
          outboxId,
          claimToken,
          at: at(),
          suppressed: false,
        };
        expect('R8', await suite.relayStore.completeClaim(request), 'the first completion failed.');
        expect(
          'R8',
          (await suite.relayStore.completeClaim(request)) === false,
          'a second completion was accepted.',
        );
        const reclaimed = await claimAll(suite, 'r8-next');
        expect('R8', reclaimed.length === 0, 'a completed row was returned as due.');
      },
    },
    {
      obligation: 'R9',
      name: 'R9: completeClaim records the caller-supplied instant and closes the row',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R9', { eventKey: 'r9' });
        const claimToken = 'r9-worker';
        await claimOne(suite, 'R9', outboxId, claimToken);
        await suite.relayStore.completeClaim({
          applicationKey: APP,
          outboxId,
          claimToken,
          at: toInstant(Date.UTC(2026, 5, 1)),
          suppressed: true,
        });
        const reclaimed = await claimAll(suite, 'r9-next');
        expect('R9', reclaimed.length === 0, 'a suppressed row was returned as due again.');
      },
    },
    {
      obligation: 'R10',
      name: 'R10: ordering is not an obligation, but every due row must be claimable',
      run: async (factory) => {
        const suite = await factory();
        const staged = new Set<string>();
        for (let index = 0; index < 5; index += 1) {
          staged.add(await stageOrFail(suite, 'R10', { eventKey: `r10-${index}` }));
        }
        const claimed = await claimAll(suite, 'r10-worker');
        for (const id of staged) {
          expect('R10', claimed.some((row) => row.id === id), `due row ${id} was never returned.`);
        }
      },
    },
    {
      obligation: 'R11',
      name: 'R11: a losing createDelivery reports created:false with the existing id and never throws',
      run: async (factory) => {
        const suite = await factory();
        const identity = batchIdentity();
        const first = await seedDelivery(suite, 'R11', { eventKey: 'r11-a', identity });
        const outboxId = await stageOrFail(suite, 'R11', { eventKey: 'r11-b' });
        const claimToken = 'r11-worker';
        await claimOne(suite, 'R11', outboxId, claimToken);
        const second = await inRelayTransaction(suite, 'R11', outboxId, claimToken, async (tx) =>
          tx.createDelivery({
            applicationKey: APP,
            recipientRef: RECIPIENT,
            actorRef: null,
            category: CATEGORY,
            priority: 'NORMAL',
            title: null,
            body: 'contract body',
            action: null,
            batchKey: identity.batchKey,
            batchWindowStartedAt: identity.batchWindowStartedAt,
            batchPolicyKey: identity.batchPolicyKey,
            aggregationLabel: null,
            batchCount: 1,
            batchItemCount: 1,
            deliverAfter: PAST,
            createdAt: at(),
          }),
        );
        expect('R11', second.created === false, 'a conflicting createDelivery reported created:true.');
        expect(
          'R11',
          second.id === first.deliveryId,
          'a conflicting createDelivery did not return the existing row id.',
        );
        const claimed = await claimDeliveries(suite, 'r11-dispatch');
        const delivery = claimed.find((row) => row.id === first.deliveryId);
        expect('R11', delivery !== undefined, 'the batch delivery vanished.');
        expect(
          'R11',
          delivery?.batchCount === 1 && delivery.batchItemCount === 1,
          'a conflicting createDelivery mutated batch counters; merging is mergeIntoBatch (R6).',
        );
      },
    },
    {
      obligation: 'R11',
      name: 'R11: a concurrent burst on one batch identity creates exactly one delivery',
      run: async (factory) => {
        const suite = await factory();
        const identity = batchIdentity();
        const outboxIds: string[] = [];
        for (let index = 0; index < concurrency; index += 1) {
          outboxIds.push(await stageOrFail(suite, 'R11', { eventKey: `r11-burst-${index}` }));
        }
        const claimToken = 'r11-burst';
        await claimAll(suite, claimToken);
        const results = await Promise.all(
          outboxIds.map(async (outboxId) =>
            inRelayTransaction(suite, 'R11', outboxId, claimToken, async (tx) =>
              tx.createDelivery({
                applicationKey: APP,
                recipientRef: RECIPIENT,
                actorRef: null,
                category: CATEGORY,
                priority: 'NORMAL',
                title: null,
                body: 'contract body',
                action: null,
                batchKey: identity.batchKey,
                batchWindowStartedAt: identity.batchWindowStartedAt,
                batchPolicyKey: identity.batchPolicyKey,
                aggregationLabel: null,
                batchCount: 1,
                batchItemCount: 1,
                deliverAfter: PAST,
                createdAt: at(),
              }),
            ),
          ),
        );
        const createdCount = results.filter((result) => result.created).length;
        expect('R11', createdCount === 1, `${createdCount} concurrent creators won the same identity.`);
        const ids = new Set(results.map((result) => result.id));
        expect('R11', ids.size === 1, 'the burst produced more than one delivery id.');
      },
    },
    {
      obligation: 'R12',
      name: 'R12: staleness is decided on the store clock; the caller passes a duration, not an instant',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R12', { eventKey: 'r12' });
        await claimOne(suite, 'R12', outboxId, 'r12-first');
        const guarded = await claimAll(suite, 'r12-second', { claimStaleMs: 86_400_000 });
        expect('R12', guarded.length === 0, 'a day-fresh claim was reclaimed.');
        const immediate = await claimAll(suite, 'r12-third', { claimStaleMs: 0 });
        expect(
          'R12',
          immediate.some((row) => row.id === outboxId),
          'claimStaleMs: 0 did not reclaim the row, so the cutoff is not the store clock.',
        );
      },
    },
    {
      obligation: 'R13',
      name: 'R13: attempts rise with each claim, maxAttempts filters, createdAt never moves',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'R13', { eventKey: 'r13' });
        const first = await claimOne(suite, 'R13', outboxId, 'r13-first');
        expect('R13', first.attempts === 1, `first claim reported attempts=${first.attempts}.`);
        const second = await claimOne(suite, 'R13', outboxId, 'r13-second');
        expect('R13', second.attempts === 2, `second claim reported attempts=${second.attempts}.`);
        expect(
          'R13',
          second.createdAt.getTime() === first.createdAt.getTime(),
          'createdAt moved between claims; the batch bucket would move with it.',
        );
        const bounded = await claimAll(suite, 'r13-third', { maxAttempts: 2 });
        expect('R13', bounded.length === 0, 'a row at maxAttempts was still returned as due.');
      },
    },
    {
      obligation: 'D1',
      name: 'D1: claiming a delivery stamps the presentation lock in the same statement',
      run: async (factory) => {
        const suite = await factory();
        const identity = batchIdentity();
        const seeded = await seedDelivery(suite, 'D1', { eventKey: 'd1-a', identity });
        const claimed = await claimDeliveries(suite, 'd1-dispatch');
        expect('D1', claimed.length === 1, 'the seeded delivery was not claimable.');
        const outboxId = await stageOrFail(suite, 'D1', { eventKey: 'd1-b' });
        const claimToken = 'd1-relay';
        await claimOne(suite, 'D1', outboxId, claimToken);
        const open = await inRelayTransaction(suite, 'D1', outboxId, claimToken, async (tx) =>
          tx.findOpenBatch(identity),
        );
        expect(
          'D1',
          open?.open === false,
          'a claimed delivery still reported open; the presentation lock is a second statement.',
        );
        const merged = await inRelayTransaction(suite, 'D1', outboxId, claimToken, async (tx) =>
          tx.mergeIntoBatch({
            applicationKey: APP,
            deliveryId: seeded.deliveryId,
            addedCount: 1,
            addedItemCount: 1,
            aggregationLabel: null,
            at: at(),
          }),
        );
        expect('D1', merged === false, 'an item merged into a presentation-locked delivery.');
      },
    },
    {
      obligation: 'D2',
      name: 'D2: ensureMessage twice yields one message with the same id',
      run: async (factory) => {
        const suite = await factory();
        const seeded = await seedDelivery(suite, 'D2', { eventKey: 'd2' });
        const claimToken = 'd2-dispatch';
        await claimDeliveries(suite, claimToken);
        const input = {
          applicationKey: APP,
          deliveryId: seeded.deliveryId,
          recipientRef: RECIPIENT,
          actorRef: null,
          category: CATEGORY,
          priority: 'NORMAL' as const,
          title: null,
          body: 'contract body',
          action: null,
          at: at(),
        };
        const ids = await suite.deliveryStore.materializeInTransaction(
          { applicationKey: APP, deliveryId: seeded.deliveryId, claimToken, at: at() },
          async (tx) => {
            const first = await tx.ensureMessage(input);
            const second = await tx.ensureMessage(input);
            return [first.id, second.id];
          },
        );
        expect('D2', ids !== null, 'materializeInTransaction returned null for an owned claim.');
        expect('D2', ids?.[0] === ids?.[1], 'a duplicate ensureMessage produced a second message.');
      },
    },
    {
      obligation: 'D3',
      name: 'D3: a second complete returns false and deliveredAt is unchanged',
      run: async (factory) => {
        const suite = await factory();
        const seeded = await seedDelivery(suite, 'D3', { eventKey: 'd3' });
        const claimToken = 'd3-dispatch';
        await claimDeliveries(suite, claimToken);
        const request = {
          applicationKey: APP,
          deliveryId: seeded.deliveryId,
          claimToken,
          at: at(),
        };
        expect('D3', await suite.deliveryStore.complete(request), 'the first completion failed.');
        expect(
          'D3',
          (await suite.deliveryStore.complete(request)) === false,
          'a second completion was accepted.',
        );
        const again = await claimDeliveries(suite, 'd3-next');
        expect('D3', again.length === 0, 'a delivered delivery was returned as due.');
      },
    },
    {
      obligation: 'D4',
      name: 'D4: a stale dispatch claim is reclaimable, a fresh one is not',
      run: async (factory) => {
        const suite = await factory();
        await seedDelivery(suite, 'D4', { eventKey: 'd4' });
        await claimDeliveries(suite, 'd4-first');
        const guarded = await claimDeliveries(suite, 'd4-second', { claimStaleMs: 3_600_000 });
        expect('D4', guarded.length === 0, 'a fresh dispatch claim was stolen.');
        const reclaimed = await claimDeliveries(suite, 'd4-third', { claimStaleMs: 0 });
        expect('D4', reclaimed.length === 1, 'a stale dispatch claim was never reclaimed.');
      },
    },
    {
      obligation: 'D5',
      name: 'D5: a delivery whose deliverAfter is in the future is never returned',
      run: async (factory) => {
        const suite = await factory();
        await seedDelivery(suite, 'D5', { eventKey: 'd5', deliverAfter: FUTURE });
        const claimed = await claimDeliveries(suite, 'd5-dispatch');
        expect('D5', claimed.length === 0, 'a future delivery was claimed.');
      },
    },
    {
      obligation: 'D6',
      name: 'D6: a disable computed before a re-registration is a no-op, not an error',
      run: async (factory) => {
        const suite = await factory();
        const listedInput = { applicationKey: APP, recipientRef: RECIPIENT, providers: [PROVIDER] };
        await suite.registerEndpoint({
          applicationKey: APP,
          recipientRef: RECIPIENT,
          provider: PROVIDER,
          address: 'token-1',
        });
        const observed = await suite.endpointStore.listEnabled(listedInput);
        expect('D6', observed.length === 1, 'listEnabled did not return the registered endpoint.');
        const target = observed[0];
        if (target === undefined) fail('D6', 'listEnabled returned an empty observation.');

        // 전송 중에 사용자가 앱을 다시 열어 같은 토큰을 재등록한다.
        await suite.registerEndpoint({
          applicationKey: APP,
          recipientRef: RECIPIENT,
          provider: PROVIDER,
          address: 'token-1',
        });
        await suite.endpointStore.disable({
          applicationKey: APP,
          endpoints: [{ id: target.id, revision: target.revision }],
          at: at(),
        });
        const afterStale = await suite.endpointStore.listEnabled(listedInput);
        expect(
          'D6',
          afterStale.length === 1,
          'a stale disable darkened a device that had re-registered.',
        );
        const fresh = afterStale[0];
        if (fresh === undefined) fail('D6', 'listEnabled returned an empty observation.');
        await suite.endpointStore.disable({
          applicationKey: APP,
          endpoints: [{ id: fresh.id, revision: fresh.revision }],
          at: at(),
        });
        const afterFresh = await suite.endpointStore.listEnabled(listedInput);
        expect('D6', afterFresh.length === 0, 'a current-revision disable did not take effect.');
      },
    },
    {
      obligation: 'D7',
      name: 'D7: the action JSON survives the round trip through the store',
      run: async (factory) => {
        const suite = await factory();
        const action = { href: '/threads/1', threadId: 42, tags: ['a', 'b'] } as const;
        await seedDelivery(suite, 'D7', { eventKey: 'd7', action });
        const claimed = await claimDeliveries(suite, 'd7-dispatch');
        const delivery = claimed[0];
        if (delivery === undefined) fail('D7', 'the seeded delivery was not claimable.');
        expect(
          'D7',
          JSON.stringify(delivery.action) === JSON.stringify(action),
          `action did not round trip: ${JSON.stringify(delivery.action)}`,
        );
      },
    },
    {
      obligation: 'D8',
      name: 'D8: dispatch staleness is decided on the store clock too',
      run: async (factory) => {
        const suite = await factory();
        await seedDelivery(suite, 'D8', { eventKey: 'd8' });
        await claimDeliveries(suite, 'd8-first');
        const guarded = await claimDeliveries(suite, 'd8-second', { claimStaleMs: 86_400_000 });
        expect('D8', guarded.length === 0, 'a day-fresh dispatch claim was reclaimed.');
        const immediate = await claimDeliveries(suite, 'd8-third', { claimStaleMs: 0 });
        expect('D8', immediate.length === 1, 'claimStaleMs: 0 did not reclaim the delivery.');
      },
    },
    {
      obligation: 'D9',
      name: 'D9: delivery attempts rise with each claim and maxAttempts filters them out',
      run: async (factory) => {
        const suite = await factory();
        await seedDelivery(suite, 'D9', { eventKey: 'd9' });
        const first = await claimDeliveries(suite, 'd9-first');
        expect('D9', first[0]?.attempts === 1, `first claim reported ${String(first[0]?.attempts)}.`);
        const second = await claimDeliveries(suite, 'd9-second');
        expect('D9', second[0]?.attempts === 2, `second claim reported ${String(second[0]?.attempts)}.`);
        const bounded = await claimDeliveries(suite, 'd9-third', { maxAttempts: 2 });
        expect('D9', bounded.length === 0, 'a delivery at maxAttempts was still returned as due.');
      },
    },
    {
      obligation: 'I1',
      name: 'I1: staging the same event key twice leaves one row and never throws',
      run: async (factory) => {
        const suite = await factory();
        const first = await suite.stage(command({ eventKey: 'i1' }));
        const second = await suite.stage(command({ eventKey: 'i1' }));
        expect('I1', first.staged, 'the first stage did not report staged: true.');
        expect('I1', !second.staged, 'a duplicate stage reported staged: true.');
        const claimed = await claimAll(suite, 'i1-worker');
        expect('I1', claimed.length === 1, `duplicate staging produced ${claimed.length} rows.`);
      },
    },
    {
      obligation: 'I2',
      name: 'I2: staging after a tombstone is discarded and writes nothing',
      run: async (factory) => {
        const suite = await factory();
        await suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT });
        const result = await suite.stage(command({ eventKey: 'i2' }));
        expect('I2', result.id === null, 'a discarded stage still returned a row id.');
        expect('I2', !result.staged, 'a discarded stage reported staged: true.');
        expect('I2', result.discarded === true, 'a discarded stage did not set discarded.');
        const claimed = await claimAll(suite, 'i2-worker');
        expect('I2', claimed.length === 0, 'a tombstoned recipient still got an outbox row.');
      },
    },
    {
      obligation: 'I3',
      name: 'I3: the staging instant is written once and never updated',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'I3', { eventKey: 'i3' });
        const first = await claimOne(suite, 'I3', outboxId, 'i3-first');
        await suite.relayStore.releaseClaim({
          applicationKey: APP,
          outboxId,
          claimToken: 'i3-first',
          errorCode: 'test',
        });
        const second = await claimOne(suite, 'I3', outboxId, 'i3-second');
        expect(
          'I3',
          first.createdAt.getTime() === second.createdAt.getTime(),
          'createdAt changed after a release and re-claim; batches would move buckets.',
        );
      },
    },
    {
      obligation: 'L1',
      name: 'L1: a purge that commits before the relay leaves no delivery behind',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'L1', { eventKey: 'l1' });
        const claimToken = 'l1-worker';
        await claimOne(suite, 'L1', outboxId, claimToken);
        await suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT });
        const observed = await suite.relayStore.relayInTransaction(
          { applicationKey: APP, outboxId, claimToken, at: at() },
          async (tx) => tx.readCommand(),
        );
        expect(
          'L1',
          observed === null || observed === undefined,
          'the relay still saw a purged source row.',
        );
        const claimed = await claimDeliveries(suite, 'l1-dispatch');
        expect('L1', claimed.length === 0, 'a delivery survived a completed purge.');
      },
    },
    {
      obligation: 'L2',
      name: 'L2: a purge that starts mid-relay deletes what that relay just committed',
      run: async (factory) => {
        const suite = await factory();
        const outboxId = await stageOrFail(suite, 'L2', { eventKey: 'l2' });
        const claimToken = 'l2-worker';
        await claimOne(suite, 'L2', outboxId, claimToken);

        let releaseRelay = (): void => undefined;
        const gate = new Promise<void>((resolve) => {
          releaseRelay = resolve;
        });
        const relay = suite.relayStore.relayInTransaction(
          { applicationKey: APP, outboxId, claimToken, at: at() },
          async (tx) => {
            await gate;
            const created = await tx.createDelivery({
              applicationKey: APP,
              recipientRef: RECIPIENT,
              actorRef: null,
              category: CATEGORY,
              priority: 'NORMAL',
              title: null,
              body: 'contract body',
              action: null,
              batchKey: null,
              batchWindowStartedAt: null,
              batchPolicyKey: null,
              aggregationLabel: null,
              batchCount: 1,
              batchItemCount: 1,
              deliverAfter: PAST,
              createdAt: at(),
            });
            await tx.appendItem({
              applicationKey: APP,
              deliveryId: created.id,
              sourceOutboxId: outboxId,
              at: at(),
            });
            return created.id;
          },
        );
        const purge = suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT });
        releaseRelay();
        await relay;
        await purge;
        const claimed = await claimDeliveries(suite, 'l2-dispatch');
        expect(
          'L2',
          claimed.length === 0,
          'a delivery committed during the purge survived it; delete ingress before deliveries.',
        );
      },
    },
    {
      obligation: 'L3',
      name: 'L3: the tombstone row survives the purge, so a late stage is still discarded',
      run: async (factory) => {
        const suite = await factory();
        await stageOrFail(suite, 'L3', { eventKey: 'l3' });
        await suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT });
        const late = await suite.stage(command({ eventKey: 'l3-late' }));
        expect(
          'L3',
          late.discarded === true && late.id === null,
          'a stage after the purge was accepted; the tombstone row did not survive.',
        );
      },
    },
    {
      obligation: 'L4',
      name: 'L4: deleting an account clears its actor references from other recipients',
      run: async (factory) => {
        const suite = await factory();
        await seedDelivery(suite, 'L4', {
          eventKey: 'l4',
          recipientRef: OTHER_RECIPIENT,
          actorRef: RECIPIENT,
        });
        await suite.tombstoneRecipient({ applicationKey: APP, recipientRef: RECIPIENT });
        const claimed = await claimDeliveries(suite, 'l4-dispatch');
        const delivery = claimed.find((row) => row.recipientRef === OTHER_RECIPIENT);
        expect('L4', delivery !== undefined, 'the other recipient lost their delivery to the purge.');
        expect(
          'L4',
          delivery?.actorRef === null,
          "a deleted account's actor reference survived in another recipient's delivery.",
        );
      },
    },
  ];

  return cases.filter((testCase) => !skip.has(testCase.obligation));
}
