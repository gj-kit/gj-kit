# GJ Kit

[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![packages](https://img.shields.io/badge/packages-10-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/org/gj-kit)
[![node](https://img.shields.io/badge/node-%3E%3D20-0a7ea4?style=flat-square)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-0a7ea4?style=flat-square)](https://github.com/gj-kit/gj-kit/blob/main/LICENSE)

**English** · [한국어](./README.ko.md)

> **Ten TypeScript libraries where the step you'd forget is a compile error.**

Ten packages covering Expo, React Native, NestJS, PostgreSQL and Toss Payments, each built around one boundary where a silent mistake costs money, data, or a user's session. They are for teams who would rather meet the bug in tsc than in an incident channel.

## Why they are built this way

- **The dangerous default does not exist** — The argument you would have let default is required instead. `createTossPayments` returns a type with no `confirm` property until you pass an OrderStore, and no `billing` property until you pass a BillingKeyStore. `formatDateTime(instant)` does not compile, because `timeZone` has no default. `createTossPaymentsPostgres({ sql })` is a type error, because the encryption protector is a required field. Unlimited uploads have to be spelled `'server-enforced'`, because `Number.POSITIVE_INFINITY` is rejected.
- **You cannot leave the branch out** — The result you are handed is a union that names the branch you would otherwise drop. `matchRefreshOutcome` takes all five endings of a token refresh as handler keys — omit `transient` and the call does not compile, and `transient` is exactly the branch that turns a 5xx into a false sign-out. `saveWorkout()`'s `nativeId` is TS2339 until `status === 'saved'` narrows past the locked-device branch, which never appears during development. On a job result, `error` is unreachable until you switch on `status`.
- **The enforcement is itself tested** — 708 `@ts-expect-error` directives sit in 65 fixture files under `tests/types`, and `vitest typecheck` runs every one of them. TypeScript treats a directive that no longer catches anything as an error in its own right (TS2578), so a guard that quietly loosens fails the suite instead of passing it. A rule here cannot decay into a line of documentation without breaking the build.
- **The half you own runs on Node** — Seven of the ten ship a framework-free `./testing` entry point, so the part you still own is checkable without the dangerous thing attached. `nest-notifications` hands you 30 runnable contract cases to point at your own database and `nest-operations-jobs` hands you 13. `toss-payments-postgresql` ships an in-memory double that throws on the nested lock PostgreSQL would silently hang on. `expo-workouts` fakes the native module seam rather than the API, so the real core code replays all six cursor-reset reasons under vitest.

## The packages

### Expo & React Native

Four packages for the boundaries where the platform itself fails silently: an IconButton with no accessible name, an upload that ends the process instead of rejecting, a 5xx classified as a sign-out, and a Health Connect upsert that deletes the route you left out.

| Package | What it makes impossible |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | React Native and web primitives: an unnamed IconButton, Tabs, or Slider is a compile error. |
| [`@gj-kit/expo-media`](./expo-media) | An upload with no size limit, or an iCloud download nobody asked for, is a compile error. |
| [`@gj-kit/expo-auth`](./expo-auth) | Token refresh for Expo, React Native and web — a missed transient branch won't compile. |
| [`@gj-kit/expo-workouts`](./expo-workouts) | HealthKit and Health Connect workouts in Expo, where destroying stored data is a compile error. |

### Utilities

One package for the code that quietly forks into three copies. Time zone, date separator, ₩ versus 원, byte unit system, and the meaning of zero bytes are all required arguments, so two screens can only disagree if someone typed it that way.

| Package | What it makes impossible |
| --- | --- |
| [`@gj-kit/format`](./format) | Timestamps drift between screens only when someone typed them that way — timeZone has no default. |

### NestJS

Durable job and notification pipelines where the database stays yours: the library owns the ordering and liveness rules, refuses at boot the tuning that would let a job run twice, and hands you framework-free contract cases to run against your real store.

| Package | What it makes impossible |
| --- | --- |
| [`@gj-kit/nest-operations-jobs`](./nest-operations-jobs) | An unauthenticated trigger, or tuning that lets a job run twice, fails before the scheduler’s first call. |
| [`@gj-kit/nest-notifications`](./nest-notifications) | A dispatcher with no presenter, or quiet hours with no time zone, is a compile error — not a DST bug in production. |

### Payments

The Toss Payments core, its Nest DI composition, and its PostgreSQL stores — where a confirm that skipped verification, a billing approve with no idempotency key, and a store assembled without an encryption protector are all compile errors.

| Package | What it makes impossible |
| --- | --- |
| [`@gj-kit/toss-payments`](./toss-payments) | A confirm that skipped verification does not compile — `flow.confirm` takes only VerifiedCheckout. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | A DI token carries no type — `TossPaymentsFor<typeof config>` gives it back, so unwired flows stay compile errors. |
| [`@gj-kit/toss-payments-postgresql`](./toss-payments-postgresql) | Toss Payments stores on your own PostgreSQL, where forgetting encryption is a compile error. |

## Install

```sh
pnpm add @gj-kit/expo-ui
```

Each package README and [portal page](https://gj-kit.github.io/gj-kit/) carries its golden path, supported peer and platform boundary, and complete generated API reference. For agents there is also [llms.txt](https://gj-kit.github.io/gj-kit/llms.txt) and an [API JSON index](https://gj-kit.github.io/gj-kit/api/index.json).

## Verified, not asserted

- 0 runtime dependencies, in all ten
- 708 @ts-expect-error guards, run by vitest typecheck
- 3,700+ tests on one `pnpm test` — no network, no device
- Dual ESM + CJS, TypeScript strict, Node 20+, MIT
- One CI gate for every package: `pnpm verify:release`

## Releases

Every user-facing package change needs a Changeset. A Version Packages PR merged into `main` publishes through the existing CI workflow; do not run `npm publish` directly.
