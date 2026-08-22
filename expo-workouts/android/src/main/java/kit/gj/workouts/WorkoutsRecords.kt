package kit.gj.workouts

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

// AsyncFunction의 **입력** 객체들. Expo가 JS 객체를 이 클래스들로 변환한다.
//
// ⚠ `RecordTypeConverter`는 인스턴스를 무인자로 할당한 뒤 필드를 리플렉션으로 채운다. 그래서
//   프로퍼티는 기본값을 가진 `var`여야 하고 `@Field`가 붙어야 한다(annotation target = PROPERTY).
// ⚠ epoch ms는 전부 Double이다. `./core`가 이미 유한성·EPOCH_MS_FLOOR·`fromMs < toMs`를 검증한
//   뒤에만 여기에 도달한다(설계 §5.7 57번 행). Kotlin은 그 검증을 다시 하지 않는다 — 두 곳에서
//   검증하면 두 곳이 표류한다.

class WindowRecord : Record {
  @Field var fromMs: Double = 0.0
  @Field var toMs: Double = 0.0

  fun toDto(): WindowDto = WindowDto(fromMs, toMs)
}

class WorkoutPageQueryRecord : Record {
  @Field var fromMs: Double = 0.0
  @Field var toMs: Double = 0.0

  /** §8.4: Android 50, iOS 200. f116(루트 즉시 materialise, 12x–19x) 때문에 보수적으로 페이징한다. */
  @Field var pageSize: Int = 50

  /** 플랫폼 자신의 토큰. `./core`가 `gjp1.` 매직을 이미 벗겨서 준다. */
  @Field var pageToken: String? = null

  fun window(): WindowDto = WindowDto(fromMs, toMs)
}

class MetricQueryRecord : Record {
  @Field var fromMs: Double = 0.0
  @Field var toMs: Double = 0.0

  /** 'distance' | 'activeEnergy' | 'elevation' | 'steps'. */
  @Field var type: String = ""

  /** 이 페이지에 등장한 `dataOrigin.packageName` 집합. 클라이언트 합산의 필터다. */
  @Field var origins: List<String> = emptyList()

  fun window(): WindowDto = WindowDto(fromMs, toMs)
  fun metricType(): MetricType = MetricType.fromWire(type)
}

/**
 * Phase 3 결함 B — `requestPermissions`의 **방향이 있는** 입력.
 *
 * Phase 2까지 이 seam 멤버는 평평한 `List<String>`이었다. Android에서는 방향이 권한 문자열
 * 자체에 들어 있어(`READ_EXERCISE` vs `WRITE_EXERCISE`) 무손실이지만, iOS에서는 **같은 타입
 * 식별자가 read와 share 양쪽을 가리키므로** 평평한 배열이
 * `HKHealthStore.requestAuthorization(toShare:read:)`를 표현하지 못한다. 그래서 두 집합을
 * 명시한다. Android 쪽 구현은 두 리스트의 **합집합**을 contract 집합으로 쓰면 된다 —
 * `READ_EXERCISE_ROUTES`는 `./core`가 이미 걸러서 보내지 않는다(f110).
 */
class PermissionRequestRecord : Record {
  @Field var read: List<String> = emptyList()
  @Field var write: List<String> = emptyList()

  /** Android의 런타임 contract 집합. 방향이 문자열에 있으므로 합집합이 곧 요청이다. */
  fun requested(): Set<String> = (read + write).toSet()
}

class DeleteRefRecord : Record {
  @Field var nativeId: String? = null
  @Field var clientId: String? = null
}

class PauseRecord : Record {
  @Field var startMs: Double = 0.0
  @Field var endMs: Double = 0.0
  @Field var auto: Boolean? = null

  fun toDto(): PauseDto = PauseDto(startMs, endMs, auto)
}

class LapRecord : Record {
  @Field var startMs: Double = 0.0
  @Field var endMs: Double = 0.0
  @Field var distanceM: Double? = null

  fun toDto(): LapDto = LapDto(startMs, endMs, distanceM)
}

class HeartRateSampleRecord : Record {
  @Field var t: Double = 0.0
  @Field var bpm: Double = 0.0

  fun toDto(): HeartRateDto = HeartRateDto(t, bpm)
}

class RoutePointRecord : Record {
  @Field var t: Double = 0.0
  @Field var lat: Double = 0.0
  @Field var lon: Double = 0.0
  @Field var altM: Double? = null
  @Field var hAccM: Double? = null
  @Field var vAccM: Double? = null
  @Field var speedMps: Double? = null
  @Field var courseDeg: Double? = null

  fun toDto(): RoutePointDto = RoutePointDto(t, lat, lon, altM, hAccM, vAccM, speedMps, courseDeg)
}

/**
 * `saveWorkout`의 입력. 여기 도달한 시점에 `./core`가 이미 끝낸 일:
 *  - §8.2 루트 위생 8규칙 (좌표 유효성 · hAcc · 중복 타임스탬프 · 창 밖 포인트 · f83 sentinel)
 *  - 활동 -> `activityTypeRaw` 정수 매핑 (§8.3)
 *  - `steps <= 0` 제거 (Health Connect가 0-count StepsRecord에 throw한다, index f44)
 *  - `requiredWriteScopes` 사전 검사 (§8.5-0)
 * Kotlin이 여전히 해야 하는 것은 **크기 가드**뿐이다(§8.2 8단계, f99/f100) — 그것은 Phase 3다.
 */
class WorkoutWriteRecord : Record {
  @Field var clientId: String = ""
  @Field var version: Double = 1.0
  @Field var activityTypeRaw: Int = 0
  @Field var indoor: Boolean? = null
  @Field var startMs: Double = 0.0
  @Field var endMs: Double = 0.0
  @Field var utcOffsetMin: Int? = null
  @Field var timeZoneId: String? = null
  @Field var pauses: List<PauseRecord> = emptyList()
  @Field var laps: List<LapRecord> = emptyList()
  @Field var distanceM: Double? = null
  @Field var activeEnergyKcal: Double? = null
  @Field var elevationGainM: Double? = null
  @Field var steps: Double? = null
  @Field var heartRate: List<HeartRateSampleRecord> = emptyList()
  @Field var route: List<RoutePointRecord> = emptyList()
}
