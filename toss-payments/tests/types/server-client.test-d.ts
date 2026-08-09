import { describe, expectTypeOf, it } from 'vitest';

import { createTossClient } from '../../src/server';
import type { SettledCancelable, TossServerClient } from '../../src/server';
import type {
  ApiClientKey,
  ApiSecretKey,
  CancelReason,
  Env,
  WidgetClientKey,
  WidgetSecretKey,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('createTossClient — 키 종류 각인 + 시크릿 키만 수용', () => {
  it('sk → KeyKind api / gsk → KeyKind widget, env 각인', () => {
    const sk = forge<ApiSecretKey<'test'>>();
    const gsk = forge<WidgetSecretKey<'live'>>();
    expectTypeOf(createTossClient(sk).keyKind).toEqualTypeOf<'api'>();
    expectTypeOf(createTossClient(sk).env).toEqualTypeOf<'test'>();
    expectTypeOf(createTossClient(gsk).keyKind).toEqualTypeOf<'widget'>();
    expectTypeOf(createTossClient(gsk).env).toEqualTypeOf<'live'>();
  });

  it('클라이언트 키(ck/gck)로는 서버 클라이언트를 만들 수 없다', () => {
    const ck = forge<ApiClientKey<'test'>>();
    const gck = forge<WidgetClientKey<'test'>>();
    // @ts-expect-error API 클라이언트 키(ck)는 시크릿 키가 아니다
    void createTossClient(ck);
    // @ts-expect-error 위젯 클라이언트 키(gck)는 시크릿 키가 아니다
    void createTossClient(gck);
    // @ts-expect-error 생 문자열은 브랜드가 없다 — parse 없이는 클라이언트 생성 불가
    void createTossClient('test_sk_raw');
  });
});

describe('CallOptions.testCode — 비분배 조건부 (라이브·미내로잉 union 전부 차단)', () => {
  const settled = forge<SettledCancelable>();
  const reason = forge<CancelReason>();

  it('test 키 클라이언트에서만 testCode 허용', () => {
    const testClient = forge<TossServerClient<'test', 'api'>>();
    void testClient.cancels.cancelFully(
      settled,
      { reason, expectedAmount: 1000 },
      { testCode: 'REFUND_REJECTED' }, // 정상 경로
    );

    const liveClient = forge<TossServerClient<'live', 'api'>>();
    // @ts-expect-error 라이브 키에는 testCode 불가 — 서버가 조용히 무시하는 함정을 타입 차단
    void liveClient.cancels.cancelFully(settled, { reason, expectedAmount: 1000 }, { testCode: 'REFUND_REJECTED' });

    const unionClient = forge<TossServerClient<Env, 'api'>>();
    // @ts-expect-error 미내로잉 union env(E = Env)에도 testCode 불가 — 비분배 [E] extends ['test']
    void unionClient.cancels.cancelFully(settled, { reason, expectedAmount: 1000 }, { testCode: 'REFUND_REJECTED' });
  });
});
