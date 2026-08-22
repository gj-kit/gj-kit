# GJ Kit payment integration guide for coding agents

This document is the deterministic starting point for an agent integrating a
Toss Payments server flow. Use it with the package README for the complete API
surface; do not infer security-sensitive behavior from a UI snippet.

## Choose the package

| Application | Install | Start here |
| --- | --- | --- |
| Next.js, Express, Hono, serverless, or a TypeScript server | `@gj-kit/toss-payments` | [core README](../toss-payments/README.md) |
| NestJS 10 or 11 | `@gj-kit/toss-payments` and `@gj-kit/toss-payments-nestjs` | [NestJS README](../toss-payments-nestjs/README.md) |
| Durable PostgreSQL stores for orders, billing, deposit secrets, retries, webhook dedupe, and audit | add `@gj-kit/toss-payments-postgresql` | [PostgreSQL README](../toss-payments-postgresql/README.md) |

The packages require Node.js 20 or newer. The NestJS package shares Nest
dependencies as peers; do not install a second Nest runtime for it.

## Non-negotiable rules

1. Parse server keys with `parseApiSecretKey` or `parseWidgetSecretKey` from
   `@gj-kit/toss-payments/server`. Never put either secret key or its parser in
   browser code.
2. Create orders in, and verify orders against, a durable `OrderStore` before
   production. A memory store is acceptable only for a local experiment.
3. For a payment-widget callback, always follow `parseSuccessCallback` →
   `toss.confirm.verify` → `toss.confirm.confirm`. Never pass query parameters
   directly to `confirm` and never trust the callback amount.
4. Treat every public result as `Result<T, E>`. Narrow it with `isErr` or
   `.ok`; do not assume a rejected promise is the payment failure channel.
5. Do not use `as` to bypass branded key, verified-callback, or conditional-kit
   types. A type error at those boundaries is a missing safety condition, not a
   casting problem.
6. Never implement an order ledger, fulfilment guarantee, or durable queue on
   the in-process events API. It is for observation and side effects only.
7. For production PostgreSQL storage, use `createTossPaymentsPostgres` with a
   primary-only `SqlClient`/`fromPgPool`. Do not replace it with an in-memory
   adapter after deployment, and do not send store reads to a replica.
8. `sensitiveValueProtector` is required for the PostgreSQL adapter. Bind both
   its `purpose` and `recordId` into AEAD AAD; plaintext is allowed only through
   the explicitly named unsafe protector in an isolated development database.
9. Run `await pg.migrate()` before accepting traffic. The package never runs
   DDL automatically. Schedule explicit `pg.cleanup()` with retention values
   that match `dedupe.completedTtlSeconds` and `retention.cancelRetryDays`; it
   intentionally does not delete audit, inbox, orders, deposit secrets, or
   billing keys.
10. Implement `BillingKeyStore.delete({ customerKey, expectedBillingKey })` as one
    DB CAS/transaction. It must return `false` for a missing/stale key rather
    than doing a `find()` followed by an unconditional delete; `billing.revoke`
    exposes that result as `currentStoredKeyDeleted` and emits `billing.revoked`
    only when it is true.
11. For a billing-key issuance, deletion webhook, or projection compensation
    that can race for one customer, use `pg.billingKeys.withMutationLock` and
    only its customer-bound handle. Do not compose `find()` + `save()` or call
    the outer billing store inside the lock callback. For a post-issue host
    projection, forward `BillingKeySaveOptions.operationId` and verify
    `mutation.isCurrentOperationId(operationId)` before finalization. This is a
    post-persistence fence only; provider calls still need an app-owned durable
    per-customer gate when their order matters.

## Core server path

```ts
import { isErr, orThrow } from '@gj-kit/toss-payments';
import {
  createTossPayments,
  parseApiSecretKey,
  parseSuccessCallback,
  type OrderStore,
} from '@gj-kit/toss-payments/server';

declare const orders: OrderStore; // durable implementation owned by the app

export const toss = createTossPayments({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders,
});

export async function confirmPayment(url: string) {
  const parsed = parseSuccessCallback(url);
  if (isErr(parsed)) return { status: 400, body: parsed.error };

  const verified = await toss.confirm.verify(parsed.value);
  if (isErr(verified)) return { status: 400, body: verified.error };

  return toss.confirm.confirm(verified.value);
}
```

The `orders` configuration makes the `confirm` flow present. Do not add
`billingKeys` or `webhook` until the corresponding durable stores are ready;
the kit intentionally omits unconfigured flows from its type.

## PostgreSQL adapter path

Use the PostgreSQL adapter when the app needs durable Toss stores rather than
implementing them itself. Its migration and cleanup lifecycle remain app-owned:

```ts
import { createTossPaymentsPostgres, fromPgPool } from '@gj-kit/toss-payments-postgresql';
import type { SensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';

declare const pool: Parameters<typeof fromPgPool>[0];
declare const sensitiveValueProtector: SensitiveValueProtector;

const pg = createTossPaymentsPostgres({
  sql: fromPgPool(pool),
  sensitiveValueProtector,
});

await pg.migrate(); // before listen / before worker starts accepting jobs
```

Keep the app-owned pool as a singleton, flush `pg.audit` and close the pool at
shutdown, and keep the protector’s errors free of plaintext. For billing
projection races, the lock callback orders app transactions but is not a
distributed transaction: a final generic DB commit failure must fail closed and
be reconciled rather than reported as success.

## NestJS path

1. Enable `rawBody: true` when creating the application:

   ```ts
   const app = await NestFactory.create(AppModule, { rawBody: true });
   ```

2. Bind `TossPaymentsModule.forRoot` or `forRootAsync` to a config created with
   `defineTossPaymentsConfig`. For a database-backed Nest provider, prefer
   `forRootAsync({ inject, useFactory })`.
3. Use `TossPaymentsFor<typeof tossConfig>` for the app's injected kit type and
   inject it through `@InjectTossPayments()`.
4. For webhook endpoints, use `toNestWebhookHandler(toss.webhook, handlers)`.
   It fails loudly when `req.rawBody` is absent. Do not add `express.json()` or
   another JSON body parser ahead of the webhook route.

See the [complete NestJS controller example](../toss-payments-nestjs/README.md#웹훅-컨트롤러)
before generating a controller.

## Before declaring the task complete

- The app uses the correct key pair: widget payments confirm with a widget
  secret key; billing/API flows use an API secret key.
- The callback path returns an error before calling `confirm` when parsing or
  order verification fails.
- `OrderStore` persists `orderId`, amount, currency, order name, and creation
  time across process restarts.
- Every billing approval receives an explicit idempotency key.
- PostgreSQL consumers supply an AEAD/KMS-backed `SensitiveValueProtector`, run
  explicit migration before listen, use a primary connection, and schedule only
  the documented cleanup retention.
- Competing billing-key lifecycles use `withMutationLock`; callback code uses
  the supplied handle only and does not make Toss/provider/network calls while
  holding the customer lock.
- A custom BillingKeyStore deletes by expected raw key atomically, and any
  post-issue projection checks its unique operationId under the same lock rather
  than treating a merely non-null current row as its own issuance.
- Webhook routes preserve raw bytes, deduplicate before fulfilment, and use a
  re-fetched result instead of an unverified status-change payload.
- Unit, type, and integration checks relevant to the changed flow pass.

## Primary references

- [Core README](../toss-payments/README.md)
- [NestJS README](../toss-payments-nestjs/README.md)
- [Core tests](../toss-payments/tests)
- [NestJS tests](../toss-payments-nestjs/tests)
- [Release history](../toss-payments/CHANGELOG.md)
