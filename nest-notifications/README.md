# @gj-kit/nest-notifications

[![npm](https://img.shields.io/npm/v/@gj-kit/nest-notifications?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/nest-notifications)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-notifications)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-notifications)
[![license](https://img.shields.io/npm/l/@gj-kit/nest-notifications?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/nest-notifications/LICENSE)

**English** · [한국어](./README.ko.md)

> **A dispatcher with no presenter, or quiet hours with no time zone, is a compile error — not a DST bug in production.**

## Why this exists

A hand-rolled notification outbox loses deliveries to non-atomic claims, writes duplicate inbox rows when two workers grab the same batch, and pushes to accounts that were deleted mid-relay. Then quiet hours turn out to be a fixed offset added to a Date, drifting an hour every DST transition, and a batch window that does not divide 24h moves the aggregation bucket every day.

## What it does about it

- **Required options, enforced by tsc** — createNotificationDispatcher without a presenter and createQuietHoursPolicy without a timeZone do not compile — no default copy, no default region.
- **30 contract cases for your database** — notificationStoreContractCases() returns 30 runnable cases covering 29 numbered obligations: atomic claim, batch uniqueness, purge-versus-relay interleaving.
- **A core Nest cannot leak into** — Guards assert the strings @nestjs, rxjs and reflect-metadata appear nowhere in src/core, src/expo or src/testing, and nowhere in the dist/core.*, dist/expo.* and dist/testing.* module graphs — with a control case requiring dist/index.js to contain @nestjs, so the guard is proven not to be checking an empty set.
- **The latency hint returns void** — NotificationPipelineWakeup.request() returns void — nothing to await, no result to inspect, no error to catch — so it cannot be mistaken for the owner of correctness. A test wires only that hint, advances the clock 12 hours, and finds the batched delivery still undelivered until dispatchDue() is called.
- **DST resolution is a contract** — A spring-forward gap releases at the first instant after it, an autumn fold at the earlier one, and batchWindowMs must divide 24h evenly or assembly throws ERR_NOTIFICATION_POLICY_INVALID.

## Golden path

> **Outcome:** Durable relay and dispatch runners wired to your stores and push gateway.

### 1. Install

```sh
pnpm add @gj-kit/nest-notifications
```

### 2. Keep the app-owned boundary explicit

Keep product policy in app-owned stores, presenter, and scheduling policy before registering the Nest module.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { NestNotificationsModule, type NestNotificationsOptions } from '@gj-kit/nest-notifications';

declare const options: NestNotificationsOptions; // App stores, presenter, policy, and push gateway.

export const notifications = NestNotificationsModule.forRoot(options);
```

## What that looks like

Both halves are load-bearing: the policy cannot be constructed without a time zone, and the same 30 cases the library runs against its in-memory stores become the acceptance criteria for yours.

```ts
import { createQuietHoursPolicy } from '@gj-kit/nest-notifications/core';
import { notificationStoreContractCases } from '@gj-kit/nest-notifications/testing';
import type { NotificationStoreSuite } from '@gj-kit/nest-notifications/testing';

declare function myPostgresStores(): Promise<NotificationStoreSuite>; // the app owns this

// The library holds no regional default, so the zone cannot be left unsaid.
export const policy = createQuietHoursPolicy({
  timeZone: 'Asia/Seoul',
  quietHours: { startHour: 22, endHour: 8 },
  batchWindowMs: 600_000, // must divide 24h, or assembly throws ERR_NOTIFICATION_POLICY_INVALID
});
// Drop timeZone and tsc stops the build:
//   error TS2345: Argument of type '{ quietHours: { startHour: number; endHour: number; }; }'
//   is not assignable to parameter of type 'QuietHoursPolicyOptions'.

// The 30 cases the library runs on its own in-memory stores, now run on yours.
for (const testCase of notificationStoreContractCases({ concurrency: 8 })) {
  it(testCase.name, () => testCase.run(myPostgresStores));
}
```

## Verified, not asserted

- 230+ unit tests
- 30 store contract cases for your database
- 0 runtime dependencies
- 4 entry points, ESM + CJS

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it when product events must become durable, deduplicated notification work without making delivery policy part of the product domain.

## Do not use it when

Do not move product copy, recipient policy, or user-preference decisions into the generic relay.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## Public entry points

- `@gj-kit/nest-notifications`
- `@gj-kit/nest-notifications/core`
- `@gj-kit/nest-notifications/expo`
- `@gj-kit/nest-notifications/testing`

## Safety boundary

Keep credentials, endpoint ownership, and user-visible product wording in the application. Use the typed error and delivery outcomes instead of raw provider failures.

## Error codes

Handle these stable public codes rather than provider or native exception text:

- `ERR_NOTIFICATION_COMMAND_INVALID`
- `ERR_NOTIFICATION_APPLICATION_KEY_INVALID`
- `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT`
- `ERR_NOTIFICATION_POLICY_INVALID`
- `ERR_NOTIFICATION_TIMEZONE_INVALID`
- `ERR_NOTIFICATION_PRIORITY_UNSUPPORTED`
- `ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED`
- `ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE`
- `ERR_NOTIFICATION_CONFIG_INVALID`

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/nest-notifications/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/nest-notifications/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/nest-notifications.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/nest-notifications)
- [npm package](https://www.npmjs.com/package/@gj-kit/nest-notifications)
