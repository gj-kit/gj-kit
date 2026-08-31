# @gj-kit/nest-operations-jobs

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

[![npm](https://img.shields.io/npm/v/@gj-kit/nest-operations-jobs?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/nest-operations-jobs)
[![license](https://img.shields.io/npm/l/@gj-kit/nest-operations-jobs?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/nest-operations-jobs/LICENSE)

> **인증 없는 trigger, 그리고 잡을 두 번 돌게 만드는 설정은 scheduler의 첫 호출이 아니라 컴파일과 부팅에서 걸립니다.**

## 왜 필요한가

직접 만든 cron endpoint의 장애는 대개 모든 대시보드가 초록인 채로 옵니다. claim에서 unique 위반을 통째로 삼키면 영구히 막힌 잡이 SKIPPED/200 스트림으로 둔갑하고, stale 판정 예산을 heartbeat 주기 아래로 내리면 건강한 실행이 다음 trigger에게 reap 대상으로 보여 두 번째 본문이 시작됩니다. 그 사이 trigger route는 짧은 shared secret을 ===로 비교한 채 배포되고, 저장된 실행 기록이 반환된 status와 어긋나도 아무도 모르며, scheduler의 attempt deadline을 잡의 timeout보다 짧게 잡으면 실제로 성공한 긴 실행이 실패로 기록됩니다.

## 무엇으로 막는가

- **`auth` 누락은 컴파일 에러입니다** — `auth`는 OperationsJobsModuleOptions의 필수 필드라, 이걸 빼고 배선한 module은 타입 검사부터 통과하지 못합니다. 빈 `auth`나 32자 미만 secret은 forRoot가 module을 조립하는 시점에 ERR_JOB_AUTH_MISCONFIGURED로 죽습니다.
- **결과 필드는 좁힌 뒤에만 존재합니다** — JobExecutionResult에서 `error`·`reason`·`summary`는 `status`로 좁히기 전에는 접근할 수 없습니다. @ts-expect-error 픽스처 3개가 이를 고정합니다.
- **단일 실행 보장을 지우는 튜닝을 거부합니다** — staleRunAfterMs가 heartbeatIntervalMs의 2배 미만이면 createJobRunner가 ERR_JOB_INVALID를 던져 부팅을 멈춥니다. 건강한 run의 watermark가 자기 beat 사이에서 liveness 예산보다 오래돼 보일 수 있는 하한입니다.
- **저장소 원자성을 호스트 테스트에서 검사합니다** — jobRunStoreContractCases()는 프레임워크 없는 적합성 케이스 13개를 돌려줍니다. S1–S6 의무를 실제 database에 그대로 겁니다 — 동시 claim burst, 같은 세 행을 노리는 두 개의 동시 reap. `inspect`를 넘기면 S7까지 붙어 16개가 됩니다.
- **/core에 Nest가 없음을 산출물로 증명합니다** — guard test가 src/core/**·src/testing/**와 빌드 산출물 dist/core.*·dist/testing.* 청크 전량을 훑어 @nestjs·rxjs·reflect-metadata 참조가 하나도 없음을 확인합니다. 같은 파일의 대조군이 dist/index.js에는 @nestjs가 있다고 못 박기 때문에, 빈 결과가 '스캐너가 아무것도 안 봤다'는 뜻일 수 없습니다.

## Golden path

> **완료 상태:** 앱 소유 실행 저장소로 뒷받침되는 인증된 운영 작업 경계를 만듭니다.

### 1. 설치

```sh
pnpm add @gj-kit/nest-operations-jobs
```

### 2. 앱이 소유할 경계를 정합니다

`JobRunStore`를 구현한 뒤 module을 등록하기 전에 32자 이상의 shared secret 또는 token verifier를 설정합니다.

### 3. 최소 연결부터 시작합니다

먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.

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

## 실제로는 이렇게 걸립니다

`status`로 좁히기 전에는 `error`에 접근할 수 없고, `recorded`는 모든 분기에 있습니다. 저장된 행이 반환된 status와 어긋나는 상황이야말로 알림을 걸 지점이기 때문입니다.

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

## 주장 대신 검증

- unit test 230개 이상
- @ts-expect-error 가드 11개
- store 계약 case 13개
- 런타임 의존성 0

이 문서의 모든 코드 블록은 릴리스 전에 공개 선언 파일에 대해 타입 검사를 통과합니다. 열 개 패키지가 공유하는 게이트는 `pnpm verify:release` 하나입니다.

## 사용할 때

Nest 앱에서 명시적 동시성, 권한, 실행 영속성을 갖춘 스케줄 또는 운영자 실행 작업이 필요할 때 사용합니다.

## 사용하지 않을 때

제품 비즈니스 규칙, queue 인프라, 앱 권한 정책을 이 통합 뒤에 숨기지 마세요.

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `@nestjs/common` | `^10 || ^11` |
| `@nestjs/core` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## 공개 entry point

- `@gj-kit/nest-operations-jobs`
- `@gj-kit/nest-operations-jobs/core`
- `@gj-kit/nest-operations-jobs/testing`

## 안전 경계

작업 실행 권한과 앱 데이터 소유권은 host 앱에 둡니다. 편의 route를 인증 없는 운영 endpoint로 만들지 마세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/nest-operations-jobs/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/nest-operations-jobs/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/nest-operations-jobs.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


NestJS 운영 잡(operations job) 실행 플랫폼이다. **잡은 비즈니스 로직만 갖는다** — 인증·중복 실행 방지·하트비트·타임아웃·실행 기록·구조화 로깅은 전부 파이프라인이 소유한다. 잡을 하나 더 만들고 싶으면 프로바이더 하나를 `@OperationsJobDefinition()`으로 표시하면 되고, 라우트도 배선도 추가하지 않는다.

- **런타임 의존성 0.** `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`는 **required peer**다.
- **저장소는 소유하지 않고 계약한다.** 테이블·마이그레이션·ORM을 모르는 대신 `JobRunStore` 포트가 원자성 의무 7종(S1–S7)을 명세하고, `./testing`의 적합성 케이스 배열이 그 의무를 **호스트의 테스트 스위트 안에서** 검사한다.
- **`./core`는 프레임워크가 없다.** 러너·레지스트리·카탈로그·인증 원시 함수는 `@nestjs/*`를 한 줄도 import하지 않는다. Nest 없는 워커·람다에서도 그대로 돈다.

> **먼저 읽을 것** — 이 패키지가 "두 번 실행되지 않는다"를 보장하는 근거는 **호스트 저장소 구현 하나**다. [§2 JobRunStore 구현 가이드](#2-jobrunstore-구현-가이드)의 부분 유니크 인덱스와 적합성 케이스 루프를 건너뛰면, 잡이 영원히 스킵되거나 두 번 도는 두 가지 실패가 **모든 관측 표면이 초록인 채로** 발생한다.

## 설치

```sh
corepack pnpm add @gj-kit/nest-operations-jobs
corepack pnpm add @nestjs/common @nestjs/core reflect-metadata rxjs
```

| 서브패스 | 내용 |
|---|---|
| `@gj-kit/nest-operations-jobs` | Nest 어댑터 — 모듈·데코레이터·가드·컨트롤러 팩토리·CLI·DI 토큰 |
| `@gj-kit/nest-operations-jobs/core` | 프레임워크 없는 러너·레지스트리·저장소 포트·카탈로그·인증 원시 함수 |
| `@gj-kit/nest-operations-jobs/testing` | 인메모리 저장소·가짜 시계·기록 로거·**저장소 적합성 케이스** |

---

## 1. 5분 배선

잡 하나를 정의하고, 모듈을 얹고, 트리거 경로를 연다.

```ts
import { Injectable } from '@nestjs/common';
import { OperationsJobDefinition } from '@gj-kit/nest-operations-jobs';
import type { JobSummary, OperationsJob, OperationsJobContext } from '@gj-kit/nest-operations-jobs';

@Injectable()
@OperationsJobDefinition()
export class PurgeExpiredDraftsJob implements OperationsJob {
  readonly key = 'drafts.purge-expired';
  readonly description = '만료된 임시 저장본을 삭제한다';
  readonly timeoutMs = 300_000;
  readonly schedule = { cron: '0 4 * * *', timeZone: 'Asia/Seoul' };

  async run(_input: void, context: OperationsJobContext): Promise<JobSummary> {
    let purged = 0;
    for (const batch of [1, 2, 3]) {
      // 오래 도는 루프는 시그널을 확인한다 — 시한이 지나면 여기서 멈춰야 한다.
      if (context.signal.aborted) break;
      // 하트비트가 false면 이 실행은 claim을 잃었다: 즉시 그만둔다.
      if (!(await context.heartbeat({ purged }))) break;
      purged += batch;
    }
    return { purged };
  }
}
```

```ts
import { Module } from '@nestjs/common';
import { OperationsJobsModule } from '@gj-kit/nest-operations-jobs';
import type { JobRunStore } from '@gj-kit/nest-operations-jobs/core';

declare const jobRunStore: JobRunStore;
declare class PurgeExpiredDraftsJob {}

@Module({
  imports: [
    OperationsJobsModule.forRoot({
      // §2에서 만드는 호스트 소유 구현
      store: jobRunStore,
      // 인증 수단이 하나도 없으면 부팅이 실패한다(§4)
      auth: { secret: process.env.OPERATIONS_JOBS_SECRET ?? '' },
      // 트리거 컨트롤러를 여기 등록한다. CLI 전용 호스트는 이 줄을 뺀다.
      trigger: { path: 'internal/jobs', triggeredByHeader: 'x-cloudscheduler-jobname' },
      // 배포 식별자는 호스트가 읽어 넘긴다 — 라이브러리는 환경 변수를 읽지 않는다.
      serviceRevision: process.env.K_REVISION ?? null,
    }),
  ],
  providers: [PurgeExpiredDraftsJob],
})
export class OperationsModule {}
```

이제 `POST /internal/jobs/drafts.purge-expired/run`이 열린다. 응답은 200이며 본문은 `{ runId, jobKey, status, durationMs, recorded, summary? }`다.

| 결과 | HTTP | 스케줄러가 읽는 뜻 |
|---|---|---|
| `SUCCEEDED` | 200 | 성공 |
| `SKIPPED` | 200 | 성공 — 중복은 오류가 아니다(재시도 금지) |
| `FAILED` | 500 | 재시도 |
| `TIMED_OUT` | 504 | 재시도 |
| `ERR_JOB_UNKNOWN` | 404 | 배선 오류 |
| `ERR_JOB_REGISTRY_NOT_READY` | 503 | 재시도(부팅 중) |
| `ERR_JOB_INPUT_INVALID` · `ERR_JOB_INPUT_UNEXPECTED` | 400 | 호출자 오류 |
| `ERR_JOB_STORE` | 503 | 재시도 |
| `ERR_JOB_UNAUTHORIZED` | 401 | 설정 오류 |

**`recorded`가 본문에 항상 실린다.** 상태 코드는 `status`(이 러너의 본문이 어떻게 끝났는가)가 정하고, 저장된 행이 그 말과 같은지는 `recorded`가 말한다. `'settled'`가 아니면 그 기록은 이 실행의 것이 아니다.

`forRootAsync`로 스토어·시크릿을 다른 프로바이더에서 받을 수도 있다. 이때 **트리거 컨트롤러는 호스트가 직접 등록한다** — Nest 모듈의 컨트롤러 목록은 팩토리보다 먼저 확정되기 때문이다.

```ts
import { Module } from '@nestjs/common';
import {
  createOperationsJobsController,
  OperationsJobsModule,
} from '@gj-kit/nest-operations-jobs';
import type { JobRunStore } from '@gj-kit/nest-operations-jobs/core';

declare class ConfigModule {}
declare class ConfigService {
  get(key: string): string;
}
declare class StoreModule {}
declare class PrismaJobRunStore implements JobRunStore {
  claim: JobRunStore['claim'];
  heartbeat: JobRunStore['heartbeat'];
  complete: JobRunStore['complete'];
  recordSkipped: JobRunStore['recordSkipped'];
  reapStale: JobRunStore['reapStale'];
}

@Module({
  imports: [
    OperationsJobsModule.forRootAsync({
      imports: [ConfigModule, StoreModule],
      inject: [PrismaJobRunStore, ConfigService],
      useFactory: (store: PrismaJobRunStore, config: ConfigService) => ({
        store,
        auth: { secret: config.get('OPERATIONS_JOBS_SECRET') },
      }),
    }),
  ],
  controllers: [createOperationsJobsController({ path: 'internal/jobs' })],
})
export class AsyncOperationsModule {}
```

---

## 2. JobRunStore 구현 가이드

이 절이 README에서 가장 중요하다. 라이브러리는 스키마를 소유하지 않으므로, **단일 실행 보장의 전부가 여기에 걸려 있다.**

### 2.1 저장소가 지는 의무 (S1–S7)

| # | 의무 | 정확한 뜻 |
|---|---|---|
| **S1** | 단일 claim | 같은 `overlapKey`에 대해 어느 순간에도 `RUNNING` 행은 최대 1개다. `claim`은 원자적 CAS여야 하며 "조회 후 없으면 삽입"으로 흉내 낼 수 없다. 경쟁에서 진 호출은 예외가 아니라 `null`을 돌려준다. **`null`로 바꿔도 되는 예외는 overlap 유니크 제약 위반 단 하나**이고, 그 밖의 위반·연결 오류·직렬화 실패는 반드시 다시 던진다 |
| **S2** | 단조 하트비트 | `heartbeat`은 대상 행이 `RUNNING`일 때만 워터마크를 **저장소 자기 시계**의 현재 값으로 전진시키고 `true`를 반환한다. 워터마크는 어떤 경우에도 뒤로 가지 않는다. `RUNNING`이 아니면 아무것도 쓰지 않고 `false` |
| **S3** | 멱등 완료 | `complete`는 `RUNNING → terminal` 전이일 때만 쓰고 `true`. 이미 종료 상태면 아무것도 쓰지 않고 `false`. 종료 상태는 최종이다 |
| **S4** | 원자적 reap | `reapStale`은 stale 행을 `TIMED_OUT`으로 **한 문장에** 전이시키고 **자신이 실제로 전이시킨 행 수만** 반환한다. 두 인스턴스가 동시에 reap해도 합계가 실제 행 수를 넘지 않는다 |
| **S5** | run id 유일성 | `claim`·`recordSkipped`가 돌려주는 `runId`는 전역 유일하고 행 수명 동안 불변이다 |
| **S6** | 시간축 분리 | **기록용**(`startedAt`·`at`·`finishedAt`)은 러너의 주입 시계에서 온 epoch ms이며 저장소는 이를 **그대로** 보존한다. **liveness용**(하트비트 워터마크·stale 컷오프)은 **저장소 자기 시계**만 쓴다. `claim`은 워터마크를 자기 `now()`로 **반드시 초기화한다** — NULL이면 그 행은 영원히 reap되지 않고 overlap key를 영구 점유한다 |
| **S7** | 입력·요약 왕복 | `input`·`summary`는 JSON 왕복 가능한 값으로 저장되고, 저장 실패는 **예외로 알린다** — 조용히 버리지 않는다 |

**왜 liveness가 저장소 시계여야 하는가.** 러너 인스턴스가 N개면 프로세스 시계도 N개이고, 인스턴스들이 공유하는 시계는 저장소 하나뿐이다. "두 번 실행"을 가르는 비교식은 그 축 위에 있어야 한다. 그래서 `reapStale`은 컷오프 **시각**이 아니라 `staleAfterMs`라는 **기간**을 받는다.

### 2.2 테이블과 인덱스 (PostgreSQL)

**부분 유니크 인덱스가 계약의 전부다.** Prisma 스키마로는 표현할 수 없으므로 raw 마이그레이션이 필요하다.

```sql
CREATE TABLE job_run (
  id                text        PRIMARY KEY,
  job_key           text        NOT NULL,
  overlap_key       text,
  status            text        NOT NULL,
  trigger_source    text        NOT NULL,
  triggered_by      text,
  input             jsonb,
  summary           jsonb,
  error             text,
  started_at        timestamptz NOT NULL,
  -- liveness 축: 저장소 자기 시계만 쓴다(S6). NOT NULL + DEFAULT now()가 계약이다.
  heartbeat_at      timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  duration_ms       integer,
  service_revision  text
);

-- S1: 같은 overlap key에 RUNNING 행은 최대 1개.
-- WHERE 절이 빠지면 첫 run이 key를 영구 점유하고, 그 잡은 다시는 실행되지 않는다.
CREATE UNIQUE INDEX job_run_overlap_key_running_idx
  ON job_run (overlap_key)
  WHERE status = 'RUNNING';

CREATE INDEX job_run_liveness_idx ON job_run (status, heartbeat_at);
```

### 2.3 Prisma 구현

```ts
import type {
  JobRunClaim,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunHeartbeatRequest,
  JobRunReapRequest,
  JobRunSkippedRequest,
  JobRunStore,
} from '@gj-kit/nest-operations-jobs/core';

declare function newRunId(): string;

export class PrismaJobRunStore implements JobRunStore {
  async claim(request: JobRunClaimRequest): Promise<JobRunClaim | null> {
    const id = newRunId();
    try {
      await prisma.$executeRaw`
        INSERT INTO job_run (id, job_key, overlap_key, status, trigger_source, triggered_by,
                             input, started_at, heartbeat_at, service_revision)
        VALUES (${id}, ${request.jobKey}, ${request.overlapKey}, 'RUNNING',
                ${request.trigger.source}, ${request.trigger.triggeredBy ?? null},
                ${JSON.stringify(request.input)}::jsonb,
                to_timestamp(${request.startedAt} / 1000.0),
                now(), ${request.serviceRevision ?? null})`;
      return { runId: id };
    } catch (error) {
      // 제약을 **이름으로** 좁힌다. P2002 전체를 삼키면 과잉 유니크 인덱스가
      // 영구 SKIPPED로 둔갑하고, 모든 관측 표면이 초록인 채 잡이 멈춘다.
      if (isOverlapUniqueViolation(error)) return null;
      throw error;
    }
  }

  async heartbeat(request: JobRunHeartbeatRequest): Promise<boolean> {
    const progress = request.progress === undefined ? null : JSON.stringify(request.progress);
    const updated = await prisma.$executeRaw`
      UPDATE job_run
         SET heartbeat_at = GREATEST(heartbeat_at, now()),
             summary = COALESCE(${progress}::jsonb, summary)
       WHERE id = ${request.runId} AND status = 'RUNNING'`;
    return updated > 0;
  }

  async complete(request: JobRunCompleteRequest): Promise<boolean> {
    const summary = request.summary === undefined ? null : JSON.stringify(request.summary);
    const updated = await prisma.$executeRaw`
      UPDATE job_run
         SET status = ${request.status},
             finished_at = to_timestamp(${request.finishedAt} / 1000.0),
             duration_ms = ${request.durationMs},
             summary = COALESCE(${summary}::jsonb, summary),
             error = ${request.error ?? null}
       WHERE id = ${request.runId} AND status = 'RUNNING'`;
    return updated > 0;
  }

  async recordSkipped(request: JobRunSkippedRequest): Promise<JobRunClaim> {
    const id = newRunId();
    await prisma.$executeRaw`
      INSERT INTO job_run (id, job_key, overlap_key, status, trigger_source, triggered_by,
                           input, summary, started_at, finished_at, duration_ms, service_revision)
      VALUES (${id}, ${request.jobKey}, NULL, 'SKIPPED',
              ${request.trigger.source}, ${request.trigger.triggeredBy ?? null},
              ${JSON.stringify(request.input)}::jsonb,
              ${JSON.stringify({ reason: request.reason })}::jsonb,
              to_timestamp(${request.at} / 1000.0), to_timestamp(${request.at} / 1000.0),
              0, ${request.serviceRevision ?? null})`;
    return { runId: id };
  }

  async reapStale(request: JobRunReapRequest): Promise<number> {
    return prisma.$executeRaw`
      UPDATE job_run SET status = 'TIMED_OUT', finished_at = now(),
                         error = 'heartbeat stale'
       WHERE id IN (
         SELECT id FROM job_run
          WHERE status = 'RUNNING'
            AND heartbeat_at < now() - (${request.staleAfterMs} * interval '1 millisecond')
            AND (${request.jobKey ?? null}::text IS NULL OR job_key = ${request.jobKey ?? null})
            AND (${request.overlapKey ?? null}::text IS NULL OR overlap_key = ${request.overlapKey ?? null})
          ORDER BY heartbeat_at
          LIMIT ${request.limit ?? 1000}
          FOR UPDATE SKIP LOCKED)`;
  }
}
```

`FOR UPDATE SKIP LOCKED`가 없으면 두 reaper가 같은 행을 기다렸다 각자 1을 세어 합계가 실제 행 수를 넘고, `SELECT` 후 별도 `UPDATE`로 나누면 "한 문장에"와 "실제로 전이시킨 행 수만"이 동시에 깨진다.

### 2.4 적합성 케이스를 호스트 테스트에 넣는다

```ts
import { jobRunStoreContractCases } from '@gj-kit/nest-operations-jobs/testing';

for (const testCase of jobRunStoreContractCases({ concurrency: 8 })) {
  it(testCase.name, async () => {
    await testCase.run(appStore);
  });
}
```

**연결 2개 이상인 실제 데이터베이스**를 향해 돌려야 한다. 단일 연결 클라이언트는 S1 버스트를 직렬화해 비원자적 claim을 숨긴다. 저장된 값을 봐야 하는 케이스(S6 기록축·S7)는 `inspect` 콜백을 넘길 때만 생성된다.

**영속 저장소에서 재실행 가능하다.** `jobRunStoreContractCases()`는 호출마다 새 키 네임스페이스를 만들어 모든 `jobKey`·`overlapKey`에 붙이고, 케이스가 던지는 모든 reap을 그 네임스페이스로 좁힌다. 그래서 (a) 위처럼 저장소 인스턴스 하나로 전 케이스를 돌려도 되고, (b) 같은 테이블을 CI 실행 사이에 비우지 않아도 되며, (c) 이 스위트가 **건드린 적 없는 잡의 행을 마감하는 일이 없다**. 케이스가 남기는 RUNNING 행은 다음 호출의 키와 겹치지 않으므로 무해하다.

### 2.5 오래된 RUNNING 행을 청소하는 잡

`execute`는 claim하려는 키 주변만 reap한다. 다시는 트리거되지 않는 잡의 고아 행을 위해 호스트가 스윕 잡을 하나 등록한다. 보존 기간·삭제 정책은 제품의 것이므로 라이브러리가 소유하지 않는다.

```ts
import { Inject, Injectable } from '@nestjs/common';
import { JOB_RUNNER, OperationsJobDefinition } from '@gj-kit/nest-operations-jobs';
import type { JobRunner, JobSummary, OperationsJob } from '@gj-kit/nest-operations-jobs';

@Injectable()
@OperationsJobDefinition()
export class SweepStaleRunsJob implements OperationsJob {
  readonly key = 'platform.sweep-stale-runs';
  readonly description = '고아 RUNNING 행을 마감한다';
  readonly schedule = { cron: '*/5 * * * *', timeZone: 'Asia/Seoul' };

  constructor(@Inject(JOB_RUNNER) private readonly runner: JobRunner) {}

  async run(): Promise<JobSummary> {
    return { reaped: await this.runner.reapStaleRuns({ limit: 500 }) };
  }
}
```

---

## 3. 잡 작성 규칙

1. **호출자 시그널은 시작 전에도 존중된다.** `execute(..., { signal })`에 이미 abort된 시그널을 주면 reap도 claim도 하지 않고 `ERR_JOB_ABORTED`를 던진다 — 행도 남지 않고 본문도 돌지 않는다. 우아한 종료 훅에서 SIGTERM 시그널을 그대로 넘기면 되는 이유다.
2. **`context.signal`을 확인한다.** 라이브러리는 시그널이 정확한 시점에 abort된다는 것, 마감 기록이 정확히 한 번 쓰인다는 것, 시한 뒤에도 살아 있는 본문이 기록을 오염시킬 수 없다는 것 셋을 보장한다. **보장하지 않는 것은 부수효과 중단이다** — 시그널을 읽지 않는 잡은 DB 쓰기와 외부 호출을 계속한다.
3. **`context.heartbeat()`가 `false`면 그만둔다.** 이 실행은 claim을 잃었다(stale로 reap됐거나 이미 마감됐다). 계속 돌면 두 번째 본문과 겹친다. 그래도 끝까지 돌아 정상 종료한 본문은 그 결과대로 기록된다 — 마감 쓰기가 받아들여졌다는 것이 이 실행이 행을 실제로 쥐고 있었다는 증거이고(`recorded: 'settled'`), 거절되면 `recorded: 'superseded'`가 "두 번째 본문이 돌고 있을 수 있다"를 그대로 말한다. 끝난 일을 "중단됨"으로 적어 스케줄러 재시도를 부르지는 않는다.
4. **`ok: false`는 예약어다.** 요약에 `ok`가 정확히 `false`면 러너가 부분 실패로 간주해 요약은 보존한 채 FAILED로 기록한다. `0`·`''`·`undefined`는 성공이다.
5. **부수효과는 잡 스스로 멱등이어야 한다.** overlap 방지는 liveness를 위해 safety를 일부 판다: 멈춰 있던 인스턴스가 깨어나면 두 본문이 겹쳐 돌 수 있다. 겹침 창의 상한은 정상 시 **1 하트비트 주기 + abort 반응 시간**, 저장소 장애가 지속되는 동안 **`staleRunAfterMs`(기본 300초) + abort 반응 시간**이다. 이 창을 0으로 만들 수 있는 것은 잡 자신의 도메인 레벨 멱등성뿐이다.

   > **불변식: `staleRunAfterMs` ≥ 2 × `heartbeatIntervalMs`.** 죽은 인스턴스를 빨리 회수하려고 `staleRunAfterMs`를 내리는 것이 가장 자연스러운 첫 튜닝인데, 그 값이 비트 주기 아래로 내려가면 **건강한 실행이 자기 비트 사이에서 항상 stale로 보인다** — 그 사이에 도착한 어떤 트리거든 그 행을 reap하고 두 번째 본문을 시작한다. 이 패키지의 헤드라인 보장이 조용히 사라지는 자리라서, `createJobRunner`(= `forRoot`/`forRootAsync`)가 그 쌍을 받으면 `ERR_JOB_INVALID`로 **부팅을 실패시킨다**. 기본값은 30초 / 300초로 10배다.
6. **입력 스키마는 구조적이다.** `{ parse(value: unknown): Input }`을 만족하면 무엇이든 된다 — zod 스키마가 그대로 대입되고, 라이브러리는 zod를 모른다.

```ts
import type { JobInputValidator, JobSummary, OperationsJob } from '@gj-kit/nest-operations-jobs';

interface BackfillInput {
  readonly since: string;
  readonly limit: number;
}

// zod의 `ZodType`은 이 형태를 그대로 만족한다: z.object({...})를 넣으면 된다.
declare const backfillSchema: JobInputValidator<BackfillInput>;

export class BackfillJob implements OperationsJob<BackfillInput> {
  readonly key = 'billing.backfill';
  readonly description = '누락 결제 기록을 채운다';
  readonly inputSchema = backfillSchema;
  readonly overlapPolicy = 'forbid' as const;

  async run(input: BackfillInput): Promise<JobSummary> {
    return { since: input.since, filled: input.limit };
  }
}
```

**소비자 계약 테스트 레시피.** 잡이 받은 입력을 도메인 서비스에 그대로 넘기면 "인자 없음"이 "지금"으로 해석되는 사고가 난다. 잡 계약 테스트는 잡이 서비스를 **어떤 인자로** 불렀는지를 단언한다 — 무인자 호출이 의도라면 그것도 명시적으로 고정한다.

---

## 4. 인증 배선

트리거 인증은 두 수단이 공존한다. **둘 다 없으면 모듈 조립에서 죽는다** — 시크릿 미설정 배포가 헬스체크를 통과하고 스케줄러가 처음 발사할 때 비로소 깨지는 일을 없앤다.

- **공유 시크릿**: `Authorization: Bearer <secret>`. 양쪽을 SHA-256 해시한 뒤 32바이트 digest를 상수시간 비교하므로 길이가 타이밍으로 유출되지 않는다. **32자 하한**이 있고, 짧으면 조립 시점 에러다.
- **토큰 검증**: `JobTriggerTokenVerifier` 포트. 라이브러리는 어떤 클라우드 SDK도 싣지 않는다. 토큰이 3세그먼트 base64url 형태일 때만 verifier를 부르므로, 오입력 시크릿이 매 요청 아웃바운드 검증을 유발하지 않는다.

Cloud Scheduler OIDC 어댑터는 호스트에서 20줄이다.

```ts
import type {
  JobTriggerIdentity,
  JobTriggerTokenVerifier,
} from '@gj-kit/nest-operations-jobs/core';

// google-auth-library의 OAuth2Client 형태만 구조적으로 선언한다 — 이 블록은
// 라이브러리가 그 패키지를 요구하지 않는다는 사실 자체를 보여준다.
declare const oauthClient: {
  verifyIdToken(options: { idToken: string; audience: string }): Promise<{
    getPayload(): { email?: string; email_verified?: boolean } | undefined;
  }>;
};

export function schedulerOidcVerifier(config: {
  readonly audience: string;
  readonly serviceAccountEmail: string;
}): JobTriggerTokenVerifier {
  return {
    async verify(token: string): Promise<JobTriggerIdentity | null> {
      const ticket = await oauthClient.verifyIdToken({ idToken: token, audience: config.audience });
      const payload = ticket.getPayload();
      if (payload?.email !== config.serviceAccountEmail) return null;
      if (payload.email_verified !== true) return null;
      return { method: 'token', subject: payload.email };
    },
  };
}
```

**시크릿 → OIDC 무중단 전환 순서**: ⑴ `auth`에 `secret`과 `tokenVerifier`를 **둘 다** 준 채 배포한다. ⑵ 스케줄러 잡을 OIDC로 갱신한다. ⑶ 로그에서 `method: 'secret'` 인증이 사라진 것을 확인한다. ⑷ `secret`을 내린다. verifier가 **던지면** 거부가 아니라 장애로 보고 503을 돌려준다(스케줄러가 재시도한다) — `null`을 돌려줄 때만 401이다.

---

## 5. 스케줄러 동기화

라이브러리는 **무엇을 스케줄해야 하는가**(순수 데이터)를 소유하고, 호스트는 **어디에 어떻게 만드는가**(클라우드·명명·권한·prune 정책)를 소유한다. gcloud 서브프로세스는 CI에서 한 줄도 실행할 수 없는 표면이므로 승격하지 않았다.

```ts
import { jobCatalog, jobKeySlug, schedulerHttpTargets } from '@gj-kit/nest-operations-jobs/core';

declare function runGcloud(args: readonly string[]): Promise<void>;
declare const apply: boolean;

export async function syncScheduler(baseUrl: string): Promise<void> {
  const targets = schedulerHttpTargets(jobCatalog(appRegistry.list()), {
    baseUrl,
    routePrefix: 'internal/jobs',
  });

  for (const target of targets) {
    // 이름 접두는 호스트의 명명 규약이다 — 라이브러리가 정하면 두 서비스가 충돌한다.
    const name = `myservice-job-${jobKeySlug(target.key)}`;
    const args = [
      'scheduler', 'jobs', 'update', 'http', name,
      `--schedule=${target.cron}`,
      `--time-zone=${target.timeZone}`,
      `--uri=${target.uri}`,
      `--http-method=${target.httpMethod}`,
      `--attempt-deadline=${target.attemptDeadlineSeconds}s`,
    ];
    // 관행 3종: ⑴ --apply 없이는 계획만 출력한다, ⑵ Authorization 헤더는 로그에서
    // 마스킹한다, ⑶ 기존 잡과 diff해 변경이 있을 때만 update를 때린다.
    if (!apply) {
      console.log(`[plan] ${args.join(' ')}`);
      continue;
    }
    await runGcloud(args);
  }
}
```

`SchedulerHttpTarget`은 비교 가능한 순수 값이라 diff 구현이 세 줄이다. Terraform을 쓴다면 같은 배열을 `google_cloud_scheduler_job` 리소스의 입력 JSON으로 내보내면 된다.

**`attemptDeadlineSeconds`는 절단되지 않는다.** `ceil(timeoutMs / 1000) + margin`이 `maxAttemptDeadlineSeconds`(기본 1_800초)를 넘으면 `schedulerHttpTargets`가 잡 키를 지목하며 `ERR_JOB_INVALID`로 죽는다. 상한으로 깎아 내보내면 스케줄러는 30분에 포기하는데 러너는 60분까지 돌리는 타깃이 만들어지고 — 매 실행 deadline-exceeded 실패 + 재시도가 기록되며, `forbid` 잡의 재시도는 SKIPPED/200이라 **실행은 전부 성공하는데 스케줄러 잡만 영구히 빨간** 상태가 된다. 잡의 `timeoutMs`를 낮추거나 플랫폼이 실제로 허용하는 값으로 `maxAttemptDeadlineSeconds`를 올린다.

---

## 6. CLI 진입점

컨테이너 잡 러너·Kubernetes CronJob·수동 실행이 HTTP와 **같은 러너**를 지난다 — 실행 기록·중복 방지·타임아웃이 똑같이 적용된다.

```ts
import { NestFactory } from '@nestjs/core';
import { runOperationsJobCli } from '@gj-kit/nest-operations-jobs';

process.exitCode = await runOperationsJobCli({
  context: () => NestFactory.createApplicationContext(AppModule, { bufferLogs: true }),
  jobKey: process.argv[2],
});
```

| 결말 | exit code |
|---|---|
| `SUCCEEDED` · `SKIPPED` | 0 |
| `FAILED` · `TIMED_OUT` · throw | 1 |
| 잡 키 누락/빈 문자열 (앱을 부팅하지 않는다) | 2 |

`runOperationsJobCli`는 exit code를 **반환**하고 프로세스를 종료시키지 않는다 — import 부작용으로 프로세스를 죽이는 라이브러리는 계약 위반이다. 팩토리를 넘기면 CLI가 컨텍스트를 닫고(실패해도 닫는다 — 커넥션 풀이 새지 않는다), 인스턴스를 넘기면 호출자가 닫는다. `recorded !== 'settled'`는 종료 코드를 바꾸지 않고 경고 한 줄로 나간다.

> 로거를 transient 스코프로 등록한 호스트(nestjs-pino의 `PinoLogger` 등)는 컨테이너에서 `get`이 아니라 `resolve`로 받아야 한다. 이 CLI는 컨테이너에서 `JOB_RUNNER` 하나만 꺼내므로 그 함정을 상속하지 않는다.

---

## 7. 관리자 카탈로그

`jobCatalog()`는 정의 측 투영이다. 실행 통계는 저장소 스키마를 아는 호스트가 붙인다 — 라이브러리에 조회 포트를 만들면 `JobRunStore`가 다섯 메서드에서 열 개로 커지고 그 절반은 러너가 쓰지 않는다.

```ts
import { jobCatalog } from '@gj-kit/nest-operations-jobs/core';
import type { JobCatalogEntry } from '@gj-kit/nest-operations-jobs/core';

interface AdminJobRow extends JobCatalogEntry {
  readonly lastStatus: string | null;
  readonly runsLast7Days: number;
}

declare function loadRunStats(
  keys: readonly string[],
): Promise<Map<string, { lastStatus: string | null; runs: number }>>;

export async function adminJobs(): Promise<readonly AdminJobRow[]> {
  const catalog = jobCatalog(appRegistry.list());
  const stats = await loadRunStats(catalog.map((entry) => entry.key));
  return catalog.map((entry) => ({
    ...entry,
    lastStatus: stats.get(entry.key)?.lastStatus ?? null,
    runsLast7Days: stats.get(entry.key)?.runs ?? 0,
  }));
}
```

---

## 8. 구 경로 호환 컨트롤러

라이브러리가 남의 URL 네임스페이스를 점유하지 않으므로, 마이그레이션 중인 구 경로는 호스트가 위임 컨트롤러로 유지한다.

```ts
import { Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { JOB_RUNNER, OperationsJobsGuard } from '@gj-kit/nest-operations-jobs';
import type { JobExecutionResult, JobRunner } from '@gj-kit/nest-operations-jobs';

@Controller('internal')
@UseGuards(OperationsJobsGuard)
export class LegacyJobRoutesController {
  constructor(@Inject(JOB_RUNNER) private readonly runner: JobRunner) {}

  @Post('drafts/purge')
  @HttpCode(200)
  async purgeDrafts(): Promise<JobExecutionResult> {
    return this.runner.execute('drafts.purge-expired', undefined, {
      source: 'SCHEDULER',
      triggeredBy: 'legacy-route',
    });
  }
}
```

---

## 9. Nest 없이 `./core`만 쓰기

`./core`의 산출물은 `@nestjs/*`를 한 줄도 import하지 않는다. 워커·람다·`node --test` 프로세스가 이 엔트리만 로드해 러너를 돌릴 수 있다.

```ts
import {
  createJobRegistry,
  createJobRunner,
  silentJobLogger,
} from '@gj-kit/nest-operations-jobs/core';
import { memoryJobRunStore } from '@gj-kit/nest-operations-jobs/testing';

const registry = createJobRegistry([
  {
    key: 'worker.tick',
    description: 'Nest 없이 도는 잡',
    run: async () => ({ ok: true }),
  },
]);

const runner = createJobRunner({
  registry,
  store: memoryJobRunStore(),
  logger: silentJobLogger(),
});

const result = await runner.execute('worker.tick', undefined, { source: 'CLI' });
console.log(result.status, result.recorded);
```

> **설치 계층의 정직한 각주.** peer 4종은 **required**다. 따라서 `./core`만 쓰는 프로젝트도 `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`를 설치하게 된다 — **로드는 하지 않는다**(릴리스 게이트가 peer 디렉토리를 지운 픽스처에서 `./core` 실행을 실제로 확인한다). 이 패키지의 주 표면이 Nest 어댑터이고 그것은 Nest 없이 성립하지 않기 때문에 내린 선택이며, 요구가 실제로 생기면 optional 전환은 완화 방향이므로 minor로 낼 수 있다.

`memoryJobRunStore()`는 **프로덕션 금지**다. 원자성이 "read와 write 사이에 await가 없다"에서 오므로 네트워크 저장소에는 그대로 옮길 수 없다.

---

## 관측 레시피

라이브러리는 알림을 소유하지 않는다. `JobLogger`가 구조화 필드를 내보내므로 호스트가 로그에서 파생시킨다.

- **연속 SKIPPED 경보.** SKIPPED는 HTTP 200 · CLI exit 0 · 스케줄러 성공이다. 잡이 영원히 스킵돼도 어떤 알림도 울리지 않으므로, 러너가 모든 SKIPPED에 남기는 `job skipped:` 경고(경쟁 중인 `overlapKey` 포함)를 세어 N회 연속이면 알린다.
- **`recorded !== 'settled'` 경보.** `'superseded'`는 reaper가 먼저 마감했다는 뜻이고 다른 `runId`로 두 번째 본문이 돌고 있을 수 있다. `'unrecorded'`는 행이 `RUNNING`으로 남았다는 뜻이다.
- **오래된 `RUNNING` 행 카운트.** 관리자 화면에서 `status='RUNNING' AND heartbeat_at < now() - interval '10 minutes'`를 세면 스윕 잡이 도는지 즉시 보인다.
- **full-icu 권고.** `schedule.timeZone` 검증은 `Intl`에 기댄다. small-icu 빌드에서는 잘못된 시간대를 못 잡을 수 있다(오탐은 아니다).

## 라이선스

MIT
