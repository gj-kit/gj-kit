# @gj-kit/nest-notifications

**English** · [한국어](./README.ko.md)

NestJS composition for transactional notification relay, dispatch, presentation, and Expo push boundaries.

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
