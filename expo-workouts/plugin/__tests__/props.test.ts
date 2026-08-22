// props 검증 + 공개 타입(`src/plugin-types.ts`)과의 **상호 대입 가능성**.
//
// 타입 쪽 단언은 런타임 코드가 아니라 `tsc --noEmit -p plugin/tsconfig.test.json`이 지킨다
// (`pnpm typecheck`에 물려 있다). 두 인터페이스가 갈라지면 그 명령이 빨개진다.

import { describe, expect, it } from 'vitest';

import withGjKitWorkouts from '../src/index';
import { resolveProps, type GjKitWorkoutsPluginProps as PluginSideProps } from '../src/props';
import type { GjKitWorkoutsPluginProps as PublicProps } from '../../src/plugin-types';

// ── 두 인터페이스가 **동일한지** 컴파일 타임에 단언한다.
//
// ⚠ 단순 상호 대입 가능성만으로는 부족하다 — 한쪽에 **선택적** 필드를 추가해도 양방향 대입이
//   여전히 성립하기 때문에(초과 속성 검사는 객체 리터럴에만 걸린다) 표류가 통과한다.
//   실제로 음성 대조를 돌려 확인했다. 그래서 세 가지를 함께 본다:
//     1. 키 집합이 같은가          2. 선택적 키 집합이 같은가          3. 상호 대입 가능한가
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type SameKeys<A, B> = Mutual<keyof A, keyof B>;
type OptionalKeys<T> = { [K in keyof T]-?: NonNullable<unknown> extends Pick<T, K> ? K : never }[keyof T];
type SameOptionality<A, B> = Mutual<OptionalKeys<A>, OptionalKeys<B>>;
type Identical<A, B> = SameKeys<A, B> & SameOptionality<A, B> & Mutual<A, B>;

const _propsIdentical: Identical<PluginSideProps, PublicProps> = true;
const _iosIdentical: Identical<
  NonNullable<PluginSideProps['ios']>,
  NonNullable<PublicProps['ios']>
> = true;
void _propsIdentical;
void _iosIdentical;

const URL = 'https://example.com/privacy';

describe('privacyPolicyUrl은 REQUIRED다', () => {
  it('props 자체가 없으면 던진다 — 설정법을 문장으로 알려준다', () => {
    expect(() => withGjKitWorkouts({ name: 'a', slug: 'a' }, undefined as never)).toThrow(
      /privacyPolicyUrl.*required/s,
    );
  });

  it('상대 경로·빈 문자열·비 http 스킴을 모두 거절한다', () => {
    for (const bad of ['', '/privacy', 'example.com/privacy', 'ftp://example.com', 'javascript:alert(1)']) {
      expect(() => resolveProps({ privacyPolicyUrl: bad })).toThrow(/absolute http\(s\) URL/);
    }
  });

  it('http와 https를 모두 받는다', () => {
    expect(resolveProps({ privacyPolicyUrl: 'http://example.com/p' }).privacyPolicyUrl).toBe(
      'http://example.com/p',
    );
    expect(resolveProps({ privacyPolicyUrl: URL }).privacyPolicyUrl).toBe(URL);
  });
});

describe('scope 검증은 prebuild 시점에 던진다', () => {
  it('오타난 scope는 유효한 목록을 알려주며 거절된다', () => {
    expect(() => resolveProps({ privacyPolicyUrl: URL, read: ['workout'] as never })).toThrow(
      /unknown scope "workout".*workouts, distance/s,
    );
  });

  it('배열이 아니면 거절한다', () => {
    expect(() => resolveProps({ privacyPolicyUrl: URL, read: 'workouts' as never })).toThrow(
      /`read` must be an array/,
    );
  });

  it('history가 불리언이 아니면 거절한다', () => {
    expect(() => resolveProps({ privacyPolicyUrl: URL, history: 'yes' as never })).toThrow(
      /`history` must be a boolean/,
    );
  });

  it('ios.shareUsageDescription이 빈 문자열이면 거절한다 — 빈 usage string은 크래시와 같다', () => {
    expect(() => resolveProps({ privacyPolicyUrl: URL, ios: { shareUsageDescription: '' } })).toThrow(
      /ios\.shareUsageDescription/,
    );
  });
});

describe('정규화', () => {
  it('scope 순서를 SCOPES 순으로 고정하고 중복을 제거한다 — 방출 순서가 흔들리면 스냅샷이 무의미하다', () => {
    const resolved = resolveProps({
      privacyPolicyUrl: URL,
      read: ['steps', 'workouts', 'steps', 'distance'],
    });
    expect(resolved.read).toEqual(['workouts', 'distance', 'steps']);
  });

  it('read/write 생략은 빈 배열, history 생략은 false다', () => {
    const resolved = resolveProps({ privacyPolicyUrl: URL });
    expect(resolved.read).toEqual([]);
    expect(resolved.write).toEqual([]);
    expect(resolved.history).toBe(false);
  });

  it('usage description은 명시하지 않으면 undefined로 남는다 (mod가 기존값→기본값 순으로 채운다)', () => {
    const resolved = resolveProps({ privacyPolicyUrl: URL });
    expect(resolved.shareUsageDescription).toBeUndefined();
    expect(resolved.updateUsageDescription).toBeUndefined();
  });
});

describe('검증은 mod **바깥**에서 일어난다', () => {
  it('에러 메시지가 `[android.manifest]:` 접두로 감싸이지 않는다', () => {
    try {
      withGjKitWorkouts({ name: 'a', slug: 'a' }, { privacyPolicyUrl: 'nope' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as Error).message).not.toContain('[android.manifest]');
      expect((error as Error).message).toContain('@gj-kit/expo-workouts config plugin');
    }
  });
});
