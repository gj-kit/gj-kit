import { describe, expect, it } from 'vitest';

import {
  isErr,
  isOk,
  parseApiSecretKey,
  parseSecretKey,
  parseWidgetSecretKey,
} from '../../src/server';

describe('parseApiSecretKey', () => {
  it('test/live sk 키를 통과시키고 원문을 보존한다', () => {
    const test = parseApiSecretKey('test_sk_abc123');
    expect(isOk(test)).toBe(true);
    if (isOk(test)) expect(test.value).toBe('test_sk_abc123');
    expect(isOk(parseApiSecretKey('live_sk_xyz'))).toBe(true);
  });

  it('다른 종류의 키를 넣으면 어떤 키를 넣었는지 진단한다', () => {
    const widget = parseApiSecretKey('test_gsk_abc');
    expect(isErr(widget)).toBe(true);
    if (isErr(widget)) {
      expect(widget.error.reason).toBe('bad-prefix');
      expect(widget.error.message).toContain('위젯 시크릿 키(gsk)');
    }
    const client = parseApiSecretKey('live_ck_abc');
    expect(isErr(client)).toBe(true);
    if (isErr(client)) expect(client.error.message).toContain('API 클라이언트 키(ck)');
  });

  it('접두사 뒤 본문이 비면 empty-body', () => {
    const r = parseApiSecretKey('test_sk_');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe('empty-body');
  });
});

describe('parseWidgetSecretKey', () => {
  it('gsk 키만 통과시킨다', () => {
    expect(isOk(parseWidgetSecretKey('test_gsk_docs'))).toBe(true);
    expect(isOk(parseWidgetSecretKey('live_gsk_docs'))).toBe(true);
    const sk = parseWidgetSecretKey('test_sk_abc');
    expect(isErr(sk)).toBe(true);
    if (isErr(sk)) expect(sk.error.message).toContain('API 시크릿 키(sk)');
  });
});

describe('parseSecretKey (접두사 자동 판별)', () => {
  it('sk/gsk 둘 다 통과시킨다', () => {
    expect(isOk(parseSecretKey('test_sk_abc'))).toBe(true);
    expect(isOk(parseSecretKey('live_gsk_abc'))).toBe(true);
  });

  it('클라이언트 키(ck/gck)는 거부하고 진단한다', () => {
    const r = parseSecretKey('test_gck_abc');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.message).toContain('위젯 클라이언트 키(gck)');
      expect(r.error.expected).toContain('test_sk_');
    }
  });

  it('인식 불가 접두사는 bad-prefix', () => {
    const r = parseSecretKey('sk_live_stripe_style');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe('bad-prefix');
  });
});
