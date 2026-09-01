export const SITE_URL = 'https://gj-kit.github.io/gj-kit';
export const REPOSITORY_URL = 'https://github.com/gj-kit/gj-kit';

/**
 * Family-level copy for the documentation landing page and the repository
 * README. `heroTagline` is the first line a visitor reads, so it states the
 * shared promise rather than the taxonomy; `pillars` back that promise with the
 * mechanism, and every number in `proof` is a measured, rounded-down floor.
 *
 * Refresh the numbers with `corepack pnpm -r test` for unit totals, and with a
 * recursive grep for `@ts-expect-error` under each package's tests/types for the
 * compile-guard totals.
 */
export const family = {
  heroTagline: {
    en: "Ten TypeScript libraries where the step you'd forget is a compile error.",
    ko: "빠뜨린 한 줄이 장애가 아니라 컴파일 에러로 돌아오는 TypeScript 라이브러리 열 개입니다.",
  },
  heroSubtitle: {
    en: "Ten packages covering Expo, React Native, NestJS, PostgreSQL and Toss Payments, each built around one boundary where a silent mistake costs money, data, or a user's session. They are for teams who would rather meet the bug in tsc than in an incident channel.",
    ko: "Expo·React Native·NestJS·PostgreSQL·토스페이먼츠까지, 조용한 실수 하나가 돈이나 데이터, 사용자 세션을 잃게 만드는 경계마다 패키지를 하나씩 두었습니다. 그 버그를 장애 대응 채널이 아니라 tsc에서 먼저 만나고 싶은 팀을 위한 것입니다.",
  },
  pillars: [
    {
      title: {
        en: "The dangerous default does not exist",
        ko: "위험한 기본값 자체가 없습니다",
      },
      body: {
        en: "The argument you would have let default is required instead. `createTossPayments` returns a type with no `confirm` property until you pass an OrderStore, and no `billing` property until you pass a BillingKeyStore. `formatDateTime(instant)` does not compile, because `timeZone` has no default. `createTossPaymentsPostgres({ sql })` is a type error, because the encryption protector is a required field. Unlimited uploads have to be spelled `'server-enforced'`, because `Number.POSITIVE_INFINITY` is rejected.",
        ko: "기본값에 맡겼을 인자가 전부 필수입니다. `createTossPayments`는 OrderStore를 넘기기 전에는 `confirm` 프로퍼티가, BillingKeyStore를 넘기기 전에는 `billing` 프로퍼티가 아예 없는 타입을 돌려줍니다. `formatDateTime(instant)`는 `timeZone`에 기본값이 없어서 컴파일되지 않고, `createTossPaymentsPostgres({ sql })`은 암호화 protector가 필수 필드라 타입 에러입니다. 무제한 업로드도 `Number.POSITIVE_INFINITY`가 거부되기 때문에 `'server-enforced'`라고 직접 적어야 합니다.",
      },
    },
    {
      title: {
        en: "You cannot leave the branch out",
        ko: "분기를 빼놓을 수 없습니다",
      },
      body: {
        en: "The result you are handed is a union that names the branch you would otherwise drop. `matchRefreshOutcome` takes all five endings of a token refresh as handler keys — omit `transient` and the call does not compile, and `transient` is exactly the branch that turns a 5xx into a false sign-out. `saveWorkout()`'s `nativeId` is TS2339 until `status === 'saved'` narrows past the locked-device branch, which never appears during development. On a job result, `error` is unreachable until you switch on `status`.",
        ko: "돌려받는 결과가 union이라, 그냥 빠뜨렸을 분기에 이름이 붙어 있습니다. `matchRefreshOutcome`은 token refresh의 다섯 결말을 전부 핸들러 키로 받는데, `transient`를 빼면 그 호출은 컴파일되지 않습니다. 5xx를 오탐 로그아웃으로 바꾸는 분기가 바로 그것입니다. `saveWorkout()`의 `nativeId`도, 개발 중에는 한 번도 마주치지 않는 잠긴 기기 분기를 `status === 'saved'`로 좁혀 지나기 전에는 TS2339입니다. 잡 실행 결과의 `error` 역시 `status`로 좁히기 전에는 접근할 수 없습니다.",
      },
    },
    {
      title: {
        en: "The enforcement is itself tested",
        ko: "강제 장치도 테스트가 지킵니다",
      },
      body: {
        en: "{{guardTotal}} `@ts-expect-error` directives sit in {{guardFixtureFiles}} fixture files under `tests/types`, and `vitest typecheck` runs every one of them. TypeScript treats a directive that no longer catches anything as an error in its own right (TS2578), so a guard that quietly loosens fails the suite instead of passing it. A rule here cannot decay into a line of documentation without breaking the build.",
        ko: "`tests/types` 아래 {{guardFixtureFiles}}개 픽스처 파일에 `@ts-expect-error` {{guardTotal}}개가 들어 있고, `vitest typecheck`가 그 전부를 실행합니다. TypeScript는 더 이상 아무것도 잡아내지 못하는 directive 자체를 에러(TS2578)로 취급합니다. 그래서 강제가 느슨해지는 순간 테스트는 통과하는 게 아니라 깨집니다. 여기서는 규칙이 빌드를 깨뜨리지 않고서는 문서 속 한 줄짜리 권고로 전락할 수 없습니다.",
      },
    },
    {
      title: {
        en: "The half you own runs on Node",
        ko: "앱이 소유한 절반은 Node에서 돕니다",
      },
      body: {
        en: "Seven of the ten ship a framework-free `./testing` entry point, so the part you still own is checkable without the dangerous thing attached. `nest-notifications` hands you 30 runnable contract cases to point at your own database and `nest-operations-jobs` hands you 13. `toss-payments-postgresql` ships an in-memory double that throws on the nested lock PostgreSQL would silently hang on. `expo-workouts` fakes the native module seam rather than the API, so the real core code replays all six cursor-reset reasons under vitest.",
        ko: "열 개 중 일곱 개가 프레임워크 없는 `./testing` 엔트리를 함께 냅니다. 위험한 대상을 붙이지 않고도 앱이 소유한 부분을 검사할 수 있다는 뜻입니다. `nest-notifications`는 직접 운영하는 database에 그대로 겨눌 수 있는 적합성 케이스 30개를, `nest-operations-jobs`는 13개를 돌려줍니다. `toss-payments-postgresql`의 인메모리 대역은 PostgreSQL이라면 조용히 멈췄을 중첩 lock에서 그 자리에 예외를 던집니다. `expo-workouts`는 API가 아니라 그 아래 네이티브 모듈 seam을 대체하기 때문에, 실제 코어 코드가 cursor reset 사유 6종을 vitest에서 그대로 재현합니다.",
      },
    },
  ],
  proof: [
    { en: "0 runtime dependencies, in all ten", ko: "열 개 전부 런타임 의존성 0" },
    { en: "{{guardTotal}} @ts-expect-error guards, run by vitest typecheck", ko: "@ts-expect-error 가드 {{guardTotal}}개, vitest typecheck로 실행" },
    { en: "3,700+ tests on one `pnpm test` — no network, no device", ko: "`pnpm test` 한 번에 테스트 3,700개 이상 — 네트워크도 기기도 없이" },
    { en: "Dual ESM + CJS, TypeScript strict, Node 20+, MIT", ko: "ESM·CJS 듀얼, TypeScript strict, Node 20 이상, MIT" },
    { en: "One CI gate for every package: `pnpm verify:release`", ko: "모든 패키지가 통과하는 CI 게이트 하나 — `pnpm verify:release`" },
  ],
};

/**
 * One sentence per category, shown above that category's package cards.
 */
export const categoryBlurbs = {
  "Expo & React Native": {
    en: "Four packages for the boundaries where the platform itself fails silently: an IconButton with no accessible name, an upload that ends the process instead of rejecting, a 5xx classified as a sign-out, and a Health Connect upsert that deletes the route you left out.",
    ko: "플랫폼이 조용히 실패하는 네 지점을 하나씩 맡습니다. 접근성 이름이 없는 IconButton, reject 대신 프로세스를 끝내 버리는 업로드, 5xx를 로그아웃으로 오분류하는 refresh, 그리고 빠뜨린 route를 함께 지워 버리는 Health Connect upsert입니다.",
  },
  "Utilities": {
    en: "One package for the code that quietly forks into three copies. Time zone, date separator, ₩ versus 원, byte unit system, and the meaning of zero bytes are all required arguments, so two screens can only disagree if someone typed it that way.",
    ko: "포매터가 조용히 세 벌로 갈라지는 자리를 하나로 묶습니다. 시간대, 날짜 구분자, 통화 표기, 바이트 단위 체계, 0 바이트의 의미까지 전부 필수 인자라, 두 화면이 어긋나려면 누군가 그렇게 적어야만 합니다.",
  },
  "NestJS": {
    en: "Durable job and notification pipelines where the database stays yours: the library owns the ordering and liveness rules, refuses at boot the tuning that would let a job run twice, and hands you framework-free contract cases to run against your real store.",
    ko: "잡과 알림 파이프라인을 얹되 database는 그대로 앱이 소유합니다. 순서와 liveness 규칙은 라이브러리가 소유하고, 잡을 두 번 돌게 만드는 설정은 부팅에서 거부하며, 실제 store에 그대로 걸 수 있는 프레임워크 없는 적합성 케이스를 함께 냅니다.",
  },
  "Payments": {
    en: "The Toss Payments core, its Nest DI composition, and its PostgreSQL stores — where a confirm that skipped verification, a billing approve with no idempotency key, and a store assembled without an encryption protector are all compile errors.",
    ko: "토스페이먼츠 코어와 Nest DI 조합, PostgreSQL store 구현까지 세 패키지입니다. 검증을 건너뛴 confirm, 멱등키 없는 billing approve, protector 없이 조립한 store가 전부 컴파일 에러입니다.",
  },
};

/**
 * Product-language source of truth. Package versions, exports, and peer dependencies
 * deliberately do not live here: the snapshot generator reads those release facts.
 *
 * Per package:
 * - `tagline`   the payoff in one line, used as the lead on every surface
 * - `problem`   the failure modes a reader recognises from their own incidents
 * - `highlights` what the package does about them, each traceable to a symbol
 * - `proof`     measured facts, floors only, safe to leave unattended
 * - `showcase`  a second example past the wiring; type-checked by check:readme
 */
export const packages = [
  {
    slug: "expo-ui",
    name: "@gj-kit/expo-ui",
    category: { en: "Expo & React Native", ko: "Expo · React Native" },
    description: {
      en: "Accessible, token-driven UI primitives for Expo, React Native, and the web.",
      ko: "Expo, React Native, 웹을 위한 접근성 중심 토큰 기반 UI 프리미티브입니다.",
    },
    tagline: {
      en: "React Native and web primitives: an unnamed IconButton, Tabs, or Slider is a compile error.",
      ko: "이름 없는 IconButton·Tabs·Slider가 스크린 리더 버그가 아니라 컴파일 에러가 되는 React Native·웹 UI primitive 모음입니다.",
    },
    problem: {
      en: "In a React Native design system the failures are silent: an IconButton ships with no accessibility label, a Tabs value is typo'd so the panel renders blank, an EmptyState action renders a button whose onPress was never wired, and a hand-assembled theme object leaks undefined into a style prop. None of that fails the build — it fails on a screen reader, in production, on someone else's device.",
      ko: "React Native 디자인 시스템의 사고는 조용히 일어납니다. accessibility label 없는 IconButton이 그대로 배포되고, Tabs의 value 오타 하나로 panel이 빈 화면이 되고, EmptyState의 action이 onPress 없이 눌러도 아무 일 없는 버튼으로 렌더되고, 손으로 조립한 theme 객체가 style에 undefined를 흘립니다. 어느 것도 빌드를 깨뜨리지 않으니 스크린 리더에서, 프로덕션에서, 남의 기기에서야 드러납니다.",
    },
    highlights: [
      {
        title: {
          en: "Accessible names the type demands",
          ko: "접근성 이름을 타입이 요구합니다",
        },
        body: {
          en: "IconButton without accessibilityLabel, a rich-children Button with no name, and a range Slider given one label instead of a two-thumb tuple are all rejected.",
          ko: "accessibilityLabel 없는 IconButton, 이름을 유추할 수 없는 rich children Button, thumb이 둘인데 label은 하나인 range Slider가 모두 타입 검사에서 거부됩니다.",
        },
      },
      {
        title: {
          en: "Dead buttons do not compile",
          ko: "죽은 버튼은 컴파일되지 않습니다",
        },
        body: {
          en: "ButtonInteractionProps is a union: onPress is required unless disabled or loading is literally true, and an EmptyState action must carry both label and onPress.",
          ko: "Button·IconButton의 interaction prop이 union이라 disabled도 loading도 아니면 onPress가 필수이고, EmptyState의 action은 label과 onPress를 함께 요구합니다. 눌러도 아무 일 없는 버튼은 애초에 컴파일되지 않습니다.",
        },
      },
      {
        title: {
          en: "Tabs cannot lose a panel",
          ko: "Tabs는 panel을 잃지 않습니다",
        },
        body: {
          en: "panels is typed `Readonly<Record<NoInfer<ItemValue>, NonNullable<ReactNode>>>` and value is NoInfer-wrapped, so a typo’d value, a missing panel, and a null panel all fail typecheck.",
          ko: "panels 타입이 `Readonly<Record<NoInfer<ItemValue>, NonNullable<ReactNode>>>`이고 value에도 NoInfer가 걸려 있어, items에 없는 value 오타는 물론 panel 하나 누락이나 null panel까지 타입 검사에서 걸립니다.",
        },
      },
      {
        title: {
          en: "createTheme is the only door",
          ko: "theme은 createTheme만 만듭니다",
        },
        body: {
          en: "UiProvider's theme prop accepts only a branded Theme or ThemePair produced by createTheme or createThemes; a hand-assembled token object is a compile error.",
          ko: "UiProvider의 theme prop은 createTheme·createThemes가 찍어낸 branded Theme·ThemePair만 받습니다. 손으로 조립한 token 객체는 컴파일 에러라, 키가 빠진 반쪽 theme이 런타임에 undefined 스타일로 새지 않습니다.",
        },
      },
      {
        title: {
          en: "No design literals in the source",
          ko: "소스에 디자인 리터럴이 없습니다",
        },
        body: {
          en: "A guard test walks every .tsx file under src/components recursively and fails on any quoted hex color, any numeric fontSize, or any quoted numeric fontWeight.",
          ko: "guard 테스트가 src/components 아래 .tsx 파일을 재귀로 훑어, 따옴표 안 hex 색·숫자 fontSize·따옴표 안 숫자 fontWeight가 하나라도 남아 있으면 실패합니다. 토큰만 쓴다는 규칙을 리뷰가 아니라 테스트가 지킵니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "{{guards}} @ts-expect-error guards", ko: "@ts-expect-error 가드 {{guards}}개" },
      { en: "850+ unit tests", ko: "유닛 테스트 850개 이상" },
      { en: "58 components, 31 color roles", ko: "컴포넌트 58개, 색상 role 31개" },
    ],
    when: {
      en: "Use it when one design language, controlled component state, overlays, and accessibility behavior must work across native and web targets.",
      ko: "네이티브와 웹에서 하나의 디자인 언어, 제어 컴포넌트 상태, 오버레이, 접근성 동작을 함께 유지해야 할 때 사용합니다.",
    },
    avoid: {
      en: "Do not use it for product routes, data stores, analytics, or product-specific copy.",
      ko: "제품 route, 데이터 store, analytics, 제품 고유 문구를 이 패키지에 넣기 위한 용도로는 사용하지 마세요.",
    },
    goldenPath: {
      en: "Install the package, create your theme once, and place UiProvider at the application root before composing primitives.",
      ko: "패키지를 설치한 뒤 테마를 한 번 만들고, 프리미티브를 조합하기 전에 앱 루트에 UiProvider를 둡니다.",
    },
    code: "import { Button, UiProvider, enStrings } from '@gj-kit/expo-ui';\nimport { createThemes } from '@gj-kit/expo-ui/theme';\n\nconst themes = createThemes();\n\nexport function App() {\n  return (\n    <UiProvider theme={themes} strings={enStrings}>\n      <Button label=\"Get started\" onPress={() => {}} />\n    </UiProvider>\n  );\n}",
    showcase: {
      language: "tsx",
      code: "import { Tabs, Text, UiProvider, createThemes } from '@gj-kit/expo-ui';\n\ndeclare const onChange: (value: 'overview' | 'history') => void; // the app owns tab state\nconst items = [{ label: 'Overview', value: 'overview' }, { label: 'History', value: 'history' }] as const;\n\nexport const ProfileTabs = () => (\n  <UiProvider theme={createThemes({ light: { colors: { primary: '#1769C2' } } })}>\n    <Tabs\n      accessibilityLabel=\"Profile sections\"\n      items={items}\n      value=\"overview\"\n      onChange={onChange}\n      // Delete the history entry below and tsc stops the build:\n      // TS2741: Property 'history' is missing in type '{ overview: JSX.Element; }'\n      panels={{ overview: <Text>Overview</Text>, history: <Text>History</Text> }}\n    />\n  </UiProvider>\n);",
      caption: {
        en: "Tabs requires the tablist's accessible name and one non-null panel per item value, so a forgotten panel stops the build instead of rendering blank.",
        ko: "Tabs는 tablist의 접근성 이름과 item value마다 대응하는 panel을 필수로 받기 때문에, 빠뜨린 panel은 빈 화면이 아니라 빌드 실패로 드러납니다.",
      },
    },
    safety: {
      en: "Keep optional safe-area and React Native Web peers behind their documented subpaths. Supply application copy through strings rather than baking product copy into primitives.",
      ko: "optional safe-area와 React Native Web peer는 문서화된 subpath에서만 가져오고, 제품 문구는 프리미티브에 넣지 말고 strings로 주입하세요.",
    },
    related: ["expo-media", "expo-auth"],
  },
  {
    slug: "expo-media",
    name: "@gj-kit/expo-media",
    category: { en: "Expo & React Native", ko: "Expo · React Native" },
    description: {
      en: "A hardened Expo and React Native media pipeline with explicit adapters and durable file boundaries.",
      ko: "명시적 adapter와 지속 파일 경계를 갖춘 하드닝된 Expo·React Native 미디어 파이프라인입니다.",
    },
    tagline: {
      en: "An upload with no size limit, or an iCloud download nobody asked for, is a compile error.",
      ko: "Expo 미디어 업로드의 위험한 기본값을 사고가 아니라 컴파일 에러로 만듭니다.",
    },
    problem: {
      en: "Expo media failures rarely look like failures. On iOS 26 `FileSystem.uploadAsync` ends the process while it is *starting* an upload, so no promise ever rejects and no retry fires; the `localUri` MediaLibrary hands back points inside the photo library rather than your app container, so it passes `stat` and then kills URLSession mid-upload. Android still reports the original `fileSize` after a `quality<1` re-encode, so the presigned size and the bytes storage actually receives disagree.",
      ko: "Expo 미디어 파이프라인의 사고는 대부분 실패처럼 보이지 않습니다. iOS 26에서 `FileSystem.uploadAsync`는 업로드를 시작하는 도중 프로세스를 그대로 종료시켜, promise가 reject될 기회도 재시도 로직이 발화할 기회도 없습니다. iOS MediaLibrary가 돌려주는 `localUri`는 앱 컨테이너가 아니라 사진 보관함 안을 가리키는 경우가 많아 `stat`은 성공하지만 업로더에 넘기는 순간 네이티브 URLSession을 종료시킵니다. Android는 `quality<1` 재인코딩 뒤에도 원본 `fileSize`를 보고해, presign 크기와 스토리지가 실제로 받은 바이트가 어긋납니다.",
    },
    highlights: [
      {
        title: {
          en: "Unlimited uploads must be spelled out",
          ko: "무제한 업로드는 명시해야 합니다",
        },
        body: {
          en: "`createMediaKit({ api })` does not compile: `limits` is required, and `Number.POSITIVE_INFINITY` is rejected, so unlimited is written `'server-enforced'`.",
          ko: "`createMediaKit({ api })`는 컴파일되지 않습니다. `limits`는 필수이고 `Number.POSITIVE_INFINITY` 탈출구도 없어, 무제한은 `'server-enforced'`라고 적어야 합니다.",
        },
      },
      {
        title: {
          en: "duplicate cannot be forgotten",
          ko: "duplicate는 빠뜨릴 수 없습니다",
        },
        body: {
          en: "`UploadResult.duplicate` is required rather than optional, because a missing flag reads as \"newly created\" and the cancel path then deletes the user's older photo.",
          ko: "`UploadResult.duplicate`는 옵셔널이 아니라 필수입니다. 값이 빠지면 \"새로 생성\"으로 오독되고, 그 뒤 중복 취소 경로가 사용자의 예전 사진을 지우기 때문입니다.",
        },
      },
      {
        title: {
          en: "Whoever copies owns the cleanup",
          ko: "사본을 만든 쪽이 정리까지 책임집니다",
        },
        body: {
          en: "`createDeviceLibrary` will not compile without `staging`, so the factory that materializes cache copies of device photos always carries the `StagingCache.cleanup` that deletes them.",
          ko: "`createDeviceLibrary`는 `staging` 없이는 컴파일되지 않습니다. 기기 사진을 캐시로 실체화하는 팩토리가 그 사본을 지우는 `StagingCache.cleanup`을 반드시 함께 갖습니다.",
        },
      },
      {
        title: {
          en: "iCloud downloads never default on",
          ko: "iCloud 다운로드는 기본으로 켜지지 않습니다",
        },
        body: {
          en: "`adapter.getAssetInfo('id')` is a compile error: the second argument is required and carries `downloadFromNetwork`, so the caller decides on every call and no adapter can quietly inherit the legacy default of `true` that started cellular transfers.",
          ko: "`adapter.getAssetInfo('id')`처럼 인자 하나로 부르면 컴파일 에러입니다. `downloadFromNetwork`를 담은 두 번째 인자가 필수라 매 호출에서 호출부가 결정하고, 무단 셀룰러 전송을 시작하던 레거시 기본값 `true`를 adapter가 조용히 물려받을 수 없습니다.",
        },
      },
      {
        title: {
          en: "Peer isolation is a CI assertion",
          ko: "peer 격리는 CI가 검증합니다",
        },
        body: {
          en: "The `dist-peer-graph` guard re-extracts each entry's external specifiers from the built output across browser/node/native by ESM/CJS; `./core`, `./image/pure`, `./web` and `./testing` resolve zero peers.",
          ko: "`dist-peer-graph` 가드가 빌드 산출물에서 엔트리별 외부 지정자를 다시 뽑아 browser·node·네이티브 × ESM·CJS로 대조합니다. `./core`·`./image/pure`·`./web`·`./testing`은 peer 0으로 확인됩니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "{{guards}} @ts-expect-error guards", ko: "@ts-expect-error 가드 {{guards}}개" },
      { en: "570+ unit tests, no expo mocking", ko: "유닛 테스트 570개 이상, expo 모킹 없음" },
      { en: "17 MediaError codes, one closed union", ko: "MediaError 코드 17종, 닫힌 유니언" },
    ],
    when: {
      en: "Use it for media selection, upload preparation, hashing, device-library access, and durable local files while your app keeps its own API and storage policy.",
      ko: "앱이 API와 저장소 정책을 직접 소유하면서 미디어 선택, 업로드 준비, 해싱, 기기 라이브러리, 지속 로컬 파일을 다룰 때 사용합니다.",
    },
    avoid: {
      en: "Do not put record ownership, presign authorization, or orphan-cleanup policy in this library.",
      ko: "레코드 소유권, presign 권한, orphan 정리 정책을 이 라이브러리에 넣지 마세요.",
    },
    goldenPath: {
      en: "Provide the two backend upload operations and explicit limits, then let createMediaKit compose the supported Expo adapters.",
      ko: "백엔드 업로드 작업 두 개와 명시적 limits를 제공하고 createMediaKit이 지원되는 Expo adapter를 조합하게 합니다.",
    },
    code: "import { createMediaKit, type MediaUploadApi } from '@gj-kit/expo-media';\n\ntype Asset = { readonly id: string };\ndeclare const uploadApi: MediaUploadApi<Asset>; // Your app owns auth and upload URLs.\n\nexport const media = createMediaKit({\n  api: uploadApi,\n  limits: { image: { maxBytes: 15 * 1024 * 1024 } },\n});",
    showcase: {
      language: "ts",
      code: "import { createMediaKit, mediaUploadFailureInfo } from '@gj-kit/expo-media';\nimport type { MediaUploadApi, MediaUploadFailureInfo } from '@gj-kit/expo-media';\n\ndeclare const uploadApi: MediaUploadApi<{ readonly id: string }>; // App owns auth + upload URLs.\ndeclare function reconcile(failure: MediaUploadFailureInfo): Promise<void>; // App owns cleanup.\n\n// `limits` is required, and there is no numeric escape hatch:\n//   createMediaKit({ api: uploadApi });\n//   -> error TS2345: Argument of type '{ api: MediaUploadApi<...>; }' is not\n//      assignable to parameter of type 'MediaKitConfig<...>'.\nexport const media = createMediaKit({ api: uploadApi, limits: 'server-enforced' });\n\nexport async function recover(error: unknown): Promise<void> {\n  const failure = mediaUploadFailureInfo(error);\n  if (!failure) throw error; // Not an upload failure — never swallow it.\n  // failure.stage           : 'intent' | 'put' | 'complete'\n  // failure.orphanedObjects : readonly { objectName; contentType; sizeBytes;\n  //                             storageState: 'uploaded' | 'possibly-uploaded' }[]\n  // No presigned URL and no native error text ever reach this value.\n  await reconcile(failure);\n  throw error;\n}",
      caption: {
        en: "When an upload dies mid-flight the error narrows into URL-free recovery metadata — a stage plus frozen object records — never the presigned URL and never the native error text.",
        ko: "업로드가 중간에 죽으면 오류가 URL 없는 복구 메타데이터로 좁혀집니다. `stage`와 `orphanedObjects`(`objectName`·`contentType`·`sizeBytes`·`storageState`)만 담기고, presigned URL이나 네이티브 예외 원문은 들어가지 않습니다.",
      },
    },
    safety: {
      en: "Never expose presigned URLs or native URI details in public errors. Keep cleanup authorization and attachment transactions in the consuming application.",
      ko: "presigned URL이나 native URI 세부 정보를 공개 오류에 노출하지 말고, 정리 권한과 attachment 트랜잭션은 소비 앱에 둡니다.",
    },
    related: ["expo-ui", "expo-auth"],
  },
  {
    slug: "expo-auth",
    name: "@gj-kit/expo-auth",
    category: { en: "Expo & React Native", ko: "Expo · React Native" },
    description: {
      en: "Token lifecycle primitives for Expo, React Native, and the web, including coordinated refresh and storage adapters.",
      ko: "공동 refresh와 storage adapter를 포함한 Expo, React Native, 웹용 토큰 수명주기 프리미티브입니다.",
    },
    tagline: {
      en: "Token refresh for Expo, React Native and web — a missed transient branch won't compile.",
      ko: "Expo·React Native·웹을 한 벌의 코드로 다루는 token refresh 코어입니다. transient 분기를 빠뜨리면 컴파일이 실패합니다.",
    },
    problem: {
      en: "Hand-rolled refresh code classifies a 5xx, a timeout or a CORS failure as a definitive rejection and signs the user out, because the refresh result is consumed by a raw `switch` that TypeScript never checks for exhaustiveness — and the branch that goes missing is always the transient one. Meanwhile a `Platform.OS` fork drags expo-secure-store into the web bundle, two tabs race the same single-use refresh token, a boolean re-entry flag lets a 401 retry fall back into the refresh path, and an option-less re-login after signOut silently promotes a session-scoped login to durable storage on a shared machine.",
      ko: "직접 짠 refresh 코드는 5xx·timeout·CORS 실패를 확정 거절로 오분류해 사용자를 로그아웃시킵니다. 갱신 결과를 raw `switch`로 소비하는데 TypeScript가 exhaustiveness를 강제하지 않고, 빠뜨리는 분기는 늘 transient이기 때문입니다. 여기에 `Platform.OS` 분기가 웹 번들까지 expo-secure-store를 끌고 들어오고, 두 탭이 같은 단일 사용 refresh token을 두고 경합하고, 재진입 여부를 boolean 플래그로 다루다 401 재시도가 다시 refresh 경로로 떨어지고, signOut 뒤 옵션 없이 다시 로그인하면 세션 로그인이 조용히 durable로 승격돼 공용 PC에서 사용자가 고른 범위가 무너집니다.",
    },
    highlights: [
      {
        title: {
          en: "Missing transient case won't compile",
          ko: "transient 누락은 컴파일 에러입니다",
        },
        body: {
          en: "matchRefreshOutcome takes all five endings as handler keys — omit one and the call fails to compile with \"Property 'transient' is missing\".",
          ko: "matchRefreshOutcome은 다섯 결말을 전부 핸들러 키로 받으므로, 하나라도 빠지면 \"Property 'transient' is missing\"으로 컴파일이 실패합니다.",
        },
      },
      {
        title: {
          en: "A 5xx leaves stored tokens alone",
          ko: "5xx에서는 저장된 토큰에 손대지 않습니다",
        },
        body: {
          en: "On a `transient` outcome the core writes nothing to storage, and runAuthorized rethrows your original error instead of routing the user to sign-in.",
          ko: "transient 결말에서는 코어가 storage에 아무것도 쓰지 않고, runAuthorized는 원래 에러를 그대로 다시 던져 사용자를 로그인 화면으로 보내지 않습니다.",
        },
      },
      {
        title: {
          en: "Retry twice is unrepresentable",
          ko: "재시도 두 번은 표현할 수 없습니다",
        },
        body: {
          en: "runAuthorized requires shouldRetryAfterRefresh with no default, and the one retry it performs runs outside the refresh path — the public API has no re-entry switch.",
          ko: "runAuthorized는 기본값 없는 shouldRetryAfterRefresh를 요구하고, 단 한 번 수행하는 재시도는 refresh 경로 밖에서 실행되므로 공개 API에 재진입 스위치 자체가 없습니다.",
        },
      },
      {
        title: {
          en: "signIn cannot forget persistence",
          ko: "signIn은 persistence를 잊을 수 없습니다",
        },
        body: {
          en: "persistence is a required option on signIn's second argument, so \"session login → signOut → option-less re-login\" cannot silently promote tokens to durable storage.",
          ko: "signIn의 두 번째 인자에서 persistence는 필수 옵션이라, \"세션 로그인 → signOut → 옵션 없는 재로그인\"이 토큰을 조용히 durable로 승격시키는 일이 생기지 않습니다.",
        },
      },
      {
        title: {
          en: "No SecureStore in the web bundle",
          ko: "웹 번들에 SecureStore가 없습니다",
        },
        body: {
          en: "One `./storage` subpath forks through exports conditions, so your app writes zero Platform.OS branches and the browser graph contains no expo-secure-store.",
          ko: "`./storage` 하나가 exports 조건으로 갈라지므로 앱에는 Platform.OS 분기가 한 줄도 없고, 브라우저 그래프에는 expo-secure-store가 들어가지 않습니다.",
        },
      },
    ],
    proof: [
      { en: "140+ tests passing (unit, native, web)", ko: "테스트 140건 이상 통과 (unit·native·web)" },
      { en: "{{guards}} @ts-expect-error compile guards", ko: "@ts-expect-error 컴파일 가드 {{guards}}건" },
      { en: "0 runtime dependencies, 1 optional peer", ko: "런타임 의존성 0, optional peer 1개" },
      { en: "5 test doubles at ./testing, peer-free", ko: "./testing 테스트 더블 5종, peer 불필요" },
    ],
    when: {
      en: "Use it when an app needs one reusable token refresh and persistence boundary across mobile and browser clients.",
      ko: "모바일과 브라우저 클라이언트 전체에서 재사용할 토큰 refresh 및 영속 경계가 필요할 때 사용합니다.",
    },
    avoid: {
      en: "Do not put application routes, identity-provider policy, telemetry, or API client ownership in the package.",
      ko: "앱 route, identity provider 정책, telemetry, API client 소유권을 패키지에 넣지 마세요.",
    },
    goldenPath: {
      en: "Start from the root token lifecycle API and import the storage subpath only for the platform storage adapter you need.",
      ko: "root 토큰 수명주기 API에서 시작하고 필요한 플랫폼 storage adapter에만 storage subpath를 가져옵니다.",
    },
    code: "import { createAuthSession, type RefreshRequest } from '@gj-kit/expo-auth';\nimport { createTokenStorage, createWebLocksRefreshLock } from '@gj-kit/expo-auth/storage';\n\ndeclare const refresh: RefreshRequest; // Your API client classifies rotated, invalid, or transient.\n\nexport const session = createAuthSession({\n  storage: createTokenStorage({ keyPrefix: 'myapp.auth' }),\n  lock: createWebLocksRefreshLock({ name: 'myapp.auth' }),\n  refresh,\n});",
    showcase: {
      language: "ts",
      code: "import { matchRefreshOutcome, type RefreshOutcome } from '@gj-kit/expo-auth';\n\ndeclare const outcome: RefreshOutcome; // the app owns this — it is `await session.refresh()`\ndeclare const goToSignIn: () => null; // the app owns navigation\ndeclare const report: (cause: unknown) => void; // the app owns telemetry\n\nexport const accessToken = matchRefreshOutcome<string | null>(outcome, {\n  refreshed: ({ tokens }) => tokens.accessToken, // `tokens` exists here and on `adopted` only\n  adopted: ({ tokens }) => tokens.accessToken,\n  'signed-out': () => goToSignIn(),\n  invalid: () => goToSignIn(), // a definitive server rejection\n  transient: ({ cause }) => {\n    report(cause); // stored tokens are left untouched — a 5xx is not a sign-out\n    return null;\n  },\n});\n// Delete the `transient` line above and tsc refuses the call:\n// error TS2345: ... Property 'transient' is missing in type ... but required in type ...",
      caption: {
        en: "The five endings of refresh() are consumed by key, so the omission that turns a network blip into a false logout is rejected at compile time; `tokens` is reachable only after narrowing to refreshed or adopted, and a refresh callback that throws arrives here as `transient` with the thrown value in `cause`.",
        ko: "refresh()의 다섯 결말을 키로 소비하므로, 네트워크 오류를 오탐 로그아웃으로 바꾸는 누락이 컴파일 단계에서 걸립니다. `tokens`는 refreshed·adopted로 좁힌 뒤에만 접근할 수 있고, refresh 콜백이 throw하면 던진 값이 `cause`에 담긴 채 `transient`로 도착합니다.",
      },
    },
    safety: {
      en: "Treat tokens as secrets: use the supplied error contracts and never log token strings or raw authorization responses.",
      ko: "토큰은 secret으로 취급하세요. 제공된 오류 계약을 사용하고 토큰 문자열이나 원본 authorization 응답을 로그에 남기지 마세요.",
    },
    related: ["expo-media", "expo-ui"],
  },
  {
    slug: "expo-workouts",
    name: "@gj-kit/expo-workouts",
    category: { en: "Expo & React Native", ko: "Expo · React Native" },
    description: {
      en: "A native Expo bridge for HealthKit and Health Connect workouts, routes, authorization, and incremental sync.",
      ko: "HealthKit과 Health Connect의 운동, 경로, 권한, 증분 동기화를 위한 native Expo bridge입니다.",
    },
    tagline: {
      en: "HealthKit and Health Connect workouts in Expo, where destroying stored data is a compile error.",
      ko: "Expo에서 HealthKit·Health Connect 운동 데이터를 다룹니다. 저장된 데이터를 지워 버리는 실수는 컴파일 단계에서 막힙니다.",
    },
    problem: {
      en: "A Health Connect upsert is full-state: a saveWorkout that omits the route deletes the route already stored, and a write with a lower version returns normally with the same record id, so nothing but a read-back can tell it apart from a real write. HealthKit never reports read authorization at all, so a scope you forgot to declare leaves distanceM undefined on every workout with no error anywhere. And a sync loop that commits its cursor before the rows it just received loses those workouts permanently.",
      ko: "Health Connect의 upsert는 full-state입니다. `saveWorkout`에서 route를 빠뜨리면 이미 저장돼 있던 route가 함께 지워지고, 더 낮은 version으로 쓰면 insert가 같은 record id를 돌려주며 정상 반환해서 성공한 쓰기와 구분되지 않습니다 — read-back 말고는 알아낼 방법이 없습니다. HealthKit은 읽기 권한 상태를 아예 돌려주지 않기 때문에, scope 하나를 선언하지 않으면 모든 워크아웃의 `distanceM`이 아무 에러 없이 `undefined`로만 들어옵니다. 그리고 방금 받은 항목보다 cursor를 먼저 커밋하는 sync 루프는 그 사이의 워크아웃을 영구히 잃습니다.",
    },
    highlights: [
      {
        title: {
          en: "Route omission is a compile error",
          ko: "route 누락은 컴파일 에러입니다",
        },
        body: {
          en: "WorkoutWrite.route is a required `readonly RoutePoint[] | 'none'`, so omitting it is TS2741 — a Health Connect upsert without it deletes the route already stored.",
          ko: "Health Connect의 upsert는 full-state여서 route 없이 다시 저장하면 저장돼 있던 route가 지워지기 때문에, `WorkoutWrite.route`를 `readonly RoutePoint[] | 'none'` 필수 필드로 두어 누락을 TS2741로 막습니다.",
        },
      },
      {
        title: {
          en: "Locked-device branch cannot be skipped",
          ko: "잠긴 기기 분기를 건너뛸 수 없습니다",
        },
        body: {
          en: "SaveResult is a union discriminated on status, so `saved.nativeId` is TS2339 until `status === 'saved'` narrows away the pendingUnlock branch a locked device produces.",
          ko: "`SaveResult`는 `status`로 갈라지는 discriminated union이라, 잠긴 기기에서만 나타나는 `pendingUnlock` 분기를 `status === 'saved'`로 좁혀내기 전에는 `saved.nativeId`가 TS2339로 막힙니다.",
        },
      },
      {
        title: {
          en: "Missing scopes named before reading",
          ko: "빠진 scope를 읽기 전에 알려줍니다",
        },
        body: {
          en: "unpopulatedWorkoutMetrics(state) returns the Workout field names, distanceM among them, whose gating read scope is denied or never requested — before you read a single workout.",
          ko: "`unpopulatedWorkoutMetrics(state)`는 워크아웃을 한 건도 읽기 전에, 읽기 scope가 거부됐거나 요청된 적이 없어서 `undefined`로 들어올 `Workout` 필드 이름을 `distanceM`까지 포함해 돌려줍니다.",
        },
      },
      {
        title: {
          en: "Safe to import anywhere",
          ko: "어디서 import해도 안전합니다",
        },
        body: {
          en: "The node/browser condition routes to index.unsupported, whose built module graph contains no expo; in Expo Go requireOptionalNativeModule returns null, so import never throws and getAvailability() resolves unavailable.",
          ko: "`node`/`browser` 조건은 빌드 산출물에 `expo`가 전혀 없는 `index.unsupported`로 라우팅되고 Expo Go에서는 `requireOptionalNativeModule`이 `null`을 돌려주므로, import는 던지지 않고 `getAvailability()`가 `unavailable`을 resolve합니다.",
        },
      },
      {
        title: {
          en: "Sync gaps reproduce on Node",
          ko: "동기화 갭을 Node에서 재현합니다",
        },
        body: {
          en: "createFakeWorkouts() replaces the NativeWorkoutsModule seam rather than WorkoutsApi, so real ./core code runs under vitest for all six CursorResetReason values and a crash mid-drain.",
          ko: "`createFakeWorkouts()`가 대체하는 것은 `WorkoutsApi`가 아니라 그 아래 `NativeWorkoutsModule` seam이라, `CursorResetReason` 6종과 drain 도중 크래시를 실제 `./core` 코드로 vitest에서 돌려 볼 수 있습니다.",
        },
      },
    ],
    proof: [
      { en: "460+ tests across unit, native and plugin", ko: "unit·native·plugin 테스트 460개 이상" },
      { en: "{{guards}} @ts-expect-error guards", ko: "@ts-expect-error 가드 {{guards}}개" },
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "60 XCTest + 70 Kotlin tests on shared fixtures", ko: "공유 fixture로 도는 XCTest 60개 + Kotlin 테스트 70개" },
    ],
    when: {
      en: "Use it when an Expo app needs platform health data while retaining location collection, UI, and sync ownership.",
      ko: "Expo 앱이 위치 수집, UI, 동기화 소유권을 유지하면서 플랫폼 건강 데이터가 필요할 때 사용합니다.",
    },
    avoid: {
      en: "Do not use it for live GPS tracking, background location policy, or server-side health-data processing.",
      ko: "실시간 GPS 추적, 백그라운드 위치 정책, 서버 측 건강 데이터 처리를 위해 사용하지 마세요.",
    },
    goldenPath: {
      en: "Add the config plugin, build a native app, request only the required authorization, then persist the returned sync token in your app.",
      ko: "config plugin을 추가하고 native 앱을 빌드한 뒤 필요한 권한만 요청하고, 반환된 sync token을 앱에 저장합니다.",
    },
    code: "import { getAvailability, requestAuthorization } from '@gj-kit/expo-workouts';\n\nexport async function requestWorkoutAccess() {\n  const availability = await getAvailability();\n  if (availability.status === 'available') {\n    await requestAuthorization({ read: ['workouts'] });\n  }\n  return availability;\n}",
    showcase: {
      language: "ts",
      code: "import { workouts } from '@gj-kit/expo-workouts';\nimport type { WorkoutWrite } from '@gj-kit/expo-workouts/core';\n\nexport const write: WorkoutWrite = {\n  id: 'a2f6c0b8-0d7e-4f31-9d1a-7c2b5e8f0a11', // your own idempotency key, not the platform's\n  version: 3, // never Date.now(): a crash retry would mint a second workout\n  kind: 'running',\n  startMs: 1_754_000_000_000,\n  endMs: 1_754_000_600_000,\n  route: 'none', // delete this line -> TS2741; an Android upsert without it erases the stored route\n};\n\nexport async function save(): Promise<string | null> {\n  const saved = await workouts.saveWorkout(write);\n  // @ts-expect-error TS2339 — `nativeId` is absent on the `pendingUnlock` branch\n  void saved.nativeId;\n  if (saved.status === 'pendingUnlock') return null; // locked device: retry the same id + version\n  return saved.nativeId; // narrowed past pendingUnlock, so it exists\n}",
      caption: {
        en: "The two saveWorkout mistakes that only surface in production — a forgotten route and an unhandled locked device — are a TS2741 and a TS2339.",
        ko: "`saveWorkout`에서 production에 가서야 드러나는 실수는 둘입니다. route 누락과 잠긴 기기 분기 미처리 — 각각 TS2741과 TS2339로 컴파일 단계에서 걸립니다.",
      },
    },
    safety: {
      en: "This is a native module: Expo Go and web/Node are intentionally unsupported for native calls. Explain health permissions before requesting them.",
      ko: "이는 native module입니다. Expo Go와 web/Node에서는 native 호출을 의도적으로 지원하지 않습니다. 권한 요청 전에 건강 데이터 권한의 이유를 설명하세요.",
    },
    related: ["expo-auth", "format"],
  },
  {
    slug: "format",
    name: "@gj-kit/format",
    category: { en: "Utilities", ko: "유틸리티" },
    description: {
      en: "Explicit-by-construction date, number, byte, duration, and Korean currency formatting for TypeScript.",
      ko: "TypeScript용 명시성 강제 날짜, 숫자, 바이트, 기간, 한국 원화 포매팅 유틸리티입니다.",
    },
    tagline: {
      en: "Timestamps drift between screens only when someone typed them that way — timeZone has no default.",
      ko: "timestamp가 화면마다 달라지려면 누군가 그렇게 적어야 합니다. timeZone에는 기본값이 없어서, 생략하면 컴파일이 되지 않습니다.",
    },
    problem: {
      en: "One product's admin and mobile apps carried three separate formatters: the same timestamp rendered nine hours apart, the same amount showed as ₩1,000 on one screen and 1,000원 on another, and null silently became 0. The root cause is that each of those choices had a default — new Date('2026-06-08T09:05:00') resolves against the device zone before the formatter ever sees the value, and Intl's currency path renders '1000 KRW' on an es-ES device even when the call site asked for currencyDisplay: 'symbol'.",
      ko: "한 제품의 admin 앱과 mobile 앱에 포매터가 세 벌 있었습니다. 같은 timestamp가 화면마다 9시간씩 어긋났고, 같은 금액이 한쪽에서는 ₩1,000, 다른 쪽에서는 1,000원으로 찍혔으며, null은 조용히 0이 됐습니다. 원인은 그 선택마다 기본값이 있었다는 것입니다. new Date('2026-06-08T09:05:00')은 포매터가 값을 보기 전에 기기 시간대로 해석해 버리고, Intl의 currency 경로는 호출부가 currencyDisplay: 'symbol'을 적어도 es-ES 기기에서는 '1000 KRW'를 냅니다.",
    },
    highlights: [
      {
        title: {
          en: "timeZone has no default",
          ko: "timeZone에 기본값이 없습니다",
        },
        body: {
          en: "`formatDateTime(instant)` does not compile, and neither does a call supplying only one of `timeZone` and `separator` — both are required, and `'device'` is a token you type rather than a default you inherit.",
          ko: "`formatDateTime(instant)`은 물론, `timeZone`과 `separator` 중 하나만 넘긴 호출도 컴파일 에러입니다. 둘 다 필수이고, 기기 시간에 기대려면 `'device'`라고 직접 적어야 하므로 그 의존이 호출부에 글자로 남습니다.",
        },
      },
      {
        title: {
          en: "Date strings cannot reach formatters",
          ko: "날짜 문자열은 포매터에 닿지 못합니다",
        },
        body: {
          en: "FormatDateInput is Date | number, so an API string must pass parseIsoInstant, whose assumeNoOffset policy ('utc' | 'device' | 'reject') is required; Date.parse is never called.",
          ko: "FormatDateInput은 Date | number입니다. API가 준 문자열은 assumeNoOffset('utc' | 'device' | 'reject')이 필수인 parseIsoInstant를 거쳐야 하고, 이 파서는 정규식과 Date.UTC 산술만 씁니다 — 엔진마다 결과가 갈리는 Date.parse·new Date(문자열) 경로를 아예 타지 않습니다.",
        },
      },
      {
        title: {
          en: "Byte labels cannot lie",
          ko: "바이트 라벨은 거짓말하지 못합니다",
        },
        body: {
          en: "`{ system: 'binary', maxUnit: 'GB' }` does not compile — as a literal or through a const variable — since the two unit systems are separate union members.",
          ko: "`{ system: 'binary', maxUnit: 'GB' }`는 컴파일되지 않습니다. 리터럴에서도, as const 변수를 거쳐도 막힙니다 — 두 단위 체계가 서로 다른 union 멤버이기 때문입니다.",
        },
      },
      {
        title: {
          en: "Relative time takes an explicit clock",
          ko: "상대시간은 시계를 인자로 받습니다",
        },
        body: {
          en: "now: Date is required, and maxDays/onOverflow exist only as a pair, so the library never invents an absolute rendering past your cutoff.",
          ko: "now가 필수라 함수가 몰래 new Date()를 부르지 않습니다. maxDays와 onOverflow는 쌍으로만 존재해서, 컷오프 뒤 절대시각 표기를 라이브러리가 임의로 정하는 일이 타입상 불가능합니다.",
        },
      },
      {
        title: {
          en: "The ₩ glyph never moves with the locale",
          ko: "₩ 기호는 locale을 따라 움직이지 않습니다",
        },
        body: {
          en: "formatKrw composes ₩ and 원 over a plain decimal formatter, and style: 'currency' / 'percent' are scanned out of both src/ and dist/; locale still decides grouping and digit glyphs.",
          ko: "formatKrw는 decimal formatter 위에 ₩과 원을 직접 붙이고, style: 'currency'·'percent'는 src와 dist 양쪽 스캔에서 걸립니다. locale이 정하는 것은 그룹핑·소수점·숫자 글리프까지고, 통화 기호와 % 기호는 정하지 못합니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime deps · 0 peers", ko: "런타임 의존성 0 · peer 0" },
      { en: "350+ unit tests", ko: "unit 테스트 350개 이상" },
      { en: "{{guards}} @ts-expect-error misuse guards", ko: "@ts-expect-error 오용 차단 {{guards}}건" },
      { en: "Forbidden-Intl scan on src and dist", ko: "금지 Intl API를 src·dist 양쪽에서 스캔" },
    ],
    when: {
      en: "Use it when timezone, locale, unit, and currency rendering choices must be visible in the call site.",
      ko: "시간대, locale, 단위, 통화 표시 선택을 호출 위치에서 분명히 해야 할 때 사용합니다.",
    },
    avoid: {
      en: "Do not use it to own application copy, user locale preference, or financial rounding policy outside its documented contract.",
      ko: "문서화된 계약 밖의 앱 문구, 사용자 locale 선호, 금융 반올림 정책을 소유시키기 위해 사용하지 마세요.",
    },
    goldenPath: {
      en: "Parse instants once, then pass the required timezone and separator to the formatter that owns the rendering choice.",
      ko: "instant를 한 번 파싱한 뒤 표시 선택을 소유하는 formatter에 필수 시간대와 구분자를 전달합니다.",
    },
    code: "import { formatDateTime } from '@gj-kit/format';\n\nexport const dateLabel = formatDateTime(Date.UTC(2026, 7, 26, 0, 0), {\n  timeZone: 'Asia/Seoul',\n  separator: '-',\n});",
    showcase: {
      language: "ts",
      code: "import { formatBytes, formatDateTime, parseIsoInstant } from '@gj-kit/format';\n\ndeclare const createdAt: string; // app-owned: an ISO string straight off the API\n\n// @ts-expect-error 'GB' labels a decimal divisor, but 'binary' divides by 1024.\nformatBytes(1, { system: 'binary', maxUnit: 'GB', unitSpace: true, nonPositive: 'render' });\n\n// @ts-expect-error a wall-clock string never reaches a formatter — parse it first.\nformatDateTime(createdAt, { timeZone: 'Asia/Seoul', separator: '-' });\n\nconst instant = parseIsoInstant(createdAt, { assumeNoOffset: 'utc' });\n\nexport const stamp: string = formatDateTime(instant, { timeZone: 'Asia/Seoul', separator: '-' });\n\n// fallback widens the return type by exactly what you passed, and nothing more.\nexport const sizeChip: string | null = formatBytes(0, {\n  system: 'decimal', unitSpace: false, nonPositive: 'fallback', fallback: null,\n});",
      caption: {
        en: "Both @ts-expect-error lines hold against the published dist/index.d.ts under strict + exactOptionalPropertyTypes, and fallback: null widens the return type to exactly string | null.",
        ko: "두 @ts-expect-error 줄은 배포되는 dist/index.d.ts에 대해 strict + exactOptionalPropertyTypes로 검증한 결과입니다. fallback: null은 반환 타입을 딱 string | null 만큼만 넓힙니다.",
      },
    },
    safety: {
      en: "Do not rely on implicit device timezone or locale defaults for persisted or operational values.",
      ko: "영속 데이터나 운영 값에 암묵적인 기기 시간대 또는 locale 기본값을 의존하지 마세요.",
    },
    related: ["expo-ui", "expo-workouts"],
  },
  {
    slug: "nest-operations-jobs",
    name: "@gj-kit/nest-operations-jobs",
    category: { en: "NestJS", ko: "NestJS" },
    description: {
      en: "NestJS composition for durable, authenticated, observable operational jobs with explicit store ports.",
      ko: "명시적 store port를 갖춘 내구성, 인증, 관측 가능한 운영 작업을 위한 NestJS 조합 패키지입니다.",
    },
    tagline: {
      en: "An unauthenticated trigger, or tuning that lets a job run twice, fails before the scheduler’s first call.",
      ko: "인증 없는 trigger, 그리고 잡을 두 번 돌게 만드는 설정은 scheduler의 첫 호출이 아니라 컴파일과 부팅에서 걸립니다.",
    },
    problem: {
      en: "Hand-rolled cron endpoints fail while every dashboard stays green. Swallow the whole unique-constraint violation inside your claim and a permanently blocked job becomes a stream of SKIPPED/200 responses; set the stale-run budget below the heartbeat interval and a healthy run looks reapable to the next trigger, which starts a second body. Meanwhile the trigger route ships with a short shared secret compared by ===, the stored run row can disagree with the status you returned without anyone noticing, and a scheduler attempt deadline set under the job's own timeout records long runs that actually succeeded as failures.",
      ko: "직접 만든 cron endpoint의 장애는 대개 모든 대시보드가 초록인 채로 옵니다. claim에서 unique 위반을 통째로 삼키면 영구히 막힌 잡이 SKIPPED/200 스트림으로 둔갑하고, stale 판정 예산을 heartbeat 주기 아래로 내리면 건강한 실행이 다음 trigger에게 reap 대상으로 보여 두 번째 본문이 시작됩니다. 그 사이 trigger route는 짧은 shared secret을 ===로 비교한 채 배포되고, 저장된 실행 기록이 반환된 status와 어긋나도 아무도 모르며, scheduler의 attempt deadline을 잡의 timeout보다 짧게 잡으면 실제로 성공한 긴 실행이 실패로 기록됩니다.",
    },
    highlights: [
      {
        title: {
          en: "Omitting `auth` is a compile error",
          ko: "`auth` 누락은 컴파일 에러입니다",
        },
        body: {
          en: "`auth` is a required field of OperationsJobsModuleOptions, so a module wired without it does not type-check. An empty `auth`, or a secret under 32 characters, throws ERR_JOB_AUTH_MISCONFIGURED while forRoot assembles the module.",
          ko: "`auth`는 OperationsJobsModuleOptions의 필수 필드라, 이걸 빼고 배선한 module은 타입 검사부터 통과하지 못합니다. 빈 `auth`나 32자 미만 secret은 forRoot가 module을 조립하는 시점에 ERR_JOB_AUTH_MISCONFIGURED로 죽습니다.",
        },
      },
      {
        title: {
          en: "Result fields exist only after narrowing",
          ko: "결과 필드는 좁힌 뒤에만 존재합니다",
        },
        body: {
          en: "On JobExecutionResult, `error`, `reason` and `summary` are unreachable until you switch on `status`; three @ts-expect-error fixtures pin that.",
          ko: "JobExecutionResult에서 `error`·`reason`·`summary`는 `status`로 좁히기 전에는 접근할 수 없습니다. @ts-expect-error 픽스처 3개가 이를 고정합니다.",
        },
      },
      {
        title: {
          en: "The tuning that voids single execution",
          ko: "단일 실행 보장을 지우는 튜닝을 거부합니다",
        },
        body: {
          en: "createJobRunner throws ERR_JOB_INVALID when staleRunAfterMs is under 2x heartbeatIntervalMs — the floor below which a healthy run's watermark can outlive the liveness budget between its own beats.",
          ko: "staleRunAfterMs가 heartbeatIntervalMs의 2배 미만이면 createJobRunner가 ERR_JOB_INVALID를 던져 부팅을 멈춥니다. 건강한 run의 watermark가 자기 beat 사이에서 liveness 예산보다 오래돼 보일 수 있는 하한입니다.",
        },
      },
      {
        title: {
          en: "Your store's atomicity, in your suite",
          ko: "저장소 원자성을 호스트 테스트에서 검사합니다",
        },
        body: {
          en: "jobRunStoreContractCases() returns 13 framework-free cases covering obligations S1-S6 — a concurrent claim burst, two concurrent reaps of the same three rows — that you run against your real database. Supply `inspect` and it returns 16, adding S7.",
          ko: "jobRunStoreContractCases()는 프레임워크 없는 적합성 케이스 13개를 돌려줍니다. S1–S6 의무를 실제 database에 그대로 겁니다 — 동시 claim burst, 같은 세 행을 노리는 두 개의 동시 reap. `inspect`를 넘기면 S7까지 붙어 16개가 됩니다.",
        },
      },
      {
        title: {
          en: "/core provably contains no Nest",
          ko: "/core에 Nest가 없음을 산출물로 증명합니다",
        },
        body: {
          en: "A guard test scans src/core/**, src/testing/** and every built dist/core.* and dist/testing.* chunk for @nestjs, rxjs and reflect-metadata, and a control case asserts dist/index.js does contain @nestjs — so an empty result means the scanner actually looked.",
          ko: "guard test가 src/core/**·src/testing/**와 빌드 산출물 dist/core.*·dist/testing.* 청크 전량을 훑어 @nestjs·rxjs·reflect-metadata 참조가 하나도 없음을 확인합니다. 같은 파일의 대조군이 dist/index.js에는 @nestjs가 있다고 못 박기 때문에, 빈 결과가 '스캐너가 아무것도 안 봤다'는 뜻일 수 없습니다.",
        },
      },
    ],
    proof: [
      { en: "230+ unit tests", ko: "unit test 230개 이상" },
      { en: "{{guards}} @ts-expect-error guards", ko: "@ts-expect-error 가드 {{guards}}개" },
      { en: "13 store contract cases", ko: "store 계약 case 13개" },
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
    ],
    when: {
      en: "Use it when a Nest application needs scheduled or operator-triggered work with explicit concurrency, authorization, and run persistence.",
      ko: "Nest 앱에서 명시적 동시성, 권한, 실행 영속성을 갖춘 스케줄 또는 운영자 실행 작업이 필요할 때 사용합니다.",
    },
    avoid: {
      en: "Do not hide product business rules, queue infrastructure, or application authorization policy behind this integration.",
      ko: "제품 비즈니스 규칙, queue 인프라, 앱 권한 정책을 이 통합 뒤에 숨기지 마세요.",
    },
    goldenPath: {
      en: "Implement the public store and authenticator ports in your application, register the module, then expose only the jobs your operators should run.",
      ko: "앱에서 공개 store와 authenticator port를 구현하고 module을 등록한 뒤 운영자가 실행해야 하는 작업만 노출합니다.",
    },
    code: "import { OperationsJobsModule, type JobRunStore } from '@gj-kit/nest-operations-jobs';\n\ndeclare const store: JobRunStore; // Your database-backed run store.\ndeclare const secret: string; // At least 32 characters; keep it outside source control.\n\nexport const operations = OperationsJobsModule.forRoot({\n  store,\n  auth: { secret },\n  trigger: { path: 'internal/jobs' },\n});",
    showcase: {
      language: "ts",
      code: "import type { JobExecutionResult } from '@gj-kit/nest-operations-jobs/core';\n\ndeclare const result: JobExecutionResult; // await runner.execute(...)\ndeclare function pageOncall(jobKey: string, runId: string): void; // the app owns this\n\nexport function report(): void {\n  // console.error(result.error.code);\n  // -> error TS2339: Property 'error' does not exist on type 'JobExecutionResult'.\n  if (result.status === 'TIMED_OUT') {\n    console.error(result.jobKey, result.error.code); // 'ERR_JOB_TIMEOUT'\n  } else if (result.status === 'SKIPPED') {\n    console.warn(result.jobKey, result.reason); // 'overlap' - the only value\n  }\n\n  // `recorded` sits on every branch: 'superseded' means a reaper already\n  // finalised the row, so a second body may run under a different runId.\n  if (result.recorded === 'superseded') pageOncall(result.jobKey, result.runId);\n}",
      caption: {
        en: "`error` is unreachable until `status` is narrowed, and `recorded` sits on every branch because a stored row that disagrees with the returned status is exactly what deserves a page.",
        ko: "`status`로 좁히기 전에는 `error`에 접근할 수 없고, `recorded`는 모든 분기에 있습니다. 저장된 행이 반환된 status와 어긋나는 상황이야말로 알림을 걸 지점이기 때문입니다.",
      },
    },
    safety: {
      en: "Keep job-trigger authorization and app data ownership in the host application. Never turn a convenience route into an unauthenticated operations endpoint.",
      ko: "작업 실행 권한과 앱 데이터 소유권은 host 앱에 둡니다. 편의 route를 인증 없는 운영 endpoint로 만들지 마세요.",
    },
    related: ["nest-notifications", "toss-payments-nestjs"],
  },
  {
    slug: "nest-notifications",
    name: "@gj-kit/nest-notifications",
    category: { en: "NestJS", ko: "NestJS" },
    description: {
      en: "NestJS composition for transactional notification relay, dispatch, presentation, and Expo push boundaries.",
      ko: "트랜잭션 알림 relay, dispatch, presentation, Expo push 경계를 위한 NestJS 조합 패키지입니다.",
    },
    tagline: {
      en: "A dispatcher with no presenter, or quiet hours with no time zone, is a compile error — not a DST bug in production.",
      ko: "알림 파이프라인에서 위험한 결정은 프로덕션이 아니라 컴파일 단계에서 막습니다.",
    },
    problem: {
      en: "A hand-rolled notification outbox loses deliveries to non-atomic claims, writes duplicate inbox rows when two workers grab the same batch, and pushes to accounts that were deleted mid-relay. Then quiet hours turn out to be a fixed offset added to a Date, drifting an hour every DST transition, and a batch window that does not divide 24h moves the aggregation bucket every day.",
      ko: "직접 짠 알림 outbox는 claim이 원자적이지 않아 두 워커가 같은 행을 집고, inbox 메시지가 중복으로 쓰이며, relay 도중 삭제된 계정으로 push가 나갑니다. 조용시간은 대개 Date에 고정 offset을 더하는 식이라 DST 전환마다 한 시간씩 어긋나고, 24시간으로 나누어떨어지지 않는 batch 창은 집계 버킷을 매일 옮겨 놓습니다.",
    },
    highlights: [
      {
        title: {
          en: "Required options, enforced by tsc",
          ko: "필수 옵션은 컴파일 에러입니다",
        },
        body: {
          en: "createNotificationDispatcher without a presenter and createQuietHoursPolicy without a timeZone do not compile — no default copy, no default region.",
          ko: "presenter 없는 createNotificationDispatcher, timeZone 없는 createQuietHoursPolicy는 컴파일되지 않습니다. 기본 카피도 기본 지역도 두지 않기 때문입니다.",
        },
      },
      {
        title: {
          en: "30 contract cases for your database",
          ko: "직접 만든 저장소에 돌리는 적합성 케이스 30개",
        },
        body: {
          en: "notificationStoreContractCases() returns 30 runnable cases covering 29 numbered obligations: atomic claim, batch uniqueness, purge-versus-relay interleaving.",
          ko: "notificationStoreContractCases()가 원자적 claim, 배치 유일성, purge와 relay의 교차까지 29개 저장소 의무를 실행 가능한 케이스 30개로 돌려줍니다.",
        },
      },
      {
        title: {
          en: "A core Nest cannot leak into",
          ko: "Nest가 스며들 수 없는 core",
        },
        body: {
          en: "Guards assert the strings @nestjs, rxjs and reflect-metadata appear nowhere in src/core, src/expo or src/testing, and nowhere in the dist/core.*, dist/expo.* and dist/testing.* module graphs — with a control case requiring dist/index.js to contain @nestjs, so the guard is proven not to be checking an empty set.",
          ko: "가드가 src/core·src/expo·src/testing 소스와 dist/core.*·dist/expo.*·dist/testing.* 모듈 그래프 전체에서 @nestjs·rxjs·reflect-metadata 문자열을 한 건도 찾지 못해야 통과합니다. 반대로 dist/index.js에는 @nestjs가 있어야 통과하는 대조군이 함께 있어, 이 가드가 빈 집합을 검사하고 있는 게 아니라는 것까지 확인합니다.",
        },
      },
      {
        title: {
          en: "The latency hint returns void",
          ko: "wakeup 힌트의 반환 타입은 void입니다",
        },
        body: {
          en: "NotificationPipelineWakeup.request() returns void — nothing to await, no result to inspect, no error to catch — so it cannot be mistaken for the owner of correctness. A test wires only that hint, advances the clock 12 hours, and finds the batched delivery still undelivered until dispatchDue() is called.",
          ko: "NotificationPipelineWakeup.request()의 반환 타입은 void입니다. await할 것도, 확인할 결과도, 잡을 에러도 없으니 여기에 정확성을 기댈 수 없습니다. 힌트만 배선한 호스트에서 시계를 12시간 앞으로 돌려도 배치 배달은 그대로 남아 있고, dispatchDue()를 부른 뒤에야 나간다는 것을 테스트가 고정합니다.",
        },
      },
      {
        title: {
          en: "DST resolution is a contract",
          ko: "DST 해석은 계약입니다",
        },
        body: {
          en: "A spring-forward gap releases at the first instant after it, an autumn fold at the earlier one, and batchWindowMs must divide 24h evenly or assembly throws ERR_NOTIFICATION_POLICY_INVALID.",
          ko: "봄 전진 갭에 삼켜진 조용시간 해제 시각은 갭 직후 첫 순간으로, 가을 후퇴로 두 번 존재하는 시각은 이른 쪽으로 확정됩니다. batchWindowMs는 24시간이 나누어떨어지는 값이어야 하고, 아니면 조립 시점에 ERR_NOTIFICATION_POLICY_INVALID로 부팅이 멈춥니다.",
        },
      },
    ],
    proof: [
      { en: "230+ unit tests", ko: "unit 테스트 230개 이상" },
      { en: "30 store contract cases for your database", ko: "직접 만든 저장소용 계약 케이스 30개" },
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "4 entry points, ESM + CJS", ko: "공개 entry point 4개, ESM + CJS" },
    ],
    when: {
      en: "Use it when product events must become durable, deduplicated notification work without making delivery policy part of the product domain.",
      ko: "제품 이벤트를 delivery 정책을 제품 도메인에 섞지 않고 내구성 있고 dedupe된 알림 작업으로 전환해야 할 때 사용합니다.",
    },
    avoid: {
      en: "Do not move product copy, recipient policy, or user-preference decisions into the generic relay.",
      ko: "제품 문구, 수신자 정책, 사용자 선호 결정을 범용 relay로 옮기지 마세요.",
    },
    goldenPath: {
      en: "Provide the application stores and presentation policy, register the Nest module, then run relay and dispatch workers through your normal operations boundary.",
      ko: "앱 store와 presentation 정책을 제공하고 Nest module을 등록한 뒤 일반 운영 경계에서 relay와 dispatch worker를 실행합니다.",
    },
    code: "import { NestNotificationsModule, type NestNotificationsOptions } from '@gj-kit/nest-notifications';\n\ndeclare const options: NestNotificationsOptions; // App stores, presenter, policy, and push gateway.\n\nexport const notifications = NestNotificationsModule.forRoot(options);",
    showcase: {
      language: "ts",
      code: "import { createQuietHoursPolicy } from '@gj-kit/nest-notifications/core';\nimport { notificationStoreContractCases } from '@gj-kit/nest-notifications/testing';\nimport type { NotificationStoreSuite } from '@gj-kit/nest-notifications/testing';\n\ndeclare function myPostgresStores(): Promise<NotificationStoreSuite>; // the app owns this\n\n// The library holds no regional default, so the zone cannot be left unsaid.\nexport const policy = createQuietHoursPolicy({\n  timeZone: 'Asia/Seoul',\n  quietHours: { startHour: 22, endHour: 8 },\n  batchWindowMs: 600_000, // must divide 24h, or assembly throws ERR_NOTIFICATION_POLICY_INVALID\n});\n// Drop timeZone and tsc stops the build:\n//   error TS2345: Argument of type '{ quietHours: { startHour: number; endHour: number; }; }'\n//   is not assignable to parameter of type 'QuietHoursPolicyOptions'.\n\n// The 30 cases the library runs on its own in-memory stores, now run on yours.\nfor (const testCase of notificationStoreContractCases({ concurrency: 8 })) {\n  it(testCase.name, () => testCase.run(myPostgresStores));\n}",
      caption: {
        en: "Both halves are load-bearing: the policy cannot be constructed without a time zone, and the same 30 cases the library runs against its in-memory stores become the acceptance criteria for yours.",
        ko: "두 대목 모두 실제로 강제됩니다 — 시간대 없이는 정책을 만들 수 없고, 라이브러리가 자기 인메모리 저장소에 돌리는 케이스 30개가 그대로 직접 만든 저장소의 인수 조건이 됩니다.",
      },
    },
    safety: {
      en: "Keep credentials, endpoint ownership, and user-visible product wording in the application. Use the typed error and delivery outcomes instead of raw provider failures.",
      ko: "credential, endpoint 소유권, 사용자 노출 제품 문구는 앱에 둡니다. 원본 provider 실패 대신 typed error와 delivery outcome을 사용하세요.",
    },
    related: ["nest-operations-jobs", "expo-auth"],
  },
  {
    slug: "toss-payments",
    name: "@gj-kit/toss-payments",
    category: { en: "Payments", ko: "결제" },
    description: {
      en: "Type-safe Toss Payments widget and API v2 flows for TypeScript servers and browsers.",
      ko: "TypeScript 서버와 브라우저를 위한 타입 안전 토스페이먼츠 위젯 및 API v2 흐름입니다.",
    },
    tagline: {
      en: "A confirm that skipped verification does not compile — `flow.confirm` takes only VerifiedCheckout.",
      ko: "토스페이먼츠 연동에서 검증 단계를 빠뜨리면 런타임이 아니라 컴파일에서 막힙니다.",
    },
    problem: {
      en: "Toss integrations break in ways that only surface in production: confirming without comparing the amount you stored, a cron re-running billing approve without an idempotency key and charging twice, trusting an unsigned PAYMENT_STATUS_CHANGED payload, or forgetting to save the virtual-account secret so every deposit webhook is rejected as unknown-order. And a confirm that fails on transport is not a failed payment — batch-failing it tells the customer their payment failed after the money already moved.",
      ko: "토스 연동 사고는 대부분 프로덕션에서야 드러납니다. 저장해 둔 금액과 대조하지 않고 confirm을 호출하거나, 멱등키 없이 cron이 billing approve를 두 번 돌려 이중 과금이 나거나, 서명 없는 PAYMENT_STATUS_CHANGED payload를 그대로 믿고 주문을 이행하거나, 가상계좌 secret 저장을 빠뜨려 입금 webhook이 전부 unknown-order로 거부되는 식입니다. transport 실패로 끝난 confirm이 결제 실패가 아니라는 점도 마찬가지입니다. 뭉뚱그려 실패로 처리하면 돈은 이미 빠져나간 상태에서 고객에게는 실패했다고 안내하게 됩니다.",
    },
    highlights: [
      {
        title: {
          en: "Unwired flows have no property",
          ko: "배선한 flow만 타입에 존재",
        },
        body: {
          en: "createTossPayments returns a type where `billing` does not exist unless you pass a BillingKeyStore, and `confirm` does not exist unless you pass an OrderStore.",
          ko: "createTossPayments가 돌려주는 타입에는 BillingKeyStore를 넘기지 않으면 billing 프로퍼티가, OrderStore를 넘기지 않으면 confirm 프로퍼티가 아예 없습니다.",
        },
      },
      {
        title: {
          en: "Secret keys cannot reach the browser",
          ko: "브라우저에 닿지 못하는 secret key",
        },
        body: {
          en: "Toss's four key kinds are four separate brands; the secret parsers live only on the node-resolved /server entry, and loadWidgets accepts WidgetClientKey alone.",
          ko: "토스 key 4종이 서로 다른 brand입니다. parseApiSecretKey·parseWidgetSecretKey는 node 조건으로만 해석되는 /server entry에만 있고, loadWidgets는 WidgetClientKey만 받습니다.",
        },
      },
      {
        title: {
          en: "confirm() rejects unverified callbacks",
          ko: "검증을 통과해야 confirm 가능",
        },
        body: {
          en: "flow.confirm takes only VerifiedCheckout — the brand flow.verify mints after the callback amount matches the amount createOrder stored and the 10-minute approval window still holds.",
          ko: "flow.confirm은 VerifiedCheckout만 받습니다. 이 brand는 flow.verify가 createOrder 시점에 저장한 금액과 callback의 amount를 대조하고 10분 승인 시한까지 확인해야 발급됩니다.",
        },
      },
      {
        title: {
          en: "Cancel has no shortcut path",
          ko: "취소에는 지름길이 없음",
        },
        body: {
          en: "Nothing cancels by paymentKey: you go getPayment to asCancelable to kind narrowing, where a deposited virtual account requires refundAccount and every non-virtual-account payment declares it `refundAccount?: never`.",
          ko: "paymentKey로 바로 취소하는 API가 없습니다. getPayment → asCancelable → kind narrowing을 거쳐야 하고, 입금 완료 가상계좌는 refundAccount가 필수, 가상계좌가 아닌 결제는 `refundAccount?: never`로 아예 막힙니다.",
        },
      },
      {
        title: {
          en: "Webhook trust is graded, not assumed",
          ko: "webhook 신뢰도 3등급 분리",
        },
        body: {
          en: "verify() takes raw body only, events split into signature / secret / unverified, and there is no onBillingApproved key because Toss sends no such webhook.",
          ko: "verify()는 raw body만 받고, 이벤트는 signature / secret / unverified 3등급으로 나뉩니다. 토스가 빌링 승인 webhook을 보내지 않기 때문에 WebhookHandlers에는 onBillingApproved key 자체가 없습니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "550+ unit tests", ko: "unit 테스트 550개 이상" },
      { en: "{{guards}} @ts-expect-error compile guards", ko: "@ts-expect-error 컴파일 차단 {{guards}}건" },
      { en: "42 Toss error codes classified", ko: "토스 에러 코드 42종 분류" },
    ],
    when: {
      en: "Use it when payment key boundaries, order-amount verification, webhook trust, and idempotent billing flows must be encoded in types.",
      ko: "결제 키 경계, 주문 금액 검증, 웹훅 신뢰도, 멱등 빌링 흐름을 타입으로 강제해야 할 때 사용합니다.",
    },
    avoid: {
      en: "Do not treat it as a complete order system or store raw secrets, audit payloads, and refund policy in its generic layer.",
      ko: "완전한 주문 시스템으로 취급하거나 raw secret, audit payload, 환불 정책을 범용 계층에 저장하지 마세요.",
    },
    goldenPath: {
      en: "Parse the server key at boot, compose the kit with your app-owned stores, and confirm only against the server-side order record.",
      ko: "부팅 시 서버 키를 파싱하고 앱 소유 store로 kit을 조합하며 서버 측 주문 레코드와 대조한 경우에만 승인합니다.",
    },
    code: "import { orThrow } from '@gj-kit/toss-payments';\nimport { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';\n\ndeclare const apiSecretFromEnv: string; // Read this once from your server environment.\n\nexport const toss = createTossPayments({\n  secretKey: orThrow(parseApiSecretKey(apiSecretFromEnv)),\n});\n\n// Add your OrderStore to enable toss.confirm; the type exposes only wired flows.",
    showcase: {
      language: "ts",
      code: "import { idempotencyKey, orThrow } from '@gj-kit/toss-payments';\nimport type { BillingKeyStore, BillingOrder, BillingProfile, OrderStore } from '@gj-kit/toss-payments/server';\nimport { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';\n\ndeclare const apiSecret: string; // app owns\ndeclare const orderStore: OrderStore; // app owns\ndeclare const billingKeyStore: BillingKeyStore; // app owns\ndeclare const profile: BillingProfile; // app owns\ndeclare const order: BillingOrder; // app owns\n\nexport const toss = createTossPayments({\n  secretKey: orThrow(parseApiSecretKey(apiSecret)),\n  orders: orderStore, // omit and `toss.confirm` is not on the type\n  billingKeys: billingKeyStore, // omit and `toss.billing` is not on the type\n});\n\n// toss.billing.approve(profile, order); -> error TS2554: Expected 3 arguments, but got 2.\nexport const charged = toss.billing.approve(profile, order, {\n  idempotencyKey: orThrow(idempotencyKey(`sub:2026-09:${profile.customerKey}`)),\n});",
      caption: {
        en: "Two mistakes that normally pass review and detonate in production — a half-wired kit and a billing approve with no idempotency key — are both compile errors here.",
        ko: "코드 리뷰는 통과하고 프로덕션에서 터지는 두 실수, 반쪽만 배선된 kit과 멱등키 없는 billing approve. 여기서는 둘 다 컴파일 에러입니다.",
      },
    },
    safety: {
      en: "Never import server key parsers into browser code or trust a redirect/webhook without the documented verification path. Keep secrets and exact audit bodies encrypted at rest.",
      ko: "server 키 parser를 브라우저 코드에 import하거나 문서화된 검증 경로 없이 redirect/웹훅을 신뢰하지 마세요. secret과 정확한 audit body는 저장 시 암호화하세요.",
    },
    related: ["toss-payments-nestjs", "toss-payments-postgresql"],
  },
  {
    slug: "toss-payments-nestjs",
    name: "@gj-kit/toss-payments-nestjs",
    category: { en: "Payments", ko: "결제" },
    description: {
      en: "NestJS DI and raw-body webhook composition for @gj-kit/toss-payments.",
      ko: "@gj-kit/toss-payments를 위한 NestJS DI 및 raw-body 웹훅 조합 패키지입니다.",
    },
    tagline: {
      en: "A DI token carries no type — `TossPaymentsFor<typeof config>` gives it back, so unwired flows stay compile errors.",
      ko: "DI token은 타입을 싣고 다니지 않습니다. `TossPaymentsFor<typeof config>`가 그 타입을 되살려, 배선하지 않은 flow는 그대로 컴파일 에러로 남습니다.",
    },
    problem: {
      en: "A DI token carries no type: `forRoot()` returns a `DynamicModule` bound to a `unique symbol`, so the constructor annotation you wrote is the only remaining truth — `toss.billing` type-checks on a kit whose config never wired a `BillingKeyStore`, and the property is `undefined` at runtime. Then you add a webhook controller and Nest has already parsed the body: signature verification cannot be recovered from re-serialized JSON.",
      ko: "DI token은 타입을 싣고 다니지 않습니다. `forRoot()`가 돌려주는 건 `unique symbol`에 바인딩된 `DynamicModule`이라, 주입 지점에 적은 생성자 타입 표기가 유일한 근거로 남습니다 — `BillingKeyStore`를 배선한 적 없는 config인데도 `toss.billing`이 타입 검사를 통과하고, 런타임에는 그 프로퍼티가 `undefined`입니다. 여기에 webhook controller를 붙이면 Nest 기본 body parser가 요청을 이미 객체로 바꿔 놓은 뒤입니다. 다시 직렬화한 JSON으로는 서명 검증을 복구할 수 없습니다.",
    },
    highlights: [
      {
        title: {
          en: "Unwired flows have no property",
          ko: "배선 안 한 flow는 프로퍼티가 없습니다",
        },
        body: {
          en: "`TossPaymentsFor<typeof config>` rebuilds the conditional kit type after DI, so `toss.billing` is a compile error without a wired `BillingKeyStore`.",
          ko: "`TossPaymentsFor<typeof config>`가 DI 경계 뒤에서도 조건부 kit 타입을 복원하므로, `BillingKeyStore` 배선 없이 `toss.billing`을 쓰면 컴파일 에러입니다.",
        },
      },
      {
        title: {
          en: "Missing rawBody fails loudly",
          ko: "rawBody 부재는 조용히 넘어가지 않습니다",
        },
        body: {
          en: "Without `req.rawBody`, `toNestWebhookHandler` never calls a handler: it answers 500 and logs the three settings to check — `rawBody: true` on `NestFactory.create`, Fastify raw-body support, and a JSON middleware applied ahead of the webhook route.",
          ko: "`req.rawBody`가 없으면 `toNestWebhookHandler`는 handler를 호출하지 않습니다. 500을 돌려주고 확인할 설정 세 가지를 로그로 남깁니다 — `NestFactory.create`의 `rawBody: true`, Fastify의 raw body 지원 설정, 그리고 webhook route 앞에 걸린 JSON 미들웨어.",
        },
      },
      {
        title: {
          en: "Source IP survives the wrapper",
          ko: "source IP가 wrapper를 통과합니다",
        },
        body: {
          en: "The handler forwards the original Node `socket`, keeping the core's fail-closed IP check; trusting a proxy header requires passing an explicit `sourceIp` extractor.",
          ko: "handler가 원본 Node `socket`을 그대로 전달해 코어의 fail-closed IP 검증이 유지되고, proxy 헤더를 신뢰하려면 `sourceIp` extractor를 명시해야 합니다.",
        },
      },
      {
        title: {
          en: "One token across ESM and CJS",
          ko: "ESM·CJS 어디서든 같은 token",
        },
        body: {
          en: "`TOSS_PAYMENTS` and `getTossPaymentsToken(name)` are `Symbol.for` lookups, so a dual-loaded package still resolves to one provider binding.",
          ko: "`TOSS_PAYMENTS`와 `getTossPaymentsToken(name)`은 `Symbol.for` 기반이라, 패키지가 ESM/CJS로 이중 로드돼도 provider 바인딩이 하나로 유지됩니다.",
        },
      },
      {
        title: {
          en: "No emitDecoratorMetadata needed",
          ko: "emitDecoratorMetadata 없이 동작합니다",
        },
        body: {
          en: "`InjectTossPayments()` is a thin `@Inject(token)` delegate and no code under `src/` reads `design:paramtypes`, so the package ships `emitDecoratorMetadata: false` — and the Nest DI tests still resolve under vitest's esbuild transform, which cannot emit that metadata at all.",
          ko: "`InjectTossPayments()`는 `@Inject(token)`에 위임하는 얇은 래퍼이고 `src/` 어디에도 `design:paramtypes`를 읽는 코드가 없습니다. 그래서 패키지는 `emitDecoratorMetadata: false`로 배포되며, 해당 메타데이터를 아예 만들지 못하는 vitest의 esbuild 변환에서도 Nest DI 테스트가 그대로 해석됩니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime dependencies", ko: "런타임 의존성 0" },
      { en: "{{guards}} rejections pinned by @ts-expect-error", ko: "@ts-expect-error로 고정한 거부 {{guards}}건" },
      { en: "Nest 10 and 11 boot-verified", ko: "Nest 10·11 실제 부팅 검증" },
      { en: "20 unit tests, 8 boot real Nest DI", ko: "unit 테스트 20개, 그중 8개는 실제 Nest DI 부팅" },
    ],
    when: {
      en: "Use it when a Nest application needs to keep the core payment kit’s types and safety boundary through dependency injection.",
      ko: "Nest 앱에서 core payment kit의 타입과 안전 경계를 의존성 주입까지 유지해야 할 때 사용합니다.",
    },
    avoid: {
      en: "Do not reimplement payment verification in controllers or rely on parsed JSON when webhook verification requires raw bytes.",
      ko: "controller에서 결제 검증을 다시 구현하거나 웹훅 검증에 raw bytes가 필요한데 파싱된 JSON에 의존하지 마세요.",
    },
    goldenPath: {
      en: "Register TossPaymentsModule with your stores, inject the typed kit, and enable rawBody before binding a webhook handler.",
      ko: "store와 함께 TossPaymentsModule을 등록하고 typed kit을 주입하며 웹훅 handler를 연결하기 전에 rawBody를 활성화합니다.",
    },
    code: "import { orThrow } from '@gj-kit/toss-payments';\nimport { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';\nimport { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';\n\ndeclare const apiSecretFromEnv: string; // Read this once from your server environment.\n\nconst config = defineTossPaymentsConfig({\n  secretKey: orThrow(parseApiSecretKey(apiSecretFromEnv)),\n});\n\nexport const payments = TossPaymentsModule.forRoot(config);",
    showcase: {
      language: "ts",
      code: "import { Injectable } from '@nestjs/common';\nimport { orThrow } from '@gj-kit/toss-payments';\nimport { defineTossPaymentsConfig, parseApiSecretKey, type OrderStore } from '@gj-kit/toss-payments/server';\nimport { InjectTossPayments, TossPaymentsModule, type TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';\n\ndeclare const SECRET: string; // the app owns this (process.env)\ndeclare const orders: OrderStore; // the app owns this (its own DB adapter)\n\nexport const tossConfig = defineTossPaymentsConfig({ secretKey: orThrow(parseApiSecretKey(SECRET)), orders });\nexport type AppToss = TossPaymentsFor<typeof tossConfig>;\nexport const tossModule = TossPaymentsModule.forRoot(tossConfig);\n\n@Injectable()\nexport class PaymentsService {\n  constructor(@InjectTossPayments() private readonly toss: AppToss) {}\n\n  order = () => this.toss.confirm.createOrder({ amount: 9_900, orderName: 'Pro' });\n  // this.toss.billing — TS2339: the config wired no BillingKeyStore, so there is no property.\n}",
      caption: {
        en: "The commented line is a real TS2339: this config wired no `BillingKeyStore`, so the injected kit has no `billing` property at all — even though the value arrived through an untyped DI token.",
        ko: "주석 처리한 줄은 실제 TS2339입니다. 이 config에는 `BillingKeyStore`가 배선되어 있지 않으므로, 타입을 싣지 않는 DI token을 거쳐 주입된 kit에도 `billing` 프로퍼티 자체가 존재하지 않습니다.",
      },
    },
    safety: {
      en: "Preserve raw request bytes for verified webhooks and make every store dependency explicit in the host Nest module.",
      ko: "검증되는 웹훅은 원본 request bytes를 보존하고, 모든 store 의존성을 host Nest module에 명시하세요.",
    },
    related: ["toss-payments", "toss-payments-postgresql"],
  },
  {
    slug: "toss-payments-postgresql",
    name: "@gj-kit/toss-payments-postgresql",
    category: { en: "Payments", ko: "결제" },
    description: {
      en: "PostgreSQL stores, migrations, inbox, and encryption seams for @gj-kit/toss-payments.",
      ko: "@gj-kit/toss-payments를 위한 PostgreSQL store, migration, inbox, 암호화 seam입니다.",
    },
    tagline: {
      en: "Toss Payments stores on your own PostgreSQL, where forgetting encryption is a compile error.",
      ko: "토스페이먼츠 저장소를 직접 운영하는 PostgreSQL 위에 올리되, 암호화 protector를 빠뜨리면 컴파일이 실패합니다.",
    },
    problem: {
      en: "Wiring Toss Payments to your own database means hand-designing seven tables, a webhook dedupe transition that has to be atomic, and at-rest encryption for billing keys, virtual-account secrets, and cancel-retry tickets. Do it yourself and a read-then-insert dedupe lets two concurrent redeliveries of the same event both win the claim, and a store wired without a protector writes billing keys to disk in plaintext — neither one tells you until production.",
      ko: "토스페이먼츠를 자체 DB에 붙이려면 테이블 7종, 원자적이어야 하는 webhook dedupe 전이, 그리고 billing key·가상계좌 secret·취소 재시도 티켓의 at-rest 암호화를 직접 설계해야 합니다. 직접 짜면 조회 후 삽입 방식의 dedupe에서 같은 이벤트의 동시 재전송 2건이 모두 처리권을 얻고, protector를 빠뜨린 store는 billing key를 평문으로 남깁니다. 둘 다 프로덕션에 올라가기 전까지는 아무 신호도 주지 않습니다.",
    },
    highlights: [
      {
        title: {
          en: "Assembly without a protector won't compile",
          ko: "protector 없는 조립은 컴파일 실패",
        },
        body: {
          en: "`createTossPaymentsPostgres({ sql })` is a type error — `sensitiveValueProtector` is a required field on the aggregate and on all three sensitive store factories.",
          ko: "`createTossPaymentsPostgres({ sql })`은 타입 에러입니다. aggregate와 민감 store factory 3종이 모두 `sensitiveValueProtector`를 필수 필드로 요구하므로, 평문 저장은 숨은 기본값이 될 수 없고 unsafePlaintextSensitiveValueProtector를 직접 적어 넣은 코드에만 남습니다.",
        },
      },
      {
        title: {
          en: "Raw strings are not lock keys",
          ko: "raw string은 lock key가 아닙니다",
        },
        body: {
          en: "opaqueLocks.withLock accepts only a branded OpaqueAdvisoryLockKey, so passing a customer id as a raw string is rejected by tsc with TS2345.",
          ko: "opaqueLocks.withLock은 branded OpaqueAdvisoryLockKey만 받습니다. customer ID를 raw string으로 넘기는 코드는 tsc가 TS2345로 거부합니다.",
        },
      },
      {
        title: {
          en: "Types encode the transaction requirement",
          ko: "타입이 transaction 요건을 강제합니다",
        },
        body: {
          en: "createPgBillingKeyStore rejects a SqlExecutor: SELECT … FOR UPDATE → decrypt → constant-time compare → DELETE has to run on one pinned connection inside one transaction, so only SqlClient — the interface that adds withConnection — typechecks.",
          ko: "createPgBillingKeyStore는 SqlExecutor를 거부합니다. SELECT … FOR UPDATE → 복호화 → constant-time 비교 → DELETE가 한 connection, 한 transaction 안에서 끝나야 하므로 withConnection을 가진 SqlClient만 통과합니다.",
        },
      },
      {
        title: {
          en: "Webhook claim is one statement",
          ko: "webhook claim은 단일 문입니다",
        },
        body: {
          en: "In src/stores/webhook-dedupe.ts the claim transitions through a single CTE with INSERT … ON CONFLICT DO UPDATE, so exactly one of N concurrent redeliveries receives 'claimed'.",
          ko: "src/stores/webhook-dedupe.ts의 claim은 INSERT … ON CONFLICT DO UPDATE 단일 CTE로 전이합니다. 그래서 동시 재전송 N건 중 정확히 1건만 'claimed'를 받습니다.",
        },
      },
      {
        title: {
          en: "Deadlocks fail loudly in tests",
          ko: "deadlock이 테스트에서 즉시 드러납니다",
        },
        body: {
          en: "The ./testing in-memory double throws MemoryLockContractError('nested-lock-api' | 'reentrant-lock') exactly where PostgreSQL would silently hang.",
          ko: "./testing 인메모리 대역은 PostgreSQL이라면 그대로 멈출 중첩에서 MemoryLockContractError('nested-lock-api' · 'reentrant-lock')를 던집니다.",
        },
      },
    ],
    proof: [
      { en: "0 runtime dependencies — `pg` isn’t even a peer", ko: "런타임 의존성 0 — `pg`조차 peer가 아닙니다" },
      { en: "{{guards}} @ts-expect-error compile guards", ko: "@ts-expect-error 컴파일 가드 {{guards}}개" },
      { en: "250+ unit tests · 31 more against real PostgreSQL", ko: "unit 테스트 250개 이상 · 실 PostgreSQL 대상 31건 별도" },
      { en: "7 tables, one explicit `migrate()`", ko: "테이블 7종, 명시적 `migrate()` 한 번" },
    ],
    when: {
      en: "Use it when Toss payment stores need a proven PostgreSQL implementation while your app retains connection lifecycle and key custody.",
      ko: "앱이 connection lifecycle과 key custody를 유지하면서 Toss payment store에 검증된 PostgreSQL 구현이 필요할 때 사용합니다.",
    },
    avoid: {
      en: "Do not run migrations on request or application startup, and do not use the plaintext protector in production.",
      ko: "migration을 request 또는 앱 시작 시 실행하거나 production에서 plaintext protector를 사용하지 마세요.",
    },
    goldenPath: {
      en: "Provide a SqlClient or pg pool, run migrations explicitly in deployment, then compose the store factory with an application-owned sensitive-value protector.",
      ko: "SqlClient 또는 pg pool을 제공하고 배포 중 migration을 명시적으로 실행한 뒤 앱 소유 sensitive-value protector로 store factory를 조합합니다.",
    },
    code: "import { createTossPaymentsPostgres, fromPgPool, type PgPoolLike, type SensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';\n\ndeclare const pool: PgPoolLike;\ndeclare const sensitiveValueProtector: SensitiveValueProtector; // App KMS/encryption boundary.\n\nexport const stores = createTossPaymentsPostgres({\n  sql: fromPgPool(pool),\n  sensitiveValueProtector,\n});\n\n// Run await stores.migrate() once in deployment, never per request.",
    showcase: {
      language: "ts",
      code: "import type { Pool } from 'pg';\nimport type { BillingKeyRecord } from '@gj-kit/toss-payments/server';\nimport { createAes256GcmSensitiveValueProtector, createOpaqueAdvisoryLockKey, createTossPaymentsPostgres, fromPgPool } from '@gj-kit/toss-payments-postgresql';\n\ndeclare const pool: Pool; // app owns the pg Pool\ndeclare const keyHex: string; // app owns key custody and rotation\ndeclare const blindIndex: string; // app owns the blind index of the customer id\ndeclare const record: BillingKeyRecord; // app owns the freshly issued billing key\n\nexport const pg = createTossPaymentsPostgres({\n  sql: fromPgPool(pool),\n  sensitiveValueProtector: createAes256GcmSensitiveValueProtector({ key: keyHex, keyId: '2026-08' }),\n});\n// Without sensitiveValueProtector: TS2345 '{ sql: SqlClient; }' is not assignable to 'TossPaymentsPostgresOptions'.\n\nexport const previous = await pg.billingKeys.withOpaqueMutationLock(\n  createOpaqueAdvisoryLockKey(blindIndex), // raw blindIndex: TS2345 'string' is not assignable to 'OpaqueAdvisoryLockKey'\n  record.customerKey,\n  (mutation) => mutation.replaceAndGetPrevious(record),\n);",
      caption: {
        en: "The protector is a required field and a raw identifier cannot stand in for a lock key — tsc rejects both, at TS2345, before anything reaches a database. withOpaqueMutationLock is also the only API that takes both locks, so the opaque → customer order is not a decision the caller gets to make.",
        ko: "protector는 빠뜨릴 수 있는 옵션이 아니고, raw 식별자는 lock key 자리에 들어가지 못합니다. 둘 다 DB에 닿기 전에 tsc가 TS2345로 거부합니다. 두 lock을 함께 잡는 API도 withOpaqueMutationLock 하나뿐이라, opaque → customer 순서는 호출자가 정할 여지가 없습니다.",
      },
    },
    safety: {
      en: "Use an app-owned KMS or key-management boundary for sensitive values, run explicit migrations once, and keep cleanup operations idempotent.",
      ko: "민감값에는 앱 소유 KMS 또는 key-management 경계를 사용하고, 명시적 migration은 한 번 실행하며, 정리 작업은 멱등적으로 유지하세요.",
    },
    related: ["toss-payments", "toss-payments-nestjs"],
  },
];

/**
 * The package pages use this compact, task-first framing before the full API
 * reference. It answers what a developer can run first and which host-owned
 * boundary they must wire.
 */
export const quickStartBySlug = {
  "expo-ui": {
    en: {
      outcome: "A themed, accessible button rendered from one application-wide provider.",
      boundary: "Create themes once and mount `UiProvider` at the component that wraps your app.",
    },
    ko: {
      outcome: "앱 전체 provider 하나에서 테마와 접근성이 적용된 버튼을 렌더링합니다.",
      boundary: "테마는 한 번만 만들고 앱을 감싸는 컴포넌트에 `UiProvider`를 둡니다.",
    },
  },
  "expo-media": {
    en: {
      outcome: "An Expo-backed media kit while your application keeps upload authorization.",
      boundary: "Implement `uploadApi` in your app for upload intent and completion, then declare explicit file limits.",
    },
    ko: {
      outcome: "앱이 업로드 권한을 계속 소유하는 Expo 기반 미디어 kit을 만듭니다.",
      boundary: "앱에서 upload intent와 완료를 담당하는 `uploadApi`를 구현하고, 파일 제한을 명시합니다.",
    },
  },
  "expo-auth": {
    en: {
      outcome: "One app-owned session that persists login state and coordinates concurrent refreshes.",
      boundary: "Choose the storage adapter once and connect only your refresh-endpoint callback.",
    },
    ko: {
      outcome: "로그인 상태를 저장하고 동시 refresh를 조정하는 앱 소유 세션 하나를 만듭니다.",
      boundary: "storage adapter를 한 번 선택하고, 앱의 refresh endpoint 콜백만 연결합니다.",
    },
  },
  "expo-workouts": {
    en: {
      outcome: "A native Expo app can check HealthKit or Health Connect availability and request workout access.",
      boundary: "Add the config plugin and use a development build; Expo Go and the web cannot call the native module.",
    },
    ko: {
      outcome: "native Expo 앱에서 HealthKit 또는 Health Connect 사용 가능 여부를 확인하고 운동 권한을 요청합니다.",
      boundary: "config plugin을 추가하고 development build를 사용하세요. Expo Go와 웹은 native module을 호출할 수 없습니다.",
    },
  },
  format: {
    en: {
      outcome: "A stable display label whose timezone and separator are explicit at the call site.",
      boundary: "Choose the timezone and separator in code; do not let persisted or operational values inherit device defaults.",
    },
    ko: {
      outcome: "호출 위치에서 시간대와 구분자가 명시된 안정적인 표시 문자열을 만듭니다.",
      boundary: "코드에서 시간대와 구분자를 선택하세요. 영속·운영 값에 기기 기본값을 물려주지 마세요.",
    },
  },
  "nest-operations-jobs": {
    en: {
      outcome: "An authenticated operations boundary backed by application-owned run storage.",
      boundary: "Implement `JobRunStore`, then configure a 32+ character shared secret or a token verifier before module registration.",
    },
    ko: {
      outcome: "앱 소유 실행 저장소로 뒷받침되는 인증된 운영 작업 경계를 만듭니다.",
      boundary: "`JobRunStore`를 구현한 뒤 module을 등록하기 전에 32자 이상의 shared secret 또는 token verifier를 설정합니다.",
    },
  },
  "nest-notifications": {
    en: {
      outcome: "Durable relay and dispatch runners wired to your stores and push gateway.",
      boundary: "Keep product policy in app-owned stores, presenter, and scheduling policy before registering the Nest module.",
    },
    ko: {
      outcome: "앱의 store와 push gateway에 연결된 내구성 있는 relay·dispatch runner를 만듭니다.",
      boundary: "Nest module을 등록하기 전에 제품 정책은 앱 소유 store, presenter, scheduling policy에 둡니다.",
    },
  },
  "toss-payments": {
    en: {
      outcome: "A server-only payment kit whose available flows match the stores you pass in.",
      boundary: "Parse the API secret at boot and provide your server-owned order store before enabling confirmation.",
    },
    ko: {
      outcome: "전달한 store에 맞는 결제 흐름만 노출하는 서버 전용 payment kit을 만듭니다.",
      boundary: "부팅 시 API secret을 파싱하고, 승인을 활성화하기 전에 서버 소유 order store를 제공합니다.",
    },
  },
  "toss-payments-nestjs": {
    en: {
      outcome: "One Nest provider that injects a typed payment kit.",
      boundary: "Build the core payment config, register it once, and preserve raw request bytes for webhook routes.",
    },
    ko: {
      outcome: "typed payment kit을 주입하는 Nest provider 하나를 만듭니다.",
      boundary: "core payment config을 만들고 한 번만 등록하며, webhook route에서는 원본 request bytes를 보존합니다.",
    },
  },
  "toss-payments-postgresql": {
    en: {
      outcome: "PostgreSQL-backed Toss stores with one explicit migration step.",
      boundary: "Adapt your pool with `fromPgPool`, use a real encrypted `sensitiveValueProtector`, and run migration during deployment.",
    },
    ko: {
      outcome: "명시적인 migration 단계 하나를 갖는 PostgreSQL 기반 Toss store를 만듭니다.",
      boundary: "`fromPgPool`로 pool을 adapter에 연결하고 실제 암호화 `sensitiveValueProtector`를 사용하며, migration은 배포 중에 실행합니다.",
    },
  },
};

const bilingual = (en, ko) => ({ en, ko });
const concept = (enTitle, koTitle, enBody, koBody) => ({
  title: bilingual(enTitle, koTitle),
  body: bilingual(enBody, koBody),
});
const recipe = (slug, source, enTitle, koTitle, enSummary, koSummary) => ({
  slug,
  source,
  title: bilingual(enTitle, koTitle),
  summary: bilingual(enSummary, koSummary),
});
const companion = (slug, enReason, koReason) => ({
  slug,
  reason: bilingual(enReason, koReason),
});

/**
 * Catalog-owned learning content. Recipes only point at `product.code` and
 * `product.showcase.code`, the same snippets already type-checked in package
 * READMEs. The portal therefore cannot create a second, unverified example.
 */
export const learningBySlug = {
  'expo-ui': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [
        companion('expo-media', 'Render media selection and upload state with accessible primitives.', '접근성 primitive로 미디어 선택·업로드 상태를 표현할 때 함께 사용합니다.'),
        companion('expo-auth', 'Show application-owned session state without coupling either package.', '두 패키지를 결합하지 않은 채 앱 소유 세션 상태를 표시할 때 함께 사용합니다.'),
      ],
    },
    concepts: [
      concept('Accessibility is part of the component contract', '접근성은 컴포넌트 계약의 일부입니다', 'Accessible names, press handlers, and range labels are required by component types, not left as a review checklist after layout work.', '접근성 이름, press handler, range label은 컴포넌트 타입이 요구하며 레이아웃 뒤에 확인할 리뷰 체크리스트가 아닙니다.'),
      concept('Controlled state has a complete shape', '제어 상태는 완전한 형태를 가집니다', 'Tabs carry literal item values through to their panels, so a missing panel becomes a type error instead of an empty screen.', 'Tabs는 literal item value를 panel까지 전달하므로 누락한 panel은 빈 화면이 아니라 타입 오류가 됩니다.'),
    ],
    recipes: [
      recipe('provider-and-accessible-button', 'quick-start', 'Install one provider and render an accessible control', 'provider 하나를 설치하고 접근성 control을 렌더링하기', 'Create the application theme once, then place UiProvider above the primitives that consume it.', '앱 테마를 한 번 만들고 이를 소비하는 primitive 위에 UiProvider를 둡니다.'),
      recipe('typed-tabs', 'showcase', 'Keep tab values and panels in sync', 'tab value와 panel을 동기화하기', 'Use a literal item list so every tab value requires a non-null panel and an accessible tablist name.', 'literal item 목록을 사용해 각 tab value가 non-null panel과 접근성 tablist 이름을 요구하게 합니다.'),
    ],
  },
  'expo-media': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('expo-auth', 'Keep media upload authorization in an application session.', '미디어 업로드 권한을 앱 세션에 둘 때 함께 사용합니다.')],
    },
    concepts: [
      concept('A selected asset is not always upload-safe', '선택한 asset이 항상 업로드 가능한 것은 아닙니다', 'Device-library URIs may not outlive the uploader. The adapter boundary makes durable staging and cleanup an explicit application decision.', '기기 라이브러리 URI는 업로더가 끝날 때까지 유지되지 않을 수 있습니다. adapter 경계는 지속 staging과 정리를 명시적인 앱 결정으로 만듭니다.'),
      concept('Upload recovery names the uncertain state', '업로드 복구는 불확실한 상태에 이름을 붙입니다', 'A network failure can mean uploaded, possibly-uploaded, or never reached storage. Public recovery metadata preserves that distinction without leaking URLs.', '네트워크 실패는 업로드됐거나, 업로드됐을 수 있거나, 저장소에 도달하지 못했다는 뜻일 수 있습니다. 공개 recovery metadata는 URL을 노출하지 않고 그 차이를 보존합니다.'),
    ],
    recipes: [
      recipe('declare-upload-limits', 'quick-start', 'Create a media kit with explicit upload limits', '명시적인 업로드 제한으로 media kit 만들기', 'Wire only the application upload API and a declared size policy before adding platform adapters.', 'platform adapter를 붙이기 전에 앱 upload API와 선언된 용량 정책만 연결합니다.'),
      recipe('recover-an-interrupted-upload', 'showcase', 'Classify and recover an interrupted upload', '중단된 업로드를 분류하고 복구하기', 'Narrow unknown errors into safe recovery metadata before the application reconciles storage.', '앱이 저장소 정합을 처리하기 전에 unknown error를 안전한 recovery metadata로 좁힙니다.'),
    ],
  },
  'expo-auth': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('expo-media', 'Provide a session-owned authorization callback for application media APIs.', '앱 미디어 API에 세션 소유 authorization callback을 제공할 때 함께 사용합니다.')],
    },
    concepts: [
      concept('Refresh is a coordination problem', 'refresh는 조정 문제입니다', 'Multiple requests can discover an expired token together. Injected storage and locking let the host choose the platform mechanism while one session coordinates refresh.', '여러 요청이 동시에 만료된 token을 발견할 수 있습니다. 주입한 storage와 lock으로 호스트는 플랫폼 메커니즘을 선택하고 세션은 refresh를 조정합니다.'),
      concept('A transient failure is not a sign-out', '일시적 실패는 로그아웃이 아닙니다', 'Closed refresh outcomes distinguish retryable service failures from invalid credentials, so a 5xx cannot silently clear a valid session.', '닫힌 refresh outcome은 재시도 가능한 서비스 실패와 무효 credential을 구분하므로 5xx가 유효한 세션을 조용히 지울 수 없습니다.'),
    ],
    recipes: [
      recipe('assemble-a-session', 'quick-start', 'Assemble one application session', '앱 세션 하나 조립하기', 'Choose storage and a refresh callback once; the package coordinates callers around that application-owned boundary.', 'storage와 refresh callback을 한 번 선택하면 패키지가 그 앱 소유 경계 주변의 호출자를 조정합니다.'),
      recipe('handle-every-refresh-outcome', 'showcase', 'Handle every refresh outcome explicitly', '모든 refresh outcome을 명시적으로 처리하기', 'Use the matcher so an omitted transient or rotated branch is a compile error.', 'matcher를 사용해 transient 또는 rotated 분기를 빼먹으면 컴파일 오류가 나게 합니다.'),
    ],
  },
  'expo-workouts': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('format', 'Format workout timestamps and totals with application-selected display rules.', '앱이 선택한 표시 규칙으로 운동 timestamp와 합계를 포맷할 때 함께 사용합니다.')],
    },
    concepts: [
      concept('The native boundary stays visible', 'native 경계는 드러난 채로 둡니다', 'HealthKit and Health Connect require a development build and platform permission. Availability is exposed instead of pretending Expo Go or web can perform native work.', 'HealthKit과 Health Connect에는 development build와 플랫폼 권한이 필요합니다. Expo Go나 웹이 native 작업을 할 수 있는 척하지 않고 availability를 노출합니다.'),
      concept('Write results must be narrowed', '쓰기 결과는 narrowing해야 합니다', 'A locked device, denied permission, and a saved workout are distinct results. A native ID is available only after the saved branch is proven.', '잠긴 기기, 거부된 권한, 저장된 운동은 서로 다른 결과입니다. native ID는 saved 분기를 증명한 뒤에만 사용할 수 있습니다.'),
    ],
    recipes: [
      recipe('check-platform-readiness', 'quick-start', 'Check native availability before requesting access', 'access를 요청하기 전에 native availability 확인하기', 'Start with availability and permissions in a development build, not a web or Expo Go fallback.', '웹이나 Expo Go fallback이 아니라 development build에서 availability와 permission부터 시작합니다.'),
      recipe('narrow-a-write-result', 'showcase', 'Narrow a workout write result safely', '운동 쓰기 결과를 안전하게 narrowing하기', 'Read a native ID only in the saved state and preserve why the platform cannot write.', 'saved 상태에서만 native ID를 읽고 플랫폼이 쓸 수 없을 때는 그 사유를 보존합니다.'),
    ],
  },
  format: {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('expo-workouts', 'Present workout dates and measurements with an explicit display policy.', '명시적인 표시 정책으로 운동 날짜와 측정값을 보여 줄 때 함께 사용합니다.')],
    },
    concepts: [
      concept('Display policy belongs at the call site', '표시 정책은 호출 위치에 둡니다', 'Timezone, locale, and separators are user-visible policy. Requiring them prevents a device default from changing an operational timestamp or shared label.', '시간대, locale, separator는 사용자에게 보이는 정책입니다. 이를 요구하면 기기 기본값이 운영 timestamp나 공유 label을 바꾸지 못합니다.'),
      concept('Values keep their display semantics', '값은 표시 의미를 보존합니다', 'Currency, bytes, and empty values need a declared representation; a formatter must not guess whether zero means absence or an available measurement.', '통화, byte, 빈 값에는 선언된 표현이 필요합니다. formatter가 0이 부재인지 사용할 수 있는 측정값인지 추측해서는 안 됩니다.'),
    ],
    recipes: [
      recipe('format-a-timestamp', 'quick-start', 'Format a timestamp with an explicit timezone', '명시적인 시간대로 timestamp 포맷하기', 'Keep timezone and separator beside the display call so screens cannot inherit different defaults.', '화면마다 다른 기본값을 상속하지 않도록 timezone과 separator를 display 호출 옆에 둡니다.'),
      recipe('format-money-and-bytes', 'showcase', 'Format money and bytes without hidden meaning', '숨은 의미 없이 금액과 byte 포맷하기', 'Select currency and zero-value behavior in code rather than allowing a formatter to guess policy.', 'formatter가 정책을 추측하게 두지 말고 코드에서 통화와 0값 동작을 선택합니다.'),
    ],
  },
  'nest-operations-jobs': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('nest-notifications', 'Notify operators or users after an application-owned job result.', '앱 소유 job 결과 뒤에 운영자나 사용자에게 알릴 때 함께 사용합니다.')],
    },
    concepts: [
      concept('A trigger is an operations boundary', 'trigger는 운영 경계입니다', 'A scheduled or operator-triggered route needs host-owned authorization and durable run storage. The package coordinates execution but never defines business work.', 'scheduler 또는 운영자 trigger route에는 호스트 소유 authorization과 내구성 실행 저장소가 필요합니다. 패키지는 실행을 조정하지만 비즈니스 작업을 정의하지 않습니다.'),
      concept('Run state is a discriminated result', '실행 상태는 discriminated result입니다', 'Completed, failed, skipped, and superseded runs do not share fields. Narrowing prevents a summary from claiming an execution state that never happened.', 'completed, failed, skipped, superseded 실행은 field를 공유하지 않습니다. narrowing하면 발생하지 않은 실행 상태를 summary가 주장하지 않게 됩니다.'),
    ],
    recipes: [
      recipe('register-an-authenticated-trigger', 'quick-start', 'Register an authenticated operations trigger', '인증된 운영 trigger 등록하기', 'Provide a run store and explicit authentication before exposing the trigger route.', 'trigger route를 노출하기 전에 run store와 명시적인 authentication을 제공합니다.'),
      recipe('read-a-job-result', 'showcase', 'Read a job result by its actual state', '실제 상태에 따라 job result 읽기', 'Switch on status before accessing branch-specific error, reason, and recording fields.', '분기 전용 error, reason, recording field에 접근하기 전에 status로 분기합니다.'),
    ],
  },
  'nest-notifications': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [companion('nest-operations-jobs', 'Schedule application-owned relay or dispatch work through a protected operations boundary.', '보호된 운영 경계에서 앱 소유 relay 또는 dispatch 작업을 예약할 때 함께 사용합니다.')],
    },
    concepts: [
      concept('Durability lives in the host store', '내구성은 호스트 store에 있습니다', 'The package supplies ordering and relay rules, while the application implements the durable store, presenter, push gateway, and product policy.', '패키지는 순서와 relay 규칙을 제공하고, 내구성 store, presenter, push gateway, 제품 정책은 앱이 구현합니다.'),
      concept('Time policy needs a timezone', '시간 정책에는 시간대가 필요합니다', 'Quiet hours and batching are not fixed offsets. A timezone and valid daily window keep DST and aggregation behavior explainable.', 'quiet hours와 batching은 고정 offset이 아닙니다. timezone과 올바른 일일 window가 DST와 집계 동작을 설명 가능하게 유지합니다.'),
    ],
    recipes: [
      recipe('register-a-dispatcher', 'quick-start', 'Register a durable notification dispatcher', '내구성 있는 알림 dispatcher 등록하기', 'Pass application stores, a presenter, policy, and push gateway into the Nest module explicitly.', '앱 store, presenter, policy, push gateway를 Nest module에 명시적으로 전달합니다.'),
      recipe('test-store-and-quiet-hours', 'showcase', 'Test store behavior and quiet-hours policy', 'store 동작과 quiet-hours policy 테스트하기', 'Run shipped contract cases against the application store and declare a timezone for quiet hours.', '제공된 contract case를 앱 store에 실행하고 quiet hours에는 timezone을 선언합니다.'),
    ],
  },
  'toss-payments': {
    relationship: {
      kind: 'standalone',
      requires: [],
      optionalCompanions: [
        companion('toss-payments-nestjs', 'Register the typed core kit through Nest dependency injection.', 'typed core kit을 Nest dependency injection으로 등록할 때 함께 사용합니다.'),
        companion('toss-payments-postgresql', 'Use PostgreSQL implementations for application-owned payment stores.', '앱 소유 payment store에 PostgreSQL 구현을 사용할 때 함께 사용합니다.'),
      ],
    },
    concepts: [
      concept('Available flows reflect supplied stores', '사용 가능한 flow는 제공한 store를 반영합니다', 'Confirmation, billing, and webhook capabilities do not appear until the server supplies their corresponding stores, making an unwired payment path impossible to call.', 'confirmation, billing, webhook capability는 서버가 대응 store를 제공하기 전에는 나타나지 않아 배선하지 않은 결제 경로를 호출할 수 없습니다.'),
      concept('Verification precedes trust', '검증이 신뢰보다 먼저입니다', 'Redirects and webhook payloads are inputs, not payment truth. The server verifies order amount, raw-body event, and trust grade before settlement.', 'redirect와 webhook payload는 결제 진실이 아니라 입력입니다. 서버는 확정 전에 주문 금액, raw-body event, trust grade를 검증합니다.'),
    ],
    recipes: [
      recipe('assemble-a-confirmation-flow', 'quick-start', 'Assemble a confirmation flow with an order store', 'order store로 confirmation flow 조립하기', 'Parse the server key at boot and make the host order store explicit before confirmation becomes available.', '부팅 때 server key를 파싱하고 confirmation이 가능해지기 전에 호스트 order store를 명시합니다.'),
      recipe('add-billing-and-webhook-boundaries', 'showcase', 'Add billing and webhook boundaries deliberately', 'billing과 webhook 경계를 의도적으로 추가하기', 'Wire only the stores needed by each flow so absent capabilities cannot be used accidentally.', '각 flow에 필요한 store만 연결해 없는 capability를 실수로 사용할 수 없게 합니다.'),
    ],
  },
  'toss-payments-nestjs': {
    relationship: {
      kind: 'requires',
      requires: ['toss-payments'],
      optionalCompanions: [companion('toss-payments-postgresql', 'Supply PostgreSQL-backed core stores to the Nest module when the host chooses PostgreSQL.', '호스트가 PostgreSQL을 선택했다면 Nest module에 PostgreSQL 기반 core store를 제공합니다.')],
    },
    concepts: [
      concept('Nest DI must preserve the core kit type', 'Nest DI는 core kit type을 보존해야 합니다', 'A generic DI token loses configuration-specific capabilities. The package rebuilds the typed core kit from registered configuration at the injection point.', 'generic DI token은 configuration별 capability를 잃습니다. 이 패키지는 주입 지점에서 등록한 configuration으로 typed core kit을 다시 만듭니다.'),
      concept('Webhook verification needs raw bytes', 'webhook 검증에는 raw bytes가 필요합니다', 'Once Nest JSON middleware parses a request, re-serializing cannot recover its signature input. Raw-body setup is a prerequisite.', 'Nest JSON middleware가 요청을 파싱한 뒤에는 재직렬화로 signature input을 복구할 수 없습니다. raw-body 설정은 선행 조건입니다.'),
    ],
    recipes: [
      recipe('register-a-typed-provider', 'quick-start', 'Register one typed payment provider', 'typed payment provider 하나 등록하기', 'Build the core configuration first, then register the module once for typed injection.', '먼저 core configuration을 만든 다음 typed injection을 위해 module을 한 번 등록합니다.'),
      recipe('inject-only-wired-flows', 'showcase', 'Inject only flows the configuration wired', 'configuration이 배선한 flow만 주입하기', 'Recover the configuration-specific type so an unwired billing flow has no property.', 'configuration별 type을 복구해 배선하지 않은 billing flow에는 property가 없게 합니다.'),
    ],
  },
  'toss-payments-postgresql': {
    relationship: {
      kind: 'requires',
      requires: ['toss-payments'],
      optionalCompanions: [companion('toss-payments-nestjs', 'Pass PostgreSQL-backed stores through a typed Nest payment provider.', 'PostgreSQL 기반 store를 typed Nest payment provider로 전달할 때 함께 사용합니다.')],
    },
    concepts: [
      concept('Sensitive values require an application protector', '민감값에는 앱 protector가 필요합니다', 'Pool lifecycle and key custody remain in the host application. Required protection prevents omitted encryption from persisting billing data in plaintext.', 'pool lifecycle과 key custody는 호스트 앱에 남습니다. 필수 protection은 빠뜨린 암호화가 billing 데이터를 plaintext로 저장하지 못하게 합니다.'),
      concept('Migrations are an explicit deployment action', 'migration은 명시적인 배포 작업입니다', 'The store aggregate exposes one migration step for deployment automation. Request handling and application startup can repeat under normal traffic.', 'store aggregate는 배포 자동화를 위한 migration 단계 하나를 노출합니다. request 처리와 application startup은 일반 트래픽에서도 반복될 수 있습니다.'),
    ],
    recipes: [
      recipe('assemble-protected-stores', 'quick-start', 'Assemble protected PostgreSQL stores', '보호된 PostgreSQL store 조립하기', 'Adapt the host pool and pass an application-owned protector before exposing any payment store.', 'payment store를 노출하기 전에 호스트 pool을 adapter에 연결하고 앱 소유 protector를 전달합니다.'),
      recipe('lock-an-opaque-customer-key', 'showcase', 'Mutate billing data behind an opaque lock key', 'opaque lock key 뒤에서 billing data 변경하기', 'Use the branded opaque key and supplied lock order rather than passing raw customer identifiers to storage.', 'raw customer identifier를 storage에 넘기지 말고 branded opaque key와 제공된 lock 순서를 사용합니다.'),
    ],
  },
};

/** The only cross-package guides. Both explain optional adoption paths. */
export const solutions = [
  {
    slug: 'toss-payment-service',
    title: bilingual('Build a Toss payment service', 'Toss 결제 서비스 만들기'),
    description: bilingual('Choose the smallest payment boundary first, then add Nest dependency injection or PostgreSQL stores only when the host application needs them.', '가장 작은 결제 경계부터 선택하고, 호스트 앱에 필요할 때만 Nest dependency injection 또는 PostgreSQL store를 추가합니다.'),
    packages: ['toss-payments', 'toss-payments-nestjs', 'toss-payments-postgresql'],
    choices: [
      { title: bilingual('Core payment service', 'Core 결제 서비스'), packages: ['toss-payments'], body: bilingual('Use the server-only core when the application owns framework composition and payment stores.', '앱이 framework 조합과 payment store를 직접 소유한다면 server-only core를 사용합니다.') },
      { title: bilingual('NestJS payment service', 'NestJS 결제 서비스'), packages: ['toss-payments', 'toss-payments-nestjs'], body: bilingual('Add the Nest package for typed provider registration and raw-body webhook handling.', 'typed provider 등록과 raw-body webhook 처리가 필요할 때 Nest 패키지를 추가합니다.') },
      { title: bilingual('PostgreSQL-backed payment service', 'PostgreSQL 기반 결제 서비스'), packages: ['toss-payments', 'toss-payments-postgresql'], body: bilingual('Add PostgreSQL stores for the shipped migration and encrypted persistence implementation.', '제공된 migration과 암호화 영속 구현이 필요할 때 PostgreSQL store를 추가합니다.') },
    ],
    steps: [
      { title: bilingual('1. Start with verification', '1. 검증부터 시작하기'), body: bilingual('Create the core kit with the order and payment boundaries the server actually owns.', '서버가 실제로 소유하는 order와 payment 경계로 core kit을 만듭니다.') },
      { title: bilingual('2. Add a host adapter only when needed', '2. 필요할 때만 호스트 adapter 추가하기'), body: bilingual('Nest DI and PostgreSQL stores are extension choices, not prerequisites for a core integration.', 'Nest DI와 PostgreSQL store는 core 통합의 선행 조건이 아니라 확장 선택지입니다.') },
      { title: bilingual('3. Keep secrets and policy in the application', '3. secret과 policy는 앱에 두기'), body: bilingual('Key custody, refund policy, and application audit decisions remain outside the packages.', 'key custody, 환불 정책, 앱 감사 결정은 패키지 밖에 남습니다.') },
    ],
  },
  {
    slug: 'nest-operations-notifications',
    title: bilingual('Run operations work and notifications', '운영 작업과 알림 실행하기'),
    description: bilingual('Use protected operations jobs and durable notifications together when one application-owned workflow needs both. Each package still works without the other.', '앱 소유 workflow 하나에 둘 다 필요할 때 보호된 operations job과 내구성 있는 notification을 함께 사용합니다. 각 패키지는 다른 패키지 없이도 동작합니다.'),
    packages: ['nest-operations-jobs', 'nest-notifications'],
    choices: [
      { title: bilingual('Run protected work', '보호된 작업 실행'), packages: ['nest-operations-jobs'], body: bilingual('Use jobs alone for authenticated scheduled or operator-triggered work with durable run state.', '내구성 실행 상태가 있는 인증된 scheduler 또는 운영자 trigger 작업에는 job만 사용합니다.') },
      { title: bilingual('Deliver durable notifications', '내구성 있는 알림 전달'), packages: ['nest-notifications'], body: bilingual('Use notifications alone for outbox, relay, quiet-hours, and dispatch policy.', 'outbox, relay, quiet hours, dispatch policy에는 notification만 사용합니다.') },
      { title: bilingual('Compose at the application boundary', '앱 경계에서 조합'), packages: ['nest-operations-jobs', 'nest-notifications'], body: bilingual('After a job result, application code may enqueue a notification. Neither package imports, schedules, or authorizes the other.', 'job 결과 뒤에 앱 코드가 notification을 enqueue할 수 있습니다. 두 패키지는 서로를 import, schedule, authorize하지 않습니다.') },
    ],
    steps: [
      { title: bilingual('1. Implement both host stores independently', '1. 두 host store를 독립적으로 구현하기'), body: bilingual('Keep run persistence and notification persistence in the application database boundary.', '실행 영속과 notification 영속을 앱 database 경계에 둡니다.') },
      { title: bilingual('2. Schedule only the work you own', '2. 소유한 작업만 schedule하기'), body: bilingual('A job may ask application code to dispatch due notifications, but the application owns cadence and authorization.', 'job은 앱 코드에 due notification dispatch를 요청할 수 있지만 cadence와 authorization은 앱이 소유합니다.') },
      { title: bilingual('3. Verify each store contract', '3. 각 store contract 검증하기'), body: bilingual('Run package-provided contract cases against each host implementation before connecting workflows.', 'workflow를 연결하기 전에 각 host 구현에 제공된 contract case를 실행합니다.') },
    ],
  },
];

export const packageBySlug = new Map(packages.map((entry) => [entry.slug, entry]));
export const categoryBlurbFor = (category, locale) => categoryBlurbs[category]?.[locale] ?? '';
