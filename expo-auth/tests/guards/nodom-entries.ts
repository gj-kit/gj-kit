// 무DOM dist 가드의 입력 — 공개 서브패스 **3개 전부** (설계 문서 §5.3 nodom-dist-guard 행).
//
// expo-media와 달리 예외 엔트리가 없다: 이 패키지는 DOM 타입이 공개 시그니처에 나타나도
// 되는 엔트리가 하나도 없고, 그래서 DOM 각인(stamp-dom-reference)도 없다 (§2.4).
//
// ⚠ `@ts-nocheck`는 이 파일 자체의 진단만 끈다. 잡으려는 것은 `dist/*.d.ts` 내부의
//   TS2304이므로 가드의 검출력은 그대로다. 끄는 이유: 이 파일은 tsconfig.tests.json의
//   대상이기도 한데 거기에는 이 픽스처 전용 paths 매핑이 없어 pnpm typecheck가 TS2307로
//   깨진다. 상대경로로 바꾸면 소비자가 실제로 쓰는 서브패스 지정자를 재현하지 못한다.
// @ts-nocheck
export type * as Index from '@gj-kit/expo-auth/index.js';
export type * as Storage from '@gj-kit/expo-auth/storage.js';
export type * as Testing from '@gj-kit/expo-auth/testing.js';
