# @gj-kit/toss-payments-postgresql

**English** · [한국어](./README.ko.md)

PostgreSQL stores, migrations, inbox, and encryption seams for @gj-kit/toss-payments.

## Install

```sh
pnpm add @gj-kit/toss-payments-postgresql
```

## Use it when

Use it when Toss payment stores need a proven PostgreSQL implementation while your app retains connection lifecycle and key custody.

## Do not use it when

Do not run migrations on request or application startup, and do not use the plaintext protector in production.

## Golden path

Provide a SqlClient or pg pool, run migrations explicitly in deployment, then compose the store factory with an application-owned sensitive-value protector.

```ts
import * as gjKit from '@gj-kit/toss-payments-postgresql';

void gjKit;
```

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
