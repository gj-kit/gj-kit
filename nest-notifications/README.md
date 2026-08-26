# @gj-kit/nest-notifications

**English** · [한국어](./README.ko.md)

NestJS composition for transactional notification relay, dispatch, presentation, and Expo push boundaries.

## Install

```sh
pnpm add @gj-kit/nest-notifications
```

## Use it when

Use it when product events must become durable, deduplicated notification work without making delivery policy part of the product domain.

## Do not use it when

Do not move product copy, recipient policy, or user-preference decisions into the generic relay.

## Golden path

Provide the application stores and presentation policy, register the Nest module, then run relay and dispatch workers through your normal operations boundary.

```ts
import * as gjKit from '@gj-kit/nest-notifications';

void gjKit;
```

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
