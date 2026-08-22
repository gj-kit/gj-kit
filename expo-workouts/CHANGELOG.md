# @gj-kit/expo-workouts

## 0.1.0

### Minor Changes

- 첫 릴리스. Expo development build에서 HealthKit / Health Connect 워크아웃·GPS route를
  가져오고, 동기화하고, idempotent하게 쓰고 지우는 네이티브 브리지를 제공한다. Node·web·Expo Go처럼
  네이티브 모듈이 없는 런타임은 결정적으로 typed `unavailable`을 보고한다.

  `./core`는 peer 없는 순수 TypeScript protocol·cursor·route normalizer를, `./testing`은 같은
  protocol pipeline을 거치는 in-memory native fake를, `./plugin`은 HealthKit entitlement와
  Health Connect manifest를 위한 typed config-plugin props를 제공한다. iOS/Android native
  implementation, plugin introspection, packed SDK 56/57 consumer smoke와 example dev-client
  Maestro flows를 함께 제공한다.

  **소유자 결정 ② (2026-08-22) — `Scope`가 4종에서 7종으로 갈라졌다.** 이것은 "새 멤버 3개"가
  아니라 **미션이 고정한 이름의 의미 변경**이다: `'workouts'`는 이제 **세션만** 뜻하고 총계를
  포함하지 않는다. `read: ['workouts']`는 변경 전후 모두 유효한 코드이며 변경 후 다른 일을 한다 —
  Android 권한 행이 4개에서 1개로 줄고, `distanceM` · `activeEnergyKcal` · `elevationGainM`가 **모든
  워크아웃에서 `undefined`**가 된다. 총계를 포함하는 한 토큰 형태는 `WORKOUT_TOTALS_SCOPES`다.
  `Record<Scope, ScopeStatus>`가 4키에서 7키가 되는 것은 **읽는 쪽에는 additive이고, 만드는 쪽(테스트
  더블 · `./testing` 시드)에는 breaking**이다.

  **소유자 결정 ③ (2026-08-22) — D11 개정.** `WorkoutKind`가 5종에서 **9종**으로 넓어졌다:
  `running · walking · hiking · cycling · swimming · rowing · strength · wheelchair · other`.
  `indoor`와 `platformData` 규약은 바뀌지 않았다. `WorkoutKind`와 `Scope` 두 유니언은 **0.x 동안만**
  열려 있고 1.0.0에서 잠긴다 — 0.x의 멤버 추가는 minor이되 여기에 반드시 명시한다.

  커서 포맷은 v1이고 `READABLE_CURSOR_VERSIONS = [1]`이다. **이 목록을 줄이는 것은 공개 계약의
  파괴적 변경**이며, 그때 모든 사용자의 첫 동기화가 전체 백필로 돌아간다는 사실을 여기에 적어야 한다.
