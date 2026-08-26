# gj-kit

[English](./README.md) · **한국어**

Expo, React Native, NestJS, Toss Payments를 위한 재사용 가능한 TypeScript 라이브러리 모노레포입니다. 사람용 문서와 에이전트용 API index는 [GJ Kit 문서 포털](https://gj-kit.github.io/gj-kit/)에서 제공합니다.

| 패키지 | 설명 |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | Expo, React Native, 웹을 위한 접근성 중심 토큰 기반 UI 프리미티브입니다. |
| [`@gj-kit/expo-media`](./expo-media) | 명시적 adapter와 지속 파일 경계를 갖춘 하드닝된 Expo·React Native 미디어 파이프라인입니다. |
| [`@gj-kit/expo-auth`](./expo-auth) | 공동 refresh와 storage adapter를 포함한 Expo, React Native, 웹용 토큰 수명주기 프리미티브입니다. |
| [`@gj-kit/expo-workouts`](./expo-workouts) | HealthKit과 Health Connect의 운동, 경로, 권한, 증분 동기화를 위한 native Expo bridge입니다. |
| [`@gj-kit/format`](./format) | TypeScript용 명시성 강제 날짜, 숫자, 바이트, 기간, 한국 원화 포매팅 유틸리티입니다. |
| [`@gj-kit/nest-operations-jobs`](./nest-operations-jobs) | 명시적 store port를 갖춘 내구성, 인증, 관측 가능한 운영 작업을 위한 NestJS 조합 패키지입니다. |
| [`@gj-kit/nest-notifications`](./nest-notifications) | 트랜잭션 알림 relay, dispatch, presentation, Expo push 경계를 위한 NestJS 조합 패키지입니다. |
| [`@gj-kit/toss-payments`](./toss-payments) | TypeScript 서버와 브라우저를 위한 타입 안전 Toss Payments 위젯 및 API v2 흐름입니다. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | @gj-kit/toss-payments를 위한 NestJS DI 및 raw-body 웹훅 조합 패키지입니다. |
| [`@gj-kit/toss-payments-postgresql`](./toss-payments-postgresql) | @gj-kit/toss-payments를 위한 PostgreSQL store, migration, inbox, 암호화 seam입니다. |

## 설치

```sh
pnpm add @gj-kit/expo-ui
```

각 패키지의 설치, Golden path, peer/플랫폼 경계, 전체 API 명세는 해당 패키지 README와 포털을 확인하세요.

## 릴리스

공개 패키지 변경에는 Changeset이 필요합니다. main에 병합된 Version Packages PR은 기존 CI를 통해 npm과 GitHub Release를 만듭니다. 직접 `npm publish` 하지 마세요.
