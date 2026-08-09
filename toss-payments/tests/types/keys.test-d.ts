import { describe, expectTypeOf, it } from 'vitest';

import { isTestKey, parseApiClientKey, parseWidgetClientKey } from '../../src/index';
import type {
  ApiClientKey,
  ApiSecretKey,
  KeyParseError,
  Result,
  WidgetClientKey,
  WidgetSecretKey,
} from '../../src/index';

describe('키 위조 불가 — 형식(템플릿 리터럴) × 명목성(브랜드)', () => {
  it('리터럴 대입 불가 — 접두사가 맞아도 브랜드가 없다', () => {
    // @ts-expect-error 'test_sk_x' 리터럴 대입 — parse 없이는 브랜드 획득 불가
    const sk: ApiSecretKey<'test'> = 'test_sk_x';
    void sk;
    // @ts-expect-error 클라이언트 키도 동일 — 리터럴 대입 불가
    const ck: ApiClientKey<'test'> = 'test_ck_x';
    void ck;
    // @ts-expect-error env 미지정(union) 타입에도 리터럴 대입 불가
    const anyEnv: WidgetClientKey = 'live_gck_x';
    void anyEnv;
  });

  it('키 종류 간 대입 불가 — 위젯 키를 ApiClientKey에', () => {
    const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼
    const gck = forge<WidgetClientKey<'test'>>();
    // @ts-expect-error 위젯 클라이언트 키(gck)는 ApiClientKey가 아니다
    const ck: ApiClientKey<'test'> = gck;
    void ck;
    const sk = forge<ApiSecretKey<'test'>>();
    // @ts-expect-error 시크릿 키를 클라이언트 키 자리에
    const ck2: ApiClientKey<'test'> = sk;
    void ck2;
    const gsk = forge<WidgetSecretKey<'test'>>();
    // @ts-expect-error 위젯 시크릿 키를 위젯 클라이언트 키 자리에
    const gck2: WidgetClientKey<'test'> = gsk;
    void gck2;
  });

  it('test/live env 간 대입 불가', () => {
    const forge = <T>(): T => undefined as T;
    const live = forge<ApiSecretKey<'live'>>();
    // @ts-expect-error live 키를 test 전용 자리에
    const test: ApiSecretKey<'test'> = live;
    void test;
  });

  it('파서 반환 타입 — env union 브랜드 키', () => {
    expectTypeOf(parseApiClientKey).returns.toEqualTypeOf<
      Result<ApiClientKey<'test'> | ApiClientKey<'live'>, KeyParseError>
    >();
    expectTypeOf(parseWidgetClientKey).returns.toEqualTypeOf<
      Result<WidgetClientKey<'test'> | WidgetClientKey<'live'>, KeyParseError>
    >();
  });

  it('isTestKey 가드 — env union을 test로 내로잉한다', () => {
    const forge = <T>(): T => undefined as T;
    const key = forge<ApiClientKey<'test'> | ApiClientKey<'live'>>();
    if (isTestKey(key)) {
      expectTypeOf(key).toExtend<ApiClientKey<'test'>>();
    }
  });
});
