// §4.1 컴파일 표 전부 — "정말로 컴파일이 깨지는" 오용만 담는다 (설계 문서 §4.1 · §5.4).

import { describe, expectTypeOf, it } from 'vitest';

import type {
  AuthSession,
  RefreshOutcome,
  RefreshRequestResult,
  TokenPair,
} from '../../src/index';
import { matchRefreshOutcome } from '../../src/index';
import { createTokenStorage } from '../../src/storage';
import { createWebLocksRefreshLock } from '../../src/storage/webLock';

declare const session: AuthSession;
declare const pair: TokenPair;
declare const outcome: RefreshOutcome;

describe('§4.1-① 키 프리픽스·잠금 이름 생략 = 컴파일 에러', () => {
  it('keyPrefix·name은 필수 인자다 — 기본값 없음', () => {
    // @ts-expect-error — keyPrefix 생략
    createTokenStorage({});
    // @ts-expect-error — 옵션 객체 자체 생략
    createTokenStorage();
    // @ts-expect-error — name 생략
    createWebLocksRefreshLock({});
  });
});

describe("§4.1-② refresh 콜백이 'rotated'라면서 tokens를 반환하지 않음 = 컴파일 에러", () => {
  it("'rotated' 멤버의 tokens는 필수 속성이다", () => {
    // @ts-expect-error — tokens 누락 (리터럴 여부와 무관하게 컴파일 에러)
    const missing: RefreshRequestResult = { status: 'rotated' };
    void missing;
    const ok: RefreshRequestResult = { status: 'rotated', tokens: pair };
    void ok;
  });

  it("반대 방향: { status: 'invalid', tokens } 직접 리터럴은 초과 속성 검사로 차단", () => {
    // ⚠ EPC(초과 속성 검사)는 직접 객체 리터럴에만 작동한다 — 변수 간접 시 우회되지만
    //   그 오용은 무해하다(tokens는 무시된다). §4.1-② 주석 그대로.
    // @ts-expect-error — 'invalid'에 tokens 초과 속성
    const excess: RefreshRequestResult = { status: 'invalid', tokens: pair };
    void excess;
  });
});

describe('§4.1-③ 갱신 결말 처리 누락 = 컴파일 에러', () => {
  it('outcome.tokens는 refreshed/adopted로 좁힌 뒤에만 접근 가능하다 (항상 강제)', () => {
    if (outcome.status === 'transient') {
      // @ts-expect-error — 'transient'에는 tokens가 없다
      void outcome.tokens;
    }
    if (outcome.status === 'invalid') {
      // @ts-expect-error — 'invalid'에도 없다
      void outcome.tokens;
    }
    if (outcome.status === 'refreshed' || outcome.status === 'adopted') {
      expectTypeOf(outcome.tokens).toEqualTypeOf<TokenPair>();
    }
  });

  it('matchRefreshOutcome 핸들러 키 누락 5종 = 컴파일 에러', () => {
    const handlers = {
      refreshed: () => 0,
      adopted: () => 0,
      'signed-out': () => 0,
      invalid: () => 0,
      transient: () => 0,
    };
    const { refreshed, adopted, invalid, transient, 'signed-out': signedOut } = handlers;
    // @ts-expect-error — refreshed 누락
    matchRefreshOutcome(outcome, { adopted, 'signed-out': signedOut, invalid, transient });
    // @ts-expect-error — adopted 누락
    matchRefreshOutcome(outcome, { refreshed, 'signed-out': signedOut, invalid, transient });
    // @ts-expect-error — 'signed-out' 누락
    matchRefreshOutcome(outcome, { refreshed, adopted, invalid, transient });
    // @ts-expect-error — invalid 누락
    matchRefreshOutcome(outcome, { refreshed, adopted, 'signed-out': signedOut, transient });
    // @ts-expect-error — transient 누락 ('transient'를 로그아웃 취급하는 H1 위반 코드의 컴파일 강제 차단)
    matchRefreshOutcome(outcome, { refreshed, adopted, 'signed-out': signedOut, invalid });
    // 전부 있으면 통과 + 반환 타입 합류.
    expectTypeOf(
      matchRefreshOutcome(outcome, { refreshed, adopted, 'signed-out': signedOut, invalid, transient })
    ).toEqualTypeOf<number>();
  });
});

describe('§4.1-④ 재시도 판별 없는 runAuthorized = 컴파일 에러', () => {
  it('shouldRetryAfterRefresh는 필수 옵션이다', () => {
    // @ts-expect-error — options 생략
    void session.runAuthorized(async () => 1);
    // @ts-expect-error — shouldRetryAfterRefresh 생략
    void session.runAuthorized(async () => 1, {});
  });
});

describe('§4.1-⑤ 재시도-두 번은 표현 불가능하다', () => {
  it('공개 표면에 allowRefresh 상당 인자가 없다', () => {
    void session.runAuthorized(
      async () => 1,
      // @ts-expect-error — allowRefresh 같은 재진입 스위치는 존재하지 않는다
      { shouldRetryAfterRefresh: () => true, allowRefresh: true }
    );
  });
});

describe('§4.1-⑥ persistence 생략 signIn = 컴파일 에러', () => {
  it('signIn의 options와 persistence는 필수다', () => {
    // @ts-expect-error — options 생략
    void session.signIn(pair);
    // @ts-expect-error — persistence 생략
    void session.signIn(pair, {});
    // @ts-expect-error — persistence 오타 유니언
    void session.signIn(pair, { persistence: 'persistent' });
    void session.signIn(pair, { persistence: 'session' });
  });
});
