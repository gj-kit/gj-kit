# @gj-kit/expo-media

## 0.1.1

### Patch Changes

- 5f67c95: Add npm metadata that links each package to its source directory and issue tracker on GitHub.

## 0.1.0

### Minor Changes

- 첫 릴리스: Expo/React Native 사진·동영상 파이프라인 — 어댑터 seam + 하드닝 보존

  - 골든패스: `createMediaKit`(expo 기본 어댑터 내장) + `with*`로 능력 부착(피커·기기 라이브러리·기기 저장). `with*`는 구체 킷을 반환하므로 조건부 타입 0
  - 팩토리 7종(`./core`): createLocalUploads / createBinaryUploads / createPickerFlows / createDeviceLibrary / createDeviceUploads / createMediaSaver / createStagingCache — 각 팩토리가 자기가 실제로 쓰는 의존만 필수 인자로 받는다(스텁 0)
  - 공개 서브패스 8종: `.` · `./core` · `./picker` · `./device` · `./save` · `./video` · `./web` · `./testing`. peer 5종 전부 optional이며 "어느 엔트리를 import했나"가 peer 그래프를 결정한다 — dist-peer-graph 가드가 조건 3세트 × 모듈 2형식으로 CI 단언
  - 런타임 의존성 0: 순수 TS 증분 SHA-256 내장(js-sha256 제거, node:crypto 대조 13종 크기 검증)
  - 코어 순수성: `src/core/**`에 react-native·expo-\* import 0, DOM 전역 참조 0 — tsconfig.core.json(소스)과 dist 픽스처 가드 2종이 정적으로 강제
  - 문구 주입: MediaStrings 22키 + en/ko 번들. string-guard가 사용자 노출 리터럴의 재유입을 정적 차단
  - 에러: MediaError 16코드 + Symbol.for 태그(엔트리 간 코어 복제에도 `isMediaError`가 성립). 전신의 bare Error 9사이트가 전부 코드화됨
  - 텔레메트리: track/begin 스팬 계약 + succeed/fail/cancel 3상태, 안정적 operation 6종과 sizeBucket 경계를 계약으로 고정
  - 비네이티브 포크: `./device`·`./save`가 exports의 node·browser 조건으로 갈라져 웹·SSR 번들에 expo-media-library를 넣지 않는다(dist-peer-graph 가드가 CI 상시 확인, Metro 실측 재현인 web-export-guard는 픽스처 필요로 기본 skip)
  - 하드닝 보존 11종 + 추가 17종: iOS 26 URLSession 크래시 회피, PhotoKit ph:// 핸드오프, Android fileSize 불일치, 웹 duration 초/밀리초, Android 13+ granular 권한, iCloud 기본 차단 + 15s/60s 이중 타임아웃, 스테이징 사본 정리, 서명 URL 로그 유출 차단, base64 청크 3배수 정렬, 혼합 드롭 부분 업로드 방지, EXIF 로컬 타임존 해석 — 각 항목마다 그것을 지키는 가드·유닛 테스트가 있다
  - `./testing`(peer 0): 인메모리 파일시스템, 기록형 transport·telemetry, 페이크 피커·기기 라이브러리·업로드 API, EXIF·서명 URL 픽스처
