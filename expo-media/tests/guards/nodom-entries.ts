// 무DOM dist 가드의 입력 (설계 문서 §2.4 전문 그대로) — 공개 서브패스 8 중 `./web`을 제외한 7개.
//
// `./web`만 빠지는 이유: DOM 타입이 공개 시그니처에 나타나도 되는 엔트리는 그 하나뿐이고,
// 그래서 그 하나에만 `/// <reference lib="dom" />`을 각인한다(§2.4 파생 규칙).
// **각인 대상은 "이 가드가 실패하는 엔트리"로 기계적으로 결정된다** — 여기 있는 7개 중
// 하나라도 실패하면 각인을 늘리는 게 아니라 소스를 고친다.
//
// ⚠ `@ts-nocheck`는 이 파일 자체의 진단만 끈다. 우리가 잡으려는 것은 `dist/*.d.ts` **내부**에서
//   보고되는 TS2304이므로 가드의 검출력은 그대로다(가드 테스트가 위반 주입으로 이를 증명한다).
//   끄는 이유는 하나다 — 이 파일이 `tsconfig.tests.json`(`include: ["src","tests"]`)의 대상이기도
//   한데, 거기에는 이 픽스처 전용 `paths` 매핑이 없어 `pnpm typecheck`가 TS2307로 깨진다.
//   경로를 상대경로로 바꾸면 소비자가 실제로 쓰는 서브패스 지정자를 재현하지 못한다.
// @ts-nocheck
export type * as Core from '@gj-kit/expo-media/core.js';
export type * as Index from '@gj-kit/expo-media/index.js';
export type * as Picker from '@gj-kit/expo-media/picker.js';
export type * as Device from '@gj-kit/expo-media/device.js';
export type * as Save from '@gj-kit/expo-media/save.js';
export type * as Video from '@gj-kit/expo-media/video.js';
export type * as Testing from '@gj-kit/expo-media/testing.js';
