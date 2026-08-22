# @gj-kit/expo-workouts — 공개 API 표면 설계 (확정)

> 작성: 2026-08-22. 설계안 3종(A 최소표면 / B 동기화정합 / C 소비자DX) 경쟁 → 심사 4건(재사용성 / 타입안전 / 기기없는 검증가능성 / §4·실측 충실도) → 합성.
> 근거 표기: `fNN` = Phase 0 실측(`docs/research/expo-workouts/phase0/RESULTS.md`, f61–f132) · `idx fNN` = 리서치 인덱스(`docs/research/expo-workouts-health-platforms.md`, f1–f60). **충돌 시 Phase 0 실측이 인덱스와 미션 §4.3 지시를 모두 이긴다** — 그 지점은 §0.2와 §8에서 명시적으로 표시했다.
> 형식·깊이 기준: `docs/design/expo-media-api-surface.md`. 한국어 산문 + 영어 식별자/JSDoc.
> D1–D12는 확정이며 이 문서는 그 안에서만 설계한다 — **단 D11은 2026-08-22 소유자 결정 ③으로 개정됐다(아래 개정 기록)**.
> **합성 단계에서 재실측한 항목은 §0.3에 전부 나열한다.** 세 설계안 중 둘이 공유하던 전제 하나(`.` 엔트리가 Node에서 import 가능하다)가 **사실과 반대**였고, 그 정정이 §2의 exports 맵을 바꿨다.

---

> ## ⚠ 개정 기록 — D11 (2026-08-22, 제품 소유자)
>
> **원문 D11** (`prompts/expo-workouts.md` D11 · 리서치 인덱스 §0 D11, 둘 다 이 문장으로 기록돼 있다):
> `kind: 'running' | 'walking' | 'hiking' | 'cycling' | 'other'` + `indoor: boolean`, 원시 플랫폼 값은 `platformData`에 보존.
>
> **개정 후**: `WorkoutKind`는 **9종**이다 — `running · walking · hiking · cycling · swimming · rowing · strength · wheelchair · other`.
> `indoor`와 `platformData` 규약은 **바뀌지 않았다**.
>
> **개정 사유**: 소유자가 §12-③에서 **옵션 C(`WorkoutKind` 확대)**를 선택했다. 이 문서의 §12는 C를 **비추천**했으므로(“우리는 활동 분류 라이브러리가 아니다”), 이것은 문서의 권고를 소유자가 뒤집은 지점이며 §12에 그렇게 기록한다.
> **개정 범위**: D11만. 다른 D 결정은 손대지 않았다. 원문 D11을 소급해서 고쳐 쓰지 않는다 — 리서치 인덱스 §0의 D11 행에도 원문을 남긴 채 개정 표시만 덧붙였다.
> **파급**: §0.2 채택 #31·#32·#33 · §1-7 닫힌 유니언 인구조사 · §5.1 `WORKOUT_KINDS` · §5.2 매핑 함수 4종 · §8.1 · §8.3 매핑표 전면 교체 · §6.3 픽스처 ㉗ · §11-18·23·25.

---

## 0. 채택 맵

### 0.1 심사 점수

| 심사 기준 | A (최소 표면) | B (동기화 정합) | C (소비자 DX) |
|---|---|---|---|
| (a) medalmedal2 너머의 재사용성 | 6 | **8** | 7 |
| (b) 타입 안전 · 오용 불가능성 | **8** | 7 | 6 |
| (c) 기기 없는 검증 가능성 | 6 | **8** | 7 |
| (d) 미션 §4 · 실측 충실도 | **7** | 6 | 5 |
| 합계 | 27 | **29** | 25 |

**섀시는 B, 타입 골격은 A, 패키징·비용 모델은 C.** 섀시를 B로 고른 근거는 단 하나다 — 이 라이브러리에서 조용히 깨지고 되돌릴 수 없는 유일한 것이 **동기화 갭**이고, B만이 "프로토콜을 순수 TS로 끌어올려 Node에서 fuzz한다"는 구조적 답을 냈다(심사 (c)). 그러나 B의 진입 형태(`syncWorkouts({cursor, backfillFromMs})`)는 미션 §4.2의 입력 표면을 넓히므로 **기각**하고, C/미션의 `syncWorkouts(cursor: string | null)` + "`reset:true` → `listWorkouts`로 백필" 한 문장 계약 위에 B의 커서 코덱·버저닝·reset 분류·정합 규칙을 **그대로 얹었다**(§4). 갭 없음 증명은 두 형태에서 동일하게 성립한다(§4.4).

### 0.2 채택표

| # | 결정 | 채택 출처 | 근거 |
|---|---|---|---|
| 1 | `.`을 `node`/`browser` exports 조건으로 **포크**해 비네이티브 그래프에서 `expo`를 제거 | **C** §2.3 | **§0.3 V1 실측**: `expo@56.0.20`은 `exports` 맵이 **없고** `main`이 `src/Expo.ts`(미전처리 TS)다. 순수 Node에서 `require('expo')`는 즉시 throw한다. A·B의 "`.`은 Node에서 안전하다"는 주장과 그것을 증명하겠다던 `import-safety-guard`는 **둘 다 실행 불가능**하다. 미션 §4.1이 Node를 명시적으로 요구하므로 포크는 선택이 아니다 |
| 2 | `"type": "module"`을 **쓰지 않는다** (expo-media 선례에서 의도적 이탈) | **C** §2.4-A | T9(`app.plugin.js`가 ESM 루트에서 로드되는가)가 Phase 0에서 **실행되지 않았다**. ESM 루트에서 `.js` 플러그인은 ESM으로 해석돼 `module.exports`가 죽는다(idx f6 pitfall 5). 미측정 위험을 안고 갈 이유가 없다 |
| 3 | `Workout = IosWorkout \| AndroidWorkout` **최상위 판별 유니언** | **C** §5.1 | **§0.3 V4 실측**: B처럼 `platform`을 `platformData`의 형제 필드로 두면 `if (w.platform === 'ios')`가 `platformData`를 좁히지 못하고 **TS2339**가 난다 → 소비자가 `as`를 쓴다. 유니언으로 올리면 캐스트 0. 미션 §4.2 "`platformData` (discriminated by `platform`)"의 문자 그대로의 독법이다 |
| 4 | `SaveResult`를 **판별 유니언**으로 (`nativeId`가 `pendingUnlock` 브랜치에 존재하지 않음) | **A** §5.1 | **§0.3 V5 실측**: 유니언은 `r.nativeId`를 TS2339로 잡고, B·C의 평평한 `nativeId?: string`은 `r.nativeId!`를 조용히 통과시킨다. f70 — 잠긴 기기는 **개발 중에 절대 보이지 않는** 브랜치이므로 타입이 강제하지 않으면 아무도 처리하지 않는다 |
| 5 | `AuthorizationState`를 **availability로 판별**하는 유니언으로 융합. 단 `getAvailability()`는 별도 함수로 유지 | **A**(융합) + 미션(함수 분리) | A의 `getStatus()` 병합은 "unavailable에서 scope 읽기"를 표현 불가능하게 만드는 유일한 수단이지만(심사 (b)), 함수를 합치면 폴링 경로에서 쓰는 저렴한 `getAvailability()`가 사라진다. **§0.3 V6 실측**: 타입만 융합하고 함수는 둘로 두면 두 이득이 모두 성립하고, `AuthorizationState & { conclusive }` 교차에서도 narrowing이 유지된다 |
| 6 | `requestRouteAccess` **삭제** → `getRoute(id, { consent })`에 흡수 | **A** §0 | **f111**: "Allow this route"는 일회성이고 `READ_EXERCISE_ROUTES`를 **부여하지 않으며**, 그 호출 자체가 경로를 반환한다. B·C가 문서화한 `requestRouteAccess() → 'granted' → getRoute()` 2단계는 **f111+f114상 동작할 수 없다**(심사 (b) 교차 발견 6). 함수 삭제는 축소이므로 미션 §4.2를 위반하지 않는다 |
| 7 | 그래도 **15번째 코드 `routeUnavailable`을 만들지 않는다** | 합성 신설 | RESULTS 250행이 `ERR_WORKOUTS_ROUTE_UNAVAILABLE`을 이름으로 지시하지만 미션 §4.2는 14종을 exhaustive로 못 박았다. **해소**: 구별 불가능한 null 전부를 **빈 스트림**으로 돌려주고, 호출자가 이미 손에 쥔 `routeState`가 판별자다(`'consentRequired'` + 빈 스트림 = 거부/불가, `'none'` + 빈 스트림 = 경로 없음). "하나의 불투명한 결과, `denied` 코드를 지어내지 않는다"는 RESULTS의 **의도**는 지켜지고 코드 수는 14로 유지된다 |
| 8 | 에러 코드 **14종을 미션 그대로** 유지 (`storeLocked`·`cancelled`·`io` 삭제 기각) | 미션 §4.2 + 심사 (d) | A의 삭제는 사실 오적용이다. `storeLocked`의 출처는 f70(재현 불가)이 아니라 **idx f24 `errorDatabaseInaccessible`**이고 RESULTS 274행이 "`finishRoute`가 잠긴 기기에서 이 오류로 실패할 수 있다고 가정하고 재시도 가능하게 만들라"고 지시한다. `cancelled`의 출처는 **idx f9**(Android activity-result 프로세스 사망, fallback 콜백 "not working")다. `io`의 출처는 **f64**(`insertRouteData` 오류를 typed error로 올리라)이며 호출자 행동이 `busy`(나중에 재시도)와 다르다 |
| 9 | `listWorkouts`는 **`pageToken` 유지**, `AsyncIterable` 기각 | **B** §5.1 | A의 `AsyncIterable`은 **정렬 보장도 페이지 토큰도 없어** 앱 실행을 넘는 백필을 재개할 수 없다(심사 (a) 치명 결함). 동기화 커서와 다른 이름(`pageToken`)과 **다른 매직**(`gjp1.` vs `gjw1.`)을 써서 양방향 안전 실패를 만든다 |
| 10 | 커서 = `gjw<formatVersion>.<platformTag>.<base64url(JSON)>`, `READABLE_CURSOR_VERSIONS` + 순수 업그레이드 함수 | **B** §3.1–3.2 | 패널에서 유일한 전방 호환성 이야기. 우리가 0.2에서 포맷을 바꿔도 전체 재백필을 강요하지 않는다. 매직 검사가 base64/JSON 디코드 **이전**이라 적대적 입력 비용이 0이고, "expired/invalid → `reset:true`, never an exception"이 파싱보다 앞선다 |
| 11 | 커서에 **granted scope 지문**을 넣고 변화 시 `reset` | **B** §0.2-4 | A·C가 모두 놓친 실버그: 사용자가 나중에 `steps`를 허용해도 이미 드레인된 워크아웃은 재방출되지 않아 **영원히 `steps: undefined`**로 남는다. 입력 표면을 넓히지 않고 reset 사유 하나로 해결된다 |
| 12 | `syncWorkouts(cursor: string \| null)` — B의 `{cursor, backfillFromMs}` **기각** | 미션 §4.2 + **C** §7.1 | B의 필수 `backfillFromMs`는 §4.2 입력 표면의 명백한 확대다(심사 (d)). 미션은 이미 "`reset` → caller re-backfills by window"라고 모델을 정했다. 갭 없음 증명은 두 형태에서 동일하게 성립한다(§4.4) |
| 13 | `SyncResult`를 `reset`으로 판별하는 유니언으로 (`resetReason`은 `reset:true` 브랜치에만) | 합성 신설 (B의 `resetReason` + B §11-11의 자기반론 해소) | **§0.3 V7 실측**: `{reset:true; resetReason} \| {reset:false}`에서 `const b: boolean = s.reset`이 **그대로 컴파일된다**. 즉 미션의 `reset: boolean` 스케치와 읽기 호환이며, B가 "미션 형태에서 멀어진다"며 포기한 타입 안전을 **비용 0으로** 얻는다 |
| 14 | Android `saveWorkout` **무조건 read-back** (`verifyWrite` 옵션 없음), 대상은 메트릭 레코드 우선 — **소유자 결정 ④ (2026-08-22)로 확정** | **A**+**B**+**C** 만장일치, 순서는 **B** §0.2-9, 소유자 확정 | f93/f94: 낮은 version은 `insertRecords`에도 Changes API에도 흔적을 남기지 않는다. read-back이 유일한 검출. 세션을 마지막에 두는 것은 f116(세션 read가 루트를 강제 materialise) 때문 |
| 15 | `listWorkouts`의 메트릭 읽기는 **세션당이 아니라 페이지 창당 1회**, 하한을 페이지 내 최장 세션만큼 확장 | **C** §4.3(산술) + **B** §3.8(하한 확장) | C의 산술: 200세션 백필이 세션당이면 1004요청 = 15분 예산 전체, 페이지당이면 36요청. **27배**. B의 보정: `readRecords`는 start instant `[from,to)` 필터라(f107) 창 시작 전에 시작한 메트릭 레코드를 놓친다 — 확장폭은 매직 상수가 아니라 **그 페이지에서 파생된 값**이다 |
| 16 | `aggregate()`를 **한 번도 호출하지 않는다** + Kotlin 소스 가드 | **A**+**B** | f109: 모든 지표에 null, 온보딩 전후 동일, 예외 없음. C가 유지한 aggregate-우선/readRecords-폴백은 **기기마다 다른 숫자**를 낳고 검증할 방법이 없다. 이것은 미션 §4.3의 "세션당 aggregate 1회" 지시를 **Phase 0 실측이 뒤집은 지점**이며 RESULTS 263행이 명령한다 |
| 17 | distance/energy **provenance 태그 유지**, tier 2 코드 유지, tier 3 유지 | **B**·**C** (A의 삭제 기각) | A는 f74(tier 3이 무관한 999 m를 반환)를 근거로 삭제했으나, RESULTS 205–206행은 tier 2 유지와 `predicateForObjects(from:)` 추가 조회를 **명령**한다. tier 3의 위험은 삭제가 아니라 **태그**로 해소된다 — `'derived'`는 "다른 소스가 섞였을 수 있음"을 정확히 뜻한다 |
| 18 | iOS에 Android 20 000포인트 가드를 **적용하지 않는다** | **B** §0.3-7 (A·C 기각) | f77: HealthKit은 36 000포인트를 문제없이 저장·스트리밍한다. RESULTS 232행은 가드를 **Kotlin에** 두라고 지정한다. C 스스로 §14-3에서 "첫 소비자의 흔한 8시간 등산(28 800점)이 상한을 넘는다"고 인정했다. Android 상한 때문에 iOS 사용자 데이터를 버리지 않는다. 이식성은 `estimateAndroidRecordBytes()` 순수 함수로 앱이 스스로 검사한다 |
| 19 | `deleteWorkout(ref: WorkoutRef)` — **`?: never` 배타 유니언** | **C**(아이디어) + 합성(수정) | **§0.3 V2 실측**: C의 픽스처 ①은 **틀렸다**. `{nativeId} \| {clientId}` 유니언은 TypeScript의 union excess-property 규칙상 `{clientId, nativeId}`를 **허용한다**. `{ nativeId: string; clientId?: never } \| { clientId: string; nativeId?: never }`로 고쳐야 TS2345가 난다(V3에서 확인) |
| 20 | `{ nativeId }` 삭제도 **clientRecordId를 역해석해 메트릭 레코드 6종을 함께 지운다** | **B** §4.4 (C의 결함 수정) | f98: 메트릭 레코드는 cascade되지 않는다. C의 `{nativeId}` 분기는 세션만 지워 사용자 헬스 스토어에 유령 거리·칼로리를 남긴다 |
| 21 | `WorkoutWrite.route`를 **필수 `readonly RoutePoint[] \| 'none'`**으로 — **소유자 결정 ① (2026-08-22)로 확정** | **합성 신설** (세 안 모두 미해결) + 소유자 확정 | f95: 루트를 빠뜨린 업서트는 **저장된 루트를 삭제한다**. 세 안 모두 "치명·조용함"으로 분류하고 "타입으로 못 막는다"고 적었다. **막을 수 있다**. **§0.3 V8 실측**: 필드를 필수로 만들면 생략이 TS2741이 되고 `'none'`이 의도를 강제 발화시킨다. 옵셔널→필수는 입력 축소이지 확대가 아니다 |
| 22 | `EPOCH_MS_FLOOR` 런타임 가드 — 초/밀리초 혼동 차단 | **합성 신설** (세 안 모두 미해결) | 심사 (b) 교차 발견 2: 어느 안에도 "초를 밀리초 자리에 넣었다"를 잡는 픽스처가 없다(AE의 miles 사고 idx f46과 동종). **§0.3 V9 실측**: 오늘의 epoch-초는 1.787e9, `1e11`ms는 **1973-03-03**이다. `0 < ms < 1e11`을 `invalidArgument`로 거절하면 초/밀리초 혼동을 100% 잡으면서 실재하는 워크아웃은 하나도 거절하지 않는다 |
| 23 | `./testing`이 **네이티브 seam을 페이크한다** (API를 페이크하지 않는다) + `createWorkoutsApi(native)`를 `./core`로 | **합성 신설** (세 안 모두 API 레벨 페이크) | 심사 (c) 교차 발견 1: 세 안 모두 `WorkoutsApi`를 페이크해 **JS 계층 전체**(DTO→`Workout` 정규화, sentinel 정리(f83), `ERR_WORKOUTS_*`→code 매핑, `AsyncIterable` 래퍼와 취소, 사전 창 검증)를 CI에서 우회한다. A는 이를 "`.`에는 단위 테스트할 것이 없다"고 미덕으로 적었다. `createWorkoutsApi`를 `./core`의 순수 팩토리로 올리면 `.`·`./testing`·`index.unsupported`가 **한 구현**을 공유하고, 페이크 위에서 도는 것이 진짜 코드가 된다 |
| 24 | 레이트 예산 페이서를 **`./core`로 이동**(Clock 주입) | **합성 신설** (세 안 모두 네이티브에 둠) | 심사 (c) 교차 발견 3: 세 안 모두 예산을 Kotlin에 두어 `pnpm test`에서 도달 불가한데, C는 그럼에도 "480회 폴링 → 예산 소진" 테스트를 스위트에 적었다(구조적으로 불가능). `./core`로 올리면 슬라이딩 윈도·거절-비차단 정책·`retryAfterMs` 계산이 전부 Node에서 검증된다 |
| 25 | 쓰기 방향 활동 매핑표를 **확정**(`kind` × `indoor` → 플랫폼 값) | **합성 신설** (세 안 모두 공백) | 심사 (a) 교차 발견 2: 세 안 모두 `kindFrom*`(읽기)만 정의하고 쓰기 방향을 아무도 고르지 않았다 — `cycling + indoor` → BIKING(8)인가 BIKING_STATIONARY(9)인가? §8.3의 표가 왕복 보존을 정의한다 |
| 26 | 라이브러리 매니페스트 vs 플러그인 분할 규칙 확정 | **합성 신설** (세 안 모두 미결) | 미션 §4.3이 Phase 1에 명시적으로 배정한 결정을 세 안 모두 건너뛰었다. 규칙: **introspect 스냅샷이 증명해야 하는 것은 전부 플러그인이 쓴다**(idx f10) → §7 |
| 27 | `authorizationAdvice(facts)`를 `./core` 순수 함수로. 단 `AuthorizationState`에 `advice` 필드를 **넣지 않는다** | **C**(함수) + 합성(필드 기각) | 심사 (a)가 지목한 C의 최고 아이디어. 그러나 필드로 박으면 우리 의견이 계약이 되고 Google이 UI를 바꾸면 원시 사실이었다면 틀리지 않았을 방식으로 틀린다(C §14-12 자인). 순수 함수만 내보내면 소비자가 채택하거나 재구현한다 |
| 28 | `pnpm test` 픽스처 2종을 **TS·Swift·Kotlin이 공유** (`sync-scenarios.json`, `route-vectors.json`) | **B** §9.4 + 합성(루트 벡터 확장) | B의 아이디어가 패널 최고의 네이티브/TS 표류 방어다. 심사 (c) 교차 발견 4: 루트 위생과 HC 크기 공식도 3개 언어에 중복 구현되므로 같은 골든 벡터가 필요하다 |
| 29 | `assertNeverWorkoutsCode` 유지 + **닫힌 유니언 호환성 정책** 명문화 | 합성 신설 | 심사 (b) 교차 발견 4: exhaustiveness 헬퍼는 코드 추가를 소비자 컴파일 파괴로 만든다. 해소는 헬퍼 삭제(A)가 아니라 **정책**이다 — `WorkoutsErrorCode`·`RouteState`·`ScopeStatus`·`WorkoutKind`·`Scope`·`SaveResult['status']`·`Availability['status']`·`RouteAccess`는 **1.x 동안 닫혀 있다**. 확장은 major다. **0.x 단서 (소유자 결정 ②·③이 강제한 명문화)**: 우리는 아직 0.x이므로 `WorkoutKind`(#32)와 `Scope`(#31)의 확대가 **minor**로 나간다. 그러나 공짜가 아니다 — `default` 없는 exhaustive `switch`(그 결과 `assertNever(kind)`)를 가진 소비자와 이 유니언을 자기 좁은 유니언에 대입하던 소비자는 **컴파일이 깨진다**. 그래서 규칙을 셋으로 못 박는다: (a) 1.0 이전의 멤버 추가는 minor이되 CHANGELOG에 “exhaustive switch에 breaking일 수 있음”을 **반드시** 표기한다, (b) 1.0부터는 이 행이 그대로 적용돼 확대가 major다, (c) 따라서 **두 유니언은 1.0.0 이전에 확정돼야 한다** — 넣고 싶은 kind(`snowboarding`·`paddling`·`elliptical` 등, §8.3 기각표)는 1.0 이후가 아니라 **지금** 논쟁해야 한다 |
| 30 | `.`에 `workouts: WorkoutsApi` 객체를 함께 내보낸다 | **C** §5.3 | 채택 #23의 부산물이라 중복 구현이 0이다 — 12개 명명 함수가 **문자 그대로 이 객체의 구조분해**다. DI 슬롯에 `./testing`의 `api`를 그대로 꽂을 수 있게 하는 유일한 수단 |
| 31 | **`Scope`를 7종으로 확대** — `'distance'`·`'activeEnergy'`·`'elevation'` 신설, `'workouts'`는 **세션만** 뜻하도록 의미 변경. 동시에 coarse 경로 상수 `WORKOUT_TOTALS_SCOPES` 신설 | **소유자 결정 ② (2026-08-22)** — 문서의 세 옵션(A/B/C)을 모두 거부하고 *"4종할지 7종으로 할지 개발자가 선택할 수 있도록"* 을 지시 | **미션 §4.2 입력 표면의 확대다. 이 행이 그 기록이다.** `AuthorizationRequest.read`/`.write`와 `GjKitWorkoutsPluginProps.read`/`.write`가 미션이 명명하지 않은 리터럴 3종을 받는다. 정당화는 측정이 아니라 **소유자 지시**이며, 문서의 추천(A: 4종 유지)이 채택되지 않았음을 §12에 명시한다. 부수 정당화 두 가지: (1) f121이 요청 가능한 타입마다 다이얼로그 행을 그리므로 사용자가 `READ_EXERCISE`를 허용하고 `READ_DISTANCE`를 거부할 수 있다 — coarse `'workouts'`에서는 `Record<Scope, ScopeStatus>`의 `read.workouts`에 **참인 값이 존재하지 않았다**. 분할이 그 칸을 처음으로 답할 수 있게 만든다. (2) `heartRate`·`steps`가 **이미** 이 형태(scope 1 : optional 필드 1)였다 — 분할은 개념 추가가 아니라 마지막 예외 3개의 제거다 |
| 32 | **`WorkoutKind`를 9종으로 확대** (`swimming`·`rowing`·`strength`·`wheelchair` 추가) — **D11 개정** | **소유자 결정 ③ (2026-08-22)** — 문서가 **비추천**한 옵션 C를 소유자가 선택 | **미션 §4.2 입력 표면의 확대다**(`WorkoutWrite.kind`). 근거: 네 kind 모두 두 플랫폼에 **non-deprecated 상수가 1:1로 실재함을 이 세션에서 실측**했다(§8.3 증거 열 — iPhoneOS 26.5 SDK 헤더 + `connect-client-1.1.0.aar` javap). 왕복은 골든 벡터 단위 테스트가 강제한다. 문서의 반론(“두 플랫폼 상수 표를 영구히 따라다녀야 한다”)은 유효하며, 그 완화가 §9.4의 **골든 벡터 고정**이다 — 표가 기억이 아니라 핀 박힌 데이터가 된다. D11 원문은 문서 머리의 개정 기록에 보존한다 |
| 33 | 분할이 만든 두 함정을 **노브 0개**로 막는다 — 읽기 측 `unpopulatedWorkoutMetrics(state)`, 쓰기 측 `requiredWriteScopes(workout)` 사전 검사 | 합성 신설 (결정 ②의 필수 부산물) | 읽기 함정: `read: ['workouts']`만 준 앱은 `distanceM`이 **모든** 워크아웃에서 `undefined`인데 타입도 가드도 그것을 말해주지 않는다. 쓰기 함정은 더 나쁘다 — §8.5의 단일 `insertRecords` 트랜잭션은 `WRITE_DISTANCE` 등이 없으면 **통째로 SecurityException으로 실패**해 워크아웃 자체가 저장되지 않는다(coarse 모델에서는 `write:['workouts']`가 넷을 모두 줬다). 두 함정 모두 새 옵션·새 에러 코드 없이 `./core` 순수 함수로 해소된다(§5.2) |

**미션 §4.2 대비 순증가**: 함수는 13 → **12**(축소). 결과 타입 필드 추가는 `SaveResult.route`/`routePointsWritten`(f95·f81이 강제), `SyncResult.resetReason`(reset 브랜치 전용), `AuthorizationResult.conclusive`(f120이 강제), `AuthorizationState.routeAccess`(미션 §4.2가 이미 요구), `Availability.reason`(미션 §4.2가 이미 요구).

**입력 표면 변경 (2026-08-22 소유자 결정으로 갱신 — 이 문단은 이전에 “입력 표면 확대는 0”이라고 적혀 있었고 그것은 이제 거짓이다)**:

| 방향 | 항목 | 출처 |
|---|---|---|
| **축소** | `WorkoutWrite.route?:` → **필수** `readonly RoutePoint[] \| 'none'` | 채택 #21 · 소유자 결정 ① |
| **확대** | `Scope` 4종 → **7종** (`distance`·`activeEnergy`·`elevation` 신설) + `'workouts'`의 **의미 변경** | 채택 #31 · 소유자 결정 ② |
| **확대** | `WorkoutKind` 5종 → **9종** (`swimming`·`rowing`·`strength`·`wheelchair` 신설) | 채택 #32 · 소유자 결정 ③ · **D11 개정** |
| 확대 아님 | `WORKOUT_TOTALS_SCOPES`·`unpopulatedWorkoutMetrics`·`requiredWriteScopes`·`WORKOUT_METRIC_SCOPES` | `./core` 순수 값/함수 추가이지 호출 표면의 필수 입력이 아니다 |

두 확대는 모두 **측정이 아니라 소유자 지시**로 정당화된다. 그것이 이 표가 존재하는 이유다 — 확대를 조용히 하지 않는 것이 집 규칙이고, 소유자는 그 규칙을 면제할 수 있는 유일한 사람이다.

### 0.3 합성 단계 재실측 (원 실측 — 세 설계안의 자기 주장을 액면가로 믿지 않은 결과)

| # | 측정 | 방법 | 결과 |
|---|---|---|---|
| **V1** | A·B의 "`.`은 Node에서 import해도 안전하다"가 참인가 | `gj-kit` 워크스페이스에 설치된 실제 `expo@56.0.20`의 `package.json`을 읽고 순수 Node에서 `require('expo')` 실행 | **거짓.** `expo`는 `exports` 맵이 **없고** `"main": "src/Expo.ts"`다. `require('expo')` → `Error: Stripping types is currently unsupported for files under node_modules, for ".../expo/src/Expo.ts"`. A의 `import-safety-guard`(`await import('./dist/index.js')`)와 B의 `import-time` 가드는 **설계대로는 실행 자체가 실패한다**. → §2.3의 `node`/`browser` 포크는 선택이 아니라 필수 |
| **V2** | C의 타입 픽스처 ① (`deleteWorkout({clientId,nativeId})`가 컴파일 에러인가) | TS 6.0.3, 모노레포 `tsconfig.base.json`과 동일 플래그(strict + EOP + noUncheckedIndexedAccess)로 `{nativeId:string} \| {clientId:string}` 대상에 두 키를 함께 전달 | **에러가 나지 않는다.** union 대상의 excess-property 검사는 **어느 멤버에든** 존재하는 프로퍼티를 허용한다. C의 `@ts-expect-error`는 그 자체로 컴파일 실패한다. **C의 대표 타입안전 주장은 미검증이자 거짓이었다** |
| **V3** | 그렇다면 무엇이 잡는가 | 같은 환경에서 `{ nativeId: string; clientId?: never } \| { clientId: string; nativeId?: never }` 재측정 | **잡는다.** `TS2345 … Types of property 'nativeId' are incompatible. Type 'string' is not assignable to type 'undefined'.` → §5.1의 `WorkoutRef` 확정 형태 |
| **V4** | B의 `platform` / `platformData` 분리가 narrowing을 유지하는가 | `interface { platform: 'ios'\|'android'; platformData: IosData \| AndroidData }`에서 `if (w.platform === 'ios') w.platformData.activityTypeRaw` | **붕괴한다.** `TS2339: Property 'activityTypeRaw' does not exist on type 'IosData \| AndroidData'`. C의 최상위 유니언(`IosWorkout \| AndroidWorkout`)은 **에러 0**. B의 형태는 소비자를 `as IosWorkoutData`로 훈련시키고, B에는 이 픽스처가 **아예 없다** |
| **V5** | A의 `SaveResult` 판별 유니언이 B·C의 평평한 형태보다 실제로 강한가 | 두 형태를 나란히 컴파일 | **강하다.** 유니언: `su.nativeId` → `TS2339 … does not exist on type '{ status: "pendingUnlock" }'`. 평평한 형태: `sf.nativeId!.length` → **에러 없음**. f70의 브랜치는 개발 중 절대 보이지 않으므로 이 차이가 곧 사고 유무다 |
| **V6** | availability를 `AuthorizationState`에 융합하고 `& { conclusive }`로 교차해도 narrowing이 사는가 | 3분기 유니언 × 교차 타입 × `Readonly<Record<Scope, ScopeStatus>>` | **산다.** 교차 전에는 `r.read`가 TS2339, `r.availability === 'available'` 이후에는 `r.read.heartRate`가 `ScopeStatus`(noUncheckedIndexedAccess에서도 `\| undefined`가 붙지 않는다), `r.conclusive`는 양쪽에서 읽힌다 |
| **V7** | B가 "미션의 `reset: boolean` 형태에서 멀어진다"며 포기한 판별 유니언의 실제 비용 | `{reset:true; resetReason:R} \| {reset:false}`에서 `const b: boolean = s.reset` | **비용 0.** 그대로 컴파일된다. 즉 미션 스케치와 **읽기 호환**이며 B의 §11-11 자기반론은 근거가 없다. `s.resetReason`은 narrowing 없이는 TS2339 |
| **V8** | `route`를 필수 `RoutePoint[] \| 'none'`으로 만들면 생략이 잡히는가 | `{ id: 'x' }`를 그 인터페이스에 대입 | **잡는다**(누락 프로퍼티). `route: pts`와 `route: 'none'` 둘 다 통과. f95의 "치명·조용함"이 **컴파일 에러**가 된다 — 세 안이 모두 "타입으로 못 막는다"고 적은 항목이다 |
| **V9** | 초/밀리초 혼동을 런타임으로 잡을 수 있는가 | `Date.now()`(2026-08-22)와 `new Date(1e11)` 계산 | **잡을 수 있다.** 오늘의 epoch-초 ≈ `1.787e9`, `1e11` ms = `1973-03-03T09:46:40Z`. 따라서 `0 < value < 1e11`은 "초를 밀리초 자리에 넣었다"와 정확히 동치이고, 실재하는 워크아웃(1973년 이전)은 존재하지 않는다 → `EPOCH_MS_FLOOR` |
| **V10** | A의 `./core`가 정말 "타입 전부 + 유틸"인가 | A §5.1의 export 전수 세기 | **런타임 값 4개**(`WorkoutsError`, `isWorkoutsError`, `WORKOUTS_ERROR_CODES`, `MAX_ROUTE_POINTS`)뿐. 미션 §4.1이 `./core` 내용으로 **명시한** haversine·고도상승·pause 파생·chunk 연결·활동 매핑표·커서 코덱이 전부 없다. A의 `./core`는 사실상 `.d.ts` 패키지다 → 복원(§5.2) |
| **V11** | B의 네이티브 seam이 B 자신의 프로토콜을 지탱하는가 | B §7.1 Swift 프로토콜·§7.2 Kotlin 인터페이스에서 `currentScopeFingerprint` 검색 | **없다.** B §7.3이 "네이티브가 구현하는 동기화 원시 연산 4개" 중 하나로 지목한 함수가 두 seam 어디에도 선언돼 있지 않다. `scopesChanged` reset은 출처 없는 상태였다 → §3에서 `grantedScopeFingerprint()`로 양 seam에 명시 |
| **V12** | C의 `devDependencies`가 C 자신의 가드를 돌릴 수 있는가 | C §2.3의 devDeps와 C §3.1·§5.6의 import 대조 | **못 돌린다.** `src/index.ts`가 `expo`에서 `requireOptionalNativeModule`을, `plugin/`이 `expo/config-plugins`에서 `ConfigPlugin`을 import하는데 devDeps에는 `expo-modules-core`뿐이다. `pnpm typecheck`와 대표 가드가 미해결 모듈에서 죽는다 → §2.3에 `expo: ~56.0.0` 고정 |
| **V13** | 모노레포 게이트가 네이티브 파일을 실제로 검사하는가 | `scripts/check-pack-contents.mjs` 정독 | **안 한다.** `declaredTargets()`는 `main`/`module`/`types`와 `exports` 맵만 순회한다. `ios/**`·`android/src/main/**`·`expo-module.config.json`·`app.plugin.js`·`plugin/build/**`는 **어느 검사에도 걸리지 않는다** → §10.1의 `requiredFiles`/`forbiddenFiles` 옵션 신설이 필요하다 |
| **V14** | 소비자 스모크 하네스가 `npx`를 돌릴 수 있는가 | `scripts/check-packed-expo-consumer.mjs`의 `nodeChecks` 구현 정독 | **못 돌린다.** `run(process.execPath, [...check.args], consumerDirectory)` — 실행 파일이 Node로 고정돼 있다. `npx expo-modules-autolinking resolve`와 `npx expo config --type introspect`는 Node 스크립트가 아니다 → §10.3의 가산적 `commandChecks` 필드가 필요하다 |
| **V15** | `expo-media` 선례의 순수성 가드가 소스인가 산출물인가 | `expo-media/tsconfig.core.json` 주석과 `tests/unit/guards/` 목록 확인 | **둘 다다.** 주석이 실측을 담고 있다: "src/core.ts에 `document.title`을 주입하면 TS2584/TS2304로 잡힌다. 같은 유출을 tsup은 전혀 잡지 못하고 dist/core.d.ts에 그대로 방출한다." 소스 가드 `nodom-source-guard`와 산출물 가드 `nodom-dist-guard`가 **둘 다** 존재한다. A·B는 산출물 가드를 빠뜨렸다(C만 `pure-dist-guard` 보유) |
| **V16** | 합성이 새로 만든 두 유니언이 실제로 컴파일되고 쓸 만한가 (자기 주장 재실측) | §5.2의 `SyncResult`(교차로 `added: readonly []`를 좁히는 형태)와 `SaveResult`(`Exclude<RouteWriteOutcome,'deferred'>`)를 그대로 컴파일 | **양쪽 다 통과.** `page.reset`은 `boolean`으로 읽히고, `page.added`는 유니언 상태에서도 `for..of`가 `Workout`을 주며 `.length`가 `number`다. `reset` narrowing 후 `resetReason`이 필수로 나오고, `s.nativeId`는 narrowing 전에 TS2339다. 즉 §5.2에 적은 시그니처는 스케치가 아니라 **컴파일되는 코드**다 |

### 0.4 기각 결정 (실측 근거 포함 — 재론 금지)

| # | 기각 대상 | 출처 | 기각 근거 |
|---|---|---|---|
| 1 | **`.`을 조건 포크 없이 두고 "Node에서 안전하다"고 주장** | A §2.3, B §2.3 | **V1 실측**: `expo`는 `exports`가 없고 `main`이 미전처리 `.ts`다. 순수 Node `require('expo')`가 즉시 throw한다. 두 안이 그 주장을 증명하겠다고 설계한 가드가 **가드 자신부터 실패한다**. 미션 §4.1은 Node를 명시적으로 요구한다 |
| 2 | **`syncWorkouts({ cursor, backfillFromMs })`** | B §0.2-2 | 미션 §4.2 입력 표면의 확대다(rename이 아니라 **필수 인자 신설**). 미션은 이미 `reset:true` → 호출자가 `listWorkouts`로 백필하는 모델을 고정했고, 갭 없음 증명은 두 형태에서 동일하게 성립한다(§4.4). B 자신도 §11-1에서 "설명해야만 이해되는 규칙"임을 인정했다 |
| 3 | **`listWorkouts`를 `AsyncIterable`로, 페이지 토큰 삭제** | A §5.2 | 정렬 보장이 문서에 없고 커서도 없어 **앱 실행을 넘는 백필을 재개할 수 없다**. A의 대안("창을 직접 자르라")은 정렬 보장 없이는 구현 불가능하다. A 자신이 §10-3에서 인정 |
| 4 | **`Workout.heartRate` / `Workout.steps` 삭제** | A §0 | A의 근거는 Android 예산이었으나 **C의 산술**이 그것을 반증한다 — 페이지 창당 메트릭 1회 읽기(채택 #15)면 페이지에 세션이 몇 개든 **2–6요청**이다(소유자 결정 ② 이후 — §8.4. 이 자리에 있던 "5–9"는 §8.4의 산술과 어긋나 있었고 함께 정정했다). A 자신의 Kotlin seam에 이미 `readMetricRecords(from,to,origin)`가 있어 **한계 비용이 0**이다. 게다가 idx f18: 오래된 iOS first-party 워크아웃의 심박은 series 샘플로 응축돼 있어 `readHeartRate` 재구성이 `statistics`와 **다른 값**을 준다 — 순수한 정보 손실이다 |
| 5 | **distance/energy provenance 태그 및 tier 3 삭제** | A §0 | RESULTS 205–206행이 tier 2 유지와 `predicateForObjects(from:)` provenance 조회를 **명령**한다. f74의 위험(tier 3이 무관한 999 m 반환)은 삭제가 아니라 **`'derived'` 태그**로 정확히 표현된다. 태그를 지우면 `distanceM`이 틀린 숫자를 담고 그 사실을 말할 방법이 사라진다 |
| 6 | **`storeLocked` · `cancelled` · `io` 코드 삭제** | A §4.2 | 사실 오적용. `storeLocked`의 출처는 f70이 아니라 **idx f24**(`errorDatabaseInaccessible`)이고 RESULTS 274행이 재시도 가능하게 설계하라고 지시한다. `cancelled`의 출처는 **idx f9**다. `io`의 출처는 **f64**이며 "즉시 폐기 후 typed error"라는 호출자 행동이 `busy`("나중에 재시도")와 다르다 |
| 7 | **`requestRouteAccess(id) → 'granted' \| 'unavailable'` 유지** | B §5.4, C §5.3 | **f111 + f114**: "Allow this route"는 일회성이고 `READ_EXERCISE_ROUTES`를 부여하지 않으며 그 호출이 곧 경로를 반환한다. 두 안이 JSDoc에 적은 `'granted'` 직후 `getRoute()` 흐름은 **다이얼로그를 다시 띄우거나 실패한다**. C의 표 11행("다음 `getRoute`가 성공")은 어떤 Phase 0 측정도 뒷받침하지 않는다 |
| 8 | **iOS에도 `MAX_ROUTE_POINTS = 20 000` 적용** | A §5.1, C §5.4 | **f77**: HealthKit은 36 000포인트를 누수 없이 저장·스트리밍한다. RESULTS 232행은 가드를 **Kotlin에** 두라고 지정했고, Phase 0 잔존 항목은 48 B/point 상수를 "계약이 아니라 안전 마진"이라 부른다. C 스스로 §14-3에서 "첫 소비자의 흔한 8시간 등산이 상한을 넘는다"고 인정했다 |
| 9 | **Kotlin seam에 `aggregate()` 유지 (폴백 경로)** | C §3.3, §4.2 | **f109**: 모든 지표에 null, 온보딩 전후 동일, 방금 자기가 쓴 레코드에도 동일, 예외 없음. 두 경로를 유지하면 같은 창이 기기마다 다른 숫자를 낸다. C는 §15에서 "readRecords가 폴백이 아니라 필수 경로"라고 쓰면서 §4.2에서는 "aggregate 1 + null이면 폴백 1"이라 적었다 — 자기 모순이다 |
| 10 | **`readSteps`가 "알 수 없으면 `notAuthorized`를 던진다"** | C §5.3 | iOS에서 **도달 불가능한 계약**이다(idx f14 — 읽기 거부와 빈 데이터가 구분 불가, C 자신의 `ScopeState` JSDoc도 그렇게 적었다). 게다가 f109는 null aggregate의 원인이 **불명**이라고 못 박았는데 C는 원인을 지어냈다. → 권한을 가진 사용자를 고칠 수 없는 설정 화면으로 보낸다 |
| 11 | **`AuthorizationState.advice` 필드** | C §5.1 | Google이 온보딩이나 권한 UI를 바꾸면 **원시 사실이었다면 틀리지 않았을 방식으로** 틀린다(C §14-12 자인). 순수 함수 `authorizationAdvice(facts)`는 채택하되(#27) 계약에 박지 않는다 |
| 12 | **iOS `history: 'granted'` 편의 보고** | C §6.2 | 사용자가 준 적 없는 승인을 보고하는 필드다. 감사 로그가 읽는 유일한 필드이므로 거짓말 비용이 크다. iOS `history`는 **`'unknown'`**이다("이 플랫폼에 벽이 없다"는 README가 말한다) |
| 13 | **`collectRoute()` 미제공** | A §9 | f78이 근거로 든 26배는 **whole-array read**의 비용이고, `collectRoute`는 이미 청크로 온 것을 이어붙일 뿐이라 네이티브 피크에 영향이 없다. 미션 §4.1이 `./core` 내용으로 "chunk concatenation"을 **명시**한다(V10) |
| 14 | **커서·페이지 토큰 브랜드 타입** | 세 안 공통 검토 | expo-media §0.4 기각 6·14 계승. 커서는 소비자의 SQLite를 왕복하므로 required 브랜드는 **읽어올 때마다 캐스팅**을 강요하고, 그 캐스팅이 브랜드가 막으려던 오용을 통과시킨다. 런타임 매직 2종(`gjw1.` / `gjp1.`)이 같은 보호를 비용 0으로 준다 |
| 15 | **iOS 루트 sync id에 `#<version>` 부착** | B §0.2-10 | f68이 측정한 것은 **서로 다른 워크아웃 간** sync id 재사용의 교차 연결이다. 워크아웃별 파생(`"<id>/route"`, RESULTS 198행)이 이미 그것을 막는다. 버전 접미사는 B의 추론을 측정된 요구사항처럼 제시한 것이고, 매 버전마다 루트 객체를 새로 만들고 이전 것을 명시 삭제하는 비용만 추가한다 |
| 16 | **`Workout.version` 공개** | B §0.2-15 | 호출자는 `version`을 **자기 레코드의 `updatedAt`에서** 만들지 저장소에서 읽지 않는다. `staleVersion`은 "네 것을 올려라"를 뜻하지 "저장된 숫자를 알려달라"가 아니다. 원시값은 `platformData.android.clientRecordVersion` / `platformData.ios.syncVersion`에 이미 있다 |
| 17 | **`RemovedWorkout.replacedById`** | B §3.6 | `reconcileSyncPage()`가 같은 페이지의 `added`에서 동일 `clientId`를 찾아 rekey를 도출한다 — 필드 없이 성립한다(§5.2) |
| 18 | **`isRetryableWorkoutsError(e)`** | C §13-9 | `io`가 재시도 대상인지는 소비자 정책이지 우리의 사실이 아니다. §5.5의 표를 README와 JSDoc에 싣는다 |
| 19 | **`readHeartRate` 결과의 `source` 필드** | 세 안 공통 기각 유지 | 소비자는 `Platform.OS`에서 파생한다(브리핑 §2). 다중 소스 문제는 `(t, bpm)` 중복 제거로 흡수하고 §11에 정직하게 남긴다 |
| 20 | **백그라운드 관찰자 / `READ_HEALTH_DATA_IN_BACKGROUND`** | D12 | 그리고 **f113**: 그 권한은 외부 루트를 열어주지 않는다. 붙였다면 반쪽 약속이었다 |
| 21 | **`LocalDateTime` 오버로드 / 로컬 하루 창** | 세 안 공통 | **f108**: 로컬 컬럼은 **레코드 자신의** 저장된 offset이라 같은 레코드가 다른 날에 들어간다. Kotlin 소스 가드가 문자열로 금지한다 |
| 22 | **`chunkSize` / `pageSize` / `pace` / `verifyWrite` 옵션** | 세 안 공통 | f78(1000), f116(50–100), f102(1000/5000), f93·f94(read-back)가 각각 값을 결정했다. 방어할 수 없는 노브는 결함이다. **`verifyWrite`는 2026-08-22 소유자 결정 ④로 최종 확정 기각** — §12-④는 닫혔다 |
| 23 | **`getWorkout(id)` 단건 조회 신설** | 심사 (a) 교차 발견 5 | 소비자는 언제나 `Workout.startMs`를 자기 저장소에 갖고 있으므로 좁은 창의 `listWorkouts`로 표현 가능하다. Android의 `DeletionChange`/`UpsertionChange`가 준 bare recordId는 **우리 내부**에서 `readRecord(id)`로 해소하며 공개 표면에 나올 일이 없다(§4.6) |

---

## 1. 설계 원칙

1. **프로토콜은 순수 TypeScript다.** 커서 코덱·버저닝·reset 분류, `added`/`removed` 정합, `replaced` 해석, 루트 위생, 크기 추정, 에러 매핑, 레이트 예산, DTO→`Workout` 정규화가 전부 `src/core/**`에 있다. 네이티브는 **원시 연산만** 구현한다(§3). 조용히 깨질 수 있는 유일한 것(동기화 갭)이 Node에서 fuzz된다.
2. **`./testing`은 API가 아니라 네이티브 seam을 페이크한다.** 그래야 페이크 위에서 도는 것이 진짜 JS 계층이다(채택 #23). API 레벨 페이크는 그 위에 조립된 **부산물**이지 별도 구현이 아니다.
3. **한 상태에는 한 표현만 둔다.** 경로 접근의 진실은 `Workout.routeState` 하나이고 매 읽기마다 재계산한다(f114 — 절대 캐시 금지). 커서 개념은 동기화 커서와 페이지 토큰 둘뿐이며 매직이 다르다.
4. **`undefined`는 "모름"이고 `0`이 아니다.** f109가 강제한다. 공개 optional 필드는 전부 `?: T | undefined`(모노레포 EOP 규약).
5. **모르는 것은 모른다고 말한다.** iOS 읽기 권한(idx f14), 루트가 없는지 못 보는지(f112의 null 5종), HK 삭제 기록의 purge(idx f17), Health Connect 온보딩 여부(f115) — 없는 확실성을 지어내지 않는다.
6. **`.` 임포트는 절대 던지지 않는다 — 구조적으로.** 런타임 `try/require`가 아니라 exports 조건 포크로 비네이티브 그래프에 `expo`가 **들어가지 않게** 한다(V1 실측). "던지지 않기를 바란다"가 아니라 "던질 코드가 그래프에 없다"로 만든다.
7. **닫힌 유니언은 1.x 동안 닫혀 있다.** `WorkoutsErrorCode`(14) · `WorkoutKind`(**9**) · `Scope`(**7**) · `ScopeStatus`(4) · `RouteState`(3) · `RouteAccess`(3) · `Availability['status']`(3) · `SaveResult['status']`(2) · `CursorResetReason`(6). 확장은 major다. 이것이 `assertNever*` 헬퍼를 정직하게 만드는 유일한 조건이다.
   ⚠ **`WorkoutKind`와 `Scope`의 수는 2026-08-22 소유자 결정 ③·②로 5→9, 4→7로 바뀌었다.** 이 두 유니언은 **0.x 동안만** 열려 있고 1.0.0에서 잠긴다 — 채택 #29의 (a)(b)(c) 규칙이 정본이다.
8. **공개 표면에 좌표·건강값·원문 네이티브 문자열은 없다.** 에러 `message`는 우리가 쓴 영어 문장뿐이고, 플랫폼 원문은 고정 템플릿으로 만든 `nativeMessage`와 표준 `cause`로만 간다. 소스 스캔 가드가 강제한다(§9.3).

---

## 2. 모듈 구조와 exports 맵

### 2.1 디렉토리 트리

> **개수 정본 (문서 전체가 이 두 수를 쓴다)**
> **공개 서브패스 = 4** (`.` · `./core` · `./testing` · `./plugin`)
> **tsup 엔트리 = 4** = 공개 3(`index` · `core` · `testing`) + 조건 포크 1(`index.unsupported`). `./plugin`은 tsup이 아니라 `tsc`(CJS)가 만든다.
> `index.unsupported`는 exports 맵의 `node`/`browser` 브랜치 타깃일 뿐 **서브패스가 아니다** — 소비자가 `@gj-kit/expo-workouts/unsupported`로 import할 수 없다(expo-media §2.1 선례).

```
expo-workouts/                          # @gj-kit/expo-workouts
├─ package.json                         # ★ "type": "module" 없음 (§2.4-A). 런타임 의존성 0
├─ expo-module.config.json              # platforms ["ios","android"]  (granular ios — idx f7)
├─ app.plugin.js                        # 순수 CJS: module.exports = require('./plugin/build')
├─ tsup.config.ts                       # entry 4, splitting:false
├─ tsconfig.json                        # 빌드·dts 정본 — lib:["ES2022"] (이 패키지엔 DOM 구현이 없다)
├─ tsconfig.core.json                   # 순수성 소스 가드 (§2.4-B)
├─ tsconfig.tests.json
├─ plugin/                              # config plugin 소스(tsc, CJS) + __tests__ (introspect 스냅샷)
├─ scripts/                             # check-readme.mjs · stamp/check-provenance.mjs
├─ src/
│  ├─ core.ts                           # "./core" 배럴 — peer 0
│  ├─ index.ts                          # "." 네이티브 브랜치 = createWorkoutsApi(nativeWorkouts)
│  ├─ index.unsupported.ts              # "." node/browser 브랜치 = createWorkoutsApi(null)
│  ├─ native.ts                         # ★ 패키지 전체에서 유일한 `expo` import (가드가 1건임을 단언)
│  ├─ testing.ts                        # "./testing" — 네이티브 seam의 인메모리 구현
│  ├─ plugin-types.ts                   # "./plugin" — props 타입만, peer 0
│  └─ core/
│     ├─ types.ts                       # Workout · RoutePoint · WorkoutWrite · Authorization* · …
│     ├─ errors.ts                      # WorkoutsError(Symbol.for 태그) + 코드 14종
│     ├─ native-contract.ts             # NativeWorkoutsModule — 순수 타입. testing이 이걸 구현한다
│     ├─ api.ts                         # ★ createWorkoutsApi(native) — 함수 12종의 유일한 구현
│     ├─ mapErrors.ts                   # ERR_WORKOUTS_* + 네이티브 페이로드 → 공개 code (순수 표)
│     ├─ activity.ts                    # kind ↔ HKWorkoutActivityType / HC exerciseType (양방향, §8.3)
│     ├─ time.ts                        # 창 검증 · EPOCH_MS_FLOOR · activeDurationS · utcOffsetMin
│     ├─ route.ts                       # 위생 · sentinel 정리 · haversine · 고도상승 · pause 파생 · collectRoute
│     ├─ size.ts                        # estimateAndroidRecordBytes (f100 공식) + MAX_ANDROID_ROUTE_POINTS
│     ├─ budget.ts                      # ReadBudget — 슬라이딩 윈도, Clock 주입 (채택 #24)
│     ├─ authorization.ts               # ScopeStatus 도출 규칙 · authorizationAdvice
│     └─ sync/
│        ├─ cursor.ts                   # 코덱 + 버저닝(내부) + describeCursor(공개)
│        └─ reduce.ts                   # reduceSyncPage(내부) + reconcileSyncPage(공개)
├─ ios/                                 # GjKitWorkouts.podspec (:ios 16.4, HealthKit, PrivacyInfo.xcprivacy), Swift
├─ android/                             # build.gradle (minSdk 26, connect-client:1.1.0), src/main/AndroidManifest.xml, Kotlin
├─ example/                             # dev-client 앱 + maestro/*.yaml (팩 제외)
└─ tests/
   ├─ unit/ · types/ · guards/
   └─ fixtures/
      ├─ sync-scenarios.json            # ★ TS · XCTest · JUnit가 공유하는 단일 시나리오 표 (§9.4)
      ├─ route-vectors.json             # ★ 루트 위생·크기 골든 벡터, 3개 언어 공유 (§9.4)
      └─ expo-consumer/ · expo-consumer-57/
```

### 2.2 엔트리별 peer 표 (정본 — `dist-peer-graph` 가드가 이 표와 산출물을 대조한다)

| 엔트리 | 내용 | 정적 import하는 peer | 대표 소비자 |
|---|---|---|---|
| `"./core"` | 공개 타입 전부 · `WorkoutsError`(14코드)+가드 3종 · `NativeWorkoutsModule` 계약 · **`createWorkoutsApi`** · 활동 매핑표(양방향) · 시간/창 검증 · 루트 유틸 5종 · `estimateAndroidRecordBytes` · `ReadBudget` · `describeCursor` · `reconcileSyncPage` · `authorizationAdvice` · 상수 5종 | **없음** (`expo`·`react-native`·`expo-modules-core`·DOM lib 전부 0) | **medalmedal2의 NestJS/PostGIS 백엔드**가 API 페이로드 타입으로. Node 스크립트, 서버측 정규화, GPX 변환, gj-kit vitest, bare RN |
| `"."` (네이티브 브랜치) | `"./core"` 전체 재export + 함수 12종 + `workouts: WorkoutsApi` | **`expo`** (`src/native.ts` 1개소) | 개발 빌드를 쓰는 Expo 앱 (골든패스). **Expo Go 불가** — 단 import는 성공한다 |
| `"."` (node/browser 브랜치) | 동일 표면. `getAvailability()`는 `{unavailable, notSupported}`를 **resolve**, 나머지 11개는 `unavailable`로 reject | **없음** | web export, expo-router SSR/RSC, Node CI, vitest node 환경 |
| `"./testing"` | `createFakeNativeWorkouts()`(seam 페이크) + `createFakeWorkouts()`(그 위에 `createWorkoutsApi`를 조립한 편의 래퍼) + `drainSync()` | **없음** (`"./core"`만 import) | 소비 앱의 jest/vitest, 우리 unit 계층 |
| `"./plugin"` | `GjKitWorkoutsPluginProps` 타입만. **`ConfigPlugin`조차 재export하지 않는다** — `expo` 없이 `app.config.ts`가 타입 체크되어야 한다 | **없음** | `app.config.ts` |

**소비자 시나리오 검증표** (AGENTS.md §1의 "두 번째 소비자" 기준)

| 소비자 | 필요한 엔트리 | 개발 빌드 필요? | 설치 불필요 |
|---|---|---|---|
| medalmedal2 (HR 폴링 + T6 쓰기) | `.` | 예 | — |
| 남의 워크아웃을 지도에 그리는 import-only 앱 | `.` | 예 | — |
| 몇 년치를 당겨오는 스케줄 임포터 | `.` + `./core` | 예 | — |
| 서버/스크립트가 route를 GPX로 변환 | `./core` | **아니오** | `expo` 전부 |
| 웹 대시보드가 같은 타입으로 payload를 파싱 | `./core` | **아니오** | `expo` 전부 |
| 소비 앱의 파이프라인 테스트 | `./core` + `./testing` | **아니오** | `expo` 전부 |
| `app.config.ts` 타입 체크 | `./plugin` | — | `expo` 전부 |

**불변식**: `"./core"`·`"./testing"`·`"./plugin"`과 `"."`의 node/browser 브랜치는 `expo`·`react-native`·`expo-modules-core`를 **소스에서도 dist에서도** 참조하지 않는다. `"."`의 네이티브 브랜치가 정적 import하는 외부 specifier 집합은 정확히 `{ "expo" }`다. `"."`은 `"./testing"`을 import하지 않는다(단방향).

### 2.3 package.json exports (확정 형태)

```jsonc
{
  "name": "@gj-kit/expo-workouts",
  "version": "0.0.0",
  // ★ "type": "module" 없음 — §2.4-A. 따라서 .js = CJS, .mjs = ESM.
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "files": [
    "dist",
    "ios",
    "android/build.gradle",
    "android/src/main",
    "expo-module.config.json",
    "app.plugin.js",
    "plugin/build",
    "README.md", "CHANGELOG.md", "LICENSE"
  ],
  "publishConfig": { "access": "public" },
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      // 조건은 선언 순서대로 첫 매치가 이긴다. node/browser가 반드시 import/require보다 위.
      "node":    { "import":  { "types": "./dist/index.d.mts", "default": "./dist/index.unsupported.mjs" },
                   "require": { "types": "./dist/index.d.ts",  "default": "./dist/index.unsupported.js"  } },
      "browser": { "import":  { "types": "./dist/index.d.mts", "default": "./dist/index.unsupported.mjs" },
                   "require": { "types": "./dist/index.d.ts",  "default": "./dist/index.unsupported.js"  } },
      "import":  { "types": "./dist/index.d.mts", "default": "./dist/index.mjs" },
      "require": { "types": "./dist/index.d.ts",  "default": "./dist/index.js"  }
    },
    "./core":    { "import":  { "types": "./dist/core.d.mts",    "default": "./dist/core.mjs" },
                   "require": { "types": "./dist/core.d.ts",     "default": "./dist/core.js"  } },
    "./testing": { "import":  { "types": "./dist/testing.d.mts", "default": "./dist/testing.mjs" },
                   "require": { "types": "./dist/testing.d.ts",  "default": "./dist/testing.js"  } },
    "./plugin":  { "import":  { "types": "./dist/plugin.d.mts",  "default": "./dist/plugin.mjs" },
                   "require": { "types": "./dist/plugin.d.ts",   "default": "./dist/plugin.js"  } },
    "./package.json": "./package.json"
  },
  "peerDependencies": { "expo": ">=56.0.0 <58.0.0" },
  "peerDependenciesMeta": { "expo": { "optional": true } },
  "devDependencies": {
    "expo": "~56.0.0",              // ★ V12 — 없으면 typecheck와 플러그인 빌드가 미해결 모듈에서 죽는다
    "expo-modules-core": "~56.0.0"
  }
}
```

**exports 규칙 5개 (재론 금지)**

1. **bare `"react-native"` 조건 키 금지.** jest(`['require','react-native']`)와 Metro ios/android CJS에서 매치되어 ESM을 CJS 컨텍스트로 로드한다(expo-media §0.3 V2b 실측). `default`/`import`/`require`/`node`/`browser`만 쓴다.
2. **`node`와 `browser`가 둘 다, `import`/`require`보다 위.** `browser`만 두면 `web.output:"static"|"server"`의 SSR 번들이 조건 집합에 `browser`가 없어 네이티브 브랜치를 끌어온다(expo-media §8.2 케이스 H). `node`만 두면 jsdom·웹 번들이 새어나간다.
3. **모든 조건 브랜치에 `types`.** CJS TS 소비자(node16 해석)가 `d.ts` 없이 `TS1479`를 받는다.
4. **peer는 `expo` 하나, optional.** `./core`·`./testing`만 쓰는 Node 소비자에게 거짓 경고를 주지 않는다. optional은 "설치 안 해도 된다"이지 "범위 무시"가 아니다 — 범위(`>=56 <58`)는 여전히 강제된다.
5. **네이티브 브랜치는 조건 포크의 *fallthrough*다.** Metro의 조건 집합은 `['require','react-native']`(+`import`)이고 `node`/`browser`를 포함하지 않으므로 자동으로 `import`/`require` 브랜치 = 네이티브가 선택된다. 우리가 Metro를 특별히 다루는 코드는 어디에도 없다.

### 2.4 tsup / tsconfig 경계

**A. 이 패키지는 `"type": "module"`을 쓰지 않는다 — expo-media 선례에서 의도적 이탈.**

근거: T9(`app.plugin.js`가 `"type":"module"` 루트에서 로드되는가)가 **Phase 0에서 실행되지 않았다**(RESULTS T-표, 인덱스 §3 T9 행). ESM 루트에서 `.js` 플러그인 파일은 ESM으로 해석돼 `module.exports`가 죽는다(idx f6 pitfall 5). 미측정 위험을 안고 갈 이유가 없다. 결과:

- `.js` = CJS, `.mjs` = ESM (tsup 기본 산출), `app.plugin.js`는 **순수 CJS**.
- expo-media와 확장자 규약이 다르다는 사실을 README에 1줄 명시한다.
- **T9는 그래도 릴리스 게이트로 남는다**(§10.3-d) — 결정이 위험을 없앴을 뿐 검증을 대체하지 않는다.

**B. 순수성 가드 2종** (expo-media §2.4 V-A 실측 계승, **V15**에서 재확인: *tsup은 코어의 오염을 전혀 잡지 못하고 `dist/core.d.ts`에 그대로 방출한다*).

- **소스 레벨** — `tsconfig.core.json` (`lib: ["ES2022"]`, `include: ["src/core", "src/core.ts", "src/testing.ts", "src/plugin-types.ts", "src/index.unsupported.ts"]`)로 `tsc --noEmit`. 이것이 순수성 강제자다.
- **산출물 레벨** — `tests/guards/tsconfig.pure.json` (`lib: ["ES2022"]` + **`skipLibCheck: false`**)로 `dist/core.d.ts`·`dist/testing.d.ts`·`dist/plugin.d.ts`·`dist/index.unsupported.d.ts`를 **실제 컴파일**. `skipLibCheck:true`면 d.ts 내부 TS2304가 억제되어 가드가 무력해진다.

**C. tsup 설정**

```ts
// tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts', 'src/index.unsupported.ts', 'src/core.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true, sourcemap: true, clean: true,
  target: 'es2022', treeshake: true, platform: 'neutral',
  splitting: false,                                   // 엔트리 자기완결 = dist-peer-graph 단순화
  external: ['expo', 'expo-modules-core', 'react-native'],
});
```

`splitting:false`이므로 엔트리마다 코어가 복제된다 ⇒ `instanceof WorkoutsError`는 **반드시 깨진다**. `isWorkoutsError`는 `Symbol.for('gj-kit.workouts.error')` 태그로 판정한다(expo-media §5.2 확정 발견 계승). `tests/unit/errors.test.ts`가 **엔트리 사본 2개**를 실제로 로드해 교차 인식을 단언한다.

**D. 엔트리 export 패리티 가드 (신설).** `src/index.ts`와 `src/index.unsupported.ts`는 같은 심볼 집합을 내보내야 한다 — 한쪽에 함수를 추가하면 web/Node 호출자는 typed `unavailable`이 아니라 `undefined is not a function`을 받는다(심사 (c)가 지목한 C의 결함). 구현이 하나(`createWorkoutsApi`)이므로 차이는 구조분해 목록뿐이며, `export-parity-guard`가 두 `.d.ts`의 export 이름 집합을 대조한다.

---

## 3. 네이티브 seam

### 3.1 JS seam — `src/native.ts` (유일한 `expo` import 지점)

```ts
// src/native.ts — "." 네이티브 브랜치에서만 존재한다. index.unsupported.ts는 이 파일을 import하지 않는다.
import { requireOptionalNativeModule } from 'expo';
import type { NativeWorkoutsModule } from './core/native-contract';

/** null on Expo Go and on any runtime without the development build. Never throws at import time. */
export const nativeWorkouts: NativeWorkoutsModule | null =
  requireOptionalNativeModule<NativeWorkoutsModule>('GjKitWorkouts');
```

```ts
// src/index.ts                              // src/index.unsupported.ts
import { createWorkoutsApi } from './core';  import { createWorkoutsApi } from './core';
import { nativeWorkouts } from './native';
export * from './core';                      export * from './core';
export const workouts = createWorkoutsApi(nativeWorkouts);
                                             export const workouts = createWorkoutsApi(null);
export const { getAvailability, requestAuthorization, getAuthorizationState, listWorkouts,
  syncWorkouts, getRoute, readHeartRate, readSteps, saveWorkout, deleteWorkout,
  openSettings, openStoreListing } = workouts;          // ← 두 파일에서 동일한 목록
```

`createWorkoutsApi(null)`은 12개 함수를 전부 만들되 `getAvailability()`만 `{ status:'unavailable', reason:'notSupported' }`로 **resolve**하고 나머지는 `WorkoutsError('unavailable')`로 reject한다. **네이티브 유무가 갈리는 지점은 이 인자 하나**이며, 그래서 두 브랜치의 표면이 구조적으로 같다.

### 3.2 `NativeWorkoutsModule` — `./core`의 순수 타입 (`./testing`이 구현한다)

```ts
// src/core/native-contract.ts — 순수 타입. 여기에 있는 것만 네이티브가 구현한다.
// DTO는 전부 JSON-직렬화 가능한 평면 구조이며 플랫폼 타입이 하나도 넘어오지 않는다.
export interface NativeWorkoutsModule {
  // ── 가용성·인가 (데이터 읽기 예산을 소비하지 않는다) ──
  availability(): Promise<AvailabilityDto>;
  /** iOS: authorizationStatus(공유) + statusForAuthorizationRequest(시트 여부, idx f14).
   *  Android: getGrantedPermissions() + processImportance() + declaredPermissions().
   *  ★ Phase 3 추가 필드 `statuses?: Record<string,'granted'|'denied'|'undetermined'> | null` —
   *    iOS의 타입별 `authorizationStatus(for:)`를 우리 어휘로 접은 것. **share 쪽 사실만**이며
   *    이것이 없으면 iOS `write.*`가 영원히 `'undetermined'`라 설정 화면이 `openSettings()`를
   *    정직하게 권할 수 없다. Android는 `null`(방향이 권한 문자열에 이미 있다). */
  authorizationSnapshot(): Promise<AuthorizationSnapshotDto>;
  /** No internal timeout (f120, f122). Returns the raw before/after granted sets.
   *  ★ Phase 3 정정(결함 B, 실기에서 발견): 입력이 평평한 `readonly string[]`이 아니라
   *    **방향이 있는 두 집합**이다. */
  requestPermissions(request: PermissionRequestDto): Promise<PermissionOutcomeDto>;
  /** ★ V11 — B가 프로토콜의 원시 연산으로 지목했으나 어느 seam에도 없던 함수. */
  grantedScopeFingerprint(): Promise<string>;

  // ── 읽기 원시 연산 ──
  /** Start instant in [fromMs, toMs). iOS `.strictStartDate`, Android TimeRangeFilter.between(Instant,Instant). */
  readWorkoutPage(q: WindowDto & { pageSize: number; pageToken?: string }): Promise<WorkoutPageDto>;
  /** One call per metric type per PAGE WINDOW — never per session (§8.4). Never aggregate() (f109). */
  readMetricRecords(q: WindowDto & { type: MetricTypeDto; origins: readonly string[] }): Promise<MetricRowDto[]>;
  readHeartRateSamples(q: WindowDto): Promise<HeartRateDto[]>;
  /** iOS provenance discriminator required by RESULTS 206 / f71. */
  hasAssociatedSamples(nativeId: string, quantity: QuantityKindDto): Promise<boolean>;

  // ── 동기화 원시 연산 4종 (그 위의 전부가 순수 TS다) ──
  takeCheckpoint(): Promise<string>;
  drainCheckpoint(checkpoint: string, limit: number): Promise<DrainBatchDto>;

  // ── 루트: pull 기반 핸들 (for await의 break가 closeRoute로 매핑된다) ──
  openRoute(nativeId: string, consent: 'skip' | 'prompt'): Promise<RouteHandleDto>;
  readRouteChunk(handle: string, maxPoints: number): Promise<RoutePointDto[] | null>;
  closeRoute(handle: string): Promise<void>;

  // ── 쓰기 원시 연산 ──
  /** iOS: look the workout up by sync identifier BEFORE writing (idx f26 — an equal-version re-save
   *  mints a NEW uuid and orphans the previous samples/route). Android: null. */
  findBySyncIdentifier(clientId: string): Promise<ExistingWorkoutDto | null>;
  saveWorkout(spec: WorkoutWriteDto): Promise<SaveOutcomeDto>;   // 'saved' | 'pendingUnlock'
  /** Android only, ALWAYS called after a save (f93, f94). Metric records first — a session read-back
   *  eagerly materialises the route (f116). Returns null when nothing was found. */
  readBackVersion(clientId: string): Promise<number | null>;
  deleteWorkout(ref: DeleteRefDto): Promise<boolean>;

  // ── 플랫폼 통합 ──
  openSettings(): Promise<void>;
  openStoreListing(): Promise<void>;
}
```

**Phase 3 정정 — 결함 B (2026-08-22, example 앱을 실기에서 돌려 발견).**
`requestPermissions(request: readonly string[])`는 **iOS에서 표현력이 모자란 설계 결함**이었다.
Android는 방향이 권한 문자열 자체에 들어 있어(`READ_EXERCISE` vs `WRITE_EXERCISE`) 평평한 배열이
무손실이지만, iOS는 **같은 HealthKit 타입 식별자가 read와 share 양쪽을 가리키므로** 평평한 배열이
`HKHealthStore.requestAuthorization(toShare:read:)`가 요구하는 두 집합을 표현하지 못한다. iOS 레인은
그래서 이 멤버를 구현하지 않고 스텁으로 남겼고, 그것이 옳은 판단이었다.

```ts
export interface PermissionRequestDto {
  /** Android: `…health.READ_*`. iOS: `requestAuthorization(read:)`에 넘길 타입 식별자. */
  readonly read: readonly string[];
  /** Android: `…health.WRITE_*`. iOS: `toShare:`에 넘길 타입 식별자. */
  readonly write: readonly string[];
}
```

* **공개 계약은 바뀌지 않는다.** `requestAuthorization(request: AuthorizationRequest)`의 시그니처도
  `AuthorizationRequest`의 모양(`{ read, write?, history? }`)도 그대로다. 바뀐 것은 `./core`가 그것을
  플랫폼 문자열로 옮기는 **내부 seam**뿐이며, 그 번역은 `./core`의 순수 함수
  `iosRequestIdentifiers(request)` / `androidRequestPermissions(request)`가 한다.
* Android 구현은 두 리스트의 **합집합**을 contract 집합으로 쓴다 — `READ_EXERCISE_ROUTES`는 `./core`가
  애초에 넣지 않으므로 f110의 금지는 그대로 지켜진다.
* Kotlin 모듈은 `PermissionRequestRecord { read, write }`를 받고 `requested()`가 합집합을 준다.
  `HealthConnectGateway.requestPermissions(request: Set<String>)`는 **바뀌지 않았다**.

### 3.3 Swift — `HealthStoring` 프로토콜

```swift
// ios/GjKitWorkouts/HealthStoring.swift
// GjKitWorkoutsModule owns a `HealthStoring`; the default implementation wraps HKHealthStore and
// XCTest injects `InMemoryHealthStore`. No HealthKit type crosses this protocol — only Sendable structs.
protocol HealthStoring: Sendable {
  func isHealthDataAvailable() -> Bool
  func sharingStatus(for types: [String]) -> [String: Int]            // authorizationStatus(for:)
  func wouldPrompt(read: Set<String>, share: Set<String>) async throws -> Bool  // statusForAuthorizationRequest ONLY (idx f14)
  func requestAuthorization(read: Set<String>, share: Set<String>) async throws

  /// `.strictStartDate` ALWAYS — never the default overlap predicate, never `.strictStartDate + .strictEndDate` (f87).
  func readWorkoutWindow(_ q: WindowQueryDTO) async throws -> [WorkoutDTO]
  /// `anchor == nil` reads everything. Returns the NSKeyedArchiver base64 of the new anchor (idx f17).
  func drainWorkouts(anchor: String?, limit: Int) async throws -> AnchoredBatchDTO
  func routeSampleCount(workoutUUID: UUID) async throws -> Int
  /// RESULTS 206: tier 1 is `associated` only when this returns > 0; otherwise it is a synthesised `total` (f71).
  func hasAssociatedSamples(workoutUUID: UUID, quantity: QuantityKind) async throws -> Bool
  /// Tier 1 `statistics(for:)` → tier 2 deprecated totals (kept for older OS, f73) → tier 3 window statistics.
  func statistics(_ r: StatisticsRequestDTO) async throws -> StatisticsDTO
  func readHeartRateSamples(_ q: WindowQueryDTO) async throws -> [HeartRateDTO]

  // pull-based route streaming — 1000 points per chunk, convert-and-release, never accumulate [CLLocation] (f78)
  func openRoute(workoutUUID: UUID) async throws -> RouteHandle
  func readRouteChunk(_ h: RouteHandle, maxPoints: Int) async throws -> [RoutePointDTO]?
  func closeRoute(_ h: RouteHandle) async

  func findWorkout(syncIdentifier: String) async throws -> ExistingWorkoutDTO?
  func associatedSampleIds(workoutUUID: UUID) async throws -> [UUID]
  /// path B only. Returns `.pendingUnlock` for (nil workout, nil error) (idx f24, f70).
  func saveWorkout(_ w: WorkoutWriteDTO) async throws -> SaveOutcomeDTO
  func reattachSamples(_ ids: [UUID], toWorkout uuid: UUID) async throws
  /// Always a FRESH HKWorkoutRouteBuilder (f63). 1000-point inserts; ANY insert error aborts the route (f64).
  func attachRoute(workoutUUID: UUID, points: [RoutePointDTO], syncIdentifier: String, syncVersion: Int) async throws
  func deleteWorkoutAndAssociated(uuid: UUID) async throws -> Bool
  func isProtectedDataAvailable() -> Bool                             // storeLocked pre-check (idx f24)
}
```

모든 `AsyncFunction`은 **Swift-concurrency 오버로드**(`async throws` 본문)로 선언한다 — 클로저 스타일은 프로세스 전역 직렬 큐 `expo.modules.AsyncFunctionQueue`에서 돌아 36 000포인트 루트 읽기(1.1 s, f79)가 앱 전체를 막는다(idx f8). **`try!` 금지 · `.runOnQueue(.main)` 금지 · `seriesBuilder(for:)` 금지 · 시리즈 빌더에 대한 `discard()` 금지** — 전부 §9.3의 정적 소스 가드가 문자열로 강제한다(f64, f65).

### 3.4 Kotlin — `HealthConnectGateway` 인터페이스

```kotlin
// android/src/main/java/kit/gj/workouts/HealthConnectGateway.kt
// No androidx.health type crosses this interface — JUnit fakes it directly (Robolectric has no HC shadow, idx f56).
interface HealthConnectGateway {
  fun sdkStatus(): Int                                   // getSdkStatus ONLY — PackageManager is forbidden (f88)
  fun processImportance(): Int                           // foreground is a hard precondition for foreign routes (f113)
  fun declaredHealthPermissions(): Set<String>           // f112 — an undeclared READ_EXERCISE_ROUTES yields a silent null
  fun resolves(intentAction: String): Boolean            // every startActivity is resolve-guarded (f119)

  suspend fun grantedPermissions(): Set<String>          // the only truthful read of READ_EXERCISE_ROUTES (f110)
  suspend fun requestPermissions(request: Set<String>): PermissionOutcomeDto  // NO internal timeout (f120, f122)

  suspend fun readSessions(window: WindowDto, pageSize: Int, pageToken: String?): SessionPageDto
  suspend fun readSession(id: String): SessionDto?
  /** One call per metric type per PAGE WINDOW. `aggregate()` is never called anywhere (f109). */
  suspend fun readMetricRecords(type: MetricType, window: WindowDto, origins: Set<String>): List<MetricRowDto>
  suspend fun readHeartRateRecords(window: WindowDto): List<HeartRateRowDto>

  suspend fun changesToken(): String                     // ExerciseSessionRecord only
  suspend fun changes(token: String, pageSize: Int): ChangeBatchDto   // carries changesTokenExpired

  /** From the record's own `exerciseRouteResult` field — no extra call, no extra permission check (f118). */
  suspend fun inlineRoute(sessionId: String): RouteOutcomeDto
  /** Wraps ExerciseRouteRequestContract. MUST carry a 10 s timeout (f104) and MUST be serialised (f105). */
  suspend fun requestRouteConsent(sessionId: String, timeoutMs: Long): RouteOutcomeDto

  suspend fun insertWorkout(w: WorkoutWriteDto): InsertOutcomeDto
  /** The mandatory read-back (§8.5). Metric records first; the session last because it materialises the route (f116). */
  suspend fun readBackVersion(clientRecordId: String, type: MetricType?): Long?
  suspend fun deleteByClientRecordIds(type: MetricType?, ids: List<String>)
}
```

> **Phase 3 정정(결함 B) 반영 지점.** `HealthConnectGateway.requestPermissions(request: Set<String>)`는
> 그대로다 — Android는 방향이 문자열에 있어 합집합이 곧 요청이기 때문이다. 바뀐 것은 그 위의 모듈
> 선언뿐이다: `AsyncFunction("requestPermissions") Coroutine { request: PermissionRequestRecord -> … }`.
> Swift 쪽은 `HealthStoring.requestAuthorization(read:share:)`가 이미 두 집합을 받고 있었으므로
> **프로토콜은 손대지 않고** 모듈 선언만 `[String: [String]]`을 받도록 바뀐다.

> **Phase 3 정정 (Android 레인, 2026-08-22 · 구현하면서 드러난 표현 부족).** 위 인터페이스의 마지막
> 두 줄이 실제 구현에서 세 줄이 됐고, `MetricType?`이 새 열거형 `RecordType`으로 넓어졌다.
>
> ```kotlin
> suspend fun readBackVersion(clientRecordId: String, type: RecordType): Long?
> suspend fun deleteByClientRecordIds(type: RecordType, ids: List<String>)
> suspend fun deleteSessionsByRecordIds(ids: List<String>)   // 신설
> enum class RecordType { SESSION, DISTANCE, ACTIVE_ENERGY, ELEVATION, STEPS, HEART_RATE }
> ```
>
> 이유 셋, 전부 §8.5·§8.6이 이미 요구하던 것을 표현할 수 없었기 때문이다:
> 1. **`MetricType?`에는 심박이 없다.** `null = 세션` 규약으로는 §8.6이 요구하는 **6회 삭제**(세션 +
>    5종)를 표현할 수 없다 — `MetricType`은 `readMetricRecords`의 **읽기** 대상 4종이고 심박은 별도
>    seam 멤버다. 그 열거형에 심박을 넣으면 `readMetricRecords(HEART_RATE, …)`가 의미 없는 호출이
>    되므로, 쓰기·삭제 축에만 쓰이는 열거형을 따로 뒀다. "타입당 1회"라는 §8.6의 모양은 그대로다.
> 2. **`{ nativeId }` 삭제 경로에 세션-only 삭제가 필요하다.** 우리 패키지가 썼지만 우리
>    clientRecordId 규약이 아닌 세션(예: 이전 버전이 쓴 것)은 clientRecordId로 지울 수 없다. 그런
>    세션에는 우리 이름 규약으로 묶인 메트릭 레코드가 존재할 수 없으므로 고아도 생기지 않는다.
> 3. **read-back은 clientRecordId로 조회할 수 없다.** Health Connect에는 clientRecordId 질의가
>    **없다** — `readRecords`는 시간창, `readRecord`는 플랫폼 id다. Phase 0의 프로브는 40일 창을 읽어
>    클라이언트에서 걸렀는데, 그것을 §8.5-3의 **무조건** read-back에 쓰면 저장 1회마다 창 전수 스캔이
>    붙어 §8.4의 27배 예산 논증이 무너진다. 그래서 게이트웨이가 `insertRecords`가 **방금 돌려준**
>    `recordIdsList`를 clientRecordId -> 플랫폼 id로 기억하고 `readRecord`로 읽는다. 한계는 정직하게:
>    프로세스가 죽었다 살아나 read-back만 부르면 항목이 없어 `null`(= 확인 불가)이 된다. `./core`는
>    저장 **직후** 같은 프로세스에서 부르므로 실제 경로에서는 비지 않는다.

Android 액티비티 결과는 `RegisterActivityContracts { launcher = registerForActivityResult(...) }`로 등록하고 `suspend launch(input)`으로 대기한다(idx f9). 프로세스 사망 시 fallback 콜백이 동작하지 않는다는 문서화된 한계 때문에, 대기 중 액티비티가 소멸하면 promise를 반드시 **`cancelled`**로 정착시킨다.

### 3.5 `./testing`이 seam을 페이크하는 방식 (채택 #23의 실체)

```ts
// src/testing.ts
import { createWorkoutsApi, type NativeWorkoutsModule, type WorkoutsApi } from './core';

/** An in-memory NativeWorkoutsModule. This is what the tests drive; the real JS layer runs on top. */
export function createFakeNativeWorkouts(seed?: FakeSeed): FakeNativeWorkouts;

/** Convenience: `createWorkoutsApi(createFakeNativeWorkouts(seed))` plus the scenario controls. */
export function createFakeWorkouts(seed?: FakeSeed): FakeWorkouts;
```

이 배치가 심사 (c)의 교차 발견 1을 해소한다 — 세 설계안이 모두 `WorkoutsApi`를 페이크해 **DTO→`Workout` 정규화 · sentinel 정리(f83) · 에러 코드 매핑 · `AsyncIterable` 래퍼와 취소 · 사전 창 검증 · 레이트 예산**을 CI에서 우회했다. 여기서는 페이크 위에서 도는 것이 **`src/core/api.ts`의 진짜 코드**이므로, `pnpm test`가 프로덕션 경로를 실행한다. `createFakeWorkouts().api`와 `.`의 `workouts`는 **같은 팩토리의 산출물**이라 행동 동일성을 별도로 증명할 필요가 없다(심사 (c) 교차 발견 2의 구조적 해소).

---

## 4. 동기화 프로토콜 (정본)

### 4.1 한 문장 계약

> **`reset: true`는 언제나 "네가 넘긴 커서는 쓸모없다. 원하는 창을 `listWorkouts`로 다시 채우고, 내가 준 커서부터 계속하라"를 뜻한다.**

이 한 문장이 **초기 백필과 커서 만료를 같은 분기**로 만든다. 소비자의 동기화 루프에 분기가 하나뿐인 것이 이 프로토콜의 목표이고, 인덱스 §4가 지목한 기존 라이브러리 실패 클러스터("첫 호출이 아무것도 안 돌려주는데 이유를 설명하지 않는다", react-native-health-connect #243)를 **타입 안에서** 설명하는 방식이다.

### 4.2 커서 형식 (양 플랫폼)

```
cursor := "gjw" <formatVersion> "." <platformTag> "." <base64url(utf8(JSON))>
          예) gjw1.i.eyJrIjoi…
```

* `gjw` — 매직. 우리 커서임을 base64/JSON 디코드 **이전에** 판정한다. 미션의 "expired/invalid cursor → `reset:true`, never an exception"을 지키려면 적대적 입력이 파서에 먼저 닿아서는 안 된다.
* `<formatVersion>` — **우리** 포맷 버전(현재 `1`). 플랫폼 토큰의 버전이 아니다.
* `<platformTag>` — `i`(iOS) / `a`(Android).
* payload — base64url(패딩 없음) UTF-8 JSON. 소비자가 SQLite `TEXT`에 보관하므로 이스케이프가 필요 없어야 한다(브리핑 §2).

**payload v1** (키는 1글자 고정 — 커서 길이가 곧 저장 비용이다)

| 키 | 타입 | 뜻 |
|---|---|---|
| `k` | `string` | **체크포인트.** iOS: `NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)`의 base64(idx f17). Android: `getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))`가 준 토큰 문자열 |
| `g` | `string` | **granted scope 지문.** 정렬된 권한 문자열 목록의 FNV-1a 32bit를 base36으로(8자 이하). 순수 TS, 의존성 0 |
| `s` | `number` | 커서 발급 instant(epoch ms). 진단·`describeCursor` 용도 |

**페이지 토큰은 다른 매직을 쓴다.** `listWorkouts`의 `pageToken`은 `gjp1.<platformTag>.<payload>`다. 이름(`cursor` vs `pageToken`)과 매직이 **둘 다** 다르므로 서로 바꿔 넣으면 **양방향 안전 실패**한다 — 동기화 커서 자리에 페이지 토큰이 오면 매직 불일치 → `reset: true`(무해, 자가 치유), 페이지 토큰 자리에 동기화 커서가 오면 → `invalidArgument`(즉시 발각). 브랜드 타입이 필요 없는 이유다(§0.4 기각 14).

### 4.3 커서 포맷 버저닝 — 0.2.0에서 **우리가** 형식을 바꾸면

```ts
// src/core/sync/cursor.ts (내부)
export const CURSOR_FORMAT_VERSION = 1;
/** Every version this build can still READ. Shrinking this list is a BREAKING change. */
export const READABLE_CURSOR_VERSIONS: readonly number[] = [1];
```

규칙 3개:

1. **읽을 수 있거나, reset한다. 절대 throw하지 않는다.** 알 수 없는 버전(미래 버전 = 사용자가 앱을 롤백한 경우 포함)은 무조건 `reset: true` + `resetReason: 'formatUnsupported'`.
2. **가산적 변경은 순수 업그레이드 함수로 흡수한다.** 0.2.0이 필드를 추가하면 `CURSOR_FORMAT_VERSION = 2`, `READABLE_CURSOR_VERSIONS = [1, 2]`, 그리고 `upgradeCursorV1toV2(payload)`를 둔다. v1 커서는 업그레이드되어 **reset 없이** 계속 쓰인다. 이것이 기본 경로다 — 사용자가 앱을 업데이트했다고 전체 백필을 다시 하게 만들면 안 된다.
3. **체크포인트의 의미가 바뀌면 업그레이드 불가 → 무조건 reset.** 예: v2에서 Android changes token을 레코드 타입 2종으로 확장하면 v1 토큰은 다른 타입 집합을 가리키므로 업그레이드가 불가능하다. `READABLE_CURSOR_VERSIONS`에서 1을 빼고 **CHANGELOG에 "첫 동기화가 전체 백필로 돌아간다"를 breaking으로 명시**한다.

`READABLE_CURSOR_VERSIONS`를 줄이는 것은 AGENTS.md의 "default behavior" 항목에 해당하는 **공개 계약의 파괴적 변경**이다. 이 문장을 README와 CHANGELOG 정책에 박는다.

### 4.4 초기 백필과 갭 없음 증명

**순서 (양 플랫폼 동일, 호출자가 틀릴 수 없음)**

```
1. cursor = storage.load()                       // 없으면 null
2. r = await syncWorkouts(cursor)
3. if (r.reset) {
     // r.added / r.removed 는 비어 있다. r.cursor는 아무것도 읽기 전에 잡혔다.
     for (let t; ; ) { const p = await listWorkouts({ fromMs: horizon, toMs: Date.now(), pageToken: t });
                       commit(p.items); if (!(t = p.nextPageToken)) break; }
   }
4. commit(r.added, r.removed) 와 storage.save(r.cursor) 를 **한 트랜잭션으로**
5. if (r.hasMore) { cursor = r.cursor; goto 2 }
```

`syncWorkouts(null)`은 **아무것도 읽지 않는다**. 하는 일은 체크포인트를 잡는 것뿐이다:
- iOS — `HKAnchoredObjectQueryDescriptor(.workoutType(), predicate: nil, anchor: nil, limit: 0)`을 한 번 실행해 `newAnchor`만 취하고 결과를 버린다.
- Android — `getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))`.

반환은 `{ added: [], removed: [], cursor, hasMore: false, reset: true, resetReason: 'noCursor' }`다. **A안의 "iOS는 nil 앵커 쿼리를 네이티브에서 드레인한다"를 채택하지 않은 이유**: A 스스로 §10-4에서 가장 큰 미검증 베팅이라 인정했고, Phase 0가 큰 HealthKit 저장소를 한 번도 측정하지 않았다. `limit: 0` 앵커 취득은 데이터를 만들지 않으므로 그 비용이 존재하지 않는다.

**증명 (갭 없음 / 이중 계상은 무해)**

`A` = 시각 `T0`(체크포인트를 잡은 순간)에 헬스 스토어에 존재하는 워크아웃 집합, `W` = `[horizon, now)`(start instant 기준), 백필은 `T1 > T0`에 실행된다.

* 체크포인트는 `T0` **이후** 생성·수정·삭제된 모든 객체를 보고한다(HK 앵커 정의 idx f17, HC changes token 정의 idx f38).
* 백필은 `T1`에 **현존하는** 객체 중 start ∈ `W`인 것을 반환한다 = `(A ∩ W) ∪ {(T0,T1]에 생성됐고 start ∈ W} − {(T0,T1]에 삭제된 것}`.
* 따라서 `백필 ∪ 드레인 ⊇ (A ∩ W) ∪ {T0 이후 변경된 모든 것}`. **갭 없음.**
* `(T0, T1]`에 생성된 객체는 백필과 드레인 **양쪽**에 나타난다 → **`added`는 델타 append가 아니라 id 기준 idempotent upsert 집합이다.** 이것이 프로토콜의 **첫 번째 호출자 의무**이며, 이 의무 때문에 이중 계상이 무해하다.
* `(T0, T1]`에 삭제된 객체는 백필에 없고 드레인이 `removed`로 보고한다 → 호출자가 없는 행을 지우려 시도한다. **`remove(모르는 id)`는 no-op이어야 한다**(두 번째 호출자 의무). Android `DeletionChange`는 `recordId`뿐이라(f97) 우리가 그 id의 start instant를 모르므로 `removed`에는 지평선 필터를 **적용할 수 없다** — 모르는 id를 받는 것이 정상이다.
* **세 번째 호출자 의무**: `added`/`removed`의 적용과 `cursor`의 저장은 **한 트랜잭션**이어야 한다. 커서만 커밋되면 그 페이지의 워크아웃이 영구 유실되고 라이브러리가 막을 수 없다 → `./testing`의 `drainSync({ killAfterPages })`가 그 유실을 재현해 보여준다.

> ⚠ **증명의 전제가 무너지는 지점(정직하게)**: HealthKit은 삭제 기록을 **purge할 수 있다**(idx f17). purge된 삭제는 드레인에 나타나지 않으므로 워크아웃이 조용히 사라진다. 그래서 `removed`만으로 파괴적 로컬 동작(서버에서 활동 삭제 등)을 하지 말라는 문장을 README 상단에 둔다. **삭제를 권위 있게 만드는 것은 주기적인 `listWorkouts` 전체 재조회뿐이다.**

### 4.5 `reset: true`가 발화하는 정확한 조건 (전수 6종)

```ts
export type CursorResetReason =
  | 'noCursor'          // cursor === null — a fresh start
  | 'malformed'         // bad magic / bad base64url / bad JSON / failed shape validation
  | 'formatUnsupported' // magic ok, format version not in READABLE_CURSOR_VERSIONS (§4.3)
  | 'platformMismatch'  // minted on the other platform (server-synced cursor, device switch, restore)
  | 'expired'           // Android: ChangesResponse.changesTokenExpired === true (idx f38, 30-day idle)
  | 'scopesChanged';    // the granted-scope fingerprint differs from the one baked into the cursor
```

| 조건 | reason | 왜 예외가 아닌가 |
|---|---|---|
| `cursor === null` | `noCursor` | 신규 설치도 커서 만료와 **같은 정합 레시피**를 쓰게 하려는 것. 호출자 코드 경로가 하나가 된다 |
| 매직 불일치 / base64·JSON 실패 / shape 검증 실패 | `malformed` | 미션 §4.2: "Expired/invalid cursor → `reset: true`, never an exception". 파싱은 매직 검사 **뒤에만** 시도한다 |
| 포맷 버전이 읽을 수 없음(미래/폐기) | `formatUnsupported` | §4.3 |
| 플랫폼 태그 불일치 | `platformMismatch` | 서버에 커서를 보관하고 기기를 바꾼 사용자, 백업 복원 |
| HC `changesTokenExpired` | `expired` | idx f38 |
| granted scope 지문 변화 | `scopesChanged` | **A·C가 모두 놓친 실버그**: 사용자가 나중에 `steps`를 허용해도 이미 드레인된 워크아웃은 재방출되지 않아 영원히 `steps: undefined`로 남는다. 넓어지든 좁아지든 reset한다(좁아진 경우엔 더 이상 볼 권한이 없는 값을 저장소에서 걷어내야 한다). **소유자 결정 ②(Scope 7종 분할, 2026-08-22) 이후 이 사유의 중요성이 커졌다** — 이제 `distance`·`activeEnergy`·`elevation`도 나중에 허용될 수 있고, 그때 이 reset이 이미 동기화된 워크아웃의 `distanceM`을 채운다. 즉 §6.1-㉖의 읽기 함정은 **사용자가 한 번 다시 허용하면 자가 치유된다**. 지문은 scope 이름이 아니라 **권한 문자열**에 대한 것이므로 어휘 변경이 기존 커서를 무효화하지 않는다(§8.8) |
| **iOS 앵커를 healthd가 모름** | (해당 없음) | HK는 이 경우 에러 없이 전량을 `added`로 준다. 손실이 없으므로 `reset: false`로 정직하게 보고한다 |

**`reset: true`의 정확한 의미 (README·JSDoc 동일 문구)**

> `reset: true`는 "**당신이 이미 가진 id 중 그동안 삭제된 것이 있을 수 있고, 나는 어느 것인지 말해줄 수 없다**"는 뜻이다. 올바른 대응은 테이블을 비우는 것이 **아니라**, 이 플랫폼의 모든 로컬 행을 *미확인*으로 표시하고 → `listWorkouts` 백필과 `hasMore` 드레인을 완주하고 → 끝난 뒤에도 *미확인*인 행을 삭제하는 것이다. 테이블을 비우면 로컬 조인 데이터(서버 id·업로드 상태·메모)가 함께 사라진다.

**iOS의 한계 (정직하게)**: 사용자가 건강 앱 › 공유에서 읽기 토글을 끄거나 켠 것은 **감지할 수 없다**(idx f14). `scopesChanged`는 iOS에서 우리 `requestAuthorization`을 거친 변화(공유 상태 + 마지막 요청 집합)만 잡는다. 앱은 "다시 가져오기" 버튼으로 `syncWorkouts(null)`을 넘길 수 있어야 하며, README가 이를 **UI 요구사항으로 명시**한다.

### 4.6 `replaced` vs `removed` — 플랫폼별 정의

| 플랫폼 | 재저장이 어떻게 나타나는가 | `replaced` 도출 | 근거 |
|---|---|---|---|
| iOS | 같은 sync id로 재저장 → **새 UUID**. 앵커드 결과에 `deleted=[old]` + `added=[new]`가 **같은 배치**로 온다 | ① `HKDeletedObject.metadata[HKMetadataKeySyncIdentifier]`를 읽는다. 없으면 `false`(Apple Watch 워크아웃 등은 sync id가 없다) ② 같은 배치의 `added`에서 동일 sync id를 찾으면 `true` ③ 배치 경계에서 갈렸을 수 있으므로 sync id 술어로 1건 조회를 한 번 더 한다 ④ 그래도 없으면 `false` | idx f17, idx f26, idx f27 |
| Android | 업서트가 **같은 UUID를 재사용**하고 `UpsertionChange`만 낸다 — 삭제가 발생하지 않는다 | **항상 `false`.** 이것은 "모름"이 아니라 **정확히 옳다**: Android의 removal은 언제나 진짜 삭제다 | **f92, f93, f97** |

**같은 드레인에서 한 id가 `added`와 `removed`에 동시에 나오면 `removed`에서 뺀다.** f92가 측정한 대로 UUID는 삭제로 해제되지 않으므로, 동일 `clientRecordId`를 삭제한 뒤 재삽입하면 정확히 이 모양이 나온다. 이 정합은 순수 TS(`reduceSyncPage`)에서 하며 단위 테스트가 있다.

**알 수 없는 경우를 어떻게 말하는가**

| 상황 | 우리가 하는 말 | 근거 |
|---|---|---|
| HK 삭제 기록이 purge됨 | 아무 말도 하지 않는다(워크아웃이 조용히 사라짐) | idx f17 |
| Android 외부 앱이 삭제 후 다른 `clientRecordId`로 재삽입 | `removed{replaced:false}` + `added` 별건 — 실제로 두 연산이므로 정확 | f92 |
| iOS sync id 없는 워크아웃의 교체 | `removed{replaced:false}` + `added` 별건 | 정보 없음 |

### 4.7 자기 에코 정합 (`isOwn` / `clientId`)

기본 import 경로는 **아무것도 배제하지 않는다**(미션 §4.3). 그래야 쓰기 루프가 자기 에코를 보고 네이티브 id를 학습한다. Android 변경 로그는 자기 쓰기도 포함하므로 `dataOrigin.packageName`으로 **식별**하되(→ `isOwn`) **버리지는 않는다**. 그리고 `UpsertionChange`가 왔다는 것은 **무언가 바뀌었다는 증거가 되지 않는다**(f94) — 우리는 그 payload가 실어온 레코드를 정규화해 `added`에 넣을 뿐, "바뀌었다"고 주장하지 않는다.

**업서트 키 규칙 (README·JSDoc 동일 문구)**

> `isOwn === true && clientId != null` 이면 로컬 키는 **`clientId`**, 아니면 **`id`**.
> iOS는 업데이트 시 `id`가 바뀌고(idx f26) `clientId`는 안 바뀐다. Android는 둘 다 안 바뀐다(f92). 따라서 `clientId`가 자기 쓰기의 안정 키이고, 외부 워크아웃에는 `id`밖에 없다.

```
saveWorkout({ id:"X", version:1 })  →  { id:"X", nativeId:"UUID-1", status:'saved' }
syncWorkouts(c)                     →  added:[ { id:"UUID-1", clientId:"X", isOwn:true, … } ]
                                       ... 앱은 clientId="X"로 조인 → 중복 행을 만들지 않는다
saveWorkout({ id:"X", version:2 })  →  iOS: { nativeId:"UUID-2" }   Android: { nativeId:"UUID-1" }
syncWorkouts(c)                     →  iOS: removed:[{ id:"UUID-1", replaced:true }] + added:[{ id:"UUID-2", clientId:"X" }]
                                       Android: added:[{ id:"UUID-1", clientId:"X" }] (removal 없음)
```

> ⚠ 위 트레이스의 `saveWorkout({ id, version })`은 **키만 보여주는 축약**이다. 실제 `WorkoutWrite`는
> `kind`·`startMs`·`endMs`와 **필수 `route`**(`RoutePoint[]` 또는 `'none'`)를 반드시 포함한다 —
> 소유자 결정 ①(채택 #21). 생략은 컴파일 에러다(§6.3 ③).

`./core`가 이 마지막 한 줄을 함수로 제공한다 — `reconcileSyncPage()`가 `removed[].replaced === true`와 `added`의 동일 `clientId`를 맞춰 **rekey**로 분류한다(DELETE + INSERT가 아니라 기본키 UPDATE여야 로컬 조인 데이터가 살아남는다).

### 4.8 증분 동기화가 보고하지 않는 것 (불변식)

> `syncWorkouts`는 **워크아웃 객체**의 추가·교체·삭제를 전부 보고한다. 워크아웃 객체는 그대로인 채 **별도 메트릭 레코드만** 바뀐 경우(Android의 Distance/Calories 레코드 갱신, iOS의 사후 연관 샘플 추가)는 보고하지 않는다. 총계가 정확해야 하는 앱은 `listWorkouts`로 창을 재조회한다.

메트릭 레코드 타입을 changes token에 등록하지 않는 이유: (a) `DeletionChange`가 레코드 타입조차 주지 않으므로(f97) 메트릭 삭제는 해석 불가, (b) 메트릭 upsertion에서 세션으로 역참조하려면 "최대 세션 길이"라는 매직 상수가 필요, (c) 역참조 read가 f116의 루트 materialise를 매번 유발한다. 이것은 **두 플랫폼 모두의 구조적 한계**이며 우리가 흉내 내지 않는다.

---

## 5. 공개 API 전체 시그니처

### 5.1 `"./core"` — 도메인 타입

```ts
// ═══════════════ src/core/types.ts ═══════════════

/** The health store a workout came from. Also the discriminator of the `Workout` union. */
export type WorkoutsPlatform = 'ios' | 'android';

/**
 * D11, **as amended by the product owner on 2026-08-22** (the original D11 named five members:
 * running | walking | hiking | cycling | other — see the amendment record at the top of this
 * document, and the D11 row of the research index).
 *
 * Anything the platform reports that is not one of the eight named kinds collapses to `'other'`;
 * the raw value survives under `platformData` (iOS only — see below). CLOSED for 1.x (§1-7); a
 * member may still be added in 0.x as a MINOR, which breaks exhaustive switches (채택 #29).
 *
 * Every member maps to a NON-DEPRECATED constant on BOTH platforms, measured from the installed
 * iPhoneOS 26.5 SDK header and from `connect-client-1.1.0.aar` — the full table with raw integers
 * and evidence is §8.3.
 *
 * ⚠ `indoor` is STORED on iOS and DERIVED on Android. Health Connect's `ExerciseSessionRecord` has
 *   no indoor field, so `indoor` survives an Android round-trip only for the four kinds that have a
 *   constant PAIR (`running`, `cycling`, `swimming`, `rowing`). For `walking`, `hiking`, `strength`,
 *   `wheelchair` and `other` it is written nowhere on Android and reads back `undefined`. See §8.3.
 * ⚠ The escape hatch is asymmetric. On iOS an unmapped `HKWorkoutActivityType` arrives intact in
 *   `platformData.ios.activityTypeRaw`, so an app can recover it. On Android the value is already
 *   destroyed before it reaches us — Health Connect collapses any unmapped int to 0 on BOTH the read
 *   and the write IPC path (verified in `IntDefMappingsKt` bytecode), so
 *   `platformData.android.exerciseType` reads 0 and `'other'` is all the information that exists.
 */
export const WORKOUT_KINDS = [
  'running', 'walking', 'hiking', 'cycling',
  'swimming', 'rowing', 'strength', 'wheelchair',
  'other',
] as const;
export type WorkoutKind = (typeof WORKOUT_KINDS)[number];

/**
 * One authorization vocabulary for both platforms. Read calls have NO `include` flags —
 * capability is chosen once, at authorization time. CLOSED for 1.x.
 *
 * **Owner decision ② (2026-08-22) split this union from four members to seven** so the consuming
 * developer chooses the granularity rather than the library choosing it for them. Use
 * `WORKOUT_TOTALS_SCOPES` for the coarse form; name the members individually for the fine form.
 *
 * ⚠ **`'workouts'` no longer implies totals.** `read: ['workouts']` is valid code before and after
 *   this change and means something materially different after: ONE Android permission row instead
 *   of four, and `distanceM` / `activeEnergyKcal` / `elevationGainM` `undefined` on EVERY workout.
 *   Nothing in the type system catches a call site written under the old meaning — that is why this
 *   is the README's lead paragraph and not a footnote.
 *
 * Every metric on `Workout` now has exactly ONE scope that gates it. `heartRate` and `steps` already
 * worked this way; the split removes the last three exceptions rather than adding a concept.
 *
 * - `workouts`     — the exercise SESSION and its intrinsic fields only (id, kind, indoor, start/end,
 *                    activeDurationS, pauses, laps, source, utcOffsetMin).
 *                    iOS `HKObjectType.workoutType()` · Android READ_EXERCISE / WRITE_EXERCISE.
 * - `distance`     — gates `Workout.distanceM` + `distanceProvenance`.
 *                    iOS: **BOTH** `.distanceWalkingRunning` AND `.distanceCycling`, always both,
 *                    in both directions — a workout's activity is not knowable at authorization
 *                    time (§8.7). Android READ_DISTANCE / WRITE_DISTANCE.
 * - `activeEnergy` — gates `Workout.activeEnergyKcal` + `activeEnergyProvenance`.
 *                    iOS `.activeEnergyBurned` · Android READ_/WRITE_ACTIVE_CALORIES_BURNED.
 *                    Named `activeEnergy` and NOT `energy`: `TotalCaloriesBurnedRecord` is forbidden
 *                    as a fallback because it silently mixes in BMR (idx f37), and dropping the
 *                    qualifier here would be the one place the library abandons its own unit-in-the-
 *                    name rule.
 * - `elevation`    — gates `Workout.elevationGainM`. Android READ_/WRITE_ELEVATION_GAINED.
 *                    ⚠ iOS: the EMPTY set in both directions. `HKMetadataKeyElevationAscended` is
 *                    metadata ON the workout (§8.1 step 3, idx f58) and needs no HKObjectType, so on
 *                    iOS this scope ALIASES `workouts`: `read.elevation` is `'unknown'` like every
 *                    iOS read scope, and `write.elevation` mirrors `write.workouts`. This is the one
 *                    place in the model where two scopes are not independent on a platform, and it is
 *                    stated rather than hidden — `Record<Scope, ScopeStatus>` stays hole-free instead
 *                    of growing an `'inapplicable'` status.
 * - `routes`   read  → READ_EXERCISE_ROUTES — **manifest-declared, never requestable.** Asking for it is
 *                      neither an error nor a no-op: the returned state reports whether it is held.
 * - `routes`   write → WRITE_EXERCISE_ROUTE (singular) — note this is *read-affecting*: holding it keeps
 *                      your OWN routes readable, and losing both route scopes makes even your own routes
 *                      `consentRequired`.
 * - `heartRate` / `steps` → the READ_/WRITE_ pair for that type; each also gates its own top-level
 *                      read function (`readHeartRate` / `readSteps`).
 *
 * The full per-platform table, including the evidence grade of each Android permission string, is §8.8.
 */
export const SCOPES = [
  'workouts', 'distance', 'activeEnergy', 'elevation', 'routes', 'heartRate', 'steps',
] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * The coarse form of owner decision ②, in ONE token: the session plus every total the common
 * `Workout` model carries. Spread it in place —
 *
 * ```ts
 * await requestAuthorization({ read: [...WORKOUT_TOTALS_SCOPES, 'routes'] });
 * ```
 *
 * This is the recipe to copy unless you have a reason not to. Naming the members individually is the
 * NARROW case and should be a deliberate act.
 *
 * It DELIBERATELY EXCLUDES `'routes'`. A convenience constant must never hide a non-requestable scope
 * inside itself, or it lies about what the permission dialog will show (f110 / f121). Routes stay an
 * explicit, visible token at every call site.
 *
 * ⚠ **Spread it; do not `.concat()` it.** The tuple's `concat` is typed to its own four-member union,
 *   so `WORKOUT_TOTALS_SCOPES.concat('routes')` is a two-overload TS2769. And do not park it in an
 *   un-annotated intermediate: `const s = [...WORKOUT_TOTALS_SCOPES, 'routes']` infers `string[]` and
 *   fails at the use site with TS2322. Add `satisfies readonly Scope[]` if you need the variable.
 *   (Both measured; the inline spread — the only form shown in the README and the JSDoc — hits neither.)
 */
export const WORKOUT_TOTALS_SCOPES = [
  'workouts', 'distance', 'activeEnergy', 'elevation',
] as const satisfies readonly Scope[];

/**
 * - 'granted'      — proceed.
 * - 'denied'       — the user said no. `openSettings()`; asking again will not help.
 * - 'undetermined' — never asked, OR the last request was inconclusive. Call `requestAuthorization()`.
 * - 'unknown'      — unknowable by platform design. EVERY iOS read scope that has already been asked
 *                    about reports this, permanently. Proceed, and treat an empty result as ambiguous
 *                    rather than as "no data".
 * CLOSED for 1.x.
 */
export type ScopeStatus = 'granted' | 'denied' | 'undetermined' | 'unknown';

/**
 * Whether a GPS route can be read for a workout, RECOMPUTED ON EVERY READ.
 * Never cache this across app sessions: on Android an app can lose read access to routes it wrote
 * itself once both route scopes are revoked.
 *
 * - 'available'       — the route can be streamed with `getRoute()` right now.
 * - 'consentRequired' — a route EXISTS but is not readable. **Never collapse this to 'none'.**
 * - 'none'            — there is no route at all. On iOS this is also what a denied read looks like,
 *                       because HealthKit read denial is invisible by design.
 * CLOSED for 1.x.
 */
export type RouteState = 'available' | 'consentRequired' | 'none';

/**
 * How far route reads reach right now — AOSP's `getExerciseRouteReadAccessType`, measured as a
 * 13-row matrix.
 * - 'all'      — READ_EXERCISE_ROUTES held AND the app is in the foreground; every app's routes read inline.
 * - 'own'      — only routes this app wrote read inline.
 * - 'perRoute' — nothing reads inline; each route needs `getRoute(id, { consent: 'prompt' })`.
 *
 * ⚠ On iOS this is always 'all' and is NOT evidence of anything — read it together with
 *   `read.routes === 'unknown'`.
 * ⚠ On Android `'all'` does NOT guarantee a route read succeeds: Health Connect's first-run
 *   onboarding is an undocumented further precondition. `'all'` + `getRoute` throwing
 *   `consentRequired` is the signature of incomplete onboarding — send the user to `openSettings()`.
 * CLOSED for 1.x.
 */
export type RouteAccess = 'all' | 'own' | 'perRoute';

/**
 * Where a distance/energy number came from.
 * - 'associated' — summed from samples explicitly associated with the workout.
 * - 'total'      — a total the writer stated but did not back with samples (iOS legacy workouts).
 * - 'derived'    — summed over the workout's window from whatever samples were there.
 *                  **May include other sources**: a measured case returned 999 m of unrelated
 *                  standalone samples for a workout whose own total was 4321 m. Treat `derived` as a
 *                  hint, never as the workout's own number.
 */
export type MetricProvenance = 'associated' | 'total' | 'derived';

/** Opaque. Persist it verbatim; never parse, compare or construct one. */
export type WorkoutsSyncCursor = string;
/** Opaque, and NOT interchangeable with a sync cursor — the two carry different magic prefixes. */
export type WorkoutsPageToken = string;

/**
 * Epoch-ms half-open window. Everywhere in this library it means: the record's **START instant** in
 * `[fromMs, toMs)`. There is no overlap variant and no local-day variant — day bucketing is your job,
 * done afterwards from `utcOffsetMin`.
 *
 * Both bounds are validated against `EPOCH_MS_FLOOR`: a value in `(0, 1e11)` is rejected with
 * `invalidArgument` because it is a seconds timestamp in a milliseconds field.
 */
export interface TimeWindow {
  /** Inclusive. Epoch MILLISECONDS, integer. */
  readonly fromMs: number;
  /** EXCLUSIVE. Epoch MILLISECONDS, integer, > `fromMs`. */
  readonly toMs: number;
}

export interface Interval { readonly startMs: number; readonly endMs: number }
/** `auto` is true for platform-detected pauses (HK motionPaused / HC REST-flagged segments). */
export interface Pause extends Interval { readonly auto?: boolean | undefined }
export interface Lap extends Interval { readonly distanceM?: number | undefined }

export interface WorkoutSource {
  /** iOS bundle identifier / Android package name. Apple Watch first-party reads as `com.apple.health.<UUID>`. */
  readonly id: string;
  /** iOS only — Android's DataOrigin carries a package name and nothing else. */
  readonly name?: string | undefined;
  readonly version?: string | undefined;
  readonly deviceModel?: string | undefined;
}

export interface WorkoutHeartRateSummary {
  readonly avgBpm?: number | undefined;
  readonly minBpm?: number | undefined;
  readonly maxBpm?: number | undefined;
}

/** One heart-rate reading. The same shape on read and on write. */
export interface HeartRateSample {
  /** Epoch MILLISECONDS. */
  readonly t: number;
  /** Integer beats per minute, 1..300. Samples outside that range are dropped on write. */
  readonly bpm: number;
}

/**
 * One GPS fix. SI units, unit in the field name.
 *
 * Negative CoreLocation sentinels (`-1`) are mapped to `undefined` for `hAccM`, `vAccM`, `speedMps`
 * and `courseDeg`; an explicit `0` is PRESERVED as `0`, because HealthKit preserves it.
 * `altM` is passed through verbatim — a negative altitude is a legal value (Dead Sea), not a
 * sentinel; `vAccM` is the actual validity flag for it.
 */
export interface RoutePoint {
  /** Epoch MILLISECONDS. Strictly increasing after our normalisation. */
  readonly t: number;
  /** WGS84 degrees, -90..90. Out of range is `invalidArgument` on BOTH platforms. */
  readonly lat: number;
  /** WGS84 degrees, -180..180. */
  readonly lon: number;
  readonly altM?: number | undefined;
  /** Horizontal accuracy, metres. */
  readonly hAccM?: number | undefined;
  /** Vertical accuracy, metres. */
  readonly vAccM?: number | undefined;
  /** iOS only — Health Connect's `ExerciseRoute.Location` has no speed field. */
  readonly speedMps?: number | undefined;
  /** iOS only. */
  readonly courseDeg?: number | undefined;
}

/** Raw iOS values the common model deliberately does not model. */
export interface IosWorkoutData {
  /** Raw HKWorkoutActivityType — the escape hatch for everything D11 collapses into 'other'. */
  readonly activityTypeRaw: number;
  readonly bundleIdentifier: string;
  readonly productType?: string | undefined;
  readonly osVersion?: string | undefined;
  /** IANA identifier from HKMetadataKeyTimeZone, present only when the writer supplied one. */
  readonly timeZoneId?: string | undefined;
  readonly elevationDescendedM?: number | undefined;
  /** `(endMs - startMs) / 1000`. Differs from `activeDurationS`, which honours the writer's own
   *  `duration` argument — a measured workout reported 1500 s active against 1800 s elapsed. */
  readonly wallClockS: number;
  readonly syncIdentifier?: string | undefined;
  readonly syncVersion?: number | undefined;
  /** Number of HKWorkoutActivity entries (multi-sport workouts). */
  readonly activityCount: number;
  /** Whether the HKIndoorWorkout metadata key was present — the only honest indoor discriminator. */
  readonly hasIndoorMetadataKey: boolean;
  readonly routeSampleCount: number;
}

/** Raw Android values the common model deliberately does not model. */
export interface AndroidWorkoutData {
  /** Raw ExerciseSessionRecord.exerciseType. */
  readonly exerciseType: number;
  readonly packageName: string;
  readonly recordingMethod: number;
  readonly deviceType?: number | undefined;
  /**
   * The writer's own client record id. Foreign apps' values ARE visible here — treat it as PUBLIC
   * data, never as a private namespace.
   */
  readonly clientRecordId?: string | undefined;
  readonly clientRecordVersion?: number | undefined;
  readonly endUtcOffsetMin?: number | undefined;
  /** Foreign-app authored text. This library never writes a title or notes. */
  readonly title?: string | undefined;
  readonly notes?: string | undefined;
  /** Every segment, including REST (44), which `pauses` deliberately excludes. PAUSE is 39. */
  readonly segments: readonly { readonly type: number; readonly startMs: number; readonly endMs: number }[];
}

/** The fields both platforms share. Never used directly — see `Workout`. */
export interface WorkoutBase {
  /** The PLATFORM id: HKWorkout.uuid / ExerciseSessionRecord.metadata.id. Pass this to `getRoute`. */
  readonly id: string;
  /**
   * The id the WRITING app used (HKMetadataKeySyncIdentifier / clientRecordId), when present.
   * For your own workouts this is exactly the `WorkoutWrite.id` you passed. It is the STABLE upsert
   * key for own writes: on iOS `id` changes when a workout is replaced while `clientId` does not.
   * It is visible cross-app, so never put anything sensitive in it.
   */
  readonly clientId?: string | undefined;
  /** True when this app wrote it. Nothing is filtered on your behalf — the sync loop needs to see
   *  its own echo to reconcile native ids. Filter on this yourself. */
  readonly isOwn: boolean;
  readonly kind: WorkoutKind;
  /**
   * `undefined` when the platform cannot tell. iOS raw `locationType` 3 means "outdoor OR unknown",
   * so an absent HKIndoorWorkout metadata key leaves this undefined rather than `false`.
   *
   * ⚠ **Platform-asymmetric, by construction.** On iOS this is STORED (an HKIndoorWorkout metadata
   *   key orthogonal to the activity type), so it round-trips for every `kind`. On Android it is
   *   DERIVED from `exerciseType` alone, so it survives only for the four kinds with a constant pair
   *   (`running`, `cycling`, `swimming`, `rowing`) and reads back `undefined` for `walking`,
   *   `hiking`, `strength`, `wheelchair` and `other`. `indoor: true` on a hike round-trips on iOS and
   *   vanishes on Android. On the four PAIRED kinds the opposite rounding happens: `indoor:
   *   undefined` normalizes to `false` after an Android round-trip, because RUNNING / BIKING /
   *   ROWING / SWIMMING_OPEN_WATER all positively mean "not indoor". Both directions are asserted by
   *   the §9.4 round-trip test so neither looks like a bug. Table: §8.3.
   */
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  readonly endMs: number;
  /**
   * Active seconds. iOS: the store's own `duration`, which honours the writer's explicit value and
   * can differ from `endMs - startMs`. Android: `(endMs - startMs)` minus every PAUSE segment.
   * On iOS this may NOT equal `endMs - startMs - Σ pauses`.
   */
  readonly activeDurationS: number;
  /** Minutes east of UTC at the workout's start. Use this for day bucketing. */
  readonly utcOffsetMin?: number | undefined;
  readonly source: WorkoutSource;
  /**
   * Metres. `undefined` means UNKNOWN — never 0.
   * ⚠ **Populated only when the `'distance'` read scope is granted.** With `read: ['workouts']`
   *   alone this field is `undefined` on EVERY workout. `unpopulatedWorkoutMetrics(state)` (§5.2)
   *   answers "which fields can never be filled with the permissions I hold" without a device.
   */
  readonly distanceM?: number | undefined;
  readonly distanceProvenance?: MetricProvenance | undefined;
  /**
   * Active kcal, never total/BMR-inclusive. `undefined` means UNKNOWN — never 0.
   * ⚠ Populated only when the `'activeEnergy'` read scope is granted.
   */
  readonly activeEnergyKcal?: number | undefined;
  readonly activeEnergyProvenance?: MetricProvenance | undefined;
  /**
   * Metres of cumulative ascent. ⚠ Populated only when the `'elevation'` read scope is granted.
   * On iOS that scope maps to the EMPTY HealthKit set and therefore aliases `'workouts'`.
   */
  readonly elevationGainM?: number | undefined;
  /** ⚠ Populated only when the `'heartRate'` read scope is granted. */
  readonly heartRate?: WorkoutHeartRateSummary | undefined;
  /** ⚠ Populated only when the `'steps'` read scope is granted. */
  readonly steps?: number | undefined;
  /** Explicit pause segments only. */
  readonly pauses: readonly Pause[];
  readonly laps: readonly Lap[];
  readonly routeState: RouteState;
  readonly lastModifiedMs?: number | undefined;
}

export interface IosWorkout extends WorkoutBase {
  readonly platform: 'ios';
  readonly platformData: IosWorkoutData;
}
export interface AndroidWorkout extends WorkoutBase {
  readonly platform: 'android';
  readonly platformData: AndroidWorkoutData;
}
/** Discriminated by `platform` — `if (w.platform === 'ios')` narrows `platformData` with ZERO casts. */
export type Workout = IosWorkout | AndroidWorkout;
```

> **`Workout`을 최상위 유니언으로 올린 이유 (V4 실측).** `platform`을 `platformData`의 형제 필드로 두면 `if (w.platform === 'ios') w.platformData.activityTypeRaw`가 **TS2339**로 실패한다 — 소비자가 `as IosWorkoutData`를 쓰게 되고, 그것이 바로 이 필드가 막으려던 것이다. 미션 §4.2의 "`platformData` (discriminated by `platform`)"는 이 형태를 뜻한다.

### 5.2 `"./core"` — I/O 타입 · 인가 · 순수 유틸

```ts
// ═══════════════ src/core/authorization.ts ═══════════════

export type Availability =
  | { readonly status: 'available' }
  | { readonly status: 'unavailable'; readonly reason: 'platformTooOld' | 'notSupported' }
  /** Android 9–13 without the Play Health Connect provider. Pair with `openStoreListing()`. */
  | { readonly status: 'updateRequired' };

export interface AuthorizationRequest {
  /**
   * Coarse form — one token, and the recipe to copy:
   * `read: [...WORKOUT_TOTALS_SCOPES, 'routes']`.
   * Fine form — name the members: `read: ['workouts', 'heartRate']`.
   *
   * ⚠ A metric scope without `'workouts'` is `invalidArgument`. `read: ['distance']` alone is a
   *   100 % mistake — no API in this library reads distance except through a workout — so `./core`
   *   rejects it before any platform call, with the existing error code and no new knob. This is the
   *   MIRROR of the read trap, not a defence against it; the defence is
   *   `unpopulatedWorkoutMetrics()`.
   */
  readonly read: readonly Scope[];
  readonly write?: readonly Scope[] | undefined;
  /**
   * D10, opt-in. Android only. Without it, reads are walled to the last 30 days and a wider window
   * throws `historyRequired`. It ALSO needs the config-plugin `history: true` prop; requesting it
   * without the manifest entry throws `invalidArgument` naming the missing prop.
   */
  readonly history?: boolean | undefined;
}

/**
 * Availability and authorization fused into ONE union. Reading a scope's status on a platform that
 * has no usable health store is **unrepresentable** rather than merely discouraged.
 */
export type AuthorizationState =
  | { readonly availability: 'unavailable'; readonly reason: 'platformTooOld' | 'notSupported' }
  | { readonly availability: 'updateRequired' }
  | {
      readonly availability: 'available';
      /** Every scope is always present — no `undefined` holes to guard. */
      readonly read: Readonly<Record<Scope, ScopeStatus>>;
      readonly write: Readonly<Record<Scope, ScopeStatus>>;
      /** Android READ_HEALTH_DATA_HISTORY. Always `'unknown'` on iOS — that platform has no wall,
       *  and reporting a grant the user never gave would be a lying field. */
      readonly history: ScopeStatus;
      readonly routeAccess: RouteAccess;
    };

/**
 * `requestAuthorization`'s result: the state afterwards, plus whether we can attribute it to the user.
 * `conclusive: false` means the OS returned an answer we cannot attribute — on Android, bouncing off
 * Health Connect's first-run onboarding with "Go back" returns an EMPTY permission set after ~20 s,
 * byte-identical to denying everything. Treat it as "ask again later", NEVER as denial.
 */
export type AuthorizationResult = AuthorizationState & { readonly conclusive: boolean };

/** What a settings screen should do next. */
export type AuthorizationAdvice =
  | 'ready' | 'requestable' | 'openSettings' | 'openStoreListing' | 'unsupported';

/** Input for the pure derivation, so a second consumer can re-derive it from facts it stored earlier. */
export interface AuthorizationFacts {
  readonly state: AuthorizationState;
  /** The scopes THIS screen actually needs — may be narrower than everything the build declares. */
  readonly requiredRead: readonly Scope[];
  readonly requiredWrite?: readonly Scope[] | undefined;
  readonly requiresHistory?: boolean | undefined;
}

/**
 * Our opinion about what a settings screen should render, as a PURE function rather than a field on
 * `AuthorizationState`: if the platform's permission UI changes, an opinion baked into the contract
 * would be wrong in a way the raw facts would not have been. Adopt it or re-implement it.
 *
 * The one rule that matters: `'unknown'` NEVER produces `'openSettings'`. Every iOS read scope is
 * permanently `'unknown'`, so treating it as a problem would show every iOS user "go check Settings"
 * forever.
 */
export function authorizationAdvice(facts: AuthorizationFacts): AuthorizationAdvice;

// ── the two scope derivations owner decision ② made necessary (채택 #33) ──────────────────────
// Neither is an option, a field on AuthorizationState, or a new error code. Both are pure `./core`.

/**
 * The single table that ties every optional `Workout` metric to the ONE scope that gates it. The
 * `satisfies` clause is a live guard, not decoration: a key that is not a `WorkoutBase` field and a
 * value that is not a `Scope` are BOTH compile errors (measured — TS2353 / TS2322), so this table
 * cannot drift away from `Workout` or from `Scope`.
 *
 * `routeState` is deliberately absent: it is per-workout and recomputed on every read (§1-3, f114),
 * so it can never be answered from an `AuthorizationState` snapshot.
 */
export const WORKOUT_METRIC_SCOPES = {
  distanceM: 'distance',
  activeEnergyKcal: 'activeEnergy',
  elevationGainM: 'elevation',
  heartRate: 'heartRate',
  steps: 'steps',
} as const satisfies { readonly [K in keyof WorkoutBase]?: Scope };

export type WorkoutMetricField = keyof typeof WORKOUT_METRIC_SCOPES;

/**
 * READ-side answer to "why is this field `undefined` on every workout?", without a device.
 *
 * Returns the `Workout` FIELD names — not scope names — whose gating read scope is `'denied'` or
 * `'undetermined'`. `'undetermined'` is the load-bearing half: it is the exact shape of the
 * `read: ['workouts']` trap (never asked), and an implementation that only looked for `'denied'`
 * would miss the trap entirely.
 *
 * It returns ONLY what we positively know, honouring §1-5:
 * - `'unknown'` NEVER produces an accusation, so on iOS this always returns `[]` — every iOS read
 *   scope is permanently `'unknown'` and that meaning stays undiluted.
 * - On an unavailable / updateRequired platform it returns `[]`.
 *
 * Why not fold it into `authorizationAdvice()`: advice answers "what should this settings SCREEN do
 * next" and returns ONE verdict from a closed five-value union (채택 #27). Making it also carry
 * field-level detail turns its return type into a record and destroys that contract, and a
 * partially-granted state would have to collapse to a single advice value — which is precisely the
 * compound-scope lie the split exists to remove. The two COMPOSE: advice drives the button,
 * this drives the empty-field explanation.
 */
export function unpopulatedWorkoutMetrics(
  state: AuthorizationState,
): readonly WorkoutMetricField[];

/**
 * WRITE-side pre-flight. Derives, from the fields a `WorkoutWrite` ACTUALLY CARRIES, which write
 * scopes its single `insertRecords` transaction will need (§8.5). A workout with no `distanceM`
 * needs no `'distance'` scope, so nothing is over-demanded.
 *
 * `saveWorkout` calls this BEFORE touching the store and throws `notAuthorized` naming the missing
 * scope. Without it, owner decision ②'s split would ship a hard REGRESSION: under the coarse model
 * `write: ['workouts']` granted all four Android write permissions, and under the split it grants
 * only WRITE_EXERCISE — so the whole transaction would fail with a SecurityException and the workout
 * would not be saved at all.
 *
 * `'routes'` is the documented exception and is NEVER a throw: a missing route scope stays the
 * established non-fatal path (`SaveResult.route === 'notPermitted'`, with the f95 re-save warning
 * intact).
 *
 * Measured shapes: a bare `{ …, route: 'none' }` ⇒ `['workouts']`; a fully-populated workout with
 * `steps: 0` ⇒ `['workouts','distance','activeEnergy','elevation','heartRate','routes']` — `'steps'`
 * correctly absent, because §8.5 / idx f44 never writes a zero-step record.
 *
 * Bonus, and the reason this is not merely Android bookkeeping: it converts iOS's opaque XPC error
 * for a missing share type (idx f29) into the same named error. The split FIXES a pre-existing
 * silent failure on both platforms.
 */
export function requiredWriteScopes(workout: WorkoutWrite): readonly Scope[];

// ═══════════════ src/core/io-types.ts ═══════════════

export interface ListQuery extends TimeWindow {
  /** From a previous page's `nextPageToken`. **NOT a sync cursor** — the two carry different magic. */
  readonly pageToken?: WorkoutsPageToken | undefined;
}

export interface WorkoutPage {
  /** DESCENDING by start instant — most recent first. The order is part of the contract, because it
   *  is what makes a multi-launch backfill resumable. */
  readonly items: readonly Workout[];
  /** Absent = last page. */
  readonly nextPageToken?: WorkoutsPageToken | undefined;
}

export interface RemovedWorkout {
  readonly id: string;
  /**
   * `true` only with POSITIVE evidence that the same logical workout still exists under a different
   * native id. **Always `false` on Android** — an upsert there keeps the same deterministic UUID, so
   * a deletion means genuinely gone.
   *
   * `false` does NOT mean "definitely and permanently deleted": HealthKit may purge deletion records
   * before we ever see them, so a workout can vanish with no `removed` entry at all.
   */
  readonly replaced: boolean;
}

export interface SyncPage {
  /**
   * An idempotent UPSERT SET keyed by `id` (or by `clientId` for own writes — §4.7), never a delta
   * append. The same workout may legitimately appear in two consecutive results.
   * Health Connect emits an upsertion change even for a write that changed nothing, so the presence
   * of a workout here is not a claim that it changed.
   */
  readonly added: readonly Workout[];
  /** May contain ids this app never held. `remove(unknown id)` MUST be a no-op. */
  readonly removed: readonly RemovedWorkout[];
  /**
   * Persist this together with `added`/`removed` **IN ONE TRANSACTION**. Persisting the cursor
   * without the items loses those workouts permanently and the library cannot prevent it.
   */
  readonly cursor: WorkoutsSyncCursor;
  /** `true` = call `syncWorkouts(result.cursor)` again immediately. */
  readonly hasMore: boolean;
}

/**
 * Discriminated on `reset`, so `resetReason` is unreachable without narrowing and unforgettable when
 * present. `const b: boolean = result.reset` still compiles, so this stays read-compatible with the
 * mission's `reset: boolean` sketch at every call site (measured — §0.3 V7).
 */
export type SyncResult =
  | (SyncPage & { readonly reset: false })
  | (SyncPage & {
      readonly added: readonly [];
      readonly removed: readonly [];
      readonly hasMore: false;
      readonly reset: true;
      readonly resetReason: CursorResetReason;
    });

export type CursorResetReason =
  | 'noCursor' | 'malformed' | 'formatUnsupported'
  | 'platformMismatch' | 'expired' | 'scopesChanged';

export interface StepTotal {
  /**
   * Steps in the window. `0` is a real answer.
   * When several apps wrote steps over the window this is the LARGEST SINGLE-`dataOrigin` total, not
   * the sum — a phone + watch device is never double-counted. It will therefore disagree with the
   * number Health Connect's own UI shows, which merges by an app-priority list we cannot read.
   * On iOS a denied read scope is indistinguishable from no data, so `0` can also mean "not granted";
   * `read.steps === 'unknown'` is the signal for that and this field does not duplicate it.
   */
  readonly count: number;
}

/** Identify a workout without ambiguity. Two id spaces exist and both are UUIDs, so no runtime
 *  heuristic can tell them apart — the type makes the choice unmissable and costs the caller nothing.
 *  The `?: never` members are load-bearing: a bare `{a} | {b}` union ACCEPTS both keys together. */
export type WorkoutRef =
  /** The platform id from `Workout.id`. */
  | { readonly nativeId: string; readonly clientId?: never }
  /** Your own `WorkoutWrite.id`. */
  | { readonly clientId: string; readonly nativeId?: never };

export interface DeleteResult {
  /** `false` for an id that was not there. Deleting something absent is never an error. */
  readonly deleted: boolean;
}

export interface GetRouteOptions {
  /**
   * What to do when `routeState === 'consentRequired'` (Android only — HealthKit has no per-route consent).
   * - `'skip'` (default) — throw `consentRequired`. Never shows UI, never blocks.
   * - `'prompt'`         — show the platform's per-route dialog and, if the user allows, stream the
   *   route from that same call. Can block for tens of seconds, so it must be driven by an explicit
   *   user gesture. Only one prompt may be in flight per process; a concurrent call throws `busy`.
   */
  readonly consent?: 'skip' | 'prompt' | undefined;
}

/**
 * Full-state input for `saveWorkout`. There is NO partial-update path: on Android an upsert that
 * omits the route DELETES the stored route, so the only safe contract is "send everything".
 */
export interface WorkoutWrite {
  /**
   * A stable id this app owns — the idempotency key. Becomes HKMetadataKeySyncIdentifier /
   * Health Connect `clientRecordId`.
   * ⚠ Other apps CAN read this value on Android. Never put a token, an email address or anything
   *   else sensitive in it. Use an opaque UUID.
   * Must match `/^[A-Za-z0-9._:-]{1,120}$/`.
   */
  readonly id: string;
  /**
   * A safe integer >= 1, non-decreasing per `id`, that increases whenever the content changes.
   * Derive it from your own record's `updatedAt` (epoch ms) or from an edit counter.
   * ⚠ NEVER `Date.now()` at call time: a crash retry would write a fresh version and, on iOS, mint a
   *   second workout object and orphan the first one's samples and route.
   * An EQUAL version replaces the stored workout; a LOWER one throws `staleVersion` and writes nothing.
   */
  readonly version: number;
  /**
   * Nine members since owner decision ③ / the D11 amendment of 2026-08-22. `'other'` is the
   * documented lossy sink — it stores OTHER_WORKOUT(0) / `.other`(3000) and the original activity is
   * not recoverable.
   */
  readonly kind: WorkoutKind;
  /**
   * Drives the platform activity constant on write — see the mapping table in §8.3.
   * ⚠ On Android it is only representable for `running`, `cycling`, `swimming` and `rowing` (the
   *   kinds with a constant PAIR); for every other kind it is silently dropped and reads back
   *   `undefined`. On iOS it is written to `HKMetadataKeyIndoorWorkout` for every kind — but only
   *   when you actually set it: leaving it `undefined` OMITS the key rather than writing `@NO`, so
   *   the read side can keep telling "outdoor" and "unknown" apart (f76).
   */
  readonly indoor?: boolean | undefined;
  readonly startMs: number;
  /** Must be > `startMs` and <= now. */
  readonly endMs: number;
  readonly utcOffsetMin?: number | undefined;
  /** IANA zone id (e.g. `'Asia/Seoul'`). iOS metadata only; an offset alone can never resolve to a
   *  zone, so the key is omitted when this is absent. Android stores only the offset. */
  readonly timeZoneId?: string | undefined;
  readonly pauses?: readonly Pause[] | undefined;
  readonly laps?: readonly Lap[] | undefined;
  readonly distanceM?: number | undefined;
  readonly activeEnergyKcal?: number | undefined;
  readonly elevationGainM?: number | undefined;
  /** Omitted from the write when <= 0 — Health Connect throws on `StepsRecord(count = 0)`. */
  readonly steps?: number | undefined;
  /** Samples outside 1..300 bpm or outside `[startMs, endMs)` are dropped before writing. */
  readonly heartRate?: readonly HeartRateSample[] | undefined;
  /**
   * REQUIRED, and `'none'` is not the same call shape as an empty array.
   *
   * ⚠ This is the one place where forgetting a field DESTROYS user data: an Android upsert that omits
   *   the route while holding the route write scope DELETES the stored route. Making the field
   *   required turns that silent, irreversible mistake into a compile error, and `'none'` forces the
   *   intent to be stated out loud.
   * An empty array is `invalidArgument` — say `'none'`.
   */
  readonly route: readonly RoutePoint[] | 'none';
}

/**
 * What happened to `route`.
 *  - 'stored'       — written and readable.
 *  - 'none'         — you passed `'none'`.
 *  - 'dropped'      — you passed points but NOTHING survived hygiene; the workout was still saved.
 *  - 'notPermitted' — Android: WRITE_EXERCISE_ROUTE is not granted; the workout was still saved.
 *                     ⚠ On a re-save this means the previously stored route is now GONE.
 *  - 'deferred'     — `status === 'pendingUnlock'`; the retry will attach it.
 */
export type RouteWriteOutcome = 'stored' | 'none' | 'dropped' | 'notPermitted' | 'deferred';

/**
 * A discriminated union, so `nativeId` does not EXIST on the `pendingUnlock` branch. That branch only
 * ever appears on a locked device, i.e. never during development, so a type that merely made
 * `nativeId` optional would be forgotten by everyone (measured — §0.3 V5).
 */
export type SaveResult =
  | {
      readonly status: 'saved';
      /** Echo of `WorkoutWrite.id`. */
      readonly id: string;
      /** The platform's own id for the stored workout. */
      readonly nativeId: string;
      readonly route: Exclude<RouteWriteOutcome, 'deferred'>;
      /** How many points actually reached the store. Compare it against what you sent to see how much
       *  our mandatory hygiene removed — there is no other way to know, because we own 100 % of it. */
      readonly routePointsWritten: number;
    }
  | {
      /**
       * The store accepted the workout but cannot confirm it while the device is locked.
       * **Do not re-save blindly.** Call `saveWorkout` again with the SAME `id` and `version` once the
       * device is unlocked; that call is idempotent and completes the route.
       * ⚠ Source-only behaviour — Phase 0 could not reproduce a locked device.
       */
      readonly status: 'pendingUnlock';
      readonly id: string;
      readonly route: 'deferred';
      readonly routePointsWritten: 0;
    };

// ═══════════════ src/core/api.ts ═══════════════

/** Every function of `.`, as one interface. `.`'s `workouts` and `./testing`'s `api` are both
 *  instances of it, produced by the SAME factory. */
export interface WorkoutsApi {
  getAvailability(): Promise<Availability>;
  requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult>;
  getAuthorizationState(): Promise<AuthorizationState>;
  listWorkouts(query: ListQuery): Promise<WorkoutPage>;
  syncWorkouts(cursor: WorkoutsSyncCursor | null): Promise<SyncResult>;
  getRoute(workoutId: string, options?: GetRouteOptions): AsyncIterable<readonly RoutePoint[]>;
  readHeartRate(window: TimeWindow): Promise<readonly HeartRateSample[]>;
  readSteps(window: TimeWindow): Promise<StepTotal>;
  saveWorkout(workout: WorkoutWrite): Promise<SaveResult>;
  deleteWorkout(ref: WorkoutRef): Promise<DeleteResult>;
  openSettings(): Promise<void>;
  openStoreListing(): Promise<void>;
}

/**
 * The ONLY implementation of the twelve functions. `.` calls it with the native module,
 * `index.unsupported` with `null`, and `./testing` with an in-memory fake of the same seam — so the
 * JS layer that normalises DTOs, cleans sentinels, maps error codes, wraps the route stream, paces
 * reads and validates windows is the SAME code in all three, and `pnpm test` exercises it.
 *
 * With `native === null` every function rejects with `unavailable` except `getAvailability()`, which
 * resolves to `{ status: 'unavailable', reason: 'notSupported' }`.
 */
export function createWorkoutsApi(
  native: NativeWorkoutsModule | null,
  options?: { readonly now?: () => number },
): WorkoutsApi;

// ═══════════════ src/core/constants.ts ═══════════════

/**
 * The largest route this library will write **on Android**. Health Connect's record ceiling is
 * exactly 1 000 000 bytes at `160 + 48·points + 2·chars + 24·(segments+laps)` (20 828 points OK /
 * 20 829 FAIL, and the optional point fields are FREE). 20 000 leaves ~40 KB of headroom for a
 * Mainline encoding change.
 *
 * ⚠ This guard does NOT run on iOS. HealthKit was measured storing and streaming a 36 000-point route
 *   with no leak and no ceiling, and Phase 0 itself calls the byte model "a safety margin, not a
 *   contract". Discarding a user's 8-hour 1 Hz hike on iOS to mirror an Android parcel limit is not
 *   defensible. Portability-conscious apps call `estimateAndroidRecordBytes()` themselves.
 */
export const MAX_ANDROID_ROUTE_POINTS = 20_000;

/** 24 h. `readHeartRate` refuses wider windows so one call cannot return an unbounded array.
 *  ⚠ This bounds the WINDOW, not the density: a 1 Hz watch still returns ~86 400 samples. */
export const MAX_HEART_RATE_WINDOW_MS = 86_400_000;

/** 30 days in ms — Health Connect's history wall without READ_HEALTH_DATA_HISTORY (D10). */
export const ANDROID_HISTORY_WINDOW_MS = 2_592_000_000;

/**
 * Every epoch-millisecond input in this library is validated against this floor.
 * `1e11` ms is 1973-03-03. A "now" expressed in SECONDS is ~1.79e9, which is far below it, while no
 * real workout predates 1973 — so `0 < value < EPOCH_MS_FLOOR` is exactly the seconds-in-a-
 * milliseconds-field mistake and nothing else. It is rejected with `invalidArgument`.
 * This is the one unit accident types cannot catch and the library therefore catches at runtime.
 */
export const EPOCH_MS_FLOOR = 100_000_000_000;

// ═══════════════ src/core/route.ts · size.ts · time.ts · activity.ts ═══════════════

/** Concatenate a `getRoute()` stream into one array. Convenience only: a 36 000-point route costs
 *  ~15 MB of JS heap, which is why the stream is the default and this is the opt-in. */
export function collectRoute(chunks: AsyncIterable<readonly RoutePoint[]>): Promise<RoutePoint[]>;

/** Great-circle length of a route, metres. Ignores altitude. */
export function routeDistanceM(points: readonly RoutePoint[]): number;

/** Cumulative ascent, metres, with hysteresis: only rises of at least `minRiseM` count.
 *  Required on purpose — "what counts as a climb" differs between hiking and cycling apps and there
 *  is no defensible default. */
export function routeElevationGainM(points: readonly RoutePoint[], minRiseM: number): number;

/** Gaps of at least `minGapMs` between consecutive points, as pauses. `minGapMs` is required. */
export function derivePauses(points: readonly RoutePoint[], minGapMs: number): Pause[];

/**
 * Apply the write-side hygiene the library performs, so you can see what will happen before you call
 * `saveWorkout`. Throws `invalidArgument` for out-of-range coordinates. The rules and their order are
 * in §8.2 and are driven by a shared golden-vector fixture that also drives the Swift and Kotlin tests.
 */
export function normalizeRouteForWrite(
  points: readonly RoutePoint[],
  window: Interval,
): readonly RoutePoint[];

/**
 * Exact Health Connect record-size model, fitted with residual 0 over six failure samples:
 *   `bytes = 160 + 48·routePoints + 2·(title + notes + clientRecordId chars) + 24·(segments + laps)`
 * The optional route fields are FREE — a 21 000-point route serialises to the byte-identical size
 * with and without altitude and accuracies.
 * ⚠ One Mainline build's parcel encoding. A safety margin, not a contract.
 */
export function estimateAndroidRecordBytes(input: {
  readonly routePoints: number;
  readonly clientRecordIdLength: number;
  readonly titleLength?: number | undefined;
  readonly notesLength?: number | undefined;
  readonly segments?: number | undefined;
  readonly laps?: number | undefined;
}): number;

/** `(endMs - startMs - Σ pause overlap) / 1000`, clamped at 0.
 *  ⚠ This is how ANDROID derives it. iOS reports the store's own `duration`, which honours the
 *    writer's explicit argument and can differ; `Workout.activeDurationS` carries whichever the
 *    platform gave. */
export function activeDurationS(startMs: number, endMs: number, pauses: readonly Pause[]): number;

/**
 * Raw HKWorkoutActivityType → WorkoutKind + indoor. TOTAL over `number`: anything not in §8.3's
 * table — including negative, non-integer and huge values that only the JS boundary can produce —
 * returns `{ kind: 'other' }` with `indoor` left `undefined`.
 *
 * ⚠ **Nothing collapses on iOS.** `HKWorkoutActivityType` is a plain `NSUInteger`, so an unknown
 *   value (e.g. 16 = Elliptical, or a future 85) arrives intact and IS preserved in
 *   `platformData.ios.activityTypeRaw` — an app can recover it. Contrast
 *   `kindFromAndroidExerciseType`.
 *
 * READ-ALIASES (§8.3): two iOS constants map INTO a kind that the write direction never emits —
 * 20 (FunctionalStrengthTraining) → `'strength'`, 71 (WheelchairRunPace) → `'wheelchair'` — so
 * foreign Apple Watch data reads sensibly instead of landing in `'other'`. The two mapper directions
 * are therefore NOT literal inverses; the asserted round-trip property constrains write-then-read
 * only.
 */
export function kindFromIosActivityType(raw: number): { kind: WorkoutKind; indoor?: boolean | undefined };
/**
 * Health Connect exerciseType → WorkoutKind + indoor. TOTAL over `number`, same contract as above.
 *
 * ⚠ **The raw value is already destroyed before it reaches us.** Health Connect's
 *   `IntDefMappingsKt` collapses any unmapped int to 0 (`EXERCISE_TYPE_OTHER_WORKOUT`) on BOTH the
 *   read and the write IPC path — verified in bytecode, and the legacy pre-API-34 proto path
 *   defaults to 0 as well. So for a future activity `platformData.android.exerciseType` reads 0, not
 *   the real value, and `'other'` is all the information that exists. This is STRONGER than idx f36
 *   stated: the collapse happens on WRITE too, not only on read.
 *
 * Android has no read-aliases: every Health Connect constant we accept, we also emit.
 */
export function kindFromAndroidExerciseType(raw: number): { kind: WorkoutKind; indoor?: boolean | undefined };
/**
 * WRITE direction — §8.3's table read left-to-right. `indoor` selects between a constant PAIR where
 * one exists (running / cycling / swimming / rowing on Android) and is otherwise ignored by the
 * integer choice.
 * ⚠ `kind: 'other'` writes OTHER_WORKOUT(0) / `.other`(3000) and is NOT recoverable on read.
 * ⚠ These two are never a passthrough: `'other'` is 3000 on iOS and 0 on Android, and iOS `Hiking`
 *   is 24 while Health Connect `HIKING` is 37 — while iOS `Running` is 37. A hand-written table that
 *   reuses one integer across platforms is wrong.
 */
export function iosActivityTypeFromKind(kind: WorkoutKind, indoor?: boolean | undefined): number;
export function androidExerciseTypeFromKind(kind: WorkoutKind, indoor?: boolean | undefined): number;

// ═══════════════ src/core/sync/*.ts ═══════════════

export interface CursorInfo {
  /** OUR format version, not the platform token's. */
  readonly formatVersion: number;
  readonly platform: WorkoutsPlatform;
  readonly issuedAtMs: number;
}

/**
 * Inspect a cursor for diagnostics and progress UI. Returns `null` for anything this build cannot
 * read — it NEVER throws.
 * It NEVER returns the platform token (HKQueryAnchor / Health Connect changes token): an app that
 * stores its cursor on a server would otherwise be storing the platform's own token. A guard test
 * asserts no substring of the encoded token appears in the returned object.
 */
export function describeCursor(cursor: string): CursorInfo | null;

/**
 * Split one sync page into the three operations a local store actually performs.
 * - `rekeys` come from `removed[].replaced === true` matched against the same page's `added` by
 *   `clientId` — iOS replaces a workout's native id. Apply them as an UPDATE of the primary key,
 *   NEVER as DELETE + INSERT, or you lose your local join data (server ids, upload state, notes).
 * - `deletes` are the genuinely-gone ids. Applying one for an id you never held must be a no-op.
 */
export function reconcileSyncPage(page: Pick<SyncPage, 'added' | 'removed'>): {
  readonly upserts: readonly Workout[];
  readonly deletes: readonly string[];
  readonly rekeys: readonly { readonly fromId: string; readonly toId: string }[];
};

// ═══════════════ src/core/budget.ts ═══════════════

/**
 * The client-side read pacer. It lives in `./core` with an injected clock so the reject-don't-block
 * policy, the sliding window and the `retryAfterMs` arithmetic are all Node-testable — every
 * candidate design put this in Kotlin, where `pnpm test` cannot reach it.
 *
 * Budgets: 900 / 15 min and 4 500 / 24 h — 10 % under the measured device constants (1000 / 5000),
 * because those are server-pushed and a Mainline update can move them.
 * It NEVER blocks: it refuses an over-budget call BEFORE the platform call with `rateLimited` and a
 * computed `retryAfterMs`. Sleeping inside a 60-second poll would stall the consumer's whole
 * single-flight pipeline.
 * ⚠ Process-local and blind to another health library in the same app: Health Connect's own limiter
 *   is per-uid, so during a migration off another library our accounting is optimistic.
 */
export declare class ReadBudget { /* internal detail; not constructed by consumers */ }
```

### 5.3 `"."` — 함수 12종 + `workouts`

```ts
// ═══════════════ src/index.ts ═══════════════
export * from './core';   // types, errors, pure utils, createWorkoutsApi

/**
 * Never throws, never shows UI, and consumes NO Health Connect read quota — it is a local platform
 * check on both OSes, so it is safe on a per-poll hot path and safe at boot.
 * On web, Node, SSR and Expo Go it resolves `{ status: 'unavailable', reason: 'notSupported' }`;
 * importing this module never throws there either, because those runtimes resolve a build of `.`
 * whose module graph contains no `expo` at all.
 *
 * Availability comes from the platform's own status API only. A `PackageManager` lookup is never
 * used: on modern Android the Health Connect provider package is not resolvable at all and such a
 * probe reports "missing" on a device where the platform works perfectly.
 */
export function getAvailability(): Promise<Availability>;

/**
 * Show the OS permission UI, then report what is true afterwards.
 *
 * There is **no internal timeout**. A first-run Android flow was measured at 41.6 s of scripted
 * tapping across two consecutive full-screen dialogs. Do not race this call.
 *
 * How the result is derived, so you can trust it:
 * - `conclusive: false` — the platform returned NOTHING. Bouncing off Health Connect's first-run
 *   onboarding with "Go back" returns an empty set after ~20 s, byte-identical to denying
 *   everything. Requested scopes are left UNCHANGED (typically `'undetermined'`). This function
 *   never invents a denial.
 * - `conclusive: true` — the dialog really completed. Each requested scope present in the granted
 *   set becomes `'granted'`, each absent one `'denied'`, decided by comparing the granted sets
 *   BEFORE and AFTER, never by reading the contract's return set as "what the user just granted".
 * - `'routes'` in `read` is accepted but is NEVER put into the request set: the platform silently
 *   filters it and it can only be granted from Settings or from the per-route dialog's
 *   "Allow all routes". The returned state reports its real value, so asking is informative rather
 *   than a no-op, and `read.routes` never becomes `'denied'`.
 * - Every iOS READ scope reports `'undetermined'` (a sheet would still appear) or `'unknown'`
 *   (already asked; the outcome is unknowable by design). It never reports `'granted'`/`'denied'`.
 * - Requesting a scope this build did not DECLARE throws `invalidArgument` naming the missing
 *   config-plugin prop — on Android an undeclared permission renders no row and reads as a silent null.
 */
export function requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult>;

/**
 * The current truth. Fully local on iOS. On Android it is one permission-controller IPC, which we
 * believe is not a data read — [unverified], no Phase 0 lane measured it — so cache it in your own
 * state and refresh it when the app becomes active, rather than calling it per poll.
 *
 * `routeAccess` is recomputed on every call and MUST NOT be cached across app sessions: an app can
 * lose read access to routes it wrote itself.
 * ⚠ `read.routes === 'granted'` means the permission is held. It does NOT mean routes are readable:
 *   foreground and a completed Health Connect onboarding are further preconditions. Branch route UI
 *   on `Workout.routeState`, never on this.
 */
export function getAuthorizationState(): Promise<AuthorizationState>;

/**
 * One page of workouts whose **START instant** is in `[fromMs, toMs)` — on both platforms, always.
 * iOS uses `.strictStartDate`; Android uses `TimeRangeFilter.between(Instant, Instant)`. Both
 * boundaries were proven by measurement. The default (overlap) predicate double-counts a
 * midnight-crossing workout across two day windows, and `.strictStartDate + .strictEndDate` makes it
 * belong to no day at all; Health Connect's `LocalDateTime` overloads query a DIFFERENT column (the
 * record's own stored offset) and bucket the same record into a different day. None of those is
 * reachable from this surface.
 *
 * Pages are DESCENDING by start instant and small on purpose (iOS 200, Android 50). Once route
 * access is held, every Health Connect page eagerly materialises every route in it — 139 423 points
 * took 435–792 ms against 23–55 ms without access, and `ReadRecordsRequest` has no option to
 * suppress it. Those materialised routes go straight into a bounded native cache, so a following
 * `getRoute` for a workout you just received usually costs no extra platform read.
 *
 * Cost on Android: **2–6** Health Connect requests per page (plus each one's own paging),
 * INDEPENDENT of how many sessions the page holds — every metric type is read once over the page's
 * own window, not once per session (§8.4). The range is the granted metric scopes: since owner
 * decision ② a session-list-only app (`read: ['workouts']`) issues ONE request per page instead of
 * six, so it spends a sixth of the read budget it spent under the coarse model. The metric read is
 * SKIPPED, not merely discarded, for any scope not held.
 *
 * ⚠ The flip side is the read trap: a field whose scope you did not request is `undefined` on every
 *   workout, forever, and no error is raised. `unpopulatedWorkoutMetrics(state)` names those fields
 *   before you ship, and `createFakeWorkouts()` in `./testing` reproduces the emptiness in
 *   `pnpm test`.
 *
 * Throws `historyRequired` when `fromMs` reaches past Health Connect's 30-day wall and the `history`
 * scope is not held: a bulk read would otherwise TRUNCATE SILENTLY.
 */
export function listWorkouts(query: ListQuery): Promise<WorkoutPage>;

/**
 * Incremental sync through one opaque cursor. Call with `null` the first time.
 *
 * ```ts
 * let cursor = await store.readCursor();
 * for (;;) {
 *   const page = await syncWorkouts(cursor);
 *   if (page.reset) await backfillWith(listWorkouts);      // then keep page.cursor
 *   await store.transaction(async (tx) => {                // ← ONE transaction. Non-negotiable.
 *     const { upserts, deletes, rekeys } = reconcileSyncPage(page);
 *     await tx.applyRekeys(rekeys);
 *     await tx.upsert(upserts);
 *     await tx.deleteByIds(deletes);
 *     await tx.writeCursor(page.cursor);
 *   });
 *   cursor = page.cursor;
 *   if (!page.hasMore) break;
 * }
 * ```
 *
 * `syncWorkouts(null)` reads NOTHING. It takes the platform checkpoint and returns
 * `{ added: [], removed: [], cursor, hasMore: false, reset: true, resetReason: 'noCursor' }`. Because
 * the checkpoint is taken BEFORE you backfill, backfilling with `listWorkouts` and then continuing
 * from the returned cursor misses nothing — the gap-creating order is not expressible.
 *
 * `reset: true` also covers an expired, malformed, cross-platform or older-format cursor, and a
 * change in the set of granted scopes (if the user grants `steps` later, workouts you already
 * drained would otherwise stay `steps: undefined` forever). It is NEVER an exception.
 *
 * `added` is an idempotent UPSERT SET, not a delta append: the same workout may appear across two
 * pages, which is the price of gap-freeness and is harmless if you upsert. Own writes are not
 * filtered out — the loop needs to see its own echo to learn native ids.
 *
 * Not reported: a change confined to a separate metric record (Android) or to samples associated
 * with a workout after the fact (iOS). Re-read the window with `listWorkouts` when totals must be exact.
 */
export function syncWorkouts(cursor: WorkoutsSyncCursor | null): Promise<SyncResult>;

/**
 * Stream a workout's GPS route in chunks of at most 1000 points, ascending by `t`, with duplicate
 * timestamps already collapsed. Lazy: nothing happens until you start iterating, and `break`ing out
 * of the loop calls the iterator's `return()`, which releases the native handle.
 *
 * ```ts
 * for await (const chunk of getRoute(workout.id)) { … }
 * ```
 *
 * Chunk size is not an option: a whole-array read of a 36 000-point route was measured at +14.25 MB
 * peak against +0.55 MB for 1000-point chunks — 26× — with zero wall-clock penalty and no leak in
 * either HealthKit route API. Use `collectRoute()` if you want the whole array and can afford it.
 *
 * By `routeState`:
 *  - `'available'`       yields 1..n chunks.
 *  - `'none'`            yields NOTHING and does not throw. An empty route is not an error.
 *  - `'consentRequired'` throws `consentRequired` under the default `{ consent: 'skip' }`.
 *    With `{ consent: 'prompt' }` the platform's per-route dialog is shown and the route is streamed
 *    from that same call if the user allows.
 *
 * ⚠ Why there is no separate `requestRouteAccess()`: "Allow this route" is ONE-SHOT — it does NOT
 *   grant the route permission, and the consenting call is itself the route read. A function that
 *   returned `'granted'` and left you to call `getRoute()` afterwards would re-show the dialog or
 *   fail. The prompt and the read are one operation, so they are one call.
 *
 * ⚠ Every negative outcome of the prompt is ONE opaque result — an EMPTY STREAM. Denial, no route, a
 *   bad id, an unknown id and an undeclared manifest permission are byte-identical at the platform
 *   API (116–134 ms for the silent ones, 22 s for a real denial), so we do not invent a reason. Your
 *   discriminator is the `routeState` you already hold: `'consentRequired'` + empty = refused or
 *   unavailable; `'none'` + empty = there is no route.
 *
 * ⚠ Android only: this never runs while the app is backgrounded. A background route read is refused
 *   with `consentRequired` before touching the platform, and `READ_HEALTH_DATA_IN_BACKGROUND` does
 *   NOT help. Every prompt carries a 10 s timeout because the platform's result callback provably
 *   never fires when the route overflows the Intent transport, and prompts are serialised per
 *   process because fanning them out crashes the Health Connect controller and takes the calling
 *   Activity with it — a concurrent prompt throws `busy`.
 *
 * @param workoutId `Workout.id` — the PLATFORM id, not your own `WorkoutWrite.id`. An empty string is
 *        `invalidArgument` before any IPC; a string that is not a UUID is `invalidArgument` too,
 *        because the same value throws hard in the delete path and returns a silent null here.
 */
export function getRoute(workoutId: string, options?: GetRouteOptions): AsyncIterable<readonly RoutePoint[]>;

/**
 * Heart-rate samples whose instant is in `[fromMs, toMs)`, ascending by `t`, with identical
 * `(t, bpm)` pairs collapsed. Samples from several devices may interleave; this function does not
 * choose between sources.
 *
 * The window may not exceed `MAX_HEART_RATE_WINDOW_MS` (24 h) — page wider ranges yourself.
 * ⚠ On iOS a denied read scope is indistinguishable from no data, so an empty array can mean either.
 *   `read.heartRate === 'unknown'` is the signal; this function does not duplicate it.
 * ⚠ Gated by the `'heartRate'` read scope, which is independent of `'workouts'` — this was already
 *   true before owner decision ② and is unchanged by it.
 */
export function readHeartRate(window: TimeWindow): Promise<readonly HeartRateSample[]>;

/**
 * Total steps over `[fromMs, toMs)`. See `StepTotal` for what the number means when several apps
 * wrote steps.
 *
 * Health Connect's `aggregate()` API is NOT used anywhere in this library: it was measured returning
 * `null` for every metric, with no exception, before AND after Health Connect onboarding, on records
 * the same app had just written and could read back. Records are read and summed client-side always,
 * so the behaviour is the same on every device. That is a deliberate override of the mission's
 * "one `aggregate` per session" instruction — the measurement wins (§8.4).
 */
export function readSteps(window: TimeWindow): Promise<StepTotal>;

/**
 * Write (or replace) one of this app's own completed workouts, with its route, idempotently.
 *
 * FULL STATE, keyed on `id`, versioned by `version`. Everything you send replaces everything stored;
 * `route: 'none'` on a workout that has a stored route DELETES that route on Android — which is
 * exactly why `route` is required rather than optional.
 *
 * Idempotency: calling this twice with the same `(id, version)` leaves the store in the same state as
 * calling it once. On iOS that is achieved by looking the workout up by sync identifier BEFORE
 * writing and writing nothing when the stored version already equals `version` — a naive re-save
 * would mint a NEW uuid and orphan the previous workout's samples and route.
 *
 * A lower `version` throws `staleVersion` and writes nothing. On Android that verdict costs one
 * read-back per save and is NOT optional: a stale write there returns normally from `insertRecords`
 * with the same UUID AND emits an upsertion change carrying the unchanged record, so read-back is
 * the only honest detection. The measured usage is one write per activity, where that read is ~0.1 %
 * of the 15-minute budget.
 *
 * Route hygiene runs before any platform call and is identical on both platforms (§8.2). If nothing
 * survives, the workout is still saved with `route: 'dropped'`.
 *
 * **Write-scope pre-flight (owner decision ②'s required companion).** Before touching the store,
 * `requiredWriteScopes(workout)` is checked against the cached `AuthorizationState`; a missing scope
 * throws `notAuthorized` NAMING it. This is not politeness — Android writes the session and all five
 * metric records in ONE `insertRecords` transaction, so a missing `WRITE_DISTANCE` fails the whole
 * transaction with a SecurityException and the workout is not saved at all. `'routes'` is the one
 * exception and never throws: it stays `SaveResult.route === 'notPermitted'` with the workout saved.
 * The same pre-flight turns iOS's opaque XPC error for a missing share type into the same named error.
 *
 * Outcomes: `{ status: 'saved', … }` or `{ status: 'pendingUnlock' }`. There is no third success
 * shape and no silent partial success.
 */
export function saveWorkout(workout: WorkoutWrite): Promise<SaveResult>;

/**
 * Delete a workout this app wrote, along with EVERY record this library wrote for it — distance,
 * active energy, elevation, steps, heart rate and the route. Neither platform cascades fully:
 * HealthKit deletes neither associated samples nor routes, and Health Connect leaves the metric
 * records behind (only the route cascades), so this function deletes them explicitly.
 *
 * Both `WorkoutRef` branches do the full cleanup. `{ nativeId }` first reads the record to recover
 * its `clientRecordId`, so it can reach the derived metric records too — a session-only delete would
 * silently orphan phantom distance and calorie rows in the user's health store.
 *
 * - An unknown id resolves to `{ deleted: false }`; it never throws.
 * - A malformed id throws `invalidArgument` before any platform call — the same string throws hard
 *   inside Health Connect's delete path.
 * - Another app's workout throws `notAuthorized` on both platforms.
 */
export function deleteWorkout(ref: WorkoutRef): Promise<DeleteResult>;

/**
 * Open the place where the user can fix permissions.
 * Android uses `android.health.connect.action.HEALTH_HOME_SETTINGS`, which before onboarding
 * resolves to the onboarding screen and afterwards to Health Connect's home — that is exactly the
 * destination for both the permission problem and the undocumented onboarding precondition.
 * It NEVER uses `androidx.health.ACTION_HEALTH_CONNECT_SETTINGS`, which does not resolve on API 34+
 * and would throw `ActivityNotFoundException`. Every `startActivity` is resolve-guarded.
 * iOS opens the Health app, falling back to this app's system settings page.
 * Throws `unavailable` when nothing can handle it.
 */
export function openSettings(): Promise<void>;

/** Android: the Play listing for the Health Connect provider (the `updateRequired` destination),
 *  shipping the `market://` URI with an `https://play.google.com` fallback. iOS: resolves, does nothing. */
export function openStoreListing(): Promise<void>;

/**
 * The same twelve functions as one object, so an app can inject `WorkoutsApi` and substitute
 * `createFakeWorkouts().api` in tests. It is not a second implementation — the twelve named exports
 * above are literally this object's destructured properties.
 */
export const workouts: WorkoutsApi;
```

### 5.4 `"./testing"` — 네이티브 seam 페이크

```ts
// ═══════════════ src/testing.ts ═══════════════
import type { NativeWorkoutsModule, WorkoutsApi, /* … */ } from './core';

export interface FakeSeed {
  readonly platform: WorkoutsPlatform;
  readonly availability?: Availability | undefined;
  readonly authorization?: AuthorizationState | undefined;
  readonly workouts?: readonly FakeWorkoutInput[] | undefined;
  /** Deterministic clock. Defaults to a fixed instant so snapshots and budget tests are stable. */
  readonly nowMs?: number | undefined;
}

/** An in-memory `NativeWorkoutsModule`. THIS is what tests drive; the real JS layer runs on top. */
export interface FakeNativeWorkouts extends NativeWorkoutsModule {
  // ── scenario controls — each one maps to a Phase 0 measurement ──────────────
  setAvailability(a: Availability): void;
  setAuthorization(s: AuthorizationState): void;
  /** Returns the native id. */
  addWorkout(w: FakeWorkoutInput): string;
  /** Platform-faithful replacement: iOS mints a NEW native id and emits `removed{replaced:true}`
   *  in the same drain batch; Android keeps the SAME id and emits only an upsertion change. */
  replaceWorkout(nativeId: string, patch: Partial<FakeWorkoutInput>): string;
  removeWorkout(nativeId: string): void;
  /** HealthKit purging a deletion record before we drain it — the workout vanishes with no `removed`. */
  purgeDeletion(nativeId: string): void;
  /** Android: emit an upsertion change carrying an UNCHANGED record — the undetectable stale-version no-op. */
  emitNoOpUpsertion(nativeId: string): void;
  /** Force `reset: true` with a chosen reason on the next sync — reaches all six `CursorResetReason`s. */
  expireCursor(reason?: CursorResetReason): void;
  setRouteAccess(a: RouteAccess): void;
  /** Process importance — the only way to reach the background-route path without a device. */
  setForeground(foreground: boolean): void;
  /** Health Connect first-run onboarding: foreign routes read `consentRequired` while this is false
   *  even with the permission held and the app in the foreground. */
  setOnboarded(onboarded: boolean): void;
  /** iOS: protected data unavailable — the `storeLocked` pre-check path. */
  setStoreLocked(locked: boolean): void;
  /** iOS: make the next save return (nil workout, nil error) — the case Phase 0 could not reproduce. */
  nextSaveIsPendingUnlock(): void;
  /** Make the next call to one seam primitive throw a platform-shaped payload, so the error MAPPING
   *  (not just the mapped result) is what the test exercises. */
  failNext(primitive: keyof NativeWorkoutsModule, payload: NativePayloadDto): void;
  /** Unreleased route handles. A test asserts this is 0 after every `for await`. */
  readonly openRouteHandles: number;
  readonly calls: readonly { readonly fn: keyof NativeWorkoutsModule; readonly atMs: number }[];
}

export function createFakeNativeWorkouts(seed?: FakeSeed): FakeNativeWorkouts;

/**
 * ⚠ **The fake HONOURS SCOPES** — the third and strongest layer of the read-trap mitigation
 * (채택 #33). Seed a fully-populated workout, authorize with only `['workouts']`, and
 * `listWorkouts` hands back `distanceM: undefined`. The trap becomes reproducible in `pnpm test`, on
 * Node, in the CONSUMER'S OWN suite — which is the strongest available reading of "find out without
 * a device": the developer does not have to know `unpopulatedWorkoutMetrics()` exists, their test
 * fails and shows them. It costs nothing extra, because the fake already runs the same `./core`
 * pipeline as the real module (채택 #23).
 *
 * The write side is symmetric: saving a workout whose `requiredWriteScopes()` are not all granted
 * rejects with `notAuthorized` naming the missing scope, exactly as Android would.
 */

/** Convenience wrapper: `createWorkoutsApi(native)` plus the same controls. */
export interface FakeWorkouts extends FakeNativeWorkouts { readonly api: WorkoutsApi }
export function createFakeWorkouts(seed?: FakeSeed): FakeWorkouts;

/**
 * Run the full sync loop to convergence against any `WorkoutsApi`. Test helper only — it holds the
 * whole store in memory and does NOT model the one-transaction rule, so a production app must write
 * the loop itself. `killAfterPages` reproduces a crash and reports whether the cursor was persisted
 * without the items, which is the one failure the library cannot prevent.
 */
export function drainSync(
  api: Pick<WorkoutsApi, 'syncWorkouts' | 'listWorkouts'>,
  opts: {
    readonly backfillFromMs: number;
    readonly cursor?: WorkoutsSyncCursor | null | undefined;
    readonly maxPages?: number | undefined;
    readonly killAfterPages?: number | undefined;
  },
): Promise<{
  readonly cursor: WorkoutsSyncCursor;
  readonly store: ReadonlyMap<string, Workout>;
  readonly pages: number;
  readonly resets: readonly CursorResetReason[];
}>;
```

`./testing`은 **노브가 많아도 된다** — 최소화 예산은 프로덕션 표면에만 적용된다. 여기서는 노브 하나가 곧 재현 가능한 Phase 0 상태다.

### 5.5 `"./plugin"` — 1심볼

```ts
// ═══════════════ src/plugin-types.ts — types only, ZERO peers ═══════════════
// `ConfigPlugin` is deliberately NOT re-exported: `app.config.ts` must type-check in a repo that has
// not installed `expo`.
export interface GjKitWorkoutsPluginProps {
  /**
   * The scopes this app will ever ask for. Drives the iOS entitlement and every Android
   * `<uses-permission>` line. `'routes'` in either list additionally emits the manifest-only
   * READ_EXERCISE_ROUTES entry, which is MANDATORY: undeclared, route requests silently return
   * nothing with no error at all.
   *
   * ⚠ Since owner decision ② the vocabulary is SEVEN scopes and `'workouts'` means the session
   *   ALONE. `read: ['workouts']` in `app.json` now emits ONE `<uses-permission>` line instead of
   *   four, and the failure shows up at runtime as `undefined` totals — far from the file that
   *   caused it. For the old (coarse) behaviour write the four members out, or import
   *   `WORKOUT_TOTALS_SCOPES` from `@gj-kit/expo-workouts/core` in an `app.config.ts`.
   *   `./core` has zero peers, so importing it from a config file is safe.
   */
  readonly read?: readonly Scope[] | undefined;
  readonly write?: readonly Scope[] | undefined;
  /** D10. Adds READ_HEALTH_DATA_HISTORY. Default false — the 30-day wall is the default reality. */
  readonly history?: boolean | undefined;
  /**
   * REQUIRED. Android 14+ launches `VIEW_PERMISSION_USAGE` + category `HEALTH_PERMISSIONS` at the app
   * when the user taps "privacy policy" in the permission dialog, and the activity-alias this plugin
   * registers needs somewhere to go. A dead link there is a user-visible defect, and Play's Health
   * apps declaration requires a policy URL anyway — so this is not optional.
   */
  readonly privacyPolicyUrl: string;
  readonly ios?: {
    /** NSHealthShareUsageDescription. An English default is supplied; localise via `ios.infoPlist`/locales.
     *  ⚠ A missing usage string CRASHES at `requestAuthorization` — the plugin makes that unreachable. */
    readonly shareUsageDescription?: string | undefined;
    /** NSHealthUpdateUsageDescription. */
    readonly updateUsageDescription?: string | undefined;
  } | undefined;
}
```

### 5.6 에러 — 코드 14종

```ts
// ═══════════════ src/core/errors.ts ═══════════════
export const WORKOUTS_ERROR_CODES = [
  /** No usable health store in this runtime: web, Node, SSR, Expo Go, iPad, Android < 28. Hide the feature. */
  'unavailable',
  /** Android 9–13 without the Play Health Connect provider. Call `openStoreListing()`. */
  'updateRequired',
  /** The platform positively refused for lack of permission. NEVER thrown by an iOS read. */
  'notAuthorized',
  /** A route EXISTS but is not readable now. Retry with `{ consent: 'prompt' }` from the foreground. */
  'consentRequired',
  /** Android: the window reaches past the 30-day history wall and READ_HEALTH_DATA_HISTORY is absent. */
  'historyRequired',
  /** Read quota exhausted. `retryAfterMs` is OUR budget's estimate — the platform publishes none. */
  'rateLimited',
  /** The store is busy (Health Connect data-sync in progress), or a UI-bound operation is already in flight. */
  'busy',
  /** Caller input the library refused before touching the platform. A programming error; fix the call. */
  'invalidArgument',
  /** Android: the serialised record would exceed the 1 000 000-byte single-record ceiling. */
  'routeTooLarge',
  /** The stored version is newer than the one supplied. Re-read your own state and retry. */
  'staleVersion',
  /** iOS: protected data is unavailable (device locked). Retry after unlock. */
  'storeLocked',
  /** A UI-bound operation was terminated by activity/process lifecycle before it could answer. */
  'cancelled',
  /** The platform failed to deliver: IPC failure, database failure, a route insert that errored. */
  'io',
  /** A platform outcome this library does not model. Always a bug report. */
  'internal',
] as const;

export type WorkoutsErrorCode = (typeof WORKOUTS_ERROR_CODES)[number];

export interface WorkoutsErrorOptions {
  readonly cause?: unknown;
  /** Only meaningful with code 'rateLimited'. */
  readonly retryAfterMs?: number | undefined;
  /**
   * A short, TEMPLATE-BUILT diagnostic string from the native layer: exception class name, platform
   * error code, and a bounded reason token. NEVER coordinates, heart rates, distances, energies, step
   * counts, titles or notes — a source-scan guard enforces this (§9.3).
   */
  readonly nativeMessage?: string | undefined;
}

export class WorkoutsError extends Error {
  readonly code: WorkoutsErrorCode;
  readonly retryAfterMs?: number | undefined;
  readonly nativeMessage?: string | undefined;
  constructor(code: WorkoutsErrorCode, message: string, options?: WorkoutsErrorOptions);
}

/**
 * `instanceof` is unreliable: tsup with `splitting: false` copies core into every entry, so `.` and
 * `./core` hold DIFFERENT class objects. This guard uses a `Symbol.for('gj-kit.workouts.error')` tag.
 */
export function isWorkoutsError(error: unknown): error is WorkoutsError;
export function workoutsErrorCode(error: unknown): WorkoutsErrorCode | null;
/**
 * Call it from a `switch` default so a future code becomes a compile error for you.
 * ⚠ This is only honest because the code union is CLOSED for 1.x (§1-7): adding a code is a major.
 */
export function assertNeverWorkoutsCode(code: never): never;
```

**코드 → 소비자 행동 결정표 (README 정본)**

| code | 무슨 일이 일어났나 | 재시도 | 소비자가 할 일 |
|---|---|---|---|
| `unavailable` | 이 기기/런타임에서는 영구 불가 | **금지** | 기능을 숨긴다 |
| `updateRequired` | Android provider 갱신 필요 | 앱 재개 시 | `openStoreListing()` CTA |
| `notAuthorized` | 필요한 scope 없음 | 조용한 재시도 금지 | `requestAuthorization()` 또는 `openSettings()` |
| `consentRequired` | route는 있는데 지금 못 본다 | 금지 | 포그라운드에서 `getRoute(id, { consent: 'prompt' })` |
| `historyRequired` | 30일 벽 밖을 읽으려 함 | 금지 | 창을 좁히거나 `history: true`로 빌드 |
| `rateLimited` | 예산 초과 | **`retryAfterMs` 후** | 그 시점까지 아무것도 하지 않는다 |
| `busy` | 플랫폼 동기화 중 / 동의 다이얼로그가 이미 1건 진행 중 | 1회, ~1 s 후 | 그 뒤엔 노출 |
| `invalidArgument` | **호출자 버그** | 금지 | 메시지를 읽고 호출을 고친다 |
| `routeTooLarge` | Android 레코드 상한 초과 | 그대로는 금지 | `MAX_ANDROID_ROUTE_POINTS` 이하로 다운샘플 |
| `staleVersion` | 저장된 것이 더 최신 | 그대로는 금지 | `version`을 올려 재저장 |
| `storeLocked` | 기기 잠김 | 다음 활성화 시 | 조용히 넘어간다 |
| `cancelled` | 사용자/시스템이 UI 연산을 끊음 | 금지 | UI 없이, 액션을 다시 제안 |
| `io` | 일시적 IPC/DB/route-insert 오류 | 1회 | 그 뒤엔 노출 |
| `internal` | 우리 또는 플랫폼의 버그 | 금지 | `code`만 로깅, 일반 문구로 노출 |

> `isRetryableWorkoutsError(e)` 같은 헬퍼는 일부러 export하지 않는다 — `io`가 재시도 대상인지는 소비자의 정책이지 우리의 사실이 아니다.

**Phase 3 정정 — 결함 A: 브리지가 예외를 한 겹 더 감싼다 (2026-08-22, example 앱을 실기에서 돌려 발견).**

Phase 2의 `mapErrors.ts`는 "네이티브가 `Workouts*Exception`을 던지면 Expo 런타임이 클래스 이름에서
`ERR_WORKOUTS_*`를 만들고, 그것이 JS 에러의 `code`로 온다"만 가정했다. 실기 결과는 두 가지를 보여줬다.

* iOS: `syncWorkouts: rejected non-WorkoutsError Error: FunctionCallException: Calling the
  'takeCheckpoint' function has failed (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:88)`
* Android: `Call to function 'GjKitWorkouts.takeCheckpoint' has been rejected. → Caused by:
  Internal: changesToken is a Phase 2 stub; Phase 3 implements it`

설치된 `expo-modules-core` / `expo-modules-jsi` 소스를 직접 읽어 확인한 사실:

| 플랫폼 | 감싸는 자리 | JS에 도달하는 모양 |
|---|---|---|
| iOS | `ConcurrentFunctionDefinition.swift`의 `catch let error as Exception { throw FunctionCallException(name).causedBy(error) }` | `FunctionCallException.code`가 cause의 `code`를 **승계**하고(`AnyFunctionDefinition.swift`), `JavaScriptError.init(_:from:)`이 그것을 JS `Error.code`로 붙인다. `message`는 `Exception.debugDescription` = `"<이름>: <이유> (at <파일>:<줄>)"` + `"\n→ Caused by: …"`이므로 **우리 예외의 클래스 이름이 문자열 안에 남는다** |
| Android | `CodedException.kt`의 `DecoratedException(message, cause)` → `FunctionCallException` | `cause.code`를 승계하고 메시지를 `"Call to function 'M.f' has been rejected.\n→ Caused by: <cause 메시지>"`로 만든다. `PromiseImpl.reject` → `JavaCallback.cpp`의 `makeCodedError`가 JS `CodedError(code, message)`를 만든다. `UnexpectedException`으로 떨어진 경우에만 `ERR_UNEXPECTED`가 되고, 그때는 메시지에 원래 클래스의 FQCN이 들어 있다 |

**진짜 원인은 두 개였고 둘 다 고쳤다.**

1. `src/core/api.ts`에서 **seam 호출 일부가 `try`/`catch` 밖에 있었다** — `syncWorkouts`의
   `takeCheckpoint()`·`grantedScopeFingerprint()`와 `platform()`의 `authorizationSnapshot()`.
   그 경로에서는 `mapNativeError`가 **아예 호출되지 않았다**. Phase 3은 네이티브를 부르는 모든 자리를
   하나의 `guard(fallbackMessage, run)` 헬퍼로 통과시켜 "try를 하나 빠뜨렸다"를 표현 불가능하게 만든다.
2. `mapErrors.ts`가 **최상위 `code`만** 봤다. 이제 (a) `cause` 체인을 순환 안전하게 끝까지 걷고,
   (b) 어느 마디의 `code`/`exceptionClass`든 읽고, (c) 그래도 못 찾으면 **메시지 텍스트에서
   `ERR_WORKOUTS_*` 토큰과 `Workouts*Exception` 클래스 이름을 회수**한다. 우선순위는
   구조화된 `code` → 구조화된 클래스 이름 → 텍스트의 `ERR_WORKOUTS_*` → 텍스트의 `Workouts*Exception`
   → Health Connect `platformCode` → `internal`이다.

**프라이버시 규칙은 그대로다.** 공개 `message`는 언제나 우리가 쓴 영어 문장(`fallbackMessage`)이고,
플랫폼 원문은 `nativeMessage`(600자 상한)와 표준 `cause`로만 간다. `tests/unit/map-errors.test.ts`가
iOS 래퍼 모양 · Android 래퍼 모양 · 중첩 cause · 순환 cause · 모르는 코드 · Error가 아닌 reject를
전수로 덮고, **negative control**(Phase 2의 매핑을 그대로 재현한 함수)이 같은 입력에서 `internal`을
내는 것을 함께 단언한다 — 언랩을 되돌리면 그 테스트들이 즉시 실패한다.

### 5.7 Phase 0에서 측정된 모든 실패 모드 → 정확히 하나의 코드 (전수)

| # | 플랫폼 | 측정된 실패/상태 | 근거 | 공개 결과 |
|---|---|---|---|---|
| 1 | iOS | `isHealthDataAvailable() == false` (iPad 등) | idx f19 | `getAvailability()` → `{unavailable, notSupported}`; 다른 호출은 `unavailable` |
| 2 | 양쪽 | 네이티브 모듈 부재 (Expo Go / web / Node / SSR) | 미션 §4.1, **V1** | 동일. **import는 절대 던지지 않는다** — 그 런타임의 모듈 그래프에 `expo`가 없다 |
| 3 | Android | `getSdkStatus() == SDK_UNAVAILABLE`, API < 28 | **f88**, D6 | `{unavailable, platformTooOld}` |
| 4 | Android | `getSdkStatus() == SDK_UNAVAILABLE`, API ≥ 28 | **f88** | `{unavailable, notSupported}` |
| 5 | Android | `getSdkStatus() == SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` | idx f31, D6 | `{updateRequired}`; 데이터 호출은 `updateRequired` |
| 6 | Android | `UnsupportedOperationException` (pre-34 provider 부재) | idx f39 | `updateRequired`(sdkStatus가 그리 말할 때) / 아니면 `unavailable` |
| 7 | Android | `SecurityException` | idx f39 | `notAuthorized` |
| 8 | iOS | `HKError.errorHealthDataRestricted` | idx f14 | `notAuthorized` |
| 9 | iOS | `HKError.errorAuthorizationDenied` / `errorAuthorizationNotDetermined` (쓰기) | idx f29 | `notAuthorized` |
| 10 | iOS | 읽기 권한 거부 | idx f14 | **에러 아님** — 빈 결과. `read.*` = `'unknown'`. README·예제가 "데이터가 없거나 접근이 허용되지 않았습니다"를 짊어진다 |
| 11 | iOS | `errorDatabaseInaccessible` / `isProtectedDataAvailable == false` | idx f24 `[unverified]` | **`storeLocked`** — 쓰기 전 사전 검사에서 잡아 이중 쓰기를 막는다 |
| 12 | iOS | `finishWorkout()` → `(nil workout, nil error)` | **f70** `[unverified]`, idx f24 | **에러 아님** → `{ status: 'pendingUnlock', route: 'deferred' }` |
| 13 | iOS | 낮은 `HKMetadataKeySyncVersion` → `com.apple.healthd.SQLite Code=1` | idx f26 | `staleVersion` (실제로는 §8.1-2의 사전 조회가 먼저 잡는다) |
| 14 | iOS | `discard()` 후 `finishWorkout()` → `SQLite Code=1`, nil 워크아웃 | **f65** | **도달 불가** — `discard()`가 소스에 없다(가드). 도달 시 `internal` |
| 15 | iOS | `insertRouteData` 오류 (빌더가 조용히 오염됨) | **f64** | **`io`** — 해당 빌더 즉시 폐기, 절대 계속 삽입하지 않는다. 워크아웃은 이미 저장됐고 재호출이 멱등 |
| 16 | iOS | 0-포인트 `finishRoute` → `HKError 3 "No data was added"` | **f84** | **도달 불가** — 위생 후 0점이면 route를 건너뛰고 `route: 'dropped'` |
| 17 | iOS | 같은 빌더에 두 번째 `finishRoute` → `HKError 3 "already finished"` | **f63** | **도달 불가** — 매번 새 빌더. 도달 시 `internal` |
| 18 | iOS | path A′의 `HKError 3 "attached to a workout builder…"` | **f62** | **도달 불가** — `seriesBuilder(` 가 소스에 없다(가드). 도달 시 `internal` |
| 19 | iOS | 루트 sync id 재사용으로 인한 워크아웃 교차 연결 | **f68** | **표현 불가** — sync id를 `"<id>/route"`로 만드는 순수 함수가 유일한 경로 |
| 20 | iOS | `HKQuantitySample` init의 ObjC 예외 (단위/시간 오류 → **크래시**) | idx f28 | **발생 금지** — Swift 사전 검증. 검증 실패는 `invalidArgument` |
| 21 | iOS | `errorInvalidArgument` (`earliestPermittedSampleDate`, ≥24 h 샘플) | idx f28 | `invalidArgument` (사전 검증이 먼저 잡는다) |
| 22 | iOS | `hAcc=80` / `hAcc=-1` / 창 밖 포인트 (HealthKit은 그대로 저장) | **f81** | **에러 아님** — 위생 드롭. 전부 드롭되면 `route: 'dropped'` |
| 23 | iOS | 동일 타임스탬프 (HealthKit은 조용히 마지막 것만 남긴다) | **f82** | **에러 아님** — 우리가 **마지막 것을 남기고** dedupe. 그래야 HC(throw)와 결과가 같다 |
| 24 | 양쪽 | `lat=91` / `lon=181` (iOS는 그대로 저장, HC는 throw) | **f85** | **`invalidArgument`** — 플랫폼 호출 전에 양쪽 동일하게 거절. 조용히 버리는 것보다 정직하다 |
| 25 | iOS | route 샘플 0개 | idx f13 | `routeState: 'none'`; `getRoute` → **빈 스트림**(에러 아님) |
| 26 | Android | `ExerciseRouteResult.NoData` | **f118** | `routeState: 'none'`; `getRoute` → 빈 스트림 |
| 27 | Android | `ConsentRequired` (전경, 권한 없음, 외부 세션) | **f114, f118** | `routeState: 'consentRequired'`; `getRoute(consent:'skip')` → `consentRequired` |
| 28 | Android | `ConsentRequired` (**자기** 세션, 두 route scope 모두 회수됨) | **f114** | 동일. **절대 `'none'`으로 붕괴시키지 않는다** |
| 29 | Android | importance > IMPORTANCE_FOREGROUND에서 route 읽기 | **f113** | 플랫폼 호출 **전에** `consentRequired`. Intent를 띄우지 않는다. 백그라운드 읽기 권한은 도움이 되지 않는다 |
| 30 | Android | Health Connect 온보딩 미완료 → 모든 외부 route가 `ConsentRequired` | **f115** | `consentRequired`. `routeAccess === 'all'` + 이 에러 = 온보딩 미완료의 서명 → README가 `openSettings()`를 안내 |
| 31 | Android | 사용자 "Don't allow" (22 117 ms 후 null) | **f111, f112** | `consent:'prompt'` → **빈 스트림**. `routeState`가 판별자다(§5.3). `cancelled`를 만들지 않는다 |
| 32 | Android | 세션 없음(134 ms) / 없는 UUID(124 ms) / 매니페스트 미선언(116 ms) → 전부 null | **f112** | 동일하게 **빈 스트림**. 원인은 **알 수 없다**고 문서화 — `denied` 코드를 지어내지 않는다 |
| 33 | Android | Intent 오버플로 → 콜백이 **영원히 안 옴** | **f104** | 10 s 타임아웃 → 빈 스트림. 절대 루프에서 재시도하지 않는다 |
| 34 | Android | 동시 route 동의 요청 2건 (컨트롤러 프로세스 크래시 위험) | **f105** | 프로세스당 직렬화 — 두 번째는 **`busy`** |
| 35 | Android | **빈** 세션 id → `IllegalArgumentException` 동기 throw (3 ms, IPC 전) | **f112** | `invalidArgument` (`./core`가 IPC 전에 잡는다) |
| 36 | Android | **잘못된 형식**의 세션 id (route 경로에서는 조용한 null, delete 경로에서는 hard throw) | **f96, f112** | `invalidArgument` — 두 경로 모두에서 `./core`의 UUID 검증이 먼저 잡아 비대칭을 없앤다 |
| 37 | Android | `IllegalStateException(HealthConnectException 7)` + 메시지에 `single record size limit` | **f99, f101** | **`routeTooLarge`** — `rateLimited`가 아니다. 코드 7이 두 의미를 겸한다 |
| 38 | Android | `IllegalStateException(HealthConnectException 7)` + 그 외 메시지 | **f101**, idx f39 | `rateLimited` (`retryAfterMs` 없음 — 우리 계수가 어긋났다는 뜻) |
| 39 | Android | 우리 `ReadBudget` 선제 거절 (900/15분 · 4500/24h) | **f102**, idx f39 | `rateLimited` + `retryAfterMs`. **지연시키지 않고 거절한다** |
| 40 | Android | `HealthConnectException 8` (data sync in progress) | idx f39 | `busy` |
| 41 | Android | `HealthConnectException 9` 및 그 외 모든 코드 | idx f39 | `internal` |
| 42 | Android | `IOException` / `RemoteException` / `DeadObjectException`(컨트롤러 크래시 여파) | idx f39, **f105** | `io` |
| 43 | 양쪽 | Activity/프로세스 소멸로 UI 바인딩 연산이 미응답 종료 | idx f9 | **`cancelled`** |
| 44 | Android | 30일 벽 밖 `readRecord` → throw | idx f38, D10 | `historyRequired` (`history` 미승인 시) / 아니면 `internal` |
| 45 | Android | 30일 벽 밖 `listWorkouts`/`readHeartRate`/`readSteps` (history 미보유) | idx f38, D10 | 읽기 **전에** `historyRequired` — 플랫폼의 조용한 절단을 막는다 |
| 46 | Android | 대량 읽기가 30일 벽 밖을 **조용히 잘라냄** | idx f38 | **감지 불가** — §11-3에 정직하게 남긴다 |
| 47 | Android | 쓰기 전 크기 추정 > `MAX_ANDROID_ROUTE_POINTS` 또는 960 000 B | **f99, f100** | 플랫폼 호출 **전에** `routeTooLarge`. iOS에는 적용하지 않는다(§0.4 기각 8) |
| 48 | Android | 낮은 `clientRecordVersion` → 조용한 no-op (Changes API도 못 잡음) | **f93, f94** | **무조건 read-back** 후 `staleVersion` |
| 49 | Android | `WRITE_EXERCISE_ROUTE` 없이 route 포함 저장 | 미션 §4.3, **f95** | throw 안 함 → `{ status:'saved', route:'notPermitted' }`. 재저장이면 저장된 route가 사라졌다는 뜻 |
| 50 | Android | `deleteRecords`의 알 수 없는 `clientRecordId` / 중복 삭제 | **f96** | **에러 아님** → `{ deleted: false }` |
| 51 | Android | `HealthConnectException 3` — `deleteRecords`의 malformed recordId | **f96** | `invalidArgument` (`./core` UUID 검증이 먼저 잡는다) |
| 52 | Android | `aggregate()`가 모든 지표에 null | **f109** | **에러 아님이자 도달 불가** — `aggregate`를 아예 호출하지 않는다. 해당 필드는 `undefined`(절대 `0`이 아니다) |
| 53 | Android | 권한 컨트랙트가 **빈 집합** 반환 (온보딩 "Go back", 19.6 s) | **f120** | **에러 아님** → `conclusive: false`, scope 상태 **불변**. 절대 `'denied'`로 뒤집지 않는다 |
| 54 | Android | `changesTokenExpired` | idx f38 | **에러 아님** → `reset: true` + `resetReason: 'expired'` |
| 55 | 양쪽 | 커서가 손상·미래 버전·다른 플랫폼·scope 지문 변화 | §4.5 | **에러 아님** → `reset: true` + 해당 `resetReason` |
| 56 | 양쪽 | 페이지 토큰 자리에 동기화 커서 | §4.2 | `invalidArgument` (매직 불일치) |
| 57 | 양쪽 | `fromMs >= toMs`, 비유한 숫자, `0 < ms < EPOCH_MS_FLOOR`(초/밀리초 혼동), `version`이 안전 정수가 아니거나 < 1, `endMs > now`, 빈 `id`, `route: []` | §5.2, **V9** | `invalidArgument` |
| 58 | 양쪽 | 요청 scope가 이 빌드의 매니페스트/Info.plist 선언 밖 | **f112**, idx f19 | `invalidArgument` — 메시지가 **빠진 config-plugin prop 이름**을 말한다 |
| 59 | iOS | `NSHealthShareUsageDescription`/`…Update…` 누락 → `requestAuthorization`에서 **크래시** | idx f19 | **잡을 수 없다.** config plugin이 구조적으로 막고, `plugin/__tests__` introspect 스냅샷이 두 키의 존재를 단언한다 |
| 60 | 양쪽 | 다른 헬스 라이브러리가 같은 앱에 있어 우리 예산 계수가 어긋남 | 설계 | 38번으로 떨어진다(`retryAfterMs` 없음). §11-6에 약점으로 남긴다 |
| 61 | 양쪽 | **`saveWorkout`이 필요로 하는 write scope 누락** — `requiredWriteScopes(workout)` 사전 검사 실패 | 소유자 결정 ② · §8.5-0 | **`notAuthorized`**, 메시지가 **누락된 scope 이름**을 말한다. 플랫폼 호출 **전에** 던진다. Android에서 이것이 없으면 단일 `insertRecords`가 통째로 SecurityException(7번)이 되어 워크아웃 자체가 저장되지 않고, iOS에서는 9번의 불투명한 XPC 에러가 된다 — **즉 이 행은 새 코드가 아니라 7·9번을 이름 있는 사전 거절로 앞당긴 것이다.** `'routes'`는 예외로 여기에 오지 않는다(`route:'notPermitted'`로 남는다) |
| 62 | 양쪽 | **`'workouts'` 없이 메트릭 scope만 요청** (`read: ['distance']`) | 소유자 결정 ② · §5.2 | `invalidArgument` — 워크아웃을 통하지 않고 거리를 읽는 API가 없다. `./core`가 플랫폼 호출 전에 거절한다 |

| 63 | 양쪽 | **ExpoModulesCore가 우리 예외를 `FunctionCallException`/`DecoratedException`으로 한 겹 감싼다** | Phase 3 실기 | **에러 아님** — `mapErrors.ts`가 `cause` 체인과 메시지 텍스트에서 코드를 회수해 원래 14종 중 하나로 접는다. 회수 실패는 `internal` + `nativeMessage` |
| 64 | 양쪽 | 브리지가 `code` 없이 문자열만 실어 보냄 (구버전 core / `UnexpectedException` 경로) | Phase 3 실기 | 동일 — 메시지 안의 `Workouts*Exception` 이름이 판별자다 |
| 65 | 양쪽 | Error가 **아닌** 값으로 reject (문자열·숫자·`undefined`) | 방어 | `internal`. 절대 던지다 말거나 `undefined.code`로 죽지 않는다 |

**65행** 전부가 정확히 하나의 결과에 대응하고, 코드 14개 각각이 **서로 다른 호출자 행동**을 가진다(§5.6 결정표). 소유자 결정 ②가 추가한 두 행(61·62)은 **새 코드를 만들지 않았다** — 기존 `notAuthorized`/`invalidArgument`를 더 이른 시점으로 옮겼을 뿐이다. Phase 3이 추가한 세 행(63·64·65)도 마찬가지로 새 코드를 만들지 않았다 — 기존 14종이 **브리지를 건너 살아남게** 했을 뿐이다. 미션 §4.2의 14종 계약은 그대로다.

---

## 6. 검증 강제 지점

원칙: **조용히 깨지는 것에만 비용을 쓴다.** 즉시 크래시하거나 테스트가 반드시 잡는 것에는 아무것도 걸지 않는다.

### 6.1 채택표

| # | 사고 모드 | 조용히 깨지는가 | 판정 | 소비자 비용 | 근거 |
|---|---|---|---|---|---|
| ① | `unavailable`인데 scope 상태를 읽음 | 예 — `undefined.heartRate` | **타입** — `AuthorizationState` 판별 유니언. 그 조합이 **표현 불가**(V6) | 0 | f88 |
| ② | `pendingUnlock`인데 `nativeId`를 읽음 | **예** — 잠긴 기기에서만 발생하므로 개발 중엔 절대 안 보인다 | **타입** — `SaveResult` 판별 유니언, `nativeId`가 그 브랜치에 **존재하지 않는다**(V5) | 0 | **f70**, idx f24 |
| ③ | **업서트에서 route를 빠뜨림** | **예 (치명·영구)** — Android가 저장된 route를 **삭제한다** | **타입** — `route`가 필수 `RoutePoint[] \| 'none'`. 생략이 컴파일 에러(V8). 세 후보안이 모두 "타입으로 못 막는다"고 적은 항목이다 | 인도어 워크아웃마다 `route:'none'` 한 단어 | **f95** |
| ④ | 삭제할 워크아웃의 id 종류를 잘못 고름 | **예** — `{deleted:false}`가 조용히 돌아오고 메트릭 레코드가 고아가 된다 | **타입** — `WorkoutRef` 배타 유니언(`?: never`). 맨 문자열도, 두 키 동시도 불가(V2·V3) | 0 (호출부가 오히려 읽기 쉬워진다) | **f96, f98** |
| ⑤ | `consentRequired`를 `none`으로 처리 | **예** — "경로 없음"으로 UI가 굳는다 | **타입** — `RouteState` 3값 유니언 + `getRoute`가 다른 코드를 던진다 | 0 | **f114, f118** |
| ⑥ | `platformData`를 잘못된 플랫폼으로 읽음 | 예 | **타입** — `Workout` 최상위 판별 유니언. 캐스트 0(V4) | 0 | 미션 §4.2 |
| ⑦ | 부분 `AuthorizationState`(새 scope가 조용히 기본값) | 예 | **타입** — `Readonly<Record<Scope, ScopeStatus>>` 전수. `Partial` 금지(V6: 구멍 없음) | 0 | 인덱스 §4 |
| ⑧ | **초를 밀리초 자리에 넣음** | **예** — 1970-01-21의 창을 조회하고 빈 결과를 받는다 | **런타임** — `EPOCH_MS_FLOOR`. 타입으로 표현 불가한 제약이라 표현 가능성 자체를 없애는 대신 값으로 잡는다(V9) | 0 | idx f46(AE miles 사고와 동종) |
| ⑨ | 필드 이름을 `from`/`to`로 씀 | 예 | **명명** — `fromMs`/`toMs`. 단위가 필드 이름에 있다(`distanceM`·`altM`·`speedMps`·`activeEnergyKcal`도 동일) | 0 | 인덱스 §4 |
| ⑩ | 로컬 날짜로 질의 | **예** — 플랫폼마다 다른 날에 들어간다 | **표면 제거** — epoch-ms만 받는다. `LocalDateTime` 경로가 **존재하지 않고** Kotlin 소스 가드가 금지한다 | 0 | **f108** |
| ⑪ | 페이지 토큰을 동기화 커서 자리에 (반대도) | 예 | **런타임 양방향 안전 실패** — 매직 불일치 → `reset`(자가 치유) / `invalidArgument`(즉시 발각) | 0 | §4.2 |
| ⑫ | `version`을 `Date.now()`로 | **예** — 크래시 재시도마다 iOS에서 새 UUID + 고아 샘플 | **런타임 + 사전 조회** — 동일 version이면 아무것도 쓰지 않는다(§8.1-2) | 0 | idx f26 |
| ⑬ | 낮은 `version` 쓰기 (Android) | **예** — 조용한 no-op, 변경로그에도 안 잡힘 | **런타임 read-back 상시** | save당 read 1회 | **f93, f94** |
| ⑭ | 좌표 범위 밖 | **예** — iOS는 저장한다 | **런타임 양쪽 동일** — `invalidArgument` | 0 | **f85** |
| ⑮ | 백그라운드에서 route 읽기 | 예 — 개발 중엔 항상 전경이라 안 보인다 | **런타임** — importance 검사 후 `consentRequired`. Intent를 띄우지 않는다 | 0 | **f113** |
| ⑯ | 목록 루프에서 route 동의를 팬아웃 | **아니오 — HC 컨트롤러 프로세스가 죽고 호출 Activity까지 끌고 간다** | **런타임 직렬화** — 두 번째 동시 호출은 `busy`. ⚠ 직렬화는 크래시를 **막지 못하고 1건으로 한정할 뿐이다**(원인은 동시성이 아니라 parcel 크기이고, 크기는 사전에 알 수 없다) | 0 | **f105** |
| ⑰ | 30일 벽 밖 조회 | **예** — 플랫폼이 조용히 절단한다 | **런타임** — 읽기 전에 `historyRequired` | 0 | idx f38 |
| ⑱ | 빈 권한 결과를 거부로 해석 | **예** — 사용자가 영구히 막힌 UI를 본다 | **라이브러리가 대신 판정** — `conclusive: false`, 상태 불변 | 0 | **f120** |
| ⑲ | 60초 폴링이 예산을 소진 | 예(그리고 회복이 15분 걸린다) | **런타임 예산** — 플랫폼 호출 **전에** `rateLimited` + `retryAfterMs`, 절대 블로킹하지 않는다 | 0 | **f102** |
| ⑳ | 비네이티브 환경에서 import가 던짐 | 아니오(즉시) | **구조** — exports `node`/`browser` 포크. `expo`가 그래프에 **없다**(V1) | 0 | 미션 §4.1 |
| ㉑ | route 스트림을 버리고 나감(핸들 누수) | 예 | **구현 계약** — `return()` → `closeRoute`. 페이크가 `openRouteHandles`를 노출해 테스트가 0을 단언 | 0 | f78 |
| ㉒ | 에러 코드 switch 누락 | 예 | **타입 제공 + 정책** — `assertNeverWorkoutsCode`, 그리고 유니언은 1.x 동안 닫혀 있다(§1-7) | 0 | AGENTS.md §1 |
| ㉓ | 결과 배열을 변조 | 아니오(즉시 드러남) | **타입, 무비용** — 전부 `readonly` | 0 | — |
| ㉔ | `added`를 델타 append로 취급 | **예** — 백필/드레인 경계의 중복이 행을 두 배로 만든다 | **문서 + 페이크** — 페이크가 의도적으로 경계 중복을 재현해 단위 테스트가 잡는다 | 0 | §4.4 |
| ㉕ | 커서만 커밋하고 아이템 유실 | **예 (치명·영구)** | **문서 + 재현 도구** — `drainSync({ killAfterPages })`가 유실을 재현해 보여준다. 라이브러리가 막을 수 없다 | 0 | §4.4 |
| ㉖ | **메트릭 scope를 요청하지 않고 `distanceM`을 기대함** (분할이 만든 읽기 함정) | **예** — 모든 워크아웃에서 영구히 `undefined`, 에러 0건 | **3중 방어, 노브 0개** — (1) 필드별 JSDoc이 게이트하는 scope를 이름으로 말한다(호버), (2) `unpopulatedWorkoutMetrics(state)`가 `'denied'`·`'undetermined'` scope의 **필드 이름**을 돌려준다(Node), (3) `./testing`의 페이크가 scope를 준수해 소비자 **자기 스위트**에서 재현된다. iOS에서는 항상 `[]`(§1-5: `'unknown'`은 고발하지 않는다) | 0 | 소유자 결정 ② · f121 |
| ㉗ | **메트릭 write scope 없이 `saveWorkout`** (분할이 만든 **쓰기 회귀**) | **예 — 그리고 ㉖보다 나쁘다** — 단일 `insertRecords`가 통째로 SecurityException이라 **워크아웃 자체가 저장되지 않는다** | **런타임 사전 검사** — `requiredWriteScopes(workout)`를 플랫폼 호출 **전에** 캐시된 `AuthorizationState`와 대조해 누락 scope를 **이름으로** 담은 `notAuthorized`. `'routes'`만 예외로 기존의 비치명 경로(`route:'notPermitted'`) 유지 | 0 | 소유자 결정 ② · §8.5 |
| ㉘ | 소비자가 `WorkoutKind`를 exhaustive switch로 소진 중인데 **우리가 멤버를 추가** | 아니오 — 소비자 컴파일이 깨진다(시끄럽다) | **정책** — 채택 #29의 0.x 단서: 1.0 이전에는 minor이되 CHANGELOG에 명시, 1.0부터 major, 유니언은 1.0.0 전에 확정 | 0 (그러나 재컴파일 필요) | 소유자 결정 ③ |

### 6.2 기각표 — 과잉 typestate

| 기각 대상 | 근거 |
|---|---|
| `WorkoutId` / `NativeId` 브랜드 타입 | ④를 배타 유니언 하나로 이미 막았다(V3 실측). 브랜드는 SQLite 왕복 때마다 캐스트를 강요하고, 그 캐스트가 브랜드가 막으려던 오용을 통과시킨다 |
| 커서·페이지 토큰 브랜드 타입 | 동일. 런타임 매직 2종이 같은 보호를 비용 0으로 주고, ⑪의 자가 치유(잘못 넣으면 `reset`)는 브랜드로는 얻을 수 없다 |
| 인가 → 읽기 순서 typestate (`AuthorizedWorkouts` 핸들) | iOS read 상태는 **원리적으로 알 수 없다**(idx f14). "인가됨" 타입은 iOS에서 표현할 수 없는 약속이 된다 — 거짓말하는 타입 |
| `Scope` 조합별 능력 교차 타입 | expo-media §0.4 기각 1의 실측 붕괴(애노테이션 한 번에 능력 소실)를 그대로 상속한다 |
| `Milliseconds` 브랜드 | `millis(초)`가 완벽히 컴파일된다 — 실제 사고 모드를 하나도 막지 못한다. 대체: ⑧의 `EPOCH_MS_FLOOR` 런타임 가드(V9) |
| `retryAfterMs`를 코드별 판별 유니언으로 | `rateLimited` 하나에만 붙는 옵셔널이다. 유니언으로 쪼개면 `catch` 분기만 늘어난다 |
| `distanceM`에 miles를 넣는 것을 타입으로 차단 | **불가능하다.** 6.2와 10000은 둘 다 유효한 `number`이고 어떤 브랜드도 값의 단위를 알지 못한다. 방어는 필드 이름(`distanceM`)과 README의 SI 규약뿐이며, 이것이 이 표에서 **유일하게 해결하지 못한 항목**이다 |

### 6.3 타입 픽스처 (`tests/types/*.test-d.ts`)

```ts
// ① availability가 unavailable이면 scope에 도달할 수 없다 (V6)
declare const state: AuthorizationState;
// @ts-expect-error 'read' does not exist until `availability === 'available'`
state.read;
if (state.availability === 'available') expectTypeOf(state.read.heartRate).toEqualTypeOf<ScopeStatus>();

// ② pendingUnlock 브랜치에 nativeId가 없다 (V5 — 이 픽스처가 f70을 컴파일 타임으로 끌어온다)
declare const saved: SaveResult;
// @ts-expect-error 'nativeId' does not exist on the pendingUnlock branch
saved.nativeId;
if (saved.status === 'saved') expectTypeOf(saved.nativeId).toBeString();

// ③ route는 필수이고, 의도를 말해야 한다 (V8 — f95를 컴파일 에러로)
declare const base: Omit<WorkoutWrite, 'route'>;
// @ts-expect-error `route` is required — say `'none'` out loud
const w1: WorkoutWrite = { ...base };
const w2: WorkoutWrite = { ...base, route: 'none' };            // OK
const w3: WorkoutWrite = { ...base, route: [] };                 // 컴파일은 되고 런타임 invalidArgument

// ④ WorkoutRef는 배타적이다 (V2/V3 — C안의 픽스처가 실제로는 통과했던 자리)
// @ts-expect-error id 종류를 밝혀야 한다
deleteWorkout('some-id');
// @ts-expect-error 두 키를 함께 줄 수 없다 (`?: never`가 없으면 이 줄은 통과한다)
deleteWorkout({ clientId: 'a', nativeId: 'b' });
deleteWorkout({ clientId: 'a' });                                // OK
deleteWorkout({ nativeId: 'b' });                                // OK

// ⑤ platformData는 platform으로 좁혀진다 — 캐스트 0 (V4)
declare const w: Workout;
if (w.platform === 'android') expectTypeOf(w.platformData.exerciseType).toBeNumber();
// @ts-expect-error ios 분기에 android 필드가 없다
if (w.platform === 'ios') w.platformData.exerciseType;
// @ts-expect-error narrowing 없이는 읽을 수 없다
w.platformData.activityTypeRaw;

// ⑥ reset은 boolean으로 읽히면서 resetReason을 강제한다 (V7)
declare const page: SyncResult;
const isReset: boolean = page.reset;                             // OK — 미션 스케치와 읽기 호환
// @ts-expect-error resetReason is unreachable without narrowing
page.resetReason;
if (page.reset) expectTypeOf(page.resetReason).toEqualTypeOf<CursorResetReason>();

// ⑦ 시간 인자에 단위가 붙는다
// @ts-expect-error from/to가 아니라 fromMs/toMs
listWorkouts({ from: 0, to: 1 });

// ⑧ 동기화 커서와 페이지 토큰은 다른 표면이다
// @ts-expect-error SyncQuery라는 객체 형태는 없다 — 커서는 위치 인자다
syncWorkouts({ cursor: null });
// @ts-expect-error 첫 호출은 null을 소리내어 말해야 한다
syncWorkouts();

// ⑨ getRoute는 Promise가 아니라 청크의 AsyncIterable이다
expectTypeOf(getRoute('x')).toMatchTypeOf<AsyncIterable<readonly RoutePoint[]>>();
expectTypeOf(getRoute('x')).not.toMatchTypeOf<Promise<unknown>>();
// @ts-expect-error 'always'는 consent 모드가 아니다
getRoute('x', { consent: 'always' });

// ⑩ requestRouteAccess는 존재하지 않는다 (f111 — 의도적 삭제의 회귀 방지)
// @ts-expect-error folded into getRoute(id, { consent: 'prompt' })
requestRouteAccess('x');

// ⑪ 닫힌 유니언
expectTypeOf<RouteState>().toEqualTypeOf<'available' | 'consentRequired' | 'none'>();
expectTypeOf<Workout['indoor']>().toEqualTypeOf<boolean | undefined>();   // f76 — false가 아니다
// @ts-expect-error 'walk'는 WorkoutKind가 아니다
const k: WorkoutKind = 'walk';
// ⚠ 이 자리에 있던 `// @ts-expect-error Scope에 'distance'는 없다` 픽스처는 **삭제됐다** —
//   소유자 결정 ②로 `'distance'`가 실재하는 Scope가 됐고, 남겨두면 TS2578(미사용 directive)로
//   스위트가 깨진다. 기존 픽스처 집합이 이 결정을 조용히 받아들이는 대신 **스스로 감지한다**는
//   뜻이므로 좋은 소식이다. 대체 픽스처는 ㉑·㉑a다.

// ⑫ EOP 소비자 보호 — undefined는 흘려도 되고 null은 안 된다
declare const maybe: number | undefined;
const ok: WorkoutWrite = { ...base, route: 'none', distanceM: maybe };    // OK여야 한다
// @ts-expect-error 모노레포 EOP 규약: null은 받지 않는다
const bad: WorkoutWrite = { ...base, route: 'none', distanceM: null };

// ⑬ 읽기 결과는 깊게 readonly
// @ts-expect-error
w.pauses.push({ startMs: 0, endMs: 1 });
// @ts-expect-error
page.removed[0].id = 'x';

// ⑭ 플랫폼 토큰은 공개 표면에 없다
declare const info: NonNullable<ReturnType<typeof describeCursor>>;
// @ts-expect-error 원시 앵커/토큰은 반환되지 않는다
info.nativeToken;

// ⑮ 순수 유틸에 방어할 수 없는 기본값이 없다
declare const pts: readonly RoutePoint[];
// @ts-expect-error minRiseM은 필수다
routeElevationGainM(pts);
// @ts-expect-error minGapMs는 필수다
derivePauses(pts);

// ⑯ 소비자의 좁은 활동 유니언이 그대로 대입된다 (채택 마찰 0의 타입 증거)
//    ⚠ 방향에 주의: 소비자의 좁은 유니언 → WorkoutKind는 항상 성립하고 멤버를 늘려도 계속 성립한다.
//      반대 방향(WorkoutKind → 소비자 유니언)은 ㉘이 예고한 대로 멤버 추가 시 깨진다.
type ConsumerActivityType = 'walking' | 'hiking' | 'running' | 'cycling';
expectTypeOf<ConsumerActivityType>().toMatchTypeOf<WorkoutKind>();

// ⑰ 페이크와 실물이 같은 계약이다 — 그리고 같은 팩토리의 산출물이다
expectTypeOf(createFakeWorkouts().api).toEqualTypeOf<WorkoutsApi>();
expectTypeOf<typeof import('@gj-kit/expo-workouts').workouts>().toEqualTypeOf<WorkoutsApi>();
expectTypeOf(createFakeNativeWorkouts()).toMatchTypeOf<NativeWorkoutsModule>();

// ⑱ 에러 코드 소진 (닫힌 유니언 정책이 이것을 정직하게 만든다)
declare const code: WorkoutsErrorCode;
switch (code) { /* 14 cases */ default: assertNeverWorkoutsCode(code); }

// ⑲ 플러그인 privacyPolicyUrl은 필수다
// @ts-expect-error
const props: GjKitWorkoutsPluginProps = { read: ['workouts'] };

// ⑳ 두 "." 브랜치의 export 집합이 같다 (§2.4-D 패리티를 타입으로도 고정)
expectTypeOf<typeof import('../../src/index')>()
  .toEqualTypeOf<typeof import('../../src/index.unsupported')>();

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 소유자 결정 ②·③(2026-08-22)이 추가한 픽스처. 전부 실제로 컴파일해 확인했다 — directive 15개에
// 대해 negative control(모든 directive 제거)이 정확히 15개 진단을 냈고, directive를 단 파일은
// EXIT 0(= TS2578 0건)이다. 장식용 directive는 하나도 없다.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// ㉑ Scope는 7종으로 닫혀 있고 'workouts'는 세션 scope다
expectTypeOf<Scope>().toEqualTypeOf<
  'workouts' | 'distance' | 'activeEnergy' | 'elevation' | 'routes' | 'heartRate' | 'steps'
>();
expectTypeOf<(typeof SCOPES)[number]>().toEqualTypeOf<Scope>();

// ㉑a 명명 오용 3종 (전부 TS2322로 발화 확인)
// @ts-expect-error 'energy'가 아니라 'activeEnergy'다 — 우리는 이 자격어를 일부러 붙였다
const sc1: Scope = 'energy';
// @ts-expect-error 'calories'는 Android 쪽 어휘다
const sc2: Scope = 'calories';
// @ts-expect-error 'workoutRoutes'는 Android 권한 이름의 복수형이다
const sc3: Scope = 'workoutRoutes';

// ㉒ coarse 경로가 애노테이션 0으로 타입이 붙는다 — 결정 ② 전체가 이 픽스처에 걸려 있다
const r1: AuthorizationRequest = { read: [...WORKOUT_TOTALS_SCOPES, 'routes'] };   // OK
const r2: AuthorizationRequest = { read: WORKOUT_TOTALS_SCOPES };                  // OK (그대로 대입)
const r3: AuthorizationRequest = { read: ['workouts'] };                           // OK (fine 경로)
const r4: AuthorizationRequest = { read: ['workouts'], write: [...WORKOUT_TOTALS_SCOPES, 'routes'] };

// ㉓ 상수는 얼어 있다
// @ts-expect-error readonly tuple에는 push가 없다 (TS2339)
WORKOUT_TOTALS_SCOPES.push('routes');
// @ts-expect-error readonly tuple 원소는 대입 불가 (TS2540)
WORKOUT_TOTALS_SCOPES[0] = 'routes';
// @ts-expect-error 'elevationGain'은 Scope가 아니다 — TS가 'elevation'을 제안한다
const badScopes: readonly Scope[] = [...WORKOUT_TOTALS_SCOPES, 'elevationGain'];

// ㉔ routeAccess는 ScopeStatus가 **아니다** (분할된 이웃들 사이에서 'routes'가 평범한 요청 가능
//    scope로 읽히는 것을 막는 가드)
declare const s2: Extract<AuthorizationState, { availability: 'available' }>;
expectTypeOf(s2.read.routes).toEqualTypeOf<ScopeStatus>();
expectTypeOf(s2.routeAccess).toEqualTypeOf<RouteAccess>();
// @ts-expect-error 두 어휘는 구조적으로 겹치지 않는다 (TS2367 'no overlap')
const overlap = s2.routeAccess === 'granted';

// ㉔a Record<Scope, ScopeStatus>는 7키 전수다 (채택표 ⑦을 새 폭에서 재잠금)
// @ts-expect-error 여섯 키가 빠졌다 (TS2740)
const partialScopes: Readonly<Record<Scope, ScopeStatus>> = { workouts: 'granted' };

// ㉕ 메트릭 표는 실재하는 Workout 필드만 담고, routeState는 담지 않는다
expectTypeOf<WorkoutMetricField>().toEqualTypeOf<
  'distanceM' | 'activeEnergyKcal' | 'elevationGainM' | 'heartRate' | 'steps'
>();
// @ts-expect-error routeState는 워크아웃별이라 AuthorizationState 스냅샷에서 답할 수 없다
WORKOUT_METRIC_SCOPES.routeState;

// ㉕a 읽기 측 파생은 **필드 이름**으로 답한다 (scope 이름이 아니다)
// @ts-expect-error TS가 'distanceM'에 대해 'distance'를 제안한다 — 이 픽스처가 막는 혼동 그 자체
const asScopes: readonly Scope[] = unpopulatedWorkoutMetrics(s2);

// ㉖ 쓰기 측 파생은 **scope**로 답하고, 결정 ①이 여기까지 전파된다
expectTypeOf(requiredWriteScopes({ ...base, route: 'none' })).toEqualTypeOf<readonly Scope[]>();
// @ts-expect-error `route` 없는 WorkoutWrite는 존재하지 않는다 (TS2345)
requiredWriteScopes({ id: 'x', version: 1, kind: 'running', startMs: 1, endMs: 2 });

// ㉗ WorkoutKind는 9종이다 (D11 개정)
expectTypeOf<(typeof WORKOUT_KINDS)[number]>().toEqualTypeOf<WorkoutKind>();
const k1: WorkoutKind = 'swimming';       // OK
const k2: WorkoutKind = 'wheelchair';     // OK
// @ts-expect-error 'skiing'은 §8.3 기각표의 항목이다 (플랫폼 간 의미 불일치)
const k3: WorkoutKind = 'skiing';
```

> **㉒가 이 문서에서 가장 비싼 픽스처다.** 소유자 결정 ②의 산출물 전체가 "coarse 한 토큰이
> 애노테이션 없이 그대로 대입된다"에 걸려 있으므로 가정하지 않고 **잠갔다**. 함께 실측한 마찰 두
> 가지도 기록해 둔다(둘 다 사용 지점에서 잡히고 메시지가 읽을 만하다): 애노테이션 없는 중간 변수
> `const s = [...WORKOUT_TOTALS_SCOPES, 'routes']`는 `string[]`로 넓어져 TS2322가 되고(`satisfies
> readonly Scope[]` 한 줄로 해소), `.concat('routes')`는 튜플 자신의 4멤버 유니언 때문에 TS2769가
> 된다. README와 JSDoc은 **인라인 spread 형태만** 보여주므로 두 마찰 어디에도 닿지 않는다.

---

## 7. 설정 플러그인 (`withGjKitWorkouts`)

### 7.1 분할 규칙 (미션 §4.3이 Phase 1에 배정한 결정 — 세 후보안 모두 건너뛴 항목)

> **introspect 스냅샷이 증명해야 하는 것은 전부 플러그인이 쓴다.**

근거: 라이브러리 자신의 `AndroidManifest.xml`에 놓인 항목은 Gradle 병합 시점에는 합쳐지지만 `expo config --type introspect`에는 **보이지 않는다**(idx f10). 릴리스 게이트 (c)가 "플러그인의 entitlements / Info.plist / manifest 출력"을 단언해야 하므로, 스냅샷이 못 보는 자리에 둔 것은 **어떤 CI도 지키지 못한다**.

| 항목 | 어디에 | 왜 |
|---|---|---|
| 모든 `<uses-permission android:name="android.permission.health.*">` | **플러그인** | props에서 파생되고 게이트가 집합을 단언해야 한다 |
| `READ_EXERCISE_ROUTES` (manifest-only, 요청 불가) | **플러그인** (`routes`가 read/write 어느 쪽에든 있으면 무조건) | **f112**: 미선언이면 route 요청이 **조용히 null**을 반환한다. 게이트가 반드시 봐야 하는 줄이다 |
| `READ_HEALTH_DATA_HISTORY` | **플러그인** (`history: true`일 때만) | D10 — 기본 off가 계약이므로 스냅샷이 두 조합을 모두 증명해야 한다 |
| `<queries><package android:name="com.google.android.apps.healthdata"/></queries>` | **플러그인** | API 28–33 경로의 provider 가시성. 게이트가 존재를 단언한다 |
| `<meta-data android:name="kit.gj.workouts.PRIVACY_POLICY_URL" android:value="…">` | **플러그인** | props에서 온다. 우리 Activity가 `PackageManager` 메타데이터로 읽는다 |
| `activity-alias` — `android.intent.action.VIEW_PERMISSION_USAGE` + category `android.intent.category.HEALTH_PERMISSIONS`, `android:permission="android.permission.START_VIEW_PERMISSION_USAGE"` | **플러그인** | **f123**: Android 14+ UI가 실제로 띄우는 것이 이것이다(`ACTION_SHOW_PERMISSIONS_RATIONALE`는 API 36에서 한 번도 발화하지 않았다) |
| `activity-alias` — `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` | **플러그인** | RESULTS 261행이 API 28–33 경로를 위해 **유지하라**고 명시한다. 34+에서 발화하지 않을 뿐 제거 대상이 아니다 |
| iOS `com.apple.developer.healthkit = true` entitlement | **플러그인** | 게이트가 단언한다 |
| iOS `NSHealthShareUsageDescription` / `NSHealthUpdateUsageDescription` | **플러그인** | 누락 시 `requestAuthorization`이 **크래시**한다(idx f19). 게이트가 두 키의 존재를 단언한다 |
| `<activity android:name="kit.gj.workouts.PermissionUsageActivity" android:exported="false">` (alias의 타깃 — 모듈이 실제로 shipping하는 컴포넌트) | **라이브러리 매니페스트** | props에 의존하지 않는 **모듈의 고정 부품**이다. 스냅샷이 증명할 것은 alias의 존재이지 타깃 클래스의 존재가 아니며, alias와 타깃은 병합 시점에 함께 검증된다 |

**즉, 라이브러리 `AndroidManifest.xml`은 그 Activity 하나만 담는다.** 그것이 이 규칙의 전부이고, `plugin-introspect` 스냅샷 테스트가 **위 표의 나머지 전부**를 커버한다.

### 7.2 플러그인이 절대 하지 않는 것

- **`minSdk`를 건드리지 않는다** (D7). README가 정확한 manifest-merger 오류 문구(`uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library [androidx.health.connect:connect-client:1.1.0] …`)와 `expo-build-properties` 수정법을 싣는다.
- **`com.apple.developer.healthkit.access`를 쓰지 않는다** (clinical records 전용, idx f19).
- **`healthkit`을 `UIRequiredDeviceCapabilities`에 넣지 않는다** — Expo prebuild는 이것을 자동으로 추가하지 않으며(idx f19 정정), 넣으면 HealthKit 없는 기기에서 앱이 설치조차 되지 않는다.
- `READ_EXERCISE_ROUTES`를 **런타임 요청 집합에 넣지 않는다** — 매니페스트 선언과 런타임 요청은 다른 일이다(f110).

### 7.3 introspect 스냅샷 (`plugin/__tests__`)

`compileModsAsync(config, { introspect: true })`로 다음 조합을 스냅샷한다:

| 시나리오 | 단언 |
|---|---|
| `read: ['workouts']` | **`READ_EXERCISE` 단 하나.** `READ_DISTANCE`·`READ_ACTIVE_CALORIES_BURNED`·`READ_ELEVATION_GAINED` **부재**, `READ_EXERCISE_ROUTES` **부재**, `READ_HEALTH_DATA_HISTORY` **부재** |
| `read: [...WORKOUT_TOTALS_SCOPES]` | 정확히 `READ_EXERCISE` + `READ_DISTANCE` + `READ_ACTIVE_CALORIES_BURNED` + `READ_ELEVATION_GAINED`, `READ_EXERCISE_ROUTES` **부재** |
| `read: ['workouts','distance','activeEnergy','elevation','routes','heartRate','steps'], write: ['workouts','distance','activeEnergy','elevation','routes']` | 권한 전수 + `READ_EXERCISE_ROUTES` **존재** + `WRITE_EXERCISE_ROUTE` 존재 |
| `history: true` | `READ_HEALTH_DATA_HISTORY` 존재 |
| 모든 조합 | `<queries>` 존재 · alias 2종 존재 · `PRIVACY_POLICY_URL` meta-data가 props 값과 일치 · **`minSdkVersion`이 변경되지 않음** |
| 모든 조합 | iOS entitlement `com.apple.developer.healthkit === true` · 두 usage string 존재 · `com.apple.developer.healthkit.access` **부재** · `UIRequiredDeviceCapabilities`에 `healthkit` **부재** |

> **위 두 행이 소유자 결정 ②를 매니페스트 수준에서 증명한다.** `read: ['workouts']`가 권한 1개를, `WORKOUT_TOTALS_SCOPES`가 권한 4개를 낸다는 것이 곧 "개발자가 입도를 고른다"의 관측 가능한 형태다. 이 두 스냅샷이 없으면 결정 ②는 타입 수준의 주장일 뿐이다.

---

## 8. 플랫폼별 구현 계약

### 8.1 iOS 쓰기 — path B 고정 (f61–f70이 강제한 형태)

```
0. `./core` 사전 검사: requiredWriteScopes(workout)를 캐시된 AuthorizationState와 대조.
   누락 scope가 있으면 그 이름을 담은 `notAuthorized`로 즉시 거절한다 ('routes' 제외 — 그것은
   비치명 경로 route:'notPermitted'로 남는다).
   ★ 소유자 결정 ②(Scope 분할)가 만든 필수 단계. 이것이 없으면 share type 누락이 iOS에서
     불투명한 XPC 에러로 나온다(idx f29). §8.5의 Android 쪽과 **같은** 에러를 낸다.

1. 사전 검증 (Swift, HealthKit을 건드리기 전):
   start < end, end <= now, start >= earliestPermittedSampleDate, 샘플 < 24 h,
   lat∈[-90,90] / lon∈[-180,180], bpm∈[1,300], steps > 0, 단위.
   → HKQuantitySample 초기화는 잘못된 입력에 ObjC 예외를 던진다 = 크래시, reject 아님 (idx f28)

2. 사전 조회: HKMetadataKeySyncIdentifier == id 술어로 기존 워크아웃 1건 조회.
   - isProtectedDataAvailable() == false      → 아무것도 쓰지 않고 `storeLocked` throw   (idx f24)
     ★ 이것이 pendingUnlock 재시도의 이중 쓰기를 막는 유일한 방어다.
   - 기존.syncVersion  > version              → `staleVersion` throw (플랫폼 SQLite 에러를 기다리지 않는다)
   - 기존.syncVersion == version              → 워크아웃을 다시 쓰지 않는다. 4단계로 직행(pendingUnlock 재시도 완주)
     ★ idx f26: 동일 version 재저장은 새 UUID를 만들고 기존 연관 샘플·루트를 고아로 만든다.
       크래시 재시도가 곧 데이터 파손이 되는 것을 이 한 줄이 막는다.
   - 기존.syncVersion  < version              → 3단계 (교체)
   - 기존 없음                                 → 3단계 (신규)

3. HKWorkoutBuilder:
   교체인 경우 **먼저** predicateForObjects(from: 기존워크아웃)로 연관 샘플 목록을 확보한다.
   beginCollection
     → addSamples(distance, activeEnergy, heartRate, steps)
       ★ distance quantity type은 **kind에서** 고른다 (D11 개정으로 9종이 됐으므로 3항 연산자가
         아니라 표다 — §8.3 C1..C4):
             cycling     → .distanceCycling                      (ios 8.0)
             swimming    → .distanceSwimming                     (ios 10.0)
             wheelchair  → .distanceWheelchair                   (ios 10.0)
             rowing      → .distanceRowing  ⚠ **ios 18.0** — `if #available(iOS 18.0)`로 감싸고
                           미만이면 거리 샘플을 **쓰지 않는다**. `.distanceWalkingRunning`으로
                           폴백 금지(사용자의 걷기·달리기 총계 오염). 배포 타깃 16.4에 대한
                           **좁은 #available 개정**이며 §8.3 C1에 기록했다
             strength    → **없음** — 거리 샘플을 건너뛴다 (§8.3 C2)
             그 외        → .distanceWalkingRunning
       ★ steps: kind === 'wheelchair'이면 step 샘플을 **쓰지 않는다**. HealthKit은 추진을
         PushCount로 세지 StepCount로 세지 않으므로 StepCount에 넣으면 사용자의 걸음 총계가
         틀린다. `pushes` 입력 필드는 만들지 않는다 (§8.3 C3)
     → addWorkoutEvents(pauses에서 pause/resume)
     → addMetadata(HKMetadataKeySyncIdentifier=id, HKMetadataKeySyncVersion=version,
                   HKMetadataKeyIndoorWorkout=indoor,   ← indoor가 undefined면 **키를 넣지 않는다**
                   ★ @NO를 쓰면 읽기 측이 "outdoor"와 "unknown"을 영원히 구분 못 한다 (f76)
                   HKMetadataKeySwimmingLocationType=(kind === 'swimming'일 때만)
                       indoor === true ? Pool(1) : OpenWater(2)   ← §8.3
                   ★ HC 73/74 중 하나를 고르느라 이미 알고 있는 사실을 Apple Health에서 잃지 않는다.
                     `HKWorkoutConfiguration.lapLength`는 채택하지 않는다 (lap-length 입력이 없다)
                   HKMetadataKeyElevationAscended=elevationGainM,
                   HKMetadataKeyTimeZone=timeZoneId)   ← timeZoneId가 있을 때만.
                   ★ 오프셋만으로는 존을 해석할 수 없으므로 없으면 키를 아예 넣지 않는다
     → endCollection → finishWorkout()
   - (nil workout, nil error) → status:'pendingUnlock', route:'deferred'. **route를 시도조차 하지 않는다.**
     ★ path B를 쓰기 때문에 저장된 워크아웃이 없으면 finishRoute를 아예 부르지 않는다 →
       잠긴 기기가 고아 route를 만들 수 없다 (f66의 파생 이점).
   - 교체인 경우: finishWorkout 후 addSamples(_:to:)로 확보해둔 샘플을 새 워크아웃에 재부착한다 (idx f26)

4. 루트: 위생(§8.2) 후 남은 포인트가 0이면 건너뛰고 route:'dropped'      (f84: 빈 루트 finishRoute는 throw)
   HKWorkoutRouteBuilder(healthStore:device: nil) — **매번 새 빌더**       (f63: 같은 빌더 재-finish는 throw)
     → insertRouteData를 1000포인트씩
     → finishRoute(with: 저장된워크아웃, metadata: [syncId: "<id>/route", syncVersion: version])
   - insertRouteData가 한 번이라도 에러를 내면 그 빌더를 즉시 폐기하고 `io`로 올린다.
     계속 insert하면 안 된다 (f64: 한 번의 insert 에러가 빌더를 조용히 오염시켜 60포인트가 무성의하게 사라진다)
```

**금지 목록 (§9.3의 정적 소스 가드가 문자열로 강제한다)**

| 금지 | 근거 |
|---|---|
| `workoutBuilder.seriesBuilder(for:)` | f64(한 번의 insert 에러가 route 없는 워크아웃을 **에러 없이** 만든다), f65(`discard()`가 워크아웃 저장 자체를 파괴한다), f66(이미 저장된 워크아웃에 붙일 수 없다 — `pendingUnlock` 재시도가 요구하는 능력) |
| 시리즈 빌더에 대한 `discard()` | **f65** |
| `try!` | idx f47 (kingstinct의 크래시 모드) |
| `.runOnQueue(.main)` · 클로저형 `AsyncFunction` | idx f8 — 프로세스 전역 직렬 큐 `expo.modules.AsyncFunctionQueue`에서 36 000포인트 읽기(1.1 s)가 앱 전체를 막는다 |
| route sync id의 워크아웃 간 재사용 | **f68** — 교체 route가 이전 route의 워크아웃 연결을 상속해 두 워크아웃을 교차 연결한다. `"<id>/route"` 파생이 유일한 경로이고 순수 함수가 만든다 |

**`pendingUnlock` 재시도 형태 (f66에서 증명, f70은 재현 불가)**: 같은 `id`/`version`으로 재호출 → 2단계의 사전 조회가 워크아웃을 **재조회**한다(`sameObject=false`여도 동작한다) → 동일 version이므로 워크아웃을 다시 쓰지 않고 → **새** 직접 route 빌더로 붙인다. 멱등이고, 중복도 고아도 만들지 않는다.

> **Phase 3 정정 (iOS 레인, 2026-08-22 · iPhone 17 / iOS 26.5 실기에서 발견). 세 가지.**
>
> **(1) 3단계의 "교체 시 이전 샘플 재부착"은 이중 계상이다 — 삭제로 바꿨다.** 위 3단계는 교체 시
> `addSamples(_:to:)`로 이전 버전의 연관 샘플을 새 워크아웃에 다시 붙이라고 적었다. 그런데 같은
> 3단계가 **payload의 distance·activeEnergy·heartRate·steps 샘플을 이미 새로 쓴다.** 둘 다 하면
> v1의 거리 샘플과 v2의 거리 샘플이 같은 워크아웃에 붙어 `statistics(for:)`가 **합계**를 보고한다 —
> 사용자 건강 데이터의 손상이다. 구현은 **캡처 후 삭제**로 갔다: 교체 직전에 이전 워크아웃의 연관
> 샘플과 route 샘플 uuid를 모아두고, 새 워크아웃이 저장된 직후 그것들을 지운다. 결과적으로
> (a) 저장된 워크아웃 = 방금 쓴 payload(업서트의 정의), (b) idx f26이 말한 "고아가 되어 Health
> 총계에 계속 잡히는" 샘플이 남지 않는다, (c) 이전 route를 먼저 지우므로 f68의 상속 위험도 사라진다.
> 대가는 "새 워크아웃 저장 성공 ~ 정리 삭제" 사이의 크래시가 고아를 남긴다는 것이고, 그 창은 두 호출
> 사이다. `HealthStoring.reattachSamples`는 seam에 그대로 남겼다(설계의 것이고, 구버전이 만든 고아를
> 되살릴 유일한 수단이다).
>
> **(2) `indoor`가 `undefined`여도 iOS는 키를 남긴다 — 우리가 막을 수 없다.** 3단계는 `indoor`가
> 없으면 `HKMetadataKeyIndoorWorkout`을 **넣지 않는다**고 적었고 구현도 그렇게 한다. 그런데
> `HKWorkoutBuilder`가 스스로 스탬프한다: `indoor: undefined`로 쓴 워크아웃을 Health 앱에서 열면
> **Indoor Workout: No**다. f76이 `locationType == .unknown`에 대해 측정한 것과 같은 동작이며, 막을
> API가 없다. 즉 **iOS에서 우리가 쓴 워크아웃은 다시 읽을 때 절대 "indoor 모름"이 될 수 없다.**
> 라이브러리는 키를 날조하지 않는다 — 플랫폼이 한다. 스크린샷:
> `expo-workouts/example/maestro/artifacts/ios-p3-03-health-workout-detail.png`.
>
> **(3) `HKMetadataKeySwimmingLocationType`은 `indoor`를 알 때만 쓴다.** 3단계의 식
> `indoor === true ? Pool(1) : OpenWater(2)`는 `indoor`가 `undefined`일 때 **OpenWater를 날조한다** —
> (2)에서 방금 지킨 f76 규칙과 정면으로 어긋난다. 구현은 `indoor`가 있을 때만 이 키를 쓴다.
>
> **미해결로 남긴 것 (§11로): D11 거리 타입의 SHARE 인가 구멍.** §8.3 C1..C4는 swimming·rowing·
> wheelchair에 대해 `.distanceSwimming`/`.distanceRowing`/`.distanceWheelchair` 샘플을 **쓰라**고 하지만
> §8.8의 iOS 인가 집합은 그 셋을 **요청하지 않는다**(의도적 보수 선택). 그러면 수영 워크아웃에
> `distanceM`을 담아 저장하는 순간 share 미인가로 실패한다. Phase 3은 이것을 **고치지 않았다** —
> 인가 집합을 넓히는 것은 §8.8(소유자 결정 ②)의 소관이기 때문이다. 실기 확인은 아직이다
> `[unverified]`.

### 8.2 루트 위생 (양 플랫폼 동일, `./core`의 순수 함수 — 우리가 100 % 소유한다)

f81·f85가 증명한 것: **HealthKit은 아무것도 거르지 않는다** — `hAcc=80`, `hAcc=-1`, 창 밖 60초, `lat=91`, `lon=181`까지 바이트 동일하게 저장하고 되돌려준다. Health Connect는 같은 입력에 throw한다. 그러므로 위생은 전적으로 우리 몫이고, **양 플랫폼에서 같은 입력이 같은 결과를 내려면 우리가 같은 순서로 해야 한다.**

플랫폼 호출 **전에**, 이 순서로:

| # | 규칙 | 결과 | 근거 |
|---|---|---|---|
| 1 | `route === 'none'` | 루트 없음, `route: 'none'` | §5.2 |
| 2 | `route.length === 0` | **`invalidArgument`** | 빈 배열과 `'none'`은 같은 뜻이어야 할 이유가 없다. 의도를 말하게 한다 |
| 3 | `t`/`lat`/`lon`이 유한하지 않거나 `lat ∉ [−90,90]` / `lon ∉ [−180,180]` | **`invalidArgument`** (드롭이 아니라 거절) | **f85** — 조용히 버리는 것은 데이터 손상 신호를 감추는 것이다 |
| 4 | `hAccM < 0` 또는 `hAccM > 50` 인 점 | **드롭** (`hAccM === undefined`는 유지) | Apple의 문서화된 위생(idx f25) |
| 5 | `t < startMs` 또는 `t >= endMs` 인 점 | **드롭** | ⚠ **미션 §4.3에서의 의도적 이탈** — §4.3은 "`[start, end − 1 ms]`로 clamp"라고 적었다. clamp하면 창 밖 점들이 **전부 같은 경계 instant로 모이고**, 규칙 6의 dedupe가 그것을 **한 점으로 붕괴**시킨다 — 즉 clamp는 타임스탬프를 날조하면서 데이터를 더 많이 파괴한다. Health Connect는 창 밖 점을 거부하므로(idx f41) 드롭이 두 플랫폼을 일치시키는 유일한 방법이다. f86은 창 밖 점이 Health.app에서 **렌더링된다**는 것을 보였으므로 이것은 렌더링 제약이 아니라 **데이터 품질 결정**이며, 그 사실을 여기 명시한다 |
| 6 | `t` 오름차순 정렬 후 같은 `t`는 **마지막 것만** 남긴다 | 정규화 | **f82** — HealthKit은 조용히(호출을 넘나들며) 마지막 것을 남기고 Health Connect는 throw한다 |
| 7 | 살아남은 점이 0 | 루트를 건너뛰고 `route: 'dropped'` | **f84** |
| 8 | **Android만**: `estimateAndroidRecordBytes(...)`가 `MAX_ANDROID_ROUTE_POINTS`(20 000) 또는 960 000 B를 넘음 | **`routeTooLarge`** (플랫폼 호출 전) | **f99, f100**, RESULTS 232행. iOS에는 적용하지 않는다(§0.4 기각 8) |

같은 파일이 **읽기 방향의 sentinel 정리**도 소유한다: `-1` → `undefined`(`hAccM`·`vAccM`·`speedMps`·`courseDeg`), **명시적 `0`은 보존**, `altM`은 그대로 통과(음수 고도는 실제 값이고 `vAccM`이 유효성 플래그다) — **f83**.

`heartRate`도 같은 파일이 정리한다: 창 밖 샘플과 1..300 bpm 밖 샘플을 드롭, `steps <= 0`이면 step record를 아예 쓰지 않는다(idx f44).

### 8.3 활동 매핑 — 읽기와 **쓰기** 양방향 (D11 개정 후 9종, 이 세션에서 전수 실측)

> **소유자 결정 ③ (2026-08-22)**이 `WorkoutKind`를 5종에서 9종으로 넓혔다. 아래 표의 **모든 정수는
> 이 기계에 설치된 산출물에서 직접 읽었다** — 기억이나 문서 인용이 아니다.
> - iOS: `iPhoneOS26.5.sdk/.../HealthKit.framework/Headers/HKWorkout.h`의 `HKWorkoutActivityType`
>   열거체. 이 열거체는 본문 전체에서 **명시 값이 셋뿐**(`AmericanFootball = 1`, `SwimBikeRun … = 82`,
>   `Other = 3000`)이고 나머지는 전부 암묵 후속값이므로 raw 값을 **계산해야** 한다. 계산은 자기
>   검증적이다 — `= 82`가 명시된 `SwimBikeRun` 직전에서 `Cooldown = 80`에 도달하고(즉 SDK가 81을
>   건너뛴다) `Other = 3000`을 재현한다. deprecated 케이스(`Dance=14`, `DanceInspiredTraining=15`,
>   `MixedMetabolicCardioTraining=30`)는 식별했고 **하나도 채택하지 않았다**.
> - Android: `~/.gradle/caches/.../connect-client-1.1.0.aar` → `classes.jar` →
>   `javap -constants -p androidx/health/connect/client/records/ExerciseSessionRecord.class`.
>   상수는 **외부 클래스**에 있다(`$Companion`도 `$ExerciseTypes`도 아니다 — Companion만 보면 아무것도
>   못 찾는다). 선택한 모든 상수가 API 34+ 플랫폼 변환에서 살아남는지는
>   `impl/platform/records/IntDefMappingsKt.<clinit>`의 `SDK_TO_PLATFORM_EXERCISE_SESSION_TYPE`
>   맵(61 entries)을 디스어셈블해 확인했다. **SDK 정수와 platform 정수는 거의 모든 활동에서 다른
>   숫자다** — identity로 가정한 표는 틀린다.
>
> **리서치 인덱스 f36 대조 결과: 인덱스가 나열한 7개 정수(RUNNING=56, RUNNING_TREADMILL=57,
> WALKING=79, HIKING=37, BIKING=8, BIKING_STATIONARY=9, OTHER_WORKOUT=0)는 전부 정확하다 — 정정 없음.**
> 개정 전 §8.3의 iOS 측(`.running=37`, `.walking=52`, `.hiking=24`, `.cycling=13`, `.other=3000`)도 동일하게 확인했다.

**정본 매핑표** (`kind` × `indoor` → 플랫폼 값). `쌍` 열은 Android에 indoor/outdoor **상수 쌍**이
존재하는지, 즉 `indoor`가 Android 왕복에서 살아남는지를 뜻한다.

| `kind` | 쌍 | HK 상수 (raw) | HC 상수 (raw) | `indoor` 처리 |
|---|---|---|---|---|
| `running` | **예** | `.running` = **37** | `RUNNING` = **56** / `RUNNING_TREADMILL` = **57** | `true` → 57 + `HKIndoorWorkout=@YES` · `false`/`undefined` → 56 |
| `walking` | 아니오 | `.walking` = **52** | `WALKING` = **79** | HC에 트레드밀 워킹 상수가 없다. iOS는 값 그대로 기록, Android는 **버려진다** |
| `hiking` | 아니오 | `.hiking` = **24** | `HIKING` = **37** | 두 플랫폼 모두 indoor 변형이 없다. iOS만 기록 |
| `cycling` | **예** | `.cycling` = **13** | `BIKING` = **8** / `BIKING_STATIONARY` = **9** | `true` → 9 · `false`/`undefined` → 8 |
| `swimming` | **예** | `.swimming` = **46** | `SWIMMING_POOL` = **74** / `SWIMMING_OPEN_WATER` = **73** | `true` → 74 · `false`/`undefined` → 73. **iOS는 추가로 `HKMetadataKeySwimmingLocationType`을 쓴다**(아래) |
| `rowing` | **예** | `.rowing` = **35** | `ROWING` = **53** / `ROWING_MACHINE` = **54** | `true` → 54 · `false`/`undefined` → 53. iOS에는 erg/on-water를 구분하는 메타데이터 키가 **없어** `HKIndoorWorkout`이 유일한 운반체다 |
| `strength` | 아니오 | `.traditionalStrengthTraining` = **50** | `STRENGTH_TRAINING` = **70** | iOS만 기록, Android는 버려진다 (`walking`과 동일 지위) |
| `wheelchair` | 아니오 | `.wheelchairWalkPace` = **70** | `WHEELCHAIR` = **82** | iOS만 기록, Android는 버려진다 |
| `other` | 아니오 | `.other` = **3000** | `OTHER_WORKOUT` = **0** | iOS만 기록. **활동 자체가 왕복하지 않는다** — 문서화된 손실 싱크 |

> ⚠ **정수 우연의 함정.** iOS `Hiking`은 24이고 HC `HIKING`은 37인데, iOS `Running`이 37이다. 그리고
> `.other`는 3000, `OTHER_WORKOUT`은 0이다. **두 플랫폼 사이에 정수를 재사용하는 표는 전부 틀린다** —
> 쓰기 방향 매퍼를 passthrough로 쓰면 안 되는 이유이자 §9.4 골든 벡터가 18개 정수를 전부 핀으로
> 박는 이유다.

**읽기 방향 — 위 표의 역, 단 두 개의 READ-ALIAS가 있다.** (개정 전 §8.3은 "읽기 방향은 위 표의
역이다"라고만 적었다. 그 문장은 이제 정확하지 않으므로 여기서 대체한다.)

| 플랫폼 raw | → | 왜 alias인가 |
|---|---|---|
| iOS **20** `FunctionalStrengthTraining` | `{ kind: 'strength' }` | Apple Watch의 근력 워크아웃이 조용히 `'other'`가 되지 않게 한다. **쓰기 방향은 20을 절대 내지 않는다** |
| iOS **71** `WheelchairRunPace` | `{ kind: 'wheelchair' }` | HC는 휠체어를 활동 하나로 모델링하고 iOS는 페이스로 쪼갠다. 우리 모델에 페이스 개념이 없으므로 **쓰기는 언제나 70(walk pace)** 이다 |

Android에는 alias가 없다 — 받는 상수는 전부 내보내기도 한다. `WEIGHTLIFTING`(81)과
`CALISTHENICS`(13)는 `STRENGTH_TRAINING`의 동의어가 **아니라 별개 활동**이므로 alias하지 않는다.

이 두 alias 때문에 **두 매퍼 방향은 더 이상 문자 그대로의 역함수가 아니다.** 단언되는 성질은
`kindFrom*(x*FromKind(kind, indoor)) === {kind, indoor}` 즉 **쓰기-후-읽기**뿐이고, 그것은 alias와
무관하게 성립한다.

**`swimming`의 iOS 읽기 사다리 (f76의 수영 전용 확장 — 명시적으로 적어둔다)**: ① `HKIndoorWorkout`
키가 있으면 그 값. ② 없으면 `HKMetadataKeySwimmingLocationType` — `Pool`(1) → `true`,
`OpenWater`(2) → `false`, `Unknown`(0)/부재 → `undefined`. ③ 그래도 없으면
`workoutActivities[0].workoutConfiguration.locationType == HKWorkoutSessionLocationTypeIndoor(2)`.
쓰기 방향은 대칭으로 `HKMetadataKeySwimmingLocationType`을 **함께** 기록한다 — 그러지 않으면 HC 73/74
중 하나를 고르느라 이미 알고 있는 사실을 Apple Health에서 잃는다(§8.1 3단계의 기존 `addMetadata`
호출을 그대로 쓰므로 새 API가 아니다). `HKWorkoutConfiguration.lapLength`는 **채택하지 않는다** —
lap-length 입력이 없고 만들지 않는다.

**iOS의 `indoor`는 `HKIndoorWorkout` 메타데이터 키에서만 읽는다**(수영은 위 사다리) — raw
`locationType` 3은 outdoor와 unknown을 구분하지 못하므로, 키가 없으면 `indoor: undefined`이지
`false`가 아니다(**f76**). 쓰기 방향도 대칭이다: `indoor === undefined`면 키를 **아예 넣지 않는다**
(`@NO`를 쓰지 않는다).

**왕복 보존 속성 (단위 테스트가 단언한다 — §9.4)**

1. **`kind`는 9종 전부 양 플랫폼에서 정확히 왕복한다.** `'other'`만 예외이며, 왕복하는 것은
   `kind: 'other'`이지 원래 활동이 아니다.
2. **`indoor`는 왕복이 플랫폼 비대칭이다.** iOS에서는 9종 모두 왕복한다. Android에서는
   `running`·`cycling`·`swimming`·`rowing` 넷만 왕복하고, 나머지 다섯은 `undefined`로 읽힌다.
3. **쌍이 있는 넷에서 `indoor: undefined`는 Android 왕복 후 `false`로 정규화된다.** RUNNING(56) ·
   BIKING(8) · ROWING(53) · SWIMMING_OPEN_WATER(73)가 모두 "실내가 아님"을 **적극적으로** 뜻하기
   때문이다. `undefined`는 보존되지 **않는다**. 수영은 이 정규화가 특히 강한 주장("open water")이
   되므로 JSDoc이 그렇게 적는다. 이것을 버그처럼 보이게 두지 않고 **테스트가 단언한다**.
4. **알 수 없는 정수에 대해 두 `kindFrom*`은 `number` 전역에서 total이다** — 음수·비정수·거대값
   포함, 전부 `{ kind: 'other' }`(+ `indoor: undefined`). 단, 두 플랫폼은 **대칭이 아니다**:
   iOS는 raw가 그대로 도착해 `platformData.ios.activityTypeRaw`에 보존되고(예: 16 = Elliptical),
   Android는 `IntDefMappingsKt`가 읽기·**쓰기 양방향** 모두에서 미매핑 정수를 0으로 접어버려
   `platformData.android.exerciseType`이 0을 돌려준다.

**기각한 kind (재론 금지 — 근거를 남긴다)**

| 후보 | 기각 근거 |
|---|---|
| `skiing` | **의미 불일치**(상수 문제가 아니다). HC는 `SKIING`(61) 하나인데 iOS는 `DownhillSkiing`(61)과 `CrossCountrySkiing`(60)으로 쪼갠다. 쓰기 방향이 모든 세션을 Downhill로 찍어야 하므로 크로스컨트리 앱의 워크아웃이 Apple Health에 **틀린 이름으로** 보인다. 두 플랫폼에서 **다른 것을 뜻하는** kind는 왕복하는 척하는 것이다. 양쪽 61이라는 우연이 위험을 키운다 |
| `crossCountrySkiing` | Android 대응이 **아예 없다**(1.1.0에 상수 부재: SKIING=61, SNOWBOARDING=62, SNOWSHOEING=63 사이에 자리가 없다). iOS 1급 + Android OTHER_WORKOUT은 `'other'`보다 **나쁘다** — 없는 왕복을 광고한다 |
| `snowboarding` | 의미는 **깨끗하다**(iOS 67 / HC 62, 둘 다 non-deprecated). 순수히 범위 문제로 기각: `skiing`을 깨끗하게 넣을 수 없는데 스노보드만 넣으면 유니언이 눈에 띄게 비대칭이 된다. **1.0 이전 minor의 최우선 후보**다 |
| `skating` | 양쪽 모두 모호. iOS `SkatingSports`(39)는 catch-all이고 HC는 `SKATING`(60)과 `ICE_SKATING`(39)을 둘 다 가진다. 39/39 우연이 또 다른 뜻이다 |
| `paddling` | 짝은 깨끗(iOS `PaddleSports` 31 / HC `PADDLING` 46)하지만 niche이고, iOS 거리 타입 `DistancePaddleSports`가 **ios(18.0)** 이라 rowing과 같은 `#available` 비용을 지면서 §12-③ 같은 지시 근거가 없다 |
| `elliptical` · `stairClimbing` · `yoga` · `pilates` · `hiit` 등 스튜디오/머신 활동 | 상당수가 1:1로 깨끗하지만(예: iOS Elliptical 16 / HC 25, iOS Yoga 57 / HC 83) **멈출 규칙이 없다.** 하나를 들이면 15개가 따라온다. 표를 9행으로 유지하는 것이 20행 이상으로 늘리는 것보다 방어 가능하다. `stairClimbing`은 추가로 iOS 쪽에 형제가 셋(44/68/69)이고 그 68/69가 HC의 무관한 68/69와 숫자만 겹친다 |
| 구기/라켓/골프 등 ~25종 | 대부분 1:1 짝이 실재하지만(iOS Golf 21 / HC 32, iOS Tennis 48 / HC 76, iOS Soccer 41 / HC 64) 소유자가 요구한 것은 **HealthKit 활동 타입의 전수 분류표가 아니다**. §12-③이 우려한 "두 플랫폼 상수 표를 영구히 따라다녀야 한다"는 30행에서 실재하고 9행에서는 무시할 만하다 |
| `triathlon` / `swimBikeRun` | iOS `SwimBikeRun`(82) + `Transition`(83)은 자식 `workoutActivities`를 갖는 **멀티스포츠 컨테이너**다. Health Connect에는 대응 상수도 중첩 세션 개념도 없고, 모델링하면 §5.1의 평평한 `Workout` 형태가 깨진다. 명시적 범위 밖 |
| `scubaDiving` | iOS 쪽이 `UnderwaterDiving`(84)이고 **API_AVAILABLE ios(17.0)** — 배포 타깃 16.4 위라 `#available` 가드가 필요한데 미션은 v1에 iOS 18 부가 기능을 쓰지 않는다고 못 박았다. 이름 범위도 HC의 'scuba diving'과 완전히 같지 않다 |

**이 확대가 실제로 만든 비용 (숨기지 않는다)**

| # | 비용 | 처리 |
|---|---|---|
| C1 | **`rowing`의 iOS 거리 타입이 `HKQuantityTypeIdentifierDistanceRowing` = `API_AVAILABLE(ios(18.0))`** 이고, 배포 타깃은 16.4다 | §8.1이 `if #available(iOS 18.0)`로 감싸고, 미만이면 **거리 샘플을 아예 쓰지 않는다**(그러면 iOS 18 미만에서 `distanceM`이 `undefined`로 읽히는데, 그것이 정직하다). "iOS v1은 `#available` 가드를 쓰지 않는다"(idx f1)에 대한 **좁은 개정**으로 기록한다. `.distanceWalkingRunning`으로 폴백하지 **않는다** — 사용자의 걷기·달리기 총계와 Activity 링에 조정 미터가 섞인다 |
| C2 | `strength`에는 자연스러운 거리 타입이 **없다** | 거리 샘플을 아예 건너뛴다. `walkingRunning`에 잘못 파일링하지 않는다 |
| C3 | **`wheelchair`의 `steps`** — HealthKit은 휠체어 추진을 `HKQuantityTypeIdentifierPushCount`로 세지 `StepCount`로 세지 않는다. HC에는 `StepsRecord`밖에 없다 | v1: `kind === 'wheelchair'`면 **iOS에 step 샘플을 쓰지 않고** 그 사실을 문서화한다. `pushes` 필드는 **추가하지 않는다**(새 입력 표면). §12 남은 질문 참조 |
| C4 | `swimming`·`wheelchair`의 iOS 거리 타입 | 둘 다 ios(10.0)이라 가드 불필요: `DistanceSwimming`, `DistanceWheelchair` |
| C5 | 표가 9행이 되어 유지 비용이 생긴다 | §9.4의 **골든 벡터**(18개 정수 고정)가 유일한 완화다. 표가 기억이 아니라 핀 박힌 데이터가 된다 |

**아직 기기에서 확인되지 않은 것 `[unverified]`**: 위 상수 값들은 SDK 헤더와 AAR 바이트코드로
확정됐지만, Health Connect가 `SWIMMING_POOL(74)` · `SWIMMING_OPEN_WATER(73)` · `ROWING_MACHINE(54)` ·
`WHEELCHAIR(82)`를 실제 `insertRecords` + `readRecords` 왕복에서 **변형 없이** 저장·반환하는지, 그리고
Apple Health가 `.traditionalStrengthTraining`·`.wheelchairWalkPace`를 기대대로 렌더링하는지는
측정되지 않았다. 상수 값이 틀릴 수는 없지만 플랫폼 측 거부·정규화는 있을 수 있다. 이 네 kind를
**1.0 이전에 §9.5의 T6형 기기 매트릭스에 추가한다**(§11-23).

### 8.4 Android 읽기 — `aggregate()` 없는 메트릭 경로 (미션 §4.3의 실측 기반 뒤집기)

> **미션 §4.3은 "세션당 `aggregate` 1회, `dataOriginFilter = session.dataOrigin`"을 지시한다. Phase 0가 그것을 뒤집었다.** f109: `EXERCISE_DURATION_TOTAL` · `DISTANCE_TOTAL` · `ACTIVE_CALORIES_TOTAL` · `COUNT_TOTAL` 전부가 **빈 `dataOrigins` 집합과 함께 null**을 반환했다 — 좁은 창과 4일 창에서, `dataOriginFilter`를 넣고 빼고, `Instant`와 `LocalDateTime` 오버로드 양쪽에서, 앱이 몇 초 전에 직접 쓰고 `readRecords`로 읽을 수 있는 레코드에 대해, **예외 없이**. 온보딩 전후 모두 동일했고 원인은 불명이다. RESULTS 263행이 `readRecords` + 클라이언트 합산을 **필수**로 만든다.

따라서: **`aggregate(`는 Kotlin 소스에 0건이며 `no-aggregate` 가드가 이를 강제한다.** 두 경로를 유지하면 같은 창이 기기마다 다른 숫자를 낸다.

**페이지 창당 1회 읽기 (C의 산술 + B의 하한 보정)**

```
읽기 = 1 × readRecords(sessions, [fromMs, toMs), pageSize=50)          ← 'workouts' scope, 언제나
     + 1 × readRecords(Distance,           확장된 창)   ← 'distance'     scope를 쥔 경우에만
     + 1 × readRecords(ActiveCaloriesBurned, 확장된 창) ← 'activeEnergy' scope를 쥔 경우에만
     + 1 × readRecords(ElevationGained,    확장된 창)   ← 'elevation'    scope를 쥔 경우에만
     + 1 × readRecords(Steps,              확장된 창)   ← 'steps'        scope를 쥔 경우에만
     + 1 × readRecords(HeartRate,          확장된 창)   ← 'heartRate'    scope를 쥔 경우에만
     = **2–6 requests** (+ 각자의 페이징) — 페이지에 세션이 몇 개든 무관
       확장된 창 = [min(startMs) − maxSessionDurationInPage, max(endMs))
그 다음 클라이언트에서: dataOrigin == session.dataOrigin 이고 세션 창과 겹치는 레코드만 골라 합산
```

> **소유자 결정 ②(Scope 분할)가 이 산술을 고정 6에서 2–6으로 바꿨다.** 쥐고 있지 않은 메트릭
> scope의 `readRecords` 호출은 **건너뛴다**(호출하고 버리는 것이 아니다). 세션 목록만 필요한 앱
> (`read: ['workouts']`)은 페이지당 **1요청**이므로 coarse 모델에서 쓰던 예산의 1/6만 쓴다.
> 900/15 min ReadBudget에 대해 순수한 이득이며, 예전에 적혀 있던 "6"을 하한으로 읽지 않도록 여기에
> 명시한다. (§5.3의 `listWorkouts` JSDoc이 같은 수를 말한다 — 그 자리에 있던 "5–9"는 이 표와
> 어긋나 있었고 함께 정정했다.)

* **왜 세션당이 아닌가**: 40일·200세션 백필이 세션당이면 `200 × 5 + 4 = 1004` 요청 = **15분 예산(1000) 전체**. 페이지당이면 `4페이지 × (2–6 + 페이징)` = 최악 36요청 = 3.6 %. **27배**다. 분할 이후 메트릭 scope를 덜 쥔 앱은 이보다 더 적게 쓴다.
* **왜 하한을 넓히는가**: `readRecords`의 창 규칙은 **start instant** `[from, to)`다(**f107**). 세션 시작 전에 시작한 Distance/Steps 레코드는 그냥 놓친다. 확장폭은 매직 상수가 아니라 **그 페이지에서 파생된 값**(페이지 내 최장 세션 길이)이다.
* **`ACTIVE_CALORIES_TOTAL`만 읽는다.** `TotalCaloriesBurnedRecord`는 절대 폴백으로 쓰지 않는다 — BMR이 섞여 있어 거의 null이 나지 않으므로 조용히 틀린 숫자를 준다(idx f37).
* **null은 언제나 `undefined`다.** `0 kcal`/`0 m`으로 새지 않는다.
* **페이지 크기는 Android 50, iOS 200.** f116: route 권한을 쥔 상태에서 `readRecords` 페이지는 그 안의 **모든 route를 즉시 materialise**한다(139 423포인트 → 435–792 ms vs 23–55 ms, 12×–19×, 억제 옵션 없음). 그래서 보수적으로 페이징하고, **이미 materialise된 route를 네이티브 캐시(프로세스 수명, LRU, `Data`만, 최근 1페이지 + 총 200 000포인트 상한)에 넣어** 직후의 `getRoute`가 추가 읽기 없이 끝나게 한다. 이것이 f116을 손해가 아니라 자산으로 바꾸는 유일한 방법이다.

### 8.5 Android 쓰기와 **항상 켜진 read-back**

```
0. ./core 사전 검사 (소유자 결정 ②가 만든 필수 단계 — 이것이 없으면 분할이 쓰기 회귀를 낸다):
   requiredWriteScopes(workout)를 캐시된 AuthorizationState와 대조.
   ★ coarse 모델에서는 write:['workouts']가 WRITE_DISTANCE·WRITE_ACTIVE_CALORIES_BURNED·
     WRITE_ELEVATION_GAINED·WRITE_STEPS를 전부 줬다. 분할 후에는 WRITE_EXERCISE만 준다.
     아래 2단계는 **단일 트랜잭션**이므로 하나라도 없으면 SecurityException으로 **통째로 실패**하고
     워크아웃 자체가 저장되지 않는다. 그래서 플랫폼을 건드리기 전에 이름을 담아 `notAuthorized`.
   ★ 'routes'는 예외다 — 던지지 않고 기존의 비치명 경로(route:'notPermitted')를 유지한다.
   ★ 워크아웃이 실제로 담은 필드에서 파생하므로 과다 요구가 없다: distanceM이 없으면 'distance'도
     요구하지 않는다. steps: 0은 (idx f44에 따라 레코드를 쓰지 않으므로) 'steps'를 요구하지 않는다.
1. ./core 검증 + Kotlin 사전 가드 (§8.2 8단계)
2. 단일 insertRecords 트랜잭션:
     ExerciseSessionRecord(+ exerciseRoute — WRITE_EXERCISE_ROUTE를 쥐고 있을 때만)
   + DistanceRecord + ActiveCaloriesBurnedRecord + ElevationGainedRecord
   + StepsRecord(> 0일 때만 — 0은 throw, idx f44)
   + HeartRateRecord(1..300 bpm, 세션 창 안)
   Metadata.activelyRecorded(Device(TYPE_PHONE), clientRecordId, clientRecordVersion = version)
   clientRecordId 규약:  "<id>#session" · "<id>#session:distance" · ":kcal" · ":elev" · ":steps" · ":hr"
                        ★ f98이 디바이스에서 검증한 패턴 그대로
   zone offset은 호출자의 utcOffsetMin, 없으면 ZoneId.systemDefault().rules.getOffset(instant)
   ★ 루트 권한이 없으면 루트만 빼고 쓰고 쓰기를 실패시키지 않는다 → route:'notPermitted'
   ★ 전상태(full-state)로만 쓴다 — 루트를 빼고 업서트하면 저장된 루트가 파괴된다 (f95)

3. read-back (항상, 옵션 아님):
   대상 = DistanceRecord → ActiveCaloriesBurned → Steps → HeartRate → 세션 중 **첫 번째로 존재하는 것**
   ★ 세션을 마지막에 두는 이유: 세션 read-back은 루트를 강제로 materialise한다(f116).
     메트릭 레코드는 같은 트랜잭션·같은 clientRecordVersion이라 판정에 등가이면서 루트가 없다.
     ⚠ 거리·칼로리·걸음·HR을 하나도 보내지 않은 워크아웃은 세션 read-back으로 떨어져 루트를 다시
       materialise한다. 이것은 추론이지 측정이 아니다(§11-4).
   읽은 clientRecordVersion < 우리가 보낸 version  →  `staleVersion` throw
```

**read-back은 옵션이 아니다 — `verifyWrite` 노브는 존재하지 않는다** (채택 #14 · §0.4 기각 22 · **소유자 결정 ④(2026-08-22)로 확정**). **왜 opt-in이 아니라 항상인가**: f93/f94 — 낮은 version은 `insertRecords`에서 **정상 반환**하고 같은 UUID를 돌려주며, 직후의 `getChanges` 드레인은 **바뀌지 않은 레코드**를 담은 `UpsertionChange` 1건을 낸다. 읽어보는 것 말고 탐지 수단이 없다. RESULTS 231행은 "opt-in `verifyWrite`로 만들거나 문서화하라, read-back 없이 `staleVersion`을 보고하는 척하지 마라"고 못 박는데, 옵션으로 두면 **그것이 가장 필요한 호출자**(서버에서 온 편집을 오프라인 반영하는 앱)가 켜지 않는다. 측정된 사용 패턴은 활동당 쓰기 1회이고 읽기 1건은 15분 예산의 **0.1 %**다. 그 대가는 §11-2에 정직하게 적었다. 소유자는 2026-08-22에 이 형태(옵션 A: 무조건 read-back, 배치 API 없음, `verifyWrite` 없음)를 **확정**했다 — §12-④는 닫혔다.

### 8.6 삭제 — 양 플랫폼 고아 금지

**Android**

```
1. { clientId } 이면 그대로, { nativeId } 이면 readRecord(id)로 clientRecordId와 dataOrigin을 먼저 얻는다.
   ★ 이 한 단계가 { nativeId } 경로의 메트릭 고아를 막는다.
   - UUID 형식이 아니면 `invalidArgument` (f96: malformed recordId는 errorCode 3으로 throw한다)
   - 레코드 없음 → { deleted: false }   (f96: 알 수 없는 id는 조용하다 — 에러가 아니다)
   - dataOrigin != 우리 패키지 → `notAuthorized`
2. deleteRecords를 타입별로 6회: 세션 + Distance/ActiveCalories/ElevationGained/Steps/HeartRate
   ★ 메트릭 레코드는 세션 삭제로 cascade되지 않는다 (f98). 루트는 cascade된다.
   ★ 존재하지 않는 id는 조용하므로(f96) 여분의 삭제 호출은 무해하다.
3. { deleted: true }
```

**iOS**

```
1. { nativeId } → UUID 파싱, { clientId } → HKMetadataKeySyncIdentifier 술어로 조회
   - 없으면 { deleted: false }
2. sourceRevision.source.bundleIdentifier != Bundle.main.bundleIdentifier → `notAuthorized`
3. predicateForObjects(from: workout)로 (a) HKSeriesType.workoutRoute() (b) 우리가 쓰는 모든
   quantity type의 연관 샘플을 조회해 **먼저** 삭제한다
   ★ store.delete(workout)은 연관 샘플·루트를 cascade하지 않는다 (idx f26)
4. 워크아웃 삭제 → { deleted: true }
```

**대칭 규약**: 남의 워크아웃 삭제 시도는 양 플랫폼 모두 `notAuthorized`. 알 수 없는 id는 양쪽 모두 `{ deleted: false }`(throw 아님). malformed id는 양쪽 모두 `invalidArgument`.

### 8.7 iOS 읽기 — totals · provenance · 시간창

- **시간창은 언제나 `HKQuery.predicateForSamples(withStart:end:options: .strictStartDate)`다.** 기본(overlap) 술어는 자정을 넘는 워크아웃을 **두 날에 중복 계상**하고, **`.strictStartDate + .strictEndDate`는 그 워크아웃을 어느 날에도 속하지 않게 만든다**(f87, 양 경계 증명됨). 두 금지 모두 §9.3의 Swift 소스 가드가 문자열로 잡는다.
- **비동기 디스크립터만 쓴다** — deployment target 16.4이므로 `#available` 가드가 필요 없다(idx f1).
- **totals 3-tier 순서** (RESULTS 205행): ① `statistics(for:)` → ② *(방어적, iOS 26.5에서는 도달 불가)* deprecated `totalDistance`/`totalEnergyBurned`를 경고 억제 래퍼로 → ③ 시간창 `HKStatisticsQueryDescriptor` + `.strictStartDate`. **tier 2를 코드에서 지우지 않는다** — 구형 OS를 위해 유지하라는 명시적 지시이고, f73은 iOS 26.5에서 도달 불가일 뿐이라고 말한다.
- **provenance** (RESULTS 206행, f71): tier 1이 값을 줬어도 `HKQuery.predicateForObjects(from: workout)` 샘플 조회가 **> 0**일 때만 `'associated'`다. 0이면 그것은 합성된 legacy total이므로 **`'total'`**로 태그해야 한다. tier 3은 언제나 `'derived'`이며, f74가 측정한 대로 **워크아웃과 무관한 숫자**(4321 m 대신 999 m)일 수 있다는 뜻이다.
- **distance quantity type을 활동에서 고른다**: `kind === 'cycling' ? .distanceCycling : .distanceWalkingRunning`. 읽기와 쓰기 모두. (세 후보안 4 636줄 전체에 `distanceCycling`이 **0회** 등장했다 — 그대로 갔다면 사이클링 워크아웃의 `distanceM`이 언제나 `undefined`였을 것이다.)
- **`activeDurationS`는 iOS에서 `workout.duration`, wall clock은 `endDate − startDate`** — 같은 워크아웃에서 1500 s vs 1800 s로 측정됐다(f75). 둘을 섞지 않는다.
- **루트 읽기**: `HKWorkoutRouteQueryDescriptor(route).results(for:)`를 순회하며 **1000포인트마다 변환·해제**하고 `[CLLocation]` 전체를 절대 누적하지 않는다(f78: 415 B/포인트, 26배). 워크아웃의 route 샘플은 0..n개이므로 **시간순 병합 후 중복 타임스탬프를 제거**한다(idx f13, f82). 방어적 teardown·`autoreleasepool` 곡예·health store 재활용은 **넣지 않는다** — 310회 전체 읽기에서 두 API 모두 누수가 없었고(f77), kingstinct #370은 그들 리테인 그래프의 버그다.


> **Phase 3 정정 (iOS 레인, 2026-08-22 · 실기에서 발견). 두 가지 — 둘 다 §5.7 10행의 "iOS 읽기 거부는
> 에러가 아니라 빈 결과"가 절반만 맞다는 데서 나온다.**
>
> **(1) 요청한 적 없는 타입의 읽기는 빈 결과가 아니라 THROW다.** 10행이 말하는 것은 사용자가
> **거부한** 읽기다. 앱이 애초에 **요청하지 않은** 타입을 조회하면 HealthKit은 빈 배열이 아니라
> `errorAuthorizationNotDetermined`로 실패한다. 실기에서 이것은 `notAuthorized`로 나타났고, 원인은
> 교체·삭제 경로의 **고아 청소 쿼리**가 §8.8이 의도적으로 인가하지 않는 swimming·rowing·wheelchair
> 거리 타입을 물어본 것이었다. 그래서 **보조 읽기**(메트릭 레코드 · 심박 · route 샘플 · 연관 샘플 ·
> tier 3 통계 · provenance 판별)는 인가 계열 HKError 4종을 **빈 결과로 접는다**. 워크아웃 창 조회와
> 앵커드 드레인은 접지 않는다 — 워크아웃 자체를 못 읽는 앱에 빈 히스토리를 조용히 주는 것은 숨김이다.
>
> **(2) `wouldPrompt`는 READ 방향만 묻는다.** `getRequestStatusForAuthorization(toShare:read:)`에 share
> 집합까지 넣으면, "쓰기는 4종만 요청하고 읽기는 7종을 요청하는" 정상적인 앱에서 heartRate·steps의
> **share**가 영원히 미결로 남아 `wouldPrompt`가 **영구히 true**가 된다. 그러면 §9.1이 요구하는
> `'undetermined'`(물어봐라) → `'unknown'`(플랫폼은 영원히 말하지 않는다) 전이가 사용자가 전부
> 허용한 뒤에도 일어나지 않는다. 실기에서 정확히 그렇게 됐다. share 방향은 이미 `statuses`가 타입별
> 진실을 담고 있으므로, `wouldPrompt`는 read 집합에 대해서만 묻는다.

### 8.8 Scope → 플랫폼 권한 매핑 (정본 — 소유자 결정 ②)

**iOS.** HealthKit은 이미 객체 타입 단위로 인가하므로, 분할된 어휘가 coarse 어휘보다 **더 충실하다**.
`requestAuthorization(toShare:read:)`의 두 집합을 그대로 표로 적는다.

| scope | READ (`HKObjectType`) | SHARE / WRITE |
|---|---|---|
| `workouts` | `HKObjectType.workoutType()` | 같음 |
| `distance` | `HKQuantityType(.distanceWalkingRunning)` **AND** `HKQuantityType(.distanceCycling)` — **언제나 둘 다** | 같은 둘 |
| `activeEnergy` | `HKQuantityType(.activeEnergyBurned)` | 같음 |
| `elevation` | **∅ (빈 집합)** | **∅ (빈 집합)** |
| `routes` | `HKSeriesType.workoutRoute()` | 같음 |
| `heartRate` | `HKQuantityType(.heartRate)` | 같음 |
| `steps` | `HKQuantityType(.stepCount)` | 같음 |

* **`distance`가 두 quantity type을 함께 요청하는 이유**: 인가는 워크아웃을 하나도 읽기 **전에**, 단
  한 번 일어난다. 워크아웃의 활동은 그 시점에 알 수 없으므로, 한 타입만 요청하는 scope는 정확히 한
  부류의 워크아웃에서 `distanceM`을 **영구히 `undefined`**로 만든다. §8.7이 이미 잡은 버그다(세 후보안
  4 636줄 전체에 `distanceCycling`이 0회 등장했다). 그러므로 이 scope는 단일 HK 타입이 아니라
  **능력**("이 라이브러리의 워크아웃에 대한 거리")을 이름한다. 대가는 달리기만 하는 사용자가 HealthKit
  시트에서 Cycling Distance 행 하나를 더 보는 것이고, 그 반대는 조용히 빈 필드다.
  ⚠ D11 개정으로 `swimming`·`rowing`·`wheelchair`가 들어왔지만 **인가 집합은 넓히지 않았다** —
  §8.3 C1..C4의 거리 타입들은 **쓰기 경로에서만** 쓰인다. 읽기 측 §8.7은 여전히 두 타입만 조회한다.
  이것은 의도적인 보수 선택이며, 그 결과 iOS에서 수영·조정·휠체어 워크아웃의 `distanceM`은
  **우리가 쓴 것이 아니면** `'derived'` tier 3으로만 채워진다. `[unverified]` — 실기에서 확인할 항목.
* **`elevation`이 iOS에서 빈 집합인 이유**: `HKMetadataKeyElevationAscended`는 워크아웃 객체 **위의
  메타데이터**이고(§8.1 3단계, idx f58) 자기 `HKObjectType`이 없다. 결과적으로 iOS에서 이 scope는
  `workouts`를 **alias**한다 — `read.elevation`은 다른 모든 iOS read scope와 같이 `'unknown'`이고,
  `write.elevation`은 `write.workouts`를 그대로 따른다. **모델 전체에서 두 scope가 독립이 아닌 유일한
  자리**이며, `Record<Scope, ScopeStatus>`에 `'inapplicable'` 같은 넷째 상태를 만드는 대신 여기에
  적어둔다.

**Android.** 런타임 contract 집합이자 플러그인의 `<uses-permission>` 줄. 전부 `android.permission.health.*`(idx f32).

| scope | READ | WRITE |
|---|---|---|
| `workouts` | `READ_EXERCISE` | `WRITE_EXERCISE` |
| `distance` | `READ_DISTANCE` | `WRITE_DISTANCE` |
| `activeEnergy` | `READ_ACTIVE_CALORIES_BURNED` | `WRITE_ACTIVE_CALORIES_BURNED` |
| `elevation` | `READ_ELEVATION_GAINED` | `WRITE_ELEVATION_GAINED` |
| `routes` | `READ_EXERCISE_ROUTES` ★ | `WRITE_EXERCISE_ROUTE` (단수) |
| `heartRate` | `READ_HEART_RATE` | `WRITE_HEART_RATE` |
| `steps` | `READ_STEPS` | `WRITE_STEPS` |

★ `READ_EXERCISE_ROUTES`는 **매니페스트 전용**이다. `'routes'`가 read/write 어느 쪽에든 있으면
플러그인이 선언하고(f112: 미선언이면 route 요청이 조용히 null), **런타임 요청 집합에는 절대 넣지
않는다**(f110). §7.2가 이미 금지하며 분할은 이것을 바꾸지 않는다.

**증거 등급 (정직하게 표기 — 이 표에서 가장 약한 줄이다).** `READ_EXERCISE` · `WRITE_EXERCISE` ·
`READ_EXERCISE_ROUTES` · `WRITE_EXERCISE_ROUTE` · `READ_DISTANCE` · `READ_HEALTH_DATA_HISTORY` ·
`READ_HEALTH_DATA_IN_BACKGROUND`는 기기에서 `pm grant`로 실제 부여됐다(f52). `READ_ACTIVE_CALORIES_BURNED` ·
`READ_ELEVATION_GAINED` · `READ_HEART_RATE` · `READ_STEPS`는 **`[official-doc]`**(idx f32)이다.
~~**5종의 per-type `WRITE_*` 문자열은 Health Connect의 문서화된 명명 규칙에서 파생한 것이고 Phase 0가
개별적으로 `pm grant`한 적이 없다 — `[unverified]`.**~~ → **Phase 3에서 닫혔다 (Android 레인, 2026-08-22).**
§9.5 기기 게이트 6번을 실제로 실행했다: `adb shell pm grant kit.gj.workouts.example
android.permission.health.WRITE_{DISTANCE,ACTIVE_CALORIES_BURNED,ELEVATION_GAINED,HEART_RATE,STEPS}`
다섯 줄 전부 `rc=0`이고 `dumpsys package`가 다섯 문자열 모두
`granted=true, flags=[USER_SENSITIVE_WHEN_GRANTED|USER_SENSITIVE_WHEN_DENIED]`로 보고했다
(`Pixel_9a_hcprobe`, API 36, HealthFitness APEX 360526040). 다섯은 `scope-mapping.json`의
`$evidence.deviceGranted`로 옮겼고 `$evidence.unverified`는 **비었다**. plugin 파리티 테스트와 Kotlin
`ScopeMappingTest`가 그 이동을 되돌릴 수 없게 단언한다. **§11-24는 닫혔다.**

**소유권**: 런타임 매핑은 Swift/Kotlin이 갖지만, **표 자체는 `tests/fixtures/scope-mapping.json`의
공유 골든 벡터로 고정한다**(§9.4 패턴). XCTest · Kotlin JUnit · TS plugin-introspect 스냅샷이 **한
파일**에 대해 단언한다. 이것이 없으면 매핑 변경이 3방향으로 조용히 표류한다.

**커서는 바뀌지 않는다.** §4.2의 `g` 지문은 부여된 **권한 문자열**의 정렬 목록에 대한 FNV-1a이지
scope 이름에 대한 것이 아니다. 따라서 어휘 변경이 기존 커서를 무효화하지 않고, `scopesChanged`도
그대로 작동한다 — 사용자가 나중에 `READ_DISTANCE`를 허용하면 지문이 뒤집혀 `reset: true`가 나고
재백필이 이미 동기화된 워크아웃의 `distanceM`을 채운다. 읽기 함정이 **한 번 다시 물어보면 자가
치유되는** 것은 이 기계 덕분이다.

---

## 9. 테스트 계층 계획

| 계층 | 실행 | 기기 | 무엇을 증명하는가 | 무엇을 **증명하지 못하는가** |
|---|---|---|---|---|
| unit | `pnpm test` (vitest, node) | 없음 | 프로토콜·정규화·에러 매핑·예산·전 파이프라인 (§9.1) | 네이티브가 우리 DTO를 실제로 그렇게 채우는지 |
| type | `pnpm test:types` | 없음 | §6.3 픽스처 **27종** (§9.2) | 런타임 값의 단위 |
| guard | `pnpm test` 안 (정적 스캔 + 실행) | 없음 | 금지 API·peer 그래프·순수성·import 안전·코드 패리티 (§9.3) | 네이티브 코드가 컴파일되는지 |
| native | XCTest / JUnit | 없음(시뮬레이터/에뮬레이터 불필요 — seam 페이크) | Swift·Kotlin이 공유 시나리오 표와 골든 벡터에 대해 TS와 **같은 결론**을 내는지 (§9.4) | 실제 HealthKit/Health Connect의 응답 |
| device | 로컬 게이트 (CI 아님) | 시뮬레이터 + 에뮬레이터 | 자기 검증 루프 · Maestro 스모크 (§9.5) | `pendingUnlock` · API 28–33 · `USER_FIXED` · 30일 벽 × route 다이얼로그 |

### 9.1 unit (`pnpm test`) — **`expo`·`react-native` 모킹 0**

`./testing`의 **네이티브 seam 페이크**만으로 전 파이프라인을 돈다. 페이크 위에서 도는 것은 `src/core/api.ts`의 **진짜 코드**다(§3.5).

**프로토콜 (핵심)**

| 대상 | 케이스 |
|---|---|
| 커서 코덱 | 왕복 · 잘린 문자열 · 비-base64 · base64인데 비-JSON · 매직 없음 · 미래 버전 · 과거 버전 업그레이드 · 다른 플랫폼 태그 · shape 검증 실패 → **`CursorResetReason` 6종 전수**, 그리고 **어느 경우에도 throw 0** |
| `describeCursor` | 플랫폼 토큰(`k`)의 **어떤 부분 문자열도** 반환 객체의 JSON 직렬화에 등장하지 않음 |
| **갭 없음 속성 테스트 (fuzz)** | 무작위 객체 타임라인(생성/수정/삭제) × 무작위 크래시 지점 × 무작위 페이지 크기 × 1000회. 불변식: 백필+드레인 완주 후 저장소 == `{w : startMs >= horizon}`인 진실 집합. ⚠ 이것은 **완화이지 증명이 아니다** — 플래너와 오라클이 전제를 공유한다. 대수적 논거는 §4.4이고 산문이다 |
| `reduceSyncPage` | 같은 id가 `added`+`removed`에 동시 등장 → `removed`에서 제거(f92) · iOS `replaced` 4단계 판정 · Android `replaced` 항상 false · purge된 삭제 후 워크아웃이 `removed` 없이 사라짐 |
| `reconcileSyncPage` | rekey/delete/upsert 3분할 · `clientId` 매칭 · 모르는 id 삭제가 no-op임을 호출자 관점에서 |
| scope 지문 | 넓힘·좁힘 모두 `scopesChanged` · 지문이 같으면 reset 없음 |
| `ReadBudget` | 주입 클록으로 슬라이딩 윈도 경계 · 900/15분과 4500/24h 각각의 소진 · `retryAfterMs`가 가장 오래된 항목의 만료까지 · **절대 블로킹하지 않음** · **480회 폴링 시뮬레이션 → 소진 → `rateLimited` → 소비자 어댑터가 계속 산다** |

**정규화·도메인**

| 대상 | 케이스 |
|---|---|
| `normalizeRouteForWrite` | §8.2의 8규칙 × 경계: `lat=91`/`lon=181` **거절**(f85) · `hAcc=80` 드롭 · `hAcc=-1` 드롭 · `hAcc=0` **유지** · 창 앞 60 s / 뒤 60 s 드롭 · 중복 `t` **마지막 승**(f82) · 정렬 · 0점 생존 시 `'dropped'`(f84) · 20 000 초과 시 `routeTooLarge`(Android만) |
| sentinel 정리 | `speed=-1`→undefined · `course=0`→**0 유지** · `vAcc=-1`→undefined · `alt=-50`→**-50 유지**(고도는 센티널이 아니다) — **f83** |
| `estimateAndroidRecordBytes` | f100 공식 재현 · f99 경계(20 828 OK / 20 829 = 1 000 004 B FAIL) 재현 · **optional 필드가 비용 0**임을 단언 |
| 활동 매핑 | §8.3 표 **양방향 전수**(9 kind × `indoor` 3값 = 27조합) · 골든 벡터 `activity-vectors.json`의 **정수 18개 고정** · `RUNNING_TREADMILL(57)`→`{running, indoor:true}` · `SWIMMING_POOL(74)`→`{swimming, indoor:true}` · **쌍이 있는 넷은 `indoor: undefined → false` 정규화**, 나머지 다섯은 Android에서 `indoor → undefined` · read-alias(iOS 20→`strength`, 71→`wheelchair`)와 **쓰기가 20·71을 내지 않음** · 미지의 int(`0`·`-1`·`3000`·`2^31−1`·비정수) → `'other'`에서 total · `kindFromIos(16)==='other'` **이면서** `activityTypeRaw===16` · `'other'` 왕복이 손실적임을 명시적으로 단언 |
| `activeDurationS` · `indoor` | Android `(end−start) − Σ PAUSE`(REST 제외) · iOS는 저장된 `duration`(f75) · metadata 키 없고 locationType 3 → **`undefined`**(f76) |
| 창 검증 | `[from,to)` 경계 4종 · `fromMs >= toMs` · 비정수 · **`EPOCH_MS_FLOOR`: 초 값 거절, `0` 허용, 정상 ms 통과**(V9) · 24 h 상한 |
| 인가 도출 | 빈 집합 → `conclusive:false` + 상태 불변(f120) · 비어있지 않음 → before/after 비교로 granted/denied · `read.routes`는 절대 `denied` 안 됨(f110) · iOS read는 `undetermined`/`unknown`만 · **`Record<Scope, ScopeStatus>` 7키 전수, 구멍 0** · **메트릭 scope 단독 요청(`read:['distance']`) → `invalidArgument`** |
| **scope 파생 2종** (소유자 결정 ②) | `unpopulatedWorkoutMetrics`: `read:['workouts']`만 → `['distanceM','activeEnergyKcal','elevationGainM','heartRate','steps']` · `WORKOUT_TOTALS_SCOPES` 전부 granted → `['heartRate','steps']` · **전부 `'unknown'`인 iOS 상태 → `[]`**(§1-5) · unavailable/updateRequired → `[]` · `'undetermined'`가 `'denied'`와 **동등하게** 잡히는지(이것이 함정의 실제 모양이다). `requiredWriteScopes`: 맨 `{route:'none'}` → `['workouts']` · 전부 채운 워크아웃 + `steps:0` → `['workouts','distance','activeEnergy','elevation','heartRate','routes']`(**`'steps'` 부재** — idx f44) |
| **scope 준수 페이크** | 페이크에 완전히 채운 워크아웃을 심고 `['workouts']`로만 인가 → `listWorkouts`가 `distanceM: undefined`를 돌려준다 · 쓰기 측은 누락 scope 이름을 담은 `notAuthorized` |
| `authorizationAdvice` | 진리표 전수 · **`unknown`이 절대 `openSettings`를 유발하지 않음** |
| 에러 매핑 | §5.7 전수 매핑표의 **62행이 각각 하나의 케이스**다(네이티브 예외 페이로드를 `failNext`로 주입). 61·62행은 플랫폼 호출 **전에** 던지므로 페이크 주입 없이도 도달한다 |
| `WorkoutsError` | 엔트리 사본 **2개를 실제로 로드**해 `Symbol.for` 태그의 교차 인식을 단언(`instanceof`는 깨지는 것이 정상) |

**파이프라인 (seam 페이크 위에서 — 이것이 진짜 JS 계층을 돈다)**

- 동기화: `null` → `reset:true`+`'noCursor'` → `listWorkouts` 백필 → 커밋 → 증분 → `hasMore` 드레인 → 만료 → `reset:true`+`'expired'` → scope 변경 → `'scopesChanged'`.
- `replaced`: iOS 페이크 재저장 → `removed[{replaced:true}]` + `added` / Android 페이크 재저장 → **removal 없음**.
- `routeState` × `getRoute`: §5.7의 25–34행 전부 × `consent: 'skip' | 'prompt'`, 그리고 **중간 `break` 후 `openRouteHandles === 0`**.
- `saveWorkout`: `saved` / `route:'notPermitted'` / `route:'dropped'` / `routeTooLarge` / `staleVersion` / **`pendingUnlock` → 동일 `(id, version)` 재시도 → 워크아웃이 하나뿐이고 route가 붙는다**(미션이 지목한 double-save 위험의 유일한 커버리지).
- `deleteWorkout`: `{clientId}`와 `{nativeId}` **양쪽 모두 6회 삭제 호출**을 단언(f98) · 없는 id → `{deleted:false}` · 남의 것 → `notAuthorized`.
- 소비자 어댑터: README 예제 파일을 **그대로 컴파일해** 페이크 위에서 구동한다 — 채택 코드가 예제가 아니라 **테스트 대상**이 된다.

### 9.2 type (`pnpm test:types`)

`tests/types/*.test-d.ts` — §6.3 픽스처 **①–㉗** 전부를 `expectTypeOf` + `@ts-expect-error`로 고정. 특히 ②③④는 **f70·f95·f96의 컴파일 타임 대리물**이고, ⑩은 의도적 삭제(`requestRouteAccess`)의 회귀 방지 픽스처다. ⑳은 두 `.` 브랜치의 export 패리티를 타입 수준에서 고정한다. ㉑–㉗은 2026-08-22 소유자 결정 ②·③이 추가한 것으로, ㉒(coarse 경로가 애노테이션 0으로 대입된다)가 결정 ② 전체를 지탱한다.

**directive 위생 규칙 (스위트 자체의 계약)**: `@ts-expect-error`가 **하나도 장식이 아님**을 negative control로 증명한다 — directive를 전부 제거한 사본이 정확히 directive 수만큼의 진단을 내야 하고, directive를 단 원본은 TS2578 0건으로 통과해야 한다. §6.3의 새 픽스처 집합은 이 절차로 실제 확인했다(directive 15개 → 진단 15개, 원본 EXIT 0). 이 규칙 덕분에 §6.3의 옛 ⑪ 라인(`Scope에 'distance'는 없다`)이 소유자 결정 ②로 거짓이 됐을 때 스위트가 **스스로 감지**했다.

### 9.3 guard (unit 계층, 정적 스캔 + 실제 실행)

| 가드 | 규칙 | 근거 |
|---|---|---|
| `dist-peer-graph` | 산출물에서 엔트리별 외부 specifier를 재귀 추출해 §2.2 표와 **조건 3세트(`node`/`browser`/네이티브) × 형식 2종(`.mjs`/`.js`)**으로 대조. `core`/`testing`/`plugin`과 `.`의 node/browser 브랜치는 **공집합**, `.`의 네이티브 브랜치는 정확히 `{"expo"}` | §2.2, expo-media §10.3 |
| `nodom-source-guard` | `tsc --noEmit -p tsconfig.core.json` (`lib:["ES2022"]`) | **V15** — tsup은 코어 오염을 전혀 잡지 못한다 |
| `pure-dist-guard` | `skipLibCheck:false` + `lib:["ES2022"]`로 `dist/core.d.ts`·`dist/testing.d.ts`·`dist/plugin.d.ts`·`dist/index.unsupported.d.ts`를 **실제 컴파일** | **V15** — 산출물 레벨. A·B가 빠뜨린 가드 |
| `entry-guard` | `src/core/**`·`src/testing.ts`·`src/plugin-types.ts`·`src/index.unsupported.ts`에 `expo`·`react-native`·`expo-modules-core`·`document`·`window` 문자열 0건 | §1-6 |
| `single-native-import` | `requireOptionalNativeModule` / `requireNativeModule` 문자열이 `src/native.ts` **1파일에만** 존재 | §3.1 |
| **`import-safety-guard`** | 실제 Node에서 (a) 패키지 지정자로 `import('@gj-kit/expo-workouts')` → **throw 0**, `getAvailability()`가 `unavailable`로 resolve, 나머지 11개가 `code === 'unavailable'`로 reject. (b) 네이티브 브랜치 파일(`dist/index.mjs`)은 **로드하지 않는다** — V1이 증명한 대로 그 그래프의 `expo`는 Node에서 로드 불가하고, 그것이 포크가 존재하는 이유다. 대신 정적으로 `expo` specifier가 **정확히 1건**이고 top-level side effect가 0건임을 단언한다 | 미션 §4.1, **V1** |
| **`export-parity-guard`** | `dist/index.d.ts`와 `dist/index.unsupported.d.ts`의 export 이름 집합이 **동일** | §2.4-D. C의 포크가 남긴 구멍 |
| **`ios-forbidden-api-guard`** | `ios/**/*.swift`에 `seriesBuilder(` · 시리즈 빌더의 `.discard()` · `try!` · `.runOnQueue(.main)` · `strictEndDate` 0건 | **f64, f65, f87**, idx f8, idx f47 |
| **`android-forbidden-api-guard`** | `android/**/*.kt`에 `.aggregate(` · `LocalDateTime` 오버로드 · `ACTION_HEALTH_CONNECT_SETTINGS` · `PackageManager.getPackageInfo` · `TotalCaloriesBurnedRecord` 0건 | **f109, f108, f119, f88**, idx f37 |
| `strict-start-date-guard` | Swift의 모든 `predicateForSamples(withStart:` 사이트에 `.strictStartDate`가 있고 `.strictEndDate`가 없음 | **f87** — 금지만으로는 부족하고 존재도 강제해야 한다 |
| **`error-code-parity`** | Swift/Kotlin에 선언된 `Workouts*Exception` 클래스명 집합에서 유도되는 `ERR_WORKOUTS_*`가 TS `WORKOUTS_ERROR_CODES` 14종과 **1:1 대응**. Expo 런타임이 클래스명에서 코드를 만들므로(idx f8) 이름 표류는 조용하다 | 미션 §4.1 |
| `naming-guard` | 네이티브 모듈 문자열 `'GjKitWorkouts'` · Kotlin 패키지 `kit.gj.workouts` · 양 플랫폼 클래스명 `GjKitWorkoutsModule` · Android namespace `kit.gj.workouts`가 전부 존재 | 미션 §4.1 |
| `redaction-guard` | `new WorkoutsError(`의 두 번째 인자가 문자열 리터럴 또는 상수 · `nativeMessage`에 `lat`/`lon`/`latitude`/`longitude`/`bpm`/`kcal`/`distance`/`steps`/`title`/`notes`/`point`/`route` 계열 식별자가 보간되지 않음 (Swift·Kotlin·TS 전부) | 미션 §4.2 프라이버시, AGENTS.md §2 |
| `chunk-constant-guard` | `ROUTE_CHUNK_POINTS === 1000` 이고 **공개 표면에서 도달 불가**(export되지 않음) | **f78**, D8 — export하면 1000→2000 조정이 breaking이 된다 |
| `test-purity-guard` | `tests/unit/**`에 `expo-`·`react-native` import 0건 | §9.1의 "모킹 0"이 문서 주장이 아님을 보장 |
| `cursor-opacity` | `describeCursor` 반환 객체의 JSON에 커서 payload `k` 값이 부분 문자열로 등장하지 않음 | §5.2 |
| `plugin-introspect` | §7.3의 스냅샷 전부 | **f123**, D7, idx f19 |
| `debug-code-guard` | `ios/**`·`android/**`의 시딩/디버그 경로가 `#if DEBUG` / `BuildConfig.DEBUG` 밖에 존재하지 않음 | Apple 5.1.3(ii) — 릴리스 바이너리에 조작 데이터 생성 코드가 들어가면 안 된다. `./testing`은 JS이므로 네이티브 바이너리와 무관하다 |
| `readme-guard` | `scripts/check-readme.mjs` — 서브패스 4개, README 코드블록 실컴파일, **§10.6의 문구 계약 3종**(coarse 레시피가 fine 설명보다 **앞에** 등장 · `'workouts'`의 의미 문장 존재 · `indoor` 비대칭 절 존재) | expo-media 선례 + 소유자 결정 ②·③ |
| **`t9-plugin-loader`** | 픽스처 디렉토리에서 **빌드된 `app.plugin.js`를 실제로 `require()`** 해 함수가 반환되는지 단언 (패키지 자신의 `package.json` shape로) | **T9는 Phase 0에서 실행되지 않았다.** 3줄짜리 Node 테스트가 이 미검증 전제를 `pnpm test` 안으로 끌어온다 — packed-consumer 게이트까지 미루지 않는다 |

### 9.4 native — 공유 시나리오 표와 골든 벡터

`tests/fixtures/` **네 파일**이 세 구현을 동시에 구동한다: TS 단위 테스트 · XCTest(`HealthStoring` 페이크) · JUnit(`HealthConnectGateway` 페이크).

**`sync-scenarios.json`** — 초기 백필 3페이지 · 백필 중 크래시 재개 · 백필 중 삭제 · 드레인 교체(iOS 새 id / Android 동일 id) · f94 no-op upsertion · 토큰 만료 · scope 지문 변화 · purge된 삭제 · `added`/`removed` 동시 등장.

**`route-vectors.json`** — 입력 루트 → 살아남는 포인트 → 추정 바이트. §8.2의 8규칙과 f100 공식이 **세 언어에서 바이트 동일한 결과**를 내야 한다. 이 파일이 없으면 위생과 크기 공식이 TS·Swift·Kotlin에 세 번 구현되고 그 표류는 **기기에서만** 보인다.

**`activity-vectors.json`** (신설 — 소유자 결정 ③이 강제한다) — §8.3 매핑표를 **핀 박힌 데이터**로 고정한다. 이것이 "두 플랫폼 상수 표를 영구히 따라다녀야 한다"는 §12-③의 반론에 대한 유일한 완화다: 표가 기억이 아니라 파일이 되고, 세 언어가 같은 파일을 읽는다.

| 단언 | 내용 |
|---|---|
| 골든 벡터 | **정수 18개 전부**(iOS 9 + HC 13, 쌍 상수 포함)를 값으로 고정. 미래의 편집이 하나를 조용히 바꿀 수 없다 |
| 왕복 전수 | `WORKOUT_KINDS`(9) × `indoor ∈ { true, false, undefined }` = 27조합에 대해 `kindFromIos(iosFromKind(k,i))`와 `kindFromAndroid(androidFromKind(k,i))`. **쌍이 있는 넷은 `undefined → false` 정규화를, 나머지 다섯은 Android에서 `indoor → undefined`를 단언한다** — §8.3 왕복 속성 2·3 |
| 알 수 없는 정수 전역성 | `0`, `-1`, `3000`, `2^31−1`, 비정수에 대해 두 `kindFrom*`이 `{kind:'other'}` |
| iOS 비대칭 | `kindFromIosActivityType(16) === 'other'` **그리고** `platformData.ios.activityTypeRaw === 16` (Android 쪽은 0으로 접히므로 대응 단언이 없다는 사실 자체를 주석으로 남긴다) |
| read-alias | iOS 20 → `'strength'`, iOS 71 → `'wheelchair'`, 그리고 **쓰기 방향이 20·71을 절대 내지 않음** |
| 타입 픽스처 | `WORKOUT_KINDS.length === 9` · 유니언에 대한 `assertNever`가 여전히 컴파일됨 (§6.3 ㉗) |

**`scope-mapping.json`** (신설 — 소유자 결정 ②가 강제한다) — §8.8의 두 표를 한 파일로. XCTest · JUnit · TS plugin-introspect 스냅샷이 **같은 파일**에 대해 단언한다. 없으면 매핑 변경이 3방향으로 조용히 표류한다.

**네 구현이 같은 표에서 같은 결론을 내지 못하면 CI가 실패한다.** 네이티브↔TS 의미 표류가 기기 발견이 아니라 실패하는 테스트가 되는 지점이다.

### 9.5 device — 로컬 게이트 (CI 아님)

expo-media 선례대로 네이티브 컴파일과 실기 검증은 **문서화된 로컬 게이트**다. README "native checklist"와 `example/maestro/*.yaml`이 담당한다.

1. **자기 검증 루프 (양 플랫폼)**: 3 600점 route 저장 → `listWorkouts` → `syncWorkouts`가 own으로 표시 → `getRoute`가 전부 되돌려줌(부동소수 정밀도 내) → `version` 올려 재저장 → sync가 replaced → 삭제 → sync가 removed. 각 단계마다 Health / Health Connect 앱에 **정확히 1개**.
2. **iOS 전제**: 시뮬레이터를 **windowed로 부팅**(`open -a Simulator`)하지 않으면 인증 시트가 XCUI 계층에 아예 들어오지 않고, `-parallel-testing-enabled NO`를 주지 않으면 throwaway clone에서 돌아 **stale 컨테이너**를 읽는다(f125, f126).
3. **Android 전제**: 온보딩 `text:"Get started"` → `"Allow all"` → `"Allow"` → 추가 접근 `"Allow"` → route `"Allow all routes"`. 추가 화면은 **전부 `optional: true`**이고 라벨 드리프트를 견뎌야 한다. 선택자 위험: "Health Connect" 안의 **비줄바꿈 공백(U+00A0)**, `Allow "HC Reader" to read`의 **곡선 따옴표**, iOS의 타이포그래픽 아포스트로피(f124).
4. **AVD 주의**: 기존 `Pixel_9a`는 PIN 잠금으로 사용 불가하다 — `Pixel_9a_hcprobe`(emulator-5556)를 쓴다(f127). Gradle은 이 머신에서 Java 26을 집으므로 `org.gradle.java.home`을 Corretto 17로 핀해야 한다(f128). ⚠ **그 `gradle.properties`는 머신 고유 절대 경로를 담으므로 `files` 목록에 넣지 않는다** — §2.3에 없는 이유다.
5. **활동 매핑 왕복 (신설 — 소유자 결정 ③이 만든 필수 게이트, §11-23)**: `swimming`(indoor 양쪽) · `rowing`(indoor 양쪽) · `strength` · `wheelchair` 네 kind를 저장 → 되읽어 `exerciseType` / `activityTypeRaw`가 §8.3의 정수와 **바이트 동일**한지 · Health Connect가 73/74/53/54/70/82를 정규화하지 않는지 · Apple Health가 `.traditionalStrengthTraining`·`.wheelchairWalkPace`를 기대한 이름으로 렌더링하는지(스크린샷). **상수 값은 확정이지만 플랫폼 측 거부·정규화는 미확인이므로 1.0 전 필수다.**
6. **per-type `WRITE_*` 권한 문자열 확인 (신설 — §11-24)**: `adb shell pm grant <pkg> android.permission.health.WRITE_{DISTANCE,ACTIVE_CALORIES_BURNED,ELEVATION_GAINED,HEART_RATE,STEPS}` 다섯 줄. 각각이 오류 없이 통과해야 한다. 이 다섯은 명명 규칙에서 **파생**한 것이고 Phase 0가 개별 확인한 적이 없는데(§8.8 증거 등급), §8.5-0의 쓰기 사전 검사 전체가 이 이름들에 걸려 있다. **몇 초짜리 작업이 `[unverified]` 하나를 닫는다.**
7. **여기서도 측정되지 않는 것**: `pendingUnlock`(물리 iPhone 필요) · API 28–33 provider 경로 · `FLAG_PERMISSION_USER_FIXED` · 30일 벽 × route 다이얼로그 · 큰 route에 대한 동의 다이얼로그(25점으로만 실험됨).

---

## 10. 릴리스 게이트 확장

### 10.1 `scripts/check-pack-contents.mjs` — 네이티브 파일 목록 옵션 신설

**V13 실측**: 현행 스크립트의 `declaredTargets()`는 `main`/`module`/`types`와 `exports` 맵만 순회한다. 따라서 `ios/**` · `android/src/main/**` · `expo-module.config.json` · `app.plugin.js` · `plugin/build/**`는 **어느 검사에도 걸리지 않는다** — 이 패키지는 전부 exports 맵 밖에 있고, 하나라도 빠지면 autolinking이 조용히 실패한 타르볼이 나간다.

**가산적 변경** (기존 5개 패키지 항목은 무변경):

```js
const packages = [
  // … 기존 5개 …
  {
    directory: 'expo-workouts',
    requirePrepack: true,
    requireProvenance: true,
    // ★ 신설 — 선언한 패키지에만 적용된다
    requiredFiles: [
      'expo-module.config.json',
      'app.plugin.js',
      'android/build.gradle',
    ],
    requiredPrefixes: [
      'dist/',
      'ios/',
      'android/src/main/',
      'plugin/build/',
    ],
    forbiddenPrefixes: [
      'example/',
      'android/build/',
      'android/.gradle/',
      'tests/',
      'ios/build/',
    ],
    // 머신 고유 절대 경로(org.gradle.java.home)가 들어가는 파일 — 절대 packing하지 않는다 (f128)
    forbiddenFiles: ['android/gradle.properties', 'android/local.properties'],
  },
];
```

루프 안에 세 블록을 추가한다 — `requiredFiles`/`requiredPrefixes`는 `files` 집합에 대해 존재를 단언하고, `forbiddenPrefixes`/`forbiddenFiles`는 부재를 단언한다. 셋 다 **옵션이 없는 패키지에서는 아무 일도 하지 않는다.**

### 10.2 `scripts/check-expo-workouts-consumer.mjs` (신설, `check-expo-media-consumer.mjs` 복제)

```js
import { runPackedExpoConsumerSmoke } from './check-packed-expo-consumer.mjs';

const workoutsDirectory = join(root, 'expo-workouts');
const fixture = (name, dir) => ({
  name,
  fixtureDirectory: join(workoutsDirectory, 'tests', 'fixtures', dir),
  placeholder: 'file:__GJ_KIT_EXPO_WORKOUTS_TARBALL__',
  platforms: ['web', 'ios', 'android'],
  // (a) web export에 네이티브가 딸려오지 않는다. 조건 포크가 실제로 갈렸다는 증거다.
  forbiddenBundleText: { web: ['GjKitWorkouts', 'requireOptionalNativeModule'] },
  // (b) 순수 Node에서 패키지 지정자 import가 던지지 않고 unavailable로 정착한다.
  nodeChecks: [{ name: 'node import safety', args: ['./checks/import-safety.cjs'] }],
  // (c)(d) — 아래 §10.3의 신설 필드
  commandChecks: [
    { name: 'autolinking (apple)',  command: 'npx',
      args: ['expo-modules-autolinking', 'resolve', '--platform', 'apple', '--json'],
      expect: '@gj-kit/expo-workouts' },
    { name: 'autolinking (android)', command: 'npx',
      args: ['expo-modules-autolinking', 'resolve', '--platform', 'android', '--json'],
      expect: 'kit.gj.workouts' },
    { name: 'introspect: entitlement', command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'com.apple.developer.healthkit' },
    { name: 'introspect: route permission', command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'android.permission.health.READ_EXERCISE_ROUTES' },
    { name: 'introspect: rationale alias', command: 'npx',
      args: ['expo', 'config', '--type', 'introspect'],
      expect: 'android.intent.action.VIEW_PERMISSION_USAGE' },
    // T9 — Phase 0에서 실행되지 않은 항목. 여기가 두 번째 관문이다(첫 관문은 §9.3의 t9-plugin-loader).
    { name: 'T9: app.plugin.js loads', command: 'node',
      args: ['-e', "const p=require('@gj-kit/expo-workouts/app.plugin.js'); if (typeof p!=='function' && typeof p?.default!=='function') process.exit(1)"] },
  ],
});

runPackedExpoConsumerSmoke({
  packageDirectory: workoutsDirectory,
  packageName: '@gj-kit/expo-workouts',
  requiredBuildFile: 'dist/index.js',
  keepEnvironmentVariable: 'KEEP_EXPO_WORKOUTS_CONSUMER_SMOKE',
  fixtures: [fixture('expo-sdk-56', 'expo-consumer'), fixture('expo-sdk-57', 'expo-consumer-57')],
});
```

### 10.3 `scripts/check-packed-expo-consumer.mjs` — 가산적 `commandChecks` 필드

**V14 실측**: 현행 `nodeChecks`는 `run(process.execPath, [...check.args], consumerDirectory)`로 **실행 파일이 Node에 고정**돼 있다. `npx expo-modules-autolinking resolve`와 `npx expo config --type introspect`는 Node 스크립트가 아니므로 이 필드로는 돌릴 수 없다.

**변경은 세 곳뿐이고 기존 호출자(`check-expo-media-consumer.mjs`)는 무변경이다.**

```js
// 1) typedef에 추가
/**
 * @typedef {{ readonly name: string; readonly command: string;
 *             readonly args: readonly string[]; readonly expect?: string }} CommandCheck
 * …
 *   readonly nodeChecks?: readonly NodeCheck[];
 *   readonly commandChecks?: readonly CommandCheck[];   // ★ 신설
 */

// 2) runFixture 안, nodeChecks 루프 바로 뒤
for (const check of fixture.commandChecks ?? []) {
  console.log(`${fixture.name}: ${check.name}…`);
  const output = run(check.command, [...check.args], consumerDirectory);
  if (check.expect !== undefined && !output.includes(check.expect)) {
    throw new Error(`${fixture.name}: ${check.name} output is missing ${check.expect}.`);
  }
}

// 3) validateFixture에 shape 검증 추가 (name/command/args 필수, expect는 선택)
```

`run()`은 이미 `execFileSync(command, args, { cwd, encoding: 'utf8', … })`라 임의 실행 파일을 받는다 — 실제 변경은 **호출 지점 하나와 타입 하나**뿐이다.

### 10.4 루트 `package.json` `verify:release`

`&&` 체인 끝에 두 개를 덧붙인다:

```
… && node scripts/check-pack-contents.mjs && node scripts/check-expo-workouts-consumer.mjs
```

`check-pack-contents.mjs`는 이미 체인에 있으므로 §10.1의 배열 항목 추가만으로 커버된다. **네이티브 컴파일은 CI 게이트가 아니다** — README "native checklist"의 로컬 게이트다(expo-media §10.4 선례).

### 10.5 스토어 제출 체크리스트 (README가 싣고 핸드오프 문서가 반복한다 — 세 후보안이 모두 비운 항목)

| 항목 | 내용 |
|---|---|
| 라이브러리 `PrivacyInfo.xcprivacy` | `NSPrivacyCollectedDataTypes: []` (라이브러리 자체는 아무것도 수집하지 않는다) · `NSPrivacyTracking: false` · `NSPrivacyAccessedAPITypes`는 실제로 쓰는 required-reason API가 있을 때만. `podspec`이 resource bundle로 싣는다 |
| **앱**의 Apple 프라이버시 라벨 | **Health** (+ **Fitness**, + route를 서버에 올린다면 **Precise Location**)을 *collected · linked to user · not used for tracking · app functionality*로 선언하고 App Store Connect에 동일하게 입력 |
| **Play Health apps declaration** | Policy › App content. **읽기와 쓰기 데이터 타입 전부**를 선언해야 하고, closed/open/production 트랙에 **필수**이며, 데이터 타입이 바뀔 때마다 재심사가 걸린다. 미승인 상태로 배포하면 사용자에게 "can't access Health Connect" 다이얼로그가 뜬다(idx f40) |
| Play Data safety | 위 라벨과 **일치**해야 한다 |
| **Apple 5.1.3(ii)** | 조작된 헬스 데이터를 절대 쓰지 않는다. 시딩·디버그 경로는 `#if DEBUG` / `BuildConfig.DEBUG`로 **릴리스 바이너리에서 컴파일 아웃**되며, §9.3 `debug-code-guard`가 이를 정적으로 강제한다. `./testing`은 JS 전용이라 네이티브 바이너리에 들어가지 않는다 |
| 예제 앱 | `files` 목록에 없으므로 타르볼에 포함되지 않는다(§10.1 `forbiddenPrefixes`가 단언) |

### 10.6 README·changeset 문구 계약 (소유자 결정 ②·③이 만든 것 — 문서가 유일한 방어인 지점)

타입도 가드도 잡지 못하는 것이 정확히 둘 있고, 둘 다 **문구와 순서**로만 막힌다. `readme-guard`가 아래 셋을 문자열로 단언한다.

| # | 요구 | 왜 문서만이 방어인가 |
|---|---|---|
| 1 | README "permissions/scopes semantics" 절이 **coarse 레시피를 먼저** 싣는다 — `await requestAuthorization({ read: [...WORKOUT_TOTALS_SCOPES, 'routes'] })` — 그 **다음에** fine 멤버를 설명한다 | 흔한 경우가 복사되고 좁은 경우가 의도적 행위가 되게 하는 유일한 수단이다. **순서를 틀리면 "선택권"이 곧 함정이 된다.** 소유자 결정 ②의 산출물 전체가 이 한 줄의 배치에 걸려 있다 |
| 2 | 같은 절이 문자 그대로 적는다: **"`'workouts'`는 세션 목록이다. 총계를 포함하지 않는다. `WORKOUT_TOTALS_SCOPES`가 그것을 포함하는 한 토큰 형태다."** config-plugin prop 문서가 같은 문장을 반복한다 | `read: ['workouts']`는 변경 전후 모두 유효한 코드이고 변경 후 다른 일을 한다. 컴파일러가 잡을 수 없는 유일한 종류의 breaking change다. `app.json`에서는 실패가 런타임의 `undefined` 필드로 나타나 원인 파일에서 멀다 |
| 3 | changeset(minor, 첫 릴리스)이 결정 ②를 **"새 멤버 3개"가 아니라 미션이 고정한 이름의 의미 변경**으로, 결정 ③을 **"D11 개정"**으로 기록한다. `Record<Scope, ScopeStatus>`가 4키→7키가 되는 것이 **읽는 쪽에는 additive, 만드는 쪽(테스트 더블·`./testing` 시드)에는 breaking**임도 함께 적는다 | 소비자 0인 지금은 비용이 0이지만, 1.1에서 물게 되는 것은 정확히 이 형태다 |

추가로 README가 **자기 절 하나**를 갖는 항목(표 각주로 처리하면 안 되는 것): **`indoor`의 플랫폼 비대칭**. iOS는 저장, Android는 `exerciseType`에서 파생 — 그래서 `indoor: true`인 등산이 iOS에서는 왕복하고 Android에서는 사라진다. D11 개정으로 `strength`·`wheelchair`가 들어와 이 비대칭의 표면이 셋에서 다섯으로 늘었다(§8.3 왕복 속성 2·3). 타입 픽스처 주석도 같은 문장을 담는다.

---

## 11. 잔존 리스크

| # | 항목 | Phase 0 상태 | 이 설계의 방어 |
|---|---|---|---|
| 1 | **iOS `pendingUnlock`** (nil workout + nil error) | **한 번도 재현되지 않음**(f70). 시뮬레이터에 강제 수단이 없고 물리 iPhone도 없었다 | 성공/실패와 구분되는 **제3의 결과**를 판별 유니언으로(§6.1-②) · 쓰기 전 `isProtectedDataAvailable()` 검사로 이중 쓰기 차단 · 재시도는 sync id 재조회 + **새** 직접 route 빌더(f66에서 증명된 형태) · path B 선택의 부수 효과로 잠긴 기기가 고아 route를 만들 수 없다. ⚠ **잠긴 기기에서 사전 조회가 에러 없이 빈 결과를 준다면 이 방어는 무너지고 워크아웃이 두 개 생긴다.** 물리 기기 없이는 확인 불가 |
| 2 | Android **save마다의 read-back 비용** | 활동당 1회 쓰기라는 **첫 소비자의** 패턴에서 도출됨 | 500개를 마이그레이션하는 두 번째 소비자는 500 write + 500 read = 15분 예산 전체를 태운다(`ReadBudget`가 그 전에 `rateLimited`를 던지긴 한다). 배치 쓰기 API를 노출하지 않았으므로 그런 도구는 이 라이브러리로 쓰기 어렵다. **소유자 결정 ④(2026-08-22)가 이 리스크를 감수하기로 확정했다** — `verifyWrite` 없음, 배치 API 없음. §12-④는 닫혔다 |
| 3 | **HC 30일 벽의 조용한 절단** | 감지 불가 | 벽은 (첫 권한 승인 −30일)에 고정되므로 `now − 30 d` 사전 검사는 플랫폼이 실제로 서빙하는 창을 **거짓 거절**한다. 우리가 하는 것은 `readRecord` 예외를 `historyRequired`로 매핑하고 사전 검사로 명백한 경우를 잡는 것뿐이다. **`history` 없는 앱은 "오래된 워크아웃이 없다"와 "볼 수 없다"를 구분할 수 없고, 이 설계는 그것을 정직하게 말할 뿐 해결하지 못한다** |
| 4 | **메트릭 read-back이 route를 materialise하지 않는다**는 전제 | **추론이지 측정이 아니다** — f116은 세션 페이지 읽기를 측정했지 단건 메트릭 read를 측정하지 않았다 | 거리·칼로리·걸음·HR을 하나도 보내지 않은 워크아웃은 세션 read-back으로 떨어져 20 000포인트 route를 다시 materialise한다. Phase 3의 첫 실기 세션에서 측정할 항목 |
| 5 | **byte 상수** (48 B/point, 60 B/point, 24 B/segment, ~512 KiB Intent 컷) | 하나의 Mainline 빌드(APEX 360526040) 인코딩 | 20 000 가드 = ~40 KB 마진이지 계약이 아니다. `estimateAndroidRecordBytes()`를 순수 함수로 노출해 앱이 자기 기기에서 검증할 수 있게 한다 |
| 6 | **레이트 예산이 프로세스 로컬** | 설계상 한계 | Health Connect의 RateLimiter는 **uid 단위**다. 같은 앱에 kingstinct/matinzd가 함께 있으면 우리 계수가 어긋나고, 소비자는 예측하지 못한 `rateLimited`를 `retryAfterMs: undefined`로 받는다(§5.7-38). 우리가 그 둘을 대체하는 것이 전제이지만 **이행기에는 정확히 그런 앱이 존재한다** |
| 7 | **route 요청 직렬화가 f105의 크래시를 막지 못한다** | 세 후보안이 모두 "구조적으로 막는다"고 과장했다 | f105의 크래시 원인은 **동시성이 아니라 parcel 크기**(1 200 580 B)다. Intent 경로는 route가 `consentRequired`일 때만 도달하고, 그때 포인트 수는 **사전에 알 수 없다**. 직렬화는 크래시를 **한 번에 하나로 한정할 뿐**이고, 10 s 타임아웃이 그 뒤의 무한 대기를 막는다. 이것이 우리가 할 수 있는 전부다 |
| 8 | **`FLAG_PERMISSION_USER_FIXED`** | 도달한 적 없음 | AOSP상 `USER_FIXED`가 붙으면 `RouteRequestActivity`가 **영원히 조용히 취소**된다 — 우리에겐 영구히 빈 스트림으로 보인다. README가 Settings → 앱 → Manage app → **Additional access → Access exercise routes → Always allow** 경로(f117)를 안내한다 |
| 9 | **HC 온보딩(f115)에 API가 없다** | 판별 API가 존재하지 않는다 | `routeAccess === 'all'`인데 `getRoute`가 `consentRequired`를 던지는 조합이 온보딩 미완료의 서명이다 — **문서화된 판별 규칙**이지 타입이 예고하는 상태가 아니다. `openSettings()`가 온보딩 화면으로 간다(f119). 네 번째 `routeAccess` 값이 더 정직했겠지만 미션이 3값을 고정했고 우리는 읽기 없이 그 상태를 알 수 없다 |
| 10 | **다중 소스 걸음수** | 플랫폼 우선순위 목록을 읽을 수 없다 | `readSteps`는 **최대 단일 `dataOrigin` 총합**을 돌려준다 — 폰+워치를 이중 계상하지 않는 유일한 결정론적 규칙이다. ⚠ 그 숫자는 **Health Connect UI가 보여주는 값과 다르다**(UI는 앱 우선순위로 병합한다). 사용자가 두 화면에서 다른 걸음 수를 보고 우리 잘못으로 여길 수 있다. per-origin 분해는 표면 확대라 v1에 넣지 않았다 |
| 11 | **`readHeartRate`의 밀도** | 미측정 | 24 h 창 상한은 **창을 묶었을 뿐 밀도를 묶지 못한다** — 1 Hz 워치 × 24 h = ~86 400 샘플. 샘플 수 상한이나 페이징이 더 견고하겠지만 세 번째 커서 개념을 도입하게 된다 |
| 12 | **Android `HeartRateRecord`의 창 밖 시작** | 미측정 | HR은 **series 레코드**이고 `readRecords`는 start instant로 필터한다(f107) — 60초 폴링 창보다 먼저 시작한 레코드를 놓칠 수 있다. `listWorkouts`의 메트릭 읽기는 하한을 **페이지 내 최장 세션**만큼 넓혀 해결하지만(파생값), `readHeartRate`의 리드인은 파생할 근거가 없다. **v1은 1시간 리드인을 쓰고 그것이 지어낸 상수임을 명시한다** — Phase 3 실기 세션의 측정 항목 1번이다 |
| 13 | **`getAuthorizationState()`의 Android 예산 소비** | **미측정** | permission-controller IPC가 데이터 읽기 예산을 소비하지 않는다고 가정했고 JSDoc에 `[unverified]`로 적었다. 틀리면 "자유롭게 부르라"가 나쁜 조언이 된다 — 그래서 JSDoc이 **"폴링 경로에 넣지 말고 캐시하라"**고 함께 말한다 |
| 14 | **API 28–33 (Play APK 경로)** | **한 번도 테스트되지 않음** — 시스템 이미지가 없고 다운로드가 범위 밖이었다 | `updateRequired` 1급 상태 + 문서화된 Play 딥링크. `openSettings()`의 버전 분기(`ACTION_HEALTH_CONNECT_SETTINGS`가 그 경로에서는 아마도 옳다)는 **미검증임을 README에 명시**한다. D6의 best-effort 티어 유지 |
| 15 | **JS 브리지 청크 비용** | 미측정 (순수 Swift 프로브) | 1000은 export되지 않는 내부 상수이므로 2000으로 올려도(+0.42 MB 피크) **공개 계약이 바뀌지 않는다** |
| 16 | **DST 전환** | 양 플랫폼 T11 모두 미교차 (Asia/Seoul 단일 존) | 공개 표면은 epoch-ms + `utcOffsetMin`뿐이고 로컬 날짜 버킷팅은 라이브러리 밖이다 → **DST가 우리 계약에 닿지 않는다** |
| 17 | **5 MB per-request chunk 상한** | `device_config`에서 읽었으나 미검증 | `saveWorkout`(세션 + 메트릭 5종)은 근처에도 못 간다. 배치 쓰기가 없으므로 도달 경로가 없다 |
| 18 | **`kind: 'other'`의 왕복 손실** | 설계상 한계 | **소유자 결정 ③(2026-08-22)이 범위를 크게 줄였다** — 수영·조정·근력·휠체어가 1급 kind가 됐으므로(§8.3) `'other'`로 떨어지는 것은 이제 스키·구기·스튜디오 활동이다. **손실 자체는 그대로다**: `'other'`는 `OTHER_WORKOUT(0)` / `.other(3000)`으로 저장되고 원래 활동을 복구할 수 없으며, `platformData`는 읽기 전용 탈출구라 쓰기 방향에 아무것도 없다. 소유자가 옵션 B(`platformActivityType`)를 채택하지 **않았으므로** 이 탈출구는 v1에 없다. 더 나쁘게는, Android에서는 `platformData.android.exerciseType`조차 0으로 접혀 있어 **읽기 방향 탈출구도 없다** |
| 19 | **`Scope` 입도** — **해소됨, 그러나 새 리스크로 교체됐다** | 소유자 결정 ② | 과다 요청 문제는 §8.8의 7-scope 분할로 사라졌다. **대신 세 가지가 새로 생겼다**: (a) `'workouts'`의 **의미 변경** — `read: ['workouts']`는 변경 전후 모두 유효한 코드이고 변경 후 다른 일을 하는데 타입도 가드도 잡지 못한다. 방어는 README 순서(coarse 레시피를 먼저 싣는다)와 changeset 표기뿐이다. (b) 읽기 함정(§6.1-㉖). (c) 쓰기 회귀(§6.1-㉗) — 이것은 사전 검사로 막지만, **사전 검사가 캐시된 `AuthorizationState`에 의존**하므로 사용자가 앱 밖에서 권한을 회수하고 앱이 아직 새로고침하지 않았다면 우리가 통과시킨 뒤 플랫폼이 거절한다. 그때는 트랜잭션이 통째로 실패하고 `notAuthorized`로 매핑되지만 **사전이 아니라 사후**다 |
| 20 | **fuzz는 증명이 아니다** | 설계상 한계 | 갭 없음 속성 테스트는 플래너와 오라클이 **같은 모델을 공유**하므로 그 전제를 반증할 수 없다. 대수적 논거는 §4.4이고 산문이다. 미래의 유지보수자가 "플래너를 단순화"하면 조용히 갭이 생길 수 있다 |
| 21 | **T9 · T10-iOS** | **둘 다 닫혔다 (Phase 2·3)** | T9는 Phase 2에서 실제로 실행됐다(§2.4-A의 `type:module` 회피 + §9.3 `t9-plugin-loader` + §10.2 packed consumer, 3중). **T10-iOS는 Phase 3 iOS 레인이 닫았다** — 실제 `requestAuthorization`이 생기자마자 HealthKit 시트가 XCUI 계층에 들어왔고 `maestro hierarchy`로 덤프했다. 측정된 접근성 식별자: 내비게이션 바 `Health Access`(idx f51의 추측이 **확인**됨) · `UIA.Health.AuthSheet.AllCategoryButton` · `UIA.Health.Allow.Button`(**스위치가 하나도 켜지지 않으면 disabled** — 먼저 누르면 무반응이고 플로우가 멈춘다) · `UIA.Health.DoNotAllow.Button` · 타입당 `UIA.Health.{Write,Read}.<Type>.SwitchCell`. `20-ios-authorize.yaml`이 텍스트 대신 이 식별자를 쓰므로 로케일에 영향받지 않는다. 원본 덤프는 `example/maestro/artifacts/ios-p3-health-access-hierarchy.json` |
| 22 | **커서 포맷 v2로의 이행** | 설계됨, 미검증 | §4.3의 규칙 3종. `READABLE_CURSOR_VERSIONS` 축소가 breaking임을 CHANGELOG 정책에 박는다 |
| 23 | **D11 개정으로 들어온 네 kind가 기기에서 확인되지 않았다** | **미측정** — 상수는 SDK 헤더·AAR 바이트코드로 확정, 플랫폼 왕복은 미확인 | Health Connect가 `SWIMMING_POOL(74)`·`SWIMMING_OPEN_WATER(73)`·`ROWING_MACHINE(54)`·`WHEELCHAIR(82)`를 실제 `insertRecords` + `readRecords`에서 변형 없이 돌려주는지, Apple Health가 `.traditionalStrengthTraining`·`.wheelchairWalkPace`를 기대대로 렌더링하는지가 남았다. **상수 값이 틀릴 수는 없지만 플랫폼 측 거부·정규화는 있을 수 있다.** §9.5의 T6형 매트릭스에 네 kind를 추가하는 것이 1.0 전 필수 항목이다 `[unverified]` |
| 24 | **per-type `WRITE_*` 권한 문자열 5종** | **닫힘 (Phase 3, 2026-08-23)** — ~~미검증~~ | `WRITE_DISTANCE`·`WRITE_ACTIVE_CALORIES_BURNED`·`WRITE_ELEVATION_GAINED`·`WRITE_HEART_RATE`·`WRITE_STEPS` 다섯 문자열을 `adb shell pm grant`로 **하나씩** 부여했다 — 5줄 전부 rc=0이고 `dumpsys package`가 다섯 개 모두 `granted=true`로 보고했다(§9.5 기기 게이트 6). 즉 문자열은 실재하며 §8.5-0의 사전 검사가 틀린 이름으로 통과시킬 위험은 사라졌다. `tests/fixtures/scope-mapping.json`의 `$evidence.unverified`가 비고 다섯 개가 `deviceGranted`로 옮겨졌으며, `plugin/__tests__/scope-mapping-parity.test.ts`와 Kotlin `ScopeMappingTest`가 **양쪽에서** 그 상태를 단언하므로 조용히 되돌릴 수 없다 |
| 25 | **`rowing`의 iOS 거리 (`#available` 개정)** | SDK 헤더로 확정 | `HKQuantityTypeIdentifierDistanceRowing`이 ios(18.0)이라 배포 타깃 16.4에서 가드가 필요하다(§8.3 C1). "v1은 `#available`을 쓰지 않는다"에 대한 **좁은 개정**이며, iOS 18 미만 기기에서 조정 워크아웃의 `distanceM`은 우리가 쓴 경우 `undefined`로 읽힌다. `.distanceWalkingRunning` 폴백은 사용자 데이터 오염이라 채택하지 않았다 |
| 26 | **iOS `distance` scope가 조회하는 quantity type이 두 개뿐** | 설계 결정, 실기 미확인 | §8.8: 인가 집합을 `.distanceWalkingRunning` + `.distanceCycling`으로 유지했다. D11 개정으로 들어온 수영·조정·휠체어의 거리는 **읽기 측 §8.7이 조회하지 않으므로**, 남이 쓴 그런 워크아웃의 `distanceM`은 tier 3 `'derived'`로만 채워지거나 `undefined`가 된다. 인가 시트에 행 3개를 더 그리는 대신 감수한 트레이드이며 `[unverified]`다 — 첫 실기 세션에서 측정하고, 필요하면 1.0 전에 인가 집합을 넓힌다(이것은 `Scope` 유니언 변경이 아니라 매핑 변경이므로 breaking이 아니다) |
| 27 | **iOS `swimming`·`rowing`·`wheelchair`의 거리 쓰기가 공유 인가 집합 밖이다** — **Phase 3에서 새로 드러남** | `[unverified]` — 기기에서 실패를 재현하지는 않았다 | §8.3 C1..C4는 쓰기 경로에 `.distanceSwimming`·`.distanceRowing`·`.distanceWheelchair` 샘플을 붙이라고 하는데, §8.8은 그 셋의 **공유 인가를 요청하지 않는다**(§11-26의 읽기 측 트레이드가 쓰기 측에도 그대로 있었다). 따라서 `distanceM`을 실은 수영 워크아웃은 쓰기에서 `notAuthorized`로 죽을 것으로 **추론**된다 — 근거는 아래 §13-14가 실측한 것과 **같은 메커니즘**이다(HealthKit은 요청한 적 없는 타입에 대해 빈 결과가 아니라 `errorAuthorizationNotDetermined`를 낸다). iOS 레인이 인가 집합을 임의로 넓히지 않은 것은 옳다 — 그것은 §8.8(소유자 결정 ②)의 소관이다. **1.0 전에 결정해야 한다**: (a) 인가 집합을 3종 넓힌다(인가 시트에 행 3개 추가, breaking 아님), (b) 그 kind에 `distanceM`이 오면 `invalidArgument`로 거절한다, (c) 현행 유지 + README 명시(현재 선택). README가 (c)를 명시하고 있다 |
| 28 | **HC 권한 다이얼로그와 per-route 동의 다이얼로그가 Phase 3에서도 한 번도 렌더되지 않았다** | 미실행 — Phase 2와 같은 상태, **다른 이유로** | 테스트 에뮬레이터가 이미 15종 권한을 전부 보유해(`pm grant`) `requestPermissions`가 즉시 반환하고 `READ_EXERCISE_ROUTES`도 보유해 f111의 무-다이얼로그 경로(151 ms)만 측정됐다. `10-android-authorize`·`11-android-route-consent`는 통과하지만 HC 화면은 전부 WARNED/skip이다. 제대로 닫으려면 전체 권한 집합을 `pm revoke`하고 온보딩을 다시 밟아야 하는데, 같은 기기를 iOS 레인이 동시에 쓰고 있어 Phase 3에서는 그 파괴적 작업을 하지 않았다. **새 AVD에서 한 번 돌리는 것이 1.0 전 항목이다** |

---

## 12. 소유자 확정 결정 (2026-08-22)

> 이 절은 원래 **소유자 확인이 필요한 미결 4건**이었다. 소유자가 넷 모두 답했으므로, 이제는 **무엇을
> 물었고 무엇이 선택됐는지의 기록**이다. 넷 다 문서 본문에 반영을 마쳤다.

| # | 질문 | 소유자 선택 | 문서의 추천과 일치? | 반영 지점 |
|---|---|---|---|---|
| ① | `WorkoutWrite.route`를 필수 `RoutePoint[] \| 'none'`으로 만들 것인가 | **옵션 A — 필수로 한다** | **일치** | 채택 #21 · §5.2 `WorkoutWrite` · §6.1-③ · §6.3 ③ · §8.1-0 · §8.5 |
| ② | `Scope` 입도 — `workouts`를 쪼갤 것인가 | **제시된 세 옵션 중 어느 것도 아님.** 원문: *"4종할지 7종으로 할지 개발자가 선택할 수 있도록"* | **불일치** (문서는 A: 4종 유지를 추천) | 채택 #31·#33 · §1-7 · §5.1 `SCOPES`/`WORKOUT_TOTALS_SCOPES` · §5.2 두 파생 함수 · §6.1-㉖㉗ · §6.3 ㉑–㉖ · §7.3 · §8.1-0 · §8.4 · §8.5-0 · **§8.8(신설)** · §9.4 · §11-19·24·26 |
| ③ | 쓰기 방향 활동 탈출구 — `kind: 'other'`의 손실을 열어줄 것인가 | **옵션 C — `WorkoutKind`를 넓힌다** (9종) | **불일치** (문서는 A: 열지 않는다를 추천하고 C를 명시적으로 비추천) | **D11 개정** · 채택 #32 · §1-7 · §5.1 `WORKOUT_KINDS` · §5.2 매핑 함수 4종 · §6.1-㉘ · §6.3 ㉗ · §8.1 · **§8.3 전면 교체** · §9.4 · §11-18·23·25 |
| ④ | 배치 쓰기 / `verifyWrite` 탈출구 | **옵션 A — 무조건 read-back 유지, 배치 API 없음, `verifyWrite` 없음** | **일치** (이미 채택 #14였다) | 채택 #14 · §0.4 기각 22 · §8.5 · §11-2 |

### 소유자가 문서의 권고를 뒤집은 두 지점 — 그럼에도 진행한 근거

**② `Scope` 분할.** 문서는 "미션 §4.2가 4종을 고정했고 좁히는 것은 실제 두 번째 소비자가 요구할 때
1.1에서 additive로 하면 된다"고 추천했다. 소유자는 옵션 A·B·C를 모두 거부하고 **선택권 자체**를
요구했다 — 개발자가 coarse(4종 상당)와 fine(7종) 중 고른다. 그대로 진행한 근거는 셋이다.

1. **문서가 제기한 반론(B의 대가)이 실제로 해소된다.** B의 대가로 적힌 것은 "`workouts`만 요청한 앱의
   `distanceM`이 조용히 `undefined`가 되는 새 함정"이었다. 그 함정은 노브 없이 3중으로 막혔다(§6.1-㉖):
   필드별 JSDoc · `unpopulatedWorkoutMetrics()` · scope를 준수하는 `./testing` 페이크. **기기 없이 Node에서
   재현된다**는 것이 결정적이다.
2. **coarse 모델은 `Record<Scope, ScopeStatus>`를 거짓말시키고 있었다.** f121은 요청 가능한 타입마다
   다이얼로그 행이 그려짐을 보였다 — 사용자가 `READ_EXERCISE`를 허용하고 `READ_DISTANCE`를 거부할 수
   있다. 그 상태에서 `read.workouts`에 참인 값이 존재하지 않는다. 분할이 그 칸을 처음으로 답 가능하게
   만든다. 이것은 프라이버시 논거보다 강하고, 문서가 §12를 쓸 때 놓친 지점이다.
3. **분할은 개념을 추가하지 않는다.** `heartRate`·`steps`가 이미 "scope 1 : optional 필드 1 : 전용
   읽기 함수 1"이었다. 남아 있던 예외 셋을 없애는 일이다.

  ⚠ 그러나 문서의 반론 중 **하나는 해소되지 않았고 그대로 남는다**: `'workouts'`의 **의미가 바뀌었다**.
  멤버 추가는 additive지만 기존 멤버의 재정의는 아니다. `read: ['workouts']`는 변경 전후 모두 유효한
  코드이고 변경 후 다른 일을 한다. 타입도 가드도 이것을 잡지 못한다. 방어는 문서뿐이므로 **README가
  coarse 레시피(`read: [...WORKOUT_TOTALS_SCOPES, 'routes']`)를 fine 설명보다 먼저 싣고**, changeset이
  이것을 "새 멤버 3개"가 아니라 **미션이 고정한 이름의 의미 변경**으로 기록한다. 순서를 틀리면
  "선택권"이 곧 함정이 된다.

**③ `WorkoutKind` 확대.** 문서는 옵션 C를 **명시적으로 비추천**했다 — "우리는 활동 분류 라이브러리가
아니다" + "두 플랫폼 상수 표를 영구히 따라다녀야 한다". 소유자는 그 옵션을 선택했다. 소유자는 제품
소유자이므로 D11을 개정할 수 있고, 그 개정은 **문서 머리의 개정 기록에 명시**했다 — D11이 원래 9종을
말했던 것처럼 소급해 고쳐 쓰지 않았다. 그대로 진행한 근거는 둘이다.

1. **두 반론 중 첫째는 선택된 집합에서 성립하지 않는다.** 채택된 넷은 전부 두 플랫폼에 non-deprecated
   상수가 1:1로 실재하고, 이 세션에서 SDK 헤더와 AAR 바이트코드로 **실측**했다(§8.3). 반대로
   `skiing`·`skating`처럼 의미가 어긋나는 후보는 **기각했고 근거를 표로 남겼다**. 9행은 분류표가 아니다.
2. **둘째 반론은 유효하며, 완화가 §9.4의 골든 벡터다.** `activity-vectors.json`이 18개 정수를 값으로
   고정하므로 표가 **기억이 아니라 핀 박힌 데이터**가 된다. 그것이 "영구히 따라다녀야 한다"에 대해
   우리가 줄 수 있는 유일한 진짜 답이다.

  ⚠ 확대의 실제 비용은 숨기지 않았다: `rowing`의 iOS 거리 타입이 ios(18.0)이라 **좁은 `#available`
  개정**이 필요하고(§8.3 C1 · §11-25), `wheelchair`의 `steps`가 HealthKit에서 `PushCount`와 어긋나며
  (§8.3 C3), 네 kind 모두 **기기 왕복이 미확인**이다(§11-23).

### 남은 질문 (deliverable을 실제로 바꾸는 것만)

1. **`wheelchair` 워크아웃의 `steps`를 iOS에서 어떻게 할 것인가.** HealthKit은 휠체어 추진을
   `HKQuantityTypeIdentifierPushCount`로 세고 `StepCount`로 세지 않는다. Health Connect에는 `StepsRecord`
   밖에 없다. `WorkoutWrite.steps`를 그대로 `StepCount`에 넣으면 **사용자의 걸음 총계가 틀린다**.
   현재 설계(§8.3 C3)는 **v1에서 `kind === 'wheelchair'`면 iOS에 step 샘플을 쓰지 않고 문서화**하는
   것이며, `pushes` 필드는 새 입력 표면이므로 만들지 않았다. 소유자 확인이 필요한 이유는 이것이
   **결정 ③의 2차 비용**이고 대안이 셋이기 때문이다 — (a) 현재 설계대로 조용히 건너뛴다,
   (b) `steps`가 있는 wheelchair 워크아웃을 `invalidArgument`로 거절한다(시끄럽지만 정직하다),
   (c) `pushes?: number` 입력 필드를 추가한다(입력 표면 확대, 새 채택표 행 필요).
   **추천: (a).** 조용하지만 사용자 데이터를 오염시키지 않고, 실제 휠체어 소비자가 나타나면 (c)를
   1.0 이전 minor로 additive하게 넣을 수 있다.

2. **`snowboarding`을 지금 넣을 것인가.** 채택 #29가 못 박은 대로 `WorkoutKind`는 **1.0.0 이전에
   확정**돼야 한다 — 1.0 이후의 확대는 major다. `snowboarding`(iOS 67 / HC 62)은 §8.3 기각표에서
   **의미가 깨끗한데도 범위만으로 기각된 유일한 후보**이므로, 1.0 이후에 요구가 오면 그때는 늦다.
   **추천: 넣지 않는다.** `skiing`을 깨끗하게 넣을 수 없는 상태에서 스노보드만 넣으면 유니언이
   비대칭이 되고, 그 비대칭이 다음 요구를 부른다. 다만 이 문장이 "그때 논의하지 않았다"는 변명이
   되지 않도록 여기에 남긴다.

## 부록 A. Phase 0 사실 역인덱스

f61–f70 iOS route 쓰기 → §3.3, §8.1, §11-1 · f71–f76 totals/indoor/provenance → §5.1, §8.3, §8.7 · idx f32(권한 문자열)·f36(HC exerciseType)·f58(고도 메타데이터) → **§8.3, §8.8** · f77–f80 route 읽기 비용 → §5.3, §8.7 · f81–f86 HealthKit 저장 위생 → §8.2 · f87 iOS 시간창 → §5.3, §8.7, §9.3 · f88 availability → §3.4, §5.7-3·4 · f89·f91 권한·cross-app 가시성 → §5.1(`WorkoutWrite.id` JSDoc), §5.2 · f92–f98 업서트/삭제 → §4.6, §8.5, §8.6, §6.1-④ · f99–f106 크기 천장 → §5.2(`MAX_ANDROID_ROUTE_POINTS`), §5.7-37, §8.2 · f107–f109 Android 창/aggregate → §8.4, §5.3(`readSteps`), §9.3(`no-aggregate`) · f121 권한 다이얼로그 행 → **§8.8, §0.2 채택 #31, §6.1-㉖** · f110–f118 route 접근 상태 기계 → §5.1(`RouteAccess`), §5.3(`getRoute`), §5.7-26..34 · f119–f124 인텐트·UI 문자열·자동화 → §5.3(`openSettings`), §7.1, §9.5 · f125–f132 검증 환경 → §9.5, §10.1(`gradle.properties` 금지)
