// 설계 문서 §2.1 · §2.2 · §5.6 — `"./picker"` 엔트리 배럴.
//
// peer: `expo-image-picker`. 이 엔트리를 import하지 않는 소비자는 그 패키지를 설치할 필요가 없다 —
// Metro/번들러는 도달 가능한 그래프만 해석하고, `splitting: false`가 이 import를 다른 dist 파일로
// 복제되지 않게 한다(§3.2). `dist-peer-graph` 가드가 §2.2 표와 산출물을 대조한다.
//
// ⚠ 타입(`PickerAdapter`·`PickedAsset` 등)은 여기서 재export하지 않는다. 계약의 주소는
//   `"./core"` 하나이며, 두 곳에서 나가면 소비자가 서로 다른 사본을 집어 구조적으로만
//   호환되는 두 타입이 생긴다.

export { expoPicker } from './picker/expo';
