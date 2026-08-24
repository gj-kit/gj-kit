/** §3.5 레지스트리 — 부팅 실패 조건 전수. */
import { describe, expect, it } from 'vitest';

import type { AnyOperationsJob } from '../../src/core/job';
import {
  assertJobSchedule,
  createJobRegistry,
  isJobKey,
  JOB_KEY_PATTERN,
  MAX_JOB_KEY_LENGTH,
} from '../../src/core/registry';

const job = (key: unknown, extra: Partial<AnyOperationsJob> = {}): AnyOperationsJob =>
  ({ key, description: 'd', run: async () => ({}), ...extra }) as AnyOperationsJob;

describe('§4-7 잡 키 형식', () => {
  it.each([
    ['storage.recurring-billing', true],
    ['a.b', true],
    ['a1-b2.c3-d4', true],
    ['Storage.Recurring_Billing', false],
    ['storage_recurring.billing', false],
    ['storage', false],
    ['a.b.c', false],
    ['', false],
    ['.b', false],
    ['a.', false],
    ['UPPER.case', false],
  ])('isJobKey(%s) === %s', (value, expected) => {
    expect(isJobKey(value)).toBe(expected);
  });

  it('101자는 거부, 100자는 통과', () => {
    const domain = 'a'.repeat(60);
    const action = 'b'.repeat(MAX_JOB_KEY_LENGTH - 60 - 1);
    const exact = `${domain}.${action}`;
    expect(exact).toHaveLength(MAX_JOB_KEY_LENGTH);
    expect(isJobKey(exact)).toBe(true);
    expect(isJobKey(`${exact}b`)).toBe(false);
    expect(JOB_KEY_PATTERN.test(`${exact}b`)).toBe(true); // 길이 상한은 패턴 밖의 규칙이다
  });

  it('비문자열 키는 전부 거부', () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(isJobKey(value)).toBe(false);
    }
  });

  it('형식 위반 등록은 ERR_JOB_KEY_INVALID로 죽고 메시지가 클래스 이름을 싣는다', () => {
    class BadKeyJob {
      readonly key = 'Bad_Key';
      readonly description = 'd';
      async run(): Promise<void> {}
    }
    expect(() => createJobRegistry([new BadKeyJob()])).toThrowError(/BadKeyJob/u);
    try {
      createJobRegistry([new BadKeyJob()]);
    } catch (error) {
      expect((error as { code?: string }).code).toBe('ERR_JOB_KEY_INVALID');
    }
  });
});

describe('§4-8 중복 키와 잡 형태', () => {
  it('같은 키를 두 잡이 주장하면 ERR_JOB_DUPLICATE_KEY', () => {
    expect(() => createJobRegistry([job('a.b'), job('a.b')])).toThrowError(/duplicate/iu);
  });

  it('run이 함수가 아니면 ERR_JOB_INVALID', () => {
    expect(() => createJobRegistry([{ key: 'a.b', description: 'd' } as AnyOperationsJob])).toThrowError(
      /run\(input, context\)/u,
    );
  });

  it('timeoutMs가 양의 유한수가 아니면 ERR_JOB_INVALID', () => {
    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createJobRegistry([job('a.b', { timeoutMs })])).toThrowError(/timeoutMs/u);
    }
    expect(() => createJobRegistry([job('a.b', { timeoutMs: 1 })])).not.toThrow();
  });

  it('timeoutMs가 32비트 타이머 상한을 넘으면 ERR_JOB_INVALID — 조용히 1ms로 접히는 값을 부팅에서 죽인다', () => {
    expect(() => createJobRegistry([job('a.b', { timeoutMs: 2_147_483_648 })])).toThrowError(
      /timer ceiling/u,
    );
    // 상한 자체는 통과한다.
    expect(() => createJobRegistry([job('a.b', { timeoutMs: 2_147_483_647 })])).not.toThrow();
  });

  it('list()는 키 순으로 정렬되고 get()은 등록한 인스턴스를 돌려준다', () => {
    const first = job('b.one');
    const second = job('a.two');
    const registry = createJobRegistry([first, second]);
    expect(registry.list().map((entry) => entry.key)).toEqual(['a.two', 'b.one']);
    expect(registry.get('b.one')).toBe(first);
    expect(registry.get('missing.key')).toBeUndefined();
  });
});

describe('§3.5 assertJobSchedule', () => {
  it.each([
    ['0 9 * * *', true],
    ['0 0 9 * * *', true],
    ['0 9 * *', false],
    ['0 9 * * * * *', false],
    ['', false],
  ])('cron %s → %s', (cron, valid) => {
    const call = (): void => {
      assertJobSchedule({ cron, timeZone: 'Asia/Seoul' }, 'a.b');
    };
    if (valid) expect(call).not.toThrow();
    else expect(call).toThrowError(/cron must have 5 or 6 fields|non-string/u);
  });

  it('알 수 없는 IANA 시간대는 부팅 실패', () => {
    expect(() => {
      assertJobSchedule({ cron: '0 9 * * *', timeZone: 'Asia/Seoulll' }, 'a.b');
    }).toThrowError(/unknown IANA time zone/u);
    expect(() => {
      assertJobSchedule({ cron: '0 9 * * *', timeZone: 'Europe/Berlin' }, 'a.b');
    }).not.toThrow();
  });

  it('등록 시 schedule 메타가 검증된다 (null은 통과)', () => {
    expect(() =>
      createJobRegistry([job('a.b', { schedule: { cron: 'nope', timeZone: 'Asia/Seoul' } })]),
    ).toThrowError(/cron/u);
    expect(() => createJobRegistry([job('a.b', { schedule: null })])).not.toThrow();
  });
});
