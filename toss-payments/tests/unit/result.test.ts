import { describe, expect, it } from 'vitest';

import { andThen, err, isErr, isOk, map, mapErr, ok, orThrow, unwrapOr } from '../../src/index';
import type { Result } from '../../src/index';

describe('Result (스모크)', () => {
  it('ok는 성공 변형을 만든다', () => {
    const r: Result<number, never> = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r)).toBe(true);
    expect(isErr(r)).toBe(false);
    if (isOk(r)) {
      expect(r.value).toBe(42);
    }
  });

  it('err는 실패 변형을 만든다', () => {
    const r: Result<never, { readonly kind: 'invalid-input' }> = err({ kind: 'invalid-input' });
    expect(r.ok).toBe(false);
    expect(isErr(r)).toBe(true);
    expect(isOk(r)).toBe(false);
    if (isErr(r)) {
      expect(r.error.kind).toBe('invalid-input');
    }
  });

  it('Result 값은 plain 객체다 — 직렬화 왕복 안전', () => {
    const r = ok({ orderId: 'order_000001' });
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});

describe('콤비네이터', () => {
  const failure: Result<number, string> = err('boom');

  it('map은 성공 값만 변환한다', () => {
    expect(map(ok(2), (n) => n * 10)).toEqual(ok(20));
    expect(map(failure, (n: number) => n * 10)).toEqual(failure);
  });

  it('mapErr는 실패 값만 변환한다', () => {
    expect(mapErr(ok(2), (e) => `wrapped:${String(e)}`)).toEqual(ok(2));
    expect(mapErr(failure, (e) => `wrapped:${e}`)).toEqual(err('wrapped:boom'));
  });

  it('andThen은 성공을 다음 Result로 연결한다', () => {
    const parsePositive = (n: number): Result<number, 'negative'> =>
      n >= 0 ? ok(n) : err('negative');
    expect(andThen(ok(3), parsePositive)).toEqual(ok(3));
    expect(andThen(ok(-1), parsePositive)).toEqual(err('negative'));
    expect(andThen(failure, parsePositive)).toEqual(failure);
  });

  it('unwrapOr는 실패 시 대체 값', () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
    expect(unwrapOr(failure, 0)).toBe(0);
  });
});

describe('orThrow — 부팅 전용 탈출구', () => {
  it('성공 값은 그대로 반환', () => {
    expect(orThrow(ok('key'))).toBe('key');
  });

  it('실패는 context 접두사 + cause 보존으로 던진다', () => {
    const r = err({ kind: 'invalid-key' });
    let caught: unknown;
    try {
      orThrow(r, 'TOSS_SECRET_KEY');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    if (caught instanceof Error) {
      expect(caught.message).toContain('TOSS_SECRET_KEY');
      expect(caught.message).toContain('invalid-key');
      expect(caught.cause).toEqual({ kind: 'invalid-key' });
    }
  });

  it('context 없이도 에러 내용을 담는다', () => {
    expect(() => orThrow(err('nope'))).toThrowError(/orThrow.*nope/);
  });
});
