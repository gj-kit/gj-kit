// tsup 엔트리 → `"./save"` 서브패스의 **비네이티브 포크**(설계 문서 §2.1 · §8.5).
//
// ⚠ 서브패스가 아니다 — exports 맵의 `node`/`browser` 브랜치 타깃일 뿐이며, 타입은 네이티브
//   포크와 같은 `dist/save.d.ts`를 가리킨다(§8.4-3). 그래서 이 포크의 공개 표면에는
//   `Document`·`typeof fetch`가 나타날 수 없다(§2.4 파생 규칙) — DOM은 구현 내부에만 있다.
//
// peer: **없음**. `expo-media-library` import 0이 이 파일의 존재 이유다.

export { expoDeviceSave } from './save/web';
