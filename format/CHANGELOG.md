# @gj-kit/format

## 0.1.2

### Patch Changes

- 73379a8: docs: lead every README with the payoff instead of the taxonomy

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

## 0.1.1

### Patch Changes

- 9c3cbc4: Publish English-first and Korean README files, add package discovery metadata, and link every package to the generated global API documentation portal.

## 0.1.0

### Minor Changes

- a53e539: 신규 패키지 — memorylog2 admin/mobile에 3중복돼 있던 포매팅 유틸의 통합. 두 앱이 갈라진 축(로컬/UTC 시간대, ₩1,000/1,000원 통화 표기, 날짜 구분자, 상대시간 카피, 바이트 단위 표기, 0바이트 처리)을 전부 **필수 옵션**으로 승격해, 어느 쪽도 조용한 기본값이 되지 않게 한다.

  - 날짜 3종(`formatDateTime`·`formatDateOnly`·`formatMonthDayTime`): `timeZone`('UTC'|'device'|IANA) 필수 — 생략은 컴파일 에러. 입력은 `Date | number`(instant)만 받는다.
  - `parseIsoInstant`: offset 없는 ISO 문자열의 해석(`assumeNoOffset: 'utc'|'device'|'reject'`)을 필수 축으로 만든다 — 같은 문자열이 기기마다 다른 순간이 되던 문제를 호출부에 드러낸다. 자체 파서라 엔진 편차가 없다.
  - 상대시간(`formatRelativeKo`·`relativeBucket`): `now` 명시 — 시계 없는 순수 함수. 두 앱의 카피 차이(공백·방금 전·어제·7일 컷오프)를 옵션으로 전부 표현.
  - `formatKrw`: `style: 'symbol' | 'suffix-ko'` + `locale` 필수. 출력 형태는 로케일에 위임하지 않는다(`₩` 글리프·위치 고정).
  - `formatBytes`: `system: 'decimal' | 'binary'` 필수(KB vs KiB), `nonPositive` 필수, 단위별 `fractionDigits`로 네 소스 구현의 반올림 정책을 표현.
  - 런타임 의존성 0. Intl은 Hermes(Expo SDK 56 / RN 0.85) 지원 부분집합만 사용 — `DateTimeFormat`의 파트 분해 API·`RelativeTimeFormat` 등 미지원 API는 guard 테스트가 정적으로 금지하고, 런타임 Intl 결함은 런타임 1회 자기검사가 탐지한다(`canFormatTimeZone`으로 사전 질의 가능).
  - 값 오류(null·invalid)는 `fallback` 반환, 설정 오류(잘못된 IANA 이름)는 typed `FormatError`로 즉시 throw.
