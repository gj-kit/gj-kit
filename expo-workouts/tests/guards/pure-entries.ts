// 순수성 dist 가드의 입력 — peer 0을 약속한 엔트리 4개 (설계 §2.2 불변식).
//
// `dist/index.d.ts`(네이티브 브랜치)는 **일부러 빠져 있다**: 그 엔트리는 `expo` 타입을 참조해도
// 되는 유일한 산출물이고, `types: []` + peer 미설치 조건에서 컴파일할 수 없는 것이 정상이다.
//
// ⚠ `@ts-nocheck`는 이 파일 자체의 진단만 끈다. 잡으려는 것은 `dist/*.d.ts` **내부**에서 보고되는
//   TS2304이므로 검출력은 그대로다(가드 테스트가 위반 주입으로 이를 증명한다). 끄는 이유는
//   하나다 — 이 파일이 `tsconfig.tests.json`의 대상이기도 한데 거기에는 이 픽스처 전용 `paths`
//   매핑이 없어 `pnpm typecheck`가 TS2307로 깨진다.
// @ts-nocheck
export type * as Core from '@gj-kit/expo-workouts/core.js';
export type * as Testing from '@gj-kit/expo-workouts/testing.js';
export type * as Plugin from '@gj-kit/expo-workouts/plugin.js';
export type * as Unsupported from '@gj-kit/expo-workouts/index.unsupported.js';
