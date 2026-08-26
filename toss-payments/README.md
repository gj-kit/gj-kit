# @gj-kit/toss-payments

**English** · [한국어](./README.ko.md)

Type-safe Toss Payments widget and API v2 flows for TypeScript servers and browsers.

## Install

```sh
pnpm add @gj-kit/toss-payments
```

## Use it when

Use it when payment key boundaries, order-amount verification, webhook trust, and idempotent billing flows must be encoded in types.

## Do not use it when

Do not treat it as a complete order system or store raw secrets, audit payloads, and refund policy in its generic layer.

## Golden path

Parse the server key at boot, compose the kit with your app-owned stores, and confirm only against the server-side order record.

```ts
import * as gjKit from '@gj-kit/toss-payments';

void gjKit;
```

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
