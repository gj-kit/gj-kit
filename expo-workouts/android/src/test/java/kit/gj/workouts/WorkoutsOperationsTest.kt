package kit.gj.workouts

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * seam 위 오케스트레이션의 계약 — 설계 §8.4 · §8.5 · §8.6, Phase 0 f93–f98 · f104 · f113 · f114 · f116.
 *
 * 여기서 단언하는 것은 대부분 **호출의 수와 순서**다. 그것이 계약인 자리가 여럿이기 때문이다:
 * §8.4의 27배 산술, §8.5-3의 read-back 순서(세션이 마지막), §8.6의 타입별 6회.
 */
class WorkoutsOperationsTest {

  private val own = "kit.gj.workouts.example"

  private fun ops(gateway: FakeHealthConnectGateway) =
    WorkoutsOperations(gateway, own)

  private fun points(n: Int): List<RoutePointDto> =
    (0 until n).map { RoutePointDto(t = 1_700_000_000_000.0 + it, lat = 37.5, lon = 127.0) }

  private fun write(
    clientId: String = "w1",
    version: Long = 1L,
    route: List<RoutePointDto> = emptyList(),
    distanceM: Double? = null,
    activeEnergyKcal: Double? = null,
    steps: Long? = null,
    heartRate: List<HeartRateDto> = emptyList(),
  ) = WorkoutWriteDto(
    clientId = clientId,
    version = version,
    activityTypeRaw = 56,
    startMs = 1_700_000_000_000.0,
    endMs = 1_700_000_600_000.0,
    utcOffsetMin = 540,
    timeZoneId = null,
    pauses = emptyList(),
    laps = emptyList(),
    distanceM = distanceM,
    activeEnergyKcal = activeEnergyKcal,
    elevationGainM = null,
    steps = steps,
    heartRate = heartRate,
    route = route,
  )

  // ── 루트 파이프라인 (§8.4) ─────────────────────────────────────────────────

  @Test
  fun `f116 — a route the page already materialised is streamed without any extra read`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.pageRoutes = listOf("native-1" to points(2500))
    val operations = ops(gateway)
    operations.readWorkoutPage(WindowDto(0.0, 1.0), 50, null)

    gateway.calls.clear()
    val handle = operations.openRoute("native-1", "skip")
    assertEquals(RouteStates.AVAILABLE, handle.state)
    // 결정적인 단언: 게이트웨이를 **한 번도** 부르지 않았다. 12x–19x를 두 번 내지 않는다는 뜻이다.
    assertEquals(emptyList<String>(), gateway.calls)
    assertEquals(1000, operations.readRouteChunk(handle.handle, 1000)?.size)
  }

  @Test
  fun `f118 — NoData is 'none' and streams empty, not an error`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.inlineRouteStates["native-9"] = RouteOutcomeDto.none()
    val operations = ops(gateway)
    val handle = operations.openRoute("native-9", "skip")
    assertEquals(RouteStates.NONE, handle.state)
    assertNull(operations.readRouteChunk(handle.handle, 1000))
  }

  @Test
  fun `f114 — ConsentRequired is never collapsed to none, in either consent mode`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.inlineRouteStates["native-9"] = RouteOutcomeDto.consentRequired()
    val operations = ops(gateway)

    val skipped = operations.openRoute("native-9", "skip")
    assertEquals(RouteStates.CONSENT_REQUIRED, skipped.state)
    // `'skip'`은 컨트랙트를 **띄우지 않는다**.
    assertTrue(gateway.calls.none { it.startsWith("requestRouteConsent") })

    gateway.consentOutcome = RouteOutcomeDto.consentRequired()
    val prompted = operations.openRoute("native-9", "prompt")
    assertEquals(RouteStates.CONSENT_REQUIRED, prompted.state)
    assertTrue(gateway.calls.any { it.startsWith("requestRouteConsent") })
    // 거부·타임아웃·미선언은 바이트 동일하다(f112, f104) -> 빈 스트림이지 지어낸 코드가 아니다.
    assertNull(operations.readRouteChunk(prompted.handle, 1000))
  }

  @Test
  fun `f113 — a prompt from the background short-circuits BEFORE the Intent`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.inlineRouteStates["native-9"] = RouteOutcomeDto.consentRequired()
    gateway.importance = 300 // IMPORTANCE_SERVICE — a manifest BroadcastReceiver (f113의 측정 조건)
    val operations = ops(gateway)

    val error = runCatching { operations.openRoute("native-9", "prompt") }.exceptionOrNull()
    assertTrue(error is WorkoutsConsentRequiredException)
    // Intent를 띄우지 않았다는 것이 요점이다. READ_HEALTH_DATA_IN_BACKGROUND는 도움이 되지 않는다.
    assertTrue(gateway.calls.none { it.startsWith("requestRouteConsent") })
  }

  @Test
  fun `f105 — a second concurrent consent request surfaces busy, it does not queue`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.inlineRouteStates["native-9"] = RouteOutcomeDto.consentRequired()
    gateway.consentBusy = true
    val operations = ops(gateway)
    val error = runCatching { operations.openRoute("native-9", "prompt") }.exceptionOrNull()
    assertTrue(error is WorkoutsBusyException)
  }

  @Test
  fun `a granted consent feeds the cache so a second read costs nothing`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.inlineRouteStates["native-9"] = RouteOutcomeDto.consentRequired()
    gateway.consentOutcome = RouteOutcomeDto.data(points(25))
    val operations = ops(gateway)

    assertEquals(RouteStates.AVAILABLE, operations.openRoute("native-9", "prompt").state)
    gateway.calls.clear()
    assertEquals(RouteStates.AVAILABLE, operations.openRoute("native-9", "skip").state)
    assertEquals(emptyList<String>(), gateway.calls)
  }

  // ── 쓰기 (§8.5) ────────────────────────────────────────────────────────────

  @Test
  fun `the size guard fires BEFORE the platform call`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    val error = runCatching { operations.saveWorkout(write(route = points(20_001))) }.exceptionOrNull()
    assertTrue(error is WorkoutsRouteTooLargeException)
    assertEquals("nothing reached the platform", emptyList<String>(), gateway.calls)
  }

  @Test
  fun `f95 — a route is stored when permitted and 'notPermitted' when the scope is missing`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    val stored = operations.saveWorkout(write(route = points(10)))
    assertEquals(RouteWriteOutcomes.STORED, stored.route)
    assertEquals(10, stored.routePointsWritten)

    gateway.granted.remove(WorkoutsPermissions.WRITE_EXERCISE_ROUTE)
    val unpermitted = operations.saveWorkout(write(clientId = "w2", route = points(10)))
    // 쓰기 자체는 성공한다 — 루트만 빠진다(f95). 던지지 않는 것이 계약이다.
    assertEquals(RouteWriteOutcomes.NOT_PERMITTED, unpermitted.route)
    assertEquals(0, unpermitted.routePointsWritten)
  }

  @Test
  fun `f95 — a full-state upsert without a route destroys the stored route`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write(route = points(10)))
    assertEquals(10, gateway.records["w1#session"]!!.route.size)
    operations.saveWorkout(write(version = 2L, route = emptyList()))
    // 이것은 버그가 아니라 플랫폼의 규칙이다. 그래서 `./core`가 `route: 'none'`을 **명시**하게 한다.
    assertEquals(0, gateway.records["w1#session"]!!.route.size)
  }

  @Test
  fun `f93 f94 — a lower version is a silent no-op that only the read-back can see`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write(version = 5L, distanceM = 1000.0))
    val outcome = operations.saveWorkout(write(version = 2L, distanceM = 1000.0))
    // insert는 정상 반환하고 **같은 id**를 준다. 여기까지는 성공한 쓰기와 구별할 수 없다.
    assertEquals("native-1", outcome.nativeId)
    // read-back만이 진실을 준다: 저장된 version(5)이 보낸 version(2)보다 높다 -> `./core`가 staleVersion.
    assertEquals(5L, operations.readBackVersion("w1"))
  }

  @Test
  fun `§8_5-3 — the read-back reads a metric record first and the session LAST`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write(distanceM = 1000.0, activeEnergyKcal = 90.0))
    gateway.calls.clear()
    assertEquals(1L, operations.readBackVersion("w1"))
    // 세션 read-back은 루트를 강제로 materialise한다(f116). 거리 레코드가 판정에 등가이면서 싸다.
    assertEquals(listOf("readBackVersion:DISTANCE"), gateway.calls)
  }

  @Test
  fun `§8_5-3 — a workout with no metric records falls through to the session`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write())
    gateway.calls.clear()
    assertEquals(1L, operations.readBackVersion("w1"))
    // §11-4가 정직하게 남긴 자리다: 이 경우에만 루트가 다시 materialise된다.
    assertEquals(listOf("readBackVersion:SESSION"), gateway.calls)
  }

  @Test
  fun `the read-back never probes a record type this workout did not write`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write(steps = 6123L))
    gateway.calls.clear()
    operations.readBackVersion("w1")
    assertEquals(listOf("readBackVersion:STEPS"), gateway.calls)
  }

  // ── 삭제 (§8.6) ────────────────────────────────────────────────────────────

  @Test
  fun `f98 — delete issues exactly one call per record type, six in total`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    operations.saveWorkout(write(distanceM = 1000.0, activeEnergyKcal = 90.0, steps = 10L))
    gateway.calls.clear()

    assertTrue(operations.deleteWorkout(DeleteRefDto(clientId = "w1")))
    assertEquals(6, gateway.deleted.size)
    assertEquals(RecordType.entries.toSet(), gateway.deleted.map { it.first }.toSet())
    // 메트릭 레코드는 cascade되지 않으므로(f98) 명시적으로 지워야 하나도 남지 않는다.
    assertEquals(emptyMap<String, Any>(), gateway.records)
  }

  @Test
  fun `f96 — an unknown clientId is 'deleted false', never an error`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    assertEquals(false, operations.deleteWorkout(DeleteRefDto(clientId = "never-written")))
    // 여분의 삭제 호출은 무해하다 — 그래도 6회를 다 돈다.
    assertEquals(6, gateway.deleted.size)
  }

  @Test
  fun `deleting a foreign workout by nativeId is notAuthorized`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.putForeignSession("native-foreign", "com.gjkit.hcwriter", "t4-full-100")
    val operations = ops(gateway)
    val error = runCatching {
      operations.deleteWorkout(DeleteRefDto(nativeId = "native-foreign"))
    }.exceptionOrNull()
    assertTrue(error is WorkoutsNotAuthorizedException)
    assertEquals("nothing was deleted", 0, gateway.deleted.size)
  }

  @Test
  fun `deleting an unknown nativeId is 'deleted false'`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    assertEquals(false, operations.deleteWorkout(DeleteRefDto(nativeId = "native-missing")))
  }

  @Test
  fun `the nativeId path finds our clientRecordId and deletes the metric records too`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    val saved = operations.saveWorkout(write(distanceM = 1000.0))
    gateway.calls.clear()
    assertTrue(operations.deleteWorkout(DeleteRefDto(nativeId = saved.nativeId)))
    assertEquals(6, gateway.deleted.size)
    assertEquals(emptyMap<String, Any>(), gateway.records)
  }

  @Test
  fun `an empty delete ref is invalidArgument`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val error = runCatching { ops(gateway).deleteWorkout(DeleteRefDto()) }.exceptionOrNull()
    assertTrue(error is WorkoutsInvalidArgumentException)
  }

  @Test
  fun `saving does NOT prime the route cache — otherwise the round-trip assertion is vacuous`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    val saved = operations.saveWorkout(write(route = points(10)))
    gateway.calls.clear()
    // 저장 직후의 getRoute는 **플랫폼에 물어봐야 한다**. 우리가 보낸 배열을 그대로 돌려주면
    // 자기 검증 루프(§9.5-1)의 "저장 -> 되읽기가 일치한다"가 아무것도 증명하지 않는다.
    operations.openRoute(saved.nativeId!!, "skip")
    assertTrue(gateway.calls.any { it.startsWith("inlineRoute") })
  }

  @Test
  fun `deleting forgets the cached route so a stale read cannot outlive the record`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    gateway.pageRoutes = listOf("native-1" to points(10))
    val operations = ops(gateway)
    operations.saveWorkout(write())
    operations.readWorkoutPage(WindowDto(0.0, 1.0), 50, null)

    assertTrue(operations.deleteWorkout(DeleteRefDto(clientId = "w1")))
    gateway.calls.clear()
    val handle = operations.openRoute("native-1", "skip")
    // 캐시가 비었으므로 플랫폼에 물어보고, 레코드가 없으니 `none`이다.
    assertTrue(gateway.calls.any { it.startsWith("inlineRoute") })
    assertEquals(RouteStates.NONE, handle.state)
  }

  // ── 자기 에코 (§4.7) ───────────────────────────────────────────────────────

  @Test
  fun `our own record reads back under the caller's id, not the stored suffix`() = runBlocking {
    val gateway = FakeHealthConnectGateway(own)
    val operations = ops(gateway)
    val saved = operations.saveWorkout(write(clientId = "example-smoke-1"))
    val session = gateway.readSession(saved.nativeId!!)!!
    // 이것이 save -> sync -> delete 왕복을 성립시키는 지점이다(§4.7의 업서트 키 규칙).
    assertEquals("example-smoke-1", session.clientId)
    assertEquals("example-smoke-1#session", session.android.clientRecordId)
    assertTrue(session.isOwn)
  }
}
