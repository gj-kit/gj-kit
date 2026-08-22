/**
 * §3.4 cancel_retries — 멱등 재생의 바이트 계약.
 *
 * record_json 컬럼이 jsonb가 아니라 text인 이유가 곧 이 테스트다: bodyJson은 재시도 시
 * 동일 멱등키 + 동일 바이트를 다시 보내야 하는 계약이므로, 유니코드 이스케이프·이모지·
 * NUL이 들어 있어도 JSON.stringify/parse 왕복이 JS 문자열을 완전 동일하게 복원해야 한다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { createPgCancelRetryStore } from '../../src/stores/cancel-retries';
import { createFakeSql, norm } from './helpers/fake-sql';
import { TEST_UNSAFE_SENSITIVE_STORE_OPTIONS, makeCancelRetryRecord } from './helpers/fixtures';

describe('§3.4 save — 통짜 JSON 1컬럼 upsert', () => {
  it('record 전체를 JSON.stringify해 (ticket_id, record_json)으로 저장한다', async () => {
    const fake = createFakeSql();
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);
    const record = makeCancelRetryRecord();

    await store.save(record);

    expect(fake.calls).toHaveLength(1);
    const text = norm(fake.calls[0]?.text ?? '');
    expect(text).toContain('INSERT INTO "toss_payments".cancel_retries');
    expect(text).toContain('ON CONFLICT (ticket_id) DO UPDATE');
    expect(text).toContain('SET record_json = excluded.record_json');
    // recorded_at은 갱신하지 않는다 — TTL 기준점이 재시도마다 미끄러지지 않게
    expect(text).not.toContain('recorded_at = ');
    expect(fake.calls[0]?.params).toEqual([record.ticketId, JSON.stringify(record)]);
  });
});

describe('§3.4 load — 왕복 무손실', () => {
  it('행이 없으면 null', async () => {
    const fake = createFakeSql();
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await expect(store.load('ticket-none')).resolves.toBeNull();
  });

  it('save가 저장했을 문자열을 load하면 record 전체가 왕복된다', async () => {
    const fake = createFakeSql();
    const record = makeCancelRetryRecord();
    fake.enqueueRows([{ record_json: JSON.stringify(record) }]);
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    const loaded = await store.load(record.ticketId);

    expect(loaded).toEqual(record);
  });

  it('bodyJson 특수문자 통짜 왕복 — 유니코드 이스케이프 원문·이모지·"\\u0000" 리터럴·실제 NUL', async () => {
    // 바이트 계약의 위험 요소를 한 문자열에 몰아넣는다:
    // ① 리터럴 백슬래시-u 시퀀스 6글자(\,u,d,5,5,c — 이미 이스케이프된 원문)
    // ② 이모지(서로게이트 쌍)와 한글 원문
    // ③ "\u0000" 여섯 글자 리터럴(백슬래시가 소스에서 \\로 이스케이프됨)
    // ④ 실제 NUL 제어문자(U+0000, 소스의 \u0000) — jsonb 컬럼이었다면 저장이 거부됐을 값
    const trickyBodyJson =
      '{"reason":"\\ud55c\\uae00 환불 💸","memo":"literal:\\u0000","nul":"\u0000","account":{"bank":"39","number":"12345678901234"}}';
    expect(trickyBodyJson).toContain('\\ud55c'); // 픽스처 자기 검증: 원문에 6글자 시퀀스 존재
    expect(trickyBodyJson.includes('\u0000')).toBe(true); // 실제 NUL 존재
    const record = makeCancelRetryRecord({ bodyJson: trickyBodyJson });
    const fake = createFakeSql();
    fake.enqueueRows([{ record_json: JSON.stringify(record) }]);
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    const loaded = await store.load(record.ticketId);

    // toEqual이 아니라 toBe — JS 문자열 완전 동일성(코드 유닛 단위)이 계약이다
    expect(loaded?.bodyJson).toBe(trickyBodyJson);
    expect(loaded).toEqual(record);
  });

  it('testCode: undefined는 JSON 왕복에서 사라져도 계약상 동등하다', async () => {
    const record = makeCancelRetryRecord({ testCode: undefined });
    const fake = createFakeSql();
    fake.enqueueRows([{ record_json: JSON.stringify(record) }]);
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    const loaded = await store.load(record.ticketId);
    expect(loaded?.testCode).toBeUndefined();
  });

  it.each([
    ['record_json 비문자열', { record_json: 123 }],
    ['record_json이 JSON 배열', { record_json: '[1,2,3]' }],
    ['record_json이 원시값', { record_json: '"just-a-string"' }],
  ])('형태 위반(%s)은 invalid-row로 throw한다', async (_label, row) => {
    const fake = createFakeSql();
    fake.enqueueRows([row]);
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    let thrown: unknown;
    try {
      await store.load('ticket-0001');
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-row');
  });

  it('JSON 파싱 실패는 invalid-row — 복호화 평문 cause도 보존하지 않는다', async () => {
    const fake = createFakeSql();
    // 환불 계좌가 섞인 손상 JSON — 메시지에 이 내용이 새면 안 된다
    fake.enqueueRows([{ record_json: '{"refundAccount":"98765432109876", broken' }]);
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    let thrown: unknown;
    try {
      await store.load('ticket-0001');
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('invalid-row');
      expect(thrown.cause).toBeUndefined();
      expect(thrown.message).not.toContain('98765432109876');
      expect(thrown.message).toContain('ticket-0001'); // 추적 키는 ticketId만
    }
  });
});

describe('§3.4 delete', () => {
  it('ticket_id 기준 DELETE를 실행한다', async () => {
    const fake = createFakeSql();
    const store = createPgCancelRetryStore(fake, TEST_UNSAFE_SENSITIVE_STORE_OPTIONS);

    await store.delete('ticket-0001');

    expect(norm(fake.calls[0]?.text ?? '')).toBe(
      'DELETE FROM "toss_payments".cancel_retries WHERE ticket_id = $1',
    );
    expect(fake.calls[0]?.params).toEqual(['ticket-0001']);
  });
});
