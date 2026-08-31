# @gj-kit/toss-payments-postgresql

[![npm](https://img.shields.io/npm/v/@gj-kit/toss-payments-postgresql?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/toss-payments-postgresql)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-postgresql)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/toss-payments-postgresql)
[![license](https://img.shields.io/npm/l/@gj-kit/toss-payments-postgresql?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/toss-payments-postgresql/LICENSE)

**English** · [한국어](./README.ko.md)

> **Toss Payments stores on your own PostgreSQL, where forgetting encryption is a compile error.**

## Why this exists

Wiring Toss Payments to your own database means hand-designing seven tables, a webhook dedupe transition that has to be atomic, and at-rest encryption for billing keys, virtual-account secrets, and cancel-retry tickets. Do it yourself and a read-then-insert dedupe lets two concurrent redeliveries of the same event both win the claim, and a store wired without a protector writes billing keys to disk in plaintext — neither one tells you until production.

## What it does about it

- **Assembly without a protector won't compile** — `createTossPaymentsPostgres({ sql })` is a type error — `sensitiveValueProtector` is a required field on the aggregate and on all three sensitive store factories.
- **Raw strings are not lock keys** — opaqueLocks.withLock accepts only a branded OpaqueAdvisoryLockKey, so passing a customer id as a raw string is rejected by tsc with TS2345.
- **Types encode the transaction requirement** — createPgBillingKeyStore rejects a SqlExecutor: SELECT … FOR UPDATE → decrypt → constant-time compare → DELETE has to run on one pinned connection inside one transaction, so only SqlClient — the interface that adds withConnection — typechecks.
- **Webhook claim is one statement** — In src/stores/webhook-dedupe.ts the claim transitions through a single CTE with INSERT … ON CONFLICT DO UPDATE, so exactly one of N concurrent redeliveries receives 'claimed'.
- **Deadlocks fail loudly in tests** — The ./testing in-memory double throws MemoryLockContractError('nested-lock-api' | 'reentrant-lock') exactly where PostgreSQL would silently hang.

## Golden path

> **Outcome:** PostgreSQL-backed Toss stores with one explicit migration step.

### 1. Install

```sh
pnpm add @gj-kit/toss-payments-postgresql
```

### 2. Keep the app-owned boundary explicit

Adapt your pool with `fromPgPool`, use a real encrypted `sensitiveValueProtector`, and run migration during deployment.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { createTossPaymentsPostgres, fromPgPool, type PgPoolLike, type SensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';

declare const pool: PgPoolLike;
declare const sensitiveValueProtector: SensitiveValueProtector; // App KMS/encryption boundary.

export const stores = createTossPaymentsPostgres({
  sql: fromPgPool(pool),
  sensitiveValueProtector,
});

// Run await stores.migrate() once in deployment, never per request.
```

## What that looks like

The protector is a required field and a raw identifier cannot stand in for a lock key — tsc rejects both, at TS2345, before anything reaches a database. withOpaqueMutationLock is also the only API that takes both locks, so the opaque → customer order is not a decision the caller gets to make.

```ts
import type { Pool } from 'pg';
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { createAes256GcmSensitiveValueProtector, createOpaqueAdvisoryLockKey, createTossPaymentsPostgres, fromPgPool } from '@gj-kit/toss-payments-postgresql';

declare const pool: Pool; // app owns the pg Pool
declare const keyHex: string; // app owns key custody and rotation
declare const blindIndex: string; // app owns the blind index of the customer id
declare const record: BillingKeyRecord; // app owns the freshly issued billing key

export const pg = createTossPaymentsPostgres({
  sql: fromPgPool(pool),
  sensitiveValueProtector: createAes256GcmSensitiveValueProtector({ key: keyHex, keyId: '2026-08' }),
});
// Without sensitiveValueProtector: TS2345 '{ sql: SqlClient; }' is not assignable to 'TossPaymentsPostgresOptions'.

export const previous = await pg.billingKeys.withOpaqueMutationLock(
  createOpaqueAdvisoryLockKey(blindIndex), // raw blindIndex: TS2345 'string' is not assignable to 'OpaqueAdvisoryLockKey'
  record.customerKey,
  (mutation) => mutation.replaceAndGetPrevious(record),
);
```

## Verified, not asserted

- 0 runtime dependencies — `pg` isn’t even a peer
- 55 @ts-expect-error compile guards
- 250+ unit tests · 31 more against real PostgreSQL
- 7 tables, one explicit `migrate()`

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it when Toss payment stores need a proven PostgreSQL implementation while your app retains connection lifecycle and key custody.

## Do not use it when

Do not run migrations on request or application startup, and do not use the plaintext protector in production.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `@gj-kit/toss-payments` | `^0.5.0 || ^0.6.0` |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## Public entry points

- `@gj-kit/toss-payments-postgresql`
- `@gj-kit/toss-payments-postgresql/nestjs`
- `@gj-kit/toss-payments-postgresql/testing`

## Safety boundary

Use an app-owned KMS or key-management boundary for sensitive values, run explicit migrations once, and keep cleanup operations idempotent.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/toss-payments-postgresql/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/toss-payments-postgresql/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments-postgresql.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/toss-payments-postgresql)
- [npm package](https://www.npmjs.com/package/@gj-kit/toss-payments-postgresql)
