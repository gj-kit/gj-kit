package kit.gj.workouts

/**
 * `HealthConnectGateway`의 인메모리 conformer — **설계 §3.4가 이 seam을 그으라고 한 이유 그 자체**.
 *
 * 미션 §8-4는 "`HealthConnectClient`를 페이크하라(그것은 Kotlin 인터페이스다, idx f56)"고 적었지만
 * 설계 §3.4는 명시적으로 그것을 **거부한다**: `HealthConnectClient`를 페이크하면 record 타입 ·
 * `Metadata` · `TimeRangeFilter` · `ExerciseRouteResult`가 전부 테스트로 새어 들어오고, 그러면
 * 테스트가 검증하는 것은 우리 규칙이 아니라 androidx 생성자의 인자 순서가 된다. 설계를 따랐다.
 *
 * 이 페이크가 흉내내는 **측정된** 동작:
 *  - f93 업서트 규칙: 같은/높은 version은 덮어쓰고, **낮은 version은 조용한 no-op**이며 같은 id를 낸다
 *  - f95 전상태: 루트 없이 업서트하면 저장된 루트가 파괴된다
 *  - f92 UUID는 삭제로 해제되지 않는다 — 같은 clientRecordId는 언제나 같은 id로 돌아온다
 *  - f96 알 수 없는 id 삭제는 조용하다
 *  - f98 메트릭 레코드는 세션 삭제로 cascade되지 않는다
 *  - f114/f118 루트 tri-state, f104 타임아웃, f105 동시 요청
 */
internal class FakeHealthConnectGateway(
  private val ownPackageName: String = "kit.gj.workouts.example",
) : HealthConnectGateway {

  class Stored(
    var version: Long,
    var route: List<RoutePointDto>,
    val nativeId: String,
    val packageName: String,
    var clientRecordId: String?,
  )

  /** clientRecordId -> 저장된 레코드. 세션과 메트릭 레코드가 같은 표에 산다(타입은 접미사로 갈린다). */
  val records = LinkedHashMap<String, Stored>()

  /** nativeId -> clientRecordId. `readSession`이 쓰는 역인덱스. */
  private val byNativeId = HashMap<String, String>()

  private var nextId = 1

  // 시나리오 손잡이
  var granted: MutableSet<String> = mutableSetOf(
    WorkoutsPermissions.READ_EXERCISE,
    WorkoutsPermissions.WRITE_EXERCISE,
    WorkoutsPermissions.WRITE_EXERCISE_ROUTE,
  )
  var importance: Int = WorkoutsOperations.IMPORTANCE_FOREGROUND
  var inlineRouteStates: MutableMap<String, RouteOutcomeDto> = mutableMapOf()
  var consentOutcome: RouteOutcomeDto = RouteOutcomeDto.consentRequired()
  var consentBusy: Boolean = false
  var pageRoutes: List<Pair<String, List<RoutePointDto>>> = emptyList()
  var pageItems: List<WorkoutDto> = emptyList()

  // 호출 기록 — "정확히 몇 번 불렀는가"가 계약인 곳이 여럿이다(§8.4의 27배 산술, §8.6의 6회).
  val calls = ArrayList<String>()
  val deleted = ArrayList<Pair<RecordType, List<String>>>()

  override fun sdkStatus(): Int = 3

  override fun processImportance(): Int = importance

  override fun declaredHealthPermissions(): Set<String> = granted

  override fun resolves(intentAction: String): Boolean = true

  override suspend fun grantedPermissions(): Set<String> = granted

  override suspend fun requestPermissions(request: Set<String>): PermissionOutcomeDto {
    calls.add("requestPermissions")
    val before = granted.toList()
    return PermissionOutcomeDto(before, granted.toList(), conclusive = true)
  }

  override suspend fun readSessions(
    window: WindowDto,
    pageSize: Int,
    pageToken: String?,
  ): SessionPageDto {
    calls.add("readSessions")
    return WorkoutPageDto(pageItems, nextPageToken = null, materialisedRoutes = pageRoutes)
  }

  override suspend fun readSession(id: String): SessionDto? {
    calls.add("readSession:$id")
    val clientRecordId = byNativeId[id] ?: return null
    val stored = records[clientRecordId] ?: return null
    return workoutOf(stored)
  }

  override suspend fun readMetricRecords(
    type: MetricType,
    window: WindowDto,
    origins: Set<String>,
  ): List<MetricRowDto> {
    calls.add("readMetricRecords:${type.wire}")
    return emptyList()
  }

  override suspend fun readHeartRateRecords(window: WindowDto): List<HeartRateRowDto> {
    calls.add("readHeartRateRecords")
    return emptyList()
  }

  override suspend fun changesToken(): String = "token-1"

  override suspend fun changes(token: String, pageSize: Int): ChangeBatchDto {
    calls.add("changes")
    return ChangeBatchDto(
      added = emptyList(),
      removed = emptyList(),
      checkpoint = "token-2",
      hasMore = false,
      expired = false,
      materialisedRoutes = pageRoutes,
    )
  }

  override suspend fun inlineRoute(sessionId: String): RouteOutcomeDto {
    calls.add("inlineRoute:$sessionId")
    inlineRouteStates[sessionId]?.let { return it }
    val clientRecordId = byNativeId[sessionId] ?: return RouteOutcomeDto.none()
    val stored = records[clientRecordId] ?: return RouteOutcomeDto.none()
    return if (stored.route.isEmpty()) RouteOutcomeDto.none() else RouteOutcomeDto.data(stored.route)
  }

  override suspend fun requestRouteConsent(sessionId: String, timeoutMs: Long): RouteOutcomeDto {
    calls.add("requestRouteConsent:$sessionId")
    // f105: 프로세스당 1건. 두 번째는 기다리지 않고 busy다.
    if (consentBusy) throw WorkoutsBusyException("routeConsentAlreadyRunning")
    return consentOutcome
  }

  override suspend fun insertWorkout(w: WorkoutWriteDto): InsertOutcomeDto {
    calls.add("insertWorkout:${w.clientId}")
    val canWriteRoute = granted.contains(WorkoutsPermissions.WRITE_EXERCISE_ROUTE)
    val includeRoute = canWriteRoute && w.route.isNotEmpty()
    val sessionKey = WorkoutsRecordIds.sessionId(w.clientId)
    val existing = records[sessionKey]

    // f93: 낮은 version은 **조용한 no-op**이며 같은 UUID를 돌려준다.
    if (existing != null && w.version < existing.version) {
      return InsertOutcomeDto(existing.nativeId, routeOutcome(w, includeRoute), routePoints(w, includeRoute))
    }

    val nativeId = existing?.nativeId ?: "native-${nextId++}"
    // f95: 전상태다. 루트를 빼고 업서트하면 저장된 루트가 파괴된다.
    val stored = Stored(w.version, if (includeRoute) w.route else emptyList(), nativeId, ownPackageName, sessionKey)
    records[sessionKey] = stored
    byNativeId[nativeId] = sessionKey

    for ((type, id) in WorkoutsRecordIds.allRecordIds(w.clientId)) {
      if (type == RecordType.SESSION) continue
      if (wrote(w, type)) {
        records[id] = Stored(w.version, emptyList(), "native-metric-$id", ownPackageName, id)
      } else {
        records.remove(id)
      }
    }
    return InsertOutcomeDto(nativeId, routeOutcome(w, includeRoute), routePoints(w, includeRoute))
  }

  override suspend fun readBackVersion(clientRecordId: String, type: RecordType): Long? {
    calls.add("readBackVersion:${type.name}")
    return records[WorkoutsRecordIds.recordId(clientRecordId, type)]?.version
  }

  override suspend fun deleteByClientRecordIds(type: RecordType, ids: List<String>) {
    calls.add("deleteByClientRecordIds:${type.name}")
    deleted.add(type to ids)
    // f96: 알 수 없는 id는 조용하다. f98: cascade가 없으므로 정확히 지정된 것만 사라진다.
    for (id in ids) records.remove(id)?.let { byNativeId.remove(it.nativeId) }
  }

  override suspend fun deleteSessionsByRecordIds(ids: List<String>) {
    calls.add("deleteSessionsByRecordIds")
    for (id in ids) byNativeId.remove(id)?.let { records.remove(it) }
  }

  // ── 도우미 ─────────────────────────────────────────────────────────────────

  private fun wrote(w: WorkoutWriteDto, type: RecordType): Boolean = when (type) {
    RecordType.SESSION -> true
    RecordType.DISTANCE -> w.distanceM != null
    RecordType.ACTIVE_ENERGY -> w.activeEnergyKcal != null
    RecordType.ELEVATION -> w.elevationGainM != null
    RecordType.STEPS -> w.steps != null
    RecordType.HEART_RATE -> w.heartRate.isNotEmpty()
  }

  private fun routeOutcome(w: WorkoutWriteDto, includeRoute: Boolean): String = when {
    w.route.isEmpty() -> RouteWriteOutcomes.NONE
    includeRoute -> RouteWriteOutcomes.STORED
    else -> RouteWriteOutcomes.NOT_PERMITTED
  }

  private fun routePoints(w: WorkoutWriteDto, includeRoute: Boolean): Int =
    if (includeRoute) w.route.size else 0

  private fun workoutOf(stored: Stored): WorkoutDto = WorkoutDto(
    id = stored.nativeId,
    clientId = WorkoutsRecordIds.clientIdOf(stored.clientRecordId) ?: stored.clientRecordId,
    isOwn = stored.packageName == ownPackageName,
    activityTypeRaw = 56,
    startMs = 1_700_000_000_000.0,
    endMs = 1_700_000_600_000.0,
    activeDurationS = 600.0,
    utcOffsetMin = 540,
    source = SourceDto(id = stored.packageName),
    routeState = if (stored.route.isEmpty()) RouteStates.NONE else RouteStates.AVAILABLE,
    android = AndroidWorkoutDataDto(
      exerciseType = 56,
      packageName = stored.packageName,
      recordingMethod = 1,
      clientRecordId = stored.clientRecordId,
      clientRecordVersion = stored.version.toDouble(),
    ),
  )

  /** 남의 앱이 쓴 세션을 하나 놓는다 — 소유권 판정을 시험하기 위한 것이다. */
  fun putForeignSession(nativeId: String, packageName: String, clientRecordId: String?) {
    val key = clientRecordId ?: nativeId
    records[key] = Stored(1L, emptyList(), nativeId, packageName, clientRecordId)
    byNativeId[nativeId] = key
  }
}
