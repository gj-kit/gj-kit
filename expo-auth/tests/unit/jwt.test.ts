// decodeJwtExpiryEpochSeconds·describeAccessToken — H13 (설계 문서 §3.6 · §5.2 JWT 행).

import { describe, expect, it } from 'vitest';

import { decodeJwtExpiryEpochSeconds, describeAccessToken } from '../../src/core/jwt';
import { createUnsignedTestJwt } from '../../src/testing/refresh';

describe('decodeJwtExpiryEpochSeconds (H13 — throw 금지)', () => {
  it('createUnsignedTestJwt({ exp }) 왕복', () => {
    expect(decodeJwtExpiryEpochSeconds(createUnsignedTestJwt({ exp: 1_700_000_900 }))).toBe(
      1_700_000_900
    );
  });

  it('URL-safe 문자(-·_)와 패딩 없는 payload를 디코드한다', () => {
    // 62/63번 문자와 멀티바이트(UTF-8)를 강제로 포함시키는 클레임.
    const token = createUnsignedTestJwt({ exp: 42, subject: '사용자~?>>>???', flags: '~~~' });
    expect(decodeJwtExpiryEpochSeconds(token)).toBe(42);
  });

  it('= 패딩이 붙은 base64 payload도 관용한다', () => {
    // {"exp":7} → base64 "eyJleHAiOjd9" (그대로 4의 배수) — 패딩 추가본도 같은 결과.
    expect(decodeJwtExpiryEpochSeconds('h.eyJleHAiOjd9.s')).toBe(7);
    expect(decodeJwtExpiryEpochSeconds('h.eyJleHAiOjd9==.s')).toBe(7);
  });

  it.each([
    ['비JWT 문자열', 'not-a-jwt'],
    ['빈 payload', 'header..signature'],
    ['base64 불가 문자', 'h.%%%%.s'],
    ['불가능한 base64 길이', 'h.abcde.s'],
    ['JSON 아님', 'h.bm90LWpzb24.s'], // "not-json"
    ['exp 없음', createUnsignedTestJwt({ sub: 'x' })],
    ['exp가 숫자 아님', createUnsignedTestJwt({ exp: 'soon' })],
    ['exp가 유한수 아님', createUnsignedTestJwt({ exp: null })],
    ['빈 문자열', ''],
  ])('손상·부적합 입력 → null: %s', (_label, token) => {
    expect(decodeJwtExpiryEpochSeconds(token)).toBeNull();
  });

  it('손상 UTF-8 payload → null (throw 없음)', () => {
    // 0xFF 시퀀스를 만드는 base64url "//8" — 유효 UTF-8이 아니다.
    expect(decodeJwtExpiryEpochSeconds('h.__8.s')).toBeNull();
  });
});

describe('describeAccessToken (§4.2 — 토큰 바이트 0)', () => {
  it('길이와 만료만 노출한다', () => {
    const token = createUnsignedTestJwt({ exp: 123 });
    const summary = describeAccessToken(token);
    expect(summary).toEqual({ length: token.length, expiresAtEpochSeconds: 123 });
    expect(JSON.stringify(summary)).not.toContain(token.slice(0, 8));
  });

  it('비JWT 토큰 → expiresAtEpochSeconds null', () => {
    expect(describeAccessToken('opaque')).toEqual({ length: 6, expiresAtEpochSeconds: null });
  });
});
