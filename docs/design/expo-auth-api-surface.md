# @gj-kit/expo-auth — 공개 API 표면 설계 (확정)

> 작성: 2026-08-24 · 동일자 설계 리뷰 13건 반영 개정. 여섯 번째 패키지.
> 전신: memorylog2 `apps/mobile/src/auth/tokenStorage.ts`(**122줄**) + `src/auth/authPersistence.ts`(15줄) + `src/api/client.ts`(**355줄**) 중 토큰 갱신 기계(±170줄) + 소비 지점 `src/auth/AuthProvider.tsx`(275줄).
> 형식·깊이 기준: `docs/design/expo-media-api-surface.md`. 구현 코드의 주석은 이 문서의 §번호를 역참조한다.
> 패키지 경계 근거(AGENTS.md §1): 토큰 수명주기·크로스탭 갱신 조율은 UI도 미디어도 아니고, 플랫폼 경계(SecureStore/웹 스토리지)와 동시성 하드닝이라는 **일반적 hardening**이므로 focused package로 승격한다. HTTP 클라이언트·에러 어휘·telemetry는 앱에 남긴다(§6).

---

## 0. 채택 맵 — 어느 앱 코드가 어느 API가 되는가

### 0.1 원본 실측

| 원본 | 줄수 | 내용 |
|---|---|---|
| `src/auth/tokenStorage.ts` | 122 | SecureStore(네이티브) / localStorage+sessionStorage(웹, persist 플래그), 모듈 전역 인메모리 캐시, **import 시점** storage 이벤트 리스너(크로스탭 캐시 무효화) |
| `src/api/client.ts` 176-343 | ~170 | `refreshTokens` 단일 비행, Web Locks 크로스탭 직렬화, 401→refresh→재시도 1회, transient/invalid 판별(**transient는 절대 로그아웃하지 않음**), 크로스탭 회전 토큰 채택, 사전 갱신 타이머(lead 90s·min 30s·기본 TTL 14분), `refreshIfExpiringSoon`, `decodeJwtExp`(atob 의존) |
| `src/auth/authPersistence.ts` | 15 | `persist=1/0` 쿼리 파라미터 인코딩/디코딩 |
| 소비 지점 | — | AuthProvider.tsx(부팅 복원·로그인·로그아웃·visibilitychange→eager refresh·만료 핸들러), client.ts(bearer 주입·재시도), kakaoWebSocial.ts(getTokens 2), clientActivityReporter.ts(getTokens 1) |

### 0.2 채택표 (원본 → 새 주소)

| 원본 코드 | 새 주소 | 변형 |
|---|---|---|
| `tokenStorage.ts` 전체 | `"./storage"` — `createTokenStorage`(**단일 중립 팩토리** — exports 조건 포크가 SecureStore/웹 구현을 선택, §2.2) + `"."`의 `TokenStorage` seam | ① `Platform.OS` 런타임 포크 → **exports 조건 포크가 구현 자체를 교체**(웹 번들에서 expo-secure-store가 그래프에서 사라지고 — 원본은 웹 번들에도 들어갔다 — 소비 앱의 플랫폼 분기도 함께 사라진다, §1-2). ② 모듈 전역 `memoryTokens`/`memoryPersist` + import 시점 리스너 → **팩토리 소유 상태**, 웹 분기는 캐시·리스너를 아예 갖지 않아(read-through — §3.8) `sideEffects:false`가 구조로 성립. ③ 하드코딩 `"memorylog."` 키 프리픽스 → **필수 인자 `keyPrefix`**(앱 이름 유출 제거 — expo-media의 `"memorylog-upload-"` 교훈과 동종) |
| `client.ts:176-229` `refreshTokens`/`refreshTokenRequest` | `"."` `createAuthSession(...).refresh()` | 엔드포인트 `"/auth/refresh"`·`AuthTokens` 형태·`requestWithAuth` 결합 제거 → **`RefreshRequest` 콜백 계약**(§3.3). transient/invalid 판별을 서버 응답 해석이 아니라 **콜백 반환 유니언**으로 받는다 |
| `client.ts:263-272` `withRefreshLock` | `"."` `RefreshLock` seam + `"./storage"` `createWebLocksRefreshLock` | navigator.locks 구조적 접근·부재 시 직행 폴백 그대로. 잠금 이름 `"memorylog-token-refresh"` → **필수 인자 `name`** |
| `client.ts:132-147` 401→refresh→재시도 1회 | `"."` `session.runAuthorized(run, { shouldRetryAfterRefresh })` | `allowRefresh` boolean 재귀 → **구조적 재시도-1회**(두 번째 갱신이 표현 불가능, §3.5). "만료 헤더 버리고 새 토큰으로" 계약은 `run`이 매 호출 인자로 새 accessToken을 받는 형태로 보존 |
| `client.ts:282-320` 사전 갱신 타이머·`refreshIfExpiringSoon` | `"."` `session.scheduleRefresh()`/`cancelScheduledRefresh()`/`refreshIfExpiringSoon()` | 전역 `setTimeout` → **`AuthClock` 주입**(기본: 시스템). 상수 3종은 기본값 유지 + `schedule` 옵션 |
| `client.ts:330-343` `decodeJwtExp` | `"."` `decodeJwtExpiryEpochSeconds` | **atob 의존 제거** — 순수 TS base64url 디코더 내장(§3.6). 원본은 atob 부재 환경에서 조용히 null→기본 TTL로 후퇴했고 `refreshIfExpiringSoon`이 무력화됐다 |
| `client.ts:26-31,274-278` `setAuthSessionExpiredHandler`/`expireAuthSession` | **제거** → `RefreshOutcome` typed outcome + `onScheduledOutcome` | 로그아웃은 이벤트가 아니다 — `refresh()`가 `{ status:'invalid', tokensCleared }`를 반환하고 **caller가 판단**한다(§3.4). 전역 가변 핸들러 싱글턴 소멸 |
| `authPersistence.ts` persist 개념 | `"."` `TokenPersistence = 'durable' \| 'session'` | boolean → 명명 유니언. **URL 쿼리 인코딩(`persist=1/0`)은 앱 라우팅 정책이므로 승격하지 않는다**(§6-4) |
| `client.ts` ApiError/ApiTransportError/bearer 주입/telemetry 스팬 | **승격 안 함** | §6-1·2·3 |

### 0.3 하드닝 보존 매핑 (원본 주석·코드가 증언하는 사고 모드 — 하나도 잃지 않는다)

| # | 하드닝 (원본 위치) | 새 주소 | 지키는 테스트 |
|---|---|---|---|
| H1 | **transient 갱신 실패는 절대 로그아웃하지 않는다** — 토큰 보존, 원래 401을 caller에 표면화 (client.ts:141-147, 225-227) | `refresh()` → `{ status:'transient' }`, 저장소 무변경. `runAuthorized`는 원본 에러 재던짐 | unit: transient 스크립트 후 storage 불변 + outcome 단언 |
| H2 | 크로스탭 단일사용 refresh 토큰 회전 채택 — 실패 후 재읽기, 다른 토큰이면 로그아웃 대신 채택 (client.ts:208-215) | `refresh()` → `{ status:'adopted', tokens }` | unit: 요청 중 `simulateExternalRotation` → adopted |
| H2b | **(신설)** 잠금 진입 후 선-재확인 — 잠금 대기 중 다른 탭이 이미 회전했으면 회전을 소비하지 않고 채택 | `refresh()` 잠금 내부에서 진입 전 스냅샷과 대조 | unit: FakeRefreshLock 대기 중 회전 → 콜백 호출 0회 · jsdom: storage 이벤트를 잠금 grant 뒤로 지연시켜도 'adopted' (§5.2) |
| H3 | invalid 시 저장 토큰이 시도한 토큰과 같을 때만 clear (client.ts:220-223) | `{ status:'invalid', tokensCleared: boolean }` | unit: 시도 중 회전 + invalid 응답 → tokensCleared:false |
| H4 | 탭 내 단일 비행 promise (client.ts:176-184) | 세션 인스턴스 내부 단일 비행 | unit: 동시 refresh() 10회 → 콜백 1회 |
| H5 | Web Locks 크로스탭 직렬화 + 부재 시 직행 폴백 (client.ts:263-272) | `RefreshLock` seam + `createWebLocksRefreshLock` | unit: FakeRefreshLock `maxConcurrency === 1` |
| H6 | 401→refresh→**재시도 1회**, 만료 authorization 폐기 (client.ts:132-139) | `runAuthorized` — 재시도 경로에서 refresh 재진입 구조적 불가 | unit: 두 번 연속 401 → refresh 1회·run 2회 |
| H7 | lead 90s · min 30s · 기본 TTL 14분 (client.ts:22-24) | `RefreshScheduleOptions` 기본값 | unit: ManualClock 지연 계산 3분기 + signIn `accessTtlSeconds` ①순위 발화 (§5.2) |
| H8 | 사전 갱신 transient 실패 → 짧은 재스케줄 (client.ts:304-311) | 스케줄러 내부 — 단 고정 30s 무한 루프 대신 **연속 transient 지수 백오프**(상한 `transientMaxDelayMs` — §3.5·§7-8) | unit: transient 연속 → 30s·60s·120s·…·상한 클램프, 'refreshed' 후 리셋 |
| H9 | 포그라운드 복귀 eager refresh, 임계 120s (client.ts:315-320) | `refreshIfExpiringSoon({ thresholdSeconds })` | unit: 임계 경계 ±1s |
| H10 | 인메모리 캐시로 stale-토큰 경합 창 축소 (tokenStorage.ts:72-74) | **네이티브 분기 전용**(단일 프로세스 — 외부 쓰기 주체가 없어 캐시가 §3.1 freshness와 양립). 웹 분기는 캐시가 H2b/H3의 fresh-read 전제를 깨므로 **read-through로 대체** (§3.8) | unit(네이티브 경로): 연속 getTokens → 기저 read 1회 · jsdom(웹): 외부 쓰기가 이벤트 없이도 다음 getTokens에 즉시 반영 |
| H11 | 크로스탭 storage 이벤트 캐시 무효화 (tokenStorage.ts:109-122) | **기각·구조 대체**: 웹 분기는 캐시 자체를 제거(read-through — §3.8). storage 이벤트 태스크와 Web Lock grant 태스크는 순서 무보장이라 이벤트 기반 무효화는 H2b/H3의 fresh-read 전제를 못 지키고, 원본의 키 정확일치 검사는 `localStorage.clear()`(event.key===null)를 놓치는 버그이기도 했다 | unit(jsdom): 이벤트 전달 없는 외부 쓰기/clear() → 다음 getTokens 즉시 반영/null; 이벤트를 잠금 grant 뒤로 지연시켜도 H2b → 'adopted' |
| H12 | 두 토큰 모두 있어야 반환 — 반쪽 상태는 null 수렴 (tokenStorage.ts:56-77) | 두 storage 구현 공통 규칙 | unit: 한 키 삭제 → null |
| H13 | JWT 디코드 실패 → null → 기본 TTL, throw 금지 (client.ts:330-343) | `decodeJwtExpiryEpochSeconds` | unit: 손상 payload 픽스처 → null |
| H14 | 세션 로그인 후 토큰 회전이 durable로 승격되지 않음 — persist 모드 스티키 (tokenStorage.ts:62-64, 84-86) | `setTokens`의 `persistence` 생략 = 현재 모드 유지 | unit: session 저장 → 옵션 없는 setTokens → sessionStorage에만 존재 |

---

## 1. 설계 원칙

전신의 핵심 결함은 기능이 아니라 **결합과 전역 상태**다:

1. 갱신 기계가 `API_BASE_URL`·`"/auth/refresh"`·`AuthTokens`·telemetry에 물려 있어 **호스트 앱 밖에서 한 줄도 재사용할 수 없다.**
2. 모듈 전역 가변 상태 4개(`memoryTokens`·`memoryPersist`·`refreshPromise`·`proactiveTimer`) + **import 시점 이벤트 리스너** — `sideEffects:false` 불가, 테스트 격리 불가, 인스턴스 2개 불가.
3. 저장 계층이 `Platform.OS` 런타임 포크 + expo-secure-store 정적 import — Metro는 정적 import를 분기 뒤에 있어도 그래프에 넣으므로(expo-media §0.4 기각 12) **웹 번들에 SecureStore가 들어간다.**
4. `decodeJwtExp`가 전역 `atob`에 의존 — 부재 환경에서 사전 갱신·eager refresh가 조용히 무력화.
5. `"memorylog."` 키·`"memorylog-token-refresh"` 잠금 이름으로 호스트 앱 이름이 범용 모듈에 샜다.

이번 불변식:

1. **코어는 순수하다.** `"."`의 그래프는 `react`·`react-native`·`expo-*` import 0, DOM 전역 참조 0(`window`·`document`·`navigator`·`localStorage` 문자열 0 — entry-guard가 grep), 런타임 의존성 0. `setTimeout`/`Date.now`조차 기본 구현일 뿐 `AuthClock` seam 뒤에 있다.
2. **플랫폼 포크는 라이브러리가 소유한다.** `"./storage"` 하나가 exports `node`/`browser` 조건으로 갈리고(expo-media §8 확정 해법 계승 — bare `react-native` 키 금지, `node` 브랜치 필수), 소비 앱은 `Platform.OS` 분기도 앱측 `.native.ts`/`.web.ts` 파일 쌍도 쓰지 않는다 — 공개 팩토리가 플랫폼 중립 단일 이름이라 조립 파일이 하나다(§2.2·§3.9).
3. **peer 경계 = 엔트리 경계 = 분기 경계.** expo-secure-store는 `"./storage"` **네이티브 분기 파일에서만** 정적 import한다. 런타임 `try/require`·동적 import 금지. `dist-peer-graph` 가드가 조건 3세트×모듈 2형식으로 단언한다(§5.3).
4. **로그아웃은 라이브러리가 결정하지 않는다.** 갱신의 다섯 결말을 `RefreshOutcome` closed union으로 반환하고, 화면 전환·상태 초기화는 caller 판단이다. 단 **저장소 정리는 라이브러리 책임**이다(invalid 확정 시 — H1·H3의 규율 그대로).
5. **토큰 바이트는 라이브러리 밖으로 새지 않는다.** 에러 메시지·로그 인자·outcome의 어떤 문자열 필드에도 토큰이 들어가지 않는다(토큰은 `tokens` 필드의 정형 값으로만 흐른다). token-guard가 정적으로 강제한다(§4.2).
6. **정직한 이름.** JWT exp 파싱은 **서명 검증 없는 payload 디코드**다. 스케줄링 힌트이지 신뢰 경계가 아니며, 함수 TSDoc 첫 줄과 README에 명시한다(§3.6).
7. **공개 옵셔널 필드는 전부 `?: T \| undefined`** (EOP 소비자 보호 — expo-ui §2 계승). 모든 입력 객체는 readonly.

---

## 2. 모듈 구조와 exports 맵

### 2.1 디렉토리 트리

> **개수 정본**: 공개 서브패스 = **3** (`.` · `./storage` · `./testing`) · tsup 엔트리 = **4** = 공개 3 + 조건 포크 1(`src/storage.web.ts`).
> 포크 파일은 exports 맵의 `node`/`browser` 브랜치 타깃일 뿐 서브패스가 아니다 — `@gj-kit/expo-auth/storage.web`으로 import할 수 없다.

```
expo-auth/                          # @gj-kit/expo-auth
├─ package.json                     # version 0.0.0(§2.5), sideEffects:false, ESM+CJS(tsup), 런타임 의존성 0
├─ tsup.config.ts                   # entry 4, splitting:false, external:['expo-secure-store']
├─ tsconfig.json                    # lib:["ES2022"] — DOM lib 불필요(§2.4)
├─ tsconfig.tests.json
├─ scripts/check-readme.mjs         # expo-media에서 복제, paths 3개 공개 서브패스
├─ scripts/stamp-provenance.mjs     # expo-media 복제 — 패키지명만 교체
├─ scripts/check-provenance.mjs     # expo-media 복제 — prepack에서 --require-clean
└─ src/
   ├─ index.ts                      # "." 배럴
   ├─ storage.ts                    # "./storage" 네이티브 분기 — expo-secure-store 정적 import 유일 지점
   ├─ storage.web.ts                # "./storage" node/browser 분기 — peer 0
   ├─ testing.ts                    # "./testing" 배럴
   ├─ core/                         # react·react-native·expo·DOM 참조 0 (entry-guard 강제)
   │  ├─ types.ts                   # TokenPair·TokenPersistence·TokenStorage·RefreshLock·AuthClock·RefreshRequestResult
   │  ├─ outcome.ts                 # RefreshOutcome·EagerRefreshOutcome·matchRefreshOutcome (§3.4)
   │  ├─ errors.ts                  # AuthError(Symbol.for 태그) + 코드 2종 + isAuthError
   │  ├─ jwt.ts                     # base64url 디코더(atob 무의존) + decodeJwtExpiryEpochSeconds + describeAccessToken
   │  └─ session.ts                 # createAuthSession — 단일 비행·잠금·재시도 1회·스케줄러
   ├─ storage/
   │  ├─ shared.ts                  # 키 조립(`{keyPrefix}.accessToken`)·H12 수렴 규칙 — 분기 공용, peer 0 (인메모리 캐시는 네이티브 분기 전용 — §3.8)
   │  └─ webLock.ts                 # createWebLocksRefreshLock — globalThis 구조적 접근, 분기 공용, peer 0
   └─ testing/
      ├─ memoryStorage.ts           # createMemoryTokenStorage (+ 외부 회전/삭제 시뮬레이터)
      ├─ clock.ts                   # createManualClock
      ├─ lock.ts                    # createFakeRefreshLock
      └─ refresh.ts                 # createScriptedRefreshRequest + createUnsignedTestJwt
```

### 2.2 엔트리별 peer 표 (정본 — `dist-peer-graph` 가드가 이 표와 산출물을 대조한다)

| 엔트리 | 내용 | 정적 import하는 peer | 대표 소비자 |
|---|---|---|---|
| `"."` | `createAuthSession`, `TokenStorage`·`RefreshLock`·`AuthClock` seam, `RefreshOutcome`·`EagerRefreshOutcome`·`RefreshRequestResult` 유니언 + `matchRefreshOutcome`, `AuthError`+가드, `decodeJwtExpiryEpochSeconds`, `describeAccessToken` | **없음** (react-native조차 없음, DOM lib도 없음) | 모든 소비자. bare RN·Node 스크립트·커스텀 storage 구현자는 이것만 |
| `"./storage"` (네이티브 분기) | `createTokenStorage`(SecureStore 구현 — §3.8) · `createWebLocksRefreshLock`(직행 폴백으로 실동작) | `expo-secure-store` | Expo iOS/Android 앱 |
| `"./storage"` (node/browser 분기) | `createTokenStorage`(웹 스토리지 구현, SSR 메모리 후퇴 — §3.8) · `createWebLocksRefreshLock`(실구현) | **없음** | Expo Web·SSR·웹 관리자 도구 |
| `"./testing"` | 페이크 storage·시계·잠금·스크립트 갱신 콜백·무서명 테스트 JWT | **없음** | gj-kit unit 테스트, 소비 앱 테스트 |

**단일 중립 팩토리의 근거 (구판 "상호 스텁 쌍" 기각)**: 초안은 `createExpoSecureTokenStorage`/`createWebTokenStorage` 두 이름을 양 분기가 모두 export하고 반대 플랫폼을 `platform-unsupported` throw 스텁으로 두는 형태였다. 기각 — 그 형태에서 **팩토리 선택이 여전히 소비자 몫**이라, 유니버설 앱은 `Platform.OS` 분기(불변식 §1-2 위반)나 앱측 `.native.ts`/`.web.ts` 파일 쌍을 강요받는다. expo-media 판례의 실체도 "능력당 공개 이름 하나 + 조건 포크가 **행동**을 교체"이지 상호 스텁이 아니다(expoDeviceLibrary 웹 포크 = 빈 열거, expoDeviceSave 웹 포크 = 브라우저 다운로드 — 패밀리 어디에도 상호 스텁 팩토리는 없다). `createTokenStorage` 하나로 네이티브 분기 = SecureStore 구현, node/browser 분기 = 웹 스토리지 구현(SSR 메모리 후퇴)을 포크가 선택하므로: ① "잘못된 플랫폼의 팩토리 호출" 오용 자체가 **표현 불가능**해지고(구 §4.1-⑥ 삭제), ② 스텁 시절의 걱정 — 네이티브에서 웹 구현이 메모리 폴백으로 "동작하는 것처럼 보이지만 재시작마다 로그아웃" — 은 네이티브 그래프에 웹 구현이 아예 없으므로 성립하지 않으며, ③ 조건 분기 쌍의 d.ts 공유(§2.3)가 자명해진다. 미래의 네이티브 전용 SecureStore 옵션(§6-7)은 `TokenStorageOptions`에 additive 옵셔널로 수용한다(웹 분기는 무시 — TSDoc에 플랫폼 스코프 명시). **`createWebLocksRefreshLock`은 종전대로 양 분기 실동작** — "locks 있으면 잠금, 없으면 직행"(H5 폴백)이 양 플랫폼에서 동일 의미다.

**불변식**: `"."`은 `"./storage"`를 import하지 않는다(단방향 — 소비자가 조합). `"./testing"`은 `"."`만 import한다.

### 2.3 package.json exports (확정 형태)

expo-media §2.3의 규칙을 그대로 계승한다: bare `react-native` 키 금지(jest `['require','react-native']` 덫 — expo-media V2b 실측), 비네이티브 포크에 `node`+`browser` 브랜치 필수(`browser` 단독은 expo-router SSR 번들에서 깨진다 — expo-media V-B 실측), 조건 분기 쌍은 **d.ts를 공유**한다(공개 타입 표면은 플랫폼 불변).

```jsonc
{
  "name": "@gj-kit/expo-auth",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "files": ["dist"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./storage": {
      "node": {
        "import": { "types": "./dist/storage.d.ts", "default": "./dist/storage.web.js" },
        "require": { "types": "./dist/storage.d.cts", "default": "./dist/storage.web.cjs" }
      },
      "browser": {
        "import": { "types": "./dist/storage.d.ts", "default": "./dist/storage.web.js" },
        "require": { "types": "./dist/storage.d.cts", "default": "./dist/storage.web.cjs" }
      },
      "import": { "types": "./dist/storage.d.ts", "default": "./dist/storage.js" },
      "require": { "types": "./dist/storage.d.cts", "default": "./dist/storage.cjs" }
    },
    "./testing": {
      "import": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
      "require": { "types": "./dist/testing.d.cts", "default": "./dist/testing.cjs" }
    },
    "./package.json": "./package.json"
  },
  "peerDependencies": { "expo-secure-store": ">=14.0.0" },
  "peerDependenciesMeta": { "expo-secure-store": { "optional": true } }
}
```

⚠ **peer 하한 `>=14.0.0`은 잠정**이다. 사용하는 API는 `getItemAsync`/`setItemAsync`/`deleteItemAsync` 3종뿐이라 API 등장 기준으로는 훨씬 오래됐지만, exports 맵·ESM 산출 형태가 번들러 호환을 좌우하므로 **구현 단계에서 npm 레지스트리 타르볼 d.ts 실측으로 확정**한다(expo-media V-B 절차 — `">=54"`처럼 SDK 번호를 semver 자리에 쓰는 오답 금지). devDependency는 Expo SDK 56 라인으로 고정한다.

### 2.4 DOM 없는 웹 구현

웹 분기 `createTokenStorage`·`createWebLocksRefreshLock`은 DOM lib 없이 컴파일된다: `lib:["ES2022"]` 단일 tsconfig, DOM 전역은 구조적 최소 타입 + `globalThis` 반사로만 접근한다(원본 client.ts:266의 `LockManager` 구조적 캐스트 기법을 계약으로 승격).

```ts
// src/storage/shared.ts (비공개) — 웹 분기의 저장 접근
type WebStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

// src/core/session.ts (비공개) — 코어 기본 시계의 타이머 해석
type TimerHostLike = {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
};
```

**코어의 타이머도 같은 기법이다**: `lib:["ES2022"]`에는 `setTimeout`·`clearTimeout` 전역이 없다(expo-media §2.4 V-A 실측 — 미해석 식별자 목록에 setTimeout×2·clearTimeout×1이 있었고, 같은 tsup DTS 실패 모드가 core/session.ts에 그대로 적용된다). 기본 `AuthClock`은 전역 타이머 식별자를 직접 참조하지 않고 `globalThis` 반사로 `TimerHostLike`를 얻는다 — 핸들 타입이 `unknown`이라 d.ts에 아무것도 새지 않고, 전역 타이머 식별자 참조가 소스에 생기면 entry-guard의 grep(§5.3은 window·document 등만 본다)이 아니라 **`lib:["ES2022"]` typecheck 자체가 컴파일 실패로 잡는다**. `@types/node`에 기대지 않는다.

따라서 expo-media의 `stamp-dom-reference.mjs` DOM 각인 후처리가 **필요 없다** — d.ts에 DOM 타입이 등장하지 않는 것 자체가 계약이고, `nodom-dist-guard`(skipLibCheck:false 컴파일)가 3개 서브패스 전부를 검사한다. 웹 스토리지 부재 환경(SSR·jsdom 밖 node)에서 웹 분기 `createTokenStorage`는 **메모리-only로 우아하게 후퇴**한다(원본 tokenStorage.ts:16의 `typeof localStorage === "undefined"` 가드 보존 — SSR 렌더 패스에서 throw하면 안 된다).

### 2.5 버전·changeset·release artifact

- `package.json` version **0.0.0** + **minor changeset** 동봉 → `changeset version`이 **0.1.0**을 산출 (toss-payments-postgresql 도입 커밋 03e4c50 선례 그대로).
- `build` = `tsup && node scripts/stamp-provenance.mjs`, `prepack` = `npm run build && node scripts/check-provenance.mjs --require-clean` — dirty checkout에서 pack 불가(expo-media 배선 복제).
- 패키지 스크립트: `build` · `typecheck` · `test`(vitest unit+가드, jsdom 프로젝트 포함) · `test:types` · `check:readme`(dist 타입에 대해 README ts 블록 tsc — expo-media 스크립트 복제, paths 3) · `test:all`. integration 계층 없음(§5.4).

---

## 3. 공개 API 전체 시그니처

### 3.1 토큰·저장 seam (`"."` — src/core/types.ts)

```ts
export type TokenPair = {
  readonly accessToken: string;
  readonly refreshToken: string;
};

/**
 * 'durable': 재시작·재방문 후에도 유지 (네이티브 SecureStore / 웹 localStorage).
 * 'session': 세션 수명 (웹 sessionStorage — 탭 스코프 / 네이티브 메모리 — 프로세스 수명. §7-5).
 */
export type TokenPersistence = 'durable' | 'session';

/**
 * 저장 seam — 구현 계약:
 * - getTokens: 두 토큰이 모두 있을 때만 반환, 반쪽 상태는 null (H12 — torn write가 "로그아웃"으로 수렴).
 * - getTokens **freshness**: 갱신 임계 구역(§3.5) 안의 getTokens는 다른 탭/인스턴스가 마지막으로
 *   커밋한 쓰기를 반영해야 한다 — H2b 채택·H3 비교의 전제다. 인메모리 캐시는 외부 쓰기 주체가
 *   없는 환경(네이티브 단일 프로세스)에서만 허용된다 (§3.8).
 * - setTokens: persistence 생략 시 현재 모드 유지 (H14 — 세션 로그인 뒤의 토큰 회전이
 *   durable로 승격되는 사고 차단). 최초 호출의 기본은 구현이 정한다.
 * - clearTokens: 멱등. persistence 모드를 구현 기본값으로 리셋.
 * - 어떤 메서드도 토큰 문자열을 에러 메시지에 포함해 throw하지 않는다 (§4.2).
 */
export interface TokenStorage {
  getTokens(): Promise<TokenPair | null>;
  setTokens(
    tokens: TokenPair,
    options?: { readonly persistence?: TokenPersistence | undefined }
  ): Promise<void>;
  clearTokens(): Promise<void>;
}
```

seam은 3메서드 + freshness 조항으로 최소화한다 — 커스텀 구현(MMKV·keytar·테스트)이 싸게 유지된다. 코어의 채택 하드닝(H2·H2b)과 H3 비교는 구독이 아니라 **재읽기**로 동작하므로 구독 계약은 여전히 불요하다. 단, 그 재읽기가 stale 캐시를 통과하면 소비된 single-use refresh 토큰 재사용·오탐 clearTokens로 직결된다 — freshness가 계약 문장으로 승격된 이유이고, 웹 구현이 캐시를 버리고 read-through인 이유다(§3.8. 구판의 "캐시 + storage 이벤트 무효화"는 이벤트 태스크와 잠금 grant 태스크의 순서 무보장 때문에 기각 — §0.3 H11).

### 3.2 잠금·시계 seam

```ts
/** 갱신 임계 구역 직렬화. 웹 기본 구현은 "./storage"의 createWebLocksRefreshLock (§3.8). */
export interface RefreshLock {
  acquire<T>(run: () => Promise<T>): Promise<T>;
}

/** 사전 갱신 스케줄러의 시간 의존 전부. 기본 구현: Date.now + globalThis 반사로 얻는 구조적
 *  타이머(TimerHostLike — §2.4). 전역 setTimeout 식별자를 직접 참조하지 않는다 —
 *  lib:["ES2022"]에 그 식별자가 없어 참조가 생기면 typecheck가 실패한다. */
export interface AuthClock {
  nowMs(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
```

### 3.3 갱신 콜백 계약 — transient/invalid 판별은 호스트 소유

```ts
/**
 * 호스트가 자기 HTTP 스택으로 refresh 엔드포인트를 호출하고 결과를 3분류로 번역한다.
 * - 'rotated'   : 서버가 새 토큰 쌍을 발급했다. tokens 필수 — 없으면 컴파일 에러 (§4.1-②).
 * - 'invalid'   : 서버의 확정 거절 (401/403 — 토큰 폐기·만료). 세션이 끝났다는 뜻.
 * - 'transient' : 서버가 판정하지 못했다 (네트워크·5xx·CORS·타임아웃). 토큰은 유효할 수 있다.
 * ⚠ 콜백이 throw하면 코어는 `{ status: 'transient', cause: <던진 값> }`으로 취급한다 —
 *   분류 코드의 버그가 사용자를 로그아웃시키는 쪽으로 실패하지 않게 하되(H1 방향 fail-safe),
 *   던진 값을 cause로 보존해 **침묵 소거를 막는다**: caller 반환값과 onScheduledOutcome에
 *   그대로 흘러 호스트 telemetry가 분류기 버그를 네트워크 플래핑과 구별할 수 있다 (§3.4).
 *   cause는 정형 필드이고 라이브러리는 문자열화하지 않으므로 §4.2와 충돌하지 않는다.
 */
export type RefreshRequestResult =
  | {
      readonly status: 'rotated';
      readonly tokens: TokenPair;
      /** 서버가 준 access 토큰 수명(초). 있으면 JWT exp 디코드보다 우선한다 (§3.6). */
      readonly accessTtlSeconds?: number | undefined;
    }
  | { readonly status: 'invalid' }
  | { readonly status: 'transient' };

export type RefreshRequest = (
  input: { readonly refreshToken: string }
) => Promise<RefreshRequestResult>;
```

### 3.4 갱신 결과 — 로그아웃은 이벤트가 아니라 typed outcome

```ts
/**
 * refresh()의 다섯 결말. 라이브러리는 저장소 정리까지만 하고 화면 전환은 하지 않는다.
 * - 'refreshed'  : 이 인스턴스가 회전을 수행했다. 저장 완료·재스케줄 완료.
 * - 'adopted'    : 저장소가 진입 스냅샷과 **다른** 유효 토큰 쌍을 보유하게 됐다 — 그 쌍을
 *                  채택했다 (H2·H2b). 재스케줄 완료. ⚠ "같은 주체의 회전"임은 보증하지
 *                  않는다 — 다른 탭의 signOut→타 계정 signIn도 'adopted'로 나타난다.
 *                  계정 전환 가능 호스트는 채택 후 주체 재확인(예: /me 재조회) 필요 (§7-13).
 * - 'signed-out' : 저장소에 refresh 토큰이 없다 (이미 로그아웃 상태).
 * - 'invalid'    : 서버 확정 거절. tokensCleared는 H3 규율의 결과 — 시도한 토큰이 아직
 *                  저장소에 있었을 때만 true. caller가 로그인 화면 전환을 판단한다.
 * - 'transient'  : 판정 불가. 토큰 보존 — 절대 로그아웃 아님 (H1). cause는 콜백이 throw한
 *                  값(§3.3 fail-safe의 진단 채널 — 분류기 버그가 침묵 소거되지 않는다),
 *                  콜백이 'transient'를 정상 보고했으면 undefined. 재시도 정책은 caller 몫
 *                  (React Query 등).
 */
export type RefreshOutcome =
  | { readonly status: 'refreshed'; readonly tokens: TokenPair }
  | { readonly status: 'adopted'; readonly tokens: TokenPair }
  | { readonly status: 'signed-out' }
  | { readonly status: 'invalid'; readonly tokensCleared: boolean }
  | { readonly status: 'transient'; readonly cause?: unknown };

/** refreshIfExpiringSoon의 결과 — 여섯 번째 결말 'not-needed'의 명명된 집 (§3.5·§5.4). */
export type EagerRefreshOutcome = RefreshOutcome | { readonly status: 'not-needed' };

/**
 * 다섯 결말의 exhaustive 매처. TS는 raw switch/if의 exhaustiveness를 강제하지 않으므로
 * (§4.1-③ — assertNever는 opt-in 패턴일 뿐이다), 핸들러 키 누락이 곧 **컴파일 에러**가
 * 되는 소비 형태를 라이브러리가 직접 제공한다.
 */
export function matchRefreshOutcome<T>(
  outcome: RefreshOutcome,
  handlers: {
    readonly refreshed: (outcome: Extract<RefreshOutcome, { status: 'refreshed' }>) => T;
    readonly adopted: (outcome: Extract<RefreshOutcome, { status: 'adopted' }>) => T;
    readonly 'signed-out': (outcome: Extract<RefreshOutcome, { status: 'signed-out' }>) => T;
    readonly invalid: (outcome: Extract<RefreshOutcome, { status: 'invalid' }>) => T;
    readonly transient: (outcome: Extract<RefreshOutcome, { status: 'transient' }>) => T;
  }
): T;
```

### 3.5 세션 — `createAuthSession`

이름은 `createTokenRefreshCoordinator`가 아니라 `createAuthSession`이다: 반환 객체가 갱신 조율뿐 아니라 저장 바인딩(signIn/signOut)·스케줄러 수명까지 소유하기 때문이다.

```ts
export type RefreshScheduleOptions = {
  /** 만료 몇 초 전에 갱신하는가. 기본 90 (H7). */
  readonly leadSeconds?: number | undefined;
  /** 타이머 최소 지연. 기본 30_000 (H7 — 만료 임박 토큰의 즉시 재발화 폭주 방지). */
  readonly minDelayMs?: number | undefined;
  /** exp를 알 수 없을 때의 가정 TTL(초). 기본 840 = 14분 (H7). */
  readonly fallbackTtlSeconds?: number | undefined;
  /**
   * 연속 'transient' 재시도의 지수 백오프 상한(ms). 기본 300_000 (5분).
   * n번째 연속 transient의 재시도 지연 = min(minDelayMs × 2^(n−1), transientMaxDelayMs).
   * 'refreshed'/'adopted'/signIn에서 카운터 리셋 — 고정 30s 무한 재시도의 self-DoS 차단 (§7-8).
   */
  readonly transientMaxDelayMs?: number | undefined;
};

export type AuthSessionOptions = {
  readonly storage: TokenStorage;
  readonly refresh: RefreshRequest;
  /** 크로스탭 직렬화. 생략 시 인스턴스 내 단일 비행만 (네이티브는 그것으로 충분). */
  readonly lock?: RefreshLock | undefined;
  /** 생략 시 시스템 시계. 테스트는 "./testing"의 createManualClock 주입 (§5.1). */
  readonly clock?: AuthClock | undefined;
  /**
   * access 토큰 → 잔여 수명(초) | null. 생략 시 decodeJwtExpiryEpochSeconds 기반 기본 전략.
   * 불투명(비JWT) 토큰 호스트는 여기로 자체 전략을 준다.
   */
  readonly accessTokenTtlSeconds?: ((accessToken: string) => number | null) | undefined;
  readonly schedule?: RefreshScheduleOptions | undefined;
  /**
   * 스케줄러가 백그라운드에서 수행한 갱신의 outcome 통지. caller-initiated refresh()에는
   * 호출되지 않는다(그 caller는 반환값으로 이미 안다). 'invalid'를 받으면 로그인 화면으로
   * 보낼지는 호스트 판단 — 라이브러리는 여기서도 이벤트를 "발사"하는 게 아니라 outcome을 건넨다.
   * 'transient'는 cause(콜백 throw 진단 — §3.4)를 그대로 실어 온다 — telemetry의 유일 창구.
   */
  readonly onScheduledOutcome?: ((outcome: RefreshOutcome) => void) | undefined;
};

export interface AuthSession {
  /** 저장된 access 토큰 (bearer 주입은 앱 HTTP 계층 소유 — §6-1). */
  getAccessToken(): Promise<string | null>;
  getTokens(): Promise<TokenPair | null>;

  /**
   * 저장 + 사전 갱신 스케줄. (로그인 API 호출 자체는 앱 소유.)
   * - persistence **필수**: clearTokens/signOut이 모드를 구현 기본값으로 리셋하므로,
   *   옵셔널이면 "세션 로그인 → signOut → 옵션 없는 재로그인"이 조용히 durable로 승격된다
   *   (공용 PC의 세션 선택 사용자 배신). 라이브러리는 제품의 persistence 정책을 모른다 —
   *   기본값 제공은 §4.1-④와 같은 거짓말이다 (§4.1-⑥). 내부 회전의 setTokens만
   *   모드-스티키 생략을 쓴다 (H14 그대로).
   * - accessTtlSeconds: 로그인 응답의 expires_in — 첫 스케줄의 TTL ①순위 (§3.5 말미).
   *   로그인이 1차 토큰 획득 이벤트인데 갱신 경로에만 ①순위가 있으면, 불투명 토큰 호스트는
   *   전략 클로저에 토큰→TTL 사이드맵(전역 가변 상태의 재발명 — §1 결함 2)을 만들게 된다.
   */
  signIn(
    tokens: TokenPair,
    options: {
      readonly persistence: TokenPersistence;
      readonly accessTtlSeconds?: number | undefined;
    }
  ): Promise<void>;
  /** 스케줄 취소 + clearTokens. 멱등. */
  signOut(): Promise<void>;

  /**
   * 단일 비행 (H4): 인스턴스 내 동시 호출은 하나의 in-flight 결과를 공유한다.
   * lock이 있으면 임계 구역을 크로스탭 직렬화 (H5). 잠금 획득 후 저장소를 재읽어
   * 이미 회전됐으면 'adopted' (H2b), 실패 후 재읽어 회전 발견 시에도 'adopted' (H2).
   * 'refreshed'/'adopted'는 재스케줄까지 마친 뒤 반환된다.
   *
   * 잠금 경계 불변식: 임계 구역은 저장소 재읽기(H2b)부터 결과 persist —
   * 'rotated'의 setTokens, invalid 확정의 clearTokens(H3) — **완료까지**를 포함하며,
   * persist 완료 전에 잠금을 해제하지 않는다. 해제가 선행하면 다음 탭의 post-lock
   * 재읽기가 회전 전 상태를 보고 소비된 single-use 토큰을 재사용한다 — 원본
   * withRefreshLock이 read→request→setTokens 전체를 감쌌던 것(client.ts:187-228)은
   * 우연이 아니라 이 불변식이다 (§5.2 잠금 행이 해제 시점 대비 persist 완료를 단언).
   */
  refresh(): Promise<RefreshOutcome>;

  /**
   * 포그라운드 복귀 시 eager 갱신 (H9). 잔여 수명 ≤ thresholdSeconds(기본 120)일 때만
   * refresh(). 수명을 알 수 없으면(비JWT + 전략 없음) 'not-needed' — 원본 동작 보존.
   * 반환 유니언은 명명 타입 EagerRefreshOutcome (§3.4) — 소비자가 여섯 결말 위치를
   * 익명으로 재선언하지 않는다.
   */
  refreshIfExpiringSoon(
    options?: { readonly thresholdSeconds?: number | undefined }
  ): Promise<EagerRefreshOutcome>;

  /**
   * 401→refresh→재시도 정확히 1회 (H6). 구조적 보장: 재시도 실행분에서 갱신 경로로
   * 재진입할 수 없다 — 원본의 allowRefresh boolean 재귀를 표현 불가능하게 만든 것.
   * run은 매 시도마다 그 시점의 access 토큰을 인자로 받는다(만료 헤더 재사용 원천 차단 — H6).
   * 흐름: run(현재 토큰) → throw e → shouldRetryAfterRefresh(e)가 true이고 토큰이 있었으면
   * refresh() → 'refreshed'/'adopted'면 run(새 토큰) 1회 — 그 결과가 최종(성공이든 throw든).
   * 그 외('invalid'/'transient'/'signed-out')는 원본 에러 e를 그대로 재던진다 —
   * transient에서 토큰은 그대로이므로 상위 재시도 정책이 이어받는다 (H1).
   */
  runAuthorized<T>(
    run: (accessToken: string | null) => Promise<T>,
    options: {
      /** 앱 에러 어휘(ApiError 등)로 "만료 401"을 판별한다. 필수 — 기본값 없음 (§4.1-④). */
      readonly shouldRetryAfterRefresh: (error: unknown) => boolean;
    }
  ): Promise<T>;

  /** 저장 토큰 기준으로 사전 갱신 타이머 (재)등록. 부팅 복원 직후 호스트가 호출한다. */
  scheduleRefresh(): Promise<void>;
  cancelScheduledRefresh(): void;

  /** 타이머 해제 + 이후 호출은 AuthError('session-disposed'). */
  dispose(): void;
}

export function createAuthSession(options: AuthSessionOptions): AuthSession;
```

스케줄러 정책(원본 client.ts:291-311 계승 + 백오프 신설): 지연 = `max((ttl − leadSeconds) × 1000, minDelayMs)`, ttl 불명 시 `fallbackTtlSeconds`. 발화 → `refresh()` → 'refreshed'/'adopted'는 내부 재스케줄 + 백오프 카운터 리셋, 'transient'는 재시도 재스케줄(H8) — 단 고정 간격이 아니라 **연속 transient 횟수 n 기반 지수 백오프** `min(minDelayMs × 2^(n−1), transientMaxDelayMs)`: 만료된 토큰은 ttl이 음수라 지연이 영원히 minDelayMs로 클램프되는 원본 구조(client.ts:295-311)가 "30초 간격 무한 재시도" self-DoS였다(§7-8 — reactive 401 경로가 안전망이므로 백오프로 간격이 벌어져도 로그아웃을 뜻하지 않는다). 'invalid'/'signed-out'은 타이머 정지 + `onScheduledOutcome` 통지. TTL 출처 우선순위: ① 서버 권위 값 — 갱신 경로의 `RefreshRequestResult.accessTtlSeconds` **및 로그인 경로의 `signIn` `accessTtlSeconds`(첫 스케줄)** ② `accessTokenTtlSeconds` 전략(기본: JWT exp 디코드) ③ fallback.

### 3.6 JWT 유틸 — 정직한 이름과 한계

```ts
/**
 * ⚠ **서명 검증 없는 payload 디코드다.** exp 클레임을 base64url로 풀어 읽을 뿐,
 * 토큰의 진위·무결성을 전혀 보증하지 않는다. 사전 갱신 스케줄링 힌트 전용 —
 * 인가 판단·신뢰 경계에 쓰면 안 된다. 조작된 exp가 일으킬 수 있는 최악은
 * "갱신 타이밍이 틀리는 것"이며 그 경우 reactive 401 경로가 안전망이다 (§7-1).
 * 손상·비JWT 입력은 throw 없이 null (H13). atob 무의존 — 순수 TS base64url 디코더 내장.
 */
export function decodeJwtExpiryEpochSeconds(token: string): number | null;

/** 로깅·telemetry용 토큰 요약 — 토큰 바이트를 한 글자도 포함하지 않는다 (§4.2). */
export function describeAccessToken(accessToken: string): {
  readonly length: number;
  readonly expiresAtEpochSeconds: number | null;
};
```

### 3.7 에러 (`"."` — src/core/errors.ts)

```ts
export type AuthErrorCode =
  | 'invalid-key-prefix'     // keyPrefix/name이 빈 문자열·공백 (런타임 검증 — §4.1-ⓐ)
  | 'session-disposed';      // dispose 후 세션 메서드 호출 (§4.1-ⓑ)
// 구판의 'platform-unsupported'는 삭제 — §2.2 단일 중립 팩토리로 스텁 자체가 사라졌다.

/** Symbol.for 태그 판별 — splitting:false 다중 엔트리에서 instanceof는 깨진다 (expo-media §0.2 판례). */
export class AuthError extends Error {
  readonly code: AuthErrorCode;
}
export function isAuthError(value: unknown): value is AuthError;
```

`AuthError` 메시지는 코드별 고정 영어 문자열이다. 갱신 실패·저장 실패는 AuthError로 감싸지 않는다 — 갱신 실패는 outcome(§3.4)이고, storage 어댑터의 예외는 원본 그대로 전파한다(감싸면 토큰 유출 검증 표면만 늘어난다).

### 3.8 저장 구현 (`"./storage"`)

```ts
import type { RefreshLock, TokenPersistence, TokenStorage } from '@gj-kit/expo-auth';

/**
 * 플랫폼 중립 단일 팩토리 — 구현은 "./storage"의 exports 조건 포크가 선택한다 (§2.2·§2.3).
 * 공개 시그니처·d.ts·반환 shape는 분기 불변 — 소비 앱의 조립 파일은 하나다 (§3.9).
 *
 * 네이티브 분기 (expo-secure-store — 이 분기 파일에서만 정적 import):
 * - 'durable': SecureStore 두 키 (`{keyPrefix}.accessToken` / `{keyPrefix}.refreshToken`).
 *   두 키 분리는 SecureStore 값 크기 제한(Android ~2KB 경고) 회피 목적 — §7-4.
 * - 'session': SecureStore에서 삭제하고 메모리에만 보관 (원본 tokenStorage.ts:87-91 의미 보존).
 *   프로세스 종료 = 로그아웃. §7-5.
 * - 인메모리 캐시 (H10) — 단일 프로세스라 외부 쓰기 주체가 없어 §3.1 freshness와 양립한다.
 *
 * node/browser 분기 (peer 0, DOM lib 0 — 구조적 타입 + globalThis 반사, §2.4):
 * - 'durable': localStorage. 'session': sessionStorage (탭 스코프). ⚠ 웹 storage는 보안
 *   경계가 아니다 — XSS = 토큰 탈취 (§7-12, README 플랫폼 표).
 * - **getTokens는 항상 기저 스토리지 read-through** — 인메모리 캐시 없음 (§3.1 freshness).
 *   웹 storage 읽기는 동기·저비용이고, "캐시 + storage 이벤트 무효화"(원본 H11)는 이벤트
 *   태스크와 Web Lock grant 태스크의 순서 무보장 탓에 H2b/H3 재읽기에 stale 값을 줄 수
 *   있어 기각했다 (§0.3 H11). 다른 탭의 쓰기·clear()가 이벤트 도착 여부와 무관하게 다음
 *   getTokens에 즉시 보인다 — 리스너가 없으니 dispose도 없고 sideEffects:false는 구조로 성립.
 * - getTokens는 sessionStorage 우선 — 세션 로그인 탭이 durable 잔재를 줍지 않는다
 *   (원본 tokenStorage.ts:58-66 보존). persistence 모드도 인메모리 상태가 아니라 **토큰이
 *   실제로 놓인 위치에서 파생**한다 (H14 — 모드 자체도 stale해질 수 없다).
 * - localStorage/sessionStorage 부재(SSR): 메모리-only 후퇴, throw 없음 (§2.4).
 *
 * 반쪽 상태 null 수렴 (H12)은 양 분기 공통.
 */
export type TokenStorageOptions = {
  /** 필수. 예: 'myapp.auth'. 빈 문자열·공백은 AuthError('invalid-key-prefix') (§4.1-ⓐ). */
  readonly keyPrefix: string;
  readonly defaultPersistence?: TokenPersistence | undefined; // 기본 'durable'
};
export function createTokenStorage(options: TokenStorageOptions): TokenStorage;

/**
 * Web Locks 기반 크로스탭 갱신 직렬화 (H5). navigator.locks 부재 시 직행 실행 폴백 —
 * 원본 client.ts:263-272 보존. 양 분기에서 실동작 (§2.2) — 네이티브에선 항상 직행 폴백이라
 * 조건 없이 조립에 넣어도 무해하다 (§3.9).
 */
export function createWebLocksRefreshLock(options: {
  /** 필수. origin 내 전역 이름 — keyPrefix와 같은 값 권장. */
  readonly name: string;
}): RefreshLock;
```

### 3.9 조립 예 (README 골든패스가 될 형태)

```ts
// app/auth/session.ts — 플랫폼 무관 단일 조립 (네이티브·웹 같은 파일 — §1-2)
import { createAuthSession } from '@gj-kit/expo-auth';
import { createTokenStorage, createWebLocksRefreshLock } from '@gj-kit/expo-auth/storage';

export const authSession = createAuthSession({
  // 구현 선택은 "./storage"의 exports 조건 포크가 한다 — 앱측 플랫폼 분기 없음 (§2.2).
  storage: createTokenStorage({ keyPrefix: 'myapp.auth' }),
  // 네이티브(navigator.locks 부재)에선 직행 폴백으로 무해 — 조건 없이 넣는다 (§3.8).
  lock: createWebLocksRefreshLock({ name: 'myapp.auth' }),
  refresh: async ({ refreshToken }) => {
    const response = await postRefresh(refreshToken); // 앱 HTTP 스택
    if (response.kind === 'rotated') {
      return { status: 'rotated', tokens: response.tokens, accessTtlSeconds: response.expiresIn };
    }
    return response.kind === 'rejected' ? { status: 'invalid' } : { status: 'transient' };
  },
});
```

```ts
// 로그인 지점 — persistence는 필수(§3.5), 로그인 응답의 expires_in을 첫 스케줄에 전달(§3.5 ①순위)
await authSession.signIn(loginResponse.tokens, {
  persistence: stayLoggedIn ? 'durable' : 'session',
  accessTtlSeconds: loginResponse.expiresIn,
});
```

README에는 위 조립·signIn + 포그라운드 배선(웹 visibilitychange / 네이티브 AppState change → `refreshIfExpiringSoon()`) + `runAuthorized` 예제(앱 ApiError를 `shouldRetryAfterRefresh: (e) => isApiError(e) && e.status === 401`로 판별) + `matchRefreshOutcome` 예제('transient' 핸들러가 cause를 telemetry로 보내고, 'adopted' 핸들러가 주체 재확인을 하는 형태 — §3.4) + 플랫폼 표('session' 의미 비대칭 §7-5 · 웹 storage 비보안경계 §7-12)를 게재하고, 전부 `check:readme`가 컴파일 검증한다.

---

## 4. 오용 차단

### 4.1 오용 차단 — 컴파일 에러 vs 런타임 fail-fast

정직성 주의: 첫 표는 **정말로 컴파일이 깨지는** 오용만 담는다 — 구판은 런타임 기제(빈 keyPrefix 검증, 스텁 throw)를 "컴파일 에러가 되는 오용" 표에 섞었다.

**컴파일 에러가 되는 오용** (§5.4 type 픽스처가 전부 고정):

| # | 오용 | 차단 기제 |
|---|---|---|
| ① | 키 프리픽스·잠금 이름 **생략**(호스트 앱 이름이 라이브러리 기본값으로 새는 원본 사고의 역방향) | `keyPrefix`·`name` **필수 인자** — 기본값 없음 (빈 문자열·공백은 런타임 표 ⓐ) |
| ② | **refresh 콜백이 'rotated'라면서 새 토큰을 반환하지 않음** | 'rotated' 멤버의 `tokens` **필수 속성** — 리터럴 여부와 무관하게 컴파일 에러. 반대 방향(`{ status: 'invalid', tokens }`)의 초과 속성 차단은 **직접 객체 리터럴에만** 작동한다(변수 간접 시 EPC 우회 — 단 그 오용은 무해: tokens는 무시된다) |
| ③ | 갱신 결말 처리 누락(특히 'transient'를 'invalid'처럼 로그아웃 처리) | 두 기제: `outcome.tokens`는 'refreshed'/'adopted'로 **좁힌 뒤에만** 접근 가능(항상 강제) + `matchRefreshOutcome`의 핸들러 키 누락 = 컴파일 에러 (§3.4). ⚠ raw `switch`/`if`의 exhaustiveness는 TS가 강제하지 않는다 — `if (status !== 'refreshed' && status !== 'adopted') logout()` 같은 H1 위반 코드도 컴파일된다. assertNever는 README 권장 패턴일 뿐이므로, 컴파일 강제가 필요한 호스트는 매처를 쓴다 |
| ④ | 재시도 판별 없는 `runAuthorized` (모든 에러 재시도 또는 재시도 전무) | `shouldRetryAfterRefresh` **필수 옵션** — 라이브러리는 앱 에러 형태를 모르므로 기본값을 제공하는 것 자체가 거짓말이다 |
| ⑤ | 재시도-두 번(원본 allowRefresh 재귀의 사고 모드) | 공개 표면에 allowRefresh 상당 인자가 없다 — 재시도 실행분은 갱신 경로에 도달할 수 없는 내부 구조 |
| ⑥ | **persistence 생략 signIn** — 세션 로그인 사용자가 재로그인에서 조용히 durable로 승격(signOut이 모드를 기본값으로 리셋하므로) | `signIn`의 `persistence` **필수 인자** (§3.5 — ④와 동일 논거: 라이브러리는 제품의 persistence 정책을 모른다) |

**런타임 fail-fast**:

| # | 오용 | 차단 기제 |
|---|---|---|
| ⓐ | keyPrefix/name이 빈 문자열·공백 | `AuthError('invalid-key-prefix')` |
| ⓑ | dispose 후 세션 메서드 호출 | `AuthError('session-disposed')` |

구판 ⑥(반대 플랫폼 스텁 팩토리 fail-fast)은 삭제 — §2.2의 단일 중립 팩토리로 "잘못된 플랫폼의 팩토리 호출"이라는 오용 자체가 표현 불가능해졌다.

### 4.2 토큰 유출 차단 — 계약 + 정적 가드

**계약**: 토큰 문자열은 `TokenPair` 정형 값으로만 흐른다. 라이브러리의 어떤 `Error.message`·`console.*` 인자·outcome의 문자열 필드에도 토큰(또는 그 부분 문자열)이 들어가지 않는다. 로깅이 필요한 호스트는 `describeAccessToken`(길이·만료만)을 쓴다.

**token-guard** (unit 계층 정적 소스 스캔 — expo-media hardening-guard 선례):
- `src/**`에서 `console.` 호출 0건 (라이브러리는 로거가 없다 — 통지는 전부 typed outcome).
- `src/**`의 템플릿 리터럴·문자열 연결에 `accessToken`/`refreshToken` 식별자 등장 0건 (키 조립 상수 `'.accessToken'` 리터럴은 허용 목록).
- `new AuthError(` 의 메시지 인자는 `errors.ts`의 고정 상수 테이블 참조만 허용.

### 4.3 정직성 명문화

- `decodeJwtExpiryEpochSeconds`의 TSDoc 첫 줄 + README 전용 절: **서명 검증 없는 payload 디코드** — 신뢰 경계 아님, 스케줄링 힌트 전용 (§3.6).
- `'session'` persistence의 네이티브 의미(프로세스 수명 메모리)를 타입 TSDoc과 README 플랫폼 표에 명시 (§7-5).
- 단일 비행은 **AuthSession 인스턴스 단위**다 — 인스턴스를 둘 만들면 깨진다. README에 "앱당 하나, 모듈 스코프 싱글턴 권장" 명시 (§7-6).
- `'adopted'`는 **주체 동일성을 보증하지 않는다** — 토큰 불일치 판별뿐이라 다른 탭의 계정 전환도 채택된다. TSDoc(§3.4) + README에 "계정 전환 가능 호스트는 adopted 수신 시 주체 재확인(예: /me 재조회)" 명시 (§7-13).
- **웹 storage는 보안 경계가 아니다** — README 플랫폼 표에 'durable'=localStorage의 XSS 트레이드오프와 httpOnly 쿠키 세션 대안 명시 (§3.8·§7-12).

---

## 5. 테스트 전략

### 5.1 `"./testing"` 공개 표면

```ts
import type {
  AuthClock, RefreshLock, RefreshRequest, RefreshRequestResult,
  TokenPair, TokenPersistence, TokenStorage,
} from '@gj-kit/expo-auth';

/** 인메모리 TokenStorage + 크로스탭 시뮬레이터. SSR·앱 테스트에서도 실용. */
export type MemoryTokenStorage = TokenStorage & {
  /** 다른 탭의 회전을 흉내 — H2/H2b/H3 시나리오의 유일한 재현 수단. */
  simulateExternalRotation(tokens: TokenPair): void;
  simulateExternalClear(): void;
  /** 관측용: 현재 모드·기저 read 횟수 (H14 스티키·H2b/H3 재읽기 횟수 단언). */
  readonly persistence: TokenPersistence;
  readonly readCount: number;
};
export function createMemoryTokenStorage(
  initial?: { readonly tokens?: TokenPair | undefined; readonly persistence?: TokenPersistence | undefined }
): MemoryTokenStorage;

/** 결정적 시계 — advance는 경과분의 타이머를 발화시키고 마이크로태스크를 드레인한다. */
export type ManualClock = AuthClock & {
  advance(ms: number): Promise<void>;
  readonly pendingTimerCount: number;
};
export function createManualClock(options?: { readonly startMs?: number | undefined }): ManualClock;

/** 직렬화 관측 잠금 — maxObservedConcurrency로 H5를 수치 단언. release를 수동 제어해 H2b 재현. */
export type FakeRefreshLock = RefreshLock & {
  readonly maxObservedConcurrency: number;
  /** true면 acquire가 releaseNext() 호출까지 대기 — 잠금 대기 중 회전 시나리오용. */
  hold(): void;
  releaseNext(): void;
};
export function createFakeRefreshLock(): FakeRefreshLock;

/** 각본대로 응답하는 RefreshRequest + 호출 기록. 각본 소진 후 호출은 테스트 실패로 throw. */
export function createScriptedRefreshRequest(script: readonly RefreshRequestResult[]): {
  readonly request: RefreshRequest;
  readonly calls: readonly { readonly refreshToken: string }[];
};

/** 서명 없는 테스트 JWT (헤더.페이로드.빈서명) — exp 픽스처 생성. 이름부터 무서명임을 말한다. */
export function createUnsignedTestJwt(claims: Readonly<Record<string, unknown>>): string;
```

### 5.2 unit (`pnpm test`) — 모킹 0, 페이크만

기본 node 환경. **vi.mock·expo 모킹 0** — 전 시나리오가 `"./testing"` 페이크 4종으로 돈다(test-purity-guard가 강제). 핵심 매트릭스:

| 영역 | 시나리오 |
|---|---|
| 단일 비행 (H4) | 동시 refresh() 10회 → scripted 호출 1회, 전원 동일 outcome |
| 잠금 (H5·H2b·§3.5 잠금 경계) | FakeRefreshLock `maxObservedConcurrency===1`; hold 중 `simulateExternalRotation` → releaseNext 후 'adopted', 콜백 호출 0회; acquire 래핑 데코레이터로 해제 시점 관측 — **잠금 해제 관측 전에 회전 쌍 persist 완료** 단언 (§3.5 불변식) |
| 채택 (H2·H3) | in-flight 중 회전 + invalid 응답 → 'adopted'; 회전 없이 invalid → tokensCleared:true; 회전 후 invalid → tokensCleared:false + 저장 토큰 보존 |
| transient (H1) | transient 각본 → storage 무변경 + 'transient'(cause undefined); **콜백 throw → 'transient' + `cause === 던진 값` 보존**(fail-safe 방향 + 진단 채널 — §3.4) + storage 무변경 |
| 재시도 1회 (H6) | 401 두 번 각본 → refresh 1회·run 2회·최종은 두 번째 에러; shouldRetryAfterRefresh false → refresh 0회 |
| 스케줄러 (H7·H8) | ManualClock: ttl 900s → 810s 발화 / ttl 60s → 30s 클램프 / ttl 불명 → 750s(840−90) / **signIn({ accessTtlSeconds: 600 }) → 510s 발화(fallback 아님 — §3.5 ①순위)** / transient 연속 → 30s·60s·120s·…·`transientMaxDelayMs` 클램프, 'refreshed' 후 카운터 리셋 / invalid 발화 → 타이머 0 + onScheduledOutcome |
| eager (H9) | 임계 경계 ±1s; ttl 불명 → 'not-needed' + refresh 0회 |
| JWT (H13) | base64url 패딩·URL-safe 문자·손상 payload·비JWT → null; `createUnsignedTestJwt({ exp })` 왕복 |
| 저장 (H10·H12·H14) | (네이티브 캐시 로직) readCount로 연속 getTokens → 기저 read 1회; 반쪽 삭제 → null; session 모드 스티키 — "재로그인 durable 승격" 경로는 §4.1-⑥ 필수 인자로 부재(컴파일 픽스처 §5.4) |

`storage.web.ts`는 **jsdom 프로젝트**로 분리해 실제 localStorage/sessionStorage를 시험한다: 다른 "탭"의 외부 쓰기가 storage 이벤트 **전달 없이도** 다음 getTokens에 즉시 보임(read-through — §3.8); `localStorage.clear()` → 다음 getTokens null(구판 H11의 event.key===null 누락 버그 상속 차단 — §0.3); **storage 이벤트를 잠금 grant 뒤로 지연시켜도 H2b 재읽기가 'adopted'를 반환**(이벤트 태스크 순서 무의존 증명 — 웹 세션 + FakeRefreshLock 조합); 스토리지 부재(SSR) 메모리 후퇴. 네이티브 분기 `storage.ts`는 expo-secure-store를 **구조적 페이크 모듈 주입이 아니라** vitest alias 한 개로 대체한다 — 이 파일만이 유일한 모킹 허용 지점이며, 분기 공용 계약(키 이름·삭제 순서·H12 수렴)은 `storage/shared.ts`에 있어 페이크 스토리지로 이미 검증된다(인메모리 캐시·'session' 메모리 보관의 persistence 상태기계는 네이티브 분기 소유 — §3.8).

### 5.3 가드 테스트 (unit 계층, 정적 스캔 — expo-media §10.3 계승)

| 가드 | 규칙 |
|---|---|
| `entry-guard` | `src/core/**`·`src/testing/**`에 `react`·`react-native`·`expo-`·`window`·`document`·`navigator`·`localStorage` 문자열 0건. `expo-secure-store` import는 `src/storage.ts` 정확히 1파일 |
| `dist-peer-graph` | 산출물 외부 specifier를 **조건 3세트(browser/node/네이티브) × 2형식(ESM·CJS)**으로 재귀 추출해 §2.2 표와 대조 — `.`·`./testing`은 전 세트 공집합, `./storage`는 네이티브 세트만 `{expo-secure-store}` |
| `nodom-dist-guard` | `lib:["ES2022"]` + `skipLibCheck:false`로 공개 서브패스 3개 d.ts 실컴파일 — DOM 타입 유출 즉시 실패 (§2.4) |
| `token-guard` | §4.2의 3규칙 |
| `test-purity-guard` | `tests/unit/**`에 `expo-`·`react-native` import 0건 (alias 지점 제외) |

### 5.4 type (`pnpm test:types`) · README · integration

- `tests/types/*.test-d.ts`: §4.1 컴파일 표 전부 — ②('rotated' tokens 누락 `@ts-expect-error`; 'invalid'+tokens 초과 속성은 **직접 리터럴 픽스처로만** — 변수 간접은 EPC가 못 잡음을 주석으로 명시), ③(`matchRefreshOutcome` 핸들러 키 누락 `@ts-expect-error` 5종, 'transient'에서 `.tokens` 접근 `@ts-expect-error`), ④(`runAuthorized` 옵션 생략 `@ts-expect-error`), ⑥(`signIn`의 options/`persistence` 생략 `@ts-expect-error`), `EagerRefreshOutcome` 여섯 결말 위치의 assertNever 픽스처(익명 재선언 없이 명명 타입으로 작성됨 자체가 검증 대상 — §3.5), EOP 규약(`?: T | undefined`), `TokenStorage` 구조적 구현 호환(MemoryTokenStorage가 seam을 만족).
- `check:readme`: expo-media `scripts/check-readme.mjs` 복제, paths 3(`.`/`./storage`/`./testing`) — README의 모든 ts 블록을 dist d.ts에 대해 tsc. `./storage`가 조건 무관 단일 d.ts이므로 DOM 각인 분기 불요.
- **integration 계층 없음** — 외부 서비스도 실기기 필수 경로도 없다(SecureStore 왕복은 소비 앱 vendoring 후 실기 체크리스트 1항목: 로그인→강제종료→재실행 토큰 복원). `test:all = unit → types`.

---

## 6. 의도적으로 뺀 것 (앱 소유 — 재론 금지)

| # | 뺀 것 | 근거 |
|---|---|---|
| 1 | **HTTP 클라이언트/fetch 래퍼** — bearer 헤더 주입, `cache:'no-store'`, base URL, 요청 직렬화 | AGENTS.md §1: API·store는 소비 앱 소유. 접점은 `runAuthorized`의 `run(accessToken)` 하나로 족하다. 헤더를 어디에 어떻게 붙이는지는 앱 fetch 스택(원본 client.ts:111-116)이 안다 |
| 2 | **`ApiError`/`ApiTransportError` 형태** | 앱 에러 어휘다. 라이브러리는 그것을 해석하는 대신 판별을 콜백(`RefreshRequestResult` 번역, `shouldRetryAfterRefresh`)으로 받는다 — 어휘 결합 0 |
| 3 | **telemetry/clientActivity 스팬** | 요청 파이프라인이 앱에 있으므로 스팬 지점도 앱에 있다(원본 client.ts:64-97). outcome 유니언이 계측에 필요한 전 정보를 준다 — 'transient'의 cause(콜백 throw 진단 — §3.4)까지 포함해서 |
| 4 | **`returnToWithPersist`/`shouldPersistAuthTokens`** (authPersistence.ts 전체) | `persist=1/0` 쿼리 파라미터는 memorylog2 라우팅 규약이다. persist **개념**만 `TokenPersistence`로 승격하고 URL 인코딩은 앱에 남긴다 |
| 5 | **소셜 로그인 플로우** (kakaoWebSocial 등) | 제품 정책 + 벤더 결합. 그 코드는 `session.signIn(tokens, { persistence })` 한 줄로 이 패키지에 접속한다 |
| 6 | **401 응답 판별 자체** | HTTP 계층 소유 — status 코드 해석을 라이브러리가 하려면 Response 형태 결합이 필요해진다 |
| 7 | **SecureStore 옵션 passthrough** (keychainAccessible·requireAuthentication 등) | 원본이 쓰지 않았고 수요 미확인. additive minor 후보로만 기록 |
| 8 | **다중 계정·토큰 네임스페이스 API** | `keyPrefix`가 이미 표현 수단이다. 전용 API는 수요 발생 시 |
| 9 | **React hook/Provider** (`useAuthSession` 등) | 코어 무React 원칙. AuthProvider.tsx는 앱에 남고 세션 인스턴스를 컨텍스트로 흘리기만 한다. hook 패키지는 수요가 두 번째 소비자로 증명되면 별도 검토 |

---

## 7. 잔존 리스크

1. **JWT exp는 미검증 디코드다** (§3.6 명문화). 조작·손상된 exp의 영향 반경은 "스케줄 왜곡"까지다 — 너무 이르면 불필요 회전(rate limit 소모), 너무 늦으면 reactive 401 경로(H6)가 안전망. 인가 판단에 쓰는 오용은 이름·TSDoc·README 3중 경고로만 막을 수 있다.
2. **기기 시계 skew.** `nowMs`와 서버 exp의 차이가 크면 사전 갱신이 무의미해진다. `accessTtlSeconds`(서버 권위) 우선순위가 완화책이지만 그 값을 주는 서버에서만 유효하다.
3. **Web Locks 부재 브라우저** (구 Safari 등)에서는 크로스탭 직렬화가 직행 폴백으로 후퇴한다 — 단일사용 refresh 토큰의 탭 경쟁이 잔존하고, H2 채택이 사후 수습한다. 원본과 동일한 노출이며 축소는 아니다.
4. **SecureStore 값 크기 제한** (Android ~2KB 경고). access JWT가 클레임 비대로 2KB를 넘으면 경고·잠재 실패. 두 키 분리로 노출을 절반화했지만 제거는 못 한다. 발생 시 대응은 호스트의 클레임 다이어트뿐 — README에 기록.
5. **`'session'`의 네이티브 의미가 웹과 다르다** (탭 스코프 vs 프로세스 수명). 원본 의미 보존이 낳은 비대칭 — 통일하려면 네이티브에 세션 개념을 발명해야 해서 더 큰 거짓이 된다. 타입 TSDoc + README 플랫폼 표로만 완화.
6. **단일 비행은 인스턴스 단위.** 세션 인스턴스 2개(HMR 이중 초기화 포함)는 단일 비행을 깬다. 컴파일 차단 불가 — README "앱당 하나" + lock이 있으면 크로스-인스턴스도 직렬화되므로 웹은 사실상 방어된다는 사실을 함께 기록.
7. **exports 조건 집합의 러너별 변동** — jest-expo가 네이티브 프리셋에 `node` 조건을 넣으면 네이티브 테스트가 웹 분기를 받는다(expo-media §12-13 동종, 같은 감시를 공유). expo-auth 자체의 `expo export` 스모크는 미실측 — expo-media `web-export-guard` 픽스처를 재사용해 구현 단계에서 1회 확인한다.
8. **refresh 콜백 오분류는 라이브러리가 못 잡는다.** 401→'transient' 오분류는 만료 임박 반복 재시도, 5xx→'invalid' 오분류는 오탐 로그아웃. 완화: throw→transient 기본(로그아웃 쪽으로 안 넘어짐) + **cause 보존**(§3.4 — throw가 침묵 소거되지 않고 telemetry에 도달, 네트워크 플래핑과 구별 가능) + **연속 transient 지수 백오프**(§3.5 — 오분류·만료 토큰이 30초 고정 무한 루프로 auth 엔드포인트를 두드리는 self-DoS를 `transientMaxDelayMs`로 상한), README 분류 대조표, `"./testing"` 각본으로 앱이 자기 분류를 시험 가능.
9. **RN 백그라운드에서 타이머 발화는 보장되지 않는다.** 사전 갱신은 포그라운드 최적화일 뿐이며, 복귀 시 `refreshIfExpiringSoon` 배선(README 필수 항목)이 실질 안전망 — 원본 AuthProvider와 동일한 이중화 구조.
10. **peer 하한 미확정** (§2.3) — 구현 단계 레지스트리 실측 전까지 `>=14.0.0`은 잠정이다.
11. **두 키 쓰기의 torn write.** 두 `setItem` 사이 프로세스 종료 시 반쪽 상태 — H12가 null(로그아웃)로 수렴시키므로 데이터 오염은 아니고 재로그인 비용이다. 단일 키 JSON 통합은 §7-4 크기 제한과 상충해 기각.
12. **웹 'durable'의 at-rest 노출 — 웹 storage는 보안 경계가 아니다.** localStorage에 놓인 장수명 single-use refresh 토큰은 임의의 XSS·동일 오리진 서드파티 스크립트가 읽을 수 있다 — XSS는 곧 토큰 탈취다. 라이브러리측 완화는 없다: 완화 지점은 서버측(짧은 refresh TTL·회전·reuse-detection)과 앱측(CSP)이고, 더 강한 요구에는 httpOnly 쿠키 세션이 이 패키지의 대안이다. README 플랫폼 표에 명시 (§3.8·§4.3).
13. **'adopted'는 주체 동일성을 보증하지 않는다.** H2/H2b 판별은 토큰 불일치뿐이라 다른 탭의 signOut→타 계정 signIn도 'adopted'로 나타나고, runAuthorized 재시도가 새 계정의 access 토큰으로 나간다 — 크로스-계정 데이터 노출 가능. 계정 전환 가능 호스트는 adopted 수신 시 주체 재확인(예: /me 재조회) 의무 — TSDoc(§3.4)+README로만 완화하며, outcome에 tokens가 이미 있어 API 변경은 불요. §6-8의 keyPrefix 다중 계정 표현을 쓰는 호스트가 특히 해당.
