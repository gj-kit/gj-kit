---
'@gj-kit/toss-payments-postgresql': patch
'@gj-kit/nest-operations-jobs': patch
'@gj-kit/toss-payments-nestjs': patch
'@gj-kit/nest-notifications': patch
'@gj-kit/expo-workouts': patch
'@gj-kit/toss-payments': patch
'@gj-kit/expo-media': patch
'@gj-kit/expo-auth': patch
'@gj-kit/expo-ui': patch
'@gj-kit/format': patch
---

docs: lead every README with the payoff instead of the taxonomy

패키지 README와 문서 포털을 전면 개편했다. 기존 문서는 경계와 금지 사항부터 나열해서, 처음 보는 사람이 이 패키지를 왜 써야 하는지 판단할 근거가 없었다.

각 README는 이제 다음 순서로 읽힌다.

- npm·CI·types·runtime deps·license 배지
- tagline — 이 패키지가 무엇을 불가능하게 만드는지 한 줄
- "왜 필요한가" — 이 패키지 없이 실제로 나는 사고
- "무엇으로 막는가" — 실제 export 심볼로 추적 가능한 항목 4~5개
- Golden path — 기존과 동일
- "실제로는 이렇게 걸립니다" — payoff가 드러나는 두 번째 예제
- "주장 대신 검증" — 측정한 숫자만

문구 정본은 `website/src/data/catalog.mjs` 하나이고 README 20종과 포털이 여기서 생성된다. 추가한 예제는 전부 `check:readme`가 dist 타입에 대해 컴파일을 검증하며, `check:docs`와 `check:readme`가 tagline·problem·highlights·배지의 존재를 검사한다. `localize-readmes.mjs`는 "runtime deps 0" 배지가 사실인지도 함께 강제한다.

공개 API는 변경되지 않았다.
