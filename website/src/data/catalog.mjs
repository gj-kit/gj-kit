export const SITE_URL = 'https://gj-kit.github.io/gj-kit';
export const REPOSITORY_URL = 'https://github.com/gj-kit/gj-kit';

/**
 * Product-language source of truth. Package versions, exports, and peer dependencies
 * deliberately do not live here: the snapshot generator reads those release facts.
 */
export const packages = [
  {
    slug: 'expo-ui',
    name: '@gj-kit/expo-ui',
    category: { en: 'Expo & React Native', ko: 'Expo · React Native' },
    description: {
      en: 'Accessible, token-driven UI primitives for Expo, React Native, and the web.',
      ko: 'Expo, React Native, 웹을 위한 접근성 중심 토큰 기반 UI 프리미티브입니다.',
    },
    when: {
      en: 'Use it when one design language, controlled component state, overlays, and accessibility behavior must work across native and web targets.',
      ko: '네이티브와 웹에서 하나의 디자인 언어, 제어 컴포넌트 상태, 오버레이, 접근성 동작을 함께 유지해야 할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not use it for product routes, data stores, analytics, or product-specific copy.',
      ko: '제품 route, 데이터 store, analytics, 제품 고유 문구를 이 패키지에 넣기 위한 용도로는 사용하지 마세요.',
    },
    goldenPath: {
      en: 'Install the package, create your theme once, and place UiProvider at the application root before composing primitives.',
      ko: '패키지를 설치한 뒤 테마를 한 번 만들고, 프리미티브를 조합하기 전에 앱 루트에 UiProvider를 둡니다.',
    },
    code: "import { Button, UiProvider, enStrings } from '@gj-kit/expo-ui';\nimport { createThemes } from '@gj-kit/expo-ui/theme';\n\nconst themes = createThemes();\n\nexport function App() {\n  return (\n    <UiProvider theme={themes} strings={enStrings}>\n      <Button label=\"Get started\" onPress={() => {}} />\n    </UiProvider>\n  );\n}",
    safety: {
      en: 'Keep optional safe-area and React Native Web peers behind their documented subpaths. Supply application copy through strings rather than baking product copy into primitives.',
      ko: 'optional safe-area와 React Native Web peer는 문서화된 subpath에서만 가져오고, 제품 문구는 프리미티브에 넣지 말고 strings로 주입하세요.',
    },
    related: ['expo-media', 'expo-auth'],
  },
  {
    slug: 'expo-media',
    name: '@gj-kit/expo-media',
    category: { en: 'Expo & React Native', ko: 'Expo · React Native' },
    description: {
      en: 'A hardened Expo and React Native media pipeline with explicit adapters and durable file boundaries.',
      ko: '명시적 adapter와 지속 파일 경계를 갖춘 하드닝된 Expo·React Native 미디어 파이프라인입니다.',
    },
    when: {
      en: 'Use it for media selection, upload preparation, hashing, device-library access, and durable local files while your app keeps its own API and storage policy.',
      ko: '앱이 API와 저장소 정책을 직접 소유하면서 미디어 선택, 업로드 준비, 해싱, 기기 라이브러리, 지속 로컬 파일을 다룰 때 사용합니다.',
    },
    avoid: {
      en: 'Do not put record ownership, presign authorization, or orphan-cleanup policy in this library.',
      ko: '레코드 소유권, presign 권한, orphan 정리 정책을 이 라이브러리에 넣지 마세요.',
    },
    goldenPath: {
      en: 'Provide the two backend upload operations and explicit limits, then let createMediaKit compose the supported Expo adapters.',
      ko: '백엔드 업로드 작업 두 개와 명시적 limits를 제공하고 createMediaKit이 지원되는 Expo adapter를 조합하게 합니다.',
    },
    code: "import { createMediaKit } from '@gj-kit/expo-media';\n\nconst media = createMediaKit({\n  api: uploadApi,\n  limits: { image: { maxBytes: 15 * 1024 * 1024 } },\n});",
    safety: {
      en: 'Never expose presigned URLs or native URI details in public errors. Keep cleanup authorization and attachment transactions in the consuming application.',
      ko: 'presigned URL이나 native URI 세부 정보를 공개 오류에 노출하지 말고, 정리 권한과 attachment 트랜잭션은 소비 앱에 둡니다.',
    },
    related: ['expo-ui', 'expo-auth'],
  },
  {
    slug: 'expo-auth',
    name: '@gj-kit/expo-auth',
    category: { en: 'Expo & React Native', ko: 'Expo · React Native' },
    description: {
      en: 'Token lifecycle primitives for Expo, React Native, and the web, including coordinated refresh and storage adapters.',
      ko: '공동 refresh와 storage adapter를 포함한 Expo, React Native, 웹용 토큰 수명주기 프리미티브입니다.',
    },
    when: {
      en: 'Use it when an app needs one reusable token refresh and persistence boundary across mobile and browser clients.',
      ko: '모바일과 브라우저 클라이언트 전체에서 재사용할 토큰 refresh 및 영속 경계가 필요할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not put application routes, identity-provider policy, telemetry, or API client ownership in the package.',
      ko: '앱 route, identity provider 정책, telemetry, API client 소유권을 패키지에 넣지 마세요.',
    },
    goldenPath: {
      en: 'Start from the root token lifecycle API and import the storage subpath only for the platform storage adapter you need.',
      ko: 'root 토큰 수명주기 API에서 시작하고 필요한 플랫폼 storage adapter에만 storage subpath를 가져옵니다.',
    },
    code: "import * as auth from '@gj-kit/expo-auth';\n\n// Compose the public token lifecycle contracts with your app-owned API client.\nvoid auth;",
    safety: {
      en: 'Treat tokens as secrets: use the supplied error contracts and never log token strings or raw authorization responses.',
      ko: '토큰은 secret으로 취급하세요. 제공된 오류 계약을 사용하고 토큰 문자열이나 원본 authorization 응답을 로그에 남기지 마세요.',
    },
    related: ['expo-media', 'expo-ui'],
  },
  {
    slug: 'expo-workouts',
    name: '@gj-kit/expo-workouts',
    category: { en: 'Expo & React Native', ko: 'Expo · React Native' },
    description: {
      en: 'A native Expo bridge for HealthKit and Health Connect workouts, routes, authorization, and incremental sync.',
      ko: 'HealthKit과 Health Connect의 운동, 경로, 권한, 증분 동기화를 위한 native Expo bridge입니다.',
    },
    when: {
      en: 'Use it when an Expo app needs platform health data while retaining location collection, UI, and sync ownership.',
      ko: 'Expo 앱이 위치 수집, UI, 동기화 소유권을 유지하면서 플랫폼 건강 데이터가 필요할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not use it for live GPS tracking, background location policy, or server-side health-data processing.',
      ko: '실시간 GPS 추적, 백그라운드 위치 정책, 서버 측 건강 데이터 처리를 위해 사용하지 마세요.',
    },
    goldenPath: {
      en: 'Add the config plugin, build a native app, request only the required authorization, then persist the returned sync token in your app.',
      ko: 'config plugin을 추가하고 native 앱을 빌드한 뒤 필요한 권한만 요청하고, 반환된 sync token을 앱에 저장합니다.',
    },
    code: "import { getAvailability, requestAuthorization } from '@gj-kit/expo-workouts';\n\nconst availability = await getAvailability();\nif (availability.available) {\n  await requestAuthorization({ read: ['workouts'] });\n}",
    safety: {
      en: 'This is a native module: Expo Go and web/Node are intentionally unsupported for native calls. Explain health permissions before requesting them.',
      ko: '이는 native module입니다. Expo Go와 web/Node에서는 native 호출을 의도적으로 지원하지 않습니다. 권한 요청 전에 건강 데이터 권한의 이유를 설명하세요.',
    },
    related: ['expo-auth', 'format'],
  },
  {
    slug: 'format',
    name: '@gj-kit/format',
    category: { en: 'Utilities', ko: '유틸리티' },
    description: {
      en: 'Explicit-by-construction date, number, byte, duration, and Korean currency formatting for TypeScript.',
      ko: 'TypeScript용 명시성 강제 날짜, 숫자, 바이트, 기간, 한국 원화 포매팅 유틸리티입니다.',
    },
    when: {
      en: 'Use it when timezone, locale, unit, and currency rendering choices must be visible in the call site.',
      ko: '시간대, locale, 단위, 통화 표시 선택을 호출 위치에서 분명히 해야 할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not use it to own application copy, user locale preference, or financial rounding policy outside its documented contract.',
      ko: '문서화된 계약 밖의 앱 문구, 사용자 locale 선호, 금융 반올림 정책을 소유시키기 위해 사용하지 마세요.',
    },
    goldenPath: {
      en: 'Parse instants once, then pass required timezone and locale options to the formatter that owns the rendering choice.',
      ko: 'instant를 한 번 파싱한 뒤 표시 선택을 소유하는 formatter에 필수 시간대와 locale 옵션을 전달합니다.',
    },
    code: "import { formatDateTime } from '@gj-kit/format';\n\nconst label = formatDateTime('2026-08-26T00:00:00.000Z', {\n  timeZone: 'Asia/Seoul',\n  locale: 'en-US',\n});\nvoid label;",
    safety: {
      en: 'Do not rely on implicit device timezone or locale defaults for persisted or operational values.',
      ko: '영속 데이터나 운영 값에 암묵적인 기기 시간대 또는 locale 기본값을 의존하지 마세요.',
    },
    related: ['expo-ui', 'expo-workouts'],
  },
  {
    slug: 'nest-operations-jobs',
    name: '@gj-kit/nest-operations-jobs',
    category: { en: 'NestJS', ko: 'NestJS' },
    description: {
      en: 'NestJS composition for durable, authenticated, observable operational jobs with explicit store ports.',
      ko: '명시적 store port를 갖춘 내구성, 인증, 관측 가능한 운영 작업을 위한 NestJS 조합 패키지입니다.',
    },
    when: {
      en: 'Use it when a Nest application needs scheduled or operator-triggered work with explicit concurrency, authorization, and run persistence.',
      ko: 'Nest 앱에서 명시적 동시성, 권한, 실행 영속성을 갖춘 스케줄 또는 운영자 실행 작업이 필요할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not hide product business rules, queue infrastructure, or application authorization policy behind this integration.',
      ko: '제품 비즈니스 규칙, queue 인프라, 앱 권한 정책을 이 통합 뒤에 숨기지 마세요.',
    },
    goldenPath: {
      en: 'Implement the public store and authenticator ports in your application, register the module, then expose only the jobs your operators should run.',
      ko: '앱에서 공개 store와 authenticator port를 구현하고 module을 등록한 뒤 운영자가 실행해야 하는 작업만 노출합니다.',
    },
    code: "import { OperationsJobsModule } from '@gj-kit/nest-operations-jobs';\n\nvoid OperationsJobsModule;",
    safety: {
      en: 'Keep job-trigger authorization and app data ownership in the host application. Never turn a convenience route into an unauthenticated operations endpoint.',
      ko: '작업 실행 권한과 앱 데이터 소유권은 host 앱에 둡니다. 편의 route를 인증 없는 운영 endpoint로 만들지 마세요.',
    },
    related: ['nest-notifications', 'toss-payments-nestjs'],
  },
  {
    slug: 'nest-notifications',
    name: '@gj-kit/nest-notifications',
    category: { en: 'NestJS', ko: 'NestJS' },
    description: {
      en: 'NestJS composition for transactional notification relay, dispatch, presentation, and Expo push boundaries.',
      ko: '트랜잭션 알림 relay, dispatch, presentation, Expo push 경계를 위한 NestJS 조합 패키지입니다.',
    },
    when: {
      en: 'Use it when product events must become durable, deduplicated notification work without making delivery policy part of the product domain.',
      ko: '제품 이벤트를 delivery 정책을 제품 도메인에 섞지 않고 내구성 있고 dedupe된 알림 작업으로 전환해야 할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not move product copy, recipient policy, or user-preference decisions into the generic relay.',
      ko: '제품 문구, 수신자 정책, 사용자 선호 결정을 범용 relay로 옮기지 마세요.',
    },
    goldenPath: {
      en: 'Provide the application stores and presentation policy, register the Nest module, then run relay and dispatch workers through your normal operations boundary.',
      ko: '앱 store와 presentation 정책을 제공하고 Nest module을 등록한 뒤 일반 운영 경계에서 relay와 dispatch worker를 실행합니다.',
    },
    code: "import { NestNotificationsModule } from '@gj-kit/nest-notifications';\n\nvoid NestNotificationsModule;",
    safety: {
      en: 'Keep credentials, endpoint ownership, and user-visible product wording in the application. Use the typed error and delivery outcomes instead of raw provider failures.',
      ko: 'credential, endpoint 소유권, 사용자 노출 제품 문구는 앱에 둡니다. 원본 provider 실패 대신 typed error와 delivery outcome을 사용하세요.',
    },
    related: ['nest-operations-jobs', 'expo-auth'],
  },
  {
    slug: 'toss-payments',
    name: '@gj-kit/toss-payments',
    category: { en: 'Payments', ko: '결제' },
    description: {
      en: 'Type-safe Toss Payments widget and API v2 flows for TypeScript servers and browsers.',
      ko: 'TypeScript 서버와 브라우저를 위한 타입 안전 Toss Payments 위젯 및 API v2 흐름입니다.',
    },
    when: {
      en: 'Use it when payment key boundaries, order-amount verification, webhook trust, and idempotent billing flows must be encoded in types.',
      ko: '결제 키 경계, 주문 금액 검증, 웹훅 신뢰도, 멱등 빌링 흐름을 타입으로 강제해야 할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not treat it as a complete order system or store raw secrets, audit payloads, and refund policy in its generic layer.',
      ko: '완전한 주문 시스템으로 취급하거나 raw secret, audit payload, 환불 정책을 범용 계층에 저장하지 마세요.',
    },
    goldenPath: {
      en: 'Parse the server key at boot, compose the kit with your app-owned stores, and confirm only against the server-side order record.',
      ko: '부팅 시 서버 키를 파싱하고 앱 소유 store로 kit을 조합하며 서버 측 주문 레코드와 대조한 경우에만 승인합니다.',
    },
    code: "import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';\n\nconst secretKey = parseApiSecretKey(process.env.TOSS_SECRET_KEY ?? '');\nvoid createTossPayments;\nvoid secretKey;",
    safety: {
      en: 'Never import server key parsers into browser code or trust a redirect/webhook without the documented verification path. Keep secrets and exact audit bodies encrypted at rest.',
      ko: 'server 키 parser를 브라우저 코드에 import하거나 문서화된 검증 경로 없이 redirect/웹훅을 신뢰하지 마세요. secret과 정확한 audit body는 저장 시 암호화하세요.',
    },
    related: ['toss-payments-nestjs', 'toss-payments-postgresql'],
  },
  {
    slug: 'toss-payments-nestjs',
    name: '@gj-kit/toss-payments-nestjs',
    category: { en: 'Payments', ko: '결제' },
    description: {
      en: 'NestJS DI and raw-body webhook composition for @gj-kit/toss-payments.',
      ko: '@gj-kit/toss-payments를 위한 NestJS DI 및 raw-body 웹훅 조합 패키지입니다.',
    },
    when: {
      en: 'Use it when a Nest application needs to keep the core payment kit’s types and safety boundary through dependency injection.',
      ko: 'Nest 앱에서 core payment kit의 타입과 안전 경계를 의존성 주입까지 유지해야 할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not reimplement payment verification in controllers or rely on parsed JSON when webhook verification requires raw bytes.',
      ko: 'controller에서 결제 검증을 다시 구현하거나 웹훅 검증에 raw bytes가 필요한데 파싱된 JSON에 의존하지 마세요.',
    },
    goldenPath: {
      en: 'Register TossPaymentsModule with your stores, inject the typed kit, and enable rawBody before binding a webhook handler.',
      ko: 'store와 함께 TossPaymentsModule을 등록하고 typed kit을 주입하며 웹훅 handler를 연결하기 전에 rawBody를 활성화합니다.',
    },
    code: "import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';\n\nvoid TossPaymentsModule;",
    safety: {
      en: 'Preserve raw request bytes for verified webhooks and make every store dependency explicit in the host Nest module.',
      ko: '검증되는 웹훅은 원본 request bytes를 보존하고, 모든 store 의존성을 host Nest module에 명시하세요.',
    },
    related: ['toss-payments', 'toss-payments-postgresql'],
  },
  {
    slug: 'toss-payments-postgresql',
    name: '@gj-kit/toss-payments-postgresql',
    category: { en: 'Payments', ko: '결제' },
    description: {
      en: 'PostgreSQL stores, migrations, inbox, and encryption seams for @gj-kit/toss-payments.',
      ko: '@gj-kit/toss-payments를 위한 PostgreSQL store, migration, inbox, 암호화 seam입니다.',
    },
    when: {
      en: 'Use it when Toss payment stores need a proven PostgreSQL implementation while your app retains connection lifecycle and key custody.',
      ko: '앱이 connection lifecycle과 key custody를 유지하면서 Toss payment store에 검증된 PostgreSQL 구현이 필요할 때 사용합니다.',
    },
    avoid: {
      en: 'Do not run migrations on request or application startup, and do not use the plaintext protector in production.',
      ko: 'migration을 request 또는 앱 시작 시 실행하거나 production에서 plaintext protector를 사용하지 마세요.',
    },
    goldenPath: {
      en: 'Provide a SqlClient or pg pool, run migrations explicitly in deployment, then compose the store factory with an application-owned sensitive-value protector.',
      ko: 'SqlClient 또는 pg pool을 제공하고 배포 중 migration을 명시적으로 실행한 뒤 앱 소유 sensitive-value protector로 store factory를 조합합니다.',
    },
    code: "import { createTossPaymentsPostgres, migrate } from '@gj-kit/toss-payments-postgresql';\n\nvoid createTossPaymentsPostgres;\nvoid migrate;",
    safety: {
      en: 'Use an app-owned KMS or key-management boundary for sensitive values, run explicit migrations once, and keep cleanup operations idempotent.',
      ko: '민감값에는 앱 소유 KMS 또는 key-management 경계를 사용하고, 명시적 migration은 한 번 실행하며, 정리 작업은 멱등적으로 유지하세요.',
    },
    related: ['toss-payments', 'toss-payments-nestjs'],
  },
];

export const packageBySlug = new Map(packages.map((entry) => [entry.slug, entry]));
