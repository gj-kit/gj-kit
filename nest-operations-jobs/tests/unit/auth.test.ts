/** §3.7 인증 원시 함수와 인증자 순서. */
import { describe, expect, it, vi } from 'vitest';

import {
  bearerToken,
  createJobTriggerAuthenticator,
  looksLikeJwt,
  timingSafeSecretMatch,
} from '../../src/core/auth';
import type { JobTriggerTokenVerifier } from '../../src/core/auth';

const SECRET = 'a'.repeat(32);
const JWT = 'aaaa.bbbb.cccc';

describe('bearerToken', () => {
  it.each([
    [undefined, undefined],
    [null, undefined],
    ['', undefined],
    ['Bearer ', undefined],
    ['token', undefined],
    ['Basic secret-value', undefined],
    ['Bearer secret-value', 'secret-value'],
    // RFC 7235 §2.1 — auth-scheme은 대소문자를 구분하지 않는다. 토큰은 원문 그대로.
    ['bearer secret-value', 'secret-value'],
    ['BEARER secret-value', 'secret-value'],
    ['BeArEr MixedCaseToken', 'MixedCaseToken'],
  ])('%s → %s', (header, expected) => {
    expect(bearerToken(header as string | undefined)).toBe(expected);
  });

  it('배열 헤더는 첫 값을 쓴다', () => {
    expect(bearerToken(['Bearer first', 'Bearer second'])).toBe('first');
    expect(bearerToken([])).toBeUndefined();
  });
});

describe('§0.2-⑦ timingSafeSecretMatch', () => {
  it('동일 문자열만 참이다', () => {
    expect(timingSafeSecretMatch(SECRET, SECRET)).toBe(true);
    expect(timingSafeSecretMatch(SECRET, `${SECRET}x`)).toBe(false);
    expect(timingSafeSecretMatch(SECRET, 'a')).toBe(false);
  });

  it('길이가 달라도 예외 없이 false — digest 비교라 길이가 유출되지 않는다', () => {
    expect(timingSafeSecretMatch('short', 'a'.repeat(4_096))).toBe(false);
  });

  it('비문자열 입력은 false', () => {
    expect(timingSafeSecretMatch(SECRET, undefined as unknown as string)).toBe(false);
    expect(timingSafeSecretMatch(42 as unknown as string, SECRET)).toBe(false);
  });
});

describe('looksLikeJwt', () => {
  it.each([
    ['aaa.bbb.ccc', true],
    ['aa-_9.bb.cc', true],
    ['aaa.bbb', false],
    ['aaa.bbb.ccc.ddd', false],
    ['aaa..ccc', false],
    ['aa+a.bbb.ccc', false],
    ['aa/a.bbb.ccc', false],
    ['aaa=.bbb.ccc', false],
    ['aa a.bbb.ccc', false],
    ['', false],
  ])('%s → %s', (token, expected) => {
    expect(looksLikeJwt(token)).toBe(expected);
  });
});

describe('§3.7 createJobTriggerAuthenticator', () => {
  it('§4-9 시크릿도 verifier도 없으면 조립 시점에 죽는다', () => {
    expect(() => createJobTriggerAuthenticator({})).toThrowError(/shared secret or a token verifier/u);
    try {
      createJobTriggerAuthenticator({});
    } catch (error) {
      expect((error as { code?: string }).code).toBe('ERR_JOB_AUTH_MISCONFIGURED');
    }
  });

  it('§4-10 31자 시크릿은 조립 시점에 죽고 32자는 통과한다', () => {
    expect(() => createJobTriggerAuthenticator({ secret: 'a'.repeat(31) })).toThrowError(
      /at least 32 characters/u,
    );
    expect(() => createJobTriggerAuthenticator({ secret: SECRET })).not.toThrow();
  });

  it('시크릿 경로 — 일치하면 method secret', async () => {
    const authenticate = createJobTriggerAuthenticator({ secret: SECRET });
    await expect(authenticate(`Bearer ${SECRET}`)).resolves.toEqual({ method: 'secret' });
  });

  it('토큰 경로 — verifier가 신원을 돌려주면 그대로 통과한다', async () => {
    const verifier: JobTriggerTokenVerifier = {
      verify: async () => ({ method: 'token', subject: 'jobs@example.iam' }),
    };
    const authenticate = createJobTriggerAuthenticator({ tokenVerifier: verifier });
    await expect(authenticate(`Bearer ${JWT}`)).resolves.toEqual({
      method: 'token',
      subject: 'jobs@example.iam',
    });
  });

  it('§4-11 JWT 형태가 아니면 verifier를 호출하지 않는다', async () => {
    const verify = vi.fn(async () => null);
    const authenticate = createJobTriggerAuthenticator({
      secret: SECRET,
      tokenVerifier: { verify },
    });
    await expect(authenticate('Bearer not-a-jwt')).rejects.toMatchObject({
      code: 'ERR_JOB_UNAUTHORIZED',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('시크릿이 맞으면 verifier까지 가지 않는다', async () => {
    const verify = vi.fn(async () => null);
    const authenticate = createJobTriggerAuthenticator({
      secret: JWT.padEnd(32, 'z'),
      tokenVerifier: { verify },
    });
    await authenticate(`Bearer ${JWT.padEnd(32, 'z')}`);
    expect(verify).not.toHaveBeenCalled();
  });

  it('실패 메시지는 모든 분기에서 동일하다 — 어디서 떨어졌는지 알려주지 않는다', async () => {
    const authenticate = createJobTriggerAuthenticator({
      secret: SECRET,
      tokenVerifier: { verify: async () => null },
    });
    const messages: string[] = [];
    for (const header of [undefined, 'Bearer wrong-secret', `Bearer ${JWT}`]) {
      await authenticate(header).catch((error: Error) => {
        messages.push(error.message);
      });
    }
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });

  it('verifier가 던지면 그대로 전파된다 — 거부가 아니라 장애다', async () => {
    const outage = new Error('token endpoint unreachable');
    const authenticate = createJobTriggerAuthenticator({
      tokenVerifier: {
        verify: async () => {
          throw outage;
        },
      },
    });
    await expect(authenticate(`Bearer ${JWT}`)).rejects.toBe(outage);
  });
});
