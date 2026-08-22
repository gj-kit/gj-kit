---
"@gj-kit/expo-workouts": minor
---

신규 패키지 — HealthKit(iOS) / Health Connect(Android) 워크아웃과 GPS 루트를 위한 첫 네이티브 Expo 모듈. 갭 없는 증분 동기화 프로토콜, 멱등 쓰기, 스트리밍 루트를 제공한다. **런타임 의존성 0.**

- **공개 함수 12종 + `workouts`**: `getAvailability` · `requestAuthorization` · `getAuthorizationState` · `listWorkouts` · `syncWorkouts` · `getRoute` · `readHeartRate` · `readSteps` · `saveWorkout` · `deleteWorkout` · `openSettings` · `openStoreListing`. 서브패스 4종 — `.`(네이티브) · `./core`(peer 0, 프로토콜 전체) · `./testing`(네이티브 seam 페이크) · `./plugin`(props 타입 1종).
- **프로토콜이 순수 TypeScript다.** 커서 코덱·reset 분류(6종)·`added`/`removed` 정합·루트 위생·크기 추정·에러 매핑·읽기 예산이 전부 `./core`에 있고 Node에서 돈다. 네이티브는 원시 사실만 올려보내고 판단하지 않는다. 그래서 소비자가 기기 없이 `pnpm test`로 프로토콜을 재현할 수 있다.
- **peer / 지원 범위**: `expo >=56.0.0 <58.0.0` (optional peer). iOS 16.4+ · Android는 패키지 API 26+, Health Connect API 28+. **`minSdk`는 플러그인이 건드리지 않는다** — 소비자가 `expo-build-properties`로 26으로 올려야 하고, 올리지 않았을 때의 manifest-merger 오류 원문을 README가 그대로 싣는다.
- **`syncWorkouts(null)`은 아무것도 읽지 않는다.** 체크포인트만 잡고 `reset: true` / `resetReason: 'noCursor'`로 돌아온다. 백필을 **그 다음에** 돌리는 순서가 갭 없음의 근거이고, 그 대가로 `added`는 델타 append가 아니라 **멱등 upsert 집합**이다. 호출자 의무 3종(멱등 upsert · 모르는 id 삭제는 no-op · 항목과 커서를 한 트랜잭션)은 라이브러리가 강제할 수 없으므로 README와 JSDoc이 같은 문구로 말한다.

**권한 의미 — 여기부터가 소비자가 반드시 읽어야 하는 부분이다.**

- **소유자 결정 ②는 "새 멤버 3개 추가"가 아니라 미션이 고정한 이름의 의미 변경이다.** `Scope`가 4종에서 7종이 되면서 **`'workouts'`가 "세션 목록 단독"을 뜻하게 됐다** — 총계(`distance`·`activeEnergy`·`elevation`)를 더 이상 포함하지 않는다. `read: ['workouts']`는 변경 전후 모두 유효한 코드이고 **변경 후 다른 일을 한다**: 총계 필드가 조용히 `undefined`가 된다. 타입도 가드도 잡지 못하는 유일한 종류의 breaking change이므로, 방어는 문서뿐이다 — README가 coarse 레시피 `read: [...WORKOUT_TOTALS_SCOPES, 'routes']`를 fine 설명보다 **먼저** 싣고, `app.json`에서 같은 실수를 하면 원인 파일에서 먼 런타임 `undefined`로 나타난다는 점을 플러그인 prop 문서가 반복한다.
- 같은 이유로 **`Record<Scope, ScopeStatus>`가 4키에서 7키가 된다.** 읽는 쪽에는 additive지만, 그 객체를 **만드는 쪽(테스트 더블·`./testing` 시드·저장해 둔 스냅샷)에는 breaking**이다. 소비자 0인 지금 비용은 0이고, 1.1에서 물게 될 형태가 정확히 이것이다.
- **소유자 결정 ③은 D11 개정이다.** `WorkoutKind`가 5종에서 9종으로 넓어졌다 — `swimming` · `rowing` · `strength` · `wheelchair`가 1급 kind가 됐다. 네 상수 모두 양 플랫폼에 non-deprecated로 실재함을 SDK 헤더와 AAR 바이트코드로 실측했고, 골든 벡터(`activity-vectors.json`)가 정수 18개를 값으로 고정한다. `WorkoutKind`는 1.0.0 이전에 확정돼야 하는 유니언이다(이후 확대는 major).
- **iOS 읽기 거부는 설계상 보이지 않는다.** 이미 물어본 iOS 읽기 scope는 영구히 `'unknown'`이고, `'unknown'`은 절대 사용자를 고발하지 않는다(`authorizationAdvice()`가 그것으로 `'openSettings'`를 내지 않고, `unpopulatedWorkoutMetrics()`는 iOS에서 항상 `[]`다). 쓰기 방향은 iOS에서도 참값을 준다.
- **빈 권한 결과는 거부가 아니라 inconclusive다.** Health Connect 첫 실행 온보딩에서 "Go back"을 누르면 ~20초 뒤 빈 집합이 오는데 전부 거부한 것과 바이트 단위로 같다. `AuthorizationResult.conclusive === false`로 구분하고, 이때 "거부됨" 화면을 그리면 안 된다. `requestAuthorization()`에는 내부 타임아웃이 **없다**(온보딩+추가 접근 화면이 41.6초 걸렸다).
- **`READ_EXERCISE_ROUTES`는 런타임 요청이 불가능하다.** 매니페스트 선언 전용이며, Health Connect 설정의 *Additional access* 또는 per-route 다이얼로그의 **"Allow all routes"**로만 부여된다. Android 루트 접근은 `routeAccess` 3티어(`all`/`own`/`perRoute`)로 보고하며, **`WRITE_EXERCISE_ROUTE`가 읽기에 영향을 주는 scope**라는 점(회수하면 자기가 쓴 루트도 못 읽는다), **Health Connect 첫 실행 온보딩이 문서화되지 않은 추가 전제**라는 점, 배경에서는 루트를 읽을 수 없다(`READ_HEALTH_DATA_IN_BACKGROUND`도 소용없다)는 점이 전부 실측이다.
- **`WorkoutWrite.route`는 필수다**(소유자 결정 ①). Android 업서트는 full-state라 루트를 빠뜨린 저장이 **저장돼 있던 루트를 지운다**. `'none'`을 명시적으로 적게 만드는 것이 이 데이터 손실을 막는 유일한 수단이고, 빈 배열 `[]`은 `invalidArgument`다.
- **`undefined`는 "모름"이지 `0`이 아니다.** Health Connect `aggregate()`가 모든 지표에 대해 null을 돌려주는 것이 실측돼(원인 미상, 온보딩 전후 동일) 이 라이브러리는 `aggregate()`를 **쓰지 않는다**(정적 가드가 Kotlin 소스에서 호출을 금지한다). `readRecords` + `dataOrigin` 필터 + 클라이언트 합산이며, 레코드가 없으면 필드는 `undefined`로 남는다.
- 에러는 `WorkoutsError` **코드 14종**뿐이고 `isWorkoutsError`로 판별한다(`instanceof`는 번들러가 엔트리마다 클래스를 복제하므로 신뢰할 수 없다). 메시지·`nativeMessage` 어디에도 좌표·헬스 수치·제목·메모가 들어가지 않는다.

**소비자가 직접 반복해야 하는 네이티브/실기 검증.** 네이티브 컴파일은 의도적으로 CI 게이트가 아니다(Xcode·Android SDK·부팅된 에뮬레이터를 갖춘 러너가 없고, 건너뛰는 게이트는 문서화된 게이트보다 나쁘다). 릴리스 전에 로컬에서: `npx expo run:ios` / `run:android` → iOS seam XCTest(`-parallel-testing-enabled NO` 필수) → Kotlin `testDebugUnitTest` → `example/maestro/` 플로우 → **자기 검증 루프**(3 600포인트 루트 저장 → `listWorkouts`가 정확히 그것을 찾음 → `syncWorkouts`가 자기 것으로 보고 → `getRoute` 왕복 불일치 0 → 버전 올려 재저장 → sync가 교체를 보고(iOS는 새 네이티브 id, Android는 같은 id) → 삭제 → sync가 제거를 보고 → 잔여물 0) → 건강 앱/Health Connect 육안 확인. iOS 시뮬레이터는 **창 모드로 띄워야**(`open -a Simulator`) HealthKit 시트가 나타난다.

**정직하게 미검증인 것 4가지**: iOS `pendingUnlock`(시뮬레이터에 강제 수단이 없고 물리 기기가 없었다) · iOS `swimming`/`rowing`/`wheelchair`의 거리 타입이 공유 인가 집합에 없어 그 kind에 `distanceM`을 실어 쓰면 `notAuthorized`가 예상된다 · Health Connect 권한 다이얼로그와 per-route 동의 다이얼로그(테스트 에뮬레이터가 이미 전 권한을 보유해 화면에 도달하지 못했다) · Health Connect API 28–33(Play APK 경로, 시스템 이미지 없음). 넷 다 README가 같은 문장으로 싣는다.
