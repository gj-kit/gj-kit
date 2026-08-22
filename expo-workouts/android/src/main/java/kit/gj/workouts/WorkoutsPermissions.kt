package kit.gj.workouts

// 설계 §8.8 (Scope -> 플랫폼 권한 매핑, 소유자 결정 ②) · §7.2 · index f32.
//
// **소유권**: 런타임 매핑은 Kotlin이 갖지만 표 자체는 `tests/fixtures/scope-mapping.json`의 공유
// 골든 벡터로 고정한다(§9.4). JUnit이 그 파일을 읽어 아래 두 맵과 대조해야 하며, 그렇지 않으면
// 매핑 변경이 TS · Swift · Kotlin 3방향으로 조용히 표류한다.
//
// 증거 등급(§8.8, 정직하게 표기):
//   [device]        READ_EXERCISE · WRITE_EXERCISE · READ_EXERCISE_ROUTES · WRITE_EXERCISE_ROUTE ·
//                   READ_DISTANCE · READ_HEALTH_DATA_HISTORY  — 기기에서 `pm grant`로 실제 부여됨(f52)
//   [official-doc]  READ_ACTIVE_CALORIES_BURNED · READ_ELEVATION_GAINED · READ_HEART_RATE · READ_STEPS
//   [unverified]    per-type WRITE_* 5종 — 명명 규칙에서 파생했을 뿐 Phase 0가 개별 `pm grant`한 적이
//                   없다. §9.5 기기 게이트 6번(다섯 줄의 adb)이 몇 초에 닫는다. §11-24.
object WorkoutsPermissions {

  private const val PREFIX = "android.permission.health."

  const val READ_EXERCISE = PREFIX + "READ_EXERCISE"
  const val READ_DISTANCE = PREFIX + "READ_DISTANCE"
  const val READ_ACTIVE_CALORIES_BURNED = PREFIX + "READ_ACTIVE_CALORIES_BURNED"
  const val READ_ELEVATION_GAINED = PREFIX + "READ_ELEVATION_GAINED"
  const val READ_HEART_RATE = PREFIX + "READ_HEART_RATE"
  const val READ_STEPS = PREFIX + "READ_STEPS"

  /**
   * ★ 하드코딩된 상수다 — connect-client 1.1.0의 `HealthPermission`에는 이 문자열에 해당하는
   * 상수가 **없다**(index f3 / f32). androidx가 나중에 추가하더라도 이 값이 정본이다.
   *
   * ★★ **매니페스트 전용**이다. 플러그인이 `'routes'`가 read/write 어느 쪽에든 있으면 무조건
   * 선언하고(f112: 미선언이면 route 요청이 조용히 null을 반환한다), **런타임 요청 집합에는 절대
   * 넣지 않는다**(f110 · 설계 §7.2). 진실된 읽기는 `getGrantedPermissions().contains(...)` 하나뿐이다.
   */
  const val READ_EXERCISE_ROUTES = PREFIX + "READ_EXERCISE_ROUTES"

  const val WRITE_EXERCISE = PREFIX + "WRITE_EXERCISE"
  const val WRITE_DISTANCE = PREFIX + "WRITE_DISTANCE"
  const val WRITE_ACTIVE_CALORIES_BURNED = PREFIX + "WRITE_ACTIVE_CALORIES_BURNED"
  const val WRITE_ELEVATION_GAINED = PREFIX + "WRITE_ELEVATION_GAINED"
  const val WRITE_HEART_RATE = PREFIX + "WRITE_HEART_RATE"
  const val WRITE_STEPS = PREFIX + "WRITE_STEPS"

  /** 단수형이다 — READ 쪽만 복수(`ROUTES`)다. 오타가 아니다(§8.8). */
  const val WRITE_EXERCISE_ROUTE = PREFIX + "WRITE_EXERCISE_ROUTE"

  const val READ_HEALTH_DATA_HISTORY = PREFIX + "READ_HEALTH_DATA_HISTORY"

  /** scope 이름 -> READ 권한 문자열. 키는 TS `Scope` 유니언과 동일하다. */
  val READ_BY_SCOPE: Map<String, String> = mapOf(
    "workouts" to READ_EXERCISE,
    "distance" to READ_DISTANCE,
    "activeEnergy" to READ_ACTIVE_CALORIES_BURNED,
    "elevation" to READ_ELEVATION_GAINED,
    "routes" to READ_EXERCISE_ROUTES,
    "heartRate" to READ_HEART_RATE,
    "steps" to READ_STEPS,
  )

  /** scope 이름 -> WRITE 권한 문자열. */
  val WRITE_BY_SCOPE: Map<String, String> = mapOf(
    "workouts" to WRITE_EXERCISE,
    "distance" to WRITE_DISTANCE,
    "activeEnergy" to WRITE_ACTIVE_CALORIES_BURNED,
    "elevation" to WRITE_ELEVATION_GAINED,
    "routes" to WRITE_EXERCISE_ROUTE,
    "heartRate" to WRITE_HEART_RATE,
    "steps" to WRITE_STEPS,
  )

  /** 매니페스트에만 존재할 수 있고 런타임 contract에는 절대 못 들어가는 것들(f110). */
  val MANIFEST_ONLY: Set<String> = setOf(READ_EXERCISE_ROUTES)

  /**
   * 런타임 권한 contract에 넣어도 되는 집합으로 좁힌다.
   *
   * f110: `READ_EXERCISE_ROUTES`를 contract 집합에 넣어 "요청"하면 안 되고, 결과 집합에 없다고
   * 해서 거부로 추론해서도 안 된다. 요청 불가한 별도 scope로 모델링한다.
   */
  fun runtimeRequestable(request: Set<String>): Set<String> =
    request.filterNot { MANIFEST_ONLY.contains(it) }.toSet()

  /**
   * 커서의 `g` 지문 재료(§4.2 · §8.8 마지막 문단). 부여된 **권한 문자열**의 정렬 목록이지 scope
   * 이름의 목록이 아니다 — 그래서 어휘 변경이 기존 커서를 무효화하지 않는다.
   * 지문 자체(FNV-1a)는 TS가 계산한다. 여기서는 정렬·결합만 한다.
   */
  fun grantedFingerprintSource(granted: Set<String>): String =
    granted.sorted().joinToString(",")
}
