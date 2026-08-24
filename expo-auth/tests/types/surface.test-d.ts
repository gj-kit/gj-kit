// 공개 타입 표면 — EOP 규약·구조적 seam 호환·명명 유니언 (설계 문서 §5.4).

import { describe, expectTypeOf, it } from 'vitest';

import type {
  AuthClock,
  AuthErrorCode,
  AuthSessionOptions,
  EagerRefreshOutcome,
  RefreshLock,
  RefreshOutcome,
  RefreshRequest,
  TokenPair,
  TokenPersistence,
  TokenStorage,
} from '../../src/index';
import { createAuthSession, decodeJwtExpiryEpochSeconds, describeAccessToken } from '../../src/index';
import type { MemoryTokenStorage } from '../../src/testing';
import {
  createFakeRefreshLock,
  createManualClock,
  createMemoryTokenStorage,
  createScriptedRefreshRequest,
} from '../../src/testing';

declare const storage: TokenStorage;
declare const refresh: RefreshRequest;

describe('EOP 규약 — 공개 옵셔널 필드는 전부 `?: T | undefined` (§1 불변식 7)', () => {
  it('exactOptionalPropertyTypes 소비자가 명시적 undefined를 넘길 수 있다', () => {
    const options: AuthSessionOptions = {
      storage,
      refresh,
      lock: undefined,
      clock: undefined,
      accessTokenTtlSeconds: undefined,
      schedule: undefined,
      onScheduledOutcome: undefined,
    };
    const session = createAuthSession(options);
    void session.refreshIfExpiringSoon({ thresholdSeconds: undefined });
    void session.signIn(
      { accessToken: 'a', refreshToken: 'r' },
      { persistence: 'durable', accessTtlSeconds: undefined }
    );
    const schedule: NonNullable<AuthSessionOptions['schedule']> = {
      leadSeconds: undefined,
      minDelayMs: undefined,
      fallbackTtlSeconds: undefined,
      transientMaxDelayMs: undefined,
    };
    void schedule;
  });
});

describe('구조적 seam 호환 (§5.4)', () => {
  it('MemoryTokenStorage는 TokenStorage seam을 만족한다', () => {
    expectTypeOf<MemoryTokenStorage>().toExtend<TokenStorage>();
    const memory = createMemoryTokenStorage();
    const asSeam: TokenStorage = memory;
    void asSeam;
  });

  it('ManualClock·FakeRefreshLock·scripted request가 각 seam을 만족한다', () => {
    const clock: AuthClock = createManualClock();
    const lock: RefreshLock = createFakeRefreshLock();
    const scripted: RefreshRequest = createScriptedRefreshRequest([]).request;
    void createAuthSession({ storage, refresh: scripted, clock, lock });
  });

  it('커스텀 TokenStorage(MMKV·keytar류)가 3메서드만으로 구조적으로 성립한다 (§3.1)', () => {
    const custom: TokenStorage = {
      async getTokens() {
        return null;
      },
      async setTokens(tokens, options) {
        void tokens;
        void options?.persistence;
      },
      async clearTokens() {},
    };
    void custom;
  });
});

describe('명명 유니언·정확한 시그니처', () => {
  it('EagerRefreshOutcome — 여섯 결말의 명명된 집: assertNever 픽스처 (§3.5)', () => {
    function assertNever(value: never): never {
      throw new Error(String(value));
    }
    // 소비자가 여섯 결말 위치를 익명으로 재선언하지 않고 명명 타입으로 쓴다 — 그 자체가 검증 대상.
    function describeEager(outcome: EagerRefreshOutcome): string {
      switch (outcome.status) {
        case 'refreshed':
        case 'adopted':
        case 'signed-out':
        case 'invalid':
        case 'transient':
        case 'not-needed':
          return outcome.status;
        default:
          return assertNever(outcome);
      }
    }
    void describeEager;
    expectTypeOf<RefreshOutcome>().toExtend<EagerRefreshOutcome>();
  });

  it('결말 status 유니언이 닫혀 있다', () => {
    expectTypeOf<RefreshOutcome['status']>().toEqualTypeOf<
      'refreshed' | 'adopted' | 'signed-out' | 'invalid' | 'transient'
    >();
    expectTypeOf<AuthErrorCode>().toEqualTypeOf<'invalid-key-prefix' | 'session-disposed'>();
    expectTypeOf<TokenPersistence>().toEqualTypeOf<'durable' | 'session'>();
  });

  it('JWT 유틸 시그니처', () => {
    expectTypeOf(decodeJwtExpiryEpochSeconds).toEqualTypeOf<(token: string) => number | null>();
    expectTypeOf(describeAccessToken('x')).toEqualTypeOf<{
      readonly length: number;
      readonly expiresAtEpochSeconds: number | null;
    }>();
  });

  it('TokenPair는 readonly다', () => {
    const pair: TokenPair = { accessToken: 'a', refreshToken: 'r' };
    // @ts-expect-error — readonly 속성 재할당 불가
    pair.accessToken = 'other';
  });
});
