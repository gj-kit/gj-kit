// tsup 엔트리 → `"./device"` 서브패스의 **네이티브 포크**(설계 문서 §2.1 · §2.3).
//
// 짝: `src/device.web.ts`(비네이티브 포크). 어느 쪽이 실릴지는 package.json exports의
// `node`/`browser` 조건이 결정하며, **포크 라우팅은 그 한 곳에만 존재한다**(§8.4-5 — 두 진실 금지).
// 전신의 `.web.ts` 파일명 규약(Metro의 플랫폼 확장자 해석 의존)은 폐지됐다: tsup은 번들러라
// 파일 구조를 보존하지 않으므로 그 규약은 빌더를 바꾸는 순간 **조용히 죽는다**(§8.1).
//
// peer: `expo-media-library`(`/legacy`). `"."`·`"./core"`는 이 엔트리를 import하지 않는다(§2.2 불변식).

export { expoDeviceLibrary } from './device/expo';
