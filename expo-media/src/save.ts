// tsup 엔트리 → `"./save"` 서브패스의 **네이티브 포크**(설계 문서 §2.1 · §2.3).
//
// 짝: `src/save.web.ts`(비네이티브 포크 — 브라우저 다운로드). 포크 라우팅은 package.json
// exports 한 곳에만 있다(§8.4-5).
//
// peer: `expo-media-library`(`/legacy`) · `react-native`(`Platform.OS` — Android Expo Go 판정).

export { expoDeviceSave } from './save/expo';
