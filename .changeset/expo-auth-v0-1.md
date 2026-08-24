---
"@gj-kit/expo-auth": minor
---

신규 패키지 — Expo/React Native·웹 토큰 수명주기 코어. memorylog2의 토큰 갱신 기계(단일 비행·크로스탭 회전 채택·transient-never-logs-out·사전 갱신 스케줄러)를 seam 계약으로 승격했다. 런타임 의존성 0.

- **`createAuthSession`**: 단일 비행 refresh(H4) + Web Locks 크로스탭 직렬화(H5) + 잠금 진입 후 선-재확인 채택(H2b) + 실패 후 재읽기 채택(H2) + invalid 시 시도 토큰 일치 때만 clear(H3) + **transient는 절대 로그아웃하지 않음**(H1). 로그아웃은 이벤트가 아니라 `RefreshOutcome` closed union(다섯 결말)이며 화면 전환은 caller 판단. `matchRefreshOutcome`으로 핸들러 키 누락 = 컴파일 에러.
- **`runAuthorized`**: 401→refresh→재시도 **구조적 1회** — 재시도 실행분에서 갱신 경로 재진입이 표현 불가능. `shouldRetryAfterRefresh` 필수(앱 에러 어휘 결합 0).
- **사전 갱신 스케줄러**: lead 90s·min 30s·기본 TTL 14분 보존 + 연속 transient **지수 백오프**(상한 `transientMaxDelayMs`, 기본 5분 — 고정 30s 무한 재시도 self-DoS 차단). TTL 출처 우선순위: 서버 권위 `accessTtlSeconds`(로그인·갱신) → 전략(기본: atob 무의존 JWT exp 디코드) → fallback.
- **`./storage`**: 플랫폼 중립 단일 팩토리 `createTokenStorage` — exports `node`/`browser` 조건 포크가 SecureStore 구현(네이티브)/웹 스토리지 구현(웹·SSR 메모리 후퇴)을 선택한다. 웹 번들에 expo-secure-store 미포함(dist-peer-graph 가드가 조건 3세트×2형식으로 검증). 웹 분기는 인메모리 캐시 없는 read-through — storage 이벤트 순서 무의존으로 크로스탭 fresh-read 보장. `createWebLocksRefreshLock`은 양 분기 실동작(부재 시 직행 폴백). persistence 모드-스티키(H14)·반쪽 상태 null 수렴(H12).
- **`./testing`**: `createMemoryTokenStorage`(크로스탭 회전/clear 시뮬레이터)·`createManualClock`·`createFakeRefreshLock`(hold/releaseNext)·`createScriptedRefreshRequest`·`createUnsignedTestJwt` — 앱이 자기 refresh 분류를 각본으로 시험 가능.
- **optional peer는 `expo-secure-store >=14.0.0` 하나** — 네이티브 분기 파일에서만 정적 import (하한은 npm 레지스트리 14.0.0 타르볼 d.ts 실측으로 확정: getItemAsync/setItemAsync/deleteItemAsync 3종 시그니처 존재).
- 토큰 유출 정적 가드(token-guard)·코어 순수성 가드(entry-guard)·무DOM d.ts 가드(nodom-dist-guard) 동봉. `decodeJwtExpiryEpochSeconds`는 서명 검증 없는 payload 디코드임을 이름·TSDoc·README 3중 명시.
