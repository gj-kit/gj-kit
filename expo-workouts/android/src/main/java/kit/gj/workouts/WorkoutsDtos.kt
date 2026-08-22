package kit.gj.workouts

// 브리지 DTO — 설계 §3.2 (`src/core/native-contract.ts`)의 Kotlin 대응물.
//
// 규칙 세 가지, 전부 TS 쪽 계약에서 온 것이다:
//  1. **평면 · JSON 직렬화 가능**. androidx.health 타입은 하나도 넘어가지 않는다.
//  2. **epoch ms는 Double**. JS number가 받는 값이고 2^53 아래이므로 정밀도 손실이 없다.
//     Instant <-> Double 변환은 이 파일의 경계에서만 일어난다.
//  3. **"없음"은 null**. `./core`가 null과 키 부재를 둘 다 `undefined`("모름")로 접는 유일한
//     지점이다. 0으로 새게 하지 않는다 — `0 kcal` / `0 m`은 f109가 금지한 거짓말이다.
//
// 각 DTO의 `toMap()`이 브리지 표현이다. Expo의 JSTypeConverter가 Map<String, Any?>를 JS 객체로 만든다.

// ── 가용성 ────────────────────────────────────────────────────────────────────

/** 설계 §5.7 3–5번 행. `getSdkStatus`만이 근거다 — PackageManager는 금지(f88). */
sealed class AvailabilityDto {
  object Available : AvailabilityDto()

  /** `reason`은 'platformTooOld'(API < 28) 또는 'notSupported'. */
  data class Unavailable(val reason: String) : AvailabilityDto()

  object UpdateRequired : AvailabilityDto()

  fun toMap(): Map<String, Any?> = when (this) {
    is Available -> mapOf("status" to "available")
    is Unavailable -> mapOf("status" to "unavailable", "reason" to reason)
    is UpdateRequired -> mapOf("status" to "updateRequired")
  }

  companion object {
    const val REASON_PLATFORM_TOO_OLD = "platformTooOld"
    const val REASON_NOT_SUPPORTED = "notSupported"
  }
}

// ── 인가 ──────────────────────────────────────────────────────────────────────

/**
 * **판정은 하지 않는다** — 원시 사실만 넘긴다. 판정(Record<Scope, ScopeStatus>)은 전부 TS가 한다.
 * `routeAccess`는 'all' | 'own' | 'perRoute'로 이미 축약된 값이다.
 */
data class AuthorizationSnapshotDto(
  val availability: AvailabilityDto,
  val granted: List<String>,
  val declared: List<String>,
  val foreground: Boolean,
  val routeAccess: String,
  val history: Boolean,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "platform" to "android",
    "availability" to availability.toMap(),
    "granted" to granted,
    "declared" to declared,
    // iOS 전용 필드. Android에는 "시트가 뜰 것인가"에 해당하는 질의가 없다.
    "wouldPrompt" to false,
    // iOS 전용 필드(§3.2 Phase 3 정정). Android는 방향이 권한 문자열에 있어 `granted`가 전부다.
    "statuses" to null,
    "foreground" to foreground,
    "routeAccess" to routeAccess,
    "history" to history,
  )
}

/**
 * 권한 요청의 **원시** 결과. before/after 비교가 판정의 유일한 근거다.
 * `conclusive = false`는 플랫폼이 아무것도 돌려주지 않았다는 뜻이며(f120: 온보딩 "Go back",
 * 19.6 s 뒤 빈 집합), 그때 scope 상태는 **불변**이다. 절대 'denied'로 뒤집지 않는다.
 */
data class PermissionOutcomeDto(
  val before: List<String>,
  val after: List<String>,
  val conclusive: Boolean,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "before" to before,
    "after" to after,
    "conclusive" to conclusive,
  )
}

// ── 창과 메트릭 ───────────────────────────────────────────────────────────────

/** 반개 구간 `[fromMs, toMs)`이며 언제나 레코드의 **시작 순간**을 뜻한다(f107). */
data class WindowDto(val fromMs: Double, val toMs: Double)

/**
 * 세션당이 아니라 **페이지 창당** 한 번 읽는 메트릭 종류(§8.4).
 * `TotalCaloriesBurned`는 여기에 없다 — BMR이 섞여 조용히 틀린 숫자를 준다(index f37).
 */
enum class MetricType(val wire: String) {
  DISTANCE("distance"),
  ACTIVE_ENERGY("activeEnergy"),
  ELEVATION("elevation"),
  STEPS("steps");

  /** 이 메트릭이 쓰기·삭제 경로에서 갖는 레코드 종류. */
  val recordType: RecordType
    get() = when (this) {
      DISTANCE -> RecordType.DISTANCE
      ACTIVE_ENERGY -> RecordType.ACTIVE_ENERGY
      ELEVATION -> RecordType.ELEVATION
      STEPS -> RecordType.STEPS
    }

  companion object {
    fun fromWire(wire: String): MetricType =
      entries.firstOrNull { it.wire == wire }
        ?: throw WorkoutsInvalidArgumentException("unknown metric type token")
  }
}

/**
 * 한 워크아웃이 Health Connect에 실제로 만드는 레코드 종류 전부 — **읽기용 `MetricType`보다 넓다**.
 *
 * ⚠ Phase 3 편차 (설계 §3.4). §3.4의 seam은 `readBackVersion(clientRecordId, type: MetricType?)` ·
 *   `deleteByClientRecordIds(type: MetricType?, ids)`로 "null이면 세션"이라는 규약을 썼다. 그 어휘로는
 *   §8.6이 요구하는 **6회 삭제**(세션 + 5종)를 표현할 수 없다 — `MetricType`에 심박이 없기 때문이다.
 *   심박은 `readMetricRecords`의 대상이 아니라(별도 seam 멤버다) `MetricType`에 넣으면 그 멤버의
 *   의미가 흐려지므로, 쓰기·삭제 축에만 쓰이는 이 열거형을 새로 둔다. 한 타입당 한 번이라는 §8.6의
 *   모양은 그대로다.
 *
 * `suffix`는 f98이 기기에서 검증한 clientRecordId 규약 그대로다.
 */
enum class RecordType(val suffix: String) {
  SESSION(""),
  DISTANCE(":distance"),
  ACTIVE_ENERGY(":kcal"),
  ELEVATION(":elev"),
  STEPS(":steps"),
  HEART_RATE(":hr"),
}

/** 한 메트릭 레코드 행. 합산은 `./core`가 한다 — 그래야 Node에서 fuzz된다. */
data class MetricRowDto(
  val type: MetricType,
  val startMs: Double,
  val endMs: Double,
  val value: Double,
  /** `dataOrigin.packageName`. 소스별 합산에 필요하다. */
  val origin: String,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "type" to type.wire,
    "startMs" to startMs,
    "endMs" to endMs,
    "value" to value,
    "origin" to origin,
  )
}

data class HeartRateDto(val t: Double, val bpm: Double) {
  fun toMap(): Map<String, Any?> = mapOf("t" to t, "bpm" to bpm)
}

/** §3.4의 `HeartRateRowDto`. 브리지 DTO와 같은 모양이라 하나만 정의한다. */
typealias HeartRateRowDto = HeartRateDto

// ── 워크아웃 ──────────────────────────────────────────────────────────────────

data class SourceDto(
  val id: String,
  val name: String? = null,
  val version: String? = null,
  val deviceModel: String? = null,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "name" to name,
    "version" to version,
    "deviceModel" to deviceModel,
  )
}

data class PauseDto(val startMs: Double, val endMs: Double, val auto: Boolean? = null) {
  fun toMap(): Map<String, Any?> = mapOf("startMs" to startMs, "endMs" to endMs, "auto" to auto)
}

data class LapDto(val startMs: Double, val endMs: Double, val distanceM: Double? = null) {
  fun toMap(): Map<String, Any?> =
    mapOf("startMs" to startMs, "endMs" to endMs, "distanceM" to distanceM)
}

data class HeartRateSummaryDto(
  val avgBpm: Double? = null,
  val minBpm: Double? = null,
  val maxBpm: Double? = null,
) {
  fun toMap(): Map<String, Any?> =
    mapOf("avgBpm" to avgBpm, "minBpm" to minBpm, "maxBpm" to maxBpm)
}

/** 'available' | 'consentRequired' | 'none'. 플랫폼 tri-state와 1:1이다(f114, f118). */
object RouteStates {
  const val AVAILABLE = "available"
  const val CONSENT_REQUIRED = "consentRequired"
  const val NONE = "none"
}

/**
 * 한 워크아웃의 평면 DTO.
 *
 * ⚠ `kind`가 **없다**. 활동 매핑은 `./core`(src/core/activity.ts)가 한다. 네이티브는 raw 정수만
 *   보낸다 — 그래야 §8.3의 매핑표가 Node에서 fuzz되고, 세 언어가 같은
 *   `tests/fixtures/activity-vectors.json`을 읽는다.
 * ⚠ `indoor`는 Android에서 **언제나 null**이다. `./core`가 exerciseType에서 파생한다(§8.3).
 */
data class WorkoutDto(
  val id: String,
  val clientId: String?,
  val isOwn: Boolean,
  val activityTypeRaw: Int,
  val startMs: Double,
  val endMs: Double,
  val activeDurationS: Double,
  val utcOffsetMin: Int?,
  val source: SourceDto,
  val distanceM: Double? = null,
  val distanceProvenance: String? = null,
  val activeEnergyKcal: Double? = null,
  val activeEnergyProvenance: String? = null,
  val elevationGainM: Double? = null,
  val heartRate: HeartRateSummaryDto? = null,
  val steps: Double? = null,
  val pauses: List<PauseDto> = emptyList(),
  val laps: List<LapDto> = emptyList(),
  val routeState: String = RouteStates.NONE,
  val lastModifiedMs: Double? = null,
  val android: AndroidWorkoutDataDto,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "platform" to "android",
    "id" to id,
    "clientId" to clientId,
    "isOwn" to isOwn,
    "activityTypeRaw" to activityTypeRaw,
    // Android는 실내/실외를 exerciseType 정수에 이미 담고 있다. null이 정직한 값이다.
    "indoor" to null,
    "startMs" to startMs,
    "endMs" to endMs,
    "activeDurationS" to activeDurationS,
    "utcOffsetMin" to utcOffsetMin,
    "source" to source.toMap(),
    "distanceM" to distanceM,
    "distanceProvenance" to distanceProvenance,
    "activeEnergyKcal" to activeEnergyKcal,
    "activeEnergyProvenance" to activeEnergyProvenance,
    "elevationGainM" to elevationGainM,
    "heartRate" to heartRate?.toMap(),
    "steps" to steps,
    "pauses" to pauses.map { it.toMap() },
    "laps" to laps.map { it.toMap() },
    "routeState" to routeState,
    "lastModifiedMs" to lastModifiedMs,
    "ios" to null,
    "android" to android.toMap(),
  )
}

/** 세그먼트 한 줄. `pauses`가 걸러내는 REST(44)까지 **전부** 그대로 실린다(설계 §5.1). */
data class SegmentDto(val type: Int, val startMs: Double, val endMs: Double) {
  fun toMap(): Map<String, Any?> = mapOf("type" to type, "startMs" to startMs, "endMs" to endMs)
}

/** `AndroidWorkoutData` (설계 §5.1). 남의 앱 clientRecordId도 보이므로 PUBLIC 데이터로 다룬다. */
data class AndroidWorkoutDataDto(
  val exerciseType: Int,
  val packageName: String,
  val recordingMethod: Int,
  val deviceType: Int? = null,
  val clientRecordId: String? = null,
  val clientRecordVersion: Double? = null,
  val endUtcOffsetMin: Int? = null,
  /** 남의 앱이 쓴 텍스트다. 이 라이브러리는 title/notes를 **쓰지 않는다**. */
  val title: String? = null,
  val notes: String? = null,
  val segments: List<SegmentDto> = emptyList(),
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "exerciseType" to exerciseType,
    "packageName" to packageName,
    "recordingMethod" to recordingMethod,
    "deviceType" to deviceType,
    "clientRecordId" to clientRecordId,
    "clientRecordVersion" to clientRecordVersion,
    "endUtcOffsetMin" to endUtcOffsetMin,
    "title" to title,
    "notes" to notes,
    "segments" to segments.map { it.toMap() },
  )
}

/** §3.4의 `SessionDto`. Health Connect의 세션이 곧 우리의 워크아웃이라 같은 타입이다. */
typealias SessionDto = WorkoutDto

data class WorkoutPageDto(
  val items: List<WorkoutDto>,
  /** 플랫폼 자신의 불투명 토큰. `gjp1.` 매직으로 감싸는 것은 `./core`의 일이다. */
  val nextPageToken: String?,
  /**
   * 이 페이지를 읽으면서 플랫폼이 **이미 materialise한** `Data` 루트들(f116). 네이티브 캐시로만
   * 흘러가고 **브리지를 건너지 않는다** — `toMap()`에 없는 이유다. 139 423포인트를 JS로 넘기는
   * 것은 f116이 요구하는 것의 정반대다.
   */
  val materialisedRoutes: List<Pair<String, List<RoutePointDto>>> = emptyList(),
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "items" to items.map { it.toMap() },
    "nextPageToken" to nextPageToken,
  )
}

/** §3.4의 `SessionPageDto`. */
typealias SessionPageDto = WorkoutPageDto

// ── 동기화 ────────────────────────────────────────────────────────────────────

data class RemovedDto(val id: String, val replaced: Boolean) {
  fun toMap(): Map<String, Any?> = mapOf("id" to id, "replaced" to replaced)
}

/**
 * 드레인 한 배치. `checkpoint`는 **이 배치를 만들기 전에** 잡힌 값이다 — 그래야 갭이 없다(§4.4).
 * `expired`는 `ChangesResponse.changesTokenExpired`이며 에러가 아니라 `reset: true`가 된다.
 */
data class ChangeBatchDto(
  val added: List<WorkoutDto>,
  val removed: List<RemovedDto>,
  val checkpoint: String,
  val hasMore: Boolean,
  val expired: Boolean,
  /** `WorkoutPageDto`와 같은 이유로 브리지를 건너지 않는다(f116). */
  val materialisedRoutes: List<Pair<String, List<RoutePointDto>>> = emptyList(),
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "added" to added.map { it.toMap() },
    "removed" to removed.map { it.toMap() },
    "checkpoint" to checkpoint,
    "hasMore" to hasMore,
    "expired" to expired,
  )
}

/** §3.2의 `DrainBatchDto`. */
typealias DrainBatchDto = ChangeBatchDto

// ── 루트 ──────────────────────────────────────────────────────────────────────

data class RoutePointDto(
  val t: Double,
  val lat: Double,
  val lon: Double,
  val altM: Double? = null,
  val hAccM: Double? = null,
  val vAccM: Double? = null,
  val speedMps: Double? = null,
  val courseDeg: Double? = null,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "t" to t,
    "lat" to lat,
    "lon" to lon,
    "altM" to altM,
    "hAccM" to hAccM,
    "vAccM" to vAccM,
    // Health Connect의 ExerciseRoute.Location은 속도·방위를 갖지 않는다. null이 정직한 값이다.
    "speedMps" to speedMps,
    "courseDeg" to courseDeg,
  )
}

/**
 * 한 번의 루트 읽기 결과. **매 읽기마다 재계산한다 — 절대 캐시하지 않는다**(f114: 앱은 자기가 쓴
 * 루트에 대한 접근을 잃을 수 있다).
 */
data class RouteOutcomeDto(val state: String, val points: List<RoutePointDto>) {
  companion object {
    fun none(): RouteOutcomeDto = RouteOutcomeDto(RouteStates.NONE, emptyList())
    fun consentRequired(): RouteOutcomeDto =
      RouteOutcomeDto(RouteStates.CONSENT_REQUIRED, emptyList())
    fun data(points: List<RoutePointDto>): RouteOutcomeDto =
      RouteOutcomeDto(RouteStates.AVAILABLE, points)
  }
}

data class RouteHandleDto(val handle: String, val state: String) {
  fun toMap(): Map<String, Any?> = mapOf("handle" to handle, "state" to state)
}

// ── 쓰기 ──────────────────────────────────────────────────────────────────────

/** 'stored' | 'none' | 'dropped' | 'notPermitted' | 'deferred'. */
object RouteWriteOutcomes {
  const val STORED = "stored"
  const val NONE = "none"
  const val DROPPED = "dropped"
  const val NOT_PERMITTED = "notPermitted"
  const val DEFERRED = "deferred"
}

data class InsertOutcomeDto(
  val nativeId: String?,
  val route: String,
  val routePointsWritten: Int,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    // Android에는 잠긴 기기 경로가 없다 — 'pendingUnlock'은 iOS 전용이다(f70).
    "status" to "saved",
    "nativeId" to nativeId,
    "route" to route,
    "routePointsWritten" to routePointsWritten,
  )
}

/** §3.2의 `SaveOutcomeDto`. */
typealias SaveOutcomeDto = InsertOutcomeDto

/** `deleteWorkout`의 입력. 정확히 하나만 채워져 온다 — `./core`가 이미 검증했다(§8.6). */
data class DeleteRefDto(val nativeId: String? = null, val clientId: String? = null)

data class ExistingWorkoutDto(val nativeId: String, val version: Double) {
  fun toMap(): Map<String, Any?> = mapOf("nativeId" to nativeId, "version" to version)
}

/**
 * `insertWorkout`의 입력 — **평면 DTO**다. 브리지용 `WorkoutWriteRecord`와 따로 두는 이유는
 * 하나뿐이다: `Record`는 expo-modules-core의 타입이고, `HealthConnectGateway`는 JUnit이
 * expo 없이 페이크할 수 있어야 한다(index f56 — Robolectric에는 Health Connect 섀도가 없다).
 */
data class WorkoutWriteDto(
  val clientId: String,
  val version: Long,
  val activityTypeRaw: Int,
  val startMs: Double,
  val endMs: Double,
  val utcOffsetMin: Int?,
  val timeZoneId: String?,
  val pauses: List<PauseDto>,
  val laps: List<LapDto>,
  val distanceM: Double?,
  val activeEnergyKcal: Double?,
  val elevationGainM: Double?,
  val steps: Long?,
  val heartRate: List<HeartRateDto>,
  val route: List<RoutePointDto>,
)
