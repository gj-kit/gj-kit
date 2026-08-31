# @gj-kit/toss-payments-nestjs

[![npm](https://img.shields.io/npm/v/@gj-kit/toss-payments-nestjs?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-nestjs)
[![license](https://img.shields.io/npm/l/@gj-kit/toss-payments-nestjs?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/toss-payments-nestjs/LICENSE)

**English** · [한국어](./README.ko.md)

> **A DI token carries no type — `TossPaymentsFor<typeof config>` gives it back, so unwired flows stay compile errors.**

## Why this exists

A DI token carries no type: `forRoot()` returns a `DynamicModule` bound to a `unique symbol`, so the constructor annotation you wrote is the only remaining truth — `toss.billing` type-checks on a kit whose config never wired a `BillingKeyStore`, and the property is `undefined` at runtime. Then you add a webhook controller and Nest has already parsed the body: signature verification cannot be recovered from re-serialized JSON.

## What it does about it

- **Unwired flows have no property** — `TossPaymentsFor<typeof config>` rebuilds the conditional kit type after DI, so `toss.billing` is a compile error without a wired `BillingKeyStore`.
- **Missing rawBody fails loudly** — Without `req.rawBody`, `toNestWebhookHandler` never calls a handler: it answers 500 and logs the three settings to check — `rawBody: true` on `NestFactory.create`, Fastify raw-body support, and a JSON middleware applied ahead of the webhook route.
- **Source IP survives the wrapper** — The handler forwards the original Node `socket`, keeping the core's fail-closed IP check; trusting a proxy header requires passing an explicit `sourceIp` extractor.
- **One token across ESM and CJS** — `TOSS_PAYMENTS` and `getTossPaymentsToken(name)` are `Symbol.for` lookups, so a dual-loaded package still resolves to one provider binding.
- **No emitDecoratorMetadata needed** — `InjectTossPayments()` is a thin `@Inject(token)` delegate and no code under `src/` reads `design:paramtypes`, so the package ships `emitDecoratorMetadata: false` — and the Nest DI tests still resolve under vitest's esbuild transform, which cannot emit that metadata at all.

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

## What that looks like

The commented line is a real TS2339: this config wired no `BillingKeyStore`, so the injected kit has no `billing` property at all — even though the value arrived through an untyped DI token.

```ts
import { Injectable } from '@nestjs/common';
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey, type OrderStore } from '@gj-kit/toss-payments/server';
import { InjectTossPayments, TossPaymentsModule, type TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';

declare const SECRET: string; // the app owns this (process.env)
declare const orders: OrderStore; // the app owns this (its own DB adapter)

export const tossConfig = defineTossPaymentsConfig({ secretKey: orThrow(parseApiSecretKey(SECRET)), orders });
export type AppToss = TossPaymentsFor<typeof tossConfig>;
export const tossModule = TossPaymentsModule.forRoot(tossConfig);

@Injectable()
export class PaymentsService {
  constructor(@InjectTossPayments() private readonly toss: AppToss) {}

  order = () => this.toss.confirm.createOrder({ amount: 9_900, orderName: 'Pro' });
  // this.toss.billing — TS2339: the config wired no BillingKeyStore, so there is no property.
}
```

## Verified, not asserted

- 0 runtime dependencies
- 9 rejections pinned by @ts-expect-error
- Nest 10 and 11 boot-verified
- 20 unit tests, 8 boot real Nest DI

The type behaviour this page's golden path and example claim is pinned against the real public surface by `tests/types/docs-golden-path.test-d.ts`, and its required operational markers are checked on every release; `pnpm verify:release` is the gate all ten packages share.

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
