import { describe, expect, it } from 'vitest';

import { err, isErr, isOk, ok } from '../../src/index';
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
