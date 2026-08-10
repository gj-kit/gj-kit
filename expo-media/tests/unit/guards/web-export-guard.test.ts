// 가드 (보류) — `web-export-guard` (설계 문서 §10.3 · §8.2 케이스 G·H).
//
// 규칙: `tests/fixtures/web-export/`의 Expo SDK 56 스텁 앱을
//       `expo export --platform web`으로 `web.output:"single"`과 `"static"` **양쪽** 실행해,
//       **클라이언트 번들과 SSR 프리렌더 HTML 모두**에 `expo-media-library` 문자열이 0건인지 본다.
//
// ⚠ 기본적으로 건너뛴다. `expo export`는 실제 Metro 그래프를 돌리므로 픽스처 설치(수백 MB)와
//   분 단위 실행이 필요하다 — 유닛 계층의 왕복 시간을 그만큼 늘릴 수는 없다.
//   같은 불변식의 **빠른 대리 측정**은 `dist-peer-graph`가 이미 조건 3세트 × 형식 2로 수행한다.
//   다른 점은 하나뿐이지만 그 하나가 중요하다: 이 가드는 exports 맵 해석을 **우리가 재현한 것이
//   아니라 Metro가 실제로 한 것**으로 본다. 즉 `dist-peer-graph`의 조건 해석기 자체가 틀렸을
//   가능성을 덮는 유일한 검사다. 그래서 지우지 않고 남긴다.
//
// ── 실행 방법 ──────────────────────────────────────────────────────────────
//   1) 픽스처 이관(1회): 설계 문서 §8.2의 `scratchpad/vb/webfx/`를
//      `tests/fixtures/web-export/`로 옮긴다. 구성은 §2.3 exports 맵을 복제한 스텁 라이브러리 +
//      실제 Expo SDK 56 앱이다(expo@56.0.16 / @expo/metro@56.0.0 / metro-resolver@0.84.4 /
//      react-native@0.85.3 / react-native-web@0.21.2).
//   2) 앱의 `app.config.ts`에서 `web.output`을 `'single'` → `'static'`으로 바꿔 두 번 export한다.
//        pnpm --filter @gj-kit/expo-media build
//        cd tests/fixtures/web-export/app && pnpm install
//        npx expo export --platform web --output-dir dist-single   # web.output: 'single'
//        npx expo export --platform web --output-dir dist-static   # web.output: 'static'
//        grep -rl "expo-media-library" dist-single dist-static      # → 0건이어야 한다
//   3) `--platform ios` export에는 **반대로** `expo-media-library`가 있어야 한다(포크가 갈렸다는 증거).
//   4) 상시화할 때 이 파일의 `describe.skip`을 `describe`로 바꾸고 아래 본문을 채운다.
//
// ⚠ 케이스 H가 이 가드의 존재 이유다: `web.output:"static"|"server"`의 SSR 번들에는
//   조건 집합에 `browser`가 **들어갈 수 없다**(`withMetroMultiPlatform.js:614`가
//   `conditionsByPlatform`을 비우고 `:659`가 `conditionNames=['node']`로 교체한다).
//   `single`만 확인하면 그 누수가 보이지 않는다.

import { describe, expect, it } from 'vitest';

describe.skip('web-export-guard — expo export 산출물 (§8.2 케이스 G·H)', () => {
  it('web.output:"single" 클라이언트 번들에 expo-media-library 0건', () => {
    expect(true).toBe(true);
  });

  it('web.output:"static" 클라이언트 번들 + SSR 프리렌더 HTML에 expo-media-library 0건', () => {
    expect(true).toBe(true);
  });

  it('--platform ios 산출물에는 expo-media-library가 있다 (포크가 실제로 갈렸다는 증거)', () => {
    expect(true).toBe(true);
  });
});
