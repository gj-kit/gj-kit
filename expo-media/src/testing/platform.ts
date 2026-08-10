// 설계 문서 §5.6 `"./testing"` — 플랫폼 어댑터 페이크.
//
// `PlatformAdapter`가 필드 2개뿐인 것은 설계다(§3.3). 그 둘이 갈라놓는 분기가 곧
// 이 킷의 플랫폼 의존 전부이며, 페이크가 그 둘을 자유롭게 정하므로 **네이티브 기기 없이**
// 다음이 전부 검증된다:
//   · `os: 'ios'` — §7 하드닝 2. `file://` 후보여도 반드시 캐시로 카피한다.
//   · `os: 'android'` — 같은 후보가 카피 없이 직행한다.
//   · `os: 'web'` — `LocalUploads.uploadPickedAsset`이 `platform-unsupported`로 즉시 실패한다(§8.5).
//   · `isDev: true` — §7 하드닝 8의 디버그 로거 게이트가 열린다(`os !== 'web'`도 함께 필요).
//
// ⚠ peer 0 · DOM 0.

import type { MediaPlatform, PlatformAdapter } from '../core/adapters';

/**
 * 설계 문서 §5.6의 확정 시그니처.
 *
 * ⚠ `isDev`는 **false**가 기본이다. true로 두면 모든 유닛이 콘솔 로그를 뿜고, 그 소음 속에서
 * "로그에 원문 uri가 실렸는가"(§7 하드닝 8) 같은 진짜 신호를 잃는다. 로거를 검증하는 테스트만
 * 명시적으로 켠다 — `createFakePlatform({ os, isDev: true })`.
 */
export function fakePlatform(os: MediaPlatform): PlatformAdapter {
  return { os, isDev: false };
}

/** 객체 인자 판. `isDev`까지 정할 때 쓴다. 기본값은 `fakePlatform('ios')`와 같다. */
export function createFakePlatform(
  input?: { readonly os?: MediaPlatform | undefined; readonly isDev?: boolean | undefined } | undefined,
): PlatformAdapter {
  return { os: input?.os ?? 'ios', isDev: input?.isDev ?? false };
}
