# GJ Kit

[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![packages](https://img.shields.io/badge/packages-10-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)
[![node](https://img.shields.io/badge/node-%3E%3D20-0a7ea4?style=flat-square)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-0a7ea4?style=flat-square)](https://github.com/gj-kit/gj-kit/blob/main/LICENSE)

[English](./README.md) · **한국어**

> **빠뜨린 한 줄이 장애가 아니라 컴파일 에러로 돌아오는 TypeScript 라이브러리 열 개입니다.**

Expo·React Native·NestJS·PostgreSQL·토스페이먼츠까지, 조용한 실수 하나가 돈이나 데이터, 사용자 세션을 잃게 만드는 경계마다 패키지를 하나씩 두었습니다. 그 버그를 장애 대응 채널이 아니라 tsc에서 먼저 만나고 싶은 팀을 위한 것입니다.

## 왜 이렇게 만들었나

- **위험한 기본값 자체가 없습니다** — 기본값에 맡겼을 인자가 전부 필수입니다. `createTossPayments`는 OrderStore를 넘기기 전에는 `confirm` 프로퍼티가, BillingKeyStore를 넘기기 전에는 `billing` 프로퍼티가 아예 없는 타입을 돌려줍니다. `formatDateTime(instant)`는 `timeZone`에 기본값이 없어서 컴파일되지 않고, `createTossPaymentsPostgres({ sql })`은 암호화 protector가 필수 필드라 타입 에러입니다. 무제한 업로드도 `Number.POSITIVE_INFINITY`가 거부되기 때문에 `'server-enforced'`라고 직접 적어야 합니다.
- **분기를 빼놓을 수 없습니다** — 돌려받는 결과가 union이라, 그냥 빠뜨렸을 분기에 이름이 붙어 있습니다. `matchRefreshOutcome`은 token refresh의 다섯 결말을 전부 핸들러 키로 받는데, `transient`를 빼면 그 호출은 컴파일되지 않습니다. 5xx를 오탐 로그아웃으로 바꾸는 분기가 바로 그것입니다. `saveWorkout()`의 `nativeId`도, 개발 중에는 한 번도 마주치지 않는 잠긴 기기 분기를 `status === 'saved'`로 좁혀 지나기 전에는 TS2339입니다. 잡 실행 결과의 `error` 역시 `status`로 좁히기 전에는 접근할 수 없습니다.
- **강제 장치도 테스트가 지킵니다** — `tests/types` 아래 65개 픽스처 파일에 `@ts-expect-error` 708개가 들어 있고, `vitest typecheck`가 그 전부를 실행합니다. TypeScript는 더 이상 아무것도 잡아내지 못하는 directive 자체를 에러(TS2578)로 취급합니다. 그래서 강제가 느슨해지는 순간 테스트는 통과하는 게 아니라 깨집니다. 여기서는 규칙이 빌드를 깨뜨리지 않고서는 문서 속 한 줄짜리 권고로 전락할 수 없습니다.
- **앱이 소유한 절반은 Node에서 돕니다** — 열 개 중 일곱 개가 프레임워크 없는 `./testing` 엔트리를 함께 냅니다. 위험한 대상을 붙이지 않고도 앱이 소유한 부분을 검사할 수 있다는 뜻입니다. `nest-notifications`는 직접 운영하는 database에 그대로 겨눌 수 있는 적합성 케이스 30개를, `nest-operations-jobs`는 13개를 돌려줍니다. `toss-payments-postgresql`의 인메모리 대역은 PostgreSQL이라면 조용히 멈췄을 중첩 lock에서 그 자리에 예외를 던집니다. `expo-workouts`는 API가 아니라 그 아래 네이티브 모듈 seam을 대체하기 때문에, 실제 코어 코드가 cursor reset 사유 6종을 vitest에서 그대로 재현합니다.

## 패키지

### Expo · React Native

플랫폼이 조용히 실패하는 네 지점을 하나씩 맡습니다. 접근성 이름이 없는 IconButton, reject 대신 프로세스를 끝내 버리는 업로드, 5xx를 로그아웃으로 오분류하는 refresh, 그리고 빠뜨린 route를 함께 지워 버리는 Health Connect upsert입니다.

| 패키지 | 무엇을 막아 주는가 |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | 이름 없는 IconButton·Tabs·Slider가 스크린 리더 버그가 아니라 컴파일 에러가 되는 React Native·웹 UI primitive 모음입니다. |
| [`@gj-kit/expo-media`](./expo-media) | Expo 미디어 업로드의 위험한 기본값을 사고가 아니라 컴파일 에러로 만듭니다. |
| [`@gj-kit/expo-auth`](./expo-auth) | Expo·React Native·웹을 한 벌의 코드로 다루는 token refresh 코어입니다. transient 분기를 빠뜨리면 컴파일이 실패합니다. |
| [`@gj-kit/expo-workouts`](./expo-workouts) | Expo에서 HealthKit·Health Connect 운동 데이터를 다룹니다. 저장된 데이터를 지워 버리는 실수는 컴파일 단계에서 막힙니다. |

### 유틸리티

포매터가 조용히 세 벌로 갈라지는 자리를 하나로 묶습니다. 시간대, 날짜 구분자, 통화 표기, 바이트 단위 체계, 0 바이트의 의미까지 전부 필수 인자라, 두 화면이 어긋나려면 누군가 그렇게 적어야만 합니다.

| 패키지 | 무엇을 막아 주는가 |
| --- | --- |
| [`@gj-kit/format`](./format) | timestamp가 화면마다 달라지려면 누군가 그렇게 적어야 합니다. timeZone에는 기본값이 없어서, 생략하면 컴파일이 되지 않습니다. |

### NestJS

잡과 알림 파이프라인을 얹되 database는 그대로 앱이 소유합니다. 순서와 liveness 규칙은 라이브러리가 소유하고, 잡을 두 번 돌게 만드는 설정은 부팅에서 거부하며, 실제 store에 그대로 걸 수 있는 프레임워크 없는 적합성 케이스를 함께 냅니다.

| 패키지 | 무엇을 막아 주는가 |
| --- | --- |
| [`@gj-kit/nest-operations-jobs`](./nest-operations-jobs) | 인증 없는 trigger, 그리고 잡을 두 번 돌게 만드는 설정은 scheduler의 첫 호출이 아니라 컴파일과 부팅에서 걸립니다. |
| [`@gj-kit/nest-notifications`](./nest-notifications) | 알림 파이프라인에서 위험한 결정은 프로덕션이 아니라 컴파일 단계에서 막습니다. |

### 결제

토스페이먼츠 코어와 Nest DI 조합, PostgreSQL store 구현까지 세 패키지입니다. 검증을 건너뛴 confirm, 멱등키 없는 billing approve, protector 없이 조립한 store가 전부 컴파일 에러입니다.

| 패키지 | 무엇을 막아 주는가 |
| --- | --- |
| [`@gj-kit/toss-payments`](./toss-payments) | 토스페이먼츠 연동에서 검증 단계를 빠뜨리면 런타임이 아니라 컴파일에서 막힙니다. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | DI token은 타입을 싣고 다니지 않습니다. `TossPaymentsFor<typeof config>`가 그 타입을 되살려, 배선하지 않은 flow는 그대로 컴파일 에러로 남습니다. |
| [`@gj-kit/toss-payments-postgresql`](./toss-payments-postgresql) | 토스페이먼츠 저장소를 직접 운영하는 PostgreSQL 위에 올리되, 암호화 protector를 빠뜨리면 컴파일이 실패합니다. |

## 설치

```sh
pnpm add @gj-kit/expo-ui
```

각 패키지의 Golden path, peer·플랫폼 경계, 전체 API 명세는 해당 패키지 README와 [문서 포털](https://gj-kit.github.io/gj-kit/ko/)에서 확인하세요. 에이전트용으로는 [llms.txt](https://gj-kit.github.io/gj-kit/llms.txt)와 [API JSON index](https://gj-kit.github.io/gj-kit/api/index.json)를 함께 제공합니다.

## 검증

- 열 개 전부 런타임 의존성 0
- @ts-expect-error 가드 708개, vitest typecheck로 실행
- `pnpm test` 한 번에 테스트 3,700개 이상 — 네트워크도 기기도 없이
- ESM·CJS 듀얼, TypeScript strict, Node 20 이상, MIT
- 모든 패키지가 통과하는 CI 게이트 하나 — `pnpm verify:release`

## 릴리스

공개 패키지 변경에는 Changeset이 필요합니다. main에 병합된 Version Packages PR은 기존 CI를 통해 npm과 GitHub Release를 만듭니다. 직접 `npm publish` 하지 마세요.
