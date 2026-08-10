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
| `Symbol.for` 에러 태그 + 브랜드 `Symbol()`의 목적 대비 | VF §3.3 | 엔트리 8개 + `splitting:false`에서 `instanceof`는 반드시 깨진다 |
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

1. **코어는 순수하다.** `src/core/**`는 `react`·`react-native`·`expo-*` import 0, DOM 전역 참조 0, 런타임 의존성 0. tsconfig `lib`은 `["ES2022"]`. `tests/unit/entry-guard.test.ts`가 소스와 dist 양쪽에서 정적으로 강제한다. → gj-kit vitest에서 네이티브 모킹 없이 코어 전 파이프라인 검증(목표 a).
2. **소비자는 자기가 가진 것만 주입한다.** 어댑터는 "완전 객체"도 "옵셔널 가방"도 아니다. 각 팩토리가 **자기가 실제로 쓰는 의존만 필수 인자로** 받는다(§3.1). 조건부 타입 0 — V3의 붕괴가 구조적으로 불가능하다.
3. **peer 경계 = 엔트리 경계.** 런타임 마법(try/require, 지연 import) 금지. "어느 엔트리를 import했나"가 그래프를 결정하고, 그래프는 `dist-peer-graph` 가드가 ESM·CJS 양쪽으로 측정한다(§10.3).
4. **플랫폼 포크는 라이브러리가 소유한다.** exports `browser` 조건 하나로 라우팅하며, 소비 앱은 `.web.ts` 쌍을 쓰지 않는다(§8).
5. **검증 강제는 "조용히 깨진 이력"에만.** 원본 주석의 사고 11종과 실제 데이터 오염 경로만 타입/런타임으로 막는다. 과잉은 §6.2 기각표에 비용과 함께 남긴다.
6. **검증된 하드닝은 하나도 잃지 않는다.** 11종 + 추가 10종 전부의 새 주소와 **그것을 지키는 테스트**를 §7에 명시한다. 주석은 리팩터링을 이기지 못하므로, 정적으로 붙잡을 수 있는 것은 가드 테스트로 못 박는다.
7. **공개 props의 옵셔널 필드는 전부 `?: T | undefined`** (EOP 소비자 보호 규약 — expo-ui §2). `Partial<T>`는 이 규약을 위반하므로 공개 API에 쓰지 않는다.

---

## 2. 모듈 구조와 exports 맵

### 2.1 디렉토리 트리

```
expo-media/                        # @gj-kit/expo-media
├─ package.json                    # sideEffects:false, ESM+CJS(tsup), 런타임 의존성 0
├─ tsup.config.ts                  # entry 10 (조건 포크 2쌍 포함), splitting:false
├─ tsconfig.json                   # src — lib:["ES2022"] (DOM 없음)
├─ tsconfig.web.json               # src/web — lib:["ES2022","DOM"]
├─ tsconfig.tests.json             # tests — DOM 포함
├─ scripts/check-readme.mjs        # expo-ui에서 복제, paths 9개 서브패스로 확장
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
   │  ├─ brand.ts                  # (비공개) unique symbol 레코드 각인 — 재export 금지
   │  ├─ adapters.ts               # 어댑터 계약 전부 (§3)
   │  ├─ types.ts                  # api 계약, 결과 타입, telemetry
   │  ├─ errors.ts                 # MediaError(Symbol.for 태그) + 13 코드
   │  ├─ strings.ts                # MediaStrings(19키) + enMediaStrings/koMediaStrings
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
| `"./core"` | 어댑터 계약 전부, 팩토리 7종(§5), `MediaError`(13코드), `MediaStrings`(19키)+en/ko, mediaTypes 테이블, EXIF 파서, 순수 TS SHA-256, `computeChunkRanges`, `StagingCache`, `summarizeUri`/`sanitizeMediaErrorMessage`, 기기 자산 해석 정책, 크기·duration 정규화 | **없음** (react-native조차 없음. DOM lib도 없음) | bare RN, web-only, Node 스크립트, gj-kit vitest, 커스텀 어댑터 구현자 |
| `"."` | `"./core"` 전체 재export + `createMediaKit` + expo 기본 어댑터(platform·fs·localTransport·binaryTransport·hasher) | `react-native`, `expo-file-system`(+`/legacy`) | **골든패스.** 로컬 URI 업로드(동기화 엔진), 웹 Blob 업로드 |
| `"./picker"` | `expoPicker` — OS 피커/카메라, 권한, iOS 원본 fast path | `expo-image-picker`, `react-native` | 피커·카메라 업로드를 하는 앱 |
| `"./device"` | `expoDeviceLibrary` — 권한(granular)·페이지네이션·앨범·자산정보. **`browser` 조건 포크** → 열거는 빈 결과, resolve는 `platform-unsupported` | `expo-media-library/legacy`, `react-native` | 인앱 기기 사진 그리드, 자동 동기화 스캐너 |
| `"./save"` | `expoDeviceSave({ isExpoGo })` — MediaLibrary 저장. **`browser` 조건 포크** → 브라우저 다운로드 타깃, MediaLibrary import 0 | `expo-media-library/legacy`, `react-native` | 저장된 자산을 기기로 내려받는 앱 |
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

**불변식**: `"."`은 `"./picker"`·`"./device"`·`"./save"`·`"./video"`·`"./web"`을 import하지 않는다(단방향 — 소비자가 조합). `tests/unit/dist-peer-graph.test.ts`가 이 표와 산출물을 ESM·CJS 양쪽으로 대조한다.

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

    // §8 — browser만 포크. bare "react-native" 키 금지(§0.3 V2b: jest·ios CJS가 ESM을 로드한다).
    // 양 포크는 같은 .d.ts를 가리킨다(Expo tsconfig의 customConditions:["react-native"] 때문에
    // 모든 브랜치에 types가 필요 — §8.4).
    "./device": {
      "browser": { "import": { "types": "./dist/device.d.ts",  "default": "./dist/device.web.js" },
                   "require":{ "types": "./dist/device.d.cts", "default": "./dist/device.web.cjs" } },
      "import":  { "types": "./dist/device.d.ts",  "default": "./dist/device.js" },
      "require": { "types": "./dist/device.d.cts", "default": "./dist/device.cjs" }
    },
    "./save": {
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
  "peerDependencies": {
    "react-native": ">=0.79",
    "expo-file-system": ">=54",
    "expo-image-picker": ">=54",
    "expo-media-library": ">=54",
    "expo-video-thumbnails": ">=54"
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

**exports 규칙 3개 (V1·V2·V2b 실측 기반, 협상 불가)**

1. **bare `"react-native"` 키 금지.** 이 키는 jest(`['require','react-native']`)와 Metro ios/android CJS에서 매치되는데, 단일 파일 문자열을 가리키면 ESM이 CJS 컨텍스트로 로드된다(V2b 실측). `default`/`import`/`require`만으로 충분하다 — Metro 네이티브는 `import`, jest는 `require`로 정확히 떨어진다(V1 실측).
2. **`browser`가 최상단.** 조건은 선언 순서대로 첫 매치가 이긴다. `browser`가 `import`/`require` 뒤에 있으면 web에서도 네이티브가 나온다.
3. **모든 조건 브랜치에 `types`.** Expo의 `tsconfig.base`는 `customConditions: ["react-native"]`를 설정하고(V7), CJS TS 소비자(node16)는 `d.cts`가 없으면 `TS1479 Masquerading as ESM`을 받는다(expo-ui §12-8 확정 발견).

### 2.4 tsup / tsconfig

```ts
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  // 엔트리 = 서브패스 1:1 (+ 조건 포크 2쌍). 설계 문서 §2.1
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
});
```

- `tsconfig.json`은 루트 `tsconfig.base.json` extends — strict / EOP / noUncheckedIndexedAccess / verbatimModuleSyntax / **DOM lib 없음**.
- `src/web/**`만 `tsconfig.web.json`(DOM 포함)으로 분리해 코어의 무DOM 규율을 물리적으로 유지한다. DOM 없이 웹 바이너리를 다루는 방법이 §3.2의 `BinarySource` 구조적 최소 타입이다.
- 테스트는 `tsconfig.tests.json`(DOM 포함) — expo-ui 선례.

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

// ── ⑥ 피커 ("./picker") ─────────────────────────────────────────────────────
export type PickedAsset = {
  readonly uri: string;
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
  readonly endCursor: string | undefined;
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
   */
  requestPermission(): Promise<MediaPermission>;
  getPermission(): Promise<MediaPermission>;
  /**
   * ⚠ 자산별 getAssetInfo 호출 금지 — 60개 원본 직렬 해석은 페이지당 ~20초다.
   * 그리드는 raw uri(iOS ph://)를 그대로 그린다(§7 추가 보존).
   */
  listAssets(input: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize: number;
    readonly kinds: readonly MediaKind[];
  }): Promise<DeviceAssetPage>;
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

전신의 한국어 하드코딩은 **리터럴 24개**(V6 실측: uploader 17 · devicePhotoLibrary 4 · saveImages 2 · hashFile 1). 그중 크기 초과 문구만 값이 섞이므로 함수, 나머지는 상수 — **19키**. expo-ui `UiStrings + enStrings/koStrings` 패턴을 그대로 계승한다.

```ts
// "./core" — src/core/strings.ts
export interface MediaStrings {
  // 기기 라이브러리 (devicePhotoLibrary.ts 4)
  readonly deviceInfoTimeout: string;          // 사진 원본 정보 조회 타임아웃(15s)
  readonly iCloudDownloadTimeout: string;      // iCloud 원본 다운로드 타임아웃(60s)
  readonly iCloudOnly: string;                 // 원본이 iCloud에만 있음
  readonly fileNotFound: string;               // 로컬 파일 없음/판독 불가 (hashFile 1 공유)
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
export type MediaContentType =
  | 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/gif'
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

export type MediaTelemetry = {
  event(name: string, payload?: Readonly<Record<string, unknown>>): void;
};
export type MediaDebugOptions = {
  readonly enabled: boolean;
  readonly tag?: string | undefined;
  readonly context?: (() => Record<string, unknown>) | undefined;
};
```

### 5.2 에러 — 코드 13종

```ts
// "./core" — src/core/errors.ts
export const MEDIA_ERROR_CODES = [
  'device-timeout',          // 자산 정보 조회 데드라인 초과
  'device-icloud-only',      // 원본이 iCloud에만 있음
  'device-not-found',        // 로컬 파일 없음/판독 불가
  'unsupported-file-type',
  'file-too-large',
  'upload-failed',
  'save-permission-denied',
  'save-download-failed',
  // ── 신설 5종 (V6 실측: uploader.ts에 한국어 bare Error 9사이트) ──
  'permission-denied',       // 918/937/973/998 — 호스트가 "설정으로 이동" UI를 띄울 근거
  'poster-upload-failed',    // 237/295
  'no-media-selected',       // 625
  'picked-asset-invalid',    // 678/717
  'config-invalid',          // 어댑터·네임스페이스 오구성. 부팅 시 즉사
  'platform-unsupported',    // web 포크의 resolve/upload 경로(§8.5)
] as const;
export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number];

export class MediaError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode, message: string);
}

/**
 * §2.4 splitting:false로 엔트리마다 코어가 복제되므로 `instanceof`는 반드시 깨진다.
 * Symbol.for 태그로 사본 간 인식을 보장한다.
 *   ⚠ 브랜드(src/core/brand.ts)는 `Symbol()` — 목적이 정반대다.
 *     브랜드 = 위조 차단(전역 레지스트리 금지) / 에러 태그 = 사본 인식(전역 레지스트리 필수).
 */
export function isMediaError(error: unknown): error is MediaError;
export function mediaErrorCode(error: unknown): MediaErrorCode | null;
/** MediaError의 message는 이미 사용자 노출 가능 문구다(strings 주입 결과). */
export function mediaErrorUserMessage(error: unknown): string | null;
/** switch의 default에서 호출하면, 코드가 추가될 때 소비자에게 컴파일 에러가 난다. */
export function assertNeverMediaError(code: never): never;
```

**코드 13종은 총망라가 아니다** — 신설 5종은 V6에서 실측한 bare Error 9사이트에 1:1 대응한다. 전신 `errors.ts` 주석이 요구한 "callers classify by `code`"를 코드 전체가 처음으로 만족한다.

### 5.3 mediaTypes · metadata · hash · staging · debug (순수 모듈)

```ts
// src/core/mediaTypes.ts — 전신 168줄의 단일 테이블을 그대로 이전
export function detectMediaContentType(mime?: string | null, nameOrUri?: string | null): MediaContentType | null;
export function inferMediaContentType(mime?: string | null, nameOrUri?: string | null): MediaContentType;
export function mediaKindOf(contentType: MediaContentType): MediaKind;
export function extensionForContentType(contentType: MediaContentType): string;
/** DOM File 불필요 — `{ name, type }` 구조 타입(§7 하드닝 10). */
export function isSupportedMediaFile(file: { readonly name: string; readonly type?: string | undefined }): boolean;

// src/core/metadata.ts — 전신 290줄. BinarySource 기반으로 DOM lib 제거
export type GeoPoint = { readonly latitude: number; readonly longitude: number };
export type MediaMetadata = {
  readonly capturedAt?: string | undefined;
  readonly location?: GeoPoint | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
};
/** ⚠ 유효값이 없으면 undefined를 반환한다 — 빈 객체 금지(전신 규칙 보존). */
export function mediaMetadataFromExif(exif?: Readonly<Record<string, unknown>> | null): MediaMetadata | undefined;
export function mediaMetadataFromJpeg(source: BinarySource): Promise<MediaMetadata | undefined>;

// src/core/hashFile.ts (§9)
export const HASH_CHUNK_BYTES: number;                       // 3 * 256 * 1024 — 3의 배수
/** ⚠ chunkBytes 인자를 공개하지 않는다 — 3의 배수 제약은 타입으로 표현 불가(§6.1-⑩). */
export function computeChunkRanges(size: number): readonly ChunkRange[];
export function sha256Hex(bytes: Uint8Array): string;
export function createSha256(): { update(bytes: Uint8Array): void; hex(): string };
/** FileSystemAdapter 위에 base64 윈도우 스트리밍 해시를 조립. HashAdapter를 만족한다. */
export function createFileHasher(input: { readonly files: FileSystemAdapter }): HashAdapter;

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
export function createMediaDebugLogger(input: {
  readonly platform: PlatformAdapter;
  readonly options?: MediaDebugOptions | undefined;
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
  readonly collectionId?: TCollectionId | null | undefined;
  readonly photo?: MediaMetadata | undefined;
  readonly durationMs?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
};

export interface LocalUploads<TAsset, TCollectionId extends string = string> {
  uploadLocalFile(input: LocalUploadInput<TCollectionId>): Promise<UploadResult<TAsset>>;
  /** 피커 자산 1건 — PickerFlows가 위임한다. */
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
  }): Promise<UploadResult<TAsset>>;
  /**
   * 웹 드롭 다건.
   * ⚠ 첫 presign **이전에** 배치 전체를 검증한다 — 혼합 드롭 부분 업로드 방지(§7 하드닝 10).
   */
  uploadDropped(
    files: readonly NamedBinarySource[],
    options?: {
      readonly collectionId?: TCollectionId | null | undefined;
      readonly maxFiles?: number | undefined;
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
  readonly max?: number | undefined;
  readonly kinds?: readonly MediaKind[] | undefined;   // 기본 ['image']
};

export interface PickerFlows<TAsset, TCollectionId extends string = string> {
  pick(options?: { readonly max?: number | undefined; readonly kinds?: readonly MediaKind[] | undefined } | undefined):
    Promise<readonly PickedAsset[]>;
  pickAndUpload(options?: PickUploadOptions<TCollectionId> | undefined): Promise<readonly UploadResult<TAsset>[]>;
  captureAndUpload(options?: (PickUploadOptions<TCollectionId> & { readonly kind?: MediaKind | undefined }) | undefined):
    Promise<readonly UploadResult<TAsset>[]>;
}

export function createPickerFlows<TAsset, TCollectionId extends string = string>(input: {
  readonly picker: PickerAdapter;
  readonly uploads: LocalUploads<TAsset, TCollectionId>;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
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

export interface DeviceLibrary {
  getPermission(): Promise<MediaPermission>;
  requestPermission(): Promise<MediaPermission>;
  fetchPage(input?: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize?: number | undefined;           // 기본 60
    readonly kinds?: readonly MediaKind[] | undefined;
  } | undefined): Promise<DeviceAssetPage>;
  fetchAlbums(): Promise<readonly DeviceAlbum[]>;
  /** 하드닝 resolve — iCloud 가드 · 이중 타임아웃 · iOS 캐시 실체화(§7 하드닝 2·6). */
  resolveForUpload(asset: DeviceAssetRef, options?: DeviceResolveOptions | undefined):
    Promise<ResolvedDeviceAsset>;
}

export function createDeviceLibrary(input: {
  readonly adapter: DeviceLibraryAdapter;
  readonly files: FileSystemAdapter;
  /** ⚠ 필수 — 스테이징 사본을 만드는 주체가 지우는 주체를 반드시 갖는다(§3.1, §7 하드닝 7). */
  readonly staging: StagingCache;
  readonly platform: PlatformAdapter;
  readonly strings?: MediaStrings | undefined;
  readonly telemetry?: MediaTelemetry | undefined;
  readonly debug?: MediaDebugOptions | undefined;
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
  readonly telemetry?: MediaTelemetry | undefined;
}): DeviceUploads<TAsset, TCollectionId>;

// ── ⑥ 기기 저장 ─────────────────────────────────────────────────────────────
export type SaveableMedia = {
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

/** 저장 파일명 결정 우선순위: 저장된 fileName → contentType → URL 확장자 → jpg (5자 초과 확장자 거부). */
export function mediaDownloadFileName(input: {
  readonly url: string;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
  readonly prefix?: string | undefined;
}): string;

// ── ⑦ 스테이징 캐시 — §5.3 createStagingCache
```

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
    readonly poster?: LocalPosterAdapter | undefined;
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

  /** 각 with*는 자기 자신을 넓히지 않고 **구체 킷을 새로 반환**한다 — 조건부 타입 0(§3.1). */
  withPicker(picker: PickerAdapter): PickerFlows<TAsset, TCollectionId>;
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

// "./device"  ← expo-media-library/legacy, react-native   (browser 조건 → web 포크)
export function expoDeviceLibrary(): DeviceLibraryAdapter;

// "./save"    ← expo-media-library/legacy, react-native   (browser 조건 → web 포크)
export function expoDeviceSave(input?: {
  /** Constants.appOwnership === 'expo'. expo-constants peer를 없애기 위한 인자화(§0.2). */
  readonly isExpoGo?: boolean | undefined;
}): MediaLibrarySaveAdapter;

// "./video"   ← expo-video-thumbnails
export function expoVideoPoster(): LocalPosterAdapter;

// "./web"     ← peer 0 (DOM 필요)
export function webCanvasVideoPoster(input?: { readonly document?: Document | undefined }): BinaryPosterAdapter;
export function createFetchBinaryTransport(input?: { readonly fetch?: typeof fetch | undefined }): BinaryTransport;
/** document/fetch를 **필수 주입** — 네이티브에서 조용히 생성될 수 없다(§6.1-⑬). */
export function createBrowserSaveTarget(input: {
  readonly document: Document;
  readonly fetch: typeof fetch;
}): BrowserSaveAdapter;

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
| **`telemetry` operation 이름 리터럴 유니언** | 호스트가 자체 이름을 붙일 수 있어야 함 |

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
// @ts-expect-error 19키 중 일부만
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
```

---

## 7. 하드닝 보존 매핑

**난제 E의 11종 전부 + 원본 주석에 근거가 있는 추가 10종.** 정적으로 붙잡을 수 있는 것은 가드 테스트로 못 박는다 — 주석은 리팩터링을 이기지 못한다.

| # | 하드닝 (전신 위치) | 새 주소 | 보존 형태 | 그것을 지키는 테스트 |
|---|---|---|---|---|
| 1 | **iOS 26 URLSession 크래시** — `FileSystem.uploadAsync`(레거시 URLSession 브리지)가 파일 기반 업로드 시작 중 Expo Go를 종료. promise가 reject될 기회조차 없다 (`uploader.ts:134-156 uploadNativeFile`) | 계약: `LocalFileTransport.putLocalFile`의 TSDoc **"파일 바이트를 JS 힙으로 읽지 말 것"**(core/adapters.ts §3.3). 구현: `src/expo/transport.ts` — `new File(uri).upload(url, { sessionType:'foreground', uploadType: BINARY_CONTENT })`. **원본 주석 전문 이전** | ✅ `hardening-guard`: `src/**`에 `uploadAsync` 문자열 0건. unit: 페이크 fs가 `readBase64` 미호출임을 단언(= 바이트를 읽지 않았다는 직접 증거) |
| 2 | **PhotoKit ph:// 핸드오프** — iOS `localUri`가 Photos 컨테이너를 가리켜 stat은 되지만 네이티브 URLSession을 죽인다. 앱 캐시로 실체화 후 업로드. **iOS는 file:// 여도 반드시 카피**, 비-iOS만 직행 (`devicePhotoLibrary.ts:95-165`) | **정책은 core**: `src/core/device/resolveSource.ts` `normalizeUploadUri(asset, candidates, { platform, staging, files })` 순수 함수. 후보 순서(localUri → uri → extra), `isFileUri(uri) && platform.os !== 'ios'`만 직행, 카피 실패 시 **다음 후보 진행**. I/O만 어댑터(`files.copy`/`files.stat`) | ✅ unit(페이크 fs): ios + `ph://` → copy 호출 / android + `file://` → copy 미호출 / **ios + `file://` → copy 호출**(전신 규칙) / 첫 후보 copy 실패 → 다음 후보 시도. **전신은 앱 jest 경유 간접 검증뿐이었다** |
| 3 | **Android fileSize 불일치** — `quality<1` 재인코딩 시 `asset.fileSize`가 원본 크기를 보고해 스토리지 수신 바이트와 어긋나 서버가 거절 (`uploader.ts:818-865`) | `src/core/upload/resolveSize.ts` `resolveUploadSize()` 순수 함수(우선순위 verified → file-system → reported). **필드명이 신뢰도를 표현**: `verifiedSizeBytes` / `reportedSizeBytes`. 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`와 `as ImagePicker.ImagePickerAsset` 캐스트 소멸. `FileStat` 판별 유니언이 `exists && !isDirectory` 5중복 제거 | ✅ unit: 3분기 각각 + 전부 부재 시 null + `source` 필드 단언. 타입: `UploadSizeSource` exhaustive `satisfies` |
| 4 | **웹 duration 초/밀리초 혼동** — expo-image-picker 웹이 `HTMLVideoElement.duration`(초)을 그대로 전달해 20분 영상이 1200ms로 저장되고 어떤 캡도 통과 (`uploader.ts:736-748`) | **core 단일 지점**: `src/core/upload/duration.ts` `normalizeDurationMs(raw, platform.os)`. `PickedAsset.durationRaw` 필드명 + TSDoc **"어댑터는 변환 금지"**로 이중 변환 차단 | ✅ unit: os='web' × 20 → 20000 / os='ios' × 20000 → 20000 / 0·음수·NaN → undefined. **어댑터 경계 분산 + 브랜드 방어는 기각**(§0.4 기각 6) |
| 5 | **Android 13+ 권한 granular 목록** — 목록 생략 시 매니페스트의 모든 권한이 대상이 되어, 거부된 READ_MEDIA_AUDIO가 유효한 사진·동영상 허용을 거부처럼 보이게 만든다(선택한 사진 모드 포함) (`mediaPermission.ts:11-14`) | `src/device/expo.ts` — `DEVICE_MEDIA_PERMISSIONS: GranularPermission[] = ['photo','video']` 상수 + `getPermissionsAsync(false, …)` / `requestPermissionsAsync(false, …)`. **원본 주석 전문 이전**. `DeviceLibraryAdapter.requestPermission()` TSDoc에 함정 경고 각인(커스텀 어댑터 구현자 보호). `accessPrivileges === 'limited'` → `limited` 매핑 보존 | ✅ `hardening-guard`: **읽기 경로**(`src/device/**`)의 `get/requestPermissionsAsync(` 호출에 granular 목록 인자 필수. ⚠ `src/save/**`의 `requestPermissionsAsync(true)`(writeOnly)는 목록 없음이 정상이므로 **명시 예외**(§0.4 기각 9) |
| 6 | **iCloud 원본 미다운로드 기본값** — 레거시 API는 `shouldDownloadFromNetwork`가 기본 true라 무단 셀룰러 전송을 시작. 기본 false + 전경 옵트인, **15s/60s 이중 타임아웃** (`devicePhotoLibrary.ts:15-16, 55-93, 293-316`) | 정책 전부 core: `src/core/device/resolveSource.ts` — `DEVICE_ASSET_INFO_TIMEOUT_MS=15_000`, `DEVICE_ASSET_NETWORK_DOWNLOAD_TIMEOUT_MS=60_000`, `isNetworkAsset && !downloadFromICloud → MediaError('device-icloud-only')`, `onICloudDownload(true/false)` **finally 보장**. 어댑터는 `getAssetInfo(id, { downloadFromNetwork })` 필수 인자만 — 기본값 결정권이 어댑터에 없다 | ✅ 타입: 인자 생략 → 컴파일 에러(§6.3-⑥). unit(가짜 타이머): 기본 false 전달 / `isNetworkAsset` + 옵트인 없음 → `device-icloud-only` / 옵트인 시 60s 타임아웃 → `device-timeout` / `onICloudDownload` true·false 쌍 호출 |
| 7 | **스테이징 카피 정리** — 누락 시 업로드한 모든 사진의 원본 사본이 앱 컨테이너에 영구 축적. 프리픽스 매칭으로 자기 파일만 삭제 (`deviceUploadCache.ts:8,25-34`, `uploader.ts:798-802,891-895`) | `src/core/staging.ts` `StagingCache` — `uriFor`(id 새니타이즈 + 확장자 정규화 보존) / `owns` / `cleanup`. 프리픽스는 `namespace`로 **설정 가능**(호스트 이름 누출 제거, 제약 5). **안전성 강화**: `includes(prefix)` → 3조건(캐시 디렉토리 시작 + 파일명이 prefix로 시작 + 하위 경로 없음). **cleanup은 캐시 객체 메서드** — 만든 주체가 지운다. `staging`은 `createDeviceLibrary` 필수 인자 | ✅ unit: 업로드 **성공·실패 양쪽**에서 cleanup 정확히 1회 / 다른 프리픽스·다른 디렉토리·prefix가 중간에 낀 경로 전부 no-op / `''`·`'-'`·`'a'`·31자 네임스페이스 → `config-invalid`. 타입: §6.3-① |
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
| 포스터 실패가 동영상 업로드를 막지 않는다 | `src/core/upload/uploader.ts` — poster try/catch → null | unit: poster가 null·throw 둘 다 완료됨 + `poster` 필드 부재 |
| 정보 조회 실패 시 폴백 후보가 있으면 생존, 없으면 원 에러 표면화(재시도 가능 실패를 "파일 없음"으로 오독 금지) | `src/core/device/resolveSource.ts` | unit: 후보 유/무 2케이스 |
| 웹 저장의 `download=1&filename=` 리다이렉트 트릭 + **CORS 실패 시 숨김 iframe 폴백**(앱 화면 교체 방지, 60초 후 제거) (`saveImages.ts:150,190-197`) | `src/save/web.ts` (`browser` 포크) | unit(jsdom): anchor 경로 + fetch 실패 시 iframe 생성·60s 후 제거 |
| 다운로드 status **2xx 범위** 검증 + 실패 시 임시 파일 정리 (`saveImages.ts:214-225`) | `src/core/save/index.ts` 정책 | unit: 3xx/4xx → `save-download-failed` + `files.remove` 호출 |
| 저장 파일명 우선순위(저장된 fileName → contentType → URL 확장자 → jpg, **5자 초과 확장자 거부**) — 토큰 프록시 URL엔 확장자가 없다 | `src/core/save/fileName.ts` `mediaDownloadFileName()` | unit: 4분기 + 긴 확장자 거부 |
| Android Expo Go 권한 요청 스킵 (`saveImages.ts:96`) | `MediaLibrarySaveAdapter.skipPermissionRequest` — expo-constants 의존을 인자로 승격 | unit: true면 `requestWritePermission` 미호출 |

---

## 8. `.web.ts` 플랫폼 포크 × tsup 빌드 해법

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
2. **`browser`가 최상단.** 조건은 선언 순서 첫 매치가 이긴다.
3. **모든 조건 브랜치에 `types`, 양 포크는 같은 `.d.ts`.** Expo의 `tsconfig.base`가 `customConditions: ["react-native"]`를 설정하므로(V7) 브랜치 누락 시 타입 해석이 새고, CJS TS 소비자는 `d.cts`가 없으면 `TS1479`를 받는다.
4. **CJS 빌드는 이관의 필수 조건.** jest는 CJS이므로 `require` 조건이 `.cjs`를 주지 못하면 ESM dist를 파싱하다 실패한다(node_modules는 `transformIgnorePatterns` 대상).
5. **`.web.ts` 파일명 규약 폐지.** 파일명은 `src/device/{expo,web}.ts`이고 tsup 엔트리 `src/device.ts`/`src/device.web.ts`가 각각 배럴이다. 포크 라우팅은 exports 맵 한 곳에만 존재한다 — 두 진실 금지.
6. **`splitting: false`** — 케이스 B 재발 방지 + dist-peer-graph 검사 단순화.

### 8.5 web 포크의 동작 규약

| 표면 | web 포크 동작 | 근거 |
|---|---|---|
| `getPermission` / `requestPermission` | `{ granted: false, canAskAgain: false, limited: false }` | UI가 "이 플랫폼에선 사용 불가"를 그릴 수 있어야 하므로 throw는 과잉 |
| `listAssets` / `listAlbums` | 빈 페이지 / 빈 배열 | 동일 |
| `getAssetInfo` | `MediaError('platform-unsupported')` | 전신은 plain `Error("Device photo library is not available on web.")`라 code 분기 불가였다 — 개선점 |
| `"./save"` web 포크 | MediaLibrary import 0. `createBrowserSaveTarget` 기반 구현이 정본 — 전신 `saveImages.ts`의 `Platform.OS === 'web'` 분기가 **구조적으로 소멸**한다 | §6.1-⑬ |

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
| `dist-peer-graph` | 빌드 산출물에서 엔트리별 외부 specifier 집합을 재귀 추출해 **§2.2 표와 정확히 대조**. **ESM(`.js`)·CJS(`.cjs`) 양쪽** | §3.2. V4로 기법 검증 완료 |
| `test-purity-guard` | `tests/unit/**`에 `expo-`·`react-native` import 0건 | 목표 (a)가 문서 주장이 아님을 보장 |
| `string-guard` | `new MediaError(`의 두 번째 인자가 `strings.` 멤버 접근이 아니면 실패 | §4 |
| `hardening-guard` | ① `src/**`에 `uploadAsync` 0건 ② `src/device/**`의 `get/requestPermissionsAsync(`에 granular 목록 인자 필수(**`src/save/**`는 명시 예외**) ③ 로거 인자에 `uri`/`url` 원문 전달 금지(`summarizeUri(` 경유만) ④ `HASH_CHUNK_BYTES % 3 === 0` ⑤ `listAssets` 구현부에 `getAssetInfo` 호출 0건 | §7. 주석은 리팩터링을 이기지 못한다 |

### 10.4 integration

**없음** — 외부 서비스가 아니라 실기기가 필요하다(expo-ui 선례). `test:all = unit → types`. 대신 **네이티브 실기 체크리스트**를 README에 명문화하고 이관 순서 7단계(§11.5)에서 실행한다:

1. iOS 26 실기기 대용량(>100MB) 동영상 업로드 — 하드닝 1
2. iCloud 전용 자산 resolve(기본 차단 / 옵트인 다운로드) — 하드닝 6
3. Android 재인코딩 자산의 크기 일치 — 하드닝 3
4. Android 13+ 권한(전체 허용 / 선택한 사진 / 오디오 거부 상태) — 하드닝 5
5. 웹 드롭 혼합 배치(지원+미지원) — 하드닝 10
6. `expo export --platform web` 산출물에 `expo-media-library` 문자열 부재 — §8 채택안의 실앱 검증
7. Hermes에서 15MB 해시 소요 시간 — §9

### 10.5 README 컴파일 검증

`expo-ui/scripts/check-readme.mjs`를 복제하되 `paths`를 9개 서브패스로 확장하고, 예제가 import하는 `expo-*`는 ambient `declare module`로 선언한다(라이브러리 유래 식별자만 실타입). `pnpm check:readme`.

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

**pack 후 필수 검증 3건**
1. `files: ["dist"]` 산출물에 **`.cjs`가 포함**되는지 — jest(CJS)는 `require` 조건으로 `.cjs`를 받으며, 없으면 ESM을 파싱하다 실패한다.
2. `dist/device.web.{js,cjs}` · `dist/save.web.{js,cjs}`가 tarball에 들어가는지 — 누락 시 web 빌드가 `InvalidPackageConfigurationError`로 즉사한다.
3. jest에서 `require('@gj-kit/expo-media/device')`가 **네이티브 `.cjs`**를 받는지 — V1의 케이스 E를 실앱에서 재확인(§8.4 규칙 1이 지켜졌는지의 최종 관문).

### 11.3 수정 인벤토리 — `apps/mobile/src/photos/` (21파일)

| 파일 | 작업 | 난도 |
|---|---|---|
| **`adapters.ts` (신설)** | expo 어댑터 조립: `createMediaKit({ api, limits, strings: koMediaStrings, namespace: 'memorylog' })` + `.withPicker(expoPicker())` + `.withDeviceLibrary(expoDeviceLibrary())` + `.withDeviceSave(expoDeviceSave({ isExpoGo }))` + `poster: expoVideoPoster()`. **`.web.ts` 쌍 불필요** — 포크는 라이브러리 exports가 소유한다(§8) | ~30줄, 유일한 실작업 |
| `kit.ts` (60줄) | **재작성** — `createPhotoUploader` → `adapters.ts` 위임. `limits`·`fileNamePrefix`·`debugTag`·`debugContext` 1:1 이전, telemetry 브리지 유지 | 중 |
| `uploadPhoto.ts` (128줄) | import 경로 교체 + **`UploadResult` 언랩**(`.asset`). `albumId`→`collectionId` 매핑은 이미 존재 | 기계적 |
| `saveImages.ts` (52줄) | `saveImagesToDevice(images, deps)` → `createMediaSaver({ target })`. **`withFreshImageUrls`(앱 고유 로직)는 그대로**. target을 어댑터가 고정 주입하면 호출부 무변경으로 흡수 | 소 |
| `devicePhotoLibrary.ts` (21줄) | 재export 출처를 `@gj-kit/expo-media/device` + 킷 메서드 위임. 심볼명 매핑 필요 | 소 |
| `mediaTypes.ts`, `debug.ts`, `deviceUploadCache.ts`, `errors.ts`, `hashFile.ts`, `mediaPermission.ts`, `photoMetadata.ts` (7파일) | 재export 출처 교체 + 심볼명. `deviceUploadCache.ts`는 `staging` 객체 재export로 형태 변경 | sed × 7 |
| `uploadDeviceAssets.ts`, `pendingPhotos.ts` (192줄) | 타입 심볼만: `MediaLibrary.Asset` → `DeviceAssetRef`, `ImagePicker.ImagePickerAsset` → `PickedAsset`. 로직 무변경 | 소 |
| `devicePhotoLibraryTelemetry.ts` (143줄) | 타입 import 경로만 | sed |

**소계: 신설 1 + 재작성 1 + 기계적 12 = 비테스트 14파일.**

### 11.4 수정 인벤토리 — 테스트·설정

| 파일 | 작업 |
|---|---|
| `src/photos/uploadPhoto.test.ts:43` | `jest.mock(".../packages/photo-kit/src/hashFile")` **딥 경로 mock 삭제** → `createMediaKit({ hasher: fakeHasher })` 어댑터 주입 |
| `src/photos/devicePhotoLibrary.test.ts:24` | `jest.mock(".../mediaPermission")` **삭제** → `createFakeDeviceLibrary()` 주입 |
| `src/photos/mediaPermission.test.ts:10` | `packages/photo-kit/src/mediaPermission` **직접 import** → `@gj-kit/expo-media/device` |
| 나머지 photos 테스트 4파일 | **무변경** (모듈 경계를 mock) |
| `jest.mock(".../photos")` 11파일 / 17사이트 | **무변경** — 어댑터 모듈 경계가 그대로 |
| `apps/mobile/package.json` | `@memorylog/photo-kit`·`js-sha256` 제거(앱 소스 사용처 0건 실측), `@gj-kit/expo-media` file: 추가, `build:workspace-deps`에서 photo-kit 제거 |
| `apps/mobile/tsconfig.json` | `paths`에서 `"@memorylog/photo-kit"` 제거 (남기면 tarball 대신 삭제된 소스를 가리킨다) |
| `apps/mobile/jest.config.ts` | `moduleNameMapper`에서 `"^@memorylog/photo-kit$"` 제거 |
| 루트 `package.json` | `workspaces: ["apps/*","packages/*"]` 글롭이므로 **디렉토리 삭제로 자동 반영**. `package-lock.json` 재생성 |

**세 딥 경로 수정은 전부 모킹이 줄어드는 방향이다** — 어댑터 seam의 직접적 이득이자 실효 증거다(모킹 순감 −2건).

### 11.5 이관 순서 (되돌리기 가능한 단계)

1. gj-kit에서 `pnpm build && pnpm test:all && pnpm check:readme` 통과 → `pnpm pack` → §11.2의 pack 후 검증 3건 → vendor 커밋
2. memorylog2에 tarball + dep 추가. **`@memorylog/photo-kit`은 아직 남겨둔다**
3. `src/photos/adapters.ts` 신설 + `kit.ts` 재작성 → `npm --workspace @memorylog/mobile run typecheck` (**여기서 모든 시그니처 불일치가 드러난다**)
4. 재export·심볼 교체 12파일 → typecheck
5. `jest --runInBand` → 딥 경로 3건 수정 → 전체 그린 확인 (photos 테스트 + 소비처 스위트 + `jest.mock` 11파일이 그대로 통과하는지가 무영향 주장의 검증이다)
6. `packages/photo-kit` 삭제 + 설정 4파일 정리 → 최종 typecheck/test
7. §10.4 네이티브 실기 체크리스트 7종 실행

### 11.6 총계

| 항목 | 수치 |
|---|---|
| 삭제 | **14파일 2,764줄** (+ README·설정·dist) |
| 신설 | **1파일** (`adapters.ts` ~30줄) |
| 재작성 | **1파일** (`kit.ts`) |
| 기계적 수정 | **12파일** |
| 테스트 수정 | **3파일** (전부 모킹 삭제 방향) |
| 설정 수정 | **4파일** |
| **무변경** | **콜사이트 40 import / 20파일 · `jest.mock` 17사이트 / 11파일 · 화면·라우트 0수정** |

### 11.7 이관 시 주의 — 파괴적 변경 2건

1. **`UploadResult<TAsset>` 반환 통일.** 전신은 `uploadLocalUriToIntent`만 `{asset, duplicate}`를 반환하고 나머지는 bare `TAsset`을 반환했으며, 그 간극을 `uploader.ts:185`의 `WeakSet` + `isDuplicateUploadAsset`으로 메웠다. 통일은 옳지만 **`app/records/[id].tsx`가 `isDuplicateUploadAsset`을 직접 호출한다** — 라우트 파일이다. `src/photos/uploadPhoto.ts`가 `.asset`을 벗겨 반환하면 duplicate 비트가 소실되므로, **어댑터가 `UploadResult`를 그대로 노출하고 라우트 1곳을 `result.duplicate`로 고치는 편**이 정답이다. 이 1파일은 §11.6의 "화면·라우트 0수정"에 대한 **유일한 예외**이며, 지금 하지 않으면 영구 부채가 된다.
2. **`saveImagesToDevice` 시그니처.** `useAlbumImageMutations.ts`가 유일한 파급 지점이지만, `src/photos/saveImages.ts` 어댑터가 `SaveTarget`을 고정 주입하면 호출부 무변경으로 흡수된다(권장).

---

## 12. 잔존 리스크

1. **`expo export --platform web` 실앱 검증 미완.** `dist-peer-graph` 가드는 **우리 패키지만** 검사한다. nativewind·expo-router가 개입한 실앱 그래프에서 `expo-media-library`가 다른 경로로 딸려올 가능성을 배제하지 못했다. §10.4 체크리스트 6번이 유일한 관문이며, **구현 1일차에 스텁 패키지로 선검증**할 것.
2. **`expo-file-system` 신 File API의 버전 하한.** `new File(uri).upload()`가 정확히 어느 버전부터 존재하는지 미확인이고, 확인된 것은 SDK 56(`~56.0.8`)뿐이다. 이것이 하드닝 1(iOS 26 크래시 회피)의 **유일한 수단**이므로 하한을 잘못 선언하면 구버전 소비자가 정확히 그 크래시를 만난다. peer range(`>=54`)는 배포 전 실측으로 확정할 것.
3. **순수 TS SHA-256의 Hermes 성능 미실측.** 전신 `js-sha256`도 순수 JS라 회귀는 아니지만, js-sha256은 언롤링 최적화가 되어 있어 소박한 구현이 2~3배 느릴 수 있다. 15MB = 20청크 × (base64 디코드 + 해시)가 체감 지연이 되면 골든패스가 손상된다. 완화책은 `HashAdapter` 슬롯이지만 **그 경로에는 아직 구현체가 없다**.
4. **iOS 26 URLSession 하드닝은 "다시 쓰지 않음"만 보장된다.** `hardening-guard`의 `uploadAsync` 금지는 재발을 막을 뿐, `new File().upload()`가 앞으로도 안전한지는 실기기 검증뿐이며 gj-kit CI에는 그 수단이 없다. **라이브러리화로 검증이 오히려 멀어진 유일한 지점**이다.
5. **`splitting:false`의 코드 복제.** 엔트리 격리를 얻는 대가로 코어가 엔트리마다 복제된다. `MediaError`는 `Symbol.for` 태그로 해결했지만, 소비자가 `koMediaStrings` 등 다른 export의 **객체 정체성을 엔트리 간에 비교하면 어긋난다**(expo-ui §12-9와 동종). README 경고가 유일한 방어.
6. **웹 jest에서 `browser` 조건이 매치된다.** jsdom 환경은 `browser` 조건을 붙이므로 `@gj-kit/expo-media/device`가 web 포크로 로드된다. 이는 **의도한 동작**이지만, 앱이 웹 jest에서 네이티브 어댑터를 테스트하려 하면 빈 결과와 `platform-unsupported`를 보고 혼란스러울 수 있다. README의 플랫폼 동작 표로 완화.
7. **엔트리 9개의 인지 부담.** expo-ui 4, toss-payments 5보다 많다. "엔트리 1개 = optional peer 1개" 규칙이 성립하는 한 외울 것은 규칙 하나지만, `./video`처럼 작은 엔트리를 `./picker`에 합치자는 반론이 나올 수 있다(합치면 `expo-video-thumbnails`가 피커 소비자에게 강요된다는 대가가 생긴다).
8. **팩토리 7종 조립의 첫인상 비용.** `"./core"` 소비자는 `createLocalUploads` → `createDeviceLibrary` → `createDeviceUploads`를 순서대로 엮어야 한다. `createMediaKit` + `with*`가 골든패스를 한/두 줄로 유지하지만, 커스텀 어댑터 경로의 학습 곡선은 실재한다. README에 3종 소비자 시나리오(§2.2 표) 전문을 게재해 완화.
9. **`"./device"` web 포크가 열거는 graceful·resolve는 throw로 갈리는 것은 학습 비용이다.** 전신 동작을 보존한 판정(§6.1-⑭)이지만 "어떤 건 빈 배열, 어떤 건 예외"는 처음 보는 사람에게 일관성 없어 보인다. TSDoc과 README 플랫폼 표로만 완화 가능.
10. **`BinarySource` 추상화가 DOM `File`의 일부 실사용을 놓친다.** `lastModified`(memorylog2 `pendingPhotos`의 dedup 키에 사용됨), `slice()` 등은 계약에 없다. 그 코드는 앱에 남으므로 이번 이관에선 무해하지만, 웹 소비자가 늘면 재검토 대상.
11. **`jest-expo`의 조건 세트 변화 위험.** 본 설계는 `['require','react-native']`(V2 실측) 위에 서 있고, bare `react-native` 키를 두지 않아 그 조건이 사라져도 `require`로 안전하게 떨어진다. 그러나 jest-expo가 향후 `browser`를 네이티브 프리셋에 추가하는 등 예상 밖 변경을 하면 §11.2의 pack 후 검증 3번이 잡아야 한다 — **CI에 그 검증을 상시화할 것.**
