# @gj-kit/expo-media — 공개 API 표면 설계 (확정)

> 작성: 2026-08-10. 설계안 2개(GoldenPathFirst / VerificationFirst) 경쟁 → 심사 3건(재사용성 / 타입안전·하드닝보존 / 이관현실성) → 합성.
> 전신: memorylog2 `packages/photo-kit`(@memorylog/photo-kit, 비공개, 14모듈 **2,764줄**) + `apps/mobile/src/photos`(어댑터 14 + 테스트 7).
> 형식·깊이 기준: `docs/design/expo-ui-api-surface.md`. 구현 코드의 주석은 이 문서의 §번호를 역참조한다.
> **합성 단계에서 재실측한 항목은 §0.3에 전부 나열한다.** 두 설계안과 세 심사가 공유하던 전제 하나(jest export 조건)가 사실과 반대였고, 그 정정이 §2의 exports 맵을 바꿨다.

---

## 0. 채택 맵

### 0.1 심사 점수

| 심사 | GoldenPathFirst | VerificationFirst |
|---|---|---|
| 재사용성 | **72** | 68 |
| 타입안전·하드닝보존 | **76** | 68 |
| 이관현실성 | 58 | **78** |
| 섀시 추천 | 2표 | 1표(단, 난제 A는 GPF로 뒤집을 것) |

**GoldenPathFirst를 섀시로, VerificationFirst를 대폭 접붙인다.** 섀시 선정 근거는 난제 A 하나다 — "플랫폼 포크를 라이브러리가 소유하는가"는 exports 맵·엔트리·tsup 설정·README를 전부 재작성해야 뒤집히는 구조적 분기점이고, 내가 memorylog2의 실제 metro-resolver로 재현한 결과 GPF의 exports 조건 포크가 정확히 작동한다(§0.3 V1). 반면 어댑터 계약·peer 선언·에러 코드·저장 경로는 국소 교체가 가능하므로 VerificationFirst 것을 그대로 이식했다.

### 0.2 채택표

| 결정 | 출처 | 근거 |
|---|---|---|
| exports `browser` 조건 포크를 **정본** 포크 메커니즘으로 | GPF §A.4 | metro-resolver 실구동 7/7 정확(§0.3 V1). Metro·webpack·vite·esbuild 공통 표준이라 라이브러리가 플랫폼 지식을 소유한다 |
| `.web.ts` 파일명 규약 폐지, 포크 라우팅은 exports 맵 한 곳 | GPF §A.5-4 | 두 진실 금지. 파일명은 `src/device/{expo,web}.ts` |
| `dist-peer-graph` CI 가드 | GPF §0.1 | 'optional peer 강등'을 문서 주장에서 CI 단언으로. 프로토타입 재현 성공, **CJS까지 확장 확인**(§0.3 V4) |
| `limits: MediaUploadLimits \| 'server-enforced'` | GPF §D-④ | VF의 `Number.POSITIVE_INFINITY`는 JSON 직렬화 불가이고 '서버가 검증'과 '무제한'을 구분 못 함 |
| duration 초/ms 정규화를 **core**에 유지 | GPF 하드닝 4 | VF는 어댑터 경계로 분산 + `Milliseconds` 브랜드로 방어하나, `millis(초)`가 통과해 사고 모드를 못 막는다(§0.4 기각 6) |
| `UploadResult<TAsset>` 반환 통일(WeakSet 해킹 제거) | GPF §F.4 | 소비자가 memorylog2 하나뿐인 지금이 유일한 교정 기회 |
| `isOwnStagingUri` 3조건 판정(캐시 디렉토리 시작 + 파일명이 prefix로 시작 + 하위 경로 없음) | GPF §6-7 | 원본 `uri.includes(PREFIX)`(deviceUploadCache.ts:29 실측) 대비 명백한 강화 |
| 스테이징 정리를 **객체 소유 메서드**로 승격 | VF §6.5 | 프리픽스를 설정 가능하게 열면서 자유 함수로 두면 "어떤 프리픽스로 만든 걸 어떤 프리픽스로 지우는가"가 호출자 규율이 된다. GPF 3조건 술어 + VF 객체 소유를 합침 |
| `peerDependenciesMeta` 전부 optional | VF §3.2 | GPF가 스스로 약점으로 인정. 엔트리 그래프가 이미 조기 발각을 제공하므로 필수 선언은 검출력을 더하지 않고 core-only 소비자에게 거짓 경고만 준다 |
| `expo-constants` peer 완전 제거 → `isExpoGo` 인자화 | VF | Android Expo Go 판정 1곳(saveImages.ts:96) 때문에 peer 유지할 이유 없음 |
| `permission-denied` · `config-invalid` 등 5개 에러 코드 신설 | VF §6.1 | uploader.ts에 한국어 bare `Error` **9곳** 실측(§0.3 V6). errors.ts 주석은 "code로 분류하라"를 요구하는데 그 규약을 어긴다 — 호스트가 "설정으로 이동" UI를 띄울 근거가 없다 |
| `SaveTarget` 판별 유니언 | VF §6.6 | 원본 `SaveImagesDependencies`는 7필드 전부 옵셔널 + `globalThis.document` 폴백. 무효 조합이 조용히 통과 |
| `computeChunkRanges`에서 `chunkBytes` 공개 인자 제거 | VF | 3의 배수 제약은 타입으로 표현 불가 → 표현 가능성 자체를 없앤다(hashFile.ts:16 실측: 현재 공개 기본 인자) |
| `Symbol.for` 에러 태그 + 브랜드는 **타입 전용**(§5.3) | VF §3.3 + 개정 | tsup 엔트리 10 + `splitting:false`에서 `instanceof`는 반드시 깨진다. VF의 브랜드 `Symbol()` 각인은 **같은 이유로 함께 깨지므로** 런타임 심볼을 버리고 phantom property로 확정했다 |
| `splitting: false` | VF §3.3 | GPF는 CJS splitting을 켜고 스스로 '실험적·실기기 미검증'이라 인정. 엔트리 자기완결이 dist-peer-graph 검사도 단순하게 만든다 |
| 포스터 어댑터를 입력 타입으로 자연 분리 | VF §4.1 | GPF의 `fromBinary?` 옵셔널 메서드는 자기가 D-①에서 금지한 부분 구현 구멍을 다시 연 것 |
| `hardening-guard` 정적 소스 스캔 | VF §8 | 주석은 리팩터링을 이기지 못한다. expo-ui `entry-guard`/`token-guard` 선례 계승. 단 granular 권한 규칙은 저장 경로 예외 필요(§0.4 기각 9) |
| 필수 수정 테스트 **3파일**(mediaPermission.test.ts 포함) | VF §10.2 | GPF는 2파일로 세고 `mediaPermission.test.ts:10`을 놓쳤다(§0.3 V5) |
| 어댑터 조립을 **팩토리별 필수 인자**로 (합성 신설) | 합성 | GPF의 5종 완전 객체 강제와 VF의 capability 교차 타입을 **둘 다 기각**하고 대체(§0.4 기각 1·2, §3.1) |

### 0.3 합성 단계 재실측 (원 실측 — 두 설계안의 자기 주장을 액면가로 믿지 않은 결과)

| # | 측정 | 방법 | 결과 |
|---|---|---|---|
| **V1** | exports 조건 포크가 실제로 갈리는가 | memorylog2의 `node_modules/metro-resolver`(0.84.4)를 직접 require하고 `@expo/metro-config`와 동일한 `unstable_conditionsByPlatform`으로 실제 픽스처 패키지를 resolve | `browser` 조건 = **7/7 정확**. ios/android × ESM/CJS → 네이티브, web × ESM/CJS → `.web.js`/`.web.cjs`, jest 조건 → 네이티브 `.cjs`. **평문 문자열 타깃**은 web에서도 네이티브를 반환(플랫폼 확장자 미적용) — 조건이 유일한 수단임을 확증 |
| **V2** | jest가 `react-native` 조건을 붙이는가 | `apps/mobile/jest.config.ts`(`preset: "jest-expo"`) → `jest-expo/jest-preset.js` → `@react-native/jest-preset/jest-preset.js` → `jest/react-native-env.js` 정독 | **붙인다.** `customExportConditions = ['require', 'react-native']`. 두 설계안과 두 심사가 공유한 "jest-expo 네이티브 프리셋은 조건을 설정하지 않는다"는 **거짓**. `getPlatformPreset.js`의 미설정 분기는 `jest-expo/ios` 같은 플랫폼별 프리셋 경로이고, memorylog2는 루트 `jest-expo`를 쓴다 |
| **V2b** | 그래서 무엇이 깨지는가 | V1 픽스처에 bare `"react-native"` 키를 추가해 재측정 | **덫이 실재한다.** bare `react-native` 키가 ESM 파일을 가리키면 jest(`['require','react-native']`)와 ios CJS가 **ESM을 CJS 컨텍스트로 로드**한다. → §2.3 규칙 1: bare `react-native` 키 금지 |
| **V3** | capability 교차 타입이 애노테이션에서 붕괴하는가 | TypeScript 5.9.3, strict + EOP + noUncheckedIndexedAccess로 VF §6.2 재현 | **붕괴한다.** `const a: MediaAdapters = {...}` → `A['library']`가 `Lib \| undefined` → 조건부가 전부 `unknown` → `uploadDeviceAssets`·`uploadLocalFile` **둘 다 소멸**. `satisfies`로 만든 객체에서만 동작 |
| **V4** | dist-peer-graph 가드가 CJS도 검사 가능한가 | `expo-ui/dist`에 상대 import 재귀 추적 스크립트를 ESM·CJS 양쪽으로 실행 | **양쪽 다 동작.** `index` → react·react-native·react/jsx-runtime / `theme`·`tailwind` → none / `insets` → +safe-area-context. **ESM과 CJS 결과가 동일** — 심사가 지적한 CJS 사각지대가 해소된다 |
| **V5** | memorylog2 소비 표면 | `apps/mobile/{src,app}`에서 `photos/` import 문 파싱(`src/photos/` 자신 제외) | **20파일 / 40 import.** 모듈별: errors 12 · uploadPhoto 9 · saveImages 4 · devicePhotoLibrary 4 · uploadDeviceAssets 3 · pendingPhotos 3 · devicePhotoLibraryTelemetry 3 · photoMetadata 1 · hashFile 1. `jest.mock(".../photos")` **17사이트 / 11파일**. photo-kit 내부 경로 직접 참조 **3파일** |
| **V6** | 한국어 하드코딩 · bare Error | photo-kit `src/*.ts` 전수 grep | 한국어 리터럴 **24개**(uploader 17 · devicePhotoLibrary 4 · saveImages 2 · hashFile 1). 한국어 bare `Error` **9사이트**(uploader.ts 237·295·625·678·717·918·937·973·998) — VF가 잡은 권한 4곳 외에 포스터 2·미디어 부재 1·자산 무효 2가 더 있다 |
| **V7** | 앱 tsc가 `.web.ts`를 검사하는가 | `node_modules/expo/tsconfig.base.json` + `apps/mobile/tsconfig.json` | `customConditions: ["react-native"]`, `lib: ["DOM","ESNext"]`, **`moduleSuffixes` 없음**. tsc는 `./adapters`를 항상 `adapters.ts`로 해석 → VF의 앱측 포크 타입 이득은 발화하지 않는다 |
| **V8** | 전신 규모 | `wc -l packages/photo-kit/src/*.ts` | **14파일 2,764줄** 확인(uploader 1045 · devicePhotoLibrary 378 · saveImages 346 · photoMetadata 290 · mediaTypes 168 · types 124 · hashFile 85 · videoPoster 84 · debug 75 · devicePhotoLibrary.web 48 · mediaPermission 39 · deviceUploadCache 34 · errors 31 · index 17) |

**2차 실측 (완결성 비평 20건 해소 라운드 — 초안의 §2.4·§2.3·§5·§11이 이 결과로 교체됐다)**

| # | 측정 | 방법 | 결과 |
|---|---|---|---|
| **V9-a** | 전신 공개 심볼 전수 | 배럴 `index.ts`가 재export하는 12모듈에 `^export (async function\|function\|const\|class\|type\|interface\|{)` grep | **81개**(types 12 · mediaTypes 20 · devicePhotoLibrary 14 · uploader 6 · saveImages 6 · debug 5 · errors 4 · hashFile 4 · videoPoster 4 · photoMetadata 2 · deviceUploadCache 2 · mediaPermission 2). + 팩토리 반환 메서드 13 = **94**. 전수 대응표는 **§5.7** |
| **V9-b** | 심볼별 실소비 | `apps/mobile/{src,app}` 전수 grep 후 `src/photos/` 재export 체인 추적 | **실소비 34 / 무소비 47.** 임포터 0인 앱 어댑터 모듈 **3개**: `src/photos/debug.ts` · `deviceUploadCache.ts` · `mediaPermission.ts`(자기 테스트 1) |
| **V9-c** | `src/photos/` **밖**의 소비 파일 | `grep -rln 'photos/[a-zA-Z]*"'` (자기 제외) | **29파일**(테스트 포함). 그중 `src/sync/` **5파일** — §11.6의 "동기화 엔진 0수정" 주장이 반증된 지점(§5.7.5) |
| **V9-d** | 웹에서 도달하는 피커 경로 | `app/profile-edit.tsx`의 플랫폼 게이트 확인 | **게이트 없음.** `pickAndUploadPhoto()`가 web에서 `uploader.ts:695-710`(fetch(blob:)→Blob→uploadImageBlob)에 도달 → G18 실재(§5.7.4) |
| **V9-e** | `image/gif` 정합성 | `packages/photo-kit/src/mediaTypes.ts:7-16` + `packages/shared/src/index.ts:359-380` grep | **양쪽 모두 gif 0건.** 서버 zod가 `SUPPORTED_MEDIA_CONTENT_TYPES.join("\|")` 정규식으로 contentType을 검증(`shared/src/index.ts:459`)하므로, 클라이언트만 gif를 통과시키면 presign 단계에서 서버가 거절한다 → **gif 유니언에서 제거**(§5.1) |
| **V-A** | 현행 §2.4가 실제로 빌드되는가 | gj-kit `tsconfig.base.json`을 extends하고 expo-ui와 동일한 tsup 설정을 쓰는 실프로젝트 7개(`z`/`a`/`b`/`c`/`c2`/`d`/`a2`)를 만들어 원본 `videoPoster.ts`(84줄)·`saveImages.ts` 다운로드 경로·§5.6 시그니처 3종을 재현해 실빌드 + 소비자 픽스처 16종 tsc | **현행안 tsup exit 1.** DTS 9건 실패로 `.d.ts` 0개, `tsc --noEmit` 22건. 결함은 `Document` 하나가 아니라 **7종 식별자**(Blob×5·URL×4·Document×4·setTimeout×2·fetch×2·clearTimeout×1·HTMLVideoElement×1). 후보 (b)·(c)·(d) 전부 기각, **(a)+DOM 각인+가드 2종**으로 확정 → §2.4 |
| **V-B** | peer 하한 5종 · `browser` 조건의 실앱 성립 | npm 레지스트리 타르볼 전개본 d.ts 정독(fs·ml·ip·vt 각 5~6버전) + Expo SDK 56 실앱 `expo export` 산출물 스캔 | **`">=54"`는 4/4 오답**(SDK 번호를 semver로 씀 — SDK 54 릴리스를 전부 배제). 확정 하한 §2.3. 그리고 **`browser` 단독 포크는 `web.output:"static"\|"server"`의 SSR 번들에서 깨진다**(조건 집합에 `browser`가 없다) → `node` 브랜치 추가로 해소·재검증 → §8.2 케이스 H |

### 0.4 기각 결정 (실측 근거 포함 — 재론 금지)

| # | 기각 대상 | 출처 | 기각 근거 |
|---|---|---|---|
| 1 | **capability 교차 타입** (`A['library'] extends ... ? X : unknown`) | VF §6.2 | **V3 실측**: 타입 애노테이션 한 번에 전 기능이 조용히 소멸한다. 3자 소비자가 가장 자연스럽게 쓰는 형태가 라이브러리를 무력화하는 설계는 채택 불가. 추가로 VF 자신의 `LibraryUploads` 게이트는 `staging`을 검사하지 않아 하드닝 7이 런타임 undefined로 샌다. 대체: §3.1 팩토리별 필수 인자 |
| 2 | **5종 완전 어댑터 객체 강제** (`adapters: MediaAdapters`) | GPF §C.2 | GPF 자신의 엔트리 표가 `"./core"` 대표 소비자로 든 bare RN·web-only·Node는 `PickerAdapter` 4메서드와 `FileSystemAdapter` 6메서드를 throw 스텁으로 채워야 한다. seam이 테스트용으로는 진짜지만 **이식용으로는 반쪽**. 대체: §3.1 |
| 3 | **`.web.ts` 포크를 소비 앱 소스로 이전** | VF §2.3 | **V7 실측**: tsc에 플랫폼 확장자 해석이 없고 `moduleSuffixes`도 없어, VF가 '이 안의 가장 큰 이득'이라 명명한 "웹 빌드에서 `uploadDeviceAssets`가 타입 수준으로 소멸"이 발화하지 않는다. 오늘의 throw 스텁과 안전성이 동일하면서 플랫폼 지식만 소비자 앱으로 떠넘긴다 |
| 4 | **`.` 엔트리에 expo-image-picker 포함** | GPF §B | 난제 B의 자기 판단 기준("업로드만 필요한 앱")을 expo-media-library에 대해서만 만족하고 피커에 대해 위반. memorylog2 `src/sync/uploadAsset.ts`가 정확히 그 소비자다. 대체: `"./picker"` 분리(§2.1) |
| 5 | **`"./video"`에 웹 canvas 포스터 동거** | GPF 엔트리 표 | "`webCanvasVideoPoster`만 쓰면 peer 0"은 거짓 — Metro는 기본 트리셰이킹을 하지 않아 정적 import된 `expo-video-thumbnails`가 그래프에 들어간다. GPF 자신의 §0.3 원칙("peer 경계 = 엔트리 경계")과 충돌하며 dist-peer-graph 가드에 걸린다. 대체: 웹 포스터는 `"./web"` |
| 6 | **`Milliseconds` 브랜드** | VF §7-⑤ | 사고는 "숫자를 안 감쌌다"가 아니라 "초를 밀리초 자리에 넣었다"인데 `millis(asset.duration)`은 완벽히 컴파일된다. 3자 어댑터 작성자 전원에게 마찰만 부과하는 순수 극장. 대체: core 단일 지점 정규화(하드닝 4, §7) |
| 7 | **bare `"react-native"` exports 키** | 양 안 | **V2b 실측**: jest(`['require','react-native']`)와 ios CJS가 ESM을 CJS로 로드해 memorylog2 스위트가 즉사한다. `default`/`import`/`require`만 쓴다(§2.3) |
| 8 | **`limits`의 `Number.POSITIVE_INFINITY` 탈출구** | VF §6.3 | JSON 직렬화 불가(원격 설정 호스트에서 즉시 문제) + "서버가 검증"과 "무제한"을 구분 못 함. 대체: `'server-enforced'` 리터럴 |
| 9 | **granular 권한 가드의 무조건 규칙** | VF §8 | `saveImages.ts`의 정당한 `requestPermissionsAsync(true)`(writeOnly 저장 권한, 목록 없음이 정상)를 오탐한다. 규칙은 유지하되 **읽기 경로에만** 적용(§10.3) |
| 10 | **CJS `splitting: true`** | GPF §3 | GPF 자신이 '실험적·실기기 미검증'으로 인정. `Object.defineProperty` getter 재export가 Metro CJS 런타임에서 어떻게 동작하는지 불확실한데 memorylog2 jest(CJS)가 그 위에 얹힌다 |
| 11 | `bundle: false` | 양 안 | 확장자 없는 지정자가 보존돼 Metro 포크는 되지만 Node ESM 규격 위반(`ERR_MODULE_NOT_FOUND`) — 공개 패키지 실격 |
| 12 | `Platform.OS` 런타임 분기로 포크 대체 | 양 안 | Metro는 정적 import를 분기 뒤에 있어도 그래프에 넣는다. 웹 번들에 expo-media-library가 들어온다 |
| 13 | 런타임 `try { require(...) } catch {}` optional 로딩 | GPF §C.3 | 빌드 타임 에러를 런타임 에러로 강등 + Metro 전용 동작 + ESM 산출물에 bare `require()` |
| 14 | 호출 순서 typestate · `CollectionId`/`Uri`/`Bytes` 전면 브랜드 · 어댑터 빌더 체인 · `MediaContentType` 리터럴 브랜드 | VF §7 기각표 | 사고 이력 0인 곳에 비용을 쓰지 않는다. 이 표를 그대로 계승 |

---

## 1. 설계 원칙

전신 photo-kit의 핵심 결함은 기능이 아니라 **경계**다. 2,764줄에 축적된 하드닝은 훌륭하지만:

1. 코어가 `react-native`·`expo-*`·`__DEV__`에 직접 물려 있어 **호스트 앱 jest 밖에서는 한 줄도 테스트할 수 없다**. `photoMetadata.ts`(290줄, 순수 파서)조차 그렇다.
2. 사용자 문구 **24개**가 한국어로 하드코딩돼 있고(V6), 그중 **9개는 bare `Error`**라 호스트가 `code`로 분기할 수 없다 — `errors.ts` 주석이 명시한 계약을 코드가 어긴다.
3. `"memorylog-upload-"` 프리픽스로 호스트 앱 이름이 범용 모듈에 샜다(`deviceUploadCache.ts:8`).
4. `__photoKitVerifiedSizeBytes` 뒷문 프로퍼티와 `as ImagePicker.ImagePickerAsset` 캐스트로 타입이 뚫려 있다.
5. `devicePhotoLibrary.web.ts` 48줄이 **Metro의 플랫폼 확장자 해석**에 의존한다 — 빌더를 tsup으로 바꾸는 순간 조용히 죽는 구조(§8).

이번 불변식:

1. **코어는 순수하다.** `src/core/**`는 `react`·`react-native`·`expo-*` import 0, DOM 전역 참조 0, 런타임 의존성 0. ⚠ **이 규율을 강제하는 것은 빌드 tsconfig의 `lib`이 아니다** — 빌드 tsconfig는 `src/web/**`이 컴파일되도록 `["ES2022","DOM"]`을 쓰고, 무DOM은 `tsconfig.core.json`(소스)과 `skipLibCheck:false` 픽스처(dist) **가드 2종**이 강제한다(§2.4 V-A 실측: tsup은 코어의 DOM 유출을 전혀 잡지 못한다). `tests/unit/entry-guard.test.ts`가 문자열 수준에서 소스와 dist 양쪽을 추가로 스캔한다. → gj-kit vitest에서 네이티브 모킹 없이 코어 전 파이프라인 검증(목표 a).
2. **소비자는 자기가 가진 것만 주입한다.** 어댑터는 "완전 객체"도 "옵셔널 가방"도 아니다. 각 팩토리가 **자기가 실제로 쓰는 의존만 필수 인자로** 받는다(§3.1). 조건부 타입 0 — V3의 붕괴가 구조적으로 불가능하다.
3. **peer 경계 = 엔트리 경계.** 런타임 마법(try/require, 지연 import) 금지. "어느 엔트리를 import했나"가 그래프를 결정하고, 그래프는 `dist-peer-graph` 가드가 ESM·CJS 양쪽으로 측정한다(§10.3).
4. **플랫폼 포크는 라이브러리가 소유한다.** exports `browser` 조건 하나로 라우팅하며, 소비 앱은 `.web.ts` 쌍을 쓰지 않는다(§8).
5. **검증 강제는 "조용히 깨진 이력"에만.** 원본 주석의 사고 11종과 실제 데이터 오염 경로만 타입/런타임으로 막는다. 과잉은 §6.2 기각표에 비용과 함께 남긴다.
6. **검증된 하드닝은 하나도 잃지 않는다.** 11종 + 추가 17종 전부의 새 주소와 **그것을 지키는 테스트**를 §7에 명시한다. 주석은 리팩터링을 이기지 못하므로, 정적으로 붙잡을 수 있는 것은 가드 테스트로 못 박는다.
7. **공개 props의 옵셔널 필드는 전부 `?: T | undefined`** (EOP 소비자 보호 규약 — expo-ui §2). `Partial<T>`는 이 규약을 위반하므로 공개 API에 쓰지 않는다.

---

## 2. 모듈 구조와 exports 맵

### 2.1 디렉토리 트리

> **개수 정본 (G19 해소 — 문서 전체가 이 두 수를 쓴다)**
> **공개 서브패스 = 8** (`.` · `./core` · `./picker` · `./device` · `./save` · `./video` · `./web` · `./testing`)
> **tsup 엔트리 = 10** = 공개 8 + 조건 포크 2(`src/device.web.ts` · `src/save.web.ts`).
> 포크 2개는 exports 맵의 `node`/`browser` 브랜치 타깃일 뿐 **서브패스가 아니다** — 소비자가 `@gj-kit/expo-media/device.web`으로 import할 수 없다.
> `scripts/check-readme.mjs`의 `paths` 맵과 `dist-peer-graph`·`nodom-entries` 가드는 **공개 8**을 쓰고, `tsup.config.ts`의 `entry` 배열만 **10**을 쓴다.

```
expo-media/                        # @gj-kit/expo-media
├─ package.json                    # sideEffects:false, ESM+CJS(tsup), 런타임 의존성 0
├─ tsup.config.ts                  # entry 10 = 공개 서브패스 8 + 조건 포크 2, splitting:false
├─ tsconfig.json                   # 빌드·dts 정본 — lib:["ES2022","DOM"] (tsup이 읽는 유일한 tsconfig, §2.4)
├─ tsconfig.core.json              # 무DOM 소스 가드 — lib:["ES2022"], src/web 제외 (§2.4)
├─ tsconfig.tests.json             # tests — DOM 포함
├─ scripts/check-readme.mjs        # expo-ui에서 복제, paths 8개 공개 서브패스
├─ scripts/stamp-dom-reference.mjs # 빌드 후처리 — dist/web.d.{ts,cts}에만 DOM 각인 (§2.4)
└─ src/
   ├─ core.ts                      # "./core" 배럴 — peer 0, DOM 0
   ├─ index.ts                     # "." 배럴 — core 재export + createMediaKit + expo 기본 어댑터
   ├─ picker.ts                    # "./picker"
   ├─ device.ts / device.web.ts    # "./device" 조건 포크 쌍
   ├─ save.ts   / save.web.ts      # "./save"   조건 포크 쌍
   ├─ video.ts                     # "./video"  — expo-video-thumbnails 전용
   ├─ web.ts                       # "./web"    — DOM 전용 (canvas 포스터·fetch·브라우저 다운로드)
   ├─ testing.ts                   # "./testing"
   ├─ core/                        # react-native·expo·DOM import 0 (entry-guard 강제)
   │  ├─ brand.ts                  # (비공개) **타입 전용** phantom property — 런타임 심볼 없음(§5.3). 재export 금지
   │  ├─ adapters.ts               # 어댑터 계약 전부 (§3)
   │  ├─ types.ts                  # api 계약, 결과 타입, telemetry
   │  ├─ errors.ts                 # MediaError(Symbol.for 태그) + 16 코드
   │  ├─ telemetry.ts              # MediaTelemetry/MediaActivity 스팬 계약 + MEDIA_OPERATIONS 6종
   │  ├─ strings.ts                # MediaStrings(22키) + enMediaStrings/koMediaStrings
   │  ├─ mediaTypes.ts             # 확장자↔MIME 단일 테이블 (전신 168줄 그대로)
   │  ├─ metadata.ts               # EXIF dict + JPEG APP1 파서 (전신 290줄 그대로)
   │  ├─ sha256.ts                 # 순수 TS 증분 SHA-256 (§9)
   │  ├─ hashFile.ts               # HASH_CHUNK_BYTES + computeChunkRanges + base64 스트리밍
   │  ├─ staging.ts                # StagingCache (브랜드, 객체 소유 cleanup)
   │  ├─ debug.ts                  # summarizeUri / sanitizeMediaErrorMessage / 로거
   │  ├─ upload/                   # resolveSize · uploader · webBatch
   │  ├─ device/                   # createDeviceLibrary · resolveSource
   │  └─ save/                     # createMediaSaver · fileName
   ├─ expo/                        # 기본 어댑터 — platform/fs/transport
   ├─ picker/expo.ts
   ├─ device/{expo,web}.ts
   ├─ save/{expo,web}.ts
   ├─ video/expo.ts
   ├─ web/                         # DOM 구현
   └─ testing/                     # 인메모리 어댑터·페이크 API
```

### 2.2 엔트리별 peer 표 (정본 — `dist-peer-graph` 가드가 이 표와 산출물을 대조한다)

| 엔트리 | 내용 | 이 엔트리가 정적 import하는 peer | 대표 소비자 |
|---|---|---|---|
| `"./core"` | 어댑터 계약 전부, 팩토리 8종(§5), `MediaError`(16코드), `MediaStrings`(22키)+en/ko, mediaTypes 테이블, EXIF 파서, 순수 TS SHA-256, `computeChunkRanges`, `StagingCache`, `summarizeUri`/`sanitizeMediaErrorMessage`, 기기 자산 해석 정책, 크기·duration 정규화 | **없음** (react-native조차 없음. DOM lib도 없음) | bare RN, web-only, Node 스크립트, gj-kit vitest, 커스텀 어댑터 구현자 |
| `"."` | `"./core"` 전체 재export + `createMediaKit` + expo 기본 어댑터(platform·fs·localTransport·binaryTransport·hasher) | `react-native`, `expo-file-system`(+`/legacy`) | **골든패스.** 로컬 URI 업로드(동기화 엔진), 웹 Blob 업로드 |
| `"./picker"` | `expoPicker` — OS 피커/카메라, 권한, iOS 원본 fast path | `expo-image-picker`, `react-native` | 피커·카메라 업로드를 하는 앱 |
| `"./device"` | `expoDeviceLibrary` — 권한(granular)·페이지네이션·앨범·자산정보. **비네이티브 포크**(`node`+`browser` 조건) → 열거는 빈 결과, resolve는 `platform-unsupported` | `expo-media-library/legacy`, `react-native` | 인앱 기기 사진 그리드, 자동 동기화 스캐너 |
| `"./save"` | `expoDeviceSave({ isExpoGo })` — MediaLibrary 저장. **비네이티브 포크**(`node`+`browser` 조건) → 브라우저 다운로드 타깃, MediaLibrary import 0 | `expo-media-library/legacy`, `react-native` | 저장된 자산을 기기로 내려받는 앱 |
| `"./video"` | `expoVideoPoster` — 로컬 URI → 포스터 프레임 | `expo-video-thumbnails` | 동영상을 올리는 네이티브 앱 |
| `"./web"` | `webCanvasVideoPoster`(Blob→canvas JPEG), `createFetchBinaryTransport`, `createBrowserSaveTarget({ document, fetch })` | **없음** (브라우저 DOM 필요) | 웹 드롭존, 웹 관리자 도구 |
| `"./testing"` | `createMemoryFileSystem`, `createRecordingTransport`, `createFakeDeviceLibrary`, `createFakePicker`, `createFakeUploadApi`, EXIF·서명URL 픽스처 | **없음** | gj-kit unit 테스트, 소비 앱 통합 테스트 |

**소비자 시나리오 검증표** (난제 B의 판단 기준 — "이 optional peer를 설치하지 않은 소비자가 여전히 쓸 수 있어야 하는 코드는 다른 엔트리에 있어야 한다")

| 소비자 | 필요한 엔트리 | 설치 불필요한 peer |
|---|---|---|
| 백그라운드 동기화(로컬 URI 업로드만) | `.` | expo-image-picker, expo-media-library, expo-video-thumbnails |
| 웹 드롭존 / 웹 관리자 도구 | `./core` + `./web` | expo-* 전부, react-native |
| OS 피커 업로드(이미지 전용) | `.` + `./picker` | expo-media-library, expo-video-thumbnails |
| 기기 그리드 + 저장 + 동영상 (= memorylog2) | 전 엔트리 | — |
| bare RN 커스텀 어댑터 | `./core` | 전부 |

**불변식**: `"."`은 `"./picker"`·`"./device"`·`"./save"`·`"./video"`·`"./web"`을 import하지 않는다(단방향 — 소비자가 조합). `tests/unit/dist-peer-graph.test.ts`가 이 표와 산출물을 **조건 3세트(`browser`/`node`/네이티브) × 모듈 2형식(ESM·CJS)**으로 대조한다(§10.3 — 초안의 ESM/CJS 2세트만으로는 §8.2 케이스 H의 SSR 누수를 잡지 못한다).

### 2.3 package.json exports (확정 형태)

```jsonc
{
  "name": "@gj-kit/expo-media",
  "version": "0.0.0",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "files": ["dist"],
  // 최상위 main/module/types — node10 도구·구형 리졸버 구제 (expo-ui §12-8 계승)
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".":        { "import": { "types": "./dist/index.d.ts",  "default": "./dist/index.js" },
                  "require":{ "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } },
    "./core":   { "import": { "types": "./dist/core.d.ts",   "default": "./dist/core.js" },
                  "require":{ "types": "./dist/core.d.cts",  "default": "./dist/core.cjs" } },
    "./picker": { "import": { "types": "./dist/picker.d.ts", "default": "./dist/picker.js" },
                  "require":{ "types": "./dist/picker.d.cts","default": "./dist/picker.cjs" } },

    // §8 — 비네이티브 포크. `node`와 `browser`가 **둘 다** 필요하다(§8.2 케이스 G·H 실측).
    // bare "react-native" 키 금지(§0.3 V2b: jest·ios CJS가 ESM을 로드한다).
    // 양 포크는 같은 .d.ts를 가리킨다(Expo tsconfig의 customConditions:["react-native"] 때문에
    // 모든 브랜치에 types가 필요 — §8.4-3).
    "./device": {
      "node":    { "import": { "types": "./dist/device.d.ts",  "default": "./dist/device.web.js" },
                   "require":{ "types": "./dist/device.d.cts", "default": "./dist/device.web.cjs" } },
      "browser": { "import": { "types": "./dist/device.d.ts",  "default": "./dist/device.web.js" },
                   "require":{ "types": "./dist/device.d.cts", "default": "./dist/device.web.cjs" } },
      "import":  { "types": "./dist/device.d.ts",  "default": "./dist/device.js" },
      "require": { "types": "./dist/device.d.cts", "default": "./dist/device.cjs" }
    },
    "./save": {
      "node":    { "import": { "types": "./dist/save.d.ts",  "default": "./dist/save.web.js" },
                   "require":{ "types": "./dist/save.d.cts", "default": "./dist/save.web.cjs" } },
      "browser": { "import": { "types": "./dist/save.d.ts",  "default": "./dist/save.web.js" },
                   "require":{ "types": "./dist/save.d.cts", "default": "./dist/save.web.cjs" } },
      "import":  { "types": "./dist/save.d.ts",  "default": "./dist/save.js" },
      "require": { "types": "./dist/save.d.cts", "default": "./dist/save.cjs" }
    },

    "./video":  { "import": { "types": "./dist/video.d.ts",  "default": "./dist/video.js" },
                  "require":{ "types": "./dist/video.d.cts", "default": "./dist/video.cjs" } },
    "./web":    { "import": { "types": "./dist/web.d.ts",    "default": "./dist/web.js" },
                  "require":{ "types": "./dist/web.d.cts",   "default": "./dist/web.cjs" } },
    "./testing":{ "import": { "types": "./dist/testing.d.ts","default": "./dist/testing.js" },
                  "require":{ "types": "./dist/testing.d.cts","default": "./dist/testing.cjs" } },
    "./package.json": "./package.json"
  },
  // V-B 실측으로 확정(§12-2 종결). 각 값은 "설계가 실제로 호출하는 API가
  // 최초로 존재하는 버전"이며, 그 근거는 아래 표에 1:1로 적혀 있다.
  "peerDependencies": {
    "react-native": ">=0.71.0",
    "expo-file-system": ">=56.0.0",
    "expo-image-picker": ">=16.0.0",
    "expo-media-library": ">=56.0.5",
    "expo-video-thumbnails": ">=8.0.0"
  },
  "peerDependenciesMeta": {
    "react-native":          { "optional": true },
    "expo-file-system":      { "optional": true },
    "expo-image-picker":     { "optional": true },
    "expo-media-library":    { "optional": true },
    "expo-video-thumbnails": { "optional": true }
  }
}
```

**exports 규칙 4개 (V1·V2·V2b·V-B 실측 기반, 협상 불가)**

1. **bare `"react-native"` 키 금지.** 이 키는 jest(`['require','react-native']`)와 Metro ios/android CJS에서 매치되는데, 단일 파일 문자열을 가리키면 ESM이 CJS 컨텍스트로 로드된다(V2b 실측). `default`/`import`/`require`만으로 충분하다 — Metro 네이티브는 `import`, jest는 `require`로 정확히 떨어진다(V1 실측).
2. **`node`와 `browser`가 `import`/`require`보다 위.** 조건은 선언 순서대로 첫 매치가 이긴다. 아래에 있으면 web·SSR에서도 네이티브가 나온다. **둘 중 하나라도 빠지면 §8.2 케이스 H가 재발한다** — `browser`만 두면 `web.output:"static"|"server"` 소비자의 SSR 번들이 네이티브 포크를 끌어온다(V-B 실측). `node`와 `browser` 사이의 순서는 무관하다(서로 배타적).
3. **모든 조건 브랜치에 `types`.** Expo의 `tsconfig.base`는 `customConditions: ["react-native"]`를 설정하고(V7), CJS TS 소비자(node16)는 `d.cts`가 없으면 `TS1479 Masquerading as ESM`을 받는다(expo-ui §12-8 확정 발견). **`node` 브랜치에도 동일 적용** — 누락하면 SSR 코드에서 타입이 끊긴다.
4. **SDK 번호를 semver 범위에 쓰지 않는다.** 아래 근거표 참조.

**peer 하한 근거표 (V-B 실측 — 재론 금지)**

| peer | 하한 | 지배 API | 실측 근거 |
|---|---|---|---|
| `expo-file-system` | **`>=56.0.0`** | `new File(uri).upload(url, { httpMethod, headers, sessionType:'foreground', uploadType: UploadType.BINARY_CONTENT })` = 하드닝 1의 유일한 수단 | `56.0.0/build/FileSystem.d.ts:70`에 최초 등장. `55.0.19`·`19.0.20` d.ts에 `upload(` **0건**. CHANGELOG `56.0.0` 섹션 "Add `File.upload()` … (#45033)". `57.0.2`에도 유지 → 상한 없음 |
| `expo-media-library` | **`>=56.0.5`** | `expo-media-library/legacy` 서브패스 | `56.0.4`는 `exports` 필드·`legacy.ts`·`build/legacy/` **전부 부재**, `56.0.5`에 동시 등장. CHANGELOG `56.0.5` 🛠 Breaking "move the legacy API to `expo-media-library/legacy` (#46030)". **패치 릴리스가 breaking이므로 `^56` 표기는 틀린다** |
| `expo-image-picker` | **`>=16.0.0`** | `mediaTypes: ["images"]` 배열 형식 | `15.1.0`은 `mediaTypes?: MediaTypeOptions`(enum only), `16.0.0`부터 `MediaType \| MediaType[] \| MediaTypeOptions` + `type MediaType = 'images'\|'videos'\|'livePhotos'`. `UIImagePickerPreferredAssetRepresentationMode.Current`(§7.1 fast path)와 `ImagePickerAsset.{assetId,mimeType,fileSize,exif,duration}`도 16.0.0에 존재 |
| `expo-video-thumbnails` | **`>=8.0.0`** | `getThumbnailAsync(uri, { time })` → `{uri,width,height}` | `8.0.0`~`57.x` 시그니처·옵션 타입 무변경. **8.0.0 미만은 미검증** — 근거 없는 하한을 낮추지 않는다 |
| `react-native` | **`>=0.71.0`** | `Platform.OS`(`'web'` 비교 포함), `__DEV__` | RN이 TS 타입을 처음 번들한 `0.71.19`의 `Libraries/Utilities/Platform.d.ts`에 이미 `interface PlatformWebStatic { OS: 'web' }`가 있고 유니온에 포함(0.76.9·0.79.5 동일). 초안의 `>=0.79`는 근거 없이 좁아 `./core`·`./web`만 쓰는 RN 0.7x 소비자를 ERESOLVE로 막았다 |

> **`">=54"`가 왜 오류였나.** expo-* 패키지의 통합 버저닝은 SDK 55(=`55.x`)부터다. SDK 54 시점 버전은 `expo-file-system@19.x` · `expo-media-library@18.x` · `expo-image-picker@17.x` · `expo-video-thumbnails@10.x`였으므로, `">=54"`는 semver로 **SDK 54 릴리스를 전부 배제**하면서 실제 필요 하한(2건은 56.x)보다는 **느슨한** 범위였다 — 방향만 우연히 맞았다.
>
> **optional peer도 범위는 강제된다.** `peerDependenciesMeta.optional`은 "설치하지 않아도 된다"는 뜻이지 "설치되어 있으면 범위를 무시한다"가 아니다. 과잉으로 좁은 범위는 실제 ERESOLVE 실패를 만든다 — 하한은 API 근거가 있는 최저값으로 둔다.
>
> **실효 요구사항**: `.`·`./picker`·`./device`·`./save`는 사실상 **Expo SDK 56 이상**을 요구한다(file-system 56.0.0 / media-library 56.0.5). `./core`·`./web`·`./testing`은 peer 0이므로 SDK와 무관하다. **README 상단에 이 두 줄을 박는다.**
>
> **파생 사실 — web 셰이프에는 `upload`가 없다.** `expo-file-system`의 `ExpoFileSystem.web.ts`는 `FileSystemUploadTask.start()`가 `{body:'', status:0, headers:{}}`를 반환하는 no-op다(grep: `build/ExpoFileSystem.web.d.ts`에 `upload` 0건). 따라서 `"."`의 `localTransport`를 web/SSR에서 태우면 **조용히 성공한 것처럼 보인다** — web 바이너리 업로드의 정본은 `createFetchBinaryTransport`(`"./web"`)뿐이다(§8.5).

### 2.4 tsup / tsconfig — DOM 타입 경계 (V-A 실측으로 확정)

#### 문제

tsup은 빌드와 `dts` 생성에 **tsconfig를 하나만 읽는다**(`CLI Using tsconfig: tsconfig.json`). 따라서 초안의 "`src/web/**`만 `tsconfig.web.json`(DOM 포함)으로 분리한다"는 tsup에 **아무 효과가 없다**. 스크래치패드에 gj-kit `tsconfig.base.json`을 extends하고 expo-ui와 동일한 tsup 설정(esm+cjs · `dts:true` · `splitting:false` · `platform:'neutral'`)을 쓰는 실제 프로젝트를 만들어 원본 `videoPoster.ts`(84줄)와 `saveImages.ts`의 anchor+iframe 다운로드 경로, §5.6 공개 시그니처 3종을 재현해 빌드한 결과:

| 항목 | 결과 |
|---|---|
| `tsup` 종료코드 | **1** — ESM/CJS JS는 방출되지만(esbuild는 타입검사를 하지 않는다) DTS 단계에서 9건 실패해 `.d.ts`가 **하나도 생기지 않는다** |
| `tsc --noEmit -p tsconfig.json` | **22건 실패** |
| 미해석 식별자 | `Blob`×5 · `URL`×4 · `Document`×4 · `setTimeout`×2 · `fetch`×2 · `clearTimeout`×1 · `HTMLVideoElement`×1 |

즉 결함은 초안이 지목한 `Document` 하나가 아니다. `lib:["ES2022"]`에는 `setTimeout`·`URL`·`Blob`·`fetch`가 전부 없다.

#### 후보 4안 실빌드 판정

| 안 | 빌드 | 방출 d.ts | 무DOM 규율 강제 | 판정 |
|---|---|---|---|---|
| (a) 빌드 tsconfig `lib`에 DOM 포함 | 성공 | `Document`·`typeof fetch` 노출(19줄/795B) | tsup은 못 잡음 → 별도 가드 필요 | **채택**(각인·가드 동반 조건) |
| (b) `/// <reference lib="dom" />` | 성공 | **(a)와 바이트 동일** — 지시자는 방출물에 남지 않는다 | **없음.** 지시자 하나가 프로그램 전역 DOM을 켠다 | 기각 |
| (c) 자체 구조 타입 | 성공 | 87줄/2867B (shim 13종 공개) | 구조상 불필요 | 기각 |
| (d) `dts:{compilerOptions:{lib:[…]}}` | 성공 | (a)와 동일 | tsconfig를 또 쪼개야 함 | 기각 |

- **(b) 기각 근거(실측)**: `src/web.ts`에만 지시자를 둔 상태에서 `src/core.ts`에 `document.title`과 `Document` 파라미터를 주입했더니 `tsc -p tsconfig.json`이 **통과했다**. TypeScript의 `lib` 참조는 파일 단위가 아니라 **프로그램 단위**다. 규율 강제는 허구이고, 산출물은 (a)와 `diff` 0(`grep -c reference` → 0)이라 소비자 이득도 0이다.
- **(d) 기각 근거(실측)**: tsup 8.5.1은 `DtsConfig.compilerOptions`를 **실제로 지원한다**(`dist/rollup.js`의 `parseCompilerOptions` → `getCompilerOptions()`가 `{...tsconfig options, ...override}`로 병합). 빌드도 성공한다. 그러나 산출물이 (a)와 동일하면서 `tsc --noEmit`는 여전히 22건 실패해 `pnpm typecheck`용 tsconfig를 추가로 분리해야 한다 → 이득 0, 노브 +1.
- **(c) 기각 근거(실측)**: 원안은 **진짜 브라우저 값을 받지 못한다**. `Document`→`DocumentLike` 대입이 `body.appendChild`의 `<T extends Node>(node:T)=>T` 반공변 충돌로 실패하고, `URL.createObjectURL(obj: Blob|MediaSource)`와 `fetch`의 `RequestInit`도 마찬가지다(총 6건). 반공변 3지점을 `any`로 완화하면 통과하지만 — shim 49줄, `web.d.ts` 795B→2867B, `createObjectURL(blob: any)`처럼 **(c)가 지키려던 지점 자체를 `any`로 열게 되며**, `lib:["ES2022"]`에는 `globalThis.document`/`globalThis.fetch`가 없어 `webCanvasVideoPoster()`·`createFetchBinaryTransport()`의 **무인자 호출이 소멸**한다(§5.6 파괴적 변경).

#### (a)의 급소와 그 해소 — DOM 각인

(a)/(b)/(d)의 방출 d.ts는 **동일**하며, DOM lib 없는 소비자에서 **조용히 깨진다**. 생성된 d.ts를 소비자 tsconfig로 실제 컴파일한 결과:

| 소비자 `lib` | `skipLibCheck` | 결과 |
|---|---|---|
| `["DOM","ESNext"]` (= memorylog2 `expo/tsconfig.base`) | true | CLEAN |
| `["ES2022"]` | **true** (gj-kit `tsconfig.base.json` 기본값) | `Cannot find name 'Document'`가 **억제되고 파라미터가 `any`로 붕괴**. `createBrowserSaveTarget({ document: 'nope', fetch: 'nope' })`가 **통과**한다(`@ts-expect-error`가 미사용이 되어 TS2578로 검출) |
| `["ES2022"]` | false | `dist/web.d.ts` 내부에서 TS2304 4건 — **소비자가 고칠 방법이 없다** |

§6의 원칙("조용히 깨지는 것에만 강제를 건다")에 정면으로 걸리므로, **`./web`의 `.d.ts`에 DOM lib 요구를 각인**해 해소한다. rollup-plugin-dts가 소스의 삼중슬래시 지시자를 제거하므로 **빌드 후처리가 유일한 경로**다.

```js
// scripts/stamp-dom-reference.mjs
// dist/web.d.ts · web.d.cts 상단에만 DOM lib 요구를 각인한다.
// - rollup-plugin-dts가 소스의 /// <reference>를 제거하므로 후처리가 유일 경로.
// - core/index/picker/device/save/video/testing 은 각인하지 않는다(무DOM 소비자 오염 금지).
import { readFileSync, writeFileSync } from 'node:fs';
const REF = '/// <reference lib="dom" />\n';
for (const f of ['dist/web.d.ts', 'dist/web.d.cts']) {
  const s = readFileSync(f, 'utf8');          // 파일이 없으면 ENOENT로 즉시 실패한다(의도).
  if (!s.startsWith(REF)) writeFileSync(f, REF + s);
}
```

```jsonc
// package.json — tsup의 onSuccess는 쓰지 않는다.
// 실측: onSuccess는 JS 빌드 직후·DTS 빌드 완료 **전**에 실행되어 ENOENT로 실패한다.
"scripts": { "build": "tsup && node scripts/stamp-dom-reference.mjs" }
```

각인 후 **7개 소비자 픽스처 전부 CLEAN**이다 — 무DOM+`skipLibCheck` true/false 양쪽, DOM 있는 소비자, 무인자·실값 호출, CJS/`Node16`(`require` 조건 → `web.d.cts` 첫 줄이 각인), 그리고 **`./core`만 import한 무DOM 소비자에게 `document.title`은 여전히 에러**(=DOM 전역 미오염). 오용(`document: 'nope'`)도 무DOM 소비자에서 정상 검출된다.

#### 확정 설정

```ts
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  // 엔트리 10 = 공개 서브패스 8 + 조건 포크 2. 설계 문서 §2.1
  entry: [
    'src/core.ts', 'src/index.ts', 'src/picker.ts',
    'src/device.ts', 'src/device.web.ts',
    'src/save.ts',   'src/save.web.ts',
    'src/video.ts',  'src/web.ts', 'src/testing.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true, sourcemap: true, clean: true,
  target: 'es2022',
  treeshake: true,
  platform: 'neutral',
  // §0.4 기각 10 — 엔트리 자기완결. 코드 스플리팅이 만드는 확장자 포함 chunk import는
  // 플랫폼 포크를 무력화하고(§8.2 케이스 B) dist-peer-graph 검사도 복잡하게 만든다.
  // 대가(코어 복제)는 MediaError의 Symbol.for 태그가 상쇄한다(§5.2).
  splitting: false,
  external: [/^expo-/, 'react-native'],
  // dts.compilerOptions는 쓰지 않는다 — tsup 8.5.1이 지원은 하나(위 (d) 실측)
  // 산출물이 (a)와 동일하면서 typecheck용 tsconfig만 하나 더 늘어난다.
});
```

```jsonc
// tsconfig.json — 빌드·dts 정본. tsup이 읽는 유일한 tsconfig다.
{
  "extends": "../tsconfig.base.json",
  // DOM은 여기서만 켠다. 코어의 무DOM 규율은 lib이 아니라 아래 가드 2종이 강제한다.
  "compilerOptions": { "lib": ["ES2022", "DOM"] },
  "include": ["src"]
}
```

```jsonc
// tsconfig.core.json — 소스 가드. DOM이 src/web 밖으로 새는 즉시 실패한다.
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022"], "noEmit": true },
  "include": ["src"],
  "exclude": ["src/web", "src/web.ts", "src/save/web.ts", "src/save.web.ts"]
}
```

- **`tsconfig.web.json`은 삭제한다** — tsup이 읽지 않아 아무 일도 하지 않았다.
- `tsconfig.tests.json`(DOM 포함)은 expo-ui 선례대로 유지.
- `"typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.core.json && tsc --noEmit -p tsconfig.tests.json"`
- DOM 없이 웹 바이너리를 다루는 수단은 여전히 §3.2의 `BinarySource` 구조적 최소 타입이다 — DOM lib을 켠 것은 **`src/web/**` 구현이 컴파일되게 하기 위해서**이지, 코어가 DOM을 써도 된다는 뜻이 아니다.

#### 무DOM 가드 2종 (§10.3 가드 테스트에 편입)

1. **소스 가드** — `tsc --noEmit -p tsconfig.core.json`. 실측: `src/core.ts`에 `document.title`/`Document` 파라미터를 주입하면 TS2584/TS2304로 잡는다. 같은 유출을 **tsup은 전혀 잡지 못하고 `dist/core.d.ts`에 `declare function leakSig(d: Document): number;`를 그대로 방출한다**.
2. **dist 가드** — `lib:["ES2022"]` + **`skipLibCheck:false`** 픽스처가 무DOM 엔트리의 `.d.ts`를 실제로 컴파일한다. `skipLibCheck:true`(gj-kit·memorylog2 양쪽의 기본값)에서는 d.ts 내부 TS2304가 억제되어 붕괴가 보이지 않으므로, 가드에서는 반드시 `false`여야 한다.

```jsonc
// tests/guards/tsconfig.nodom.json
{
  "compilerOptions": {
    "strict": true, "noEmit": true,
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022"], "types": [],
    "skipLibCheck": false,          // ← 핵심. true면 d.ts 내부 TS2304가 억제되어 가드가 무력해진다.
    "baseUrl": ".",
    "paths": { "@gj-kit/expo-media/*": ["../../dist/*"] }
  },
  "include": ["nodom-entries.ts"]
}
```

```ts
// tests/guards/nodom-entries.ts — 공개 서브패스 8 중 ./web을 제외한 7개
export type * as Core    from '@gj-kit/expo-media/core.js';
export type * as Index   from '@gj-kit/expo-media/index.js';
export type * as Picker  from '@gj-kit/expo-media/picker.js';
export type * as Device  from '@gj-kit/expo-media/device.js';
export type * as Save    from '@gj-kit/expo-media/save.js';
export type * as Video   from '@gj-kit/expo-media/video.js';
export type * as Testing from '@gj-kit/expo-media/testing.js';
```

**파생 규칙 — DOM 타입이 공개 시그니처에 나타나도 되는 엔트리는 `./web` 하나뿐이다.** §8.4-③(양 포크가 같은 `.d.ts`를 가리킨다)에 의해 `./save`의 비네이티브 포크는 `Document`·`typeof fetch`를 시그니처에 노출할 수 없다 — 비네이티브 포크 구현은 내부에서만 DOM을 쓰고 공개 표면은 `expoDeviceSave(input?: { isExpoGo?: boolean })` / `MediaLibrarySaveAdapter`로 네이티브 포크와 동일해야 한다. 각인 대상은 "dist 가드가 실패하는 엔트리"로 **기계적으로 결정**되며, `./web` 외의 엔트리가 가드에 걸리면 **각인이 아니라 소스를 고친다**.

**실측 재현**: `scratchpad/domcheck/` — `z`(현행안) · `a`/`b`/`c`/`c2`/`d`(후보) · `a2`(확정안) 7개 tsup 프로젝트와 `consumers2/`의 소비자 픽스처 16종. tsup 8.5.1 / typescript 5.9.3.

---

## 3. 어댑터 seam

### 3.1 조립 방식 — 팩토리별 필수 인자 (기각 1·2의 대체안)

두 설계안의 조립 방식을 **둘 다 기각**했으므로 대체안을 여기서 확정한다.

| 방식 | 문제 |
|---|---|
| GPF: 하나의 `MediaAdapters` 완전 객체 필수 | 안 쓰는 메서드를 throw 스텁으로 채워야 이식된다 |
| VF: 전 필드 옵셔널 + capability 교차 타입 | 타입 애노테이션 한 번에 전 기능 소멸(V3), staging 누락 검사 불가 |

**확정: 능력별 팩토리가 자기가 실제로 쓰는 의존만 필수 인자로 받는다. 조건부 타입 0.**

```ts
// "./core" — 능력 = 팩토리. 없는 능력은 "그 팩토리를 호출하지 않았으므로 변수가 없다".
const uploads = createLocalUploads({ api, limits, platform, files, transport, hasher });
const device  = createDeviceLibrary({ library, files, staging, platform });  // staging 필수
const devUps  = createDeviceUploads({ uploads, device });
```

이 형태가 세 가지를 동시에 만족한다:

1. **스텁 0** — 웹 관리자 도구는 `createBinaryUploads`만 호출한다. `FileSystemAdapter`도 `PickerAdapter`도 존재를 모른다.
2. **애노테이션 붕괴 불가** — 반환 타입이 팩토리마다 고정된 구체 인터페이스다. 인자를 어떻게 애노테이트하든 `createDeviceUploads(...)`는 `DeviceUploads`를 반환한다. V3의 붕괴가 **표현 불가능**하다.
3. **하드닝 7 구조 봉쇄** — `staging`이 `createDeviceLibrary`의 **필수 인자**다. 스테이징 사본을 만드는 주체가 지우는 주체를 반드시 갖는다. VF의 capability 게이트가 놓쳤던 구멍이다.

에러 메시지도 낫다. 교차 타입의 `Property 'uploadDeviceAssets' does not exist on type 'UploaderCore<T> & BinaryUploads<T>'` 대신, 소비자는 애초에 `devUps` 변수를 만들지 않았으므로 `Cannot find name 'devUps'`를 본다 — 원인이 곧 메시지다.

**골든패스의 뚜껑 닫기.** `"."`의 `createMediaKit`은 expo 기본 어댑터를 이미 갖고 시작하며, 선택 능력은 **구체 킷을 반환하는 `with*` 메서드**로 부착한다. `with*`는 자기 자신을 넓히지 않고 새 객체를 반환하므로 여전히 조건부 타입이 없다.

```ts
import { createMediaKit, koMediaStrings } from '@gj-kit/expo-media';
import { expoPicker } from '@gj-kit/expo-media/picker';

const media  = createMediaKit({ api, limits: { image: { maxBytes: 15 * 1024 * 1024 } }, strings: koMediaStrings });
const picker = media.withPicker(expoPicker);          // PickerFlows
const results = await picker.pickAndUpload({ max: 10 });
```

기기 라이브러리·저장·포스터가 필요해지는 시점에만 뚜껑이 더 열린다:

```ts
import { expoDeviceLibrary } from '@gj-kit/expo-media/device';
import { expoDeviceSave }    from '@gj-kit/expo-media/save';
import { expoVideoPoster }   from '@gj-kit/expo-media/video';

const device = media.withDeviceLibrary(expoDeviceLibrary);   // DeviceKit — staging·files는 media가 공급
const saver  = media.withDeviceSave(expoDeviceSave({ isExpoGo }));
```

### 3.2 optional peer 격리 증명

정적 그래프 하나로 보장한다. `"."`의 모듈 그래프는 `expo-media-library`를 **문자열로도 포함하지 않는다**. Metro는 도달 가능한 그래프만 번들하므로, 소비자가 `"./device"`를 import하지 않으면 그 패키지는 해석 시도조차 되지 않는다.

- **정적 근거**: 각 expo 어댑터는 자기 엔트리 파일에서만 peer를 정적 import하고, `external: [/^expo-/, 'react-native']`가 이를 bare 지정자로 dist에 남긴다. `splitting: false`이므로 그 import는 다른 어떤 dist 파일에도 복제되지 않는다.
- **CI 근거**: `dist-peer-graph` 가드가 엔트리별 외부 specifier 집합을 **ESM·CJS 양쪽**에서 추출해 §2.2 표와 대조한다. `index.js`나 `index.cjs`에 `expo-media-library`가 등장하면 즉시 실패 — "optional peer로 강등"이 문서 주장이 아니라 CI 단언이 된다(V4로 기법 검증 완료).
- **런타임 마법 부재**: 지연 `require()`·동적 `import()`를 쓰지 않는다. 미설치 + import 시 **번들 resolve 실패로 조기 발각**된다(expo-ui §2 `./insets` 규칙 계승).

### 3.3 어댑터 계약 (전체 TypeScript 시그니처)

```ts
// ═══════════════════════════════════════════════════════════════════════════
// "./core" — src/core/adapters.ts
// 규약: 공개 옵셔널 필드는 전부 `?: T | undefined` (EOP 소비자 보호 — §1-7)
//       모든 입력 객체는 readonly. 어댑터는 순수 위임 — 정책은 코어가 갖는다.
// ═══════════════════════════════════════════════════════════════════════════

export type MediaKind = 'image' | 'video';
export type MediaPlatform = 'ios' | 'android' | 'web';

/**
 * DOM lib 없이 Blob/File을 받기 위한 구조적 최소 타입.
 * 브라우저 Blob·RN Blob·Node Blob이 전부 구조적으로 만족하며,
 * vitest에서 plain object로 전 경로를 도는 것을 가능하게 한다(§10.1).
 */
export interface BinarySource {
  readonly size: number;
  readonly type?: string | undefined;
  arrayBuffer(): Promise<ArrayBuffer>;
}
/** 웹 File의 구조적 최소치 — DOM lib 없이 isSupportedMediaFile을 쓰기 위해. */
export interface NamedBinarySource extends BinarySource {
  readonly name: string;
}

export type ChunkRange = { readonly position: number; readonly length: number };

export type MediaPermission = {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
  /** iOS "선택된 사진" — 일부만 보인다. */
  readonly limited: boolean;
};

// ── ① 플랫폼 ────────────────────────────────────────────────────────────────
/** core에서 react-native import를 제거하는 유일한 이유. 필드 2개뿐인 것이 정상이다. */
export interface PlatformAdapter {
  readonly os: MediaPlatform;
  /** __DEV__ 상당. 디버그 로거 게이트(§7 하드닝 8). expo 기본값: `__DEV__ && NODE_ENV !== 'test'`. */
  readonly isDev: boolean;
}

// ── ② 로컬 파일 I/O ─────────────────────────────────────────────────────────
/**
 * 전신의 `{exists, isDirectory, size}`를 판별 유니언으로 교체.
 * `info.exists && !info.isDirectory ? info.size : 0` 패턴 5중복이 좁히기 한 번으로 소멸(§7 하드닝 3).
 */
export type FileStat =
  | { readonly kind: 'file'; readonly sizeBytes: number }
  | { readonly kind: 'directory' }
  | { readonly kind: 'missing' };

export interface FileSystemAdapter {
  /** 앱 소유 캐시 디렉토리 URI(끝에 '/'). 없으면 documentDirectory, 그것도 없으면 null. */
  cacheDirectory(): string | null;
  /** throw 금지 — 코어가 후보 URI를 순회한다. 없거나 디렉토리면 그 kind를 반환. */
  stat(uri: string): Promise<FileStat>;
  copy(input: { readonly from: string; readonly to: string }): Promise<void>;
  /** 멱등 삭제. 실패해도 throw 금지 — 스테이징 누수는 디스크 비용일 뿐이다. */
  remove(uri: string): Promise<void>;
  /**
   * [position, position+length) 구간을 base64로 반환.
   * ⚠ 코어는 length를 **항상 3의 배수**로 준다(§7 하드닝 9). 어댑터가 재정렬하면 해시가 조용히 틀린다.
   */
  readBase64(uri: string, range: ChunkRange): Promise<string>;
}

/** 저장 플로우 전용 — 업로드만 하는 소비자는 구현할 필요가 없다. */
export interface FileDownloadAdapter {
  download(input: { readonly url: string; readonly to: string }): Promise<{
    readonly uri: string;
    readonly status: number;
  }>;
}

// ── ③ 전송 ──────────────────────────────────────────────────────────────────
export type PutRequest = {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
};

/**
 * ⚠ **계약: 파일 바이트를 JS 힙으로 읽지 말 것.** 네이티브 스트리밍 업로드여야 한다.
 * 근거: `FileSystem.uploadAsync`(레거시 URLSession 브리지)가 iOS 26에서 파일 기반 업로드를
 * 시작하는 중 프로세스를 종료시킨다 — promise가 reject될 기회조차 없다(§7 하드닝 1).
 * expo 기본 어댑터는 `new File(uri).upload(url, { sessionType:'foreground',
 * uploadType: BINARY_CONTENT })`를 쓴다. `hardening-guard`가 `uploadAsync` 재등장을 정적 차단한다.
 */
export interface LocalFileTransport {
  putLocalFile(input: PutRequest & { readonly uri: string }): Promise<{ readonly status: number }>;
}

/** 웹 Blob PUT · 포스터 PUT. fetch 기반 기본 구현은 "./web"이 제공. */
export interface BinaryTransport {
  putBinary(input: PutRequest & { readonly body: BinarySource }): Promise<{ readonly status: number }>;
}

// ── ④ 해시 ──────────────────────────────────────────────────────────────────
/**
 * 기본 구현은 core 내장 순수 TS 증분 SHA-256(§9) — js-sha256 제거, 런타임 의존성 0.
 * 네이티브 가속이 필요한 호스트만 교체한다.
 */
export interface HashAdapter {
  hashLocalFile(uri: string): Promise<string>;
  hashBinary(source: BinarySource): Promise<string>;
}

// ── ⑤ 포스터 — 입력 타입이 달라 브랜드 없이 자연 분리(§6.1-⑥) ───────────────
export interface LocalPosterAdapter {
  /** 실패는 null. 포스터 실패가 업로드를 막지 않는다(§7 추가 보존). */
  posterFromLocalFile(input: { readonly uri: string; readonly atMs: number }):
    Promise<{ readonly uri: string } | null>;
}
export interface BinaryPosterAdapter {
  posterFromBinary(input: { readonly source: BinarySource; readonly atMs: number }):
    Promise<BinarySource | null>;
}

// ── ⑤-b 바이너리 로더 (G18) ──────────────────────────────────────────────────
/**
 * uri → 바이너리. 웹 피커가 주는 `blob:`/`data:` URI를 업로드 가능한 소스로 바꾼다.
 * 기본 구현은 `"./web"`의 `createFetchBinarySourceLoader`(peer 0). 경로 전문은 §5.7.4.
 */
export interface BinarySourceLoader {
  fromUri(input: { readonly uri: string; readonly fileName: string }): Promise<NamedBinarySource>;
}

// ── ⑥ 피커 ("./picker") ─────────────────────────────────────────────────────
export type PickedAsset = {
  readonly uri: string;
  /**
   * 기기 라이브러리 원본 식별자(iOS PhotoKit localIdentifier / Android MediaStore id).
   * 없을 수 있다(웹 File 드롭, 카메라 캡처).
   * ⚠ **왜 필요한가**: 소비자의 dedup 1차 키다 —
   *   `apps/mobile/src/photos/pendingPhotos.ts:43`
   *   `pickerAssetDedupKey = \`asset:${asset.assetId ?? asset.uri}\``
   * uri 폴백만 남으면 스테이징 사본 uri가 resolve마다 재생성되므로(§7 하드닝 2) 같은 사진을
   * 두 번 선택했을 때 dedup이 통과해버린다. 전신은 `resolveDeviceAssetForUpload`가
   * `assetId: asset.id`를 채워 device 자산과 picker 자산의 동일성을 유지했다
   *   — devicePhotoLibrary.ts:364. 새 설계에서는 `toPickedAsset`이 그 역할을 한다(§5.4-④).
   */
  readonly assetId?: string | undefined;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /**
   * ⚠ 어댑터는 **원시값 그대로** 넘긴다. 네이티브는 ms, 웹은 s이며 정규화는 core가 한다
   * (§7 하드닝 4 — 정규화 지점을 하나로 고정. 어댑터가 변환하면 이중 변환이 된다).
   */
  readonly durationRaw?: number | undefined;
  readonly exif?: Readonly<Record<string, unknown>> | undefined;
  /**
   * 어댑터가 "실제로 스트리밍될 파일"을 stat해 확인한 크기. 있으면 최우선.
   * 전신의 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`를 정식 필드로 승격(§7 하드닝 3).
   */
  readonly verifiedSizeBytes?: number | undefined;
  /** ⚠ 신뢰 금지. Android 재인코딩 시 원본 크기를 보고한다 — 최후 폴백(§7 하드닝 3). */
  readonly reportedSizeBytes?: number | undefined;
};

export interface PickerAdapter {
  requestLibraryPermission(kinds: readonly MediaKind[]): Promise<MediaPermission>;
  requestCameraPermission(): Promise<MediaPermission>;
  /**
   * ⚠ iOS 원본 fast path 고정 조합(§7 추가 보존): quality 1 · exif true · allowsEditing false ·
   * preferredAssetRepresentationMode Current. 단일선택/다중선택이 달라지면 안 된다.
   */
  pickFromLibrary(input: { readonly kinds: readonly MediaKind[]; readonly max: number }):
    Promise<readonly PickedAsset[]>;
  capture(input: { readonly kind: MediaKind }): Promise<readonly PickedAsset[]>;
}

// ── ⑦ 기기 라이브러리 ("./device") ──────────────────────────────────────────
export type DeviceAssetRef = { readonly id: string; readonly filename: string };
export type DeviceAsset = DeviceAssetRef & {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly mediaType: MediaKind;
  readonly creationTime?: number | undefined;
};
export type DeviceAssetPage = {
  readonly assets: readonly DeviceAsset[];
  /**
   * §1-7 규약(`?: T | undefined`)을 따른다 — 초안은 필수-undefined였다(G20-14).
   * 필수로 두면 3자 어댑터 구현자가 값 없는 마지막 페이지에서도 키를 명시해야 한다.
   */
  readonly endCursor?: string | undefined;
  readonly hasNextPage: boolean;
  readonly totalCount: number;
};
export type DeviceAlbum = { readonly id: string; readonly title: string; readonly count: number };
export type DeviceAssetInfo = {
  /** 앱 컨테이너 밖(iOS Photos 컨테이너)일 수 있다 — core가 캐시로 실체화한다(§7 하드닝 2). */
  readonly localUri?: string | undefined;
  readonly uri?: string | undefined;
  readonly exif?: Readonly<Record<string, unknown>> | undefined;
  /** true면 원본이 iCloud에만 있다. core 기본 정책은 여기서 중단(§7 하드닝 6). */
  readonly isNetworkAsset: boolean;
};

export interface DeviceLibraryAdapter {
  /**
   * ⚠ Android 13+에서 granular 목록(['photo','video'])을 **반드시** 지정할 것. 생략하면
   * 매니페스트의 모든 권한이 대상이 되어, 거부된 READ_MEDIA_AUDIO가 유효한 사진·동영상 허용을
   * 거부처럼 보이게 만든다(선택한 사진 모드 포함) — §7 하드닝 5.
   *
   * ⚠ **순수 위임이다.** "언제 요청할 것인가"(현재 권한 조회 → `!granted && canAskAgain`일 때만
   * 요청)는 어댑터가 아니라 core가 소유한다 — `DeviceLibrary.ensurePermission()`(§5.4-④(c), G17).
   * 어댑터의 몫은 네이티브 응답을 `MediaPermission`으로 매핑하는 것까지다
   * (`accessPrivileges === 'limited'` → `limited: true` 포함).
   */
  requestPermission(): Promise<MediaPermission>;
  getPermission(): Promise<MediaPermission>;
  /**
   * ⚠ **정렬 계약: creationTime 내림차순(최신 우선).** 전신 `devicePhotoLibrary.ts:220`
   *   `sortBy: [[SortBy.creationTime, false]]`.
   * core는 재정렬하지 않는다 — 페이지 단위 재정렬은 전역 순서를 보장하지 못하면서
   * `endCursor`와 표시 순서를 어긋나게 만든다(§5.4-④(d)). 이 계약을 어기면 그리드 순서와
   * 무한스크롤 커서가 함께 깨지며, **타입도 가드도 그것을 잡지 못한다**.
   * ⚠ 자산별 getAssetInfo 호출 금지 — 60개 원본 직렬 해석은 페이지당 ~20초다.
   * 그리드는 raw uri(iOS ph://)를 그대로 그린다(§7 추가 보존).
   */
  listAssets(input: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize: number;
    readonly kinds: readonly MediaKind[];
  }): Promise<DeviceAssetPage>;
  /**
   * 원본 목록을 **그대로** 반환한다 — 필터·정렬 금지.
   * `count > 0` 필터와 count 내림차순 정렬은 core가 수행하므로
   * (`devicePhotoLibrary.ts:243-250`의 정책을 core로 승격) 어댑터가 중복 수행할 이유가 없다.
   */
  listAlbums(): Promise<readonly DeviceAlbum[]>;
  /**
   * ⚠ `downloadFromNetwork`는 **필수 인자**다(§6.1-④). 옵셔널로 두면 어댑터 구현자가
   * 플랫폼 기본값(Expo legacy API는 true)을 흘려 iCloud 원본을 무단 다운로드한다.
   * 타임아웃은 core가 건다 — 어댑터는 순수 위임.
   */
  getAssetInfo(assetId: string, input: { readonly downloadFromNetwork: boolean }):
    Promise<DeviceAssetInfo>;
}

// ── ⑧ 기기 저장 ("./save") — 판별 유니언(§6.1-⑦) ────────────────────────────
export interface MediaLibrarySaveAdapter {
  requestWritePermission(): Promise<MediaPermission>;
  saveToLibrary(uri: string): Promise<void>;
  /**
   * Android Expo Go는 사진 권한 요청 자체가 불가 — 그 판정을 어댑터가 정적으로 노출한다.
   * expo-constants 의존을 라이브러리에서 완전히 제거하는 지점(§0.2).
   */
  readonly skipPermissionRequest: boolean;
}
export interface BrowserSaveAdapter {
  /** DOM 접근을 어댑터 안에 가둔다. document/fetch는 "./web"에서 **필수 주입**(§6.1-⑬). */
  saveByDownload(input: { readonly url: string; readonly fileName: string }): Promise<void>;
}
export type SaveTarget =
  | { readonly kind: 'media-library';
      readonly files: FileSystemAdapter & FileDownloadAdapter;
      readonly library: MediaLibrarySaveAdapter }
  | { readonly kind: 'browser-download'; readonly browser: BrowserSaveAdapter };
```

---

## 4. 문구 주입 (`MediaStrings`)

전신의 한국어 하드코딩은 **리터럴 24개**(V6 실측: uploader 17 · devicePhotoLibrary 4 · saveImages 2 · hashFile 1). 그중 크기 초과 문구만 값이 섞이므로 함수, 나머지는 상수 — 18키였다. `platformUnsupported`·`deviceLibraryFailed`·`pickerFailed`를 전용 분류 문구로 추가해 현재 공개 계약은 **22키**다. expo-ui `UiStrings + enStrings/koStrings` 패턴을 그대로 계승한다.

```ts
// "./core" — src/core/strings.ts
export interface MediaStrings {
  // 기기 라이브러리 (devicePhotoLibrary.ts 4)
  readonly deviceInfoTimeout: string;          // 사진 원본 정보 조회 타임아웃(15s)
  readonly iCloudDownloadTimeout: string;      // iCloud 원본 다운로드 타임아웃(60s)
  readonly iCloudOnly: string;                 // 원본이 iCloud에만 있음
  readonly fileNotFound: string;               // 로컬 파일 없음/판독 불가 (hashFile 1 공유)
  readonly deviceLibraryFailed: string;        // 기기 라이브러리 adapter/OS 실패, 원문 비공개
  readonly pickerFailed: string;               // 피커·웹 loader 실패, 원문 비공개
  // 업로드 검증 (uploader.ts)
  readonly unsupportedFileType: string;
  readonly noMediaFiles: string;               // uploader.ts:625
  readonly pickedPhotoInvalid: string;         // uploader.ts:678
  readonly pickedMediaInvalid: string;         // uploader.ts:717
  readonly imageSizeUnknown: string;
  readonly videoSizeUnknown: string;
  // 업로드 실패
  readonly imageUploadFailed: string;
  readonly videoUploadFailed: string;
  readonly posterUploadFailed: string;         // uploader.ts:237, 295
  // 권한 (uploader.ts:918/937/973/998 — 전신은 bare Error였다, §5.2)
  readonly photoPermissionRequired: string;
  readonly mediaPermissionRequired: string;
  readonly cameraPermissionRequired: string;
  // 저장 (saveImages.ts 2)
  readonly savePermissionDenied: string;
  readonly saveDownloadFailed: string;
  /**
   * [구현 시 신설] `platform-unsupported`(§5.2 신설 6종의 6번째) 전용 문구.
   * 전신에는 대응 문구가 없다 — 전신 web 포크는 영어 bare Error를 던졌다
   * (`devicePhotoLibrary.web.ts:29`). 이 키가 없으면 4개 throw 지점이
   * `pickedMediaInvalid`·`fileNotFound`·`saveDownloadFailed`를 돌려 쓰게 되고,
   * 그중 "파일을 찾을 수 없습니다"는 **사용자를 파일 탐색으로 오도**한다.
   */
  readonly platformUnsupported: string;
  /** 크기 초과 — 단위 표기가 언어마다 다르므로 함수. */
  readonly fileTooLarge: (input: { readonly maxBytes: number; readonly kind: MediaKind }) => string;
}

export const enMediaStrings: MediaStrings;
/** 전신 문구를 원문 그대로 이식 — memorylog2 이관 시 UI 회귀 0(§11). */
export const koMediaStrings: MediaStrings;
```

- **우선순위**: 개별 옵션 > 팩토리 `strings` > 내장 `enMediaStrings`.
- **`Partial<MediaStrings>` 불가** (expo-ui §4.1과 동일 근거, §6.1-⑧). 라이브러리가 키를 추가하면 손조립 소비자에게 컴파일 에러로 표면화된다. 커스텀은 `{ ...koMediaStrings, fileNotFound: '…' }` 스프레드가 정답.
- **`string-guard` 테스트**(§10.3): `src/core/**`·`src/expo/**`·`src/picker/**`·`src/device/**`·`src/save/**`·`src/video/**`에서 `new MediaError(`의 두 번째 인자가 `strings.` 멤버 접근이 아니면 실패. 리터럴이 다시 새는 경로를 정적으로 봉쇄한다.

---

## 5. 공개 API 전체 시그니처

### 5.1 백엔드 계약 · 결과 타입

```ts
// "./core" — src/core/types.ts
/**
 * ⚠ **8종 고정 — 전신 `MEDIA_FILE_EXTENSIONS`(mediaTypes.ts:7-16)와 정확히 동일하다.**
 * 초안이 신설했던 `image/gif`는 **제거**했다(G15 확정, V9-e 실측):
 *   ① 전신 확장자 테이블에 gif 항목이 없다 → §7의 "전신 168줄 그대로" 문구가 참이 된다.
 *   ② memorylog2 `@memorylog/shared`의 `SUPPORTED_MEDIA_CONTENT_TYPES`에도 없고, 서버 zod가
 *      `.regex(new RegExp('^(?:' + SUPPORTED_MEDIA_CONTENT_TYPES.join('|') + ')$'))`
 *      (`shared/src/index.ts:459`)로 검증한다 → gif를 통과시키면 **presign 단계에서 서버가 거절**하는
 *      클라이언트/서버 불일치가 생긴다. 클라이언트가 서버보다 넓은 유니언을 갖는 것은 순손실이다.
 * 형식을 넓히려면 서버 유니언을 먼저 넓히고 minor로 추가한다(유니언 확장은 소비자에게 비파괴).
 */
export type MediaContentType =
  | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif'
  | 'video/mp4' | 'video/quicktime' | 'video/webm';

export type MediaUploadIntent = {
  readonly uploadUrl: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
  readonly objectName: string;
};
export type MediaUploadIntentRequest = {
  readonly fileName: string;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
};

/** 구 posterObjectName / posterSizeBytes 2필드를 쌍 객체로 통합 — 반쪽 메타 등록 경로 제거(§6.1-②). */
export type UploadedPoster = { readonly objectName: string; readonly sizeBytes: number };

export type MediaUploadCompletion<TCollectionId extends string = string> = {
  readonly fileName: string;
  readonly contentType: MediaContentType;
  readonly sizeBytes: number;
  readonly objectName: string;
  readonly contentHash?: string | undefined;
  /** 불투명 그룹 id — 킷은 해석하지 않고 전달만 한다(§6.2 기각). 빈 문자열은 런타임 차단(§6.1-⑪). */
  readonly collectionId?: TCollectionId | undefined;
  readonly photo?: MediaMetadata | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly poster?: UploadedPoster | undefined;
};

/** duplicate 필수 — 중복 취소 시 사용자의 예전 사진을 지우는 사고 차단(§6.1-⑩). */
export type UploadResult<TAsset> = {
  readonly asset: TAsset;
  readonly duplicate: boolean;
};

export interface MediaUploadApi<TAsset, TCollectionId extends string = string> {
  createUploadIntent(input: MediaUploadIntentRequest): Promise<MediaUploadIntent>;
  completeUpload(input: MediaUploadCompletion<TCollectionId>): Promise<UploadResult<TAsset>>;
}

export type MediaUploadLimit = { readonly maxBytes: number; readonly message?: string | undefined };
export type MediaUploadLimits = {
  readonly image?: MediaUploadLimit | undefined;
  readonly video?: MediaUploadLimit | undefined;
};

export type MediaDebugOptions = {
  readonly enabled: boolean;
  readonly tag?: string | undefined;
  readonly context?: (() => Record<string, unknown>) | undefined;
};
```

#### 텔레메트리 — 스팬 계약 (G1 확정: `event()` 축소를 철회하고 전신 계약을 복원한다)

초안의 `MediaTelemetry.event(name, payload)` 단일 메서드는 전신 계약의 축소였고, 그 축소는 §11.3의 "telemetry 브리지 유지"를 **실행 불가능**하게 만든다. 근거 3중:

| 근거 | 위치 | 내용 |
|---|---|---|
| 전신 공개 계약 | `packages/photo-kit/src/types.ts:68-101` | `PhotoKitTelemetry{track,begin}` + `PhotoKitActivity{succeed,fail,cancel}` + `NOOP_TELEMETRY` |
| 실제 호출 | `uploader.ts:222,239,242,254,269,297,300,340,473,534` · `saveImages.ts:277` | `begin(...)` 4사이트 + `track(...)` 4사이트. `cancel({extra:{reason:'empty-poster'}})`(269)는 성공도 실패도 아닌 **3번째 종료 상태** |
| 소비자 브리지 | `apps/mobile/src/photos/kit.ts:25-34` | `track → trackClientActivity` · `begin → beginClientActivity`. 리포터(`src/telemetry/clientActivityReporter.ts:52-117`)가 `operationId` 발급 → `outcome:'started'` 선전송 → `succeed/fail/cancel`에서 `durationMs = Date.now()-startedAt`·`errorName`·`errorMessage` 확정 |

`event()` 하나로는 (i) 시작/종료 쌍, (ii) 소요시간, (iii) `cancelled` outcome, (iv) 실패 시 에러 객체 전달이 **전부 표현 불가**하므로 memorylog2의 `source:"media"` 활동로그 스트림이 통째로 사라진다.

```ts
// "./core" — src/core/telemetry.ts

/** 안정적 dotted operation 이름. 값 변경 = 소비자 대시보드 파손 → §7.2의 인라인 리터럴 unit이 고정한다. */
export const MEDIA_OPERATIONS = [
  'media.upload.native',        // uploader.ts:341
  'media.upload.web-image',     // uploader.ts:474
  'media.upload.web-video',     // uploader.ts:535
  'media.upload.poster.native', // uploader.ts:254
  'media.upload.poster.web',    // uploader.ts:222
  'media.save-to-device',       // saveImages.ts:278
] as const;
export type MediaOperation = (typeof MEDIA_OPERATIONS)[number];

export type MediaActivityFinish = {
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
};

/**
 * 하나의 스팬. 정확히 한 번만 종료되어야 한다(라이브러리 내부 규율 — 소비자 검증 대상 아님).
 * `cancel`은 "실패가 아닌 중단"이다: 빈 포스터(uploader.ts:268-271)처럼 사용자에게
 * 오류로 보고하면 안 되지만 성공으로 세어서도 안 되는 종료.
 */
export interface MediaActivity {
  succeed(finish?: MediaActivityFinish | undefined): void;
  fail(error: unknown, finish?: MediaActivityFinish | undefined): void;
  cancel(finish?: MediaActivityFinish | undefined): void;
}

export interface MediaTelemetry {
  /** run()을 감싸 성공/예외를 자동 보고하고 결과를 그대로 통과시킨다. 예외는 **반드시 재throw**. */
  track<T>(
    operation: MediaOperation,
    extra: Readonly<Record<string, unknown>>,
    run: () => Promise<T>,
  ): Promise<T>;
  begin(
    operation: MediaOperation,
    extra?: Readonly<Record<string, unknown>> | undefined,
  ): MediaActivity;
}

/** 기본값. `track`은 run()을 그대로 실행하고 `begin`은 no-op 활동을 준다(types.ts:88-101 계승). */
export const noopMediaTelemetry: MediaTelemetry;
```

**`operation`을 `MediaOperation` 리터럴 유니언으로 좁힌다(확정).** 라이브러리가 방출하는 이름은 6종으로 닫혀 있고 그 목록이 §7.2의 보존 계약이므로, 오타를 컴파일 에러로 만드는 편이 낫다. 호스트가 **자기** operation을 보고하는 것은 이 인터페이스의 일이 아니다 — memorylog2도 기기 라이브러리 진단 4종을 앱 리포터로 직접 보낸다(아래 부수 결정). 따라서 §6.2 기각표의 "`telemetry` operation 이름 리터럴 유니언 — 호스트가 자체 이름을 붙일 수 있어야 함" 항목은 **철회한다**.

**부수 결정 — `createDeviceLibrary`·`createDeviceUploads`의 `telemetry` 인자를 삭제한다.**
전신은 기기 라이브러리 경로에서 텔레메트리를 **의도적으로 방출하지 않는다**. 근거는 소비자 코드의 주석 그 자체다: `apps/mobile/src/photos/devicePhotoLibraryTelemetry.ts:38-40` — "Keep device-library diagnostics at the app boundary so the reusable photo-kit package remains independent of MemoryLog's activity-log API." 실제로 `media.device-library.permission` / `.photo-page` / `.album-list` / `.settings` 4종은 앱이 `beginClientActivity`를 직접 호출해 만든다. 라이브러리에 `telemetry` 슬롯만 있고 방출 지점이 없으면 **죽은 인자**이므로 제거한다(이름 6종을 늘리는 것은 별건 결정).

**호스트 브리지가 그대로 성립함(이관 무변경 증거)**

```ts
// memorylog2 src/photos/kit.ts — 심볼명만 바뀌고 본문은 동일하다
export const mediaTelemetry: MediaTelemetry = {
  track: (operation, extra, run) =>
    trackClientActivity({ operation, source: 'media', extra }, run),
  begin: (operation, extra) =>
    beginClientActivity({ operation, source: 'media', ...(extra ? { extra } : {}) }),
};
```

`MediaOperation`은 문자열 리터럴 유니언이므로 `ClientActivityLogInput.operation: string`에 그대로 대입된다(가변성 문제 없음).

### 5.2 에러 — 코드 16종

```ts
// "./core" — src/core/errors.ts
export const MEDIA_ERROR_CODES = [
  'device-timeout',          // 자산 정보 조회 데드라인 초과
  'device-icloud-only',      // 원본이 iCloud에만 있음
  'device-not-found',        // 로컬 파일 없음/판독 불가
  'device-library-failed',   // 기기 adapter/OS 실패 — 원문은 공개하지 않음
  'picker-failed',           // 피커·웹 loader 실패 — 원문은 공개하지 않음
  'unsupported-file-type',
  'file-too-large',
  'upload-failed',
  'save-permission-denied',
  'save-download-failed',
  // ── 신설 6종 = bare Error 대응 5 + 비네이티브 포크 1 ──
  //    (앞 5개는 V6 실측의 uploader.ts 한국어 bare Error 9사이트에 1:1 대응.
  //     'platform-unsupported'만 bare Error와 무관한 §8.5 포크 계약이다.)
  'permission-denied',       // 918/937/973/998 — 호스트가 "설정으로 이동" UI를 띄울 근거
  'poster-upload-failed',    // 237/295
  'no-media-selected',       // 625
  'picked-asset-invalid',    // 678/717
  'config-invalid',          // 어댑터·네임스페이스 오구성. 부팅 시 즉사
  'platform-unsupported',    // 비네이티브 포크(web·SSR·RSC)의 resolve/upload 경로(§8.5)
] as const;
export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode, message: string);
}

/**
 * §2.4 splitting:false로 엔트리마다 코어가 복제되므로 `instanceof`는 반드시 깨진다.
 * Symbol.for 태그로 사본 간 인식을 보장한다.
 *   ⚠ 브랜드(src/core/brand.ts)에는 같은 해법을 쓸 수 없다 — 목적이 정반대이기 때문이다
 *     (브랜드 = 위조 차단 → 전역 레지스트리 금지 / 에러 태그 = 사본 인식 → 전역 레지스트리 필수).
 *     그래서 브랜드는 아예 **런타임 값을 갖지 않는 타입 전용 phantom property**로 확정했다(§5.3).
 *     런타임 심볼로 두면 엔트리 간 검증이 이 클래스와 똑같이 깨진다.
 */
export function isMediaError(error: unknown): error is MediaError;
export function mediaErrorCode(error: unknown): MediaErrorCode | null;
/** MediaError의 message는 이미 사용자 노출 가능 문구다(strings 주입 결과). */
export function mediaErrorUserMessage(error: unknown): string | null;
/** switch의 default에서 호출하면, 코드가 추가될 때 소비자에게 컴파일 에러가 난다. */
export function assertNeverMediaError(code: never): never;
```

**코드 16종은 운영 파이프라인의 공개 실패를 분류한다.** 기존 신설 6종 중 5종은 V6에서 실측한 bare Error 9사이트에 대응하고, `platform-unsupported`는 §8.5 비네이티브 포크 계약에서 왔다. 여기에 `device-library-failed`·`picker-failed`를 더해 외부 adapter/loader가 던진 원본 오류(위조한 전역-brand `MediaError` 포함)도 안전한 문구와 code로 재구성한다. 개발자 단언과 직접 호출한 저수준 어댑터는 이 실행 파이프라인 계약 밖이다.

### 5.3 mediaTypes · metadata · hash · staging · debug (순수 모듈)

```ts
// ═══ src/core/mediaTypes.ts — 전신 168줄의 단일 테이블을 그대로 이전 ═══
// 심볼 20개 전수의 보존/개명/내부화 판정은 §5.7.2-③. 아래는 그 결과로 공개되는 13종이다.

/** 확장자↔MIME 단일 테이블. 호스트가 "지원 형식" 안내·파일 입력 `accept`를 그리려면 필요하다. */
export const MEDIA_FILE_EXTENSIONS: Readonly<Record<MediaContentType, readonly string[]>>;
export type ImageContentType = Extract<MediaContentType, `image/${string}`>;
export type VideoContentType = Extract<MediaContentType, `video/${string}`>;

export function mediaKindOf(contentType: MediaContentType): MediaKind;
export function extensionForContentType(contentType: MediaContentType): string;

/**
 * 엄격 감지 — 확신이 없으면 null. 원본 주석의 계약 보존:
 * "mislabeling would corrupt data → 엄격 감지, infer*는 OS가 종류를 이미 보장하는 곳에서만".
 */
export function detectMediaContentType(mime?: string | null, nameOrUri?: string | null): MediaContentType | null;
export function detectImageContentType(mime?: string | null, nameOrUri?: string | null): ImageContentType | null;
/** 관대 추론 — 항상 값을 준다(폴백 `image/jpeg` / 미디어는 mime 우선). */
export function inferMediaContentType(mime?: string | null, nameOrUri?: string | null): MediaContentType;
/** 전신 `inferContentType`. HEIC/HEIF 프리뷰 분기가 반환값에 의존한다(`pendingPhotos.ts:56,131,143`). */
export function inferImageContentType(mime?: string | null, nameOrUri?: string | null): ImageContentType;

/** DOM File 불필요 — `{ name, type }` 구조 타입(§7 하드닝 10). */
export function isSupportedMediaFile(file: { readonly name: string; readonly type?: string | undefined }): boolean;
export function isSupportedImageFile(file: { readonly name: string; readonly type?: string | undefined }): boolean;
export function isSupportedVideoFile(file: { readonly name: string; readonly type?: string | undefined }): boolean;

/**
 * 전신의 `defaultMediaFileName`·`inferFileName`·`inferWebFileName` **3종을 하나로 통합**(§5.7.2-③).
 * fileName이 있으면 그대로. 없으면 `${prefix}-${Date.now()}.${ext}` (전신 규칙 보존).
 * ⚠ `now`는 결정론적 테스트를 위한 주입구다 — 생략 시 `Date.now()`(전신 동작).
 */
export function mediaFileName(input: {
  readonly fileName?: string | null | undefined;
  readonly contentType: MediaContentType;
  readonly prefix?: string | undefined;      // 기본 'media' (§5.4·5.6 기본값표 13)
  readonly now?: number | undefined;
}): string;

// ═══ src/core/metadata.ts — 전신 290줄. BinarySource 기반으로 DOM lib 제거 ═══
export type GeoPoint = { readonly latitude: number; readonly longitude: number };

/**
 * ⚠ **필드명은 전신 그대로다.** 초안의 `geoPoint → location` 리네임은 **철회**했다(G5 확정).
 * 이 객체는 `api.completeUpload({ photo })`로 **호스트 백엔드에 그대로 전달**된다(uploader.ts:442).
 * 리네임의 파손은 타입에 잡히지 않는다:
 *   · 호스트 대입 지점 `kit.ts:40-44`가 `completeUpload({...input})`을 zod 파생 타입에 넘긴다.
 *   · 타깃은 `packages/shared/src/index.ts:105-108` `photoMetadataSchema = { capturedAt?, geoPoint? }`.
 *   · `{capturedAt?, location?}` → `{capturedAt?, geoPoint?}` 대입은 공통 프로퍼티 `capturedAt`이
 *     있어 **weak type 검사를 통과**하고, 변수 전달이라 초과 프로퍼티 검사도 걸리지 않는다.
 *   · 런타임에서는 서버 zod가 non-strict라 미지의 `location` 키를 **조용히 스트립**한다.
 * 즉 컴파일도 테스트도 통과하고 위치정보만 사라지는 §6.1의 전형적 "조용히 깨지는" 클래스이며,
 * 얻는 것은 명명 취향뿐이었다.
 *
 * ⚠ 초안의 `width`/`height`는 **삭제**했다. 전신 EXIF 파서는 `PixelXDimension`/`PixelYDimension`을
 * 읽지 않으므로(photoMetadata.ts 전문에 `Pixel`·`width`·`height` 0건 — grep 실측) 영구 `undefined`인
 * 죽은 필드였고, `MediaUploadCompletion`에 이미 최상위 `width`/`height`(피커 자산 치수,
 * uploader.ts:749-756)가 있어 의미도 중복이다. 이 삭제로 §7 하드닝 11의 "290줄 그대로" 문구가 참이 된다.
 */
export type MediaMetadata = {
  readonly capturedAt?: string | undefined;
  readonly geoPoint?: GeoPoint | undefined;
};

/** ⚠ 유효값이 없으면 undefined를 반환한다 — 빈 객체 금지(photoMetadata.ts:280-282 규칙 보존). */
export function mediaMetadataFromExif(exif?: Readonly<Record<string, unknown>> | null): MediaMetadata | undefined;

/**
 * 전신 `extractPhotoMetadataFromBlob(blob, fallbackExif, contentType)`(photoMetadata.ts:265-290).
 * 초안이 지웠던 인자 2개를 `options`로 **복원**한다(G6) — 4규칙이 계약이다:
 *   ① 비-JPEG 스킵 — `(contentType ?? source.type)`이 'jpeg'/'jpg'를 포함하지 않으면
 *      파싱하지 않고 fallback을 그대로 반환(271-274).
 *   ② 필드 단위 병합 — `parsed?.X ?? fallback?.X`. **객체 단위 폴백이 아니다**(278-279).
 *      capturedAt만 파싱되고 geoPoint는 fallback에서 오는 조합이 정상 결과다.
 *   ③ 파싱 예외 시 fallback 반환 — throw 금지(287-289).
 *   ④ ①②③ 이후에도 유효값이 없으면 undefined(282).
 * 웹 피커 경로가 `fallbackExif: asset.exif`를 넘긴다(uploader.ts:709 · §5.7.4). 인자를 지우면
 * JPEG 파싱 실패 시 피커가 준 EXIF가 버려져 capturedAt·위치가 유실된다.
 */
export function mediaMetadataFromJpeg(
  source: BinarySource,
  options?: {
    readonly fallbackExif?: Readonly<Record<string, unknown>> | null | undefined;
    readonly contentType?: MediaContentType | string | null | undefined;
  } | undefined,
): Promise<MediaMetadata | undefined>;

// src/core/hashFile.ts (§9)
export const HASH_CHUNK_BYTES: number;                       // 3 * 256 * 1024 — 3의 배수
/** ⚠ chunkBytes 인자를 공개하지 않는다 — 3의 배수 제약은 타입으로 표현 불가(§6.1-⑩). */
export function computeChunkRanges(size: number): readonly ChunkRange[];
export function sha256Hex(bytes: Uint8Array): string;
export function createSha256(): { update(bytes: Uint8Array): void; hex(): string };
/** FileSystemAdapter 위에 base64 윈도우 스트리밍 해시를 조립. HashAdapter를 만족한다. */
export function createFileHasher(input: { readonly files: FileSystemAdapter }): HashAdapter;

// ═══ src/core/brand.ts (비공개 — 재export 금지) ═══
/**
 * ⚠ **타입 전용 phantom property다. 런타임 값이 존재하지 않는다.**(G14 확정)
 * `declare const __brand: unique symbol`은 **타입 위치에서만** 쓰이는 선언이며
 * `verbatimModuleSyntax` 하에서 JS를 방출하지 않는다. 따라서:
 *   · 브랜드가 붙은 객체를 만들 때 어떤 프로퍼티도 실제로 쓰지 않는다.
 *   · `splitting:false`로 엔트리마다 코어가 복제돼도 **검증 대상이 없으므로 깨질 것이 없다**.
 * 런타임 `Symbol()` 각인이었다면 §5.2가 `MediaError.instanceof`에 대해 인정한 문제와
 * **동종의 파손**이 발생한다 — `./core`에서 만든 StagingCache를 `./device`가 검사할 때
 * 두 엔트리의 심볼이 서로 다르기 때문이다. 에러 태그가 `Symbol.for`(전역 레지스트리)를 쓰는 것과
 * 목적이 정반대이므로 같은 해법을 쓸 수도 없다(브랜드의 목적 = 위조 차단 = 전역 레지스트리 금지).
 * **결론: 브랜드는 위조 차단용 타입 각인일 뿐이며 런타임 검증은 하지 않는다.**
 *
 * 비공개인데 공개 인터페이스가 extends해도 선언 방출은 안전하다 — rollup-plugin-dts가
 * `Brand<'StagingCache'>`를 인라인해 `dist/core.d.ts` 안으로 접어 넣으므로
 * "has or is using private name"이 발생할 표면이 없다.
 */
// `__brand`는 export하지 않는다(위조 차단). `Brand`는 export한다 — staging.ts 등 같은 패키지
// 내부 모듈이 import해야 하기 때문이다. "재export 금지"는 **배럴 기준**이며, 어떤 엔트리
// (`core.ts`/`index.ts`/…)도 이 심볼을 다시 내보내지 않는다는 뜻이다.
// 실측: `export type Brand` + 비export `declare const __brand` 조합이면 tsc가 brand.d.ts에
// `declare const __brand`를 방출해 다중 파일 declaration emit이 TS4023 없이 통과한다.
declare const __brand: unique symbol;
export type Brand<TName extends string> = { readonly [__brand]: TName };

// src/core/staging.ts — 프리픽스 주입 × 삭제 안전성 강화(제약 5)
export interface StagingCache extends Brand<'StagingCache'> {
  readonly prefix: string;                        // `${namespace}-upload-`
  /**
   * cleanup의 유일한 판정 근거. 전신 `uri.includes(PREFIX)`(deviceUploadCache.ts:29) 대비 3조건으로 강화:
   *   (i) 캐시 디렉토리로 시작 (ii) 파일명이 prefix로 **시작** (iii) 하위 경로 없음
   */
  owns(uri: string | null | undefined): boolean;
  uriFor(asset: DeviceAssetRef): string | null;
  /** owns()가 false면 no-op. 실패는 삼킨다 — 누수는 디스크 비용뿐. */
  cleanup(uri: string | null | undefined): Promise<void>;
}
/**
 * cleanup을 캐시 객체의 **메서드**로 승격해 "만든 주체가 지운다"를 구조가 보장한다.
 * 자유 함수로 두고 프리픽스만 설정 가능하게 열면 "어떤 프리픽스로 만든 걸 어떤 프리픽스로
 * 지우는가"가 호출자 규율이 된다 — 조용히 깨지는 전형(§6.1-⑨).
 */
export function createStagingCache(input: {
  /** /^[a-z0-9][a-z0-9-]{1,30}$/ — 위반 시 MediaError('config-invalid'). 부팅 시 즉사. */
  readonly namespace: string;
  readonly files: FileSystemAdapter;
}): StagingCache;

// src/core/debug.ts — Platform import를 PlatformAdapter 주입으로 대체해 core로 하강
export function summarizeUri(uri?: string | null): {
  readonly scheme: string; readonly extension: string | null; readonly length: number;
  readonly isFile: boolean; readonly isContent: boolean; readonly isPhotoKit: boolean;
} | null;
export function isPhotoKitUri(uri?: string | null): boolean;
/** URL→`[URL]` 치환 + 1000자 절단(§7 하드닝 8). */
export function sanitizeMediaErrorMessage(message: string): string;

/**
 * G14 확정 — 전신 `debug.ts:39-47`의 `PhotoDebugLogger`를 그대로 계승한다.
 * `error`는 `errorName` + `sanitizeMediaErrorMessage(errorMessage)`를 details에 병합해 기록한다
 * (원본 동작 보존). 두 메서드 모두 게이트가 닫혀 있으면 완전 no-op다.
 */
export interface MediaDebugLogger {
  log(event: string, details?: Readonly<Record<string, unknown>> | undefined): void;
  error(event: string, error: unknown, details?: Readonly<Record<string, unknown>> | undefined): void;
}
/** 게이트: `platform.isDev && platform.os !== 'web'` (전신 `debugEnabled()` 보존). */
export function createMediaDebugLogger(input: {
  readonly platform: PlatformAdapter;
  readonly options?: MediaDebugOptions | undefined;   // tag / context — 전신 tag·baseDetails 대응
}): MediaDebugLogger;

// src/core/upload/resolveSize.ts — §7 하드닝 3
export type UploadSizeSource = 'verified' | 'file-system' | 'reported';
export function resolveUploadSize(input: {
  readonly verifiedSizeBytes?: number | undefined;
  readonly statSizeBytes?: number | undefined;
  readonly reportedSizeBytes?: number | undefined;
}): { readonly sizeBytes: number; readonly source: UploadSizeSource } | null;

// src/core/upload/duration.ts — §7 하드닝 4 (core 단일 지점 정규화)
export function normalizeDurationMs(raw: number | undefined, os: MediaPlatform): number | undefined;
```

### 5.4 팩토리 7종 (`"./core"`)

```ts
// ── 공통 설정 ───────────────────────────────────────────────────────────────
export type MediaUploadConfig<TAsset, TCollectionId extends string = string> = {
  readonly api: MediaUploadApi<TAsset, TCollectionId>;
  /**
   * 생략 불가(§6.1-③). 무제한 업로드는 명시적 결정이어야 한다.
   * 서버만 검증하는 정책도 정당하므로 'server-enforced'로 그 결정을 표현한다
   *  — Number.POSITIVE_INFINITY는 JSON 직렬화 불가라 기각(§0.4 기각 8).
   */
  readonly limits: MediaUploadLimits | 'server-enforced';
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;        // 기본 enMediaStrings
  readonly telemetry?: MediaTelemetry | undefined;    // 기본 no-op
  readonly fileNamePrefix?: string | undefined;       // 기본 'media'
  readonly debug?: MediaDebugOptions | undefined;     // 기본 비활성 (core에 __DEV__ 없음)
};

// ── ① 로컬 파일 업로드 ──────────────────────────────────────────────────────
export type LocalUploadInput<TCollectionId extends string = string> = {
  readonly uri: string;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
  readonly sizeBytes?: number | undefined;
  /**
   * ⚠ **주어지면 hasher를 호출하지 않는다**(G2 복원). 전신 `uploadLocalUriToIntent`는 해시를
   * 계산하지 않고 호출자 값을 그대로 전달했다(uploader.ts:57-69의 필드 정의, 440의 전달).
   * 동기화 큐가 재시도 간 해시를 캐시한다:
   *   `src/sync/uploadAsset.ts:47` — "Reuse the cached hash across retries; only compute on
   *   first attempt" / `item.contentHash ?? (await hash(source.uri))`.
   * 이 필드가 없으면 재시도마다 15MB 파일을 다시 해시한다(순수 TS SHA-256 위에서는 §12-3의
   * Hermes 성능 리스크와 곱해진다).
   */
  readonly contentHash?: string | undefined;
  readonly collectionId?: TCollectionId | null | undefined;
  readonly photo?: MediaMetadata | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
};

export interface LocalUploads<TAsset, TCollectionId extends string = string> {
  uploadLocalFile(input: LocalUploadInput<TCollectionId>): Promise<UploadResult<TAsset>>;
  /**
   * 피커 자산 1건 — PickerFlows가 위임한다.
   * ⚠ **네이티브 전용이다.** `platform.os === 'web'`이면 `MediaError('platform-unsupported')`
   * — 로컬 파일 스트리밍은 웹에 존재하지 않는다. 웹 피커 자산의 정본 경로는 §5.7.4다.
   */
  uploadPickedAsset(
    asset: PickedAsset,
    options?: { readonly collectionId?: TCollectionId | null | undefined } | undefined,
  ): Promise<UploadResult<TAsset>>;
}

export function createLocalUploads<TAsset, TCollectionId extends string = string>(
  config: MediaUploadConfig<TAsset, TCollectionId> & {
    readonly files: FileSystemAdapter;
    readonly transport: LocalFileTransport;
    readonly hasher?: HashAdapter | undefined;        // 생략 = 내장 순수 TS 해시(§9)
    readonly poster?: LocalPosterAdapter | undefined; // 생략 = 동영상 포스터 없음
    readonly posterAtMs?: number | undefined;         // 기본 1000
    readonly staging?: StagingCache | undefined;      // DeviceUploads가 공급
  },
): LocalUploads<TAsset, TCollectionId>;

// ── ② 바이너리(웹 Blob) 업로드 ──────────────────────────────────────────────
export interface BinaryUploads<TAsset, TCollectionId extends string = string> {
  uploadBinary(input: {
    readonly source: NamedBinarySource;
    readonly collectionId?: TCollectionId | null | undefined;
    /**
     * JPEG APP1 파싱이 실패했을 때 필드 단위로 병합될 EXIF(§5.3 `mediaMetadataFromJpeg` 규칙 ②).
     * 웹 피커 경로가 `asset.exif`를 여기로 넘긴다(전신 uploader.ts:709 · §5.7.4). 없으면 유실된다.
     */
    readonly fallbackExif?: Readonly<Record<string, unknown>> | undefined;
    /**
     * 동영상 포스터. **3상태를 보존한다**(전신 `BlobVideoUploadInput.posterBlob`):
     *   `undefined` = 어댑터로 자동 추출 / `null` = 포스터 없음(추출 시도 금지) / 값 = 주어진 포스터.
     */
    readonly poster?: BinarySource | null | undefined;
    /**
     * [구현 시 복원] 동영상 재생시간(**밀리초**)과 픽셀 치수. 이미지에는 무시된다.
     * 전신 `uploadVideoBlobInternal`(uploader.ts:593-609)이 완료 페이로드로 보내던 값이며,
     * 초안 §5.4-②가 이 3필드를 누락해 **웹 동영상의 치수·재생시간이 서버에 영영 저장되지 않는**
     * 회귀가 있었다. `BinarySource`만으로는 DOM 없이 복원할 수 없어 호출자가 유일한 출처다.
     * ⚠ `durationMs`는 반드시 `normalizeDurationMs`(§7 하드닝 4)를 거친 값이어야 한다 —
     *   웹 피커는 **초**를 준다. `createPickerFlows`의 웹 경로는 이미 거친다.
     * 완료 페이로드 반영은 전신과 동일한 **truthy 스프레드**다(0·null·undefined는 탈락).
     */
    readonly durationMs?: number | null | undefined;
    readonly dimensions?:
      | { readonly width?: number | null | undefined; readonly height?: number | null | undefined }
      | undefined;
  }): Promise<UploadResult<TAsset>>;
  /**
   * 웹 드롭 다건.
   * ⚠ 첫 presign **이전에** 배치 전체를 검증한다 — 혼합 드롭 부분 업로드 방지(§7 하드닝 10).
   * ⚠ 검증은 `maxFiles` slice **이후**에 수행한다(전신 uploader.ts:623→630 순서 보존).
   */
  uploadDropped(
    files: readonly NamedBinarySource[],
    options?: {
      readonly collectionId?: TCollectionId | null | undefined;
      readonly maxFiles?: number | undefined;   // 기본 12 (uploader.ts:617)
    } | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createBinaryUploads<TAsset, TCollectionId extends string = string>(
  config: MediaUploadConfig<TAsset, TCollectionId> & {
    readonly transport: BinaryTransport;
    readonly hasher?: HashAdapter | undefined;
    readonly poster?: BinaryPosterAdapter | undefined;
    readonly posterAtMs?: number | undefined;
  },
): BinaryUploads<TAsset, TCollectionId>;

// ── ③ 피커 플로우 ───────────────────────────────────────────────────────────
export type PickUploadOptions<TCollectionId extends string = string> = {
  readonly collectionId?: TCollectionId | null | undefined;
  readonly max?: number | undefined;                  // 기본 12 (uploader.ts:931,951,966)
  readonly kinds?: readonly MediaKind[] | undefined;   // 기본 ['image']
};

export interface PickerFlows<TAsset, TCollectionId extends string = string> {
  pick(options?: { readonly max?: number | undefined; readonly kinds?: readonly MediaKind[] | undefined } | undefined):
    Promise<readonly PickedAsset[]>;
  pickAndUpload(options?: PickUploadOptions<TCollectionId> | undefined): Promise<readonly UploadResult<TAsset>[]>;
  /**
   * ⚠ 항상 **최대 1건**이다(전신 uploader.ts:1008 `result.assets.slice(0, 1)`).
   * 무시되는 옵션은 그 자체로 함정이므로 옵션 타입에서 `max`를 Omit한다.
   */
  captureAndUpload(
    options?: (Omit<PickUploadOptions<TCollectionId>, 'max'> & { readonly kind?: MediaKind | undefined }) | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createPickerFlows<TAsset, TCollectionId extends string = string>(input: {
  readonly picker: PickerAdapter;
  readonly uploads: LocalUploads<TAsset, TCollectionId>;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  /**
   * ⚠ `platform.os === 'web'`에서 피커 자산을 업로드하려면 **필수**. 없으면
   * `MediaError('platform-unsupported')`. 조건부 타입 0 — 런타임 분기다(§3.1).
   * 근거·경로 전문은 §5.7.4(G18).
   */
  readonly web?: {
    readonly uploads: BinaryUploads<TAsset, TCollectionId>;
    readonly loader: BinarySourceLoader;
  } | undefined;
}): PickerFlows<TAsset, TCollectionId>;

// ── ④ 기기 라이브러리 ───────────────────────────────────────────────────────
export type DeviceResolveOptions = {
  /**
   * 기본 false — 백그라운드 동기화가 예기치 않은 셀룰러 전송을 시작하지 않게(§7 하드닝 6).
   * 사용자가 직접 누른 전경 업로드만 true로 옵트인한다.
   */
  readonly downloadFromICloud?: boolean | undefined;
  readonly onICloudDownload?: ((downloading: boolean) => void) | undefined;
  readonly extraCandidates?: readonly (string | null | undefined)[] | undefined;
  readonly infoTimeoutMs?: number | undefined;        // 기본 15_000
  readonly downloadTimeoutMs?: number | undefined;    // 기본 60_000
};
export type ResolvedDeviceAsset = {
  readonly uri: string;
  readonly verifiedSizeBytes?: number | undefined;
  readonly exif: Readonly<Record<string, unknown>> | null;
  /** 스테이징 사본이면 true — 업로드 후 staging.cleanup 대상. */
  readonly staged: boolean;
};
export type ResolvedPickedAsset = PickedAsset & { readonly staged: boolean };

/**
 * 순수 함수(I/O 없음). `DeviceAsset`의 정체성(id·filename·치수)과 resolve 결과를 합쳐
 * 피커 업로드 경로가 받는 형태를 만든다 — 전신 `devicePhotoLibrary.ts:360-369`의 객체 리터럴:
 *   assetId ← asset.id · fileName ← asset.filename · width/height ← asset.width/height
 *   uri ← resolved.uri · verifiedSizeBytes ← resolved.verifiedSizeBytes
 *   exif ← `resolved.exif ?? undefined`  ← **null → undefined 정규화 필수**
 * ⚠ EOP(exactOptionalPropertyTypes) 하에서 `ResolvedDeviceAsset.exif`는
 *   `Readonly<Record<string, unknown>> | null`이고 `PickedAsset.exif`는
 *   `?: Readonly<Record<string, unknown>> | undefined`라 **null을 그대로 대입하면 TS2322**다
 *   (실측 확인). 전신은 `exif: null`을 그대로 흘렸고 recordCreate.test.tsx의 mock 팩토리도
 *   `exif: null`을 반환하므로, 이 강제변환은 여기와 expo 피커 어댑터 양쪽에 모두 필요하다.
 * ⚠ `reportedSizeBytes`는 채우지 않는다 — 기기 경로의 크기 진실은 verified뿐이다(§7 하드닝 3).
 * 3자 소비자가 같은 조합을 직접 만들 수 있도록 공개한다(§5.7.2-⑨).
 */
export function toPickedAsset(asset: DeviceAsset, resolved: ResolvedDeviceAsset): ResolvedPickedAsset;

/** 순수 함수 — creationTime(ms) → ISO 문자열. peer 0이므로 `"./core"`에 둔다(§5.7.5). */
export function deviceAssetCapturedAt(asset: { readonly creationTime?: number | undefined }): string | null;

export interface DeviceLibrary {
  /** 순수 조회. 요청하지 않는다. */
  getPermission(): Promise<MediaPermission>;
  /**
   * 권한 합성 규칙의 **유일한 거처**(G17): 조회 → `!granted && canAskAgain`일 때만 요청 →
   * `accessPrivileges === 'limited'` 매핑(전신 `mediaPermission.ts:22-38`).
   * ⚠ 초안의 `requestPermission()`은 **공개 표면에서 제거했다** — `canAskAgain`을 무시하는 raw
   * 요청이 정확히 iOS UI 데드록(재요청해도 아무 일도 일어나지 않음)의 원인이므로 골든패스에 두지
   * 않는다. 필요한 소비자는 `DeviceLibraryAdapter.requestPermission()`을 직접 쓴다.
   */
  ensurePermission(): Promise<MediaPermission>;

  fetchPage(input?: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize?: number | undefined;           // 기본 60
    readonly kinds?: readonly MediaKind[] | undefined;
  } | undefined): Promise<DeviceAssetPage>;
  /** ⚠ core가 `count > 0` 필터 + count 내림차순 정렬을 **수행한다**(§5.4-④(d)). */
  fetchAlbums(): Promise<readonly DeviceAlbum[]>;

  /**
   * 하드닝된 자산정보 조회 — 그리드/스캐너/업로드가 공유하는 단일 관문(G9 승격).
   * 기본값은 iCloud 다운로드 없음 + 15s 데드라인, 옵트인 시 60s(§7 하드닝 6).
   * 데드라인 초과는 `MediaError('device-timeout')`이며 어댑터 실패는 그대로 전파된다.
   * ⚠ 타임아웃과 `downloadFromNetwork` 기본값은 **core가 소유한다** — 어댑터는 순수 위임.
   * 이 메서드를 공개하지 않으면 `src/sync/mediaScan.ts`가 자체 조회를 짜게 되고
   * 그 순간 하드닝 6이 스캔 경로에서 소멸한다(§5.7.5).
   */
  getAssetInfo(assetId: string, options?: {
    readonly downloadFromICloud?: boolean | undefined;   // 기본 false
    readonly infoTimeoutMs?: number | undefined;         // 기본 15_000
    readonly downloadTimeoutMs?: number | undefined;     // 기본 60_000
  } | undefined): Promise<DeviceAssetInfo>;

  /**
   * 원본 바이트 위치만 필요한 경로(동기화 엔진)용. 전신 `resolveDeviceAssetSourceForUpload`.
   * iCloud 가드 · 이중 타임아웃 · iOS 캐시 실체화(§7 하드닝 2·6).
   */
  resolveForUpload(asset: DeviceAssetRef, options?: DeviceResolveOptions | undefined):
    Promise<ResolvedDeviceAsset>;

  /**
   * 화면 경로용. 전신 `resolveDeviceAssetForUpload`(G4).
   * ⚠ 후보 목록에 `asset.uri`를 **자동으로 덧붙인다**(devicePhotoLibrary.ts:355-359).
   *   최종 순서: [info.localUri, info.uri, asset.uri, ...options.extraCandidates]
   *   이 자동 후보가 §7.1 「정보 조회 실패 시 폴백 후보 생존」 규칙을 실제로 발화시키는 값이다.
   * 반환값을 그대로 `LocalUploads.uploadPickedAsset`에 넘기면 전신의 2단 조합이 재현된다.
   */
  resolvePickedAsset(asset: DeviceAsset, options?: DeviceResolveOptions | undefined):
    Promise<ResolvedPickedAsset>;
}

export function createDeviceLibrary(input: {
  readonly adapter: DeviceLibraryAdapter;
  readonly files: FileSystemAdapter;
  /** ⚠ 필수 — 스테이징 사본을 만드는 주체가 지우는 주체를 반드시 갖는다(§3.1, §7 하드닝 7). */
  readonly staging: StagingCache;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  readonly debug?: MediaDebugOptions | undefined;
  // ⚠ telemetry 인자는 **없다**. 전신은 기기 라이브러리 경로에서 의도적으로 방출하지 않으며
  //   (devicePhotoLibraryTelemetry.ts:38-40 주석), 방출 지점 없는 슬롯은 죽은 인자다(§5.1).
}): DeviceLibrary;

// ── ⑤ 기기 자산 업로드 ──────────────────────────────────────────────────────
export interface DeviceUploads<TAsset, TCollectionId extends string = string> {
  /**
   * ⚠ 순차 실행 고정. 병렬화하면 PhotoKit 원본 실체화가 디스크·네트워크를 배수로 압박한다
   * (§7 추가 보존). 업로드 성공·실패와 무관하게 finally에서 staging.cleanup을 호출한다.
   */
  uploadDeviceAssets(
    assets: readonly DeviceAssetRef[],
    options?: (DeviceResolveOptions & {
      readonly collectionId?: TCollectionId | null | undefined;
      readonly max?: number | undefined;
    }) | undefined,
  ): Promise<readonly UploadResult<TAsset>[]>;
}

export function createDeviceUploads<TAsset, TCollectionId extends string = string>(input: {
  readonly device: DeviceLibrary;
  readonly uploads: LocalUploads<TAsset, TCollectionId>;
  readonly staging: StagingCache;
  // ⚠ telemetry 인자 없음 — createDeviceLibrary와 같은 근거(§5.1 부수 결정).
}): DeviceUploads<TAsset, TCollectionId>;

// ── ⑥ 기기 저장 ─────────────────────────────────────────────────────────────
export type SaveableMedia = {
  /**
   * 안정 파일명의 1차 소스(G8). 없거나 빈 문자열이면 배열 인덱스+1로 폴백 — 전신 규칙
   * `${prefix}-${image.id || index + 1}.${ext}`(saveImages.ts:71) 보존.
   * 이 필드가 없으면 여러 장 저장 시 파일명이 전부 같아진다(브라우저는 `(1)` 접미사,
   * MediaLibrary 경로는 캐시 파일 덮어쓰기).
   * memorylog2의 `withFreshImageUrls`가 `image.id`로 Map을 구성하므로 이 필드로 그대로 동작한다.
   */
  readonly id?: string | undefined;
  /**
   * ⚠ **단일 진실이다.** `originalUrl || thumbnailUrl` 같은 폴백은 호스트 DTO 지식이므로
   * 라이브러리가 아니라 앱이 소유한다(전신 `imageDownloadUrl` 폐지 — §5.7.3).
   */
  readonly url: string;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
};
export type SaveResult = { readonly savedCount: number; readonly mode: SaveTarget['kind'] };

export interface MediaSaver {
  saveToDevice(images: readonly SaveableMedia[]): Promise<SaveResult>;
}
export function createMediaSaver(input: {
  readonly target: SaveTarget;                        // 판별 유니언 — 무효 조합 표현 불가(§6.1-⑦)
  readonly fileNamePrefix?: string | undefined;
  readonly strings?: MediaStrings | undefined;
  readonly telemetry?: MediaTelemetry | undefined;
}): MediaSaver;

/**
 * 파일명 = `${prefix}-${id || index + 1}.${ext}` (전신 saveImages.ts:71).
 * ext 우선순위: 저장된 fileName의 확장자 → contentType → URL 경로 확장자 → 'jpg'
 * (5자 초과 확장자는 거부 — 토큰 프록시 URL의 쿼리 조각이 확장자로 오인되는 것을 막는다).
 */
export function mediaDownloadFileName(input: {
  readonly url: string;
  /** ⚠ 0-base 필수 인자(G8). `MediaSaver`가 배열 순서를 넘긴다 — 없으면 이름이 충돌한다. */
  readonly index: number;
  readonly id?: string | undefined;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
  readonly prefix?: string | undefined;                      // 기본 'media'
}): string;

// ── ⑦ 스테이징 캐시 — §5.3 createStagingCache
```

#### 5.4-④ 기기 라이브러리 세부 규약 (a)–(d)

**(a) 반환 형태 — 전신의 2개 진입점을 둘 다 유지한다.**
전신에는 서로 다른 두 함수가 있었고 소비자가 갈라져 있다:

| 전신 함수 | 입력 | 반환 | 소비자 |
|---|---|---|---|
| `resolveDeviceAssetSourceForUpload(ref, extraCandidates, options)` (devicePhotoLibrary.ts:263-339) | `DeviceAssetRef`(id+filename) | `{uri, verifiedSizeBytes?, exif}` | `src/sync/uploadAsset.ts:25-28` (동기화 엔진) |
| `resolveDeviceAssetForUpload(asset, options)` (devicePhotoLibrary.ts:344-370) | `MediaLibrary.Asset` 전체 | **ImagePickerAsset 형태**(uri·width·height·assetId·fileName·fileSize·exif) | `src/photos/uploadDeviceAssets.ts:31-35` (화면) |

두 번째가 존재하는 이유는 파일 주석에 명시돼 있다 — `uploadDeviceAssets.ts:15-18`: "Composed from the adapter modules (not the kit's own `uploadDeviceLibraryAssets`) so screen tests can keep mocking the `./uploadPhoto` and `./devicePhotoLibrary` module boundaries." 실제로 화면 테스트 3곳이 이 반환 형태를 mock 팩토리에 하드코딩한다(`recordCreate.test.tsx:89-96`이 `{uri,width,height,assetId,fileName,exif}`를 그대로 반환, `recordDetail.test.tsx:107`, `DeviceRecordUploadSheet.test.tsx:41-42`).

따라서 **반환을 넓히되 전신처럼 두 진입점으로 나눈다**: `resolveForUpload`(바이트 위치만) / `resolvePickedAsset`(피커 형태). 순수 헬퍼 `toPickedAsset`도 공개해 3자 소비자가 같은 조합을 만들 수 있게 한다. 이 결정의 결과로 **§11.6의 "jest.mock 17사이트 무변경"이 유지된다** — 앱 어댑터가 `resolveDeviceAssetForUpload = (asset, options) => device.resolvePickedAsset(asset, options)`로 위임하면 mock 팩토리는 한 글자도 바뀌지 않는다. `uploadDeviceAssets.ts`의 난도는 **'소' 유지**(타입 심볼 교체만)이며, 이는 반환 형태를 넓힌 대가로 산 것이다.

**(b) 정보 조회 실패 규칙 — 2조건.**
전신: `devicePhotoLibrary.ts:289` — `if (error instanceof PhotoUploadError || !extraCandidates.length) throw error;`

```
① MediaError는 후보 유무와 무관하게 **항상 재throw**한다.
   근거: 유일하게 타입화되는 정보-조회 실패가 15초 타임아웃(device-timeout)이다
   (devicePhotoLibrary.ts:76). 이것을 후보로 삼켜버리면 하드닝 6이 조용히 무력화되고,
   사용자는 "재시도하면 되는 실패"를 영영 알 수 없다.
② 그 외(어댑터 raw 예외)는 폴백 후보가 있으면 생존, 없으면 원 에러 표면화한다.
   근거: 재시도 가능 실패를 "파일 없음"으로 오독하지 않기 위해(devicePhotoLibrary.ts:286-288 주석).
```
unit 3케이스는 §7.1에 기재.

**(c) 권한 합성 규칙 — core 소관.**
전신 `mediaPermission.ts:22-38`이 규칙의 주인이었다: 조회 → `!granted && canAskAgain`일 때만 요청 → `accessPrivileges === 'limited'` 매핑.
**"언제 요청하는가"는 core(`createDeviceLibrary`)가 갖는다. 어댑터는 순수 위임.** `getAssetInfo`의 `downloadFromNetwork`를 어댑터 기본값에서 뺏어온 것과 **정확히 같은 원칙**이다(§6.1-④). 어댑터에 두면 (i) 3자 어댑터마다 규칙이 갈리고, (ii) iOS에서 `canAskAgain=false`인데 재요청해 아무 일도 일어나지 않는 **UI 데드록**이 재발하며, (iii) Android 13+ granular 하드닝(§7 하드닝 5)이 요청 경로에서만 새는 반쪽 구현이 나온다.
- `DeviceLibraryAdapter.getPermission()`/`requestPermission()` — 각각 순수 위임. 네이티브 응답을 `MediaPermission`으로 매핑(`limited` 포함)하는 것까지가 어댑터 몫.
- `DeviceLibrary.requestPermission()`은 **공개 표면에서 제거**. `DeviceLibrary.ensurePermission()`이 합성 규칙의 유일한 거처.

unit 4케이스는 §7.1에 기재. 전신 `mediaPermission.test.ts`(60줄 2케이스)를 그 4종으로 흡수 이식한다(§11.4).

**(d) 정렬·필터 계약 — 두 메서드를 다르게 처리한다.**
판단 기준은 "core가 강제할 수 있는가"다.

| 표면 | 판정 | 이유 |
|---|---|---|
| `listAssets` | **계약(TSDoc) + 정적 가드**. core 재정렬 **금지** | 페이지 단위 재정렬은 **전역 순서를 보장하지 못한다**(다음 페이지가 이전 페이지보다 최신일 수 있다). 재정렬하면 순서가 맞는 것처럼 보이면서 `endCursor`는 여전히 어댑터 순서를 따라가 **커서와 표시 순서가 어긋난다** — 원 결함보다 나쁘다 |
| `listAlbums` | **core가 강제**(필터 + 재정렬) | 전량을 한 번에 반환하는 in-memory 목록이라 전역 순서 보장이 가능하고 비용이 O(n log n)뿐이다. 3자 어댑터가 무엇을 주든 결과가 같아진다 |

> **비평 전제 1건 정정**: 「`mediaScan.ts`의 커서 로직이 `listAssets` 정렬에 의존한다」는 사실이 아니다 — 동기화 스캐너는 `MediaLibrary.getAssetsAsync`를 **직접** 호출하며 정렬도 반대다(`mediaScan.ts:90` `sortBy: [[SortBy.creationTime, true]]` = **오름차순**). `fetchDevicePhotoPage`는 `src/sync/**` 어디에서도 호출되지 않는다(grep 0건). 내림차순 계약의 실제 의존자는 **그리드 UI와 그 `after` 커서 페이지네이션**(DeviceRecordUploadSheet / recordCreate 기기 그리드)이다. 이 정정은 §11에도 반영돼 있다 — 스캐너는 자기 쿼리를 유지하므로 정렬 관련 이관 작업이 없다.

#### 5.4.1 기본값·규약 전수 확정표 (G20 — §5.4·§5.6 공통. 미결 0)

원칙 3개: **(i) 하드닝 값은 고정한다**(옵션화하면 3자 소비자가 하드닝을 끌 수 있다) · **(ii) 사용자 정책 값은 옵션+기본값** · **(iii) 네이티브 SDK가 형태를 정하는 값만 어댑터 소관.**

| # | 값 | 전신 근거 | 판정 | 확정 형태 |
|---|---|---|---|---|
| 1 | 피커 선택 상한 `max` = **12** | `uploader.ts:931,951,966` (3사이트 `max = 12`) | **옵션 + 기본값 12** | `PickUploadOptions.max` / `PickerFlows.pick({max})`. ⚠ memorylog2의 `RECORD_IMAGE_MAX = 30`(shared:275)과 **무관한** 전신 하드코딩이므로 기본값을 바꾸면 동작이 달라진다 |
| 2 | 웹 드롭 `maxFiles` = **12** | `uploader.ts:617` | **옵션 + 기본값 12** | `uploadDropped(files, { maxFiles })`. 배치 검증은 **slice 이후** 수행(623→630 순서 보존) |
| 3 | 웹 포스터 이벤트 대기 타임아웃 **3000ms** | `videoPoster.ts:6` `VIDEO_POSTER_EVENT_TIMEOUT_MS` | **고정 상수(비공개)** | `"./web"` 내부. `onloadedmetadata`·`onseeked` 각각에 적용. 옵션화 시 3자 구현이 무한대기를 만들 수 있어 하드닝 훼손 |
| 4 | 포스터 추출 시각 **1000ms** | `videoPoster.ts:5` `VIDEO_POSTER_TIME_MS` · 네이티브 `uploader.ts:315` | **옵션 + 기본값 1000** | `posterAtMs` — `createLocalUploads`/`createBinaryUploads` 양쪽 |
| 5 | 포스터 seek 상한 `min(atMs/1000, duration − 0.05)` | `videoPoster.ts:57-62` | **고정 규칙(웹 어댑터 내부)** | 짧은 영상에서 seek가 끝을 넘어 `onseeked`가 영영 오지 않는 것을 막는 하드닝(§7.1) |
| 6 | 포스터 JPEG 품질 **0.84** | `videoPoster.ts:77` `canvas.toBlob(cb, type, 0.84)` | **고정 상수(비공개)** | 서버 정책과 무관한 인코딩 취향값. 노출하면 영구 계약이 된다 |
| 7 | 포스터 contentType `'image/jpeg'` | `videoPoster.ts:4` (전신 **공개** export) | **고정 상수, 공개** | `POSTER_CONTENT_TYPE: 'image/jpeg'` (`"./core"`). presign 요청의 contentType과 서버 검증이 맞물리므로 소비자가 읽을 수 있어야 한다 |
| 8 | 포스터 파일명 `${base}-poster.jpg` | `videoPoster.ts:29-32` `posterFileName` | **고정 규칙(비공개)** | memorylog2 앱 소스 사용처 0건(grep) — 공개 표면에서 내린다 |
| 9 | 기기 페이지 크기 **60** | `devicePhotoLibrary.ts:204` | **옵션 + 기본값 60** | `fetchPage({pageSize})`. 그리드 렌더 예산 값이라 UI마다 다를 수 있다 |
| 10 | 자산정보 타임아웃 **15000 / 60000ms** | `devicePhotoLibrary.ts:15-16` | **옵션 + 기본값, core 소관** | `DeviceResolveOptions.infoTimeoutMs`(15_000) / `downloadTimeoutMs`(60_000). ⚠ **타임아웃을 거는 주체는 core다** — 어댑터 소관으로 넘기면 3자 구현이 통째로 빠뜨린다(§7 하드닝 6) |
| 11 | `HASH_CHUNK_BYTES = 3 * 256 * 1024` (768KB) | `hashFile.ts:11` | **고정 상수, 공개(읽기 전용)** | 값은 공개하되 `computeChunkRanges(size)`의 `chunkBytes` 인자는 **비공개**. 전신 `hashFile.ts:18`은 기본 인자로 공개돼 있었고 그것이 §7 하드닝 9의 회귀 통로였다 |
| 12 | 카메라 캡처 **1장 제한** | `uploader.ts:1008` `result.assets.slice(0, 1)` | **고정 규칙** | `captureAndUpload`는 옵션 타입에서 `max`를 `Omit`한다(무시되는 옵션 = 함정) |
| 13 | `fileNamePrefix` 기본값 | 전신 `'photo'` (types.ts:118, saveImages.ts:56·290) | **옵션 + 기본값 `'media'`** | 전신에서 변경. memorylog2는 항상 `'memorylog'`를 주입하므로(kit.ts:21,57) **이관 영향 0**이며, 라이브러리명(`expo-media`)과의 일관성을 택한다 |
| 14 | `DeviceAssetPage.endCursor` | `devicePhotoLibrary.ts:169` | **규약 위반 수정** | `readonly endCursor?: string \| undefined`(§3.3). §1-7을 문서 자신의 시그니처가 위반하던 유일한 지점이었다 |
| 15 | `mediaFileName`의 시각 소스 | 전신은 `Date.now()` 직접 호출(테스트 없음) | **주입구 신설, 기본값은 전신 동작** | `mediaFileName({ ..., now? })`. 생략 시 `Date.now()` — 호출부 무변경이면서 unit이 결정론적으로 고정된다 |

### 5.5 골든패스 (`"."`)

```ts
// "." — src/index.ts. "./core" 전체 재export + 아래.
export type MediaKitConfig<TAsset, TCollectionId extends string = string> =
  Omit<MediaUploadConfig<TAsset, TCollectionId>, 'platform'> & {
    /** expo 기본 어댑터 위의 선택 오버라이드. 각 필드는 개별 교체이며 부분 객체가 아니다. */
    readonly platform?: PlatformAdapter | undefined;
    readonly files?: FileSystemAdapter | undefined;
    readonly localTransport?: LocalFileTransport | undefined;
    readonly binaryTransport?: BinaryTransport | undefined;
    readonly hasher?: HashAdapter | undefined;
    /** 네이티브 경로(로컬 URI → 포스터). 보통 `expoVideoPoster()`(`"./video"`). */
    readonly poster?: LocalPosterAdapter | undefined;
    /**
     * [구현 시 신설] 바이너리 경로(Blob → 포스터). 보통 `webCanvasVideoPoster()`(`"./web"`).
     * 초안은 이 필드가 없어 골든패스 소비자가 웹 캔버스 포스터를 붙일 방법이 아예 없었고,
     * 그 결과 전신 `uploader.ts:566-569`의 **웹 동영상 포스터 자동 추출이 조용히 사라졌다**.
     * "`createBinaryUploads`를 직접 조립하라"는 우회는 골든패스가 아니다.
     * ⚠ `poster`와 입력 타입이 달라 자리를 바꿔 끼우면 컴파일 에러다(§6.1-⑥) — 슬롯을
     *   하나로 합치면 그 검출력이 사라지므로 **두 필드로 유지**한다.
     */
    readonly binaryPoster?: BinaryPosterAdapter | undefined;
    readonly posterAtMs?: number | undefined;
    /** 스테이징 네임스페이스. 기본 'gj-media'. /^[a-z0-9][a-z0-9-]{1,30}$/ (§5.3). */
    readonly namespace?: string | undefined;
  };

/**
 * 골든패스. expo 기본 어댑터(platform·files·localTransport·binaryTransport·hasher·staging)가
 * 이미 채워져 있다. peer: react-native + expo-file-system만 — 피커·기기라이브러리·저장·포스터는
 * 각자의 엔트리에서 부착한다(§2.2).
 */
export interface MediaKit<TAsset, TCollectionId extends string = string>
  extends LocalUploads<TAsset, TCollectionId>, BinaryUploads<TAsset, TCollectionId> {
  readonly platform: PlatformAdapter;
  readonly files: FileSystemAdapter;
  readonly staging: StagingCache;
  /**
   * ⚠ 공개 필드다(V9 요구). memorylog2 `src/sync/hashFile.ts`가 `hashLocalFile`을 재export하고
   * `src/sync/uploadAsset.ts:14,22`가 그것을 쓴다. 이 필드가 없으면 앱 어댑터가 위임할 대상이
   * 없어 동기화 엔진이 해시 함수를 잃는다(§5.7.2-⑦).
   */
  readonly hasher: HashAdapter;

  /** 각 with*는 자기 자신을 넓히지 않고 **구체 킷을 새로 반환**한다 — 조건부 타입 0(§3.1). */
  withPicker(
    picker: PickerAdapter,
    /**
     * 웹에서 피커 자산을 업로드하는 앱은 `loader`만 주면 된다 — `uploads`는 킷 자신(`BinaryUploads`)이
     * 채운다. 생략 시 웹 피커 업로드는 `platform-unsupported`(§5.7.4).
     */
    options?: { readonly web?: { readonly loader: BinarySourceLoader } | undefined } | undefined,
  ): PickerFlows<TAsset, TCollectionId>;
  withDeviceLibrary(adapter: DeviceLibraryAdapter): DeviceKit<TAsset, TCollectionId>;
  withDeviceSave(adapter: MediaLibrarySaveAdapter): MediaSaver;
}

/** DeviceLibrary + DeviceUploads를 한 객체로 — staging·files는 MediaKit이 공급한다. */
export interface DeviceKit<TAsset, TCollectionId extends string = string>
  extends DeviceLibrary, DeviceUploads<TAsset, TCollectionId> {}

export function createMediaKit<TAsset, TCollectionId extends string = string>(
  config: MediaKitConfig<TAsset, TCollectionId>,
): MediaKit<TAsset, TCollectionId>;

// expo 기본 어댑터 (peer: react-native, expo-file-system)
export function expoPlatform(): PlatformAdapter;
export function createExpoFileSystem(): FileSystemAdapter & FileDownloadAdapter;
export function createExpoLocalFileTransport(): LocalFileTransport;
export function createExpoBinaryTransport(): BinaryTransport;
```

### 5.6 서브패스 어댑터

```ts
// "./picker"  ← expo-image-picker, react-native
export function expoPicker(options?: {
  /** 기본 true — iOS PhotoKit 원본 표현 fast path 고정 조합(§7 추가 보존). */
  readonly preferOriginalRepresentation?: boolean | undefined;
}): PickerAdapter;

// "./device"  ← expo-media-library/legacy, react-native   (node·browser 조건 → 비네이티브 포크)
export function expoDeviceLibrary(): DeviceLibraryAdapter;

// "./save"    ← expo-media-library/legacy, react-native   (node·browser 조건 → 비네이티브 포크)
export function expoDeviceSave(input?: {
  /** Constants.appOwnership === 'expo'. expo-constants peer를 없애기 위한 인자화(§0.2). */
  readonly isExpoGo?: boolean | undefined;
}): MediaLibrarySaveAdapter;

// "./video"   ← expo-video-thumbnails
export function expoVideoPoster(): LocalPosterAdapter;

// "./web"     ← peer 0 (DOM 필요)
// ⚠ 이 엔트리의 .d.ts에만 `/// <reference lib="dom" />`이 각인된다(§2.4). DOM 타입이 공개
//   시그니처에 나타나도 되는 엔트리는 여기 하나뿐이다.
export function webCanvasVideoPoster(input?: { readonly document?: Document | undefined }): BinaryPosterAdapter;
export function createFetchBinaryTransport(input?: { readonly fetch?: typeof fetch | undefined }): BinaryTransport;
/** document/fetch를 **필수 주입** — 네이티브에서 조용히 생성될 수 없다(§6.1-⑬). */
export function createBrowserSaveTarget(input: {
  readonly document: Document;
  readonly fetch: typeof fetch;
}): BrowserSaveAdapter;
/** 웹 피커 자산(`blob:`/`data:` URI) → `NamedBinarySource`. §5.7.4(G18)의 변환 담당자. */
export function createFetchBinarySourceLoader(input?: {
  readonly fetch?: typeof fetch | undefined;
}): BinarySourceLoader;

// "./testing" ← peer 0
export function createMemoryFileSystem(options?: {
  readonly files?: Readonly<Record<string, Uint8Array>> | undefined;
  readonly cacheDirectory?: string | undefined;
}): FileSystemAdapter & FileDownloadAdapter & { readonly calls: FakeCallLog };
export function createRecordingTransport(options?: { readonly failWithStatus?: number | undefined }):
  LocalFileTransport & BinaryTransport & { readonly puts: readonly PutRequest[] };
export function createFakePicker(assets: readonly PickedAsset[]): PickerAdapter;
export function createFakeDeviceLibrary(options?: {
  readonly assets?: readonly DeviceAsset[] | undefined;
  readonly networkOnly?: boolean | undefined;
}): DeviceLibraryAdapter;
export function createFakeUploadApi<TAsset>(options: {
  readonly asset: (input: MediaUploadCompletion) => TAsset;
  readonly duplicateWhen?: ((input: MediaUploadCompletion) => boolean) | undefined;
}): MediaUploadApi<TAsset> & { readonly intents: readonly MediaUploadIntentRequest[];
                               readonly completions: readonly MediaUploadCompletion[] };
export function fakePlatform(os: MediaPlatform): PlatformAdapter;
```

---

### 5.7 전신 심볼 대응표

> 이 절은 원본 배럴 `packages/photo-kit/src/index.ts`가 재export하는 **12개 모듈의 공개 심볼 81개 + uploader 팩토리 반환 메서드 13개 = 94개 전부**를 열거하고 각각의 새 주소를 확정한다. §5.1–§5.6이 "새 API가 무엇인가"를 적었다면 이 절은 **"전신의 무엇이 어디로 갔는가"**를 적는다. **여기에 없는 심볼은 없다.**

#### 5.7.1 판정 범례

| 판정 | 의미 |
|---|---|
| **보존** | 같은 의미로 공개 표면에 남는다(이름은 바뀔 수 있으나 계약이 같다) |
| **개명** | 이름/형태가 바뀐다. 앱 어댑터 1줄 위임으로 호출부는 무변경 |
| **통합** | 여러 심볼이 하나로 합쳐진다 |
| **내부화** | 로직은 그대로 살아 있으나 공개 표면에서 내린다(실소비 0 + 동치 공개 대체 존재) |
| **폐지** | 개념 자체가 사라진다. 실소비가 있으면 대체 코드를 반드시 기재 |

---

#### 5.7.2 모듈별 대응표

##### ① `types.ts` (12) — 백엔드/텔레메트리 계약

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `PhotoGeoPoint` | 0 | 개명 | `GeoPoint` — `"./core"` | — |
| `PhotoMetadata` | 0(타입) | 개명 | `MediaMetadata` — `"./core"` | **필드는 전신 그대로**(`geoPoint` 환원 — §5.3). 앱 재매핑 0줄 |
| `PhotoUploadIntent` | 0 | 개명 | `MediaUploadIntent` (§5.1) | — |
| `PhotoUploadIntentRequest` | 0 | 개명 | `MediaUploadIntentRequest` | `contentType`이 `string`→`MediaContentType`으로 좁혀진다 |
| `PhotoUploadCompletion` | 0 | 개명 | `MediaUploadCompletion` | poster 2필드 → `poster?: UploadedPoster` 쌍 객체(§6.1-②). `kit.ts`의 `completeUpload` 브리지가 다시 2필드로 편다 |
| `CompletedPhotoUpload<T>` | 0(타입) | 개명 | `UploadResult<T>` | — |
| `PhotoUploadApi<T>` | 0(타입) | 개명 | `MediaUploadApi<T, TCollectionId>` | `kit.ts` 재작성 시 흡수 |
| `PhotoKitActivity` | **1** (`kit.ts:31`이 `beginClientActivity` 반환을 구조적으로 넘김) | **보존(개명)** | `MediaActivity{succeed,fail,cancel}` — `"./core"` | §5.1에서 스팬 계약을 복원했으므로 성립. 복원하지 않았다면 memorylog2 media 활동로그가 통째로 끊긴다 |
| `PhotoKitTelemetry` | **1** (`kit.ts:25`) | **보존(개명)** | `MediaTelemetry{track,begin}` — `"./core"` | 동상. `track`/`begin` **본문 무변경**, 타입명만 교체 |
| `NOOP_TELEMETRY` | 0 | 개명 | `noopMediaTelemetry` — `"./core"` | 팩토리 기본값이라 소비자가 쓸 일은 드물다. 3자 어댑터 테스트용으로 유지 |
| `PhotoUploadLimit` | 0(타입) | 개명 | `MediaUploadLimit` | — |
| `PhotoUploaderConfig<T>` | 0(타입) | 분해·개명 | `MediaUploadConfig` + `MediaKitConfig`(§5.4/§5.5) | `limits`·`fileNamePrefix`·`debugTag`·`debugContext` → `limits`·`fileNamePrefix`·`debug:{tag,context}` 1:1 |

##### ② `errors.ts` (4)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `PhotoErrorCode` | **1파일** (`useRecordUploadPanel.ts:16`의 `ACTIONABLE_ERROR_CODES` 집합) | 보존(개명) | `MediaErrorCode` — 8→16코드(§5.2) | 유니언이 넓어질 뿐이므로 `Set<MediaErrorCode>` 리터럴은 그대로 컴파일된다 |
| `PhotoUploadError` | **3파일** (`sync/uploadAsset.ts:35` 생성 · `sync/syncStateMachine.ts:36` **instanceof** · `DeviceRecordUploadSheet.test.tsx` 생성) | 보존(개명) | `MediaError` — `"./core"` | ⚠ **신규 발견**: `syncStateMachine.ts:36`의 `error instanceof PhotoUploadError`는 §5.2가 경고한 `splitting:false` 사본 문제에 정면으로 걸린다. **`isMediaError(error)`로 교체 필수**(§11.3에 행 신설) |
| `photoErrorCode` | **5파일** | 보존(개명) | `mediaErrorCode` | sed |
| `photoErrorUserMessage` | **5파일** | 보존(개명) | `mediaErrorUserMessage` | sed |

##### ③ `mediaTypes.ts` (20) — G7 해소

초안 §5.3은 5개 함수만 제시했다. 20개 전부의 판정은 다음과 같다(공개 13 / 내부화 5 / 통합 3→1).

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 근거 · 이관 흡수 |
|---|---|---|---|---|
| `MEDIA_FILE_EXTENSIONS` | 0(외부) / 1(내부: `saveImages.ts:63`) | **보존** | 동명 — `"./core"` | 호스트가 "지원 형식" 안내 문구·파일 입력 `accept` 속성을 그리려면 테이블이 필요하다. 숨기면 3자 소비자가 재구현한다. **gif 미포함 = 전신·shared와 동일 8종**(§5.1) |
| `MediaContentType` | 0(외부) | 보존 | 동명 — `"./core"` (§5.1) | — |
| `ImageContentType` | 0(외부, `uploadPhoto.ts:9` 타입 재export) | **보존** | 동명 — `Extract<MediaContentType, 'image/…'>` | `uploadBinary`의 이미지 전용 메타데이터 경로와 앱의 `uploadImageBlob` 래퍼가 타입 수준 구분을 쓴다. `mediaKindOf`는 런타임 함수라 좁히기가 안 된다. 비용 1줄 |
| `VideoContentType` | 0 | **보존** | 동명 | 대칭. 비용 1줄 |
| `IMAGE_CONTENT_TYPES` | 0 | **내부화** | — | 동치 대체: `MEDIA_CONTENT_TYPES.filter(t => mediaKindOf(t) === 'image')` |
| `VIDEO_CONTENT_TYPES` | 0 | **내부화** | — | 동상 |
| `mediaContentTypeFromPath` | 0 (동명의 `@memorylog/shared` 심볼이 `sync/mediaScan.ts:7`에서 쓰이나 **별개 함수**다) | **내부화** | — | 동치 대체: `detectMediaContentType(null, path)`. 이름 충돌 위험까지 제거 |
| `imageContentTypeFromPath` | 0 | **내부화** | — | 동치 대체: `detectImageContentType(null, path)` |
| `fileExtensionForContentType` | 0(외부) | 개명 | `extensionForContentType` — `"./core"` | sed |
| `detectImageContentType` | 0(외부) / 재export 2단 + 테스트 mock 키 | **보존(신설)** | 동명 — `"./core"` (§5.3) | 원본 주석의 계약("mislabeling would corrupt data → 엄격 감지, infer*는 OS가 이미지를 보장하는 곳에서만")을 유지하려면 엄격/관대 4종이 모두 필요하다 |
| `detectMediaContentType` | 0(외부) | 보존 | 동명 (§5.3) | — |
| `inferContentType` | **1파일 3콜사이트** (`pendingPhotos.ts:56,131,143` — HEIC/HEIF 프리뷰 분기가 반환값에 의존) + 테스트 mock 2사이트 | **개명** | `inferImageContentType` — `"./core"` (§5.3) | `src/photos/mediaTypes.ts`가 `export { inferImageContentType as inferContentType }`로 흡수 → `pendingPhotos.ts` **무변경** |
| `inferMediaContentType` | 0(외부) | 보존 | 동명 (§5.3) | — |
| `isVideoContentType` | 0 | **내부화** | — | 동치 대체: `mediaKindOf(ct) === 'video'` |
| `isSupportedImageFile` | **1파일** (`pendingPhotos.ts:55` filter) + 테스트 mock 3사이트 | **보존(신설)** | 동명 — `"./core"` (§5.3) | DOM `File` 대신 구조 타입(하드닝 10 규율 유지) |
| `isSupportedVideoFile` | 0 | **보존(신설)** | 동명 (§5.3) | 이미지 쪽을 공개하면서 동영상만 숨기면 3자 소비자가 재구현한다. 비용 3줄 |
| `isSupportedMediaFile` | **1파일** (`records/recordDropZone.ts:17`) + 테스트 mock 1사이트 | 보존 | 동명 (§5.3) | — |
| `defaultMediaFileName` | 0 | **통합** | `mediaFileName({ contentType, prefix })` (§5.3) | 아래 2건과 하나로 |
| `inferFileName` | 0(외부, 앱이 프리픽스 바인딩 래퍼 노출) | **통합** | `mediaFileName({ fileName, contentType, prefix })` | 기존 앱 래퍼가 그대로 위임 → 호출부 무변경 |
| `inferWebFileName` | **1파일** (`pendingPhotos.ts:134` via 앱 래퍼) | **통합** | `mediaFileName({ fileName, contentType, prefix })` | 앱 래퍼가 `prefix: 'memorylog-drop'`을 바인딩 → 호출부 무변경 |

##### ④ `photoMetadata.ts` (2)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `extractPhotoMetadata` | **2파일** (`sync/uploadAsset.ts:47`, `pendingPhotos.ts:139`) | 개명 | `mediaMetadataFromExif` — `"./core"` (§5.3) | 재export 출처 교체만. **`geoPoint` 환원으로 재매핑 0줄** |
| `extractPhotoMetadataFromBlob` | **1파일** (`pendingPhotos.ts:141` — contentType 인자 사용) | 개명 | `mediaMetadataFromJpeg(source, options?)` (§5.3, 인자 복원) | `Blob`→`BinarySource`는 구조적으로 통과. 인자 2개는 `options` 객체로 재조립 — **인자 형태 변경 1곳** |

##### ⑤ `debug.ts` (5)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 근거 |
|---|---|---|---|---|
| `isPhotoKitUri` | 0 (`src/photos/debug.ts` 임포터 0 — V9-b) | **보존** | 동명 — `"./core"` (§5.3) | 하드닝 2의 `ph://` 후보 스킵 술어(§7 표 2번)를 3자 어댑터가 재사용해야 한다 |
| `summarizeUri` | 0 | 보존 | 동명 (§5.3) | 하드닝 8 |
| `sanitizePhotoErrorMessage` | 0 | 개명 | `sanitizeMediaErrorMessage` (§5.3) | 하드닝 8 |
| `PhotoDebugLogger` | 0(타입) | 개명 | `MediaDebugLogger` — **멤버 시그니처 확정**(§5.3, 원본 `debug.ts:39-47` 계승) | 초안은 반환 타입만 있고 본문이 없어 구현자가 임의로 정할 수 있었다 |
| `createPhotoDebugLogger` | 0 | 개명 | `createMediaDebugLogger({ platform, options? })` (§5.3) | `tag`/`baseDetails` → `options.tag`/`options.context` |

> **이관 결과**: `src/photos/debug.ts`(임포터 0)는 **파일째 삭제**한다.

##### ⑥ `deviceUploadCache.ts` (2)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `deviceUploadCacheUri` | 0 | 개명(메서드화) | `StagingCache.uriFor(asset)` (§5.3) | `src/photos/deviceUploadCache.ts` **삭제** |
| `cleanupDeviceUploadCopy` | **1파일** (`sync/uploadAsset.ts:67`) | 개명(메서드화) | `StagingCache.cleanup(uri)` (§5.3) | `src/photos/devicePhotoLibrary.ts`가 `export const cleanupDeviceUploadCopy = (uri?: string \| null) => media.staging.cleanup(uri)` → `uploadAsset.ts` **무변경** |

##### ⑦ `hashFile.ts` (4)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `HASH_CHUNK_BYTES` | **1파일** (`sync/hashFile.test.ts:1,22`) | 보존 | 동명 — `"./core"` (§5.3) | sed |
| `ChunkRange` | 0(타입) | 보존 | 동명 — `"./core"` (§3.3) | — |
| `computeChunkRanges` | **1파일** (`sync/hashFile.test.ts` 5콜사이트) | 보존(시그니처 축소) | `computeChunkRanges(size)` — `chunkBytes` 제거(§6.1-⑩) | ⚠ **신규 발견**: `sync/hashFile.test.ts:10,14`가 **2인자로 호출**한다(`computeChunkRanges(100, 1000)`, `(2500, 1000)`). 인자 제거 시 컴파일 에러 → **테스트 2케이스 재작성**(§11.4) |
| `hashLocalFile` | **1파일** (`sync/uploadAsset.ts:14,22` via `sync/hashFile.ts` 재export) | 개명(어댑터화) | `HashAdapter.hashLocalFile` / `createFileHasher({ files })` (§5.3) | ⚠ **`MediaKit.hasher` 공개 필드가 전제**(§5.5). 없으면 `src/photos/hashFile.ts`가 위임할 대상이 없어 sync가 해시 함수를 잃는다 |

##### ⑧ `mediaPermission.ts` (2)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `MediaPermission` | 0(외부, 타입) | 보존 | 동명 — `"./core"` (§3.3) | — |
| `ensureMediaPermission` | 0(런타임) / 테스트 2사이트 (`photos/devicePhotoLibrary.test.ts:24,35`, `photos/mediaPermission.test.ts:10` 딥 경로) | 개명(계층 이동) | `DeviceLibrary.ensurePermission()` — 합성 규칙(조회 → `!granted && canAskAgain`일 때만 요청 → `accessPrivileges==='limited'` 매핑)은 **core가 소유**(§5.4-④(c)) | `src/photos/mediaPermission.ts` = `export const ensureMediaPermission = () => device.ensurePermission()`. 딥 경로 mock 2건은 `createFakeDeviceLibrary()`로 대체(§11.4) |

##### ⑨ `devicePhotoLibrary.ts` (14)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `DeviceAssetRef` | 0(타입) | 보존 | 동명 — `"./core"` (§3.3) | — |
| `DeviceAssetResolveOptions` | 0(타입, `uploadDeviceAssets.ts:5`) | 개명 | `DeviceResolveOptions` (§5.4) | sed |
| `getDeviceAssetInfoForUpload` | **1파일** (`sync/mediaScan.ts:9,40` — `isNetworkAsset`/`localUri`/`uri` 직접 판독) | **보존(승격)** | `DeviceLibrary.getAssetInfo(assetId, options?)` (§5.4-④) | `src/photos/devicePhotoLibrary.ts` = `export const getDeviceAssetInfoForUpload = (id: string) => device.getAssetInfo(id)` → `mediaScan.ts` **무변경**. 근거 §5.7.5 |
| `DevicePhotoPage` | 0(외부 타입) | 개명 | `DeviceAssetPage` (§3.3) | `assets: MediaLibrary.Asset[]` → `DeviceAsset[]`. 실측: 앱 그리드가 쓰는 필드는 `id·filename·uri·width·height·creationTime` 6개뿐이며 `DeviceAsset`이 전부 포함한다 |
| `DeviceAlbumOption` | **2파일** (`RecordCreatePhotoSection.tsx`, `DeviceRecordUploadSheet.tsx`) | 개명 | `DeviceAlbum` (§3.3) | 앱 어댑터가 `export type { DeviceAlbum as DeviceAlbumOption }` |
| `DevicePhotoPermissionStatus` | 0(외부 타입, `devicePhotoLibraryTelemetry.ts:9`) | **통합** | `MediaPermission` (동일 3필드였다) | 앱 어댑터가 별칭 재export |
| `requestDevicePhotoPermissionStatus` | 0(런타임) / 테스트 mock 4사이트 | 개명 | `DeviceLibrary.ensurePermission()` | 실측: 전신 본문이 `ensureMediaPermission()` + 디버그 로그 1줄이므로 의미 동일. 앱 어댑터 1줄 |
| `ensureDevicePhotoPermission` | 0 (테스트 mock 3사이트만) | **폐지** | — | 대체: `(await device.ensurePermission()).granted`. 앱 어댑터에 1줄 헬퍼로 남겨 mock 키를 유지 |
| `fetchDevicePhotoPage` | 0(런타임, `devicePhotoLibraryTelemetry.ts`가 래핑) / mock 다수 | 개명 | `DeviceLibrary.fetchPage` (§5.4) | 앱 어댑터 1줄. 정렬 계약(creationTime 내림차순)이 어댑터 TSDoc에 각인됐다(§3.3) |
| `fetchDeviceAlbumOptions` | 0(런타임) / mock 4사이트 | 개명 | `DeviceLibrary.fetchAlbums` | 동상. `count>0` 필터 + count 내림차순은 **core로 승격**(§5.4-④(d)) |
| `DeviceAssetUploadSource` | 0(타입) | 개명 | `ResolvedDeviceAsset` (+`staged` 신설) (§5.4) | sed |
| `resolveDeviceAssetSourceForUpload` | **1파일** (`sync/uploadAsset.ts:10,26`) | 개명 | `DeviceLibrary.resolveForUpload` (§5.4) | 앱 어댑터 1줄 위임 → `uploadAsset.ts` 무변경 |
| `resolveDeviceAssetForUpload` | **2파일** (`DeviceRecordUploadSheet.tsx:185`, `uploadDeviceAssets.ts:29`) + mock 5사이트 | **보존(2번째 진입점)** | `DeviceLibrary.resolvePickedAsset` (+ 순수 헬퍼 `toPickedAsset`) (§5.4-④(a)) | 앱 어댑터 1:1 위임으로 이름·반환 형태 보존 → **화면 테스트 mock 팩토리 3곳 무변경** |
| `deviceAssetCapturedAt` | **1파일** (`DeviceRecordUploadSheet.tsx:179`) + mock 2사이트 | **보존** | `deviceAssetCapturedAt(asset)` — **`"./core"`**(순수 함수라 peer 0) | sed. 비네이티브 포크 불필요(순수) — 전신 `.web.ts`가 `null`을 반환하던 특수 케이스가 소멸한다 |

##### ⑩ `videoPoster.ts` (4)

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 근거 |
|---|---|---|---|---|
| `VIDEO_POSTER_CONTENT_TYPE` | 0 | **보존(개명)** | `POSTER_CONTENT_TYPE: 'image/jpeg'` — `"./core"` (§5.4.1-7) | presign contentType과 서버 검증이 맞물리므로 소비자가 읽을 수 있어야 한다 |
| `VIDEO_POSTER_TIME_MS` | 0 | **개명(옵션화)** | `posterAtMs` 기본값 1000 (§5.4.1-4) | 상수 노출 대신 설정 인자로 |
| `posterFileName` | 0 | **내부화** | core/upload 내부 (`${base}-poster.jpg`) | 앱 소스 사용처 0건 |
| `createWebVideoPosterBlob` | 0 (`uploadPhoto.ts:27`이 재export하나 임포터 0) | 개명 | `webCanvasVideoPoster().posterFromBinary({ source, atMs })` — `"./web"` (§5.6) | 앱의 재export 줄 **삭제**. 이벤트 타임아웃 3000ms·seek 상한은 §5.4.1-3·5 + §7.1 |

##### ⑪ `uploader.ts` — 타입 6

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `CameraCaptureMediaType` | **4파일** (`RecordCreatePhotoSection.tsx`, `RecordNativeLogbookMediaSheet.tsx`, `useRecordCreateForm.ts`, `app/records/[id].tsx`) — **타입과 값 둘 다** | **통합** | `MediaKind` (`'image' \| 'video'`) — `"./core"` | ⚠ **리터럴 값이 다르다**: `'photo'` → `'image'`. **확정: 앱 어댑터가 매핑을 흡수한다**(§5.7.6). `MediaKind`에 `'photo'` 별칭을 두지 않는다 — 라이브러리 어휘를 호스트 레거시에 맞추면 3자 소비자 전원이 그 부채를 물려받는다. 앱 래퍼 `captureAndUploadMedia`가 `'photo'→'image'`를 흡수하면 `recordCreate.test.tsx:867,1134`의 `toHaveBeenCalledWith({ captureType: 'photo' })` 값 단언이 그대로 통과한다 |
| `LocalUploadInput` | 0(타입) | 보존 | 동명 (§5.4) | **`contentHash?` 복원 필수**(§5.4-①) — `sync/uploadAsset.ts:47`의 재시도 해시 캐시 |
| `BlobImageUploadInput` | 0(타입) | 통합 | `BinaryUploads.uploadBinary` 입력 | **`fallbackExif` 필드 계승**(§5.4-②) |
| `BlobVideoUploadInput` | 0(타입) | 통합 | `BinaryUploads.uploadBinary` 입력 | `posterBlob`의 **3상태**(undefined=자동추출 / null=포스터 없음 / 값=주어진 포스터)를 `poster?: BinarySource \| null \| undefined`로 보존 |
| `PhotoUploader<T>` | 0(타입) | 개명 | `MediaKit<T>` + 팩토리 반환 인터페이스 7종 | — |
| `createPhotoUploader` | 0(외부, `kit.ts:22`) | 분할·개명 | `createMediaKit` / `createLocalUploads` / `createBinaryUploads` (§5.4/§5.5) | `kit.ts` 재작성 |

##### ⑫ `uploader.ts` — 팩토리 반환 메서드 13

| 메서드 | 실소비 | 판정 | 새 주소 | 이관 흡수 |
|---|---|---|---|---|
| `isDuplicateUploadAsset` | **1파일** (`app/records/[id].tsx:404`) + mock 1 | **폐지** | — | 대체: `UploadResult.duplicate`. §11.7-1이 이미 인지한 라우트 1곳 수정 |
| `uploadLocalUriToIntent` | **1파일** (`sync/uploadAsset.ts:57`, 이미 `{asset,duplicate}` 구조분해) | 개명 | `LocalUploads.uploadLocalFile` | 앱 래퍼가 `albumId→collectionId` 매핑 유지 → 무변경 |
| `uploadImageBlob` | **1파일** (`pendingPhotos.ts:133`) + mock 1 | **통합** | `BinaryUploads.uploadBinary` | 앱 래퍼가 `{blob,fileName,contentType,sizeBytes}` → `{source, …}` 재조립 |
| `uploadVideoBlob` | 0(외부) | **통합** | `BinaryUploads.uploadBinary` (kind 자동 분기) | 앱 래퍼 유지 |
| `uploadWebMediaFiles` | **2파일** (`useRecordCreateForm.ts:428`, `app/records/[id].tsx:439`) + mock 3 | 개명 | `BinaryUploads.uploadDropped` | 앱 래퍼가 `maxFiles` 전달. 기본 12(§5.4.1-2) |
| `uploadPickerAsset` | **1파일** (`pendingPhotos.ts:123`) + mock 3 | 개명 | `LocalUploads.uploadPickedAsset` (+ 웹 경로는 §5.7.4) | 앱 래퍼 |
| `uploadPickerMediaAsset` | **1파일** (`uploadDeviceAssets.ts:34`) + mock 2 | **통합** | `LocalUploads.uploadPickedAsset` (contentType으로 image/video 자동 분기) | 앱 래퍼가 두 이름을 같은 함수로 노출 → 호출부·mock 무변경 |
| `uploadDeviceLibraryAssets` | **0** (앱이 `uploadDeviceAssets.ts`로 자체 조합) | 개명 | `DeviceUploads.uploadDeviceAssets` (§5.4-⑤) | **앱은 계속 쓰지 않는다.** 이것이 `resolvePickedAsset`/`toPickedAsset`이 필요한 이유다 |
| `pickAndUploadPhoto` | **1파일** (`app/profile-edit.tsx:137` — **웹 게이트 없음**) + mock 2 | 개명 | `PickerFlows.pickAndUpload({ max: 1 })` | 앱 래퍼: `(await flows.pickAndUpload({max:1}))[0]?.asset ?? null`. **웹 경로는 §5.7.4** |
| `pickPhotos` | **1파일** (`NewRecordUploadModal.tsx:247`) + mock 2 | 개명 | `PickerFlows.pick` | 앱 래퍼. `max` 기본 12(§5.4.1-1) |
| `pickAndUploadPhotos` | 0 (mock 키 1) | **통합** | `PickerFlows.pickAndUpload({ kinds: ['image'] })` | — |
| `pickAndUploadMedia` | **2파일** (`useRecordCreateForm.ts:438`, `app/records/[id].tsx:450`) + mock 2 | **통합** | `PickerFlows.pickAndUpload({ kinds: ['image','video'] })` | 앱 래퍼가 kinds 바인딩 |
| `captureAndUploadMedia` | **2파일** (`useRecordCreateForm.ts:460`, `app/records/[id].tsx:471`) + mock 2 | 개명 | `PickerFlows.captureAndUpload` | 앱 래퍼가 `captureType:'photo'` → `kind:'image'` 매핑(⑪ 1행) |

##### ⑬ `saveImages.ts` (6) — G8 해소

| 심볼 | 실소비 | 판정 | 새 이름 · 주소 | 이관 흡수 |
|---|---|---|---|---|
| `SaveableImage` | **1파일**(`src/photos/saveImages.ts` — `withFreshImageUrls`가 `image.id`로 Map 구성) + 8개 호출부가 `ImageAssetDto`를 구조적으로 통과시킴 | 개명(+필드) | `SaveableMedia` **+ `id?`** (§5.4-⑥, §5.7.3) | 앱 어댑터에 `toSaveableMedia(dto)` 신설 |
| `SaveImagesResult` | 0(외부, 재export) | 개명 | `SaveResult` (§5.4) | sed |
| `imageDownloadUrl` | 0(런타임 외부) / 테스트 1 | **폐지 → 앱 잔류** | — | `originalUrl \|\| thumbnailUrl` 폴백은 **앱이 소유**. 대체 코드 §5.7.3 |
| `imageDownloadFileName` | 0(외부, 앱 프리픽스 래퍼) / 테스트 2 | 개명(+인자) | `mediaDownloadFileName(input)` **+ `index`** (§5.4-⑥) | 앱 래퍼 유지 |
| `imageBrowserDownloadUrl` | 0(외부, 앱 래퍼) / 테스트 1 | **내부화** | `BrowserSaveAdapter.saveByDownload` 내부(`download=1&filename=` 트릭 + iframe 폴백, §7.1) | 앱 래퍼·테스트 삭제 |
| `saveImagesToDevice` | **8파일** (`useAlbumImageMutations.ts`, `app/sync-images.tsx`, `app/records/[id].tsx`, `app/albums/[id]/images/[imageId]/records.tsx` + mock 4) | 개명 | `MediaSaver.saveToDevice` (§5.4-⑥) | `src/photos/saveImages.ts`가 `SaveTarget`을 고정 주입 → 호출부 8곳 무변경(§11.7-2) |

---

#### 5.7.3 저장 파일명 규칙 확정 (G8)

**문제**: 원본 `imageDownloadFileName`(saveImages.ts:71)의 규칙은 `` `${prefix}-${image.id || index + 1}.${safeExtension}` ``다. 초안의 `mediaDownloadFileName({url, fileName?, contentType?, prefix?})`는 `id`도 `index`도 받지 않아 **여러 장 저장 시 파일명이 전부 같아진다**(브라우저 다운로드는 `(1)` 접미사, MediaLibrary 경로는 캐시 파일 덮어쓰기).

**확정 1 — `SaveableMedia`에 `id?`를 넣는다.** (§5.4-⑥)
**확정 2 — `mediaDownloadFileName`이 `index: number`를 필수로 받는다.** (§5.4-⑥)
**확정 3 — `originalUrl || thumbnailUrl` 폴백은 앱에 남긴다.**

근거: `SaveableMedia`는 "이 URL을 내려받아라"라는 **하나의 진실**만 갖는다. 어느 URL을 고를지(원본/썸네일/포스터/태블릿)는 호스트 DTO 지식이며, 라이브러리가 `originalUrl`·`thumbnailUrl` 두 필드를 알면 memorylog2의 스키마가 공개 API에 새어 들어온다(§1 제약 3 — 호스트 이름 누출과 동종의 오염).

memorylog2 대체 코드 — `src/photos/saveImages.ts` (신설 ~10줄):

```ts
import { detectMediaContentType, type SaveableMedia } from '@gj-kit/expo-media';

export function toSaveableMedia(dto: ImageAssetDto): SaveableMedia {
  const contentType = detectMediaContentType(dto.contentType);   // string|null → MediaContentType|null
  return {
    id: dto.id,
    url: dto.originalUrl || dto.thumbnailUrl,                    // 전신 imageDownloadUrl
    ...(dto.fileName ? { fileName: dto.fileName } : {}),
    ...(contentType ? { contentType } : {}),
  };
}
```

> ⚠ `ImageAssetDto.contentType`은 `string | null`이고 `SaveableMedia.contentType`은 `MediaContentType | undefined`다. 어댑터가 `detectMediaContentType`으로 좁힌다 — 전신의 `contentType in MEDIA_FILE_EXTENSIONS` 검사와 **동치**다.

**영향**: `withFreshImageUrls`(앱 고유, `image.id`로 Map 구성)는 `SaveableMedia.id`가 있으므로 **그대로 동작**한다. §11.3의 `saveImages.ts` 난도는 '소' → **'중'**(어댑터 1개 신설 + 8콜사이트가 DTO를 직접 넘기던 것을 매핑 경유로 전환)으로 조정한다.

---

#### 5.7.4 웹 피커 자산 업로드 경로 확정 (G18)

**실측(V9-d)**: `app/profile-edit.tsx:137`의 `pickAndUploadPhoto()`에는 **플랫폼 게이트가 없다**. 웹에서 이 호출은 `uploader.ts:692-710`으로 들어가 `fetch(asset.uri)` → `Blob` → `inferContentType` → `inferFileName` → `uploadImageBlob({ fallbackExif: asset.exif })`를 탄다. (반면 `pendingPhotosFromPickerAssets` 경로는 `NewRecordUploadModal.tsx:256`·`RecordCreatePhotoSection.tsx:123`에서 `Platform.OS === 'web'` 게이트로 막혀 있어 웹 미도달이다.)

**확정 — 변환 책임은 `"./web"`의 명시 어댑터가 지고, 라우팅은 `createPickerFlows`가 한다.** 계약은 §3.3-⑤-b(`BinarySourceLoader`) · §5.4-③(`createPickerFlows`의 `web` 인자) · §5.6(`createFetchBinarySourceLoader`)에 있다.

**동작 규약** (§8.5 플랫폼 표에도 행이 있다):

| 표면 | native | web |
|---|---|---|
| `PickerFlows.pickAndUpload` / `captureAndUpload` | `LocalUploads.uploadPickedAsset`(로컬 URI 스트리밍) | `web.loader.fromUri(asset.uri)` → `web.uploads.uploadBinary({ source, fallbackExif: asset.exif })` |
| `LocalUploads.uploadPickedAsset` 직접 호출 | 정상 | `MediaError('platform-unsupported')` — 로컬 파일 전송은 웹에 없다 |

**전제 조건 2가지** (없으면 이 경로가 EXIF를 잃는다 — 둘 다 위에서 확정됨):

1. `BinaryUploads.uploadBinary`가 `fallbackExif?`를 받는다(§5.4-②).
2. `mediaMetadataFromJpeg(source, { fallbackExif, contentType })`의 인자 복원(§5.3) — 필드 단위 병합·비JPEG 스킵·예외 시 fallback 규칙 포함.

**이관**: `src/photos/adapters.ts`가 `createMediaKit(...).withPicker(expoPicker(), { web: { loader: createFetchBinarySourceLoader() } })`로 조립한다. `app/profile-edit.tsx`는 **무변경**. `"./web"`은 peer 0이므로 네이티브 번들에 실리는 비용은 fetch 래퍼 몇 줄뿐이다.

---

#### 5.7.5 `getAssetInfo` 승격과 `src/sync/` 총계 (G9)

**실측**: `src/sync/mediaScan.ts:38-49`가 `getDeviceAssetInfoForUpload(id)`를 호출해 `info.isNetworkAsset` → `info.localUri ?? info.uri`를 직접 판독한다. 주석은 "Hardened info lookup shared with the picker path: never starts a silent iCloud original download and gives up after a bounded wait"로 이것이 **하드닝 6의 공유 지점**임을 명시한다. `resolveForUpload`만 공개하면 스캐너는 자체 조회를 짜야 하고, 그 순간 15초 데드라인과 `shouldDownloadFromNetwork:false` 기본값이 스캔 경로에서 사라진다. → `DeviceLibrary.getAssetInfo`를 공개 표면으로 승격(§5.4-④). `DeviceAssetInfo`(§3.3)는 `localUri`·`uri`·`exif`·`isNetworkAsset`을 모두 가져 `mediaScan.ts`의 판독 3필드를 그대로 만족한다.

**`src/sync/` 5파일의 판정 (V9-c)**

| 파일 | 소비 심볼 | 판정 | 조건 |
|---|---|---|---|
| `src/sync/mediaScan.ts` | `getDeviceAssetInfoForUpload` | **0수정** | ✅ 위 승격이 전제. 승격하지 않으면 **전면 재작성 + 하드닝 6 유실** |
| `src/sync/uploadAsset.ts` | `uploadLocalUriToIntent`·`resolveDeviceAssetSourceForUpload`·`cleanupDeviceUploadCopy`·`extractPhotoMetadata`·`PhotoUploadError`·`hashLocalFile` | **0수정** | ✅ 단 `LocalUploadInput.contentHash`(§5.4-①) + `MediaKit.hasher`(§5.5) + `staging.cleanup` 어댑터가 **전부** 성립할 때만 |
| `src/sync/hashFile.ts` | `export * from "../photos/hashFile"` | **0수정** | — |
| `src/sync/syncStateMachine.ts` | `error instanceof PhotoUploadError` | **1줄 수정** | ⚠ `isMediaError(error)`로 교체 필수(`splitting:false` 사본 문제 — §5.2) |
| `src/sync/hashFile.test.ts` | `computeChunkRanges(size, chunkBytes)` 2인자 × 2케이스 | **2케이스 재작성** | ⚠ `chunkBytes` 공개 인자 제거(§6.1-⑩)의 직접 파급 |

> **정정**: `src/sync/mediaScan.ts`는 §5.4-④(d)의 정렬 계약과 **무관**하다 — 스캐너는 `MediaLibrary.getAssetsAsync`를 직접, **오름차순**(`mediaScan.ts:90` `sortBy: [[SortBy.creationTime, true]]`)으로 호출하며 `fetchDevicePhotoPage`를 쓰지 않는다(grep 0건). 내림차순 계약의 실제 의존자는 **그리드 UI와 그 `after` 커서 페이지네이션**이다.

→ **§11.6의 "동기화 엔진 0수정"은 성립하지 않는다.** 정정: **비테스트 1파일 1줄 + 테스트 1파일 2케이스**.

---

#### 5.7.6 §5.3·§5.4·§5.5·§5.6 델타 (이 절이 요구했고 위에서 반영 완료된 것)

| # | 대상 | 변경 | 반영 위치 |
|---|---|---|---|
| 1 | `"./core"` mediaTypes | `MEDIA_FILE_EXTENSIONS` · `ImageContentType` · `VideoContentType` · `detectImageContentType` · `inferImageContentType` · `isSupportedImageFile` · `isSupportedVideoFile` · `mediaFileName` **8종 추가** | §5.3 |
| 2 | `"./core"` debug | `MediaDebugLogger` 인터페이스 본문 명시 | §5.3 |
| 3 | `"./core"` brand | `Brand`가 **타입 전용 phantom property**임을 명시 | §5.3 |
| 4 | `"./core"` device | `deviceAssetCapturedAt` · `toPickedAsset` · `ResolvedPickedAsset` 추가 | §5.4-④ |
| 5 | `DeviceLibrary` | `getAssetInfo` · `resolvePickedAsset` · `ensurePermission` 추가, raw `requestPermission` 제거 | §5.4-④ |
| 6 | `SaveableMedia` | `id?: string \| undefined` 추가 | §5.4-⑥ |
| 7 | `mediaDownloadFileName` | `index: number` 필수 인자 추가 | §5.4-⑥ |
| 8 | `BinaryUploads.uploadBinary` | `fallbackExif?` · `poster?: BinarySource \| null \| undefined`(3상태) 추가 | §5.4-② |
| 9 | `LocalUploadInput` | `contentHash?: string \| undefined` 추가 | §5.4-① |
| 10 | `MediaKit` | `readonly hasher: HashAdapter` 공개 필드 추가 | §5.5 |
| 11 | `"./core"` adapters | `BinarySourceLoader` 인터페이스 추가 | §3.3-⑤-b |
| 12 | `"./web"` | `createFetchBinarySourceLoader` 추가 | §5.6 |
| 13 | `createPickerFlows` / `MediaKit.withPicker` | `web?: { uploads, loader }` 인자 추가 | §5.4-③ · §5.5 |
| 14 | `"./core"` types | `MediaTelemetry`를 `{track, begin}` 스팬 계약으로 · `MediaActivity` · `noopMediaTelemetry` · `MEDIA_OPERATIONS` | §5.1 |
| 15 | `MediaContentType` | `image/gif` 제거 → 전신·shared와 동일 8종 | §5.1 |
| 16 | `POSTER_CONTENT_TYPE` | 전신 `VIDEO_POSTER_CONTENT_TYPE`을 공개 상수로 계승 | §5.4.1-7 |
| 17 | `mediaFileName` | `now?: number` 주입구(결정론적 테스트) | §5.3 · §5.4.1-15 |

#### 5.7.7 판정 총계

§5.7.2의 데이터 행을 판정 컬럼으로 집계한 결과다. **행 수 = 심볼 수 = 94**(전신 배럴 12모듈 공개 심볼 81 + 팩토리 반환 메서드 13)이며, 합계도 94다 — 통합 판정을 받은 심볼도 각자 1행을 갖는다(합쳐지는 쪽 이름은 "새 주소" 칸에 공유로 표기).

| 판정 | 개수 | 비고 |
|---|---|---|
| 보존 | **28** | 보존 15 + 보존(개명) 7 + 보존(신설) 3 + 시그니처축소·승격·2번째진입점 각 1 |
| 개명 | **44** | 앱 어댑터 1줄 위임으로 호출부 무변경 |
| 통합 | **12** | 3→1(파일명), 2→1(피커 업로드), 4→1(피커 플로우) 등 — 12심볼이 5주소로 |
| 내부화 | **7** | `IMAGE_CONTENT_TYPES` · `VIDEO_CONTENT_TYPES` · `mediaContentTypeFromPath` · `imageContentTypeFromPath` · `isVideoContentType` · `posterFileName` · `imageBrowserDownloadUrl` — 전부 실소비 0 + 동치 공개 대체 존재 |
| 폐지 | **3** | `isDuplicateUploadAsset`(→`.duplicate`, 라우트 1곳) · `imageDownloadUrl`(→앱 `toSaveableMedia`) · `ensureDevicePhotoPermission`(→`(await ensurePermission()).granted`) |
| **합계** | **94** | = §5.7.2 데이터 행 수. 대응 없는 심볼 0건 |

**실소비 34개 심볼 중 대응 없음: 0건.** 폐지 3건은 전부 대체 코드를 위 표에 기재했다.

---

## 6. 검증 강제 지점

원칙: **조용히 깨지지 않는 것(즉시 크래시하거나 테스트가 반드시 잡는 것)에는 아무것도 걸지 않는다.**

### 6.1 채택표

| # | 후보 | 조용히 깨지는가 | 판정 | 비용 |
|---|---|---|---|---|
| ① | 어댑터 부분 구현 | **예** — `undefined is not a function`이 업로드 도중, 사용자 기기에서 | **타입** — 팩토리별 필수 인자(§3.1). 조건부 타입 0이라 V3 붕괴가 표현 불가 | 라이브러리 0(인터페이스를 required로 두기만), 소비자 0 |
| ② | poster objectName만 / sizeBytes만 | **예** — 서버가 반쪽 메타로 등록, 썸네일 영구 누락 | **타입** — `poster?: UploadedPoster` 쌍 객체(§5.1) | 0 (호스트는 통째로 전달) |
| ③ | `limits` 누락 | **예** — 2GB를 전부 PUT한 뒤 서버에서 413. 사용자 시간과 셀룰러 데이터를 통째로 버린다 | **타입** — `MediaUploadLimits \| 'server-enforced'` 필수. 무제한도 **명시된 결정**이어야 한다 | memorylog2 0(이미 둘 다 전달). 신규 소비자 1줄 |
| ④ | `getAssetInfo`의 `downloadFromNetwork` 어댑터 기본값 | **예** — iCloud 원본 무단 셀룰러 다운로드(전신이 겪은 사고) | **타입** — 어댑터 메서드의 **필수 인자**로 승격. 기본값 결정권이 어댑터에 없다 | 어댑터 구현 1줄 |
| ⑤ | 스테이징 사본 미정리 | **예** — 업로드한 모든 사진의 원본 사본이 앱 컨테이너에 영구 축적 | **타입** — `createDeviceLibrary`의 `staging` 필수 인자 + 객체 소유 cleanup(§5.3) | 0 (킷이 자동 공급) |
| ⑥ | 어댑터-엔트리 불일치(웹 포스터를 네이티브 자리에) | 예 | **타입, 무비용** — `LocalPosterAdapter`(uri) / `BinaryPosterAdapter`(BinarySource)는 입력 타입이 달라 브랜드·phantom 없이 분리된다 | 0 |
| ⑦ | save 의존성 조합 오류 | **예** — 원본은 `platformOS:'web'` + `mediaLibrary` 동시 주입이 통과하고 미주입은 `globalThis.document`로 폴백 | **타입** — `SaveTarget` 판별 유니언. `mode`가 `target.kind`에서 파생되므로 결과와 실동작이 어긋날 수 없다 | 이관 1파일 |
| ⑧ | `MediaStrings` 부분 객체 | **예** — 새 키가 조용히 영어로 노출 | **타입** — `Partial` 불가(§4) | 스프레드 사용자 0 |
| ⑨ | staging 네임스페이스 오설정 → 남의 파일 삭제 | **예** (치명) | **런타임 검증 + 객체 소유 cleanup** — `/^[a-z0-9][a-z0-9-]{1,30}$/` 위반 시 부팅 시 `config-invalid` | 0 |
| ⑩ | 해시 청크가 3의 배수가 아님 | **예** — 해시가 조용히 틀려 dedup이 오작동 | **공개 인자 제거** — `computeChunkRanges(size)`. 타입으로 표현 불가한 제약은 표현 가능성 자체를 없앤다 | 0 |
| ⑪ | `collectionId`가 빈 문자열 | **예** — falsy 스프레드로 탈락해 앨범 없이 저장 | **런타임 에러**(`config-invalid`) | 0 |
| ⑫ | 에러 코드 switch 누락 | 예 | **타입 제공, 강제 아님** — `assertNeverMediaError` export | 0 |
| ⑬ | 웹 전용 API를 네이티브에서 | 예 | **런타임 + 생성 차단** — `createBrowserSaveTarget`이 `document`/`fetch`를 필수 주입받아 네이티브에서 조용히 생성될 수 없다 | 0 |
| ⑭ | 네이티브 API를 웹에서 | 예 | **혼합** — 열거(`fetchPage`/`fetchAlbums`/`getPermission`)는 빈 결과(UI가 "이 플랫폼에선 사용 불가"를 그려야 하므로 throw는 과잉), resolve/upload는 `MediaError('platform-unsupported')`. 전신은 plain Error라 code 분기 불가였다 | 0 |
| ⑮ | `sizeBytes === 0` | 예 | **런타임**(전신 유지) | 0 |
| ⑯ | `api.completeUpload`가 duplicate 미반환 | **예** — 중복 취소 시 사용자의 예전 사진 삭제 | **타입** — `Promise<UploadResult<TAsset>>` 필수 | 0 |

### 6.2 기각표 — 과잉 typestate 선긋기

| 기각 대상 | 근거 |
|---|---|
| **capability 교차 타입** | V3 실측 붕괴. §0.4 기각 1 |
| **업로드 호출 순서 typestate** (`presigned → uploaded → completed`) | 세 단계가 한 함수 안에서 원자적으로 일어난다. 소비자가 순서를 틀릴 표면이 없다. 사고 이력 0 |
| **`CollectionId` 브랜드** | 라이브러리는 이 값을 해석하지 않는다(불투명 그룹 id). 호스트의 `albumId`도 이미 `string`이라 검출력 0인데 전 콜사이트에 래핑을 강요한다. 대신 빈 문자열만 런타임 차단(⑪). 원하는 소비자는 `TCollectionId` 제네릭에 자기 브랜드 타입을 꽂으면 된다 — 옵트인, 비용 0 |
| **`Uri`·`Bytes` 전면 브랜드** | 실측 콜사이트 40곳 + 어댑터 전 시그니처에 래핑이 번진다. 전신의 URI 사고는 "타입이 틀려서"가 아니라 "ph:// 스킴이 특수해서"였다 — 브랜드로 잡히지 않는 종류 |
| **`Milliseconds` 브랜드** | `millis(초)`가 통과해 실제 사고 모드를 하나도 막지 못한다. §0.4 기각 6 |
| **어댑터 빌더 체인** (`createAdapters().withPicker(...)`) | 객체 리터럴 + 필수 인자로 동일한 검증을 얻으면서 IDE 표시가 깨끗하다. (`MediaKit.with*`는 빌더가 아니다 — 자기 자신을 넓히지 않고 **다른 구체 킷**을 반환한다) |
| **`MediaContentType` 리터럴 브랜드** | 이미 닫힌 유니언이라 오타가 잡힌다. 추가 각인은 교차 시 붕괴 위험만 늘린다(toss-payments `brand.ts` 주석의 실측 사례) |
| **`config.video` 유무로 `kinds`의 허용 리터럴 분기** | GPF가 D-②로 제안했으나 자기 시그니처와 모순돼 구현 불가였고(심사 지적), 조건부 타입이 소비자 에러 메시지를 나쁘게 만든다. 대체: `poster` 미주입 상태에서 video를 업로드하면 포스터 없이 완료되며, 그 사실을 `telemetry`가 `poster.absent`로 보고한다. **포스터 실패가 업로드를 막지 않는다**는 전신 하드닝과 일관 |
| **contentType × adapter 조합 격자** | 조합 폭발 대비 이득 없음 |
| ~~**`telemetry` operation 이름 리터럴 유니언**~~ | **철회(§5.1).** "호스트가 자체 이름을 붙일 수 있어야 한다"는 전제가 틀렸다 — 이 인터페이스는 **라이브러리가 방출하는** operation만 다루고 그 목록은 6종으로 닫혀 있으며(§7.2 보존 계약), 호스트의 자체 operation은 자기 리포터로 직접 간다(memorylog2 `devicePhotoLibraryTelemetry.ts`가 실제로 그렇다). 좁히면 이름 오타가 컴파일 에러가 된다 |

### 6.3 타입 픽스처 (`tests/types/`)

```ts
// ① 팩토리 필수 인자 — staging 누락은 컴파일 에러 (하드닝 7 봉쇄)
// @ts-expect-error staging 누락
createDeviceLibrary({ adapter, files, platform });

// ② capability 붕괴 회귀 — 애노테이션해도 능력이 사라지지 않는다 (V3 재발 방지)
const adapter: DeviceLibraryAdapter = expoDeviceLibrary();
expectTypeOf(media.withDeviceLibrary(adapter).uploadDeviceAssets).toBeFunction();

// ③ limits 필수
// @ts-expect-error limits 누락
createMediaKit({ api });

// ④ strings 부분 객체 불가
// @ts-expect-error 22키 중 일부만
createMediaKit({ api, limits, strings: { fileNotFound: '없음' } });

// ⑤ poster 쌍 객체 — 한쪽만 불가
// @ts-expect-error sizeBytes 누락
const c: MediaUploadCompletion = { ...base, poster: { objectName: 'p.jpg' } };

// ⑥ downloadFromNetwork 필수 인자
// @ts-expect-error 두 번째 인자 누락
adapter.getAssetInfo('id');

// ⑦ 포스터 어댑터 오배치 — 입력 타입이 달라 자연 차단
// @ts-expect-error BinaryPosterAdapter는 LocalPosterAdapter가 아니다
createLocalUploads({ ...base, poster: webCanvasVideoPoster() });

// ⑧ SaveTarget 무효 조합 표현 불가
// @ts-expect-error browser 타깃에 library 주입 불가
createMediaSaver({ target: { kind: 'browser-download', browser, library } });

// ⑨ computeChunkRanges에 chunkBytes 전달 불가
// @ts-expect-error 인자 2개 불가
computeChunkRanges(1024, 100);

// ⑩ EOP 소비자 보호 — undefined를 흘려도 에러가 나지 않는다
const maybe: string | undefined = undefined;
createMediaKit({ api, limits, fileNamePrefix: maybe });   // OK여야 한다

// ── 이하 완결성 개정분 픽스처 (§5.7 델타에 1:1 대응) ──

// ⑪ 텔레메트리 operation 오타 차단 (§5.1)
// @ts-expect-error 'media.upload.natives'는 MediaOperation이 아니다
telemetry.track('media.upload.natives', {}, run);

// ⑫ MediaMetadata는 geoPoint다 — location은 없다 (§5.3, G5 환원의 회귀 방지)
expectTypeOf<MediaMetadata>().toHaveProperty('geoPoint');
// @ts-expect-error location 필드는 존재하지 않는다
const m: MediaMetadata = { location: { latitude: 1, longitude: 2 } };

// ⑬ 저장 파일명은 index가 필수 (§5.4-⑥, G8)
// @ts-expect-error index 누락
mediaDownloadFileName({ url: 'https://x/y' });

// ⑭ 호출자 제공 해시가 표현 가능하다 (§5.4-①, G2)
expectTypeOf<LocalUploadInput['contentHash']>().toEqualTypeOf<string | undefined>();

// ⑮ 피커 자산의 dedup 키가 컴파일된다 (§3.3-⑥, G3)
declare const picked: PickedAsset;
expectTypeOf(`asset:${picked.assetId ?? picked.uri}`).toBeString();

// ⑯ 기기 자산 → 피커 자산 재조립이 공개 경로로 가능하다 (§5.4-④, G4)
expectTypeOf(toPickedAsset).returns.toMatchTypeOf<PickedAsset & { staged: boolean }>();

// ⑰ raw requestPermission은 DeviceLibrary 공개 표면에 없다 (§5.4-④(c), G17)
// @ts-expect-error 합성 규칙을 우회하는 raw 요청은 골든패스에 없다
device.requestPermission();

// ⑱ gif는 유니언에 없다 (§5.1, G15)
// @ts-expect-error 'image/gif'는 MediaContentType이 아니다
const ct: MediaContentType = 'image/gif';

// ⑲ endCursor는 EOP 규약을 따른다 (§3.3, G20-14)
const page: DeviceAssetPage = { assets: [], hasNextPage: false, totalCount: 0 };  // OK여야 한다
```

---

## 7. 하드닝 보존 매핑

**난제 E의 11종 전부 + 원본 주석에 근거가 있는 추가 17종**(§7.1 — 초안 10행 + 개정 [신설] 7행). 정적으로 붙잡을 수 있는 것은 가드 테스트로 못 박는다 — 주석은 리팩터링을 이기지 못한다.

| # | 하드닝 (전신 위치) | 새 주소 | 보존 형태 | 그것을 지키는 테스트 |
|---|---|---|---|---|
| 1 | **iOS 26 URLSession 크래시** — `FileSystem.uploadAsync`(레거시 URLSession 브리지)가 파일 기반 업로드 시작 중 Expo Go를 종료. promise가 reject될 기회조차 없다 (`uploader.ts:134-156 uploadNativeFile`) | 계약: `LocalFileTransport.putLocalFile`의 TSDoc **"파일 바이트를 JS 힙으로 읽지 말 것"**(core/adapters.ts §3.3). 구현: `src/expo/transport.ts` — `new File(uri).upload(url, { sessionType:'foreground', uploadType: BINARY_CONTENT })`. **원본 주석 전문 이전** | ✅ `hardening-guard`: `src/**`에 `uploadAsync` 문자열 0건. unit: 페이크 fs가 `readBase64` 미호출임을 단언(= 바이트를 읽지 않았다는 직접 증거) |
| 2 | **PhotoKit ph:// 핸드오프** — iOS `localUri`가 Photos 컨테이너를 가리켜 stat은 되지만 네이티브 URLSession을 죽인다. 앱 캐시로 실체화 후 업로드. **iOS는 file:// 여도 반드시 카피**, 비-iOS만 직행 (`devicePhotoLibrary.ts:95-165`) | **정책은 core**: `src/core/device/resolveSource.ts` `normalizeUploadUri(asset, candidates, { platform, staging, files })` 순수 함수. ① 후보 순서 `localUri → uri → (resolvePickedAsset이면 asset.uri) → extraCandidates` ② **`ph://` 후보는 루프 첫 줄에서 `continue` — 복사 시도조차 하지 않는다**(`isUsableDeviceUri`, devicePhotoLibrary.ts:26-28·105). iOS에서 `asset.uri`가 정확히 `ph://`이므로 이 스킵이 없으면 매 업로드마다 `files.copy({from:'ph://…'})`라는 무의미한 네이티브 왕복이 발생하고, 후보가 `ph://` 하나뿐일 때는 **실패 종류 자체가 달라진다** ③ `isFileUri(uri) && platform.os !== 'ios'`만 직행 ④ 카피 실패 시 **다음 후보 진행**. I/O만 어댑터(`files.copy`/`files.stat`) | ✅ unit(페이크 fs) **5케이스**: ios + `ph://`(그 외 후보 있음) → copy 호출 / android + `file://` → copy 미호출 / **ios + `file://` → copy 호출**(전신 규칙) / 첫 후보 copy 실패 → 다음 후보 시도 / **`ph://` 단독 후보 → `files.copy` 호출 0회 + `device-not-found`**(신규 — ② 스킵 규칙의 유일한 직접 증거). **전신은 앱 jest 경유 간접 검증뿐이었다** |
| 3 | **Android fileSize 불일치** — `quality<1` 재인코딩 시 `asset.fileSize`가 원본 크기를 보고해 스토리지 수신 바이트와 어긋나 서버가 거절 (`uploader.ts:818-865`) | `src/core/upload/resolveSize.ts` `resolveUploadSize()` 순수 함수(우선순위 verified → file-system → reported). **필드명이 신뢰도를 표현**: `verifiedSizeBytes` / `reportedSizeBytes`. 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`와 `as ImagePicker.ImagePickerAsset` 캐스트 소멸. `FileStat` 판별 유니언이 `exists && !isDirectory` 5중복 제거 | ✅ unit: 3분기 각각 + 전부 부재 시 null + `source` 필드 단언. 타입: `UploadSizeSource` exhaustive `satisfies` |
| 4 | **웹 duration 초/밀리초 혼동** — expo-image-picker 웹이 `HTMLVideoElement.duration`(초)을 그대로 전달해 20분 영상이 1200ms로 저장되고 어떤 캡도 통과 (`uploader.ts:736-748`) | **core 단일 지점**: `src/core/upload/duration.ts` `normalizeDurationMs(raw, platform.os)`. `PickedAsset.durationRaw` 필드명 + TSDoc **"어댑터는 변환 금지"**로 이중 변환 차단 | ✅ unit: os='web' × 20 → 20000 / os='ios' × 20000 → 20000 / 0·음수·NaN → undefined. **어댑터 경계 분산 + 브랜드 방어는 기각**(§0.4 기각 6) |
| 5 | **Android 13+ 권한 granular 목록** — 목록 생략 시 매니페스트의 모든 권한이 대상이 되어, 거부된 READ_MEDIA_AUDIO가 유효한 사진·동영상 허용을 거부처럼 보이게 만든다(선택한 사진 모드 포함) (`mediaPermission.ts:11-14`) | `src/device/expo.ts` — `DEVICE_MEDIA_PERMISSIONS: GranularPermission[] = ['photo','video']` 상수 + `getPermissionsAsync(false, …)` / `requestPermissionsAsync(false, …)`. **원본 주석 전문 이전**. `DeviceLibraryAdapter.requestPermission()` TSDoc에 함정 경고 각인(커스텀 어댑터 구현자 보호). `accessPrivileges === 'limited'` → `limited` 매핑 보존 | ✅ `hardening-guard`: **읽기 경로**(`src/device/**`)의 `get/requestPermissionsAsync(` 호출에 granular 목록 인자 필수. ⚠ `src/save/**`의 `requestPermissionsAsync(true)`(writeOnly)는 목록 없음이 정상이므로 **명시 예외**(§0.4 기각 9) |
| 6 | **iCloud 원본 미다운로드 기본값** — 레거시 API는 `shouldDownloadFromNetwork`가 기본 true라 무단 셀룰러 전송을 시작. 기본 false + 전경 옵트인, **15s/60s 이중 타임아웃** (`devicePhotoLibrary.ts:15-16, 55-93, 293-316`) | 정책 전부 core: `src/core/device/resolveSource.ts` — `DEVICE_ASSET_INFO_TIMEOUT_MS=15_000`, `DEVICE_ASSET_NETWORK_DOWNLOAD_TIMEOUT_MS=60_000`, `isNetworkAsset && !downloadFromICloud → MediaError('device-icloud-only')`, `onICloudDownload(true/false)` **finally 보장**. 어댑터는 `getAssetInfo(id, { downloadFromNetwork })` 필수 인자만 — 기본값 결정권이 어댑터에 없다 | ✅ 타입: 인자 생략 → 컴파일 에러(§6.3-⑥). unit(가짜 타이머): 기본 false 전달 / `isNetworkAsset` + 옵트인 없음 → `device-icloud-only` / 옵트인 시 60s 타임아웃 → `device-timeout` / `onICloudDownload` true·false 쌍 호출 |
| 7 | **스테이징 카피 정리** — 누락 시 업로드한 모든 사진의 원본 사본이 앱 컨테이너에 영구 축적. 프리픽스 매칭으로 자기 파일만 삭제 (`deviceUploadCache.ts:8,25-34`, `uploader.ts:798-802,891-895`) | `src/core/staging.ts` `StagingCache` — `uriFor`(id 새니타이즈 + 확장자 정규화 보존) / `owns` / `cleanup`. 프리픽스는 `namespace`로 **설정 가능**(호스트 이름 누출 제거, 제약 5). **안전성 강화**: `includes(prefix)` → 3조건(캐시 디렉토리 시작 + 파일명이 prefix로 시작 + 하위 경로 없음). **cleanup은 캐시 객체 메서드** — 만든 주체가 지운다. `staging`은 `createDeviceLibrary` 필수 인자 | ✅ unit: 업로드 **성공·실패 양쪽**에서 cleanup 정확히 1회 / 다른 프리픽스·다른 디렉토리·prefix가 중간에 낀 경로 전부 no-op / `''`·`'-'`·`'a'`·**32자** 네임스페이스 → `config-invalid`(정규식 `{1,30}`은 총 2~31자를 허용하므로 31자는 **유효**하다 — 초안의 31자 기대는 오기였다). 타입: §6.3-① |
| 8 | **서명 URL 로그 유출 차단** — iOS URLSession 실패가 서명 URL 전문(임시 자격증명 포함)을 에코. URL→`[URL]` 치환 + 1000자 절단, URI는 shape만 로깅 (`debug.ts:10-34`) | `src/core/debug.ts` — `summarizeUri` / `sanitizeMediaErrorMessage` / `createMediaDebugLogger`. **`react-native`의 `Platform` import가 `PlatformAdapter` 주입으로 대체돼 core로 하강** — 전신에선 불가능했던 직접 단위 검증이 가능해진다. 로거 게이트 `platform.isDev && os !== 'web'` 보존 | ✅ `hardening-guard`: 로거 호출 인자에 `uri`/`url` 원문 전달 금지 — `summarizeUri(` 경유만. unit: 서명 URL 포함 메시지 / 다중 URL / 1000자 초과 / 비-Error throw 4케이스 |
| 9 | **base64 청크 3의 배수 정렬** — 3바이트 → 4 base64 문자. 3의 배수가 아니면 윈도우 경계에 패딩이 끼어 **해시가 조용히 틀린다**. `HASH_CHUNK_BYTES = 3*256*1024` (`hashFile.ts:9-11`) | `src/core/hashFile.ts` — 상수 고정 + **공개 `computeChunkRanges(size)`에서 `chunkBytes` 인자 제거**(전신은 기본 인자로 공개돼 있었다). base64 디코더(atob + 폴백)도 core로 | ✅ `hardening-guard`: `HASH_CHUNK_BYTES % 3 === 0`. unit: **node:crypto 대조 13종 크기**(0·1·55·56·63·64·65·127·128·1000·768KB·768KB+7·3MB+13, 단발·청크 병행). 타입: §6.3-⑨ |
| 10 | **혼합 드롭 부분 업로드 방지** — 미지원 파일 필터링이 부분 업로드를 허용해 사용자가 결과를 알 수 없고 거절된 파일을 고칠 수도 없었다. **첫 presign 이전에 배치 전체 검증** (`uploader.ts:626-635`) | `src/core/upload/webBatch.ts` `assertAllSupportedMedia(files, strings)` — `uploadDropped`의 첫 문장. `isSupportedMediaFile`이 `{ name, type }` 구조 타입을 받아 core DOM lib 0 유지 | ✅ unit: 3개 중 1개 미지원 → `unsupported-file-type` throw + **`createUploadIntent` 호출 0회**(recording transport로 단언 — 부분 업로드 부재의 직접 증거) |
| 11 | **EXIF 로컬 타임존 해석** — EXIF DateTime엔 타임존이 없다. **기기 로컬 벽시계**로 해석해야 MediaLibrary `creationTime` 경로와 같은 날짜에 묶인다(12:30 KST 촬영이 경로에 따라 9시간 어긋나지 않게) (`photoMetadata.ts:90-114`) | `src/core/metadata.ts` `capturedAtFromExif()` — **로직·주석 원문 그대로**("왜 가장 덜 나쁜 선택인지" 포함). GPS 도분초·유리수·부호(S·W), `validGeoPoint` 범위 검증·소수 6자리 반올림, JPEG APP1 TIFF 파서(IFD 순환 방지 `visitedOffsets`, `isReadable` 경계 검사), **"빈 객체 반환 금지"** 규칙 전부 보존. `Blob` → `BinarySource` 교체로 DOM lib 없이 | ✅ unit: `TZ=Asia/Seoul`·`TZ=UTC` 두 실행에서 `"2024:01:02 03:04:05"` → 각각 기기 로컬 해석 ISO / GPS 3형식 × Ref 부호 / 유효값 없으면 `undefined`. 전신 `photoMetadata.test.ts` 전량 이식 |

### 7.1 추가 보존 (11종 외 — 원본 주석에 근거가 있는 결정. 유실 시 동일하게 실격)

| 항목 | 새 주소 | 지키는 것 |
|---|---|---|
| iOS 피커 원본 fast path 고정 조합(`quality:1` + `exif:true` + `allowsEditing:false` + `preferredAssetRepresentationMode: Current`)과 "단일선택/다중선택이 달라지면 안 된다" | `src/picker/expo.ts` 내부 상수 + `PickerAdapter.pickFromLibrary` 계약 TSDoc | 상수 스냅샷 unit |
| 그리드에서 자산별 `getAssetInfoAsync` 호출 금지(60장 직렬 ≈ 페이지당 20초) | `DeviceLibraryAdapter.listAssets` TSDoc + `src/device/expo.ts` 구현 주석 | `hardening-guard`: `listAssets` 구현부에 `getAssetInfo` 호출 0건 |
| 기기 자산 업로드 루프의 **의도적 순차 실행** | `DeviceUploads.uploadDeviceAssets` TSDoc + 구현 | unit: 동시 진행 0(전송 시작/종료 타임라인 단언) |
| dedup 해시 실패가 업로드를 막지 않는다(해시는 최적화일 뿐) | `src/core/upload/uploader.ts` `hashSafely()` | unit: hasher가 throw해도 업로드 성공 |
| **[신설] 호출자 제공 `contentHash` 우선 — 있으면 hasher를 호출하지 않는다** (`uploader.ts:57-69,440` · 소비자 `src/sync/uploadAsset.ts:47`) | `src/core/upload/uploader.ts` | unit: `contentHash` 주입 시 hasher 호출 **0회** + completion의 `contentHash`가 주입값과 동일 / 미주입 시 hasher 1회. ⚠ 바로 윗 행과 **나란히** 읽어야 한다 — 한쪽만 보면 정반대 구현이 나온다 |
| 포스터 실패가 동영상 업로드를 막지 않는다 | `src/core/upload/uploader.ts` — poster try/catch → null | unit: poster가 null·throw 둘 다 완료됨 + `poster` 필드 부재 |
| **[개정] 정보 조회 실패 2조건**: ① **core가 만든 `device-timeout`만** 폴백 후보 유무와 무관하게 재throw ② host adapter의 raw/위조-brand 오류와 성공 응답의 getter 실패는 후보가 있으면 생존, 없으면 URL 없는 `device-library-failed`로 정규화 | `src/core/device/resolveSource.ts` | unit: adapter 오류+후보 있음 → 생존해 업로드 성공 / 후보 없음 → `device-library-failed` / core deadline+후보 있음 → `device-timeout` 재throw / 성공 응답 getter·EXIF getter가 원본 오류를 공개하지 않음. ⚠ ①이 없으면 유일하게 타입화되는 정보-조회 실패(15초 타임아웃)가 후보에 삼켜져 하드닝 6이 조용히 무력화된다. EXIF는 선택 메타데이터이므로 안전하게 snapshot할 수 없으면 버리되 URI 해석은 계속한다. |
| **[신설] `mediaMetadataFromJpeg` 4규칙**: 비-JPEG 스킵 → fallback / **필드 단위** 병합 / 예외 시 fallback / 유효값 없으면 undefined (`photoMetadata.ts:265-290`) | `src/core/metadata.ts` (§5.3) | unit 4케이스: 비-JPEG contentType → 파서 미호출 + fallback 그대로 / 파싱 성공 + fallback 있음 → `capturedAt`은 파싱값·`geoPoint`는 fallback값(**필드 단위 병합의 직접 증거**) / 손상 JPEG → 예외 없이 fallback / 양쪽 다 빈 값 → `undefined` |
| **[신설] 권한 합성 게이트**: 조회 → `!granted && canAskAgain`일 때만 요청 + `accessPrivileges==='limited'` 매핑 (`mediaPermission.ts:22-38`) | `src/core/device/index.ts` `ensurePermission()` — **core 소관**, 어댑터는 순수 위임(§5.4-④(c)) | unit 4케이스: `granted:true` → 요청 0회 / `granted:false, canAskAgain:true` → 요청 1회 + 요청 결과 반환 / **`granted:false, canAskAgain:false` → 요청 0회**(핵심 — iOS UI 데드록 차단) / 어댑터 `limited:true` → 그대로 통과. 전신 `mediaPermission.test.ts`(60줄 2케이스)를 이 4종으로 흡수 이식 |
| **[신설] `listAssets` creationTime 내림차순 계약 / `listAlbums`는 core가 `count>0` 필터 + count 내림차순 재수행** (`devicePhotoLibrary.ts:220,243-250`) | `DeviceLibraryAdapter` TSDoc(§3.3) + `src/core/device/index.ts` | `hardening-guard` ⑦: `src/device/expo.ts`의 `listAssets` 구현부에 `SortBy.creationTime` + `false` 리터럴 필수(정적 스캔). unit 2케이스: 페이크 어댑터가 count 0 앨범과 뒤섞인 순서를 줘도 `fetchAlbums()`는 count>0만 내림차순 / `fetchPage()`는 어댑터 순서를 **변형 없이** 통과(재정렬 부재의 직접 증거) |
| **[신설] 웹 포스터 이벤트 타임아웃 3000ms + seek 상한 `min(atMs/1000, duration − 0.05)`** (`videoPoster.ts:6,57-62`) | `src/web/poster.ts` (고정 상수·고정 규칙 — §5.4.1-3·5) | unit(jsdom): 이벤트 미발화 → 3s 후 `null` 반환(업로드는 계속) / `duration=0.5s` 영상 → seek 시각 ≤ 0.45 |
| **[신설] `resolvePickedAsset`은 후보에 `asset.uri`를 자동 삽입한다** (`devicePhotoLibrary.ts:355-359`) | `src/core/device/index.ts` (§5.4-④) | unit: 정보 조회 실패 + 자동 후보만으로 업로드 성공 — 전신 주석 "picker keeps the original asset.uri"(287-288)가 가리키는 정확한 경로 |
| **[신설] `"."`의 `localTransport`를 web/SSR에서 쓰지 않는다** — `expo-file-system` web 셰이프의 `FileSystemUploadTask.start()`는 `{body:'',status:0,headers:{}}` no-op이라 **조용히 성공한 것처럼 보인다**(V-B 실측) | 비네이티브 포크는 `createFetchBinaryTransport` 경유가 정본(§8.5) | `hardening-guard` ⑥: `src/web/**`·비네이티브 포크에 `.upload(` 0건 |
| 웹 저장의 `download=1&filename=` 리다이렉트 트릭 + **CORS 실패 시 숨김 iframe 폴백**(앱 화면 교체 방지, 60초 후 제거) (`saveImages.ts:150,190-197`) | `src/save/web.ts` (`browser` 포크) | unit(jsdom): anchor 경로 + fetch 실패 시 iframe 생성·60s 후 제거 |
| 다운로드 status **2xx 범위** 검증 + 실패 시 임시 파일 정리 (`saveImages.ts:214-225`) | `src/core/save/index.ts` 정책 | unit: 3xx/4xx → `save-download-failed` + `files.remove` 호출 |
| 저장 파일명 우선순위(저장된 fileName → contentType → URL 확장자 → jpg, **5자 초과 확장자 거부**) — 토큰 프록시 URL엔 확장자가 없다 | `src/core/save/fileName.ts` `mediaDownloadFileName()` | unit: 4분기 + 긴 확장자 거부 |
| Android Expo Go 권한 요청 스킵 (`saveImages.ts:96`) | `MediaLibrarySaveAdapter.skipPermissionRequest` — expo-constants 의존을 인자로 승격 | unit: true면 `requestWritePermission` 미호출 |

### 7.2 안정적 텔레메트리 operation 6종 (보존 항목)

아래 이름과 payload 키는 **소비자 대시보드·알림 규칙의 입력**이므로 rename = 파괴적 변경이다. 하드닝과 동급으로 보존한다.

| operation | 종류 | 시작 payload | 종료 payload | 전신 |
|---|---|---|---|---|
| `media.upload.native` | `track` | `{contentType, sizeBucket, hasPoster}` | — | uploader.ts:340-346 |
| `media.upload.web-image` | `track` | `{contentType, sizeBucket}` | — | uploader.ts:473-479 |
| `media.upload.web-video` | `track` | `{contentType, sizeBucket}` | — | uploader.ts:534-540 |
| `media.upload.poster.web` | `begin` | `{sizeBucket}` | `succeed()` / `fail(error)` | uploader.ts:222-244 |
| `media.upload.poster.native` | `begin` | — | `succeed({extra:{sizeBucket}})` / `fail(error)` / **`cancel({extra:{reason:'empty-poster'}})`** | uploader.ts:254-302 |
| `media.save-to-device` | `track` | `{imageCount, mode}` (`mode`: `'browser-download' \| 'media-library'`) | — | saveImages.ts:277-283 |

**`sizeBucket`도 계약이다**: `under-1mb` / `1-10mb` / `10-100mb` / `over-100mb`(uploader.ts:127-132). 버킷 경계를 바꾸면 과거 로그와 비교 불가능해진다.

**unit 3종**
1. `expect(MEDIA_OPERATIONS).toEqual([...6개 문자열 리터럴...])` — **스냅샷이 아니라 인라인 리터럴 배열 단언**(스냅샷은 `-u`로 조용히 갱신된다).
   ⚠ **배열 순서의 정본은 §5.1 코드블록**이다(`native` → `web-image` → `web-video` → `poster.native` → `poster.web` → `save-to-device`).
   위 표는 `begin` 계열을 전신 소스 등장 순으로 묶어 읽기 좋게 나열한 것이라 poster 두 행의 순서가 배열과 다르다 — 이 단언을 표 순서로 쓰면 실패한다.
2. 전 파이프라인(로컬·웹이미지·웹비디오·포스터×2·저장)을 페이크 텔레메트리로 돌려 **수집된 operation 집합이 `MEDIA_OPERATIONS`와 정확히 일치**함을 단언 — 이름 오타와 호출 누락을 동시에 잡는다.
3. 빈 포스터 경로 → `cancel` 1회 + `succeed`/`fail` 0회, `reason:'empty-poster'` 포함.

---

## 8. 플랫폼 포크 × tsup 빌드 해법

### 8.1 문제

전신 `devicePhotoLibrary.web.ts`(48줄)는 `tsc`가 파일 구조를 보존해 `dist/devicePhotoLibrary.web.js`를 만들고, Metro가 `import "./devicePhotoLibrary"`(확장자 없음)를 web 플랫폼에서 `.web.js`로 해석하는 데 의존한다. gj-kit은 tsup(esbuild 번들러)을 쓴다. **빌더를 바꾸는 순간 이 포크는 조용히 죽고**, README의 "웹 번들에 expo-media-library가 포함되지 않습니다"가 거짓이 된다.

### 8.2 실측 (V1 — memorylog2의 실제 `metro-resolver` 0.84.4를 직접 구동)

| 케이스 | web | ios/android |
|---|---|---|
| A. dist 내부 상대 import, **확장자 없음** (`./device`) | `device.web.js` ✅ | `device.js` ✅ |
| B. dist 내부 상대 import, **확장자 있음** (`./device.js`, `./chunk-AAA.js`) | `device.js` ❌ (`.web.js`가 있어도 무시) | `device.js` |
| C. exports 서브패스, **평문 문자열 타깃** | `plain.js` ❌ (플랫폼 확장자 미적용) | `plain.js` |
| D. exports 서브패스, **`browser` 조건** | `device.web.js` / `.web.cjs` ✅ | `device.js` / `.cjs` ✅ |
| E. D를 jest 조건(`['require','react-native']`)으로 | — | `device.cjs` ✅ |
| F. bare `"react-native"` 키를 최상단에 추가 | `device.web.*` ✅ | **`device.js`(ESM)를 CJS 컨텍스트에 전달** ❌ |

소스 근거: `resolve.js`의 `resolveSourceFile()`은 **먼저 확장자 없는 정확 경로를 platform 없이** 시도하고(`resolveSourceFileForAllExts(context, "")`), 실패했을 때만 `sourceExts` 루프에서 `.${platform}${ext}`를 시도한다 → 케이스 B. `PackageExportsResolve.js`는 target을 join한 뒤 `fileSystemLookup(filePath)`를 **한 번**만 한다(확장자 탐색 루프 없음) → 케이스 C.

tsup 산출물 실측: `splitting:true`면 `index.js`가 `./chunk-Q6ELE5FT.js`를 import(**확장자 있음** → 케이스 B)하고 `device.web.js`는 아무도 참조하지 않는 고아가 된다. `bundle:false`면 확장자 없이 보존(케이스 A)되지만 Node ESM에서 `ERR_MODULE_NOT_FOUND`.

**케이스 G·H (V-B — resolver 단위 테스트가 놓친 것을 실제 `expo export` 산출물로 확정)**

| 케이스 | 조건 집합 | 결과 |
|---|---|---|
| G. `expo export --platform web` (`web.output:"single"`, 클라이언트) | `{default, import, browser}` | `device.web.js`/`save.web.js` ✅ · 번들 내 `expo-media-library` **0건** |
| H. `expo export --platform web` (`web.output:"static"\|"server"`, **SSR/프리렌더 번들**) | `{default, import, node}` — **`browser`가 없다** | `device.js`/`save.js`(네이티브) ❌ · peer 미설치 시 `Unable to resolve module expo-media-library/legacy`로 **빌드 실패**, 설치 시엔 SSR HTML만 네이티브 포크가 되어 **하이드레이션 불일치** |

소스 근거: `@expo/metro-config/build/ExpoMetroConfig.js:220`이 `unstable_conditionsByPlatform.web = ['browser']`를 설정하지만(주석: "This is removed for server platforms"), `@expo/cli/build/src/start/server/metro/withMetroMultiPlatform.js:614`가 서버 환경에서 `context.unstable_conditionsByPlatform = {}`로 **비우고** `:659`에서 `unstable_conditionNames = ['node']`(RSC면 `:653` `['node','react-server','workerd']`)로 교체한다. 조건 집합은 `metro-resolver/src/utils/matchSubpathFromExportsLike.js:16-23`에서 `{"default", import|require, ...conditionNames, ...conditionsByPlatform[platform]}`로 합성되므로 **서버 번들에는 `browser`가 들어갈 수 없다.**

**케이스 H의 해법과 그 검증**: `./device`·`./save`에 `"node"` 브랜치(비네이티브 포크)를 추가하니 동일 명령에서 클라이언트 번들과 SSR 프리렌더 HTML이 **둘 다** 비네이티브 포크로 수렴했고, `--platform ios`는 네이티브 포크를 그대로 받았다(3/3). `node` 추가가 네이티브를 오염시키지 않는 이유도 실측했다 — `@react-native/jest-preset/jest/react-native-env.js`가 `customExportConditions = ['require','react-native']`로 고정하고(`jest-expo@56`이 `customExportConditions`를 덮어쓰는 곳은 **RSC 프리셋뿐**), Metro 네이티브 클라이언트는 `unstable_conditionNames: []` + `conditionsByPlatform.ios = ['react-native']`라 어느 쪽에도 `node`가 없다.

> **memorylog2의 현재 노출도**: `web.output` 기본값은 `'single'`(`@expo/config-types/build/ExpoConfig.d.ts:635`)이고 `apps/mobile/app.config.ts`에 `output` 미지정이므로 **지금은 SSR 번들이 생기지 않는다** — 이관 자체는 무해하다. 그러나 앱이 SEO를 위해 `static`으로 바꾸는 순간 깨지므로, 라이브러리가 지금 막아둔다.

**검증 픽스처**: `scratchpad/vb/webfx/`(§2.3 exports 맵을 복제한 스텁 라이브러리 + 실제 Expo SDK 56 앱). `expo@56.0.16` / `@expo/metro@56.0.0` / `metro-resolver@0.84.4` / `react-native@0.85.3` / `react-native-web@0.21.2`. 이 픽스처를 `tests/fixtures/web-export/`로 이관해 CI에 상시화한다(§10.3 `web-export-guard`).

### 8.3 안별 판정

| 안 | 동작 | 판정 |
|---|---|---|
| 다중 엔트리만 (조건 없이) | 케이스 B — `.web.js`가 고아가 된다 | **기각** |
| `bundle: false` | 케이스 A로 Metro에선 작동. 그러나 `type:"module"` 패키지의 ESM 산출물이 Node ESM 규격 위반(확장자 필수) → Node·vitest·Vite에서 즉사. 트리셰이킹 상실, dist에 20+ 파일 노출 | **기각** |
| 서브패스 분리만 (평문 타깃) | 케이스 C가 반증 — web에서도 네이티브가 온다 | **기각**(조건과 병용 시에만 유효) |
| `Platform.OS` 런타임 분기 | `import * as MediaLibrary`가 모듈 그래프에 남아 web 번들에 expo-media-library가 들어온다. 포크의 존재 이유를 정면 부정 | **기각** |
| 포크를 소비 앱 소스로 이전 | V7 실측 — tsc에 플랫폼 확장자 해석이 없고 `moduleSuffixes`도 없어 타입 이득이 발화하지 않는다. 플랫폼 지식만 소비자에게 전가 | **기각** |
| **엔트리 다중화 + exports `browser` 조건 포크** | 케이스 D·E — 7/7 정확. 플랫폼 확장자에 의존하지 않아 Metro 내부 구현에 결합되지 않으며, `browser`는 webpack·vite·esbuild 표준 조건이라 웹 전용 소비자도 자동 혜택 | **채택** |

### 8.4 채택안의 파생 규칙

1. **bare `"react-native"` 키 금지** (케이스 F). `default`/`import`/`require`만 쓴다. Metro 네이티브는 `import`, jest는 `require`로 정확히 떨어진다.
2. **`node`와 `browser`가 `import`/`require`보다 위.** 조건은 선언 순서 첫 매치가 이긴다. 둘 사이의 순서는 무관하다(서로 배타적 — `browser`는 클라이언트 번들러, `node`는 서버/Node 런타임에서만 켜진다). **둘 중 하나라도 빠지면 케이스 H가 재발한다.**
3. **모든 조건 브랜치에 `types`, 양 포크는 같은 `.d.ts`.** Expo의 `tsconfig.base`가 `customConditions: ["react-native"]`를 설정하므로(V7) 브랜치 누락 시 타입 해석이 새고, CJS TS 소비자는 `d.cts`가 없으면 `TS1479`를 받는다. **`node` 브랜치에도 동일 적용** — 누락하면 SSR 코드에서 타입이 끊긴다. 이 규칙의 파생으로 **비네이티브 포크는 DOM 타입을 공개 시그니처에 노출할 수 없다**(§2.4 파생 규칙).
4. **CJS 빌드는 이관의 필수 조건.** jest는 CJS이므로 `require` 조건이 `.cjs`를 주지 못하면 ESM dist를 파싱하다 실패한다(node_modules는 `transformIgnorePatterns` 대상).
5. **`.web.ts` 파일명 규약 폐지.** 파일명은 `src/device/{expo,web}.ts`이고 tsup 엔트리 `src/device.ts`/`src/device.web.ts`가 각각 배럴이다. 포크 라우팅은 exports 맵 한 곳에만 존재한다 — 두 진실 금지.
6. **`splitting: false`** — 케이스 B 재발 방지 + dist-peer-graph 검사 단순화.
7. **dist 파일명의 `.web.`은 "브라우저 전용"이 아니라 "비네이티브"를 뜻한다.** 같은 산출물이 `browser`(브라우저 번들)와 `node`(SSR·RSC·Node 스크립트) 양쪽에 매핑된다. TSDoc·README에서 "웹 포크"라는 표현을 **"비네이티브 포크"**로 통일하고, `platform-unsupported` 에러 메시지의 TSDoc에 SSR도 포함됨을 적는다.

### 8.5 비네이티브 포크(`browser` + `node`)의 동작 규약

| 표면 | 비네이티브 포크 동작 | 근거 |
|---|---|---|
| `getPermission` / `ensurePermission` | `{ granted: false, canAskAgain: false, limited: false }` | UI가 "이 플랫폼에선 사용 불가"를 그릴 수 있어야 하므로 throw는 과잉 |
| `fetchPage` / `fetchAlbums` | 빈 페이지 / 빈 배열 | 동일. **SSR 프리렌더에서도 같은 값이 나오므로 하이드레이션이 일치한다**(케이스 H 해소의 부수 효과) |
| `getAssetInfo` / `resolveForUpload` / `resolvePickedAsset` | `MediaError('platform-unsupported')` | 전신은 plain `Error("Device photo library is not available on web.")`라 code 분기 불가였다 — 개선점 |
| `"./save"` 비네이티브 포크 | MediaLibrary import 0. `createBrowserSaveTarget` 기반 구현이 정본 — 전신 `saveImages.ts`의 `Platform.OS === 'web'` 분기가 **구조적으로 소멸**한다. **단 SSR에는 `document`가 없다** — `createBrowserSaveTarget({document, fetch})`가 주입식인 이유이며, SSR 경로에서 저장을 호출하면 `platform-unsupported`를 던진다 | §6.1-⑬ |
| **`"."`의 `localTransport` (web/SSR)** | **`File.upload()`를 쓰지 않는다.** `expo-file-system`의 web 셰이프(`ExpoFileSystem.web.ts`)에는 `upload`가 없고 `FileSystemUploadTask.start()`가 `{body:'', status:0, headers:{}}`를 반환하는 **no-op**다 → 태우면 조용히 성공한 것처럼 보인다. web 바이너리 업로드의 정본은 `createFetchBinaryTransport`(`"./web"`)뿐 | V-B 실측 · §7.1 마지막 행 |
| `PickerFlows.pickAndUpload` / `captureAndUpload` (web) | `web.loader.fromUri(asset.uri)` → `web.uploads.uploadBinary({ source, fallbackExif })`. `web` 미주입 시 `platform-unsupported` | §5.7.4 |

---

## 9. SHA-256 무의존 전략

**결정: 순수 TS 증분 SHA-256을 core에 내장하고, `HashAdapter` 교체 슬롯을 함께 남긴다.**

| 선택지 | 판정 |
|---|---|
| `js-sha256` 런타임 의존 유지 | **기각** — CLAUDE.md의 "런타임 의존성 0" 위반 |
| `expo-crypto` 위임 | **기각** — 증분 API가 없어 15MB 파일을 통째로 메모리에 올려야 한다. 전신 `hashFile.ts:1-4` 주석이 명시한 설계 이유("peak memory bounded")를 정면으로 훼손 |
| **순수 TS 내장 + 어댑터 슬롯** | **채택** |

- **정확성**: `node:crypto` 대조 13종 크기(0·1·55·56·63·64·65·127·128·1000·768KB·768KB+7·3MB+13)를 단발·768KB 청크 분할 양쪽으로 검증한다. 경계값(55/56 = 패딩 경계, 63/64/65 = 블록 경계)이 핵심.
- **성능 기준선**: 전신이 쓰던 `js-sha256`도 **순수 JS**다. 따라서 "네이티브 → JS" 회귀가 아니라 "JS → JS" 교체이며, 남는 위험은 구현 품질 차이(js-sha256은 언롤링 최적화)뿐이다. `HASH_CHUNK_BYTES`가 768KB이므로 15MB = 20청크 × (base64 디코드 + 해시).
- **탈출구**: `HashAdapter`(`hashLocalFile`/`hashBinary`) 슬롯. 성능이 문제가 되면 호스트가 `react-native-quick-crypto` 등으로 갈아끼운다. 기본값이 이미 동작하므로 골든패스는 그대로다.
- **해시 실패는 업로드를 막지 않는다** — dedup은 최적화일 뿐이라는 전신 규칙 보존(§7.1).
- **미검증**: Hermes 실기기 성능. §12-3 잔존 리스크로 이관하고, 이관 순서 7단계(§11.5)의 실기 체크리스트에 넣는다.

---

## 10. 테스트 3계층 계획

### 10.1 unit (`pnpm test`)

vitest. **expo·react-native 모킹 0** — `"./testing"`의 인메모리 어댑터만으로 전 파이프라인(pick → stat → hash → intent → PUT → complete → cleanup)을 돈다. 코어는 DOM 무관이므로 기본 환경은 node이고, `src/web/**` 테스트만 jsdom 프로젝트로 분리한다.

커버리지 대상: §7 표의 "지키는 테스트" 열 전부 + 순수 로직(mediaTypes 테이블, EXIF 파서, SHA-256 대조, `computeChunkRanges`, duration 정규화, 크기 결정 3분기, staging 판정, redaction, 저장 파일명 4분기).

### 10.2 type (`pnpm test:types`)

`tests/types/*.test-d.ts` — §6.3 픽스처 전부를 `expectTypeOf` + `@ts-expect-error`로 고정. 특히 ②(capability 붕괴 회귀)는 V3가 실측한 사고 모드의 재발 방지 픽스처다.

### 10.3 가드 테스트 (unit 계층, 정적 소스·dist 스캔)

| 가드 | 규칙 | 근거 |
|---|---|---|
| `entry-guard` | `src/core/**`에 `react`·`react-native`·`expo-`·`document`·`window` 문자열 0건 | §1-1 |
| **`nodom-source-guard`** | `tsc --noEmit -p tsconfig.core.json`(`lib:["ES2022"]`, `src/web` 제외). 실측상 **tsup은 코어의 DOM 유출을 전혀 잡지 못하고 `dist/core.d.ts`에 그대로 방출한다** | §2.4 |
| **`nodom-dist-guard`** | `tests/guards/tsconfig.nodom.json`(`lib:["ES2022"]` + **`skipLibCheck:false`**)으로 `./web`을 제외한 **공개 서브패스 7개**의 `.d.ts`를 실제 컴파일. `skipLibCheck:true`면 d.ts 내부 TS2304가 억제되어 가드가 무력해진다 | §2.4 |
| `dist-peer-graph` | 빌드 산출물에서 엔트리별 외부 specifier 집합을 재귀 추출해 **§2.2 표와 정확히 대조**. **조건 3세트 × 모듈 2형식** = `browser`/`node`/네이티브(`react-native`) × ESM(`.js`)·CJS(`.cjs`). `browser`·`node` 세트에서 `./device`·`./save`의 외부 specifier는 **공집합**이어야 한다 | §3.2 · §8.2 케이스 H. V4로 기법 검증 완료. 기존 ESM/CJS 2세트만으로는 SSR 누수를 못 잡는다 |
| **`web-export-guard`** | `tests/fixtures/web-export/`의 스텁 앱을 `expo export --platform web`으로 `output:"single"`과 `output:"static"` **양쪽** 실행해, 클라이언트 번들과 SSR HTML **모두**에 `expo-media-library` 문자열이 0건인지 확인 | §8.2 케이스 G·H. V-B에서 픽스처·절차 확립 완료 |
| `test-purity-guard` | `tests/unit/**`에 `expo-`·`react-native` import 0건 | 목표 (a)가 문서 주장이 아님을 보장 |
| `string-guard` | `new MediaError(`의 두 번째 인자가 `strings.` 멤버 접근이 아니면 실패 | §4 |
| `hardening-guard` | ① `src/**`에 `uploadAsync` 0건 ② `src/device/**`의 `get/requestPermissionsAsync(`에 granular 목록 인자 필수(**`src/save/**`는 명시 예외**) ③ 로거 인자에 `uri`/`url` 원문 전달 금지(`summarizeUri(` 경유만) ④ `HASH_CHUNK_BYTES % 3 === 0` ⑤ `listAssets` 구현부에 `getAssetInfo` 호출 0건 ⑥ **`src/web/**`·비네이티브 포크에 `.upload(` 0건**(§8.5) ⑦ **`src/device/expo.ts`의 `listAssets` 구현부에 `SortBy.creationTime` + `false` 리터럴 필수**(§7.1 정렬 계약) | §7. 주석은 리팩터링을 이기지 못한다 |

### 10.4 integration

**없음** — 외부 서비스가 아니라 실기기가 필요하다(expo-ui 선례). `test:all = unit → types`. 대신 **네이티브 실기 체크리스트**를 README에 명문화하고 이관 순서 7단계(§11.5)에서 실행한다:

1. iOS 26 실기기 대용량(>100MB) 동영상 업로드 — 하드닝 1
2. iCloud 전용 자산 resolve(기본 차단 / 옵트인 다운로드) — 하드닝 6
3. Android 재인코딩 자산의 크기 일치 — 하드닝 3
4. Android 13+ 권한(전체 허용 / 선택한 사진 / 오디오 거부 상태) — 하드닝 5
5. 웹 드롭 혼합 배치(지원+미지원) — 하드닝 10
6. ~~`expo export --platform web` 산출물에 `expo-media-library` 문자열 부재~~ → **완료(V-B).** SDK 56 스텁 앱으로 `--platform web`(`single`·`static`) / `--platform ios`를 실제 export해 8/8 정확 확인했다. 실기 체크리스트에서 내리고 `web-export-guard`(§10.3)로 **CI에 상시화**한다. 실기에서 남는 것은 nativewind·expo-router 플러그인이 개입한 memorylog2 실앱 전체 그래프 1회 확인뿐이다(§11.5 5단계).
7. Hermes에서 15MB 해시 소요 시간 — §9

### 10.5 README 컴파일 검증

`expo-ui/scripts/check-readme.mjs`를 복제하되 `paths`를 **공개 서브패스 8개**(§2.1 개수 정본)로 확장하고, 예제가 import하는 `expo-*`는 ambient `declare module`로 선언한다(라이브러리 유래 식별자만 실타입). `pnpm check:readme`.

README 상단 고정 문구 2줄(§2.3):
- `.`·`./picker`·`./device`·`./save`는 **Expo SDK 56 이상**을 요구한다.
- `./core`·`./web`·`./testing`은 peer 0이므로 SDK와 무관하다.

---

## 11. memorylog2 이관 계획

### 11.1 실측 (V5)

| 항목 | 실측값 |
|---|---|
| `src/photos/*`를 import하는 파일(자신 제외) | **20** (`app/` 6 + `src/` 14) |
| import 문 | **40** |
| 모듈별 분포 | errors 12 · uploadPhoto 9 · saveImages 4 · devicePhotoLibrary 4 · uploadDeviceAssets 3 · pendingPhotos 3 · devicePhotoLibraryTelemetry 3 · photoMetadata 1 · hashFile 1 |
| `jest.mock(".../photos/…")` | **17사이트 / 11파일** |
| photo-kit **내부 경로** 직접 mock·import | **3파일** |
| `packages/photo-kit` | **14파일 2,764줄** (+ README 99줄 + package.json + tsconfig + dist) |

> 두 설계안 모두 이 수치를 틀렸다. GPF는 20파일/39 import(hashFile 1건 누락)로 근사했으나 필수 수정 테스트를 2파일로 셌고, VF는 필수 테스트 3파일을 정확히 잡았으나 소비 표면에서 `app/` 6파일을 통째로 놓쳐 14/28로 셌다. **위 표가 정본이다.**

**결정적 사실**: `@memorylog/photo-kit`를 직접 import하는 파일은 `src/photos/` 밖에 **0개**다. 어댑터 계층이 완벽한 단일 관문이므로 화면·라우트·훅·동기화 엔진의 **40개 import 문 전부가 무변경**이며, `jest.mock` 17사이트도 전부 앱 어댑터 모듈 경계를 모킹하므로 무변경이다. 이관은 `src/photos/` 21파일의 내부 문제로 축소된다.

### 11.2 소비 방식 — tarball 벤더링 (선례 존재)

memorylog2는 **npm workspaces**(`workspaces: ["apps/*","packages/*"]`) + `package-lock.json`이고 `@gj-kit`은 미게시다. 이미 `apps/mobile/vendor/gj-kit-expo-ui-0.0.0.tgz`를 `file:`로 참조하는 선례가 있다(실측). 동일 절차:

```sh
pnpm --filter @gj-kit/expo-media build && pnpm --filter @gj-kit/expo-media pack
cp gj-kit-expo-media-0.0.0.tgz apps/mobile/vendor/
# apps/mobile/package.json: "@gj-kit/expo-media": "file:vendor/gj-kit-expo-media-0.0.0.tgz"
npm i     # package-lock 갱신
```

tarball은 실제로 `node_modules`에 설치되므로 jest `moduleNameMapper`가 불필요하다 — 오히려 현재의 `"^@memorylog/photo-kit$": "<rootDir>/../../packages/photo-kit/src"` 한 줄이 **사라진다**. `build:workspace-deps` 훅도 photo-kit 항목이 빠진다(tarball은 이미 빌드된 dist).

**pack 후 필수 검증 5건**
1. `files: ["dist"]` 산출물에 **`.cjs`가 포함**되는지 — jest(CJS)는 `require` 조건으로 `.cjs`를 받으며, 없으면 ESM을 파싱하다 실패한다.
2. `dist/device.web.{js,cjs}` · `dist/save.web.{js,cjs}`가 tarball에 들어가는지 — 누락 시 web 빌드가 `InvalidPackageConfigurationError`로 즉사한다.
3. jest에서 `require('@gj-kit/expo-media/device')`가 **네이티브 `.cjs`**를 받는지 — V1의 케이스 E를 실앱에서 재확인(§8.4 규칙 1이 지켜졌는지의 최종 관문). **`node` 브랜치 추가 후에도 유효한지가 이번 개정의 핵심 확인 지점**이다 — jest-expo가 네이티브 프리셋에 `node`를 넣는 변경을 하면 네이티브 테스트가 스텁을 받게 되며, 이 검증이 그것을 잡는 유일한 관문이다(§12-12).
4. **`dist/web.d.ts`·`dist/web.d.cts` 첫 줄이 `/// <reference lib="dom" />`인지** — 각인 후처리가 실제로 돌았는지의 확인(§2.4). `tsup`만 돌리고 스크립트를 건너뛰면 조용히 빠진다.
5. **`dist/{core,index,picker,device,save,video,testing}.d.ts`에 각인이 **없는지**** — 각인이 번지면 무DOM 소비자가 DOM 전역을 얻어 §2.4의 `./core` 미오염 보장이 깨진다.

### 11.3 수정 인벤토리 — `apps/mobile/src/photos/` (21파일)

| 파일 | 작업 | 난도 |
|---|---|---|
| **`adapters.ts` (신설)** | expo 어댑터 조립: `createMediaKit({ api, limits, strings: koMediaStrings, namespace: 'memorylog' })` + `.withPicker(expoPicker(), { web: { loader: createFetchBinarySourceLoader() } })`(§5.7.4) + `.withDeviceLibrary(expoDeviceLibrary())` + `.withDeviceSave(expoDeviceSave({ isExpoGo }))` + `poster: expoVideoPoster()`. **`.web.ts` 쌍 불필요** — 포크는 라이브러리 exports가 소유한다(§8) | ~32줄, 유일한 실작업 |
| `kit.ts` (60줄) | **재작성**. telemetry 브리지는 `PhotoKitTelemetry` → `MediaTelemetry`로 **타입명만** 교체하면 본문이 그대로 성립한다(§5.1). `limits`·`fileNamePrefix`·`debugTag`/`debugContext`→`debug` 1:1 이전. **`photo.geoPoint` 재매핑 불필요**(§5.3 환원) | 중(감소) |
| `uploadPhoto.ts` (128줄) | import 경로 교체 + **`UploadResult` 언랩**(`.asset`). `albumId`→`collectionId` 매핑은 이미 존재. **신설**: `captureAndUploadMedia` 래퍼의 `captureType:'photo'` → `kind:'image'` 매핑(§5.7.2-⑪) · `uploadImageBlob`/`uploadVideoBlob` → `uploadBinary` 입력 재조립 | 기계적 |
| `saveImages.ts` (52줄) | `saveImagesToDevice(images, deps)` → `createMediaSaver({ target })`(target은 어댑터가 고정 주입 → 호출부 8곳 무변경). **`withFreshImageUrls`(앱 고유)는 그대로**. **신설**: `toSaveableMedia(dto)` ~10줄 — `originalUrl \|\| thumbnailUrl` 폴백과 `contentType` 좁히기를 앱이 소유(§5.7.3). 8콜사이트가 DTO를 직접 넘기던 것이 매핑 경유로 바뀐다 | 소 → **중** |
| `devicePhotoLibrary.ts` (21줄) | 재export 출처 교체 + 위임. **`resolveDeviceAssetForUpload`는 `device.resolvePickedAsset`으로 1:1 위임**해 이름·반환 형태를 보존한다 — 이것이 화면 테스트 mock 팩토리 3곳(recordCreate:89 / recordDetail:107 / DeviceRecordUploadSheet:41)을 무변경으로 유지하는 조건이다. `getDeviceAssetInfoForUpload`→`device.getAssetInfo`, `ensureDevicePhotoPermission`/`requestDevicePhotoPermissionStatus`→`ensurePermission()`, `cleanupDeviceUploadCopy`→`staging.cleanup` | 소 |
| `mediaTypes.ts`, `errors.ts`, `hashFile.ts`, `mediaPermission.ts`, `photoMetadata.ts` (**5파일**) | 재export 출처 교체 + 심볼명. `mediaTypes.ts`는 `export { inferImageContentType as inferContentType }`로 흡수, `hashFile.ts`는 `media.hasher.hashLocalFile` 위임, `photoMetadata.ts`는 **`geoPoint` 환원으로 재매핑 0줄** | sed × 5 |
| `debug.ts`, `deviceUploadCache.ts` (**2파일**) | **파일째 삭제** — 임포터 0(V9-b). `cleanupDeviceUploadCopy`만 `devicePhotoLibrary.ts`로 이사 | 삭제 × 2 |
| `uploadDeviceAssets.ts` (39줄) | **타입 심볼만**: `MediaLibrary.Asset`→`DeviceAsset`, 반환 `ImagePicker.ImagePickerAsset`→`ResolvedPickedAsset`. 2단 조합(resolve + uploadPickerMediaAsset)은 **의도된 구조로 유지**(파일 주석 15-18의 근거가 그대로 유효) | 소 |
| `pendingPhotos.ts` (141줄) | 타입 심볼만: `ImagePicker.ImagePickerAsset`→`PickedAsset`. **`asset.assetId` 접근(43행)이 컴파일된다는 것이 §3.3-⑥ 복원의 조건**. `extractPhotoMetadataFromBlob(file, null, contentType)`(141행) → `mediaMetadataFromJpeg(file, { contentType })`로 **인자 형태 변경 1곳** | 소 |
| `devicePhotoLibraryTelemetry.ts` (143줄) | 타입 import 경로만. 앱이 자체 리포터로 4종 operation을 계속 보낸다(라이브러리는 이 경로에 telemetry를 방출하지 않는다 — §5.1 부수 결정) | sed |
| **`src/sync/uploadAsset.ts` (69줄) — 신설 행** | `src/photos/` **밖**의 소비자. `resolveDeviceAssetSourceForUpload(ref)`→`device.resolveForUpload(ref)`, `uploadLocalUriToIntent({…contentHash})`→`uploads.uploadLocalFile({…contentHash})`, `cleanupDeviceUploadCopy(uri)`→`staging.cleanup(uri)`. **47행의 해시 캐시가 그대로 동작한다는 것이 §5.4-① 복원의 조건** | 소 |
| **`src/sync/syncStateMachine.ts` — 신설 행** | `error instanceof PhotoUploadError` → **`isMediaError(error)`** 1줄. `splitting:false` 사본 문제(§5.2) | 1줄 |

> **`src/sync/mediaScan.ts`는 0수정이다** — `getDeviceAssetInfoForUpload`가 `device.getAssetInfo`로 승격됐으므로(§5.7.5) 앱 어댑터 1줄 위임으로 흡수된다. 정렬 계약 변경의 영향도 받지 않는다(자기 쿼리를 오름차순으로 직접 호출 — `mediaScan.ts:90`).

**소계: 신설 1 + 재작성 1 + 기계적 11 + 삭제 2 = `src/photos/` 비테스트 15파일.**
여기에 `src/photos/` **밖**의 비테스트 2파일(`src/sync/uploadAsset.ts` · `src/sync/syncStateMachine.ts` — §5.7.5)이 더해져 **비테스트 총계는 17파일**이다. §11.6의 총계표가 이 분리를 정본으로 쓴다.

### 11.4 수정 인벤토리 — 테스트·설정 (전면 개정)

초안의 「수정 3파일 / 무변경 4파일」은 성립하지 않는다. `src/photos/` 테스트 7파일 1,841줄 전부와 소비자 테스트 11파일, `src/sync/` 테스트를 열어 확인한 결과는 아래와 같다.

**원칙**: 앱측 테스트가 **라이브러리 로직**을 얇은 재export 너머로 검증하고 있으면, 그 케이스는 라이브러리 unit으로 **이식**한다(삭제가 아니다 — 대체 커버리지 없는 삭제는 회귀다). 앱에 남는 것은 앱 고유 로직뿐이다.

#### (A) `src/photos/` 테스트 7파일

| 파일 | 줄 / 케이스 | 판정 | 근거 (실측) |
|---|---|---|---|
| `uploadPhoto.test.ts` | 714 / 14 | **전면 재작성 (대)** | `jest.mock("…/packages/photo-kit/src/hashFile")` 딥 경로 mock(:43) + `expo-image-picker`(:1)·`expo-video-thumbnails`(:11)·`expo-file-system`(:15,22) 4중 네이티브 모킹. 14케이스 중 12케이스(크기 결정 3분기, 포스터 성공·실패, 웹 EXIF 2종, 혼합 드롭 2종, 피커 옵션 2종 등)가 **라이브러리 로직**이므로 `"./testing"` 페이크 위 unit으로 이식. 앱 잔존 2케이스: 어댑터 위임 + `albumId↔collectionId` 매핑 |
| `saveImages.test.ts` | 323 / 8 | **전면 재작성 (대)** | `platformOS` DI **7사이트**(:76,127,172,223,264,303,318) + 같은 객체에 `document`/`fetch` 주입(:77-78) + `fileSystem`/`mediaLibrary` 페이크 + `Constants.appOwnership` 직접 조작(:33). `SaveTarget` 판별 유니언(§6.1-⑦)에는 이 DI 형태가 **존재하지 않는다**. 8케이스 중 7케이스(웹 다운로드 2, 네이티브 저장 2, 권한 3)를 라이브러리 unit으로 이식하고 페이크 2종(`createMemoryFileSystem` + 페이크 `MediaLibrarySaveAdapter` / 페이크 `BrowserSaveAdapter`)으로 재현. 앱 잔존: 파일명 프리픽스 바인딩 1케이스 + `withFreshImageUrls` **신규 작성**(현재 무검증 — 이관을 커버리지 개선 기회로 쓴다). ⚠ `:47`의 `imageDownloadFileName(image, 0) === 'memorylog-image-1.webp'` 단언은 `id`/`index` 규칙(§5.7.3)이 보존됐으므로 **인자 형태만 바꾸면 값이 그대로 통과**한다 |
| `devicePhotoLibrary.test.ts` | 313 / 12 | **삭제 + 전량 이식 (중)** | 12케이스 전부가 §7 하드닝 2·6의 검증이다(iOS 캐시 카피 :118, iCloud 미대기 :145, 옵트인 다운로드 :163, 타임아웃 :199, 정보실패 폴백 :216, content:// 카피 :238·:262, **ph:// 단독 거부 :288**). §7 표가 이미 같은 케이스를 요구하므로 이식처가 이미 계획에 있다. 딥 경로 mock(:24 `packages/photo-kit/src/mediaPermission`)은 소멸 |
| `mediaPermission.test.ts` | 60 / 2 | **삭제 + 이식 (소)** | `import … from "…/packages/photo-kit/src/mediaPermission"`(:10) — 앱 테스트가 아니라 **라이브러리 내부 테스트가 앱 트리에 놓인 것**. 규칙이 core로 갔으므로(§5.4-④(c)) `ensurePermission` unit 4종에 흡수 |
| `photoMetadata.test.ts` | 134 / 4 | **삭제 + 이식 (소)** | `geoPoint` 단언 4사이트(:85,97,110,131). **§5.3의 `geoPoint` 환원으로 단언 수정 0** — 파일을 그대로 라이브러리 unit으로 옮긴다. §7 하드닝 11이 이미 "전신 `photoMetadata.test.ts` 전량 이식"을 요구하므로 계획 중복 없음 |
| `pendingPhotos.test.ts` | 102 / 8 | **무변경** | 앱 고유 로직(dedup·프리뷰 URL 수명). `pickerAsset` 헬퍼가 `{uri, assetId, …} as never`(:14)라 컴파일 결합은 없지만, **런타임 dedup 동작은 `PickedAsset.assetId` 복원(§3.3-⑥)이 전제**다 |
| `devicePhotoLibraryTelemetry.test.ts` | 195 | **무변경** | `jest.mock("./devicePhotoLibrary")`(:8) + `jest.mock("../telemetry/clientActivityReporter")`(:15) — 양쪽 다 앱 모듈 경계. 앱 어댑터가 3개 함수명을 유지하는 한 무영향 |

**소계: 전면 재작성 2(1,037줄 22케이스) · 삭제+이식 3(507줄 18케이스) · 무변경 2.**

#### (B) `src/sync/` 테스트

| 파일 | 판정 | 근거 |
|---|---|---|
| `src/sync/hashFile.test.ts` | **2케이스 재작성** | `:10,14`가 `computeChunkRanges(100, 1000)` / `(2500, 1000)`으로 **2인자 호출**한다. `chunkBytes` 공개 인자 제거(§6.1-⑩)의 직접 파급이므로 `HASH_CHUNK_BYTES` 기준 케이스로 다시 쓴다 |
| `src/sync/mediaScan.test.ts` (115) | 무변경 | `uploadPhoto`(:9) + `expo-media-library/legacy`(:3) 모킹 — 둘 다 경계 유지 |
| `src/sync/SyncBridge.test.tsx` (94) | 무변경 | `devicePhotoLibraryTelemetry`·`mediaScan`·`uploadAsset` 모킹 |

#### (C) 소비자 테스트 11파일 (`jest.mock(".../photos/…")` 17사이트)

| 파일 | 줄 | 모킹하는 앱 어댑터 심볼 | 판정 |
|---|---|---|---|
| `app/records/__tests__/recordDetail.test.tsx` | 2083 | saveImages(:76) · uploadPhoto(:86, **`isDuplicateUploadAsset` 포함** :93) · devicePhotoLibrary(:98) | **소 수정** — §11.7-1의 `isDuplicateUploadAsset` 폐지에 따라 mock 키 1개 + 관련 단언. 실제 호출부는 `app/records/[id].tsx:404` 1곳뿐(grep) |
| `app/records/__tests__/recordCreate.test.tsx` | 1427 | uploadPhoto(:57) · devicePhotoLibrary(:65, **resolve 반환을 `{uri,width,height,assetId,fileName,exif}`로 하드코딩** :89-96) | **무변경** — `resolvePickedAsset` 채택의 직접 수혜. 반환 형태를 좁혔다면 이 팩토리가 거짓말이 된다. `captureType:'photo'` 값 단언(:867,1134)도 앱 래퍼가 매핑을 흡수하므로 통과 |
| `src/albums/DeviceRecordUploadSheet.test.tsx` | 1039 | devicePhotoLibrary(:38, `resolveDeviceAssetForUpload`+`deviceAssetCapturedAt`) · **`jest.requireActual("../photos/uploadPhoto")`(:51)** · `PhotoUploadError` 직접 import(:20) | **무변경(조건부)** — ① 앱 `errors.ts`가 `MediaError as PhotoUploadError` 별칭 재export 유지 ② `deviceAssetCapturedAt`이 `"./core"`에 있음(§5.7.2-⑨) ③ **`requireActual`이 실제 어댑터를 로드하므로 `adapters.ts`의 `createMediaKit()` 호출이 import 시점에 크래시하면 안 된다** — 현행 `kit.ts`도 모듈 스코프에서 `createPhotoUploader`를 호출하므로 위험도는 동등하나, §11.5 5a에서 이 파일을 **첫 실행 대상**으로 삼는다 |
| `app/albums/__tests__/albumDetail.test.tsx` | 1615 | uploadPhoto(:86) · saveImages(:97) · devicePhotoLibrary(:102) | 무변경 |
| `app/__tests__/sync-images.test.tsx` | 962 | saveImages(:39) | 무변경 |
| `app/__tests__/profile-edit.test.tsx` | 567 | uploadPhoto(:45) | 무변경 |
| `src/albums/NewRecordUploadModal.test.tsx` | 584 | uploadPhoto(:14) | 무변경 |
| `app/albums/__tests__/albumImageRecords.test.tsx` | 515 | saveImages(:41) | 무변경 |
| `src/records/createDraftFlow.test.ts` | 187 | uploadPhoto(:18) | 무변경 |
| `src/sync/mediaScan.test.ts` · `src/sync/SyncBridge.test.tsx` | (B)에 기재 | — | 무변경 |

**무변경의 성립 조건은 타입이 아니라 심볼이다.** `jest.mock(path, factory)`의 팩토리는 실제 모듈과 타입 대조되지 않으므로 시그니처 변경은 이 11파일을 깨지 않는다. 깨지는 유일한 경우는 **프로덕션 코드가 mock 팩토리에 없는 심볼을 호출**할 때다(→ `undefined is not a function`). 따라서 이관 규칙은 하나다: **앱 어댑터의 export 이름과 호출 형태를 보존하라.**

#### (D) 설정 4파일 + 타입 정합성 1건

| 파일 | 작업 |
|---|---|
| `apps/mobile/package.json` | `@memorylog/photo-kit`·`js-sha256` 제거(앱 소스 사용처 0건 실측), `@gj-kit/expo-media` file: 추가, `build:workspace-deps`에서 photo-kit 제거 |
| `apps/mobile/tsconfig.json` | `paths`에서 `"@memorylog/photo-kit"` 제거 (남기면 tarball 대신 삭제된 소스를 가리킨다) |
| `apps/mobile/jest.config.ts` | `moduleNameMapper`에서 `"^@memorylog/photo-kit$"` 제거. ⚠ **(A)의 딥 경로 mock 3건이 모두 사라진 뒤**에 해야 순서가 맞는다 |
| 루트 `package.json` | `workspaces: ["apps/*","packages/*"]` 글롭이므로 **디렉토리 삭제로 자동 반영**. `package-lock.json` 재생성 |
| **`@memorylog/shared` 정합성 확인 (신설)** | `sync/uploadAsset.ts:43`이 contentType을 `SupportedMediaContentType`으로 캐스팅한다. `MediaContentType`(§5.1, gif 제거 후 8종)과 `SUPPORTED_MEDIA_CONTENT_TYPES`(`shared/src/index.ts:359-378`, 8종)가 **정확히 일치**함을 이관 시 1회 확인한다 — 실측상 현재 일치하며, 라이브러리가 서버보다 넓어지면 presign 단계에서만 발각되는 불일치가 생긴다 |

**딥 경로 mock 3건은 전부 사라지는 방향이다** — 어댑터 seam의 직접적 이득이자 실효 증거다.

### 11.5 이관 순서 (되돌리기 가능한 단계)

1. gj-kit에서 `pnpm build && pnpm test:all && pnpm check:readme` 통과 → `pnpm pack` → §11.2의 pack 후 검증 3건 → vendor 커밋
2. memorylog2에 tarball + dep 추가. **`@memorylog/photo-kit`은 아직 남겨둔다**
3. `src/photos/adapters.ts` 신설 + `kit.ts` 재작성 → `npm --workspace @memorylog/mobile run typecheck` (**여기서 모든 시그니처 불일치가 드러난다**)
4. 재export·심볼 교체 11파일 + 삭제 2파일 + `src/sync/` 2파일 → typecheck
5. **(둘로 쪼갠다 — 초안의 "딥 경로 3건 수정 → 전체 그린"은 낙관적이다)**
   - **5a.** 무변경으로 계상한 **13파일**(`src/photos` 2 + `src/sync` 2 + 소비자 9)을 **먼저** 실행한다. `DeviceRecordUploadSheet.test.tsx`(`requireActual` 경로)를 첫 대상으로 삼는다. 여기서 실패가 나오면 그것은 **어댑터 심볼 보존 실패**이며 곧 §11.6의 "무변경" 주장 자체가 반증된 것이다 — 되돌아가 어댑터를 고친다.
   - **5b.** 재작성 2 + 이식 3 + `sync/hashFile.test.ts` 2케이스를 처리한다. **이식분 18케이스는 gj-kit 쪽 `pnpm test`가 먼저 그린이어야** 앱에서 삭제할 수 있다(대체 커버리지 선행 원칙).
6. `packages/photo-kit` 삭제 + 설정 4파일 정리 + shared 타입 정합성 확인 → 최종 typecheck/test
7. §10.4 네이티브 실기 체크리스트 6종 실행 + memorylog2 실앱 `expo export --platform web` 1회 확인(§12-1)

### 11.6 총계 (개정)

| 항목 | 초안 | **개정** | 차이의 근거 |
|---|---|---|---|
| 삭제(photo-kit) | 14파일 2,764줄 | 14파일 2,764줄 | — |
| 앱 신설 | 1 (`adapters.ts`) | 1 | — |
| 앱 재작성 | 1 (`kit.ts`) | 1 | telemetry 브리지·geoPoint 재매핑이 불필요해져 난도는 하락 |
| 앱 기계적 수정 | 12 | **11** | `debug.ts`·`deviceUploadCache.ts`가 삭제로 이동 |
| **앱 어댑터 파일 삭제** | 0 | **2** | 임포터 0(V9-b) |
| **`src/photos/` 밖 비테스트 수정** | 0 | **2** | `src/sync/uploadAsset.ts`(소) · `src/sync/syncStateMachine.ts`(1줄) |
| **테스트 — 앱 재작성** | 3 | **2** (1,037줄 22케이스) | `uploadPhoto.test.ts`·`saveImages.test.ts` |
| **테스트 — 삭제 후 라이브러리 이식** | 0 | **3** (507줄 18케이스) | 라이브러리 로직을 앱에서 검증하던 파일들. §7 표가 이미 이식처를 요구 |
| **테스트 — 케이스 단위 수정** | 0 | **1** (`sync/hashFile.test.ts` 2케이스) | `chunkBytes` 인자 제거의 파급 |
| **테스트 — 앱 무변경** | 4 | **4** (`pendingPhotos` · `devicePhotoLibraryTelemetry` · `sync/mediaScan` · `sync/SyncBridge`) | — |
| **소비자 테스트** | 17사이트/11파일 무변경 | **10파일 무변경 · 1파일 소수정** | `recordDetail.test.tsx`(§11.7-1 파급) |
| 화면·라우트 | 0수정 | **1파일**(`app/records/[id].tsx:404`) | §11.7-1의 기존 예외. 이번 개정으로 늘지 않았다 |
| 설정 수정 | 4 | 4 (+ shared 타입 정합성 확인 1건) | — |

> **초안의 "동기화 엔진 0수정"은 성립하지 않는다.** 정정: **비테스트 1파일 1줄 + 테스트 1파일 2케이스**(§5.7.5). 나머지 `src/sync/` 3파일(`mediaScan.ts`·`uploadAsset.ts`·`hashFile.ts`)의 0수정은 `getAssetInfo` 승격 · `LocalUploadInput.contentHash` · `MediaKit.hasher` 세 결정이 **전부** 성립할 때만 유효하다.
>
> **§11.3의 "기계적 수정" 난도 평가는 §5·§5.7의 시그니처 확정으로 비로소 성립한다** — 대응 공백이 남아 있었다면 §11.5 3단계(typecheck)에서 그 파일들이 전부 '기계적'이 아니었다.

### 11.7 이관 시 주의 — 파괴적 변경 3건

1. **`UploadResult<TAsset>` 반환 통일.** 전신은 `uploadLocalUriToIntent`만 `{asset, duplicate}`를 반환하고 나머지는 bare `TAsset`을 반환했으며, 그 간극을 `uploader.ts:185`의 `WeakSet` + `isDuplicateUploadAsset`으로 메웠다. 통일은 옳지만 **`app/records/[id].tsx`가 `isDuplicateUploadAsset`을 직접 호출한다** — 라우트 파일이다. `src/photos/uploadPhoto.ts`가 `.asset`을 벗겨 반환하면 duplicate 비트가 소실되므로, **어댑터가 `UploadResult`를 그대로 노출하고 라우트 1곳을 `result.duplicate`로 고치는 편**이 정답이다. 이 1파일은 §11.6의 "화면·라우트 0수정"에 대한 **유일한 예외**이며, 지금 하지 않으면 영구 부채가 된다.
2. **`saveImagesToDevice` 시그니처.** `useAlbumImageMutations.ts`가 유일한 파급 지점이지만, `src/photos/saveImages.ts` 어댑터가 `SaveTarget`을 고정 주입하면 호출부 무변경으로 흡수된다(권장). ⚠ 단 §5.7.3의 `toSaveableMedia` 매핑이 8콜사이트에 끼어들므로 이 파일 자체는 '중'이다.

3. **`instanceof`가 조용히 거짓이 된다 (신설).** `src/sync/syncStateMachine.ts:36`의 `error instanceof PhotoUploadError`는 **컴파일도 되고 테스트도 통과할 수 있지만** `splitting:false`로 엔트리마다 코어가 복제되는 순간 사본 간 클래스 정체성이 어긋나 false를 반환한다(§5.2). 결과는 재시도 가능한 업로드 실패가 영구 실패로 분류되는 것 — 정확히 "조용히 깨지는" 클래스다. **`isMediaError(error)`로 교체가 필수**이며, 앱 전역에서 `instanceof PhotoUploadError`/`MediaError` grep을 1회 돌려 다른 사이트가 없는지 확인한다(현재 실측 1건).

---

## 12. 잔존 리스크

1. ~~**`expo export --platform web` 실앱 검증 미완.**~~ **(종결 — V-B)** SDK 56 스텁 앱으로 실제 export해 `output:"single"` 클라이언트 8/8, `--platform ios` 대조 4/4를 확인했다. 검증 과정에서 **`output:"static"|"server"`의 SSR 번들이 `browser` 조건을 받지 않아 네이티브 포크를 끌어오는 결함**을 발견해 `node` 브랜치로 수정하고 재검증했다(§8.2 케이스 H). 남은 미지수는 nativewind·expo-router 플러그인이 개입한 **실앱 전체 그래프**이며 `web-export-guard`는 우리 패키지 경계까지만 보장한다 — **이관 7단계에서 memorylog2 실앱으로 1회 확인**한다.
2. ~~**`expo-file-system` 신 File API의 버전 하한.**~~ **(종결 — V-B)** `File.upload()`는 `expo-file-system@56.0.0` 신규(CHANGELOG #45033 + `55.0.19`/`19.0.20` d.ts 부재로 이중 확인). peer는 `>=56.0.0`. `expo-media-library/legacy`는 `56.0.5` 신규(**패치 릴리스가 breaking**) → `>=56.0.5`. 파생 리스크로 남는 것은 **Expo가 같은 방식으로 패치 릴리스에서 서브패스를 옮길 수 있다**는 사실이며, 방어책은 `web-export-guard`와 §11.2 pack 후 검증 5건뿐이다.
3. ~~**§2.4의 DOM 타입 경계 미해결.**~~ **(종결 — V-A)** 초안 설정은 실제로 `pnpm build`를 exit 1로 깨뜨렸고 결함은 7종 식별자였다. `lib:["ES2022","DOM"]` + `dist/web.d.{ts,cts}` DOM 각인 + 무DOM 가드 2종으로 확정했으며, 소비자 픽스처 7/7 CLEAN이다. 남는 것은 **각인 후처리가 빌드 스크립트 밖으로 새어나갈 위험**(누군가 `tsup`만 실행) — §11.2 pack 후 검증 4·5번이 관문이다.
4. **순수 TS SHA-256의 Hermes 성능 미실측.** 전신 `js-sha256`도 순수 JS라 회귀는 아니지만, js-sha256은 언롤링 최적화가 되어 있어 소박한 구현이 2~3배 느릴 수 있다. 15MB = 20청크 × (base64 디코드 + 해시)가 체감 지연이 되면 골든패스가 손상된다. 완화책은 `HashAdapter` 슬롯이지만 **그 경로에는 아직 구현체가 없다**. ⚠ `LocalUploadInput.contentHash`(§5.4-①)가 재시도 경로에서 재해시를 없애므로 **최악 경로의 노출은 초안보다 줄었다**.
5. **iOS 26 URLSession 하드닝은 "다시 쓰지 않음"만 보장된다.** `hardening-guard`의 `uploadAsync` 금지는 재발을 막을 뿐, `new File().upload()`가 앞으로도 안전한지는 실기기 검증뿐이며 gj-kit CI에는 그 수단이 없다. **라이브러리화로 검증이 오히려 멀어진 유일한 지점**이다. 덧붙여 **web/SSR에서는 `File.upload()`가 no-op status 0**이므로 하드닝 1의 코드 경로는 네이티브 전용으로 물리적으로 갈라두어야 한다(§8.5).
6. **`splitting:false`의 코드 복제.** 엔트리 격리를 얻는 대가로 코어가 엔트리마다 복제된다. `MediaError`는 `Symbol.for` 태그로, `Brand`는 **타입 전용화**로 해결했지만(§5.3), 소비자가 `koMediaStrings` 등 다른 export의 **객체 정체성을 엔트리 간에 비교하면 어긋난다**(expo-ui §12-9와 동종). README 경고가 유일한 방어.
7. **비네이티브 포크가 web jest·SSR·Node 스크립트에서 함께 매치된다.** jsdom은 `browser`, expo-router SSR/RSC와 vitest node 환경은 `node`를 켜므로 `@gj-kit/expo-media/device`가 세 경우 모두 스텁으로 로드된다. 이는 **의도한 동작**(그 환경엔 네이티브 모듈이 없다)이지만, 앱이 웹 jest나 SSR에서 네이티브 어댑터를 테스트하려 하면 빈 결과와 `platform-unsupported`를 보고 혼란스러울 수 있다. README의 플랫폼 동작 표(§8.5)로 완화.
8. **`node` 조건이 Bun·Deno·엣지 런타임에서 어떻게 켜지는지는 미측정.** Bun은 기본적으로 `node`를 켜므로 스텁으로 떨어질 것이 유력하나 실측하지 않았다. 소비자가 이 런타임을 쓸 근거가 현재 없어 리스크로만 남긴다.
9. **엔트리 개수의 인지 부담.** 공개 서브패스 8개는 expo-ui 4, toss-payments 5보다 많다. "엔트리 1개 = optional peer 1개" 규칙이 성립하는 한 외울 것은 규칙 하나지만, `./video`처럼 작은 엔트리를 `./picker`에 합치자는 반론이 나올 수 있다(합치면 `expo-video-thumbnails`가 피커 소비자에게 강요된다는 대가가 생긴다).
10. **팩토리 7종 조립의 첫인상 비용.** `"./core"` 소비자는 `createLocalUploads` → `createDeviceLibrary` → `createDeviceUploads`를 순서대로 엮어야 한다. `createMediaKit` + `with*`가 골든패스를 한/두 줄로 유지하지만, 커스텀 어댑터 경로의 학습 곡선은 실재한다. README에 3종 소비자 시나리오(§2.2 표) 전문을 게재해 완화.
11. **`"./device"` 비네이티브 포크가 열거는 graceful·resolve는 throw로 갈리는 것은 학습 비용이다.** 전신 동작을 보존한 판정(§6.1-⑭)이지만 "어떤 건 빈 배열, 어떤 건 예외"는 처음 보는 사람에게 일관성 없어 보인다. TSDoc과 README 플랫폼 표로만 완화 가능.
12. **`BinarySource` 추상화가 DOM `File`의 일부 실사용을 놓친다.** `lastModified`(memorylog2 `pendingPhotos`의 dedup 키에 사용됨), `slice()` 등은 계약에 없다. 그 코드는 앱에 남으므로 이번 이관에선 무해하지만, 웹 소비자가 늘면 재검토 대상.
13. **`jest-expo`의 조건 세트 변화 위험.** 본 설계는 `@react-native/jest-preset`의 `customExportConditions = ['require','react-native']`(V2 · V-B 재확인) 위에 서 있고, bare `react-native` 키를 두지 않아 그 조건이 사라져도 `require`로 안전하게 떨어진다. **다만 `node` 브랜치를 추가했으므로, jest-expo가 네이티브 프리셋에 `node`를 넣는 변경을 하면 네이티브 테스트가 스텁을 받게 된다** — §11.2 pack 후 검증 3번이 이를 잡는 유일한 관문이며 **CI에 상시화할 것.**
14. **텔레메트리 스팬의 "정확히 한 번 종료" 규율은 검증되지 않는다.** `MediaActivity`를 두 번 종료하거나 아예 종료하지 않아도 타입이 잡지 못한다. §7.2 unit 2번(수집 operation 집합 대조)이 호출 누락은 잡지만 이중 종료는 잡지 못한다. 전신도 동일 상태였고 사고 이력이 0이므로 typestate를 걸지 않았다(§6.2 원칙) — 재발 시 페이크 텔레메트리에 종료 카운터를 넣는 것이 최소 대응이다.
