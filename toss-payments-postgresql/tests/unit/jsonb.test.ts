/**
 * serializeJsonb — PostgreSQL jsonb가 하드 거부하는 값의 사전 정화.
 *
 * 계약: 문제 문자(U+0000·비페어 서로게이트)가 없는 값은 JSON.stringify와 바이트
 * 동일하고, 문제 코드유닛만 U+FFFD로 치환된다(페어 서로게이트 이모지는 보존).
 * redactSensitiveValues는 모든 깊이의 credential/secret/key/token/password/card/account
 * 계열 키를 [REDACTED]로 치환한다(null은 보존).
 */
import { describe, expect, it } from 'vitest';

import { serializeJsonb } from '../../src/stores/jsonb';

describe('serializeJsonb — 정상 데이터는 JSON.stringify와 동일', () => {
  it.each([
    ['중첩 객체', { a: 1, b: { c: '한글', d: [true, null] } }],
    ['이모지(페어 서로게이트)', { name: '주문 🧾😀', tag: '🙂' }],
    ['이스케이프가 필요한 제어문자(U+0001 등)', { s: '\t\n"quote"\\' }],
    ['원문 백슬래시 시퀀스(이스케이프 아님)', { s: '원문: \\u0000 (문자 아님)' }],
  ])('%s', (_label, value) => {
    expect(serializeJsonb(value)).toBe(JSON.stringify(value));
  });

  it('키 순서를 보존한다 — 재직렬화가 구조를 재배열하지 않는다', () => {
    const value = { z: 1, a: 2, m: { y: 3, b: 4 } };
    expect(serializeJsonb(value)).toBe('{"z":1,"a":2,"m":{"y":3,"b":4}}');
  });
});

describe('serializeJsonb — 문제 코드유닛 치환', () => {
  it('U+0000은 U+FFFD로 치환된다(값·키·배열 요소·중첩 전부)', () => {
    const value = {
      ['키\u0000손상']: '값\u0000손상',
      nested: { list: ['a\u0000b'] },
    };
    const json = serializeJsonb(value);
    expect(json).not.toContain('\\u0000');
    expect(JSON.parse(json)).toEqual({
      '키�손상': '값�손상',
      nested: { list: ['a�b'] },
    });
  });

  it('비페어 서로게이트는 치환되고 페어(이모지)는 보존된다', () => {
    const json = serializeJsonb({ s: '앞\ud800😀\udc00뒤' });
    expect(json).not.toContain('\\ud800');
    expect(json).not.toContain('\\udc00');
    expect(JSON.parse(json)).toEqual({ s: '앞�😀�뒤' });
  });

  it('문자열 끝의 high surrogate(뒤가 없는 경우)도 치환된다', () => {
    expect(JSON.parse(serializeJsonb({ s: '끝\ud83d' }))).toEqual({ s: '끝�' });
  });
});

describe('serializeJsonb — redactSecrets', () => {
  it('모든 깊이의 secret 키(대소문자 무시)를 [REDACTED]로 치환한다', () => {
    const value = {
      secret: 'top-secret',
      data: { Secret: 'mid-secret', raw: { secret: 'raw-secret', keep: 'ok' } },
    };
    const json = serializeJsonb(value, { redactSecrets: true });
    expect(json).not.toContain('top-secret');
    expect(json).not.toContain('mid-secret');
    expect(json).not.toContain('raw-secret');
    expect(JSON.parse(json)).toEqual({
      secret: '[REDACTED]',
      data: { Secret: '[REDACTED]', raw: { secret: '[REDACTED]', keep: 'ok' } },
    });
  });

  it('secret이 null이면 치환하지 않는다 — "비어 있었다"는 사실 자체가 증거(코어 audit 선례)', () => {
    expect(JSON.parse(serializeJsonb({ secret: null }, { redactSecrets: true }))).toEqual({
      secret: null,
    });
  });

  it('옵션이 없으면 secret 키도 그대로 둔다 — audit entry는 코어 redaction 통과본이라 재마스킹하지 않는다', () => {
    expect(serializeJsonb({ secret: 'kept' })).toBe('{"secret":"kept"}');
  });

  it('새 broad opt-in은 camel/snake/case 혼합 credential·key·token·password·card/account 키를 재귀 마스킹한다', () => {
    const value = {
      billingKey: 'bkey',
      auth_key: 'auth',
      apiKey: 'api',
      nested: {
        TOKENS: ['token-1'],
        Password: 'password',
        cardNumber: '4111111111111111',
        bank_account_no: '100012345678',
        normalNumber: 42,
      },
    };
    const json = serializeJsonb(value, { redactSensitiveValues: true });
    expect(json).not.toContain('bkey');
    expect(json).not.toContain('4111111111111111');
    expect(JSON.parse(json)).toEqual({
      billingKey: '[REDACTED]',
      auth_key: '[REDACTED]',
      apiKey: '[REDACTED]',
      nested: {
        TOKENS: '[REDACTED]',
        Password: '[REDACTED]',
        cardNumber: '[REDACTED]',
        bank_account_no: '[REDACTED]',
        normalNumber: 42,
      },
    });
    // 마스킹은 저장본 clone에서만 수행한다.
    expect(value.nested.cardNumber).toBe('4111111111111111');
  });
});

describe('serializeJsonb — 방어 경로', () => {
  it('순환 참조는 [CIRCULAR]로 끊는다 — JSON.stringify의 TypeError 대신 저장 가능한 표식', () => {
    const value: Record<string, unknown> = { name: 'loop' };
    value['self'] = value;
    expect(JSON.parse(serializeJsonb(value))).toEqual({ name: 'loop', self: '[CIRCULAR]' });
  });

  it('DAG(비순환 중복 참조 — Payment.raw 패턴)는 순환으로 오판하지 않는다', () => {
    const raw = { orderId: 'o-1' };
    const json = serializeJsonb({ data: { ...raw, raw } });
    expect(JSON.parse(json)).toEqual({ data: { orderId: 'o-1', raw: { orderId: 'o-1' } } });
  });
});
