# gj-kit

**English** · [한국어](./README.ko.md)

Reusable TypeScript libraries for Expo, React Native, NestJS, and Toss Payments. Human documentation and agent-readable API indexes are published at [GJ Kit Docs](https://gj-kit.github.io/gj-kit/).

| Package | Description |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | Accessible, token-driven UI primitives for Expo, React Native, and the web. |
| [`@gj-kit/expo-media`](./expo-media) | A hardened Expo and React Native media pipeline with explicit adapters and durable file boundaries. |
| [`@gj-kit/expo-auth`](./expo-auth) | Token lifecycle primitives for Expo, React Native, and the web, including coordinated refresh and storage adapters. |
| [`@gj-kit/expo-workouts`](./expo-workouts) | A native Expo bridge for HealthKit and Health Connect workouts, routes, authorization, and incremental sync. |
| [`@gj-kit/format`](./format) | Explicit-by-construction date, number, byte, duration, and Korean currency formatting for TypeScript. |
| [`@gj-kit/nest-operations-jobs`](./nest-operations-jobs) | NestJS composition for durable, authenticated, observable operational jobs with explicit store ports. |
| [`@gj-kit/nest-notifications`](./nest-notifications) | NestJS composition for transactional notification relay, dispatch, presentation, and Expo push boundaries. |
| [`@gj-kit/toss-payments`](./toss-payments) | Type-safe Toss Payments widget and API v2 flows for TypeScript servers and browsers. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | NestJS DI and raw-body webhook composition for @gj-kit/toss-payments. |
| [`@gj-kit/toss-payments-postgresql`](./toss-payments-postgresql) | PostgreSQL stores, migrations, inbox, and encryption seams for @gj-kit/toss-payments. |

## Install

```sh
pnpm add @gj-kit/expo-ui
```

Open each package README and portal page for its supported peer/platform boundary, golden path, and complete generated API reference.

## Releases

Every user-facing package change needs a Changeset. A Version Packages PR merged into `main` publishes through the existing CI workflow; do not run `npm publish` directly.
