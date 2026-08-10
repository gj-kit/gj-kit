// 설계 문서 §2.1 · §2.2 · §5.6 — `"./video"` 엔트리 배럴.
//
// peer: `expo-video-thumbnails` **하나뿐**이다(react-native도 필요 없다). 동영상을 올리지 않는
// 소비자는 이 엔트리를 import하지 않으므로 그 패키지를 설치하지 않아도 된다(§2.2 시나리오표).
//
// ⚠ 타입은 재export하지 않는다 — 이유는 `src/picker.ts` 주석과 같다.

export { expoVideoPoster } from './video/expo';
