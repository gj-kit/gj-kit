import { describe, expect, it } from 'vitest';

import { isErr, isLiveKey, isOk, isTestKey, parseApiClientKey, parseWidgetClientKey } from '../../src/index';

describe('parseApiClientKey', () => {
  it('test/live 접두사 키를 통과시키고 원문을 보존한다', () => {
    const test = parseApiClientKey('test_ck_abc123');
    expect(isOk(test)).toBe(true);
    if (isOk(test)) expect(test.value).toBe('test_ck_abc123');

    const live = parseApiClientKey('live_ck_xyz');
    expect(isOk(live)).toBe(true);
  });

  it('접두사 뒤 본문이 비면 empty-body', () => {
    const r = parseApiClientKey('test_ck_');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.reason).toBe('empty-body');
  });

  it('인식 불가 접두사는 bad-prefix + 기대 형식 안내', () => {
    const r = parseApiClientKey('sk_test_garbage');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.reason).toBe('bad-prefix');
      expect(r.error.expected).toBe('test_ck_ | live_ck_');
      expect(r.error.message).toContain('test_ck_');
    }
  });

  it('다른 종류의 키를 넣으면 어떤 키를 넣었는지 진단한다', () => {
    const secret = parseApiClientKey('test_sk_abc');
    expect(isErr(secret)).toBe(true);
    if (isErr(secret)) {
      expect(secret.error.reason).toBe('bad-prefix');
      expect(secret.error.message).toContain('시크릿 키(sk)');
    }

    const widget = parseApiClientKey('live_gck_abc');
    expect(isErr(widget)).toBe(true);
    if (isErr(widget)) expect(widget.error.message).toContain('위젯 클라이언트 키(gck)');
  });
});

describe('parseWidgetClientKey', () => {
  it('gck 키만 통과시킨다', () => {
    expect(isOk(parseWidgetClientKey('test_gck_docs'))).toBe(true);
    expect(isOk(parseWidgetClientKey('live_gck_docs'))).toBe(true);
  });

  it('API 클라이언트 키를 넣으면 진단 메시지로 알려준다', () => {
    const r = parseWidgetClientKey('test_ck_abc');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.message).toContain('API 클라이언트 키(ck)');
      expect(r.error.message).toContain('gck');
    }
  });

  it('위젯 시크릿 키(gsk)도 구분해 진단한다', () => {
    const r = parseWidgetClientKey('test_gsk_abc');
    expect(isErr(r)).toBe(true);
    if (isErr(r)) expect(r.error.message).toContain('위젯 시크릿 키(gsk)');
  });
});

describe('isTestKey / isLiveKey', () => {
  it('접두사로 env를 판정한다', () => {
    expect(isTestKey('test_ck_abc')).toBe(true);
    expect(isTestKey('live_ck_abc')).toBe(false);
    expect(isLiveKey('live_sk_abc')).toBe(true);
    expect(isLiveKey('test_sk_abc')).toBe(false);
  });
});
