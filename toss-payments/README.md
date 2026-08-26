# @gj-kit/toss-payments

**English** · [한국어](./README.ko.md)

Type-safe Toss Payments widget and API v2 flows for TypeScript servers and browsers.

## Golden path

> **Outcome:** A server-only payment kit whose available flows match the stores you pass in.

### 1. Install

```sh
pnpm add @gj-kit/toss-payments
```

### 2. Keep the app-owned boundary explicit

Parse the API secret at boot and provide your server-owned order store before enabling confirmation.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { orThrow } from '@gj-kit/toss-payments';
import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

declare const apiSecretFromEnv: string; // Read this once from your server environment.

export const toss = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(apiSecretFromEnv)),
});

// Add your OrderStore to enable toss.confirm; the type exposes only wired flows.
```

## Use it when

Use it when payment key boundaries, order-amount verification, webhook trust, and idempotent billing flows must be encoded in types.

## Do not use it when

Do not treat it as a complete order system or store raw secrets, audit payloads, and refund policy in its generic layer.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `@tosspayments/tosspayments-sdk` | `^2` |

## Public entry points

- `@gj-kit/toss-payments`
- `@gj-kit/toss-payments/server`
- `@gj-kit/toss-payments/webhook`
- `@gj-kit/toss-payments/browser`
- `@gj-kit/toss-payments/testing`

## Safety boundary

Never import server key parsers into browser code or trust a redirect/webhook without the documented verification path. Keep secrets and exact audit bodies encrypted at rest.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/toss-payments/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/toss-payments/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/toss-payments)
- [npm package](https://www.npmjs.com/package/@gj-kit/toss-payments)
