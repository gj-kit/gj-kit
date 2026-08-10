// tsup 엔트리 → `"./device"` 서브패스의 **비네이티브 포크**(설계 문서 §2.1 · §8).
//
// ⚠ 서브패스가 아니다 — 소비자가 `@gj-kit/expo-media/device.web`으로 import할 수 없다.
//   exports 맵의 `node`/`browser` 브랜치 타깃일 뿐이며, 타입은 네이티브 포크와 같은
//   `dist/device.d.ts`를 가리킨다(§8.4-3).
//
// `.web.`은 "브라우저 전용"이 아니라 **"비네이티브"**다(§8.4-7): `browser`(클라이언트 번들)와
// `node`(SSR·RSC·Node 스크립트)가 같은 산출물을 받는다. 둘 중 하나라도 빠지면 §8.2 케이스 H
// (SSR 번들이 네이티브 포크를 끌어와 빌드 실패 또는 하이드레이션 불일치)가 재발한다.
//
// peer: **없음**. 이 파일의 존재 이유가 그것이다.

export { expoDeviceLibrary } from './device/web';
