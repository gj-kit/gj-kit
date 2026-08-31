# @gj-kit/expo-workouts

## 0.1.2

### Patch Changes

- 73379a8: docs: lead every README with the payoff instead of the taxonomy

  패키지 README와 문서 포털을 전면 개편했다. 기존 문서는 경계와 금지 사항부터 나열해서, 처음 보는 사람이 이 패키지를 왜 써야 하는지 판단할 근거가 없었다.

  각 README는 이제 다음 순서로 읽힌다.

  - npm·CI·types·runtime deps·license 배지
  - tagline — 이 패키지가 무엇을 불가능하게 만드는지 한 줄
  - "왜 필요한가" — 이 패키지 없이 실제로 나는 사고
  - "무엇으로 막는가" — 실제 export 심볼로 추적 가능한 항목 4~5개
  - Golden path — 기존과 동일
  - "실제로는 이렇게 걸립니다" — payoff가 드러나는 두 번째 예제
  - "주장 대신 검증" — 측정한 숫자만

  문구 정본은 `website/src/data/catalog.mjs` 하나이고 README 20종과 포털이 여기서 생성된다. 추가한 예제는 전부 `check:readme`가 dist 타입에 대해 컴파일을 검증하며, `check:docs`와 `check:readme`가 tagline·problem·highlights·배지의 존재를 검사한다. `localize-readmes.mjs`는 "runtime deps 0" 배지가 사실인지도 함께 강제한다.

  공개 API는 변경되지 않았다.

## 0.1.1

### Patch Changes

- 9c3cbc4: Publish English-first and Korean README files, add package discovery metadata, and link every package to the generated global API documentation portal.

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
