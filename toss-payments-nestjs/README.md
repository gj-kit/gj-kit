# @gj-kit/toss-payments-nestjs

**English** · [한국어](./README.ko.md)

NestJS DI and raw-body webhook composition for @gj-kit/toss-payments.

## Golden path

> **Outcome:** One Nest provider that injects a typed payment kit.

### 1. Install

```sh
pnpm add @gj-kit/toss-payments-nestjs
```

### 2. Keep the app-owned boundary explicit

Build the core payment config, register it once, and preserve raw request bytes for webhook routes.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';

declare const apiSecretFromEnv: string; // Read this once from your server environment.

const config = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(apiSecretFromEnv)),
});

export const payments = TossPaymentsModule.forRoot(config);
```

## Use it when

Use it when a Nest application needs to keep the core payment kit’s types and safety boundary through dependency injection.

## Do not use it when

Do not reimplement payment verification in controllers or rely on parsed JSON when webhook verification requires raw bytes.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `@gj-kit/toss-payments` | `^0.2.0 || ^0.3.0 || ^0.4.0 || ^0.5.0 || ^0.6.0` |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## Public entry points

- `@gj-kit/toss-payments-nestjs`

## Safety boundary

Preserve raw request bytes for verified webhooks and make every store dependency explicit in the host Nest module.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/toss-payments-nestjs/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/toss-payments-nestjs/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments-nestjs.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/toss-payments-nestjs)
- [npm package](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
