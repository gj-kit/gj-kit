# @gj-kit/expo-auth

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

- 177f765: 신규 패키지 — Expo/React Native·웹 토큰 수명주기 코어. memorylog2의 토큰 갱신 기계(단일 비행·크로스탭 회전 채택·transient-never-logs-out·사전 갱신 스케줄러)를 seam 계약으로 승격했다. 런타임 의존성 0.

  - **`createAuthSession`**: 단일 비행 refresh(H4) + Web Locks 크로스탭 직렬화(H5) + 잠금 진입 후 선-재확인 채택(H2b) + 실패 후 재읽기 채택(H2) + invalid 시 시도 토큰 일치 때만 clear(H3) + **transient는 절대 로그아웃하지 않음**(H1). 로그아웃은 이벤트가 아니라 `RefreshOutcome` closed union(다섯 결말)이며 화면 전환은 caller 판단. `matchRefreshOutcome`으로 핸들러 키 누락 = 컴파일 에러.
  - **`runAuthorized`**: 401→refresh→재시도 **구조적 1회** — 재시도 실행분에서 갱신 경로 재진입이 표현 불가능. `shouldRetryAfterRefresh` 필수(앱 에러 어휘 결합 0).
  - **사전 갱신 스케줄러**: lead 90s·min 30s·기본 TTL 14분 보존 + 연속 transient **지수 백오프**(상한 `transientMaxDelayMs`, 기본 5분 — 고정 30s 무한 재시도 self-DoS 차단). TTL 출처 우선순위: 서버 권위 `accessTtlSeconds`(로그인·갱신) → 전략(기본: atob 무의존 JWT exp 디코드) → fallback.
  - **`./storage`**: 플랫폼 중립 단일 팩토리 `createTokenStorage` — exports `node`/`browser` 조건 포크가 SecureStore 구현(네이티브)/웹 스토리지 구현(웹·SSR 메모리 후퇴)을 선택한다. 웹 번들에 expo-secure-store 미포함(dist-peer-graph 가드가 조건 3세트×2형식으로 검증). 웹 분기는 인메모리 캐시 없는 read-through — storage 이벤트 순서 무의존으로 크로스탭 fresh-read 보장. `createWebLocksRefreshLock`은 양 분기 실동작(부재 시 직행 폴백). persistence 모드-스티키(H14)·반쪽 상태 null 수렴(H12).
  - **`./testing`**: `createMemoryTokenStorage`(크로스탭 회전/clear 시뮬레이터)·`createManualClock`·`createFakeRefreshLock`(hold/releaseNext)·`createScriptedRefreshRequest`·`createUnsignedTestJwt` — 앱이 자기 refresh 분류를 각본으로 시험 가능.
  - **optional peer는 `expo-secure-store >=14.0.0` 하나** — 네이티브 분기 파일에서만 정적 import (하한은 npm 레지스트리 14.0.0 타르볼 d.ts 실측으로 확정: getItemAsync/setItemAsync/deleteItemAsync 3종 시그니처 존재).
  - 토큰 유출 정적 가드(token-guard)·코어 순수성 가드(entry-guard)·무DOM d.ts 가드(nodom-dist-guard) 동봉. `decodeJwtExpiryEpochSeconds`는 서명 검증 없는 payload 디코드임을 이름·TSDoc·README 3중 명시.
