// 설계 문서 §5.5 — `"."`의 기본 `PlatformAdapter`. peer: `react-native`.
//
// 코어에서 `react-native` import를 제거한 유일한 이유가 이 두 필드다(§3.3). 전신 `debug.ts`가
// `Platform`을 직접 import했고 **그 한 줄 때문에** 서명 URL 새니타이저(§7 하드닝 8)를 순수
// 유닛으로 검증할 수 없었다. 주입으로 바꾸면서 debug 모듈이 코어로 내려왔다.

import { Platform } from 'react-native';

import type { MediaPlatform, PlatformAdapter } from '../core/adapters';

// RN 번들러가 주입하는 전역. 타입 선언만 하므로 JS는 방출되지 않는다.
// (같은 기법을 코어의 `resolveSource.ts`가 타이머에 쓴다 — §2.4의 무DOM 규율을 지키면서
//  호스트 전역을 빌리는 채택안이다.)
declare const __DEV__: boolean | undefined;

/**
 * `Platform.OS`는 `'windows'`·`'macos'`도 가질 수 있다(RN 데스크톱 포크).
 * ⚠ 그 둘을 `'web'`으로 접는다 — 이 킷이 실제로 갈라 보는 것은 "iOS PhotoKit 핸드오프가
 * 필요한가"(§7 하드닝 2)와 "로컬 파일 스트리밍이 존재하는가"(§8.5)뿐이고, 데스크톱 포크는
 * 후자 쪽 성질이 웹에 가깝다. `'ios'`로 잘못 접으면 존재하지 않는 PhotoKit 카피가 시도된다.
 */
function mediaPlatformOf(os: string): MediaPlatform {
  if (os === 'ios') return 'ios';
  if (os === 'android') return 'android';
  return 'web';
}

/**
 * `isDev` 게이트: `__DEV__ && NODE_ENV !== 'test'` (전신 `debugEnabled()` 보존).
 *
 * ⚠ 테스트 환경 제외를 여기서 흡수하는 것이 설계다(§3.3 `PlatformAdapter.isDev` TSDoc).
 * 코어에는 `__DEV__`도 `process`도 없으므로, 그 판정을 코어로 올리면 전역 참조가 코어에
 * 되돌아온다. `process`는 구조적으로 집는다 — `lib:["ES2022"]`에 그 전역 선언이 없고,
 * `@types/node`를 이 패키지의 의존으로 끌어들일 이유도 없다.
 */
function isDevEnvironment(): boolean {
  if (typeof __DEV__ !== 'boolean' || !__DEV__) return false;
  const env = (globalThis as { readonly process?: { readonly env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.['NODE_ENV'] !== 'test';
}

export function expoPlatform(): PlatformAdapter {
  return { os: mediaPlatformOf(Platform.OS), isDev: isDevEnvironment() };
}
