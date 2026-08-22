package kit.gj.workouts

/**
 * seam 위의 **순수 오케스트레이션**. `HealthConnectGateway` 하나에만 의존하고 androidx도 expo도
 * 모른다 — 그래서 `android/src/test`의 JUnit이 페이크 게이트웨이로 아래 규칙을 전부 돌린다(설계 §3.4).
 *
 * 여기 사는 것 (전부 Phase 0가 강제한 순서·조건이다):
 *  - 루트 파이프라인 §8.4 — 페이지 캐시 우선 · f113 전경 전제 · f104 타임아웃 · f105 직렬화는 게이트웨이
 *  - 쓰기 §8.5 — 크기 가드 -> insert -> **무조건 read-back**(대상 순서 포함)
 *  - 삭제 §8.6 — 소유권 확인 · 타입별 6회 · 알 수 없는 id는 `deleted:false`
 *
 * 여기 살지 **않는** 것: 활동 매핑 · 루트 위생 · 커서 · 합산 · 창 검증. 전부 `./core`다.
 */
internal class WorkoutsOperations(
  private val gateway: HealthConnectGateway,
  /** `context.packageName`. 소유권 판정의 유일한 근거다. */
  private val ownPackageName: String,
  private val routeCache: RouteCache = RouteCache(),
  private val streams: RouteStreams = RouteStreams(),
  private val foregroundImportance: Int = IMPORTANCE_FOREGROUND,
  private val routeConsentTimeoutMs: Long = ROUTE_CONSENT_TIMEOUT_MS,
) {

  /**
   * 이 프로세스가 마지막으로 쓴 워크아웃의 레코드 종류. read-back이 **쓰지도 않은** 타입을 찾아
   * 헛도는 것을 막는다. 비어 있으면(프로세스 재시작 등) 설계가 정한 순서를 전부 훑는다.
   */
  private val writtenTypes = HashMap<String, Set<RecordType>>()

  /** 이 프로세스가 쓴 clientId -> 플랫폼 id. 삭제할 때 캐시에서 무엇을 버릴지 아는 유일한 근거다. */
  private val nativeIdByClientId = HashMap<String, String>()

  // ── 읽기 ────────────────────────────────────────────────────────────────────

  suspend fun readWorkoutPage(window: WindowDto, pageSize: Int, pageToken: String?): WorkoutPageDto {
    val page = gateway.readSessions(window, pageSize, pageToken)
    // f116: 이 페이지는 자기 안의 모든 루트를 **이미** materialise했다. 그 값을 버리지 않는다.
    if (page.materialisedRoutes.isNotEmpty()) routeCache.replaceWithPage(page.materialisedRoutes)
    return page
  }

  suspend fun drainCheckpoint(checkpoint: String, limit: Int): ChangeBatchDto {
    val batch = gateway.changes(checkpoint, limit)
    if (batch.materialisedRoutes.isNotEmpty()) routeCache.replaceWithPage(batch.materialisedRoutes)
    return batch
  }

  // ── 루트 ────────────────────────────────────────────────────────────────────

  /**
   * §8.4 · f113 · f114 · f116 · f118.
   *
   * 순서가 규칙이다:
   *  1. 직전 페이지가 이미 materialise한 루트가 있으면 **추가 읽기 없이** 그것으로 스트림을 연다.
   *  2. 없으면 레코드 자신의 `exerciseRouteResult`를 본다 — 추가 호출도 추가 권한 검사도 없다(f118).
   *  3. `ConsentRequired`이고 호출자가 `'prompt'`를 줬을 때만 컨트랙트를 띄운다. 그 전에 전경을
   *     확인한다 — 백그라운드에서는 Intent를 **띄우지 않고** `consentRequired`다(f113, §5.7 29번 행).
   *
   * `state`는 **언제나 이번 읽기에서 재계산된 값**이다. 캐시 적중은 "직전 페이지에서 이 포인트들을
   * 실제로 받았다"는 사실이며, 그때 상태는 `Data`였다.
   */
  suspend fun openRoute(nativeId: String, consent: String): RouteHandleDto {
    val cached = routeCache.get(nativeId)
    if (cached != null) return handle(nativeId, RouteStates.AVAILABLE, cached)

    val inline = gateway.inlineRoute(nativeId)
    if (inline.state == RouteStates.AVAILABLE) {
      routeCache.put(nativeId, inline.points)
      return handle(nativeId, RouteStates.AVAILABLE, inline.points)
    }
    if (inline.state == RouteStates.NONE) return handle(nativeId, RouteStates.NONE, emptyList())

    // 여기부터 ConsentRequired 하나뿐이다. 절대 'none'으로 붕괴시키지 않는다(f114).
    if (consent != CONSENT_PROMPT) return handle(nativeId, RouteStates.CONSENT_REQUIRED, emptyList())

    if (!isForeground()) {
      // f113: 백그라운드 읽기 권한은 도움이 되지 않는다. 플랫폼 호출 전에 끊는다.
      throw WorkoutsConsentRequiredException("foregroundRequiredForRouteConsent")
    }

    val resolved = gateway.requestRouteConsent(nativeId, routeConsentTimeoutMs)
    if (resolved.state == RouteStates.AVAILABLE) {
      routeCache.put(nativeId, resolved.points)
      return handle(nativeId, RouteStates.AVAILABLE, resolved.points)
    }
    // 거부(22 117 ms 뒤 null) · 루트 없음 · 잘못된 id · 미선언 · Intent 오버플로 타임아웃은
    // **바이트 동일한** 결과다(f112, f104). 원인을 지어내지 않고 빈 스트림으로 정착시킨다.
    return handle(nativeId, resolved.state, emptyList())
  }

  fun readRouteChunk(handleId: String, maxPoints: Int): List<RoutePointDto>? =
    streams.next(handleId, maxPoints)

  fun closeRoute(handleId: String) {
    streams.close(handleId)
  }

  private fun handle(nativeId: String, state: String, points: List<RoutePointDto>): RouteHandleDto =
    RouteHandleDto(handle = streams.open(nativeId, points), state = state)

  private fun isForeground(): Boolean = gateway.processImportance() <= foregroundImportance

  // ── 쓰기 ────────────────────────────────────────────────────────────────────

  /**
   * §8.5-1·2. `./core`가 이미 루트 위생·활동 매핑·write scope 사전 검사를 끝냈다. 여기서 남은 것은
   * **크기 가드**(f99/f100)와 전상태 쓰기(f95)뿐이며, 후자는 게이트웨이가 지킨다.
   */
  suspend fun saveWorkout(write: WorkoutWriteDto): InsertOutcomeDto {
    WorkoutsSizeModel.assertWritable(write)
    val outcome = gateway.insertWorkout(write)
    writtenTypes[write.clientId] = recordTypesOf(write)
    // ★ 방금 쓴 포인트를 캐시에 넣지 **않는다**. 넣으면 직후의 `getRoute`가 우리가 보낸 배열을
    //   그대로 돌려주고, "저장 -> 되읽기가 일치한다"는 자기 검증 루프(§9.5-1)의 단언이 **공허해진다**.
    //   캐시는 f116이 만든 것 — 플랫폼이 페이지 읽기에서 이미 materialise한 포인트 — 만 담는다.
    //   덮어쓴 워크아웃의 옛 포인트가 남아 있을 수 있으므로 그것은 지운다.
    outcome.nativeId?.let {
      routeCache.remove(it)
      nativeIdByClientId[write.clientId] = it
    }
    return outcome
  }

  /**
   * §8.5-3 — **항상** 부른다. `verifyWrite` 노브는 존재하지 않는다(소유자 결정 ④).
   *
   * 대상 순서 = Distance -> ActiveCalories -> Steps -> HeartRate -> **세션**. 세션이 마지막인 이유는
   * 세션 read-back이 루트를 강제로 materialise하기 때문이다(f116). 이번 프로세스가 그 워크아웃에
   * 무엇을 썼는지 알면 쓰지 않은 타입은 건너뛴다 — 없는 레코드를 찾는 IPC는 순수한 낭비다.
   */
  suspend fun readBackVersion(clientId: String): Long? {
    val known = writtenTypes[clientId]
    for (type in READ_BACK_ORDER) {
      if (known != null && !known.contains(type)) continue
      val version = gateway.readBackVersion(clientId, type)
      if (version != null) return version
    }
    return null
  }

  // ── 삭제 ────────────────────────────────────────────────────────────────────

  /**
   * §8.6. 두 경로 모두 **타입별 6회**로 끝난다 — 메트릭 레코드는 세션 삭제로 cascade되지 않는다(f98).
   * 알 수 없는 id는 조용하고(f96) 그것은 에러가 아니라 `deleted: false`다.
   */
  suspend fun deleteWorkout(ref: DeleteRefDto): Boolean {
    val clientId = ref.clientId
    if (clientId != null) {
      // 존재 여부만 묻는다. 세션이 없으면 `deleted: false`이고, 여분의 삭제 호출은 무해하다.
      val existed = gateway.readBackVersion(clientId, RecordType.SESSION) != null
      deleteEveryRecord(clientId)
      forgetRoute(nativeIdByClientId.remove(clientId))
      return existed
    }

    val nativeId = ref.nativeId ?: throw WorkoutsInvalidArgumentException("deleteRefEmpty")
    val session = gateway.readSession(nativeId) ?: return false
    if (session.android.packageName != ownPackageName) {
      throw WorkoutsNotAuthorizedException("deleteForeignWorkout")
    }
    forgetRoute(nativeId)
    val derived = WorkoutsRecordIds.clientIdOf(session.android.clientRecordId)
    if (derived == null) {
      // 우리 패키지가 썼지만 우리 규약의 clientRecordId가 아니다(예: 이전 버전). 세션만 지운다 —
      // 우리 이름 규약으로 묶인 메트릭 레코드가 존재할 수 없기 때문이다.
      gateway.deleteSessionsByRecordIds(listOf(nativeId))
      return true
    }
    deleteEveryRecord(derived)
    return true
  }

  private suspend fun deleteEveryRecord(clientId: String) {
    for ((type, id) in WorkoutsRecordIds.allRecordIds(clientId)) {
      gateway.deleteByClientRecordIds(type, listOf(id))
    }
  }

  /** 삭제된 워크아웃의 캐시된 포인트는 즉시 버린다 — 없는 레코드의 루트를 내놓지 않는다. */
  private fun forgetRoute(nativeId: String?) {
    if (nativeId != null) routeCache.remove(nativeId)
  }

  private fun recordTypesOf(write: WorkoutWriteDto): Set<RecordType> {
    val out = LinkedHashSet<RecordType>()
    out.add(RecordType.SESSION)
    if (write.distanceM != null) out.add(RecordType.DISTANCE)
    if (write.activeEnergyKcal != null) out.add(RecordType.ACTIVE_ENERGY)
    if (write.elevationGainM != null) out.add(RecordType.ELEVATION)
    // `steps <= 0`은 `./core`가 이미 제거했다 — 0-count StepsRecord는 throw한다(idx f44).
    if (write.steps != null) out.add(RecordType.STEPS)
    if (write.heartRate.isNotEmpty()) out.add(RecordType.HEART_RATE)
    return out
  }

  companion object {
    const val CONSENT_PROMPT = "prompt"

    /** f104: 성공한 동의 다이얼로그는 전부 200 ms 안에 돌아왔다. 10 s는 넉넉한 상한이다. */
    const val ROUTE_CONSENT_TIMEOUT_MS = 10_000L

    /** `ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND`의 값(100). f113. */
    const val IMPORTANCE_FOREGROUND = 100

    /** §8.5-3의 대상 순서. 세션이 마지막인 것이 규칙이다(f116). */
    val READ_BACK_ORDER: List<RecordType> = listOf(
      RecordType.DISTANCE,
      RecordType.ACTIVE_ENERGY,
      RecordType.STEPS,
      RecordType.HEART_RATE,
      RecordType.SESSION,
    )
  }
}
