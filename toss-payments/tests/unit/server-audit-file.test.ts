/**
 * §3.2 createFileAuditSink — Promise 체이닝 직렬화 큐(순서 보존), 지연 node:fs 로드,
 * flush/close, 실패 시 큐 생존.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AuditEntry } from '../../src/index';
import { createFileAuditSink } from '../../src/server';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gj-kit-audit-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entryFixture(id: string): AuditEntry {
  return {
    id,
    at: '2026-08-09T12:00:00.000Z',
    env: 'test',
    method: 'GET',
    path: '/v1/payments/pk-1',
    attempt: 1,
    idempotencyKey: null,
    requestBody: null,
    durationMs: 12,
    traceId: null,
    outcome: { kind: 'transport', code: 'NETWORK_ERROR' },
  };
}

describe('createFileAuditSink', () => {
  it('기본 JSONL 1행 — record 호출 순서 = append 순서(직렬화 큐)', async () => {
    const file = join(dir, 'audit.jsonl');
    const sink = createFileAuditSink(file);
    // await 없이 연속 record — 큐가 순서를 보존해야 한다
    void sink.record(entryFixture('e1'));
    void sink.record(entryFixture('e2'));
    void sink.record(entryFixture('e3'));
    await sink.flush();

    const lines = (await readFile(file, 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => (JSON.parse(line) as AuditEntry).id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('formatter 옵션 — 개행은 싱크가 붙인다', async () => {
    const file = join(dir, 'audit.log');
    const sink = createFileAuditSink(file, { formatter: (entry) => `id=${entry.id}` });
    void sink.record(entryFixture('custom'));
    await sink.flush();
    expect(await readFile(file, 'utf8')).toBe('id=custom\n');
  });

  it('append 실패는 해당 record의 Promise로만 전파되고 큐는 계속 산다', async () => {
    // 존재하지 않는 디렉터리 → 첫 record 실패
    const sink = createFileAuditSink(join(dir, 'no-such-dir', 'audit.jsonl'));
    const first = sink.record(entryFixture('fail-1'));
    await expect(first).rejects.toThrow();
    // 큐 미오염 — flush는 정상 완료된다(실패 건은 이미 개별 통지 완료)
    await expect(sink.flush()).resolves.toBeUndefined();
  });

  it('close 후 record는 조용히 무시된다 (graceful shutdown 봉인)', async () => {
    const file = join(dir, 'audit.jsonl');
    const sink = createFileAuditSink(file);
    void sink.record(entryFixture('before-close'));
    await sink.close();
    expect(sink.record(entryFixture('after-close'))).toBeUndefined();
    await sink.flush();

    const lines = (await readFile(file, 'utf8')).trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0] ?? '') as AuditEntry).id).toBe('before-close');
  });
});
