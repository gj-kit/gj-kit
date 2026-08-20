/**
 * §3.6 audit_entries — fire-and-forget sink와 flush.
 *
 * 코어 AuditSink 계약: record의 반환 Promise는 코어가 await하지 않고, sync throw·async
 * rejection 모두 코어가 삼켜 onSinkError로만 통지한다. 따라서 이 구현의 계약은
 * ① insert 실패가 반환 Promise의 rejection으로 전파될 것(코어 통지 경로 유지)
 * ② flush()는 in-flight insert의 정착을 기다리되 실패에 깨지지 않을 것 — 둘이다.
 */
import { describe, expect, it } from 'vitest';

import { createPgAuditSink } from '../../src/stores/audit';
import { createFakeSql, deferred, norm } from './helpers/fake-sql';
import { makeAuditEntry } from './helpers/fixtures';
import type { SqlRow } from '../../src/sql';

describe('§3.6 record — 즉시 INSERT + 멱등', () => {
  it('ON CONFLICT (id) DO NOTHING INSERT 1문 — 동일 id 재호출 멱등의 근거', async () => {
    const fake = createFakeSql();
    const sink = createPgAuditSink(fake);
    const entry = makeAuditEntry();

    await sink.record(entry);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".audit_entries');
    expect(text).toContain('ON CONFLICT (id) DO NOTHING');
    expect(fake.calls[0]?.params).toEqual([
      entry.id,
      entry.at,
      entry.env,
      entry.method,
      entry.path,
      entry.attempt,
      entry.idempotencyKey,
      entry.traceId,
      entry.durationMs,
      entry.outcome.kind, // 조회 컬럼용 발췌
      JSON.stringify(entry), // entry 통짜 보존 (redaction은 코어가 이미 통과시킴)
    ]);
  });

  it('insert 실패는 반환 Promise의 rejection으로 전파된다(코어 onSinkError 경로)', async () => {
    const fake = createFakeSql();
    const driverError = new Error('insert 실패');
    fake.enqueueError(driverError);
    const sink = createPgAuditSink(fake);

    await expect(sink.record(makeAuditEntry())).rejects.toBe(driverError);
  });
});

describe('§3.6 flush — in-flight 완료 대기', () => {
  it('진행 중인 insert가 정착할 때까지 resolve하지 않는다', async () => {
    const fake = createFakeSql();
    const gate = deferred<readonly SqlRow[]>();
    fake.enqueuePromise(gate.promise);
    const sink = createPgAuditSink(fake);

    const recordPromise = sink.record(makeAuditEntry());
    let flushed = false;
    const flushPromise = sink.flush().then(() => {
      flushed = true;
    });

    // 마이크로태스크를 여러 턴 소진해도 gate가 열리기 전엔 flush가 끝나면 안 된다
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(flushed).toBe(false);

    gate.resolve([]);
    await flushPromise;
    expect(flushed).toBe(true);
    await recordPromise; // 정착 확인 (rejection 아님)
  });

  it('flush 도중 시작된 record도 기다린다(빌 때까지 반복)', async () => {
    const fake = createFakeSql();
    const firstGate = deferred<readonly SqlRow[]>();
    const secondGate = deferred<readonly SqlRow[]>();
    fake.enqueuePromise(firstGate.promise);
    fake.enqueuePromise(secondGate.promise);
    const sink = createPgAuditSink(fake);

    const first = sink.record(makeAuditEntry({ id: 'audit-0001' }));
    let flushed = false;
    const flushPromise = sink.flush().then(() => {
      flushed = true;
    });

    // 첫 insert가 아직 in-flight인 동안 두 번째 record가 시작된다
    const second = sink.record(makeAuditEntry({ id: 'audit-0002' }));
    firstGate.resolve([]);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
    expect(flushed).toBe(false); // 두 번째가 아직 정착하지 않았다

    secondGate.resolve([]);
    await flushPromise;
    expect(flushed).toBe(true);
    await Promise.all([first, second]);
  });

  it('record 실패는 flush를 깨지 않는다(allSettled — 실패 통지는 onSinkError 소관)', async () => {
    const fake = createFakeSql();
    fake.enqueueError(new Error('insert 실패'));
    fake.enqueueRows([]);
    const sink = createPgAuditSink(fake);

    const failing = sink.record(makeAuditEntry({ id: 'audit-fail' }));
    // 코어가 삼키는 역할의 대역 — unhandled rejection 방지. AuditSink.record의 선언 타입이
    // `void | Promise<void>`(코어 계약)라 .catch 직접 호출은 타입 불가 → Promise.resolve로 승격.
    void Promise.resolve(failing).catch(() => undefined);
    const succeeding = sink.record(makeAuditEntry({ id: 'audit-ok' }));

    await expect(sink.flush()).resolves.toBeUndefined();
    await expect(failing).rejects.toThrow('insert 실패');
    await succeeding;
  });

  it('in-flight가 없으면 즉시 resolve한다', async () => {
    const fake = createFakeSql();
    const sink = createPgAuditSink(fake);

    await expect(sink.flush()).resolves.toBeUndefined();
    expect(fake.calls).toHaveLength(0);
  });
});
