# @gj-kit/nest-operations-jobs

[![npm](https://img.shields.io/npm/v/@gj-kit/nest-operations-jobs?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![license](https://img.shields.io/npm/l/@gj-kit/nest-operations-jobs?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/nest-operations-jobs/LICENSE)

**English** · [한국어](./README.ko.md)

> **An unauthenticated trigger, or tuning that lets a job run twice, fails before the scheduler’s first call.**

## Why this exists

Hand-rolled cron endpoints fail while every dashboard stays green. Swallow the whole unique-constraint violation inside your claim and a permanently blocked job becomes a stream of SKIPPED/200 responses; set the stale-run budget below the heartbeat interval and a healthy run looks reapable to the next trigger, which starts a second body. Meanwhile the trigger route ships with a short shared secret compared by ===, the stored run row can disagree with the status you returned without anyone noticing, and a scheduler attempt deadline set under the job's own timeout records long runs that actually succeeded as failures.

## What it does about it

- **Omitting `auth` is a compile error** — `auth` is a required field of OperationsJobsModuleOptions, so a module wired without it does not type-check. An empty `auth`, or a secret under 32 characters, throws ERR_JOB_AUTH_MISCONFIGURED while forRoot assembles the module.
- **Result fields exist only after narrowing** — On JobExecutionResult, `error`, `reason` and `summary` are unreachable until you switch on `status`; three @ts-expect-error fixtures pin that.
- **The tuning that voids single execution** — createJobRunner throws ERR_JOB_INVALID when staleRunAfterMs is under 2x heartbeatIntervalMs — the floor below which a healthy run's watermark can outlive the liveness budget between its own beats.
- **Your store's atomicity, in your suite** — jobRunStoreContractCases() returns 13 framework-free cases covering obligations S1-S6 — a concurrent claim burst, two concurrent reaps of the same three rows — that you run against your real database. Supply `inspect` and it returns 16, adding S7.
- **/core provably contains no Nest** — A guard test scans src/core/**, src/testing/** and every built dist/core.* and dist/testing.* chunk for @nestjs, rxjs and reflect-metadata, and a control case asserts dist/index.js does contain @nestjs — so an empty result means the scanner actually looked.

## Golden path

> **Outcome:** An authenticated operations boundary backed by application-owned run storage.

### 1. Install

```sh
pnpm add @gj-kit/nest-operations-jobs
```

### 2. Keep the app-owned boundary explicit

Implement `JobRunStore`, then configure a 32+ character shared secret or a token verifier before module registration.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { OperationsJobsModule, type JobRunStore } from '@gj-kit/nest-operations-jobs';

declare const store: JobRunStore; // Your database-backed run store.
declare const secret: string; // At least 32 characters; keep it outside source control.

export const operations = OperationsJobsModule.forRoot({
  store,
  auth: { secret },
  trigger: { path: 'internal/jobs' },
});
```

## What that looks like

`error` is unreachable until `status` is narrowed, and `recorded` sits on every branch because a stored row that disagrees with the returned status is exactly what deserves a page.

```ts
import type { JobExecutionResult } from '@gj-kit/nest-operations-jobs/core';

declare const result: JobExecutionResult; // await runner.execute(...)
declare function pageOncall(jobKey: string, runId: string): void; // the app owns this

export function report(): void {
  // console.error(result.error.code);
  // -> error TS2339: Property 'error' does not exist on type 'JobExecutionResult'.
  if (result.status === 'TIMED_OUT') {
    console.error(result.jobKey, result.error.code); // 'ERR_JOB_TIMEOUT'
  } else if (result.status === 'SKIPPED') {
    console.warn(result.jobKey, result.reason); // 'overlap' - the only value
  }

  // `recorded` sits on every branch: 'superseded' means a reaper already
  // finalised the row, so a second body may run under a different runId.
  if (result.recorded === 'superseded') pageOncall(result.jobKey, result.runId);
}
```

## Verified, not asserted

- 230+ unit tests
- 11 @ts-expect-error guards
- 13 store contract cases
- 0 runtime dependencies

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it when a Nest application needs scheduled or operator-triggered work with explicit concurrency, authorization, and run persistence.

## Do not use it when

Do not hide product business rules, queue infrastructure, or application authorization policy behind this integration.

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
