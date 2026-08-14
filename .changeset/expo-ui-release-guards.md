---
"@gj-kit/expo-ui": patch
---

패키지 내부 Git provenance stamp와 clean-check를 추가하고, 실제 packed tarball을 사용하는 Expo SDK 56 native/web/Node 소비자 검증을 릴리스 gate에 포함합니다. native 소비자는 `react-native-web` 없이도 동작하는 optional-peer 경계를, web/SSR 소비자는 해당 peer가 있을 때의 ESM/CJS 조건 해석을 검증합니다.
