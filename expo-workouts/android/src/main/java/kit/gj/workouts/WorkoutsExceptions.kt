package kit.gj.workouts

import expo.modules.kotlin.exception.CodedException

// 설계 §5.6 (코드 14종) · §9.3 `error-code-parity` 가드 · 미션 §4.1.
//
// Expo 런타임은 **예외 클래스 이름**에서 `ERR_*` 코드를 만든다(index f8):
//   "ERR_" + simpleName.replace(/(Exception)$/,"").replace(/(.)([A-Z])/g,"$1_$2").uppercase()
// 그래서 이름이 표류하면 JS 쪽 `mapErrors.ts`가 조용히 'internal'로 떨어진다. Swift 레인도 **같은
// 14개 이름**을 쓴다. TS 쪽 정본은 `workoutsExceptionClassName(code)` / `nativeErrorCodeFor(code)`
// (`@gj-kit/expo-workouts/core`)이며, 가드가 아래 집합을 그것과 1:1로 대조한다.
//
//   WorkoutsUnavailableException      -> ERR_WORKOUTS_UNAVAILABLE
//   WorkoutsUpdateRequiredException   -> ERR_WORKOUTS_UPDATE_REQUIRED
//   WorkoutsNotAuthorizedException    -> ERR_WORKOUTS_NOT_AUTHORIZED
//   WorkoutsConsentRequiredException  -> ERR_WORKOUTS_CONSENT_REQUIRED
//   WorkoutsHistoryRequiredException  -> ERR_WORKOUTS_HISTORY_REQUIRED
//   WorkoutsRateLimitedException      -> ERR_WORKOUTS_RATE_LIMITED
//   WorkoutsBusyException             -> ERR_WORKOUTS_BUSY
//   WorkoutsInvalidArgumentException  -> ERR_WORKOUTS_INVALID_ARGUMENT
//   WorkoutsRouteTooLargeException    -> ERR_WORKOUTS_ROUTE_TOO_LARGE
//   WorkoutsStaleVersionException     -> ERR_WORKOUTS_STALE_VERSION
//   WorkoutsStoreLockedException      -> ERR_WORKOUTS_STORE_LOCKED
//   WorkoutsCancelledException        -> ERR_WORKOUTS_CANCELLED
//   WorkoutsIoException               -> ERR_WORKOUTS_IO
//   WorkoutsInternalException         -> ERR_WORKOUTS_INTERNAL
//
// ⚠ 프라이버시(미션 §4.2 · §9.3 `redaction-guard`): `message`는 **템플릿으로 만든 짧은 진단 문자열**만
//   담는다 — 예외 클래스 이름 · 플랫폼 에러 코드 · 한정된 이유 토큰. 좌표 · 심박 · 거리 · 칼로리 ·
//   걸음 수 · 제목 · 메모는 **절대** 보간하지 않는다. 아래 생성자들이 받는 것도 전부 그런 토큰이다.

/** 이 런타임/기기에는 쓸 수 있는 헬스 스토어가 없다. Android < 28 · SDK_UNAVAILABLE. */
class WorkoutsUnavailableException(reason: String) :
  CodedException("Health Connect is unavailable: $reason")

/** Play의 Health Connect provider 갱신이 필요하다(API 28–33 경로). `openStoreListing()` CTA. */
class WorkoutsUpdateRequiredException :
  CodedException("The Health Connect provider requires an update")

/** 플랫폼이 권한 부족으로 명시적으로 거절했다. 누락된 **scope 이름**까지만 담는다. */
class WorkoutsNotAuthorizedException(detail: String) :
  CodedException("Not authorized: $detail")

/** 루트는 존재하지만 지금은 읽을 수 없다. 절대 'none'으로 붕괴시키지 않는다(f114, f118). */
class WorkoutsConsentRequiredException(detail: String) :
  CodedException("Route consent required: $detail")

/** 창이 30일 히스토리 벽 밖에 닿는데 READ_HEALTH_DATA_HISTORY가 없다(index f38, D10). */
class WorkoutsHistoryRequiredException :
  CodedException("The window reaches past the 30-day history wall")

/** 읽기 예산 소진. `retryAfterMs`는 **우리 예산**의 추정치이며 플랫폼은 아무것도 공표하지 않는다. */
class WorkoutsRateLimitedException(detail: String) :
  CodedException("Rate limited: $detail")

/** 스토어가 바쁘다(HealthConnectException 8), 또는 UI 바인딩 연산이 이미 1건 진행 중이다(f105). */
class WorkoutsBusyException(detail: String) :
  CodedException("Busy: $detail")

/** 플랫폼을 건드리기 전에 라이브러리가 거절한 호출자 입력. 호출을 고쳐야 하는 프로그래밍 오류다. */
class WorkoutsInvalidArgumentException(detail: String) :
  CodedException("Invalid argument: $detail")

/** 직렬화된 레코드가 1 000 000 B 단일 레코드 상한을 넘는다(f99, f100, f101). */
class WorkoutsRouteTooLargeException(detail: String) :
  CodedException("Route too large: $detail")

/** 저장된 clientRecordVersion이 우리가 보낸 것보다 최신이다. 무조건 read-back이 잡는다(f93, f94). */
class WorkoutsStaleVersionException(detail: String) :
  CodedException("Stale version: $detail")

/** iOS 전용 의미지만 코드 대칭을 위해 Kotlin에도 존재한다(§9.3 error-code-parity는 전수 대응을 요구한다). */
class WorkoutsStoreLockedException :
  CodedException("Protected data is unavailable (device locked)")

/** Activity/프로세스 소멸로 UI 바인딩 연산이 답을 내지 못했다(index f9). */
class WorkoutsCancelledException(detail: String) :
  CodedException("Cancelled: $detail")

/** IPC/DB 실패. IOException · RemoteException · DeadObjectException(f105 여파). */
class WorkoutsIoException(detail: String, cause: Throwable? = null) :
  CodedException("I/O failure: $detail", cause)

/** 이 라이브러리가 모델링하지 않은 플랫폼 결과. 언제나 버그 리포트 대상이다. */
class WorkoutsInternalException(detail: String, cause: Throwable? = null) :
  CodedException("Internal: $detail", cause)
