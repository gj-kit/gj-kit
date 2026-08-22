package kit.gj.workouts

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.DataOrigin
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.reflect.KClass

/**
 * `HealthConnectGateway`의 실물 conformer — **androidx.health를 실제로 만지는 유일한 클래스**.
 *
 * 이 파일이 지키는 Phase 0 규칙 (전부 컴파일 에러가 아니라 조용한 오답이 되는 것들이다):
 *  - 집계 API는 **한 번도 부르지 않는다**(f109). 합산은 `./core`가 클라이언트에서 한다.
 *  - 시간창은 언제나 `TimeRangeFilter.between(Instant, Instant)`이며 그 의미는 **시작 순간**이다(f107).
 *  - 로컬 시각 오버로드는 쓰지 않는다 — 그 칼럼은 레코드 자신의 저장된 offset이다(f108).
 *  - 쓰기는 **전상태**다. 루트가 있으면 언제나 함께 보낸다(f95).
 *  - 루트 동의 컨트랙트는 10 s 타임아웃(f104) 안에서 **프로세스당 1건**(f105)만 돈다.
 *  - 가용성은 `getSdkStatus`만이 근거다(f88).
 */
internal class RealHealthConnectGateway(
  private val context: Context,
  private val permissionLauncher: () -> AppContextActivityResultLauncher<HashSet<String>, Set<String>>?,
  private val routeConsentLauncher: () -> AppContextActivityResultLauncher<String, RouteOutcomeDto>?,
  private val nowMs: () -> Long = System::currentTimeMillis,
) : HealthConnectGateway {

  /**
   * f105: 동시 2건이 Health Connect 컨트롤러 프로세스를 죽이고 **호출 Activity까지 데려간다**.
   * 프로세스당 1건으로 강제하고, 두 번째는 기다리지 않고 `busy`다.
   */
  private val routeConsentLock = Mutex()

  /**
   * `insertRecords`가 돌려준 `clientRecordId -> 플랫폼 id`. read-back(§8.5-3)이 clientRecordId로
   * 레코드를 **조회할 수 없기 때문에** 필요하다 — Health Connect에는 clientRecordId 질의가 없고,
   * 시간창 전수 스캔은 15분 예산을 태운다. `insertRecords`가 방금 준 id가 유일하게 싼 경로다.
   *
   * ⚠ 한계(정직하게): 프로세스가 죽었다 살아나 read-back만 부르면 여기에 항목이 없어 `null`(="확인
   *   불가")이 된다. `./core`는 저장 직후 같은 프로세스에서 read-back을 부르므로 실제 경로에서는
   *   비지 않는다. 항목 수는 LRU로 묶는다.
   */
  private val writtenRecordIds = object : LinkedHashMap<String, String>(16, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean =
      size > MAX_TRACKED_WRITES
  }

  /**
   * `getOrCreate`는 사용 불가할 때 `UnsupportedOperationException` / `IllegalStateException`을 던진다.
   * 그것을 §5.7 6번 행대로 접는다: sdkStatus가 갱신 필요라고 말하면 `updateRequired`, 아니면
   * `unavailable`.
   */
  private fun client(): HealthConnectClient = try {
    HealthConnectClient.getOrCreate(context)
  } catch (t: Throwable) {
    when (WorkoutsAvailability.classify(Build.VERSION.SDK_INT, sdkStatus())) {
      is AvailabilityDto.UpdateRequired -> throw WorkoutsUpdateRequiredException()
      is AvailabilityDto.Unavailable -> throw WorkoutsUnavailableException("clientUnavailable")
      // sdkStatus는 available이라는데 getOrCreate가 실패했다 — 모델에 없는 결과다.
      is AvailabilityDto.Available -> throw WorkoutsInternalException("getOrCreateFailed", t)
    }
  }

  /** 플랫폼 예외 -> 14종. 우리 예외는 그대로 통과한다(§5.6). */
  private inline fun <T> platform(block: () -> T): T = try {
    block()
  } catch (t: Throwable) {
    throw WorkoutsErrorMapping.map(t)
  }

  // ── 동기 사실 ──────────────────────────────────────────────────────────────

  /** `getSdkStatus`만이 근거다. PackageManager는 이 경로에 **절대** 오지 않는다(f88). */
  override fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context)

  override fun processImportance(): Int {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance
  }

  override fun declaredHealthPermissions(): Set<String> =
    HealthConnectManifest.declaredHealthPermissions(context)

  override fun resolves(intentAction: String): Boolean =
    WorkoutsIntents.resolves(context, Intent(intentAction))

  // ── 인가 ──────────────────────────────────────────────────────────────────

  /**
   * `READ_EXERCISE_ROUTES`에 대한 유일하게 진실된 읽기다(f110) — 그 권한은 런타임 요청 결과에
   * 절대 나타나지 않으므로 부여 여부를 아는 다른 방법이 없다.
   */
  override suspend fun grantedPermissions(): Set<String> =
    platform { client().permissionController.getGrantedPermissions() }

  /**
   * f120/f122가 강제하는 형태:
   *  - **내부 타임아웃 없음.** 온보딩 + 추가 접근 화면이 41.6 s의 스크립트 탭을 먹었다.
   *  - 컨트랙트가 돌려준 집합을 "사용자가 방금 부여한 것"으로 읽지 **않는다**. 빈 집합은 온보딩
   *    "Go back"(19.6 s)에서도 나온다.
   *  - 판정의 유일한 근거는 **before/after 비교**이며, 그 판정 자체는 TS가 한다.
   *  - `READ_EXERCISE_ROUTES`는 요청 집합에서 빠진다(f110).
   */
  override suspend fun requestPermissions(request: Set<String>): PermissionOutcomeDto {
    val requestable = WorkoutsPermissions.runtimeRequestable(request)
    val before = grantedPermissions()

    if (requestable.isEmpty()) {
      // 요청할 것이 없다(예: `routes`만 요청). 시트를 띄우지 않고 그대로 결론짓는다.
      return PermissionOutcomeDto(before.toList(), before.toList(), conclusive = true)
    }

    val launcher = permissionLauncher()
      ?: throw WorkoutsCancelledException("permissionLauncherUnavailable")

    val returned = launcher.launch(HashSet(requestable))
    val after = grantedPermissions()

    return PermissionOutcomeDto(
      before = before.toList(),
      after = after.toList(),
      // 컨트랙트가 아무것도 돌려주지 않았다 = 사용자가 온보딩에서 되돌아 나갔다. 결론이 아니다.
      conclusive = returned.isNotEmpty() || after != before,
    )
  }

  // ── 읽기 ──────────────────────────────────────────────────────────────────

  /**
   * §8.4. 페이지 크기는 호출부가 준다(Android 기본 50 — f116 때문에 보수적으로 페이징한다).
   * 이 페이지가 이미 materialise한 `Data` 루트는 `materialisedRoutes`로 함께 올려 네이티브 캐시가
   * 그것을 받는다. 브리지는 건너지 않는다.
   */
  override suspend fun readSessions(
    window: WindowDto,
    pageSize: Int,
    pageToken: String?,
  ): SessionPageDto {
    assertWindowReadable(window)
    val response = platform {
      client().readRecords(
        ReadRecordsRequest(
          recordType = ExerciseSessionRecord::class,
          timeRangeFilter = timeRange(window),
          pageSize = pageSize,
          pageToken = pageToken,
        ),
      )
    }
    val own = context.packageName
    return WorkoutPageDto(
      items = response.records.map { HealthConnectMapping.workout(it, own) },
      nextPageToken = response.pageToken,
      materialisedRoutes = response.records.mapNotNull { HealthConnectMapping.materialisedRoute(it) },
    )
  }

  /** §8.6-1: `{ nativeId }` 삭제 경로가 메트릭 고아를 만들지 않게 하는 사전 조회. */
  override suspend fun readSession(id: String): SessionDto? {
    val record = readSessionRecord(id) ?: return null
    return HealthConnectMapping.workout(record, context.packageName)
  }

  /**
   * §8.4. **페이지 창당 메트릭 종류별 1회**이며 창 확장은 `./core`가 이미 계산해 넘겼다(f107).
   *
   * ⚠ 집계 API는 부르지 않는다(f109). 합산도 여기서 하지 않는다 — 원시 행만 올린다.
   * ⚠ 활성 칼로리만 읽는다. 총 칼로리 레코드는 BMR이 섞여 조용히 틀린 숫자를 준다(idx f37).
   */
  override suspend fun readMetricRecords(
    type: MetricType,
    window: WindowDto,
    origins: Set<String>,
  ): List<MetricRowDto> {
    assertWindowReadable(window)
    val records = readAllPages(metricRecordClass(type), window, origins)
    return records.mapNotNull { HealthConnectMapping.metricRow(it, type) }
  }

  /** 1..300 bpm 밖과 창 밖 샘플은 `./core`가 이미 거른다 — 여기서는 평탄화만 한다. */
  override suspend fun readHeartRateRecords(window: WindowDto): List<HeartRateRowDto> {
    assertWindowReadable(window)
    return readAllPages(HeartRateRecord::class, window, emptySet())
      .filterIsInstance<HeartRateRecord>()
      .flatMap { HealthConnectMapping.heartRateRows(it) }
  }

  // ── 동기화 ────────────────────────────────────────────────────────────────

  /** §4.4: 배치를 만들기 **전에** 잡는다. `ExerciseSessionRecord`만 구독한다. */
  override suspend fun changesToken(): String = platform {
    client().getChangesToken(ChangesTokenRequest(recordTypes = setOf(ExerciseSessionRecord::class)))
  }

  /**
   * §4.5·§4.6.
   *  - `changesTokenExpired`는 **에러가 아니다** -> `reset: true` + `resetReason: 'expired'`.
   *  - `UpsertionChange`를 "무언가 바뀌었다"의 증거로 **읽지 않는다**(f94). payload가 실어 온 레코드를
   *    정규화해 `added`에 넣을 뿐이다.
   *  - `DeletionChange`는 `recordId` 하나만 싣는다(f97). Android의 removal은 언제나 진짜 삭제이므로
   *    `replaced`는 **언제나 false**이고 그것이 "모름"이 아니라 정확히 옳다(§4.6, f92·f93·f97).
   *  - `checkpoint`는 `nextChangesToken` — 이 배치 **다음**을 가리킨다. 커밋은 소비자가 저장한 뒤에만
   *    일어나므로 갭이 생기지 않는다.
   */
  override suspend fun changes(token: String, pageSize: Int): ChangeBatchDto {
    val response = platform { client().getChanges(token) }
    if (response.changesTokenExpired) {
      return ChangeBatchDto(
        added = emptyList(),
        removed = emptyList(),
        checkpoint = token,
        hasMore = false,
        expired = true,
      )
    }

    val own = context.packageName
    val added = ArrayList<WorkoutDto>()
    val removed = ArrayList<RemovedDto>()
    val routes = ArrayList<Pair<String, List<RoutePointDto>>>()
    for (change in response.changes) {
      when (change) {
        is UpsertionChange -> {
          val record = change.record
          if (record is ExerciseSessionRecord) {
            added.add(HealthConnectMapping.workout(record, own))
            HealthConnectMapping.materialisedRoute(record)?.let { routes.add(it) }
          }
        }
        is DeletionChange -> removed.add(RemovedDto(id = change.recordId, replaced = false))
        else -> Unit
      }
    }

    return ChangeBatchDto(
      added = added,
      removed = removed,
      checkpoint = response.nextChangesToken,
      hasMore = response.hasMore,
      expired = false,
      materialisedRoutes = routes,
    )
  }

  // ── 루트 ──────────────────────────────────────────────────────────────────

  /**
   * f118: 레코드 자신의 `exerciseRouteResult`에서 읽는다 — 추가 호출도 추가 권한 검사도 없다.
   * 없는 레코드는 "루트 없음"이다 — `getRoute`가 오래된 id에 대해 빈 스트림을 내야 하기 때문이며,
   * 그 이상을 주장할 근거가 없다(§5.7 32번 행).
   */
  override suspend fun inlineRoute(sessionId: String): RouteOutcomeDto {
    val record = readSessionRecord(sessionId) ?: return RouteOutcomeDto.none()
    return HealthConnectMapping.routeOutcome(record.exerciseRouteResult)
  }

  /**
   * §3.4 · f104 · f105.
   *  1. 프로세스당 `Mutex`로 직렬화한다. 이미 1건 진행 중이면 **기다리지 않고** `busy`.
   *  2. `withTimeoutOrNull(10 s)`로 감싼다. Intent 오버플로 시 콜백이 **영원히 오지 않는다**(f104).
   *     타임아웃은 빈 결과이며 **절대 루프에서 재시도하지 않는다**.
   *
   * 전경 전제(f113)는 호출부(`WorkoutsOperations`)가 이 함수에 **오기 전에** 확인한다.
   */
  override suspend fun requestRouteConsent(sessionId: String, timeoutMs: Long): RouteOutcomeDto {
    val launcher = routeConsentLauncher()
      ?: throw WorkoutsCancelledException("routeLauncherUnavailable")

    if (!routeConsentLock.tryLock()) throw WorkoutsBusyException("routeConsentAlreadyRunning")
    try {
      val outcome = withTimeoutOrNull(timeoutMs) { launcher.launch(sessionId) }
      // 타임아웃도 거부도 "지금은 못 본다"이지 "루트가 없다"가 아니다(f114를 뒤집지 않는다).
      return outcome ?: RouteOutcomeDto.consentRequired()
    } finally {
      routeConsentLock.unlock()
    }
  }

  // ── 쓰기 ──────────────────────────────────────────────────────────────────

  /**
   * §8.5-1·2 — **단일** `insertRecords` 트랜잭션. 크기 가드는 호출부가 이미 통과시켰다(f99/f100).
   *
   * ★ 루트 권한이 없으면 루트만 빼고 쓰고 **쓰기를 실패시키지 않는다** -> `route: 'notPermitted'`(f95).
   * ★ 전상태로만 쓴다 — 루트를 빼고 업서트하면 저장된 루트가 파괴된다(f95). 그래서 권한이 있고
   *   워크아웃이 루트를 가졌으면 **언제나** 함께 보낸다.
   */
  override suspend fun insertWorkout(w: WorkoutWriteDto): InsertOutcomeDto {
    val canWriteRoute = grantedPermissions().contains(WorkoutsPermissions.WRITE_EXERCISE_ROUTE)
    val includeRoute = canWriteRoute && w.route.isNotEmpty()
    val records = HealthConnectMapping.writeRecords(w, includeRoute)

    val ids = platform { client().insertRecords(records).recordIdsList }
    rememberWrittenIds(w, records, ids)

    return InsertOutcomeDto(
      nativeId = ids.firstOrNull(),
      route = when {
        w.route.isEmpty() -> RouteWriteOutcomes.NONE
        includeRoute -> RouteWriteOutcomes.STORED
        else -> RouteWriteOutcomes.NOT_PERMITTED
      },
      routePointsWritten = if (includeRoute) w.route.size else 0,
    )
  }

  /**
   * §8.5-3의 **의무적인** read-back. Health Connect에는 clientRecordId 질의가 없으므로 방금
   * `insertRecords`가 돌려준 플랫폼 id로 읽는다. 그 id를 모르면 `null`(확인 불가)이다 —
   * 없는 것을 찾겠다고 시간창을 전수 스캔하지 않는다.
   */
  override suspend fun readBackVersion(clientRecordId: String, type: RecordType): Long? {
    val recordId = synchronized(writtenRecordIds) {
      writtenRecordIds[WorkoutsRecordIds.recordId(clientRecordId, type)]
    } ?: return null
    val record = try {
      client().readRecord(recordClass(type), recordId).record
    } catch (t: Throwable) {
      val mapped = WorkoutsErrorMapping.map(t)
      // "그런 레코드가 없다"는 장애가 아니다 — 확인 불가(null)로 접는다.
      if (mapped is WorkoutsInvalidArgumentException) return null else throw mapped
    }
    return record.metadata.clientRecordVersion
  }

  /**
   * §8.6. 타입별 1회. 메트릭 레코드는 세션 삭제로 cascade되지 않고(f98) 루트는 cascade된다.
   * 알 수 없는 id는 조용하므로(f96) 여분의 삭제 호출은 무해하다 — 에러가 아니다.
   */
  override suspend fun deleteByClientRecordIds(type: RecordType, ids: List<String>) {
    if (ids.isEmpty()) return
    platform {
      client().deleteRecords(
        recordType = recordClass(type),
        recordIdsList = emptyList(),
        clientRecordIdsList = ids,
      )
    }
    synchronized(writtenRecordIds) { ids.forEach { writtenRecordIds.remove(it) } }
  }

  override suspend fun deleteSessionsByRecordIds(ids: List<String>) {
    if (ids.isEmpty()) return
    platform {
      client().deleteRecords(
        recordType = ExerciseSessionRecord::class,
        recordIdsList = ids,
        clientRecordIdsList = emptyList(),
      )
    }
  }

  // ── 내부 ──────────────────────────────────────────────────────────────────

  /** 언제나 `between(Instant, Instant)`다. 로컬 시각 오버로드는 이 파일에 존재하지 않는다(f108). */
  private fun timeRange(window: WindowDto): TimeRangeFilter = TimeRangeFilter.between(
    HealthConnectMapping.instant(window.fromMs),
    HealthConnectMapping.instant(window.toMs),
  )

  /**
   * §5.7 45번 행 — 30일 벽 밖을 `READ_HEALTH_DATA_HISTORY` 없이 읽으려 하면 **읽기 전에** 거절한다.
   * 대량 읽기는 조용히 잘리고(idx f38) 그 절단은 소비자가 감지할 수 없다.
   */
  private suspend fun assertWindowReadable(window: WindowDto) {
    if (!WorkoutsHistoryWall.reachesPastWall(window.fromMs, nowMs())) return
    val granted = grantedPermissions()
    WorkoutsHistoryWall.assertReadable(
      window,
      nowMs(),
      granted.contains(WorkoutsPermissions.READ_HEALTH_DATA_HISTORY),
    )
  }

  private suspend fun readSessionRecord(id: String): ExerciseSessionRecord? = try {
    client().readRecord(ExerciseSessionRecord::class, id).record
  } catch (t: Throwable) {
    val mapped = WorkoutsErrorMapping.map(t)
    // errorCode 3 = "그런 레코드가 없다 / id가 그 모양이 아니다". 그것은 "없다"이지 장애가 아니다.
    if (mapped is WorkoutsInvalidArgumentException) null else throw mapped
  }

  /** `pageToken`을 끝까지 따라간다 — 메트릭 창 하나가 여러 페이지일 수 있다. */
  private suspend fun readAllPages(
    recordType: KClass<out Record>,
    window: WindowDto,
    origins: Set<String>,
  ): List<Record> {
    val filter = origins.map { DataOrigin(it) }.toSet()
    val out = ArrayList<Record>()
    var token: String? = null
    var guard = 0
    do {
      val response = platform {
        client().readRecords(
          ReadRecordsRequest(
            recordType = recordType,
            timeRangeFilter = timeRange(window),
            dataOriginFilter = filter,
            pageSize = METRIC_PAGE_SIZE,
            pageToken = token,
          ),
        )
      }
      out.addAll(response.records)
      token = response.pageToken
      guard += 1
    } while (token != null && guard < MAX_METRIC_PAGES)
    return out
  }

  private fun rememberWrittenIds(w: WorkoutWriteDto, records: List<Record>, ids: List<String>) {
    synchronized(writtenRecordIds) {
      records.forEachIndexed { index, record ->
        val clientRecordId = record.metadata.clientRecordId ?: return@forEachIndexed
        val id = ids.getOrNull(index) ?: return@forEachIndexed
        writtenRecordIds[clientRecordId] = id
      }
      // 이 워크아웃이 이번에 쓰지 않은 종류는 더 이상 유효하지 않다(예: distanceM이 빠진 재저장).
      for ((_, recordId) in WorkoutsRecordIds.allRecordIds(w.clientId)) {
        if (records.none { it.metadata.clientRecordId == recordId }) {
          writtenRecordIds.remove(recordId)
        }
      }
    }
  }

  private fun metricRecordClass(type: MetricType): KClass<out Record> = when (type) {
    MetricType.DISTANCE -> DistanceRecord::class
    MetricType.ACTIVE_ENERGY -> ActiveCaloriesBurnedRecord::class
    MetricType.ELEVATION -> ElevationGainedRecord::class
    MetricType.STEPS -> StepsRecord::class
  }

  private fun recordClass(type: RecordType): KClass<out Record> = when (type) {
    RecordType.SESSION -> ExerciseSessionRecord::class
    RecordType.DISTANCE -> DistanceRecord::class
    RecordType.ACTIVE_ENERGY -> ActiveCaloriesBurnedRecord::class
    RecordType.ELEVATION -> ElevationGainedRecord::class
    RecordType.STEPS -> StepsRecord::class
    RecordType.HEART_RATE -> HeartRateRecord::class
  }

  companion object {
    /** f104: 성공한 동의 다이얼로그는 전부 200 ms 안에 돌아왔다. 10 s는 넉넉한 상한이다. */
    const val ROUTE_CONSENT_TIMEOUT_MS = WorkoutsOperations.ROUTE_CONSENT_TIMEOUT_MS

    /** f113: 이보다 나쁜 importance에서는 남의 루트를 읽을 수 없다. */
    const val FOREGROUND_IMPORTANCE = ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND

    /** 메트릭 레코드에는 루트가 없어 f116이 적용되지 않는다 — 세션보다 크게 잡아도 된다. */
    const val METRIC_PAGE_SIZE = 1000

    /** 한 창이 이보다 많은 페이지를 내면 그 창이 잘못된 것이다. 무한 루프를 만들지 않는다. */
    const val MAX_METRIC_PAGES = 50

    const val MAX_TRACKED_WRITES = 256
  }
}
