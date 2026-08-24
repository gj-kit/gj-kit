// matchRefreshOutcome 런타임 분기 + AuthError 태그 판별 (설계 문서 §3.4 · §3.7).

import { describe, expect, it } from 'vitest';

import { AuthError, isAuthError } from '../../src/core/errors';
import { matchRefreshOutcome, type RefreshOutcome } from '../../src/core/outcome';

describe('matchRefreshOutcome (§3.4)', () => {
  const handlers = {
    refreshed: () => 'r',
    adopted: () => 'a',
    'signed-out': () => 's',
    invalid: (outcome: Extract<RefreshOutcome, { status: 'invalid' }>) =>
      `i:${String(outcome.tokensCleared)}`,
    transient: (outcome: Extract<RefreshOutcome, { status: 'transient' }>) =>
      `t:${String(outcome.cause)}`,
  };

  it('다섯 결말을 각자의 핸들러로 보낸다', () => {
    const pair = { accessToken: 'a', refreshToken: 'r' };
    expect(matchRefreshOutcome({ status: 'refreshed', tokens: pair }, handlers)).toBe('r');
    expect(matchRefreshOutcome({ status: 'adopted', tokens: pair }, handlers)).toBe('a');
    expect(matchRefreshOutcome({ status: 'signed-out' }, handlers)).toBe('s');
    expect(matchRefreshOutcome({ status: 'invalid', tokensCleared: false }, handlers)).toBe(
      'i:false'
    );
    expect(matchRefreshOutcome({ status: 'transient', cause: 'x' }, handlers)).toBe('t:x');
  });
});

describe('AuthError (§3.7)', () => {
  it('코드별 고정 영어 메시지 + code 노출', () => {
    const error = new AuthError('invalid-key-prefix');
    expect(error.code).toBe('invalid-key-prefix');
    expect(error.name).toBe('AuthError');
    expect(error.message).toMatch(/non-empty key prefix/);
    expect(new AuthError('session-disposed').message).toMatch(/disposed/);
  });

  it('isAuthError — Symbol.for 태그 판별 (splitting:false 사본 간에도 성립)', () => {
    expect(isAuthError(new AuthError('session-disposed'))).toBe(true);
    // 다른 엔트리 번들의 "사본"을 흉내: 같은 레지스트리 심볼 태그를 단 이물 객체.
    const foreignCopy = Object.defineProperty(new Error('copy'), Symbol.for('@gj-kit/expo-auth#AuthError'), { value: true });
    expect(isAuthError(foreignCopy)).toBe(true);
    expect(isAuthError(new Error('plain'))).toBe(false);
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError('AuthError')).toBe(false);
  });
});
