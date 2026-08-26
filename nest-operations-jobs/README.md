# @gj-kit/nest-operations-jobs

**English** · [한국어](./README.ko.md)

NestJS composition for durable, authenticated, observable operational jobs with explicit store ports.

## Install

```sh
pnpm add @gj-kit/nest-operations-jobs
```

## Use it when

Use it when a Nest application needs scheduled or operator-triggered work with explicit concurrency, authorization, and run persistence.

## Do not use it when

Do not hide product business rules, queue infrastructure, or application authorization policy behind this integration.

## Golden path

Implement the public store and authenticator ports in your application, register the module, then expose only the jobs your operators should run.

```ts
import * as gjKit from '@gj-kit/nest-operations-jobs';

void gjKit;
```

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `@nestjs/common` | `^10 || ^11` |
| `@nestjs/core` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## Public entry points

- `@gj-kit/nest-operations-jobs`
- `@gj-kit/nest-operations-jobs/core`
- `@gj-kit/nest-operations-jobs/testing`

## Safety boundary

Keep job-trigger authorization and app data ownership in the host application. Never turn a convenience route into an unauthenticated operations endpoint.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/nest-operations-jobs/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/nest-operations-jobs/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/nest-operations-jobs.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/nest-operations-jobs)
- [npm package](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
