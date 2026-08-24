# @gj-kit/expo-auth

Expo/React Native·웹을 한 코드로 커버하는 **토큰 수명주기 코어**. 단일 비행 refresh, 크로스탭 회전 채택, transient-never-logs-out, 사전 갱신 스케줄러를 라이브러리 계약으로 제공하고, HTTP 클라이언트·에러 어휘·로그인 플로우는 앱에 남긴다.

- **런타임 의존성 0.** 코어(`.`)는 react·react-native·expo-*·DOM 참조가 전부 0이다. `setTimeout`/`Date.now`조차 `AuthClock` seam 뒤에 있다.
- **플랫폼 포크는 라이브러리가 소유한다.** `./storage` 하나가 exports 조건 포크로 갈린다 — 네이티브 번들은 SecureStore 구현을, 웹/SSR 번들은 웹 스토리지 구현을 받는다. 웹 번들에 `expo-secure-store`가 **포함되지 않으며**(dist-peer-graph 가드가 CI에서 증명), 소비 앱에는 `Platform.OS` 분기도 `.native.ts`/`.web.ts` 파일 쌍도 없다.
- **로그아웃은 이벤트가 아니라 typed outcome이다.** `refresh()`가 다섯 결말(`RefreshOutcome`)을 반환하고 화면 전환은 caller가 판단한다. 저장소 정리(invalid 확정 시)까지만 라이브러리 책임이다.
- **토큰 바이트는 라이브러리 밖으로 새지 않는다.** 에러 메시지·outcome 문자열 필드에 토큰이 들어가지 않는다(token-guard가 정적으로 강제). 로깅에는 `describeAccessToken`(길이·만료만)을 쓴다.

```sh
npm install @gj-kit/expo-auth
# Expo iOS/Android에서 기본 저장소를 쓰려면 (웹/SSR 전용이면 불필요):
npx expo install expo-secure-store
```

## 1. 골든패스

### 1.1 조립 — 플랫폼 무관 단일 파일

```ts
// app/auth/session.ts — 네이티브·웹 같은 파일. 구현 선택은 "./storage"의 exports 조건 포크가 한다.
import { createAuthSession } from '@gj-kit/expo-auth';
import { createTokenStorage, createWebLocksRefreshLock } from '@gj-kit/expo-auth/storage';

export const session = createAuthSession({
  storage: createTokenStorage({ keyPrefix: 'myapp.auth' }),
  // 네이티브(navigator.locks 부재)에선 직행 폴백으로 무해 — 조건 없이 넣는다.
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

`refresh` 콜백의 3분류가 이 패키지와 서버의 유일한 접점이다. **분류 대조표**:

| 서버/전송 상황 | 반환 | 코어의 처리 |
|---|---|---|
| 새 토큰 쌍 발급 (200) | `{ status: 'rotated', tokens, accessTtlSeconds? }` | 저장(모드-스티키) + 재스케줄 → `'refreshed'` |
| 확정 거절 (401/403 — 폐기·만료) | `{ status: 'invalid' }` | 시도한 토큰이 아직 저장돼 있을 때만 clear → `'invalid'` |
| 판정 불가 (네트워크·5xx·CORS·타임아웃) | `{ status: 'transient' }` | **토큰 보존 — 절대 로그아웃 아님** → `'transient'` |
| 콜백이 throw | (자동) | `'transient'` + `cause`에 던진 값 보존 — 분류기 버그가 로그아웃 쪽으로 실패하지 않는다 |

⚠ 401을 `'transient'`로 오분류하면 만료 임박 반복 재시도, 5xx를 `'invalid'`로 오분류하면 오탐 로그아웃이 된다. `@gj-kit/expo-auth/testing`의 각본 콜백으로 앱의 분류를 직접 시험하라(§4).

### 1.2 로그인 — persistence는 앱이 정한다

```ts
await session.signIn(loginResponse.tokens, {
  persistence: stayLoggedIn ? 'durable' : 'session',
  // 로그인 응답의 expires_in — 첫 사전 갱신 스케줄의 TTL ①순위.
  accessTtlSeconds: loginResponse.expiresIn,
});
```

`persistence`가 **필수**인 이유: `signOut`이 모드를 기본값으로 리셋하므로, 생략 가능하면 "세션 로그인 → signOut → 옵션 없는 재로그인"이 조용히 durable로 승격된다 — 공용 PC에서 세션을 선택한 사용자를 배신한다. 라이브러리는 제품의 persistence 정책을 모른다.

### 1.3 부팅 복원 + 포그라운드 복귀

```ts
// 앱 부팅 시: 저장 토큰이 있으면 사전 갱신 타이머를 (재)등록한다.
const restored = await session.getTokens();
if (restored !== null) {
  await session.scheduleRefresh();
}
```

```ts
// 웹 visibilitychange / 네이티브 AppState 'change' → 앱이 감싼 배선 지점 하나에 연결한다.
// RN 백그라운드에서 타이머 발화는 보장되지 않는다 — 이 eager 경로가 실질 안전망이다(§5 FAQ).
onAppForeground(() => {
  void session.refreshIfExpiringSoon(); // 잔여 수명 ≤ 120s일 때만 refresh
});
```

### 1.4 요청 감싸기 — 401 → refresh → 재시도 정확히 1회

```ts
const me = await session.runAuthorized(
  async (accessToken) => fetchMe(accessToken), // run은 매 시도마다 그 시점의 토큰을 받는다
  {
    // 앱 에러 어휘로 "만료 401"을 판별한다 — 필수, 기본값 없음.
    shouldRetryAfterRefresh: (error) => isApiError(error) && error.status === 401,
  },
);
```

재시도 실행분에서는 갱신 경로로 재진입할 수 없다(구조적 재시도-1회). refresh가 `'transient'`면 **원본 에러를 그대로 재던진다** — 토큰은 보존돼 있으므로 상위 재시도 정책(React Query 등)이 이어받는다.

### 1.5 결말 처리 — `matchRefreshOutcome`

raw `switch`의 exhaustiveness는 TS가 강제하지 않는다. 핸들러 키 누락이 곧 컴파일 에러가 되는 매처를 쓰라:

```ts
import { matchRefreshOutcome } from '@gj-kit/expo-auth';

const outcome = await session.refresh();
matchRefreshOutcome(outcome, {
  refreshed: () => {},
  adopted: () => {
    // ⚠ 'adopted'는 주체 동일성을 보증하지 않는다 — 다른 탭의 계정 전환도 채택된다.
    //   계정 전환 가능 호스트는 주체 재확인(예: /me 재조회)이 의무다.
    void reconfirmSubject();
  },
  'signed-out': () => showSignInScreen(),
  invalid: () => showSignInScreen(),
  transient: ({ cause }) => {
    // cause는 refresh 콜백이 throw한 값 — 분류기 버그와 네트워크 플래핑을 구별하는 유일 창구.
    sendTelemetry('auth.refresh.transient', { cause });
  },
});
```

## 2. 서브패스 3개와 peer

| 서브패스 | 내용 | 정적 import하는 peer |
|---|---|---|
| `.` | `createAuthSession`, seam 3종(`TokenStorage`·`RefreshLock`·`AuthClock`), outcome 유니언 + `matchRefreshOutcome`, `AuthError`/`isAuthError`, JWT 유틸 | **없음** |
| `./storage` (네이티브 분기) | `createTokenStorage`(SecureStore) · `createWebLocksRefreshLock` | `expo-secure-store` (optional peer, `>=14.0.0`) |
| `./storage` (node/browser 분기) | `createTokenStorage`(웹 스토리지, SSR 메모리 후퇴) · `createWebLocksRefreshLock` | **없음** |
| `./testing` | 페이크 storage·시계·잠금·각본 콜백·무서명 테스트 JWT | **없음** |

**플랫폼 표 — 같은 API, 다른 물리적 의미**:

| | `'durable'` | `'session'` |
|---|---|---|
| 네이티브 (Expo iOS/Android) | SecureStore 두 키 — 재시작 후 유지 | **프로세스 수명 메모리** — 앱 강제종료 = 로그아웃 |
| 웹 | localStorage — 재방문 후 유지. ⚠ **웹 storage는 보안 경계가 아니다**: 동일 오리진 XSS = 토큰 탈취. 완화는 서버측(짧은 refresh TTL·회전·reuse-detection)과 앱측(CSP)이고, 더 강한 요구에는 httpOnly 쿠키 세션이 이 패키지의 대안이다 | sessionStorage — **탭 스코프** |
| SSR/plain node | 메모리-only 후퇴 (throw 없음) | 메모리-only 후퇴 |

**커스텀 저장소** — seam은 3메서드다. MMKV·keytar류는 이렇게 붙인다:

```ts
import type { TokenStorage } from '@gj-kit/expo-auth';

export const customStorage: TokenStorage = {
  async getTokens() {
    // 계약: 두 토큰이 모두 있을 때만 반환(반쪽 상태는 null), 그리고 갱신 임계 구역 안의
    // 읽기는 다른 탭/인스턴스의 마지막 쓰기를 반영해야 한다(freshness — 캐시 주의).
    return kv.read();
  },
  async setTokens(tokens, options) {
    // 계약: options.persistence 생략 = 현재 모드 유지 (세션 로그인의 durable 승격 사고 차단).
    await kv.write(tokens, options?.persistence);
  },
  async clearTokens() {
    await kv.clear();
  },
};
```

**JWT 유틸의 정직한 이름** — `decodeJwtExpiryEpochSeconds`는 **서명 검증 없는 payload 디코드**다. 스케줄링 힌트 전용이며 인가 판단·신뢰 경계에 쓰면 안 된다. 조작된 exp의 최악은 "갱신 타이밍이 틀리는 것"이고 그 경우 reactive 401 경로가 안전망이다:

```ts
import { decodeJwtExpiryEpochSeconds, describeAccessToken } from '@gj-kit/expo-auth';

const exp = decodeJwtExpiryEpochSeconds('not-a-jwt'); // null — 손상·비JWT 입력은 throw 없이 null
const summary = describeAccessToken('opaque-token'); // { length: 12, expiresAtEpochSeconds: null }
void exp;
void summary; // 로깅에는 이 요약만 — 토큰 바이트를 한 글자도 포함하지 않는다
```

## 3. 오용 차단

**컴파일 에러가 되는 오용** (type 픽스처가 전부 고정):

| # | 오용 | 차단 기제 |
|---|---|---|
| ① | 키 프리픽스·잠금 이름 생략 (앱 이름이 라이브러리 기본값으로 새는 사고의 역방향) | `keyPrefix`·`name` 필수 인자 — 기본값 없음 |
| ② | refresh 콜백이 `'rotated'`라면서 새 토큰을 반환하지 않음 | `'rotated'` 멤버의 `tokens` 필수 속성 |
| ③ | 갱신 결말 처리 누락 (특히 `'transient'`를 `'invalid'`처럼 로그아웃 처리) | `outcome.tokens`는 좁힌 뒤에만 접근 가능 + `matchRefreshOutcome` 핸들러 키 누락 = 컴파일 에러 |
| ④ | 재시도 판별 없는 `runAuthorized` | `shouldRetryAfterRefresh` 필수 옵션 |
| ⑤ | 재시도-두 번 | 공개 표면에 `allowRefresh` 상당 인자가 없다 — 구조적 불가 |
| ⑥ | persistence 생략 `signIn` | `persistence` 필수 인자 |

**런타임 fail-fast**: 빈·공백 `keyPrefix`/`name` → `AuthError('invalid-key-prefix')` · dispose 후 세션 메서드 호출 → `AuthError('session-disposed')`. 판별은 `instanceof`가 아니라 `isAuthError`를 쓴다(다중 엔트리 번들에서 instanceof는 깨진다).

## 4. `./testing` — 네이티브·DOM 없이 전 시나리오

페이크 4종: `createMemoryTokenStorage`(크로스탭 회전/clear 시뮬레이터 + 모드·readCount 관측), `createManualClock`(결정적 타이머), `createFakeRefreshLock`(직렬화 관측 + hold/releaseNext), `createScriptedRefreshRequest`(각본 콜백 + 호출 기록). `createUnsignedTestJwt`로 exp 픽스처를 만든다 — 이름부터 무서명이다.

```ts
import { createAuthSession } from '@gj-kit/expo-auth';
import {
  createManualClock,
  createMemoryTokenStorage,
  createScriptedRefreshRequest,
  createUnsignedTestJwt,
} from '@gj-kit/expo-auth/testing';

const clock = createManualClock({ startMs: 1_700_000_000_000 });
const accessToken = createUnsignedTestJwt({ exp: 1_700_000_900 }); // 잔여 900s
const storage = createMemoryTokenStorage({ tokens: { accessToken, refreshToken: 'refresh-1' } });
const scripted = createScriptedRefreshRequest([
  { status: 'rotated', tokens: { accessToken: 'next', refreshToken: 'refresh-2' }, accessTtlSeconds: 900 },
]);

const testSession = createAuthSession({ storage, refresh: scripted.request, clock });
await testSession.scheduleRefresh();
await clock.advance(810_000); // 900s − lead 90s — 사전 갱신 발화
if (scripted.calls.length !== 1) throw new Error('사전 갱신이 발화하지 않았다');
testSession.dispose();
```

앱의 refresh 분류(§1.1 대조표)도 같은 방식으로 시험할 수 있다: 앱 콜백을 각본 서버 응답에 물려 `'transient'`/`'invalid'` 경계를 단언하라.

## 5. FAQ

**Q. 세션 인스턴스를 몇 개 만들어야 하나?**
**앱당 하나.** 단일 비행은 인스턴스 단위라 두 개(HMR 이중 초기화 포함)는 그 보장을 깬다. 모듈 스코프 싱글턴을 권장한다. 웹에서 lock을 넣었다면 크로스-인스턴스도 직렬화되므로 사실상 방어된다.

**Q. `'adopted'`가 왔다. 같은 사용자인가?**
보증하지 않는다. 판별은 토큰 불일치뿐이라 다른 탭의 signOut→타 계정 signIn도 `'adopted'`다. 계정 전환이 가능한 호스트는 채택 수신 시 주체 재확인(예: `/me` 재조회)을 하라. 안 하면 `runAuthorized` 재시도가 새 계정의 토큰으로 나간다.

**Q. 사전 갱신이 백그라운드에서 안 돈다.**
정상이다. RN 백그라운드에서 타이머 발화는 보장되지 않는다 — 사전 갱신은 포그라운드 최적화일 뿐이고, 복귀 시 `refreshIfExpiringSoon` 배선(§1.3)이 실질 안전망이다. 만료 후 첫 요청도 `runAuthorized`의 reactive 401 경로가 받는다.

**Q. transient가 계속 반복되면?**
스케줄러는 연속 transient에 지수 백오프를 건다: n번째 재시도 지연 = `min(minDelayMs × 2^(n−1), transientMaxDelayMs)` (기본 30s → 60s → … → 5분 상한). `'refreshed'`/`'adopted'`/`signIn`에서 리셋된다. 원본 구조의 "30초 고정 무한 재시도" self-DoS를 막기 위한 것으로, 간격이 벌어져도 로그아웃을 뜻하지 않는다.

**Q. Android에서 SecureStore 2KB 경고가 뜬다.**
access 토큰(JWT)의 클레임 비대가 원인이다. 두 키 분리로 노출을 절반화했지만 제거는 못 한다 — 대응은 서버측 클레임 다이어트뿐이다.

**Q. Web Locks가 없는 브라우저(구 Safari 등)는?**
잠금이 직행 폴백으로 후퇴한다. 단일사용 refresh 토큰의 탭 경쟁이 잔존하고 `'adopted'` 채택이 사후 수습한다 — 전신과 동일한 노출이며 축소는 아니다.

**Q. 기기 시계가 틀어져 있으면?**
JWT exp 기반 스케줄이 무의미해질 수 있다. 서버 권위 값(`accessTtlSeconds` — 로그인·갱신 응답의 expires_in)을 주면 그것이 ①순위다.

**네이티브 실기 체크리스트** (vendoring 후 1회): 로그인 → 앱 강제종료 → 재실행 → 토큰 복원(durable) 확인. `'session'` 로그인은 재실행 시 로그아웃되는 것이 정상이다.

## 라이선스

MIT
