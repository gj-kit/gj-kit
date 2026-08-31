# @gj-kit/toss-payments

[![npm](https://img.shields.io/npm/v/@gj-kit/toss-payments?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/toss-payments)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments)
[![license](https://img.shields.io/npm/l/@gj-kit/toss-payments?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/toss-payments/LICENSE)

**English** · [한국어](./README.ko.md)

> **A confirm that skipped verification does not compile — `flow.confirm` takes only VerifiedCheckout.**

## Why this exists

Toss integrations break in ways that only surface in production: confirming without comparing the amount you stored, a cron re-running billing approve without an idempotency key and charging twice, trusting an unsigned PAYMENT_STATUS_CHANGED payload, or forgetting to save the virtual-account secret so every deposit webhook is rejected as unknown-order. And a confirm that fails on transport is not a failed payment — batch-failing it tells the customer their payment failed after the money already moved.

## What it does about it

- **Unwired flows have no property** — createTossPayments returns a type where `billing` does not exist unless you pass a BillingKeyStore, and `confirm` does not exist unless you pass an OrderStore.
- **Secret keys cannot reach the browser** — Toss's four key kinds are four separate brands; the secret parsers live only on the node-resolved /server entry, and loadWidgets accepts WidgetClientKey alone.
- **confirm() rejects unverified callbacks** — flow.confirm takes only VerifiedCheckout — the brand flow.verify mints after the callback amount matches the amount createOrder stored and the 10-minute approval window still holds.
- **Cancel has no shortcut path** — Nothing cancels by paymentKey: you go getPayment to asCancelable to kind narrowing, where a deposited virtual account requires refundAccount and every non-virtual-account payment declares it `refundAccount?: never`.
- **Webhook trust is graded, not assumed** — verify() takes raw body only, events split into signature / secret / unverified, and there is no onBillingApproved key because Toss sends no such webhook.

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

## What that looks like

Two mistakes that normally pass review and detonate in production — a half-wired kit and a billing approve with no idempotency key — are both compile errors here.

```ts
import { idempotencyKey, orThrow } from '@gj-kit/toss-payments';
import type { BillingKeyStore, BillingOrder, BillingProfile, OrderStore } from '@gj-kit/toss-payments/server';
import { createTossPayments, parseApiSecretKey } from '@gj-kit/toss-payments/server';

declare const apiSecret: string; // app owns
declare const orderStore: OrderStore; // app owns
declare const billingKeyStore: BillingKeyStore; // app owns
declare const profile: BillingProfile; // app owns
declare const order: BillingOrder; // app owns

export const toss = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(apiSecret)),
  orders: orderStore, // omit and `toss.confirm` is not on the type
  billingKeys: billingKeyStore, // omit and `toss.billing` is not on the type
});

// toss.billing.approve(profile, order); -> error TS2554: Expected 3 arguments, but got 2.
export const charged = toss.billing.approve(profile, order, {
  idempotencyKey: orThrow(idempotencyKey(`sub:2026-09:${profile.customerKey}`)),
});
```

## Verified, not asserted

- 0 runtime dependencies
- 550+ unit tests
- 144 @ts-expect-error compile guards
- 42 Toss error codes classified

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

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
