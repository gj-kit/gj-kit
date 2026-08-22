package kit.gj.workouts

import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseLap
import androidx.health.connect.client.records.ExerciseRoute
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSegment
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * androidx.health <-> 평면 DTO의 **유일한 경계**. seam 위쪽(`WorkoutsOperations`)에는 androidx 타입이
 * 하나도 올라가지 않는다(설계 §3.4).
 *
 * 여기서 하지 **않는** 것: 활동 매핑(§8.3) · 루트 위생(§8.2) · 메트릭 합산(§8.4) · 창 검증.
 * 전부 `./core`의 순수 TS다. 네이티브는 **원시 사실만 보내고 판정하지 않는다**.
 */
internal object HealthConnectMapping {

  /** 명시적 pause 세그먼트만이 `pauses`다. REST(44)는 `android.segments`에 남지만 제외된다(§5.1). */
  const val SEGMENT_TYPE_PAUSE = ExerciseSegment.EXERCISE_SEGMENT_TYPE_PAUSE

  fun instant(ms: Double): Instant = Instant.ofEpochMilli(ms.toLong())

  fun ms(instant: Instant): Double = instant.toEpochMilli().toDouble()

  fun offsetMinutes(offset: ZoneOffset?): Int? = offset?.totalSeconds?.div(60)

  /**
   * 쓰기 시 붙일 zone offset. 호출자의 `utcOffsetMin`이 우선이고, 없으면 `timeZoneId`, 그것도 없으면
   * 기기의 현재 규칙이다(§8.5-2).
   */
  fun writeOffset(write: WorkoutWriteDto, at: Instant): ZoneOffset {
    val minutes = write.utcOffsetMin
    if (minutes != null) return ZoneOffset.ofTotalSeconds(minutes * 60)
    val zone = write.timeZoneId
    if (zone != null) {
      val resolved = runCatching { ZoneId.of(zone) }.getOrNull()
      if (resolved != null) return resolved.rules.getOffset(at)
    }
    return ZoneId.systemDefault().rules.getOffset(at)
  }

  // ── 읽기 방향 ───────────────────────────────────────────────────────────────

  /**
   * `ExerciseRouteResult`의 tri-state를 **1:1**로 옮긴다(f118).
   * `ConsentRequired`를 `none`으로 붕괴시키지 않는다 — "루트는 있는데 지금 못 본다"는 다른 사실이다(f114).
   */
  fun routeOutcome(result: ExerciseRouteResult): RouteOutcomeDto = when (result) {
    is ExerciseRouteResult.Data -> {
      val points = result.exerciseRoute.toDtos()
      if (points.isEmpty()) RouteOutcomeDto.none() else RouteOutcomeDto.data(points)
    }
    is ExerciseRouteResult.ConsentRequired -> RouteOutcomeDto.consentRequired()
    is ExerciseRouteResult.NoData -> RouteOutcomeDto.none()
    // androidx가 넷째 상태를 추가하면 `none`이 아니라 `consentRequired`가 안전한 쪽이다:
    // "없다"고 말해 소비자가 루트 UI를 지우는 것보다 "지금은 못 본다"가 되돌릴 수 있다.
    else -> RouteOutcomeDto.consentRequired()
  }

  fun workout(record: ExerciseSessionRecord, ownPackageName: String): WorkoutDto {
    val meta = record.metadata
    val packageName = meta.dataOrigin.packageName
    val isOwn = packageName == ownPackageName
    val startMs = ms(record.startTime)
    val endMs = ms(record.endTime)

    val pauses = record.segments
      .filter { it.segmentType == SEGMENT_TYPE_PAUSE }
      .map { PauseDto(ms(it.startTime), ms(it.endTime), auto = null) }
    val pausedMs = pauses.sumOf { (it.endMs - it.startMs).coerceAtLeast(0.0) }

    return WorkoutDto(
      id = meta.id,
      // 우리가 쓴 레코드에서는 `#session` 접미사를 벗긴다 — 그래야 save -> sync -> delete 왕복이
      // 호출자가 준 id 하나로 성립한다. 남의 앱 값은 그 앱의 규약이므로 손대지 않는다.
      clientId = if (isOwn) {
        WorkoutsRecordIds.clientIdOf(meta.clientRecordId) ?: meta.clientRecordId
      } else {
        meta.clientRecordId
      },
      isOwn = isOwn,
      activityTypeRaw = record.exerciseType,
      startMs = startMs,
      endMs = endMs,
      // 벽시계에서 명시적 pause를 뺀 값(§5.1). iOS의 `workout.duration`과 섞지 않는다.
      activeDurationS = ((endMs - startMs - pausedMs) / 1000.0).coerceAtLeast(0.0),
      utcOffsetMin = offsetMinutes(record.startZoneOffset),
      source = SourceDto(
        id = packageName,
        name = null,
        version = null,
        deviceModel = meta.device?.model,
      ),
      pauses = pauses,
      laps = record.laps.map { LapDto(ms(it.startTime), ms(it.endTime), it.length?.inMeters) },
      routeState = routeOutcome(record.exerciseRouteResult).state,
      lastModifiedMs = ms(meta.lastModifiedTime),
      android = AndroidWorkoutDataDto(
        exerciseType = record.exerciseType,
        packageName = packageName,
        recordingMethod = meta.recordingMethod,
        deviceType = meta.device?.type,
        clientRecordId = meta.clientRecordId,
        clientRecordVersion = meta.clientRecordVersion.toDouble(),
        endUtcOffsetMin = offsetMinutes(record.endZoneOffset),
        title = record.title,
        notes = record.notes,
        segments = record.segments.map {
          SegmentDto(it.segmentType, ms(it.startTime), ms(it.endTime))
        },
      ),
    )
  }

  /** `Data`인 루트만 네이티브 캐시로 흘린다(§8.4 — `Data`만, f114 때문에 상태는 캐시하지 않는다). */
  fun materialisedRoute(record: ExerciseSessionRecord): Pair<String, List<RoutePointDto>>? {
    val result = record.exerciseRouteResult
    if (result !is ExerciseRouteResult.Data) return null
    val points = result.exerciseRoute.toDtos()
    if (points.isEmpty()) return null
    return record.metadata.id to points
  }

  fun metricRow(record: Record, type: MetricType): MetricRowDto? = when (record) {
    is DistanceRecord -> row(type, ms(record.startTime), ms(record.endTime), record.distance.inMeters, record)
    is ActiveCaloriesBurnedRecord ->
      row(type, ms(record.startTime), ms(record.endTime), record.energy.inKilocalories, record)
    is ElevationGainedRecord ->
      row(type, ms(record.startTime), ms(record.endTime), record.elevation.inMeters, record)
    is StepsRecord -> row(type, ms(record.startTime), ms(record.endTime), record.count.toDouble(), record)
    else -> null
  }

  private fun row(type: MetricType, startMs: Double, endMs: Double, value: Double, record: Record) =
    MetricRowDto(type, startMs, endMs, value, record.metadata.dataOrigin.packageName)

  fun heartRateRows(record: HeartRateRecord): List<HeartRateRowDto> =
    record.samples.map { HeartRateDto(ms(it.time), it.beatsPerMinute.toDouble()) }

  // ── 쓰기 방향 ───────────────────────────────────────────────────────────────

  private fun metadata(clientRecordId: String, version: Long): Metadata =
    Metadata.activelyRecorded(
      device = Device(type = Device.TYPE_PHONE),
      clientRecordId = clientRecordId,
      clientRecordVersion = version,
    )

  fun route(points: List<RoutePointDto>): ExerciseRoute = ExerciseRoute(
    points.map { point ->
      ExerciseRoute.Location(
        time = instant(point.t),
        latitude = point.lat,
        longitude = point.lon,
        altitude = point.altM?.let { Length.meters(it) },
        horizontalAccuracy = point.hAccM?.let { Length.meters(it) },
        verticalAccuracy = point.vAccM?.let { Length.meters(it) },
      )
    },
  )

  /**
   * §8.5-2의 **단일 트랜잭션** 목록. 세션이 언제나 첫 원소다 — `insertRecords`의 `recordIdsList`가
   * 입력 순서를 따르므로 그 자리에서 세션의 플랫폼 id를 읽는다.
   *
   * ★ 전상태로만 쓴다(f95): 워크아웃이 루트를 가졌으면 **언제나** 함께 보낸다. 루트를 빼고 업서트하면
   *   저장된 루트가 파괴된다.
   * ★ 루트 권한이 없으면 루트만 빼고 쓰고 **쓰기를 실패시키지 않는다** -> `route: 'notPermitted'`.
   * ★ `steps <= 0`은 `./core`가 이미 제거했다 — 0-count StepsRecord는 throw한다(idx f44).
   */
  fun writeRecords(write: WorkoutWriteDto, includeRoute: Boolean): List<Record> {
    val start = instant(write.startMs)
    val end = instant(write.endMs)
    val startOffset = writeOffset(write, start)
    val endOffset = writeOffset(write, end)
    val version = write.version
    val out = ArrayList<Record>(6)

    out.add(
      ExerciseSessionRecord(
        startTime = start,
        startZoneOffset = startOffset,
        endTime = end,
        endZoneOffset = endOffset,
        metadata = metadata(WorkoutsRecordIds.sessionId(write.clientId), version),
        exerciseType = write.activityTypeRaw,
        title = null,
        notes = null,
        segments = write.pauses.map {
          ExerciseSegment(instant(it.startMs), instant(it.endMs), SEGMENT_TYPE_PAUSE)
        },
        laps = write.laps.map {
          ExerciseLap(instant(it.startMs), instant(it.endMs), it.distanceM?.let { m -> Length.meters(m) })
        },
        exerciseRoute = if (includeRoute && write.route.isNotEmpty()) route(write.route) else null,
      ),
    )

    write.distanceM?.let {
      out.add(
        DistanceRecord(
          startTime = start, startZoneOffset = startOffset,
          endTime = end, endZoneOffset = endOffset,
          distance = Length.meters(it),
          metadata = metadata(WorkoutsRecordIds.recordId(write.clientId, RecordType.DISTANCE), version),
        ),
      )
    }
    write.activeEnergyKcal?.let {
      out.add(
        ActiveCaloriesBurnedRecord(
          startTime = start, startZoneOffset = startOffset,
          endTime = end, endZoneOffset = endOffset,
          energy = Energy.kilocalories(it),
          metadata = metadata(WorkoutsRecordIds.recordId(write.clientId, RecordType.ACTIVE_ENERGY), version),
        ),
      )
    }
    write.elevationGainM?.let {
      out.add(
        ElevationGainedRecord(
          startTime = start, startZoneOffset = startOffset,
          endTime = end, endZoneOffset = endOffset,
          elevation = Length.meters(it),
          metadata = metadata(WorkoutsRecordIds.recordId(write.clientId, RecordType.ELEVATION), version),
        ),
      )
    }
    write.steps?.let {
      out.add(
        StepsRecord(
          startTime = start, startZoneOffset = startOffset,
          endTime = end, endZoneOffset = endOffset,
          count = it,
          metadata = metadata(WorkoutsRecordIds.recordId(write.clientId, RecordType.STEPS), version),
        ),
      )
    }
    if (write.heartRate.isNotEmpty()) {
      out.add(
        HeartRateRecord(
          startTime = start, startZoneOffset = startOffset,
          endTime = end, endZoneOffset = endOffset,
          samples = write.heartRate.map {
            HeartRateRecord.Sample(time = instant(it.t), beatsPerMinute = it.bpm.toLong())
          },
          metadata = metadata(WorkoutsRecordIds.recordId(write.clientId, RecordType.HEART_RATE), version),
        ),
      )
    }
    return out
  }
}
