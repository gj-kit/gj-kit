# @gj-kit/nest-operations-jobs — 공개 API 표면 설계

> 작성: 2026-08-24. 형식·깊이 기준: `docs/design/format-api-surface.md` · `docs/design/toss-payments-postgresql-v1.md`. 한국어 산문 + 영어 식별자/JSDoc.
>
> **소스 정본** (memorylog2 `apps/server`, 이 세션에서 전문 판독 — 줄 수는 `wc -l` 실측 `[소스]`):
>
> | 파일 | 줄 | 이 문서에서의 역할 |
> |---|---|---|
> | `src/operations-jobs/operations-job.ts` | 58 | 잡 계약 · `ok:false` 부분 실패 규약 · schedule/schedulerHttpSync 메타 |
> | `src/operations-jobs/job-registry.ts` | 54 | DiscoveryService 수집 · `domain.action` 키 검증 · 부팅 시 중복 거부 |
> | `src/operations-jobs/job-runner.ts` | 323 | 파이프라인 전량: 검증 → 고아 정리 → RUNNING claim → 하트비트 30초/타임아웃 abort → SUCCEEDED\|FAILED\|TIMED_OUT\|SKIPPED · overlap key |
> | `src/operations-jobs/operations-jobs.guard.ts` | 45 | 이중 인증 — timing-safe 공유 시크릿 **또는** Cloud Scheduler OIDC |
> | `src/operations-jobs/scheduler-oidc.verifier.ts` | 42 | google-auth-library `verifyIdToken` + audience/SA 대조 |
> | `src/operations-jobs/operations-jobs.controller.ts` | 34 | `POST /internal/jobs/:jobKey/run` 단일 트리거 표면 |
> | `src/operations-jobs/operations-jobs.module.ts` | 30 | DiscoveryModule import + 프로바이더 배선 |
> | `src/operations-jobs/legacy-job-routes.controller.ts` | 101 | 구 경로 9종 호환 — **제품 고유, 제외**(§0.4-①) |
> | `src/operations-jobs/jobs/job-runs-cleanup.job.ts` | 42 | 플랫폼 자기 관리 잡 — **제품 정책(보존 90일), 제외**(§0.4-②) |
> | `src/jobs/run-job.ts` | 56 | Nest app-context CLI · transient PinoLogger `resolve` · `app.close()` 보장 |
> | `scripts/sync-scheduler.mjs` | 349 | 카탈로그 → Cloud Scheduler HTTP 잡 reconcile · plan-by-default · prune 안 함 |
> | `src/common/bearer-token.ts` · `timing-safe-equal.ts` | 10 · 7 | 헤더 추출 · 상수시간 비교 |
> | `src/admin/admin-jobs.service.ts` | 147 | 카탈로그 + 실행 통계 투영 — sync 스크립트의 입력 형태 |
> | `test/jobs.run-job-cli.spec.ts` | 250 | CLI exit code·`app.close()` 계약 (소비자 계약 테스트 예시) |
> | `test/billing-jobs.contract.spec.ts` | 184 | **소비자의 잡 계약 테스트가 무엇을 단언하고 싶어 하는가**의 정본 |
>
> 표기 규약: `[소스]` = 위 파일을 이 세션에서 직접 읽어 확인. `[형제]` = gj-kit 형제 패키지 소스에서 직접 확인. `[unverified]` = 근거를 확보하지 못한 주장. 표기 없는 문장은 소스 코드 또는 AGENTS.md/CLAUDE.md에서 직접 나온 것이다.

---

## 0. 채택 맵

### 0.1 소스 심볼 전수 → 목적지

소스 8파일의 **export 전수**다. 하나도 암묵적으로 떨어뜨리지 않는다. 비고의 ⚠는 소스와 동작이 달라지는 의도적 변경이며 전량이 §0.2 변경표에 다시 나온다.

| # | 소스 심볼 | 목적지 서브패스 | 라이브러리 이름 | 비고 |
|---|---|---|---|---|
| 1 | `OperationsJob<Input>` | `./core` | `OperationsJob<Input>` | ⚠ `inputSchema` 타입이 `ZodType` → 구조적 `JobInputValidator`(§0.2-①) |
| 2 | `OperationsJobContext` | `./core` | `OperationsJobContext` | ⚠ `logger`가 `PinoLogger` → `JobLogger` 포트, `heartbeat` 반환이 `void` → `boolean`(§0.2-②③) |
| 3 | `JobSummary` | `./core` | `JobSummary` | 동일 (`Record<string, unknown>`) |
| 4 | `OperationsJobDefinition()` | `.` (Nest) | `OperationsJobDefinition()` | 메타키만 네임스페이스화 |
| 5 | `OPERATIONS_JOB_METADATA` | `.` (Nest) | `OPERATIONS_JOB_METADATA` | 값이 `"memorylog:operations-job"` → `"@gj-kit/nest-operations-jobs:job"` |
| 6 | `DEFAULT_JOB_TIMEOUT_MS` | `./core` | `DEFAULT_JOB_TIMEOUT_MS` | 동일 (600_000) |
| 7 | `JobRegistry` (Nest 클래스) | `./core` + `.` | `createJobRegistry()` (순수) + `JOB_REGISTRY` 토큰 | 수집(Nest)과 보관·검증(순수)을 분리 |
| 8 | `JOB_KEY_PATTERN` (비-export) | `./core` | `JOB_KEY_PATTERN` · `isJobKey()` | ⚠ 길이 상한 100 추가(§0.2-④) |
| 9 | `JobRunner` (Nest 클래스) | `./core` + `.` | `createJobRunner()` + `JOB_RUNNER` 토큰 | ⚠ Nest 예외 throw → 판별 유니언 반환(§0.2-⑤) |
| 10 | `HEARTBEAT_INTERVAL_MS` | `./core` | `DEFAULT_HEARTBEAT_INTERVAL_MS` | 옵션으로 승격, 상수는 기본값으로 유지 |
| 11 | `STALE_RUN_AFTER_MS` | `./core` | `DEFAULT_STALE_RUN_AFTER_MS` | 동일 |
| 12 | `JobTrigger` | `./core` | `JobTrigger` | `source`가 Prisma enum → `JobTriggerSource` 개방 유니언 |
| 13 | `JobExecutionResult` | `./core` | `JobExecutionResult` | ⚠ 4종 판별 유니언으로 확장(SUCCEEDED\|FAILED\|TIMED_OUT\|SKIPPED) |
| 14 | `JobTimeoutError` (비-export) | `./core` | `OperationsJobsError('ERR_JOB_TIMEOUT')` | 에러 코드 체계로 흡수 |
| 15 | `prisma.jobRun.*` 5종 호출 | `./core` | `JobRunStore` 포트 5메서드 | **이 문서의 중심**(§3.2) |
| 16 | `OperationsJobsGuard` | `.` (Nest) | `OperationsJobsGuard` | ⚠ ConfigService 의존 제거, 부팅 시 fail-closed(§0.2-⑥) |
| 17 | `SchedulerOidcVerifier` | — | `JobTriggerTokenVerifier` **포트만** | google-auth-library 미탑재 — 어댑터는 README 레시피(§3.7) |
| 18 | `bearerToken()` | `./core` | `bearerToken()` | 배열 헤더 처리를 함수 안으로 흡수 |
| 19 | `timingSafeStringEqual()` | `./core` | `timingSafeSecretMatch()` | ⚠ 길이 조기 반환 제거 — digest 비교(§0.2-⑦) |
| 20 | `OperationsJobsController` | `.` (Nest) | `createOperationsJobsController({ path })` | ⚠ 경로가 라이브러리 고정값 → 호스트 인자(§0.2-⑧) |
| 21 | `OperationsJobsModule` | `.` (Nest) | `OperationsJobsModule.forRoot/forRootAsync` | DynamicModule로 승격 |
| 22 | `runOperationsJobCli()` | `.` (Nest) | `runOperationsJobCli()` | ⚠ `process.exitCode` 설정 → exit code **반환**(§0.2-⑨) |
| 23 | `LegacyJobRoutesController` | — | **제외** | 제품 고유 경로 9종(§0.4-①) |
| 24 | `JobRunsCleanupJob` | — | **제외**(README 레시피) | 보존 90일 = 제품 정책(§0.4-②) |
| 25 | `sync-scheduler.mjs` 전량 | `./core` 일부 | `jobCatalog()` · `schedulerHttpTargets()` · `jobKeySlug()` | **gcloud 실행부는 제외**(§0.4-③ — 이 문서의 핵심 결정 하나) |
| 26 | `AdminJobsService.jobs()`의 카탈로그 투영 | `./core` | `jobCatalog()` | 통계(Prisma groupBy)는 호스트에 남는다 |
| 27 | `AdminJobsService.runs/runDetail` | — | **제외** | 관리자 조회 API는 저장소 스키마를 아는 호스트 소유(§6-3) |

### 0.2 의도적 동작 변경표 — "소스와 동일"의 예외 전수

| # | 항목 | 소스 동작 | 라이브러리 동작 | 사유 |
|---|---|---|---|---|
| ① | 입력 스키마 | `inputSchema?: ZodType<Input>`, `ZodError` catch | `inputSchema?: JobInputValidator<Input>` = `{ parse(value: unknown): Input }` | zod는 런타임 의존성/peer가 된다(AGENTS.md §2 — direct dependency 0이 기본). zod의 `ZodType`은 `.parse`를 갖고 있으므로 **구조적으로 대입 가능** — 소비자는 zod를 계속 쓰면서 라이브러리는 zod를 모른다. valibot·ArkType·수제 함수도 동일하게 붙는다 |
| ② | 로거 | `PinoLogger`(nestjs-pino) | `JobLogger` = `{ info/warn/error(fields, message) }` | pino의 `(obj, msg)` 시그니처와 동일해 pino 인스턴스가 그대로 대입된다. Nest 내장 `Logger`는 인자 순서가 달라 `.` 서브패스의 `fromNestLogger()` 어댑터가 흡수한다 |
| ③ | `ctx.heartbeat()` | `Promise<void>`, 실패는 상위로 전파 | `Promise<boolean>` — `false` = **claim을 잃었다** | 소스는 잡이 자기 claim이 회수됐다는 사실을 알 방법이 없었다. `false`를 받은 잡은 스스로 멈출 수 있고, 러너도 같은 신호로 `signal`을 abort한다(§3.4) |
| ④ | 잡 키 | `/^[a-z0-9-]+\.[a-z0-9-]+$/` | 동일 패턴 + **길이 ≤ 100** | 키는 DB 컬럼·스케줄러 잡 이름·URL 경로에 동시에 들어간다. 상한 없는 키는 세 곳 중 하나에서 런타임에 깨진다 |
| ⑤ | 실행 결과 | 성공/SKIPPED는 반환, 실패/타임아웃은 Nest 예외 throw | **4종 판별 유니언 반환**. throw는 "실행 기록이 생기지 않은 경우"에만 | 소스는 HTTP 트리거 하나만 상정했다. CLI는 exit code를, 관리자 UI는 표시 문자열을 원하고, 둘 다 예외에서 결과를 역추론해야 했다(`test/jobs.run-job-cli.spec.ts`가 그 비용의 증거). 규칙: **throw = run row 없음, return = run row 있음** |
| ⑥ | 인증 설정 | 요청 시점에 `ConfigService.get()` 조회, 둘 다 없으면 매 요청 401 | **모듈 조립 시점에 검증** — secret도 verifier도 없으면 부팅 실패 | 소스 배선은 시크릿 미설정 배포가 헬스체크를 통과하고 스케줄러가 처음 발사할 때 비로소 깨진다. 설정 오류는 부팅에서 죽어야 한다 |
| ⑦ | 상수시간 비교 | 길이 다르면 `&&` 단락 → 길이 유출 | 양쪽 SHA-256 후 32바이트 digest를 `timingSafeEqual` | 길이 조기 반환은 시크릿 길이를 타이밍으로 노출한다. digest 비교는 입력 길이와 무관하게 고정 비용이다 |
| ⑧ | 트리거 경로 | `@Controller("internal/jobs")` 하드코딩 | `createOperationsJobsController({ path })` 팩토리 + 모듈 옵션 | 라이브러리가 호스트의 URL 네임스페이스를 점유하면 안 된다. 컨트롤러를 아예 등록하지 않는 CLI 전용 호스트도 있다 |
| ⑨ | CLI | `process.exitCode` 직접 설정, 모듈 top-level 자동 실행 | `Promise<0|1|2>` 반환. 자동 실행은 호스트의 진입 파일 몫 | 반환값이면 테스트가 전역 상태를 만지지 않는다. import 부작용으로 프로세스를 종료시키는 라이브러리는 계약 위반이다 |
| ⑩ | 타임아웃 HTTP 코드 | `RequestTimeoutException` = **408** | **504** | 408은 "클라이언트가 요청을 늦게 보냈다"는 뜻이고 일부 프록시는 연결 종료로 처리한다. 서버 측 실행 초과의 정확한 코드는 504다 |
| ⑪ | 실패 응답 본문 | Nest 기본 직렬화 — 잡 예외 메시지가 그대로 나갈 수 있음 | `{ runId, jobKey, status, error: { code } }` 고정. 스택·원문 메시지는 **run 기록에만** | 스케줄러 로그는 스택트레이스를 둘 곳이 아니다(AGENTS.md §2 — raw public error에 소비자 데이터 노출 금지) |
| ⑫ | stale reap 범위 | 매 execute마다 **전체** RUNNING 스윕, 상한 없음 | 기본은 **claim하려는 overlapKey 한정**, `reapScope: 'all'`로 전체 선택 · `limit` 옵션 | 잡 A의 트리거가 잡 B의 행을 마감하는 부수효과를 없애고, 스윕을 인덱스 조회 한 건으로 만든다 |
| ⑬ | `serviceRevision` | 러너가 `process.env.K_REVISION`을 직접 읽음 | `serviceRevision` 옵션 주입 | 러너 안의 암묵적 환경 읽기 제거(§1-2). 가드 테스트가 `src/**`의 `process.env`를 금지한다 |
| ⑭ | 시계 | `Date.now()` · `new Date()` 직접 호출 8곳 `[소스]` | `JobClock` 주입(epoch ms), 기본 `systemJobClock()` | 타임아웃·하트비트 주기·하트비트 실패 인내·`durationMs`가 전부 시계 판단이다. 주입하지 않으면 이 넷 중 어느 것도 결정적으로 테스트할 수 없다(§1-2). stale 컷오프는 러너가 아니라 저장소의 판단이 됐다(⑰) |
| ⑮ | `schedule.timeZone` | `"Asia/Seoul"` 리터럴 타입 | `string`(IANA) + 부팅 시 `Intl` 검증 | 시간대 고정은 제품 정책이다. 대신 오타는 부팅에서 죽는다 |
| ⑯ | 트리거 식별 헤더 | 컨트롤러가 `x-cloudscheduler-jobname`을 **무조건** 읽어 `triggeredBy`에 넣음 | `triggeredByHeader` 옵션, **기본값 없음(아무 헤더도 읽지 않음)**. GCP 호스트가 `'x-cloudscheduler-jobname'`을 인자로 넘긴다 | 특정 클라우드의 헤더 이름이 라이브러리 기본값에 박히면 §3.6의 "클라우드 흔적" 인벤토리가 조용히 늘어난다. 옵트인이면 흔적이 JSDoc 예시 한 줄과 README로 한정되고, §5.3의 no-product-strings 가드가 그 한 줄에 상한을 건다 |
| ⑰ | liveness 시간축 | `heartbeatAt`은 Prisma `@default(now())` = **DB 시계**가 쓰고, stale 컷오프는 `new Date(Date.now() - STALE_RUN_AFTER_MS)` = **러너 프로세스 시계**가 만든다 — 두 축이 한 `WHERE`에서 비교된다 `[소스 schema.prisma model JobRun · job-runner.ts:190-203]` | **저장소 단일 시계**: `claim`이 워터마크를 자기 `now()`로 초기화하고, `heartbeat`이 자기 `now()`로 전진시키고, `reapStale`은 `staleAfterMs`(기간)만 받아 자기 `now()`에서 컷오프를 만든다(S6) | 러너 인스턴스가 N개면 프로세스 시계도 N개다. 인스턴스들이 공유하는 시계는 저장소 하나뿐이므로, "두 번 실행"을 가르는 비교식은 그 축 위에 있어야 한다(§3.2.3·§7-5) |

### 0.3 소스에서 발견한 결함 6건 — 이관이 고쳐야 하는 것

여섯 건 다 "소스를 그대로 옮기면 따라오는" 문제다. 승격의 목적이 복제가 아니라는 근거이기도 하다.

1. **`InternalServerErrorException`을 던지는 잡은 run row가 영원히 RUNNING으로 남는다** `[소스 job-runner.ts:129-133]`. 러너는 `ok:false` 경로에서 `InternalServerErrorException`을 던지고, catch 블록 첫 줄이 `if (error instanceof InternalServerErrorException) throw error;`다. Nest 앱의 서비스가 같은 예외를 던지면 — 매우 흔하다 — 이 분기에 걸려 **`finalize()`를 건너뛴 채** 밖으로 나간다. 행은 RUNNING으로 남아 overlap key를 5분간 점유하고, stale reaper가 TIMED_OUT으로 마감할 때까지 그 잡은 재실행되지 않는다. → 라이브러리는 `ok:false`를 예외가 아니라 내부 플래그로 나른다(§3.4).
2. **하트비트가 마감된 행을 되살린다** `[소스 job-runner.ts:310-320]`. `touch()`는 `where: { id: runId }`뿐이라 상태를 보지 않는다. 타임아웃 후에도 살아 있는 잡 본문이 `ctx.heartbeat(progress)`를 부르면 TIMED_OUT 행의 `summary`가 덮어써지고 `heartbeatAt`이 미래로 간다. → 저장소 계약 S2/S3이 이것을 금지하고(§3.2), 러너의 `ctx.heartbeat`은 정산 후 저장소를 아예 건드리지 않는다.
3. **마감이 reaper와 경합한다** `[소스 job-runner.ts:288-300]`. `finalize()`도 `where: { id }`뿐이다. reaper가 먼저 TIMED_OUT으로 마감한 행을 늦게 돌아온 러너가 SUCCEEDED로 덮어쓴다. → S3(멱등 완료: RUNNING → terminal 전이만 성공)이 금지한다.
4. **상수시간 비교가 길이를 유출한다** `[소스 timing-safe-equal.ts:5]` — §0.2-⑦.
5. **DiscoveryService 수집이 스코프를 보지 않는다** `[소스 job-registry.ts:24-32]`. request-scoped 프로바이더는 `wrapper.instance`가 부팅 시점에 의미 있는 인스턴스가 아니며, 같은 잡 클래스가 두 모듈에 등록되면 래퍼가 2개 나와 "중복 키"로 부팅이 죽는다(등록자는 이유를 모른다). → 정적 의존성 트리 검사 + 인스턴스 동일성 dedupe + 원인을 말하는 에러(§3.9).
6. **stale 판정이 두 시간축을 섞는다** `[소스 schema.prisma model JobRun · job-runner.ts:190-203, 215-225]`. `claimRun()`은 `heartbeatAt`을 아예 보내지 않아 값이 **DB 시계**(`@default(now())`)에서 나오고, reap 컷오프는 **러너 프로세스 시계**에서 나온다. 두 값이 한 `WHERE`에서 비교되므로 인스턴스 시계가 앞서 있으면 살아 있는 행이 reap돼 두 본문이 겹쳐 돌고, 뒤처져 있으면 죽은 행이 남아 그 잡이 다시는 실행되지 않는다. 스큐는 이 비교식을 **한쪽 축으로 옮기는 것 말고는** 완화 수단이 없다(러너 시계 편차는 러너가 모른다). → S6이 liveness 축을 저장소 시계 하나로 고정하고, `reapStale`이 순간이 아니라 기간(`staleAfterMs`)을 받는다(§3.2.1).

### 0.4 기각 결정 (재론 금지)

| # | 기각한 것 | 근거 |
|---|---|---|
| ① | `LegacyJobRoutesController` 승격 | 경로 9종이 전부 memorylog2 도메인(`drafts`·`storage`·`album-suggestions`)이고, 존재 이유가 "Cloud Scheduler URI를 갱신할 때까지"라는 한시적 마이그레이션이다. 라이브러리에 올리면 남의 제품 경로가 우리 공개 계약이 된다. 대신 **패턴을 문서화**한다 — README에 "구 경로 → `runner.execute(key, …)` 위임 컨트롤러" 10줄 레시피 |
| ② | `JobRunsCleanupJob` 승격 | 보존 90일·`status: { not: RUNNING }` 제외는 제품 정책 + Prisma 쿼리다. 라이브러리가 소유할 수 있는 부분(어떤 행이 삭제 안전한가)은 `JobRunStore`의 선택 메서드가 아니라 **저장소 구현의 책임**이다. README에 잡 구현 예제로 싣는다 |
| ③ | `sync-scheduler.mjs` 승격 (전체 또는 `./scheduler` 서브패스) | §6-1에서 전개. 요약: gcloud 서브프로세스·프로젝트/리전/이름 접두 3종이 제품 정책이고, CLI 플래그는 타입보다 훨씬 약한 호환성 계약이며, CI에서 검증 불가능한 표면이 릴리스 게이트에 구멍을 낸다. **순수 카탈로그 투영만** 올린다 |
| ④ | google-auth-library를 dependency 또는 optional peer로 | 형제 `toss-payments-nestjs`가 dependency 0을 지키는 이유와 같다. optional peer + `try/catch` dynamic import는 AGENTS.md §2가 명시적으로 금지하는 회피다. verifier는 **포트**이고 어댑터는 20줄이다(§3.7) |
| ⑤ | Prisma 스키마·마이그레이션 소유 (`toss-payments-postgresql` 방식) | 그 패키지는 **자기 테이블 7종을 자기가 만든다**. 여기서는 다르다: `JobRun`은 호스트의 관리자 화면·통계·보존 정책이 이미 붙어 있는 호스트 소유 테이블이고, 인덱스 하나(부분 유니크)가 계약의 전부다. 스키마를 뺏으면 호스트의 기존 마이그레이션 히스토리와 충돌한다. **DDL은 README 레시피, 계약은 포트 + 적합성 케이스**(§3.2·§5.4) |
| ⑥ | `@nestjs/config` peer | 설정은 모듈 옵션으로 들어온다. ConfigService를 요구하면 그것을 안 쓰는 Nest 앱이 배제된다 |
| ⑦ | 상태·트리거 소스를 라이브러리 enum으로 고정 | `JobRunStatus`는 러너가 만드는 값이라 닫힌 유니언이 옳다. `JobTriggerSource`는 호스트가 만드는 값이라 `'SCHEDULER' \| 'CLI' \| 'ADMIN' \| (string & {})` 개방 유니언 — 자동완성은 주되 호스트 고유 소스를 막지 않는다 |
| ⑧ | 잡 재시도·백오프·큐잉 | 재시도 소유자는 외부 스케줄러다(소스 주석이 명시: "실패를 돌려준다 — 스케줄러 재시도가 작동한다"). 라이브러리가 두 번째 재시도 정책을 만들면 두 정책이 곱해진다. §6-5 |
| ⑨ | 분산 락 (Redis 등) | overlap 방지의 정본은 저장소의 부분 유니크 인덱스 하나다. 두 번째 락 소스를 도입하면 둘의 불일치가 새 실패 모드가 된다 |

---

## 1. 설계 원칙

1. **프레임워크 없는 코어와 Nest 어댑터를 물리적으로 분리한다.** 파이프라인 전량(`./core`)은 `@nestjs/*`·`rxjs`·`reflect-metadata`를 **한 줄도 import하지 않는다**. 이것은 선언이 아니라 강제다: 소스 스캔 가드 + `dist/core.js` 문자열 스캔 + peer-graph 테스트 3중(§5.3). 러너를 Nest 없이 `node --test`로 돌릴 수 있다는 것이 이 분리의 검증 가능한 결과다.
2. **암묵적 환경 읽기 금지 — 시계·환경변수·전역 타이머.** `Date.now()`·`new Date()`·`setInterval`·`process.env`는 `src/core/clock.ts` **한 파일 안에서만** 등장하고, 그마저 `systemJobClock()`이라는 명시적 팩토리 뒤에 있다. 러너의 세 가지 시간 판단(타임아웃 발화, 하트비트 주기, `durationMs`)이 전부 주입된 시계에서 나오므로 결정적으로 테스트된다(§5.1). **이 원칙이 포트의 타입을 결정한다**: `JobClock.now()`가 epoch ms를 주므로 `JobRunStore`의 시각 필드도 전부 `number`(epoch ms)다. `Date` 필드였다면 러너가 claim·하트비트·마감에서 `new Date(clock.now())`를 불러야 하고, 그 순간 §5.3 ambient-clock 가드가 첫 커밋에서 깨진다 — 가드를 약화시키는 대신 **포트에서 이음매를 없앤다**(덤으로 `readonly` 요청 객체에서 가변 `Date`가 사라진다). `Date`로의 변환은 포트 밖, 저장소 구현의 몫이다. 네 번째 시간 판단이던 stale 컷오프는 아예 러너의 것이 아니게 됐다 — 저장소가 자기 시계로 만든다(S6 — §3.2.1).
3. **영속화는 소유하지 않고 계약한다.** 라이브러리는 테이블도 마이그레이션도 ORM도 모른다. 대신 `JobRunStore` 포트가 **원자성 의무 7종**(§3.2 S1–S7)을 문장으로 정의하고, 그 의무는 문서가 아니라 `./testing`의 적합성 케이스 배열이 검사한다. 호스트의 Prisma 구현이 계약을 만족하는지는 호스트의 테스트 스위트에서 **우리 케이스로** 판정된다.
4. **throw는 "이 러너가 어떤 행도 마감하지 않는다"는 뜻이고, 반환값은 두 개의 진실을 함께 싣는다.** 잡을 못 찾음·입력 검증 실패·claim 단계 저장소 장애 → throw. 잡이 실행된 뒤의 모든 결말(성공·실패·타임아웃·스킵) → 판별 유니언 반환. 반환된 `status`는 **이 러너의 본문이 어떻게 끝났는가**의 정본이고, 저장된 행의 상태는 **기록의 정본**이다. 둘은 갈릴 수 있다 — reaper가 먼저 마감했거나(§0.3-③) `complete` 쓰기가 실패한 경우 — 그래서 그 사실이 반환값 안의 `recorded: 'settled' | 'superseded' | 'unrecorded'`로 나온다. **`'settled'`일 때만 두 정본이 같고, 소비자가 status를 기록으로 취급해도 되는 것도 그때뿐이다**(§3.4). throw 쪽 경계도 정확히 적는다: "기록 없음"은 규칙이 아니라 압도적 다수의 경우이며, claim이 커밋된 뒤 응답이 유실되면 `ERR_JOB_STORE`를 던지면서도 고아 `RUNNING` 행이 남을 수 있다(§3.4.1-4 · §7-14). 이 규칙들로 HTTP·CLI·관리자 UI가 같은 함수를 쓰면서 각자의 표현으로 매핑한다.
5. **fail closed, 그리고 부팅에서.** 인증 수단 0개, 잘못된 잡 키, 중복 키, 오타 cron/시간대, request-scoped 잡 프로바이더는 전부 **부팅 실패**다. 런타임까지 살아남는 설정 오류를 만들지 않는다(소스 registry의 설계 의도를 인증·스케줄 메타로 확장).
6. **abort는 전파하되 강제하지 않는다 — 그리고 무시당했을 때의 계약을 적는다.** JavaScript는 실행 중인 함수를 죽일 수 없다. 라이브러리가 보장하는 것은 (a) `signal`이 정확한 시점에 abort된다, (b) 마감 기록은 정확히 한 번 쓰인다, (c) 시한 뒤에도 살아 있는 본문(orphan)은 기록을 오염시킬 수 없다 — 세 가지다. 보장하지 않는 것은 **부수효과 중단**이며, 그 사실을 README·타입 JSDoc·테스트에 각각 남긴다(§3.4·§5.1).
7. **런타임 의존성 0, peer는 필수 4종.** `dependencies: {}`를 유지한다. `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`는 **required** peer다(optional 아님) — 근거는 §2.2, 그 대가(`./core`만 쓰는 비-Nest 소비자도 Nest 4종을 **설치**한다 — 로드는 하지 않는다)는 §7-13.
8. **공개 옵셔널 필드는 전부 `?: T | undefined`, 입력 객체는 전부 `readonly`.** 모노레포 EOP 소비자 보호 규약 `[형제 — expo-ui §2 → expo-media §1-7 → expo-auth §1-7 → expo-workouts §4 → format §1-7]`. 소비 앱이 `exactOptionalPropertyTypes`를 켜고 `string | undefined`를 넘길 때 TS2379로 깨지지 않게 한다.
9. **공개 JSDoc은 영어, 설계 해설 주석은 한국어.** 형제 패키지 전량과 동일 `[형제]`.

---

## 2. 모듈 구조와 exports 맵

### 2.1 서브패스 3개 — `.` · `./core` · `./testing`

형제에서 역산한 서브패스 정당화 조건 3종 `[형제]`: (a) optional peer 격리, (b) 플랫폼 조건 포크, (c) 무겁고 선택적인 표면. 여기서는 **(a)의 변형과 (c)**가 성립한다.

- **`./core`** — peer 격리가 아니라 **peer 미사용 격리**다. peer는 required지만 `./core`의 산출물은 `@nestjs/*`를 import하지 않으므로, Nest 없는 워커·람다·`node --test` 프로세스가 `./core`만 로드해 러너를 돌릴 수 있다. 미션이 요구한 "framework-free, testable, reusable without Nest"의 물리적 실체다 — 단, 그 실체는 **모듈 그래프**의 것이고 `node_modules`의 것이 아니다(peer는 required이므로 설치는 된다 — §2.2-4·§7-13). 단일 엔트리로 합치면 트리셰이킹에 기대야 하고, 그 기대는 CJS 소비자(Nest 생태계 다수 `[형제 — toss-payments-nestjs tsup 주석]`)에서 성립하지 않는다.
- **`./testing`** — 인메모리 저장소·가짜 시계·적합성 케이스 배열. 프로덕션 번들에 들어가면 안 되는 표면이고, 형제 2종(`toss-payments/testing`·`toss-payments-postgresql/testing`)의 관행 `[형제]`.
- **`.`** — Nest 어댑터. 모듈·데코레이터·가드·컨트롤러 팩토리·CLI·DI 토큰. `./core`를 재수출하지 **않는다**(같은 심볼이 두 경로로 보이면 `instanceof` 검사와 토큰 동일성이 이중 로드에서 깨진다). 대신 코어 타입은 `export type { … } from './core'`로 **타입만** 재수출한다 — 런타임 값은 한 경로에만 존재한다.

`./scheduler` 서브패스는 만들지 않는다(§0.4-③, §6-1). 카탈로그 투영은 순수 함수 3개이므로 `./core`에 둔다.

### 2.2 peer 정책 — 왜 required인가

미션 지시이자 아래 네 근거의 결론이다.

1. **패키지 이름이 `nest-`로 시작한다.** 소비자는 Nest 앱이다. optional peer는 "Nest 없이도 쓸 수 있다"는 신호인데, `.` 엔트리는 Nest 없이 동작하지 않는다.
2. **`rxjs`는 타입 표면에 실제로 새어 나온다.** `CanActivate.canActivate`의 반환 타입이 `boolean | Promise<boolean> | Observable<boolean>`이므로 우리 가드의 `.d.ts`가 rxjs 타입을 참조한다. optional로 두면 rxjs 없는 설치에서 `.d.ts`가 깨진다.
3. **`@nestjs/core`가 새로 필요하다** — `toss-payments-nestjs`는 `@nestjs/common`만 peer로 잡지만 `[형제]`, 여기서는 `DiscoveryService`·`DiscoveryModule`·`Reflector` **3종**이 `@nestjs/core`다(`@nestjs/core/index.d.ts`가 `./discovery`·`./services`를 재수출 `[형제 — node_modules 판독]`). CLI 옵션의 `INestApplicationContext`는 여기 들어가지 않는다 — **`@nestjs/common`이 export한다** `[형제 — @nestjs/common/index.d.ts:6 — ./interfaces에서 재수출]`. 초안이 이것을 네 번째 근거로 셌던 것을 정정한다. 결론은 앞의 3종만으로 그대로 선다. 새 required peer는 breaking change이므로(AGENTS.md §2) **최초 버전에 확정**해야 하고, 그래서 §5.5의 packed consumer가 네 심볼 각각의 **import 출처**를 단언한다 — 근거 문장이 아니라 실제 해상도가 이 peer를 정당화하게 둔다.
4. **AGENTS.md §2를 정확히 인용하면, subpath와 optional-meta는 양자택일이 아니다.** 그 절이 금지하는 것은 "root import에 optional peer를 넣은 뒤 `try/catch`·dynamic import·`peerDependenciesMeta`로 문제를 **숨기는 것**"이고, 처방은 "subpath export, 문서, resolution test를 **함께** 추가한다"이다. 형제가 그 병행을 실제로 보여준다 — `toss-payments-postgresql`은 `./nestjs` 서브패스를 내면서 동시에 `@nestjs/common`·`reflect-metadata`·`rxjs`를 `peerDependenciesMeta`로 optional 표시한다 `[형제 — toss-payments-postgresql/package.json]`. 초안이 AGENTS.md에 "optional peer 대신 서브패스"라는 규칙을 귀속시킨 것은 **오독이었고 여기서 철회한다**. required를 고르는 근거는 위 1~3이며, 형제와 갈리는 이유는 대칭적이다: 그 패키지의 `.`는 진짜로 Nest 없이 완결되지만, 여기서 그 조건을 만족하는 것은 `.`가 아니라 `./core`이고 `.`가 **주 표면**이다. **대가는 설치 계층에 남는다** — `./core`만 쓰는 소비자도 Nest 4종을 설치한다(npm 7+ 자동 설치, pnpm은 unmet peer 경고). 모듈 그래프 계층에서는 §5.3 peer-graph 가드가 `dist/core.js`의 Nest 무관성을 실제로 증명하지만 설치 계층에는 증명할 것이 없다. 이 비대칭을 §7-13에 잔존 리스크로 올리고, 대안(§7-13의 "형제 형태")과 그것을 고르지 않은 이유를 같은 행에 적는다.

peer 범위: `@nestjs/common` `^10 || ^11`, `@nestjs/core` `^10 || ^11`, `reflect-metadata` `^0.1.13 || ^0.2`, `rxjs` `^7` — 형제 `toss-payments-nestjs`와 동일 하한 `[형제]`. 릴리스 게이트의 packed consumer가 Nest 10·11 양쪽 픽스처를 돈다(§5.5).

### 2.3 디렉토리 트리

```
nest-operations-jobs/
├── package.json                # version 0.0.0 (§2.7)
├── tsconfig.json               # 편집기/tsup 기준 — extends ../tsconfig.base.json + 데코레이터 플래그 2종(§2.5)
├── tsconfig.src.json           # include: [src] — 소스 타입 검사
├── tsconfig.tests.json         # include: [src, tests] — @types/node 허용
├── tsup.config.ts              # entry 3종, esm+cjs, dts, target node20, platform node
├── vitest.config.ts            # projects: unit / types (형제 복제)
├── README.md                   # 한국어 산문 — ```ts 블록 전부 check:readme가 dist 타입으로 컴파일
├── LICENSE                     # MIT (형제 동일)
├── scripts/
│   ├── stamp-provenance.mjs    # 루트 scripts/stamp-package-provenance.mjs 위임 래퍼 (형제 복제)
│   ├── check-provenance.mjs    # 루트 check-package-provenance.mjs 위임 래퍼
│   └── check-readme.mjs        # expo-media/format 패턴 개조 — paths 매핑 3개(. / core / testing)
├── src/
│   ├── core.ts                 # "./core" 배럴 — 이 파일의 export가 core 공개 표면 전부
│   ├── core/
│   │   ├── job.ts              # OperationsJob · OperationsJobContext · JobSummary · JobInputValidator
│   │   ├── store.ts            # JobRunStore 포트 + 요청/응답 타입 + 동시성 계약(JSDoc 정본)
│   │   ├── clock.ts            # JobClock · systemJobClock — 이 패키지에서 Date/타이머/env가 등장하는 유일한 파일
│   │   ├── logger.ts           # JobLogger 포트 + silentJobLogger
│   │   ├── registry.ts         # createJobRegistry · JOB_KEY_PATTERN · isJobKey · assertJobSchedule
│   │   ├── runner.ts           # createJobRunner — 파이프라인 전량
│   │   ├── catalog.ts          # jobCatalog · schedulerHttpTargets · jobKeySlug · jobTriggerPath
│   │   ├── auth.ts             # bearerToken · timingSafeSecretMatch · looksLikeJwt · createJobTriggerAuthenticator
│   │   └── errors.ts           # OperationsJobsError · OperationsJobsErrorCode · isOperationsJobsError
│   ├── index.ts                # "." 배럴 — Nest 표면 + 코어 타입 재수출(타입만)
│   ├── nest/
│   │   ├── inject.ts           # Symbol.for DI 토큰 5종 + Inject* 데코레이터
│   │   ├── decorator.ts        # OperationsJobDefinition · OPERATIONS_JOB_METADATA
│   │   ├── registry.provider.ts# DiscoveryService 수집 → createJobRegistry (OnApplicationBootstrap)
│   │   ├── module.ts           # OperationsJobsModule.forRoot / forRootAsync
│   │   ├── guard.ts            # OperationsJobsGuard
│   │   ├── controller.ts       # createOperationsJobsController({ path })
│   │   ├── http.ts             # toHttpException — 코드/결과 → HTTP 매핑 단일 표
│   │   ├── logger.ts           # fromNestLogger 어댑터
│   │   └── cli.ts              # runOperationsJobCli
│   ├── testing.ts              # "./testing" 배럴
│   └── testing/
│       ├── memory-store.ts     # memoryJobRunStore
│       ├── fake-clock.ts       # fakeJobClock
│       ├── recording-logger.ts # recordingJobLogger
│       └── store-contract.ts   # jobRunStoreContractCases
└── tests/
    ├── unit/                   # *.test.ts — §5.1
    │   └── guards/             # peer-graph · ambient-clock · release-artifact (§5.3·§5.5)
    ├── types/                  # *.test-d.ts — §5.2
    └── fixtures/packed-consumer/{nest10,nest11}/  # §5.5 (형제 toss-payments-nestjs 복제)
```

`tsconfig` 3분할은 형제 관행이다 `[형제 — format §2.2, expo-media, expo-workouts]`. `tsconfig.src.json`이 `src/**`를 별도로 검사해야 하는 이유는 여기서도 같다: `devDependencies`의 `@types/node`가 편집기 tsconfig 하나로 전 파일에 보이면, `src/core/**`에 Node 전역이 들어와도 타입 검사가 통과한다. 단 이 패키지는 `platform: 'node'`이므로 `types: []`까지 잠그지는 않는다 — 코어 가드가 막는 것은 Node API가 아니라 **Nest/rxjs import와 파일 외부의 ambient 시계**다(§5.3).

### 2.4 package.json (확정 형태)

```jsonc
{
  "name": "@gj-kit/nest-operations-jobs",
  "version": "0.0.0",
  "description": "NestJS 운영 잡 실행 플랫폼 — 잡 정의만 등록하면 인증·중복 실행 방지·하트비트·타임아웃·실행 기록이 파이프라인으로 강제된다. 저장소는 포트로 분리(스키마 비소유), 순수 러너는 ./core에서 프레임워크 없이 동작, 런타임 의존성 0",
  "keywords": ["nestjs", "cron", "job", "scheduler", "background-jobs", "cloud-scheduler", "operations", "heartbeat", "idempotency"],
  "homepage": "https://github.com/gj-kit/gj-kit/tree/main/nest-operations-jobs",
  "repository": { "type": "git", "url": "git+https://github.com/gj-kit/gj-kit.git", "directory": "nest-operations-jobs" },
  "bugs": { "url": "https://github.com/gj-kit/gj-kit/issues" },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./core": {
      "import": { "types": "./dist/core.d.ts", "default": "./dist/core.js" },
      "require": { "types": "./dist/core.d.cts", "default": "./dist/core.cjs" }
    },
    "./testing": {
      "import": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
      "require": { "types": "./dist/testing.d.cts", "default": "./dist/testing.cjs" }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsup && node scripts/stamp-provenance.mjs",
    "prepack": "npm run build && node scripts/check-provenance.mjs --require-clean",
    "typecheck": "tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.tests.json",
    "test": "vitest run --project unit",
    "test:types": "vitest run --project types",
    "check:readme": "corepack pnpm run build && node scripts/check-readme.mjs",
    "test:all": "pnpm run test && pnpm run test:types"
  },
  "peerDependencies": {
    "@nestjs/common": "^10 || ^11",
    "@nestjs/core": "^10 || ^11",
    "reflect-metadata": "^0.1.13 || ^0.2",
    "rxjs": "^7"
  },
  "devDependencies": {
    "@nestjs/common": "^11",
    "@nestjs/core": "^11",
    "@nestjs/testing": "^11",
    "@nestjs/platform-express": "^11",
    "@types/node": "^24",
    "reflect-metadata": "^0.2",
    "rxjs": "^7",
    "tsup": "^8",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- **`dependencies` 필드 자체가 없다.** `peerDependenciesMeta`도 없다(전부 required — §2.2).
- **`typescript: "^5"`** — 서버 전용 패키지 관행을 따른다(`toss-payments`·`toss-payments-nestjs`·`toss-payments-postgresql` 전부 `^5` `[형제]`). RN/Expo 소비자가 없으므로 `~6.0.3` 고정 이유가 없다.
- **`@nestjs/platform-express`가 devDependency에 있다** — 가드 단위 테스트가 실제 `ExecutionContext`를 만들려면 HTTP 어댑터가 필요하다. 산출물에는 들어가지 않는다(external).

### 2.5 tsup / tsconfig 경계

```ts
// tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  // peer는 번들에 넣지 않는다 — 앱과 단일 인스턴스 공유(이중 로드 방지, 형제 동일).
  external: [/^@nestjs\//, 'reflect-metadata', 'rxjs'],
  // dist/core.* 가 실제로 peer를 참조하지 않는지는 external 설정이 아니라
  // §5.3 peer-graph 가드가 산출물 문자열로 확인한다.
});
```

```jsonc
// tsconfig.json — 편집기/tsup 기준. tsconfig.src.json·tsconfig.tests.json이 이 파일을
// extends하므로 플래그는 여기 한 곳에만 있다.
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    // Nest 데코레이터(@Injectable·@Controller·@Post·@Inject) — 레거시 트랜스폼.
    // 루트 tsconfig.base.json은 이 두 플래그를 주지 않으므로 패키지가 직접 켠다.
    // TS5 네이티브 데코레이터에는 파라미터 데코레이터가 없다 — 이 플래그 없이는
    // §3.9의 InjectJobRunner()가 컴파일 자체를 못 한다.
    "experimentalDecorators": true,
    // 의도적 false — 형제와 동일 결정 [형제 — toss-payments-nestjs/tsconfig.json 주석 ·
    // docs/design/service-integration-v1.1.md §4.1]. esbuild(tsup/vitest)는 design:type을
    // 생성하지 못한다. 그 제약을 설계로 흡수한다: 모든 주입이 명시적 @Inject(토큰)이고
    // 이 패키지의 어떤 코드도 design:paramtypes를 읽지 않는다 → SWC/esbuild 호스트 무설정 호환.
    "emitDecoratorMetadata": false
  },
  "include": ["src", "tests"]
}
```

`emitDecoratorMetadata: false`는 §7-11 완화책의 **전제**다. 나중에 누군가 이 플래그를 켜면 `design:paramtypes`에 의존하는 주입이 조용히 가능해지고, 그 의존은 메타데이터를 만들어 주지 않는 SWC/esbuild 호스트에서**만** 깨진다 — 우리 CI에서는 영원히 초록이다. 그래서 §5.3의 `tsconfig-flags` 가드가 두 플래그 값을 고정한다.

`splitting`은 기본값(esm에서 true)에 맡긴다. `.` 엔트리가 `./core`의 코드를 청크로 공유하더라도 **런타임 값의 단일 출처**는 유지된다 — 이것이 §2.1에서 `.`가 코어 값을 재수출하지 않는 이유와 짝을 이룬다. CJS 빌드는 청크 분리가 없으므로 `.`와 `./core`를 CJS로 동시에 require하면 코어 코드가 두 벌 로드된다 `[unverified — 실제 tsup 산출물로 확인 필요]`. 따라서 **`instanceof` 판정이 필요한 값(에러 클래스)은 `isOperationsJobsError()` 타입 가드를 정본으로 두고**, README가 `instanceof`가 아니라 그 함수를 쓰게 한다(§3.8).

### 2.6 provenance / prepack 배선 (형제 패턴 복제)

- `scripts/stamp-provenance.mjs`·`check-provenance.mjs`는 `format/scripts/*`의 루트 위임 래퍼를 **그대로 복제**한다 `[형제]` — 구현은 루트 `scripts/stamp-package-provenance.mjs` / `check-package-provenance.mjs`가 소유하고, 래퍼는 패키지 루트를 cwd로 공급한다.
- `build`가 `dist/gj-kit-provenance.json`을 스탬프하고, `prepack`이 `--require-clean`으로 dirty tree pack을 차단한다. AGENTS.md §3 — provenance 검증 우회 금지.
- `tests/unit/guards/release-artifact.test.ts`가 `files`·`scripts.build`·`scripts.prepack`·래퍼 존재를 고정한다(형제 `toss-payments-nestjs/tests/unit/release-artifact.test.ts` 복제 + 이 패키지용 exports/peer 단언 추가).

### 2.7 버전·changeset (03e4c50 선례)

`package.json`은 `version: "0.0.0"`으로 커밋하고 minor changeset을 동봉한다 — `changeset version`이 0.1.0을 만든다 (toss-payments-postgresql 도입 커밋 `03e4c50`과 동일 경로 `[형제 — git show 03e4c50]`).

`.changeset/nest-operations-jobs-v0-1.md`:

```md
---
"@gj-kit/nest-operations-jobs": minor
---

신규 패키지 — memorylog2 `apps/server`의 운영 잡 플랫폼(잡 계약·레지스트리·러너·가드·CLI) 승격. 잡은 비즈니스 로직만 갖고, 인증·중복 실행 방지·하트비트·타임아웃·실행 기록은 파이프라인이 소유한다.

- `./core`: 프레임워크 없는 러너. `@nestjs/*`·`rxjs`를 import하지 않아 Nest 없이 테스트·재사용된다.
- `JobRunStore` 포트: 라이브러리는 스키마를 소유하지 않는다. 저장소가 지는 원자성 의무(단일 claim·단조 하트비트·멱등 완료·원자적 reap·시간축 분리)를 명세하고, `./testing`의 적합성 케이스 배열이 호스트 구현을 그대로 검사한다(동시 claim 버스트·동시 reap 포함). 실행 기록의 시각은 러너 시계에서, 살아 있음(liveness) 판정은 저장소 시계에서 나온다 — 인스턴스가 여럿이면 그것이 유일한 공통 시계다. 인메모리 구현 동봉.
- 시계·타임아웃 주입: `Date.now()` 암묵 호출 0. `AbortSignal`이 잡에 전파되며, 시그널을 무시한 잡의 결말(기록은 정확히 한 번, orphan은 기록을 오염시킬 수 없음, 부수효과는 중단 불가)이 문서·테스트로 고정된다.
- 가드: timing-safe 공유 시크릿 비교(길이 유출 없는 digest 비교)는 라이브러리가 소유하고, Cloud Scheduler OIDC 검증은 `JobTriggerTokenVerifier` 포트로 호스트가 공급한다 — google-auth 의존 0. JWT 형태 사전 검사는 라이브러리가 수행해 오입력 시크릿이 네트워크 검증까지 가지 않는다.
- 스케줄러 동기화 도구는 포함하지 않는다(GCP 고유). 대신 `jobCatalog()`·`schedulerHttpTargets()`가 순수 카탈로그를 내보내 호스트가 gcloud/Terraform 동기화를 30줄로 작성한다.
- 런타임 의존성 0. `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`는 required peer.
```

---
## 3. 공개 API 전체 시그니처

`src/core.ts` · `src/index.ts` · `src/testing.ts`가 재수출하는 전부다. 여기 없는 심볼은 internal이며 exports 맵이 deep import를 차단한다. **모든 옵셔널 필드는 `?: T | undefined`, 모든 입력 객체는 `readonly`**(§1-8). JSDoc은 영어(공개 계약), 설계 해설은 한국어 주석.

### 3.1 `./core` — 잡 계약 (`src/core/job.ts`)

```ts
/** Free-form structured result of a job run. Persisted verbatim as the run summary. */
export type JobSummary = Record<string, unknown>;

/**
 * Structural input validator. A Zod schema satisfies this shape as-is
 * (`ZodType.parse(value: unknown): Output`), and so do valibot wrappers,
 * ArkType morphs and hand-written functions. The library never imports a
 * validation library: it only calls `parse` and treats any throw as invalid input.
 */
export interface JobInputValidator<Input> {
  parse(value: unknown): Input;
}

/** Cron metadata. Documentation and scheduler-sync input; the runner never reads it. */
export interface JobSchedule {
  /** 5 or 6 whitespace-separated fields. Shape-checked at boot, not semantically parsed. */
  readonly cron: string;
  /** IANA time zone name. Validated at boot with `Intl.DateTimeFormat`. */
  readonly timeZone: string;
}

export type JobOverlapPolicy = 'forbid' | 'allow';

/** Default job timeout: 10 minutes. Keep below the external scheduler's attempt deadline. */
export const DEFAULT_JOB_TIMEOUT_MS = 600_000;

/**
 * Operations job contract. A job owns business logic only — authentication,
 * overlap prevention, timeouts, run records and logging belong to the runner.
 *
 * Returning a summary whose `ok` is exactly `false` marks the run FAILED while
 * preserving the summary, so an external scheduler retries and alerting fires.
 * Any other value of `ok` (including `0`, `''`, `undefined`) is a success.
 */
export interface OperationsJob<Input = void> {
  /** Unique key shaped `domain.action`, lower-case and hyphenated, at most 100 chars. */
  readonly key: string;
  readonly description: string;
  /** Absent means the job takes no input; a non-empty request body is then rejected. */
  readonly inputSchema?: JobInputValidator<Input> | undefined;
  /** Defaults to {@link DEFAULT_JOB_TIMEOUT_MS}. */
  readonly timeoutMs?: number | undefined;
  /** Defaults to `'forbid'`: a second trigger while one run holds the key is SKIPPED. */
  readonly overlapPolicy?: JobOverlapPolicy | undefined;
  /** Documentation and scheduler-sync metadata only. `null` means "no declared cron". */
  readonly schedule?: JobSchedule | null | undefined;
  /** Defaults to true. False means an external non-HTTP trigger owns this schedule. */
  readonly schedulerHttpSync?: boolean | undefined;
  run(input: Input, context: OperationsJobContext): Promise<JobSummary | void>;
}

/**
 * Heterogeneous collection element type. `any` is deliberate: `run` is
 * contravariant in `Input`, so `OperationsJob<unknown>` would reject every
 * concrete job. Consumers never construct this type; the registry does.
 */
export type AnyOperationsJob = OperationsJob<any>;

export interface OperationsJobContext {
  readonly runId: string;
  readonly jobKey: string;
  readonly trigger: JobTrigger;
  readonly logger: JobLogger;
  /**
   * Aborted when the deadline passes, when the runner loses its claim, or when
   * the caller's own signal aborts. The abort reason is an
   * {@link OperationsJobsError}. Long batch loops must check it.
   */
  readonly signal: AbortSignal;
  /** Epoch milliseconds at which the run times out, from the injected clock. */
  readonly deadlineAt: number;
  /**
   * Refresh the heartbeat immediately, optionally recording intermediate progress.
   *
   * Resolves `false` when this run no longer holds its claim — it was reaped as
   * stale or already settled — and the job should stop. After the runner has
   * settled the run this is a no-op that resolves `false` without touching the
   * store, so a job that outlives its deadline can never overwrite the record.
   *
   * A failed store write is logged and resolves `true`: one transient error must
   * not be read as "claim lost". Sustained failure is not forgiven, though —
   * once nothing has been written for `staleRunAfterMs`, the runner aborts the
   * run with `ERR_JOB_ABORTED` exactly as if the store had answered `false`,
   * because by then another instance is entitled to reap this run's row.
   */
  heartbeat(progress?: JobSummary): Promise<boolean>;
}
```

**설계 각서.** `run`의 반환을 `Promise<JobSummary | void>`로 넓힌 것은 소스의 `toSummary()`가 이미 비객체 반환을 `undefined`로 접고 있었기 때문이다 `[소스]` — 타입이 실제 허용 범위를 말하게 한다. `deadlineAt`을 노출하는 이유는 배치 잡이 "남은 예산 안에서 몇 건까지 처리할지"를 스스로 정할 수 있어야 하기 때문이고, 그 값이 주입된 시계에서 나오므로 테스트에서도 결정적이다.

### 3.2 `./core` — `JobRunStore` 포트와 동시성 계약 (`src/core/store.ts`)

**이 절이 패키지의 핵심 계약이다.** 라이브러리는 테이블·ORM·마이그레이션을 소유하지 않는다. 대신 저장소가 무엇을 원자적으로 해야 하는지를 문장으로 못 박고, `./testing`의 적합성 케이스가 그 문장을 실행 가능한 검사로 바꾼다.

```ts
export type JobRunStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'SKIPPED';
export type JobTerminalStatus = Exclude<JobRunStatus, 'RUNNING'>;

/**
 * Who triggered the run. The listed values are conventions with completion
 * support; any other string is accepted because trigger sources are host facts.
 */
export type JobTriggerSource = 'SCHEDULER' | 'CLI' | 'ADMIN' | (string & {});

export interface JobTrigger {
  readonly source: JobTriggerSource;
  readonly triggeredBy?: string | null | undefined;
}

export type JobSkipReason = 'overlap';

export interface JobRunClaimRequest {
  readonly jobKey: string;
  /**
   * Opaque overlap token. The store must treat it as a bare string: uniqueness
   * among RUNNING rows is the entire contract, and the runner owns how it is
   * derived from the job's overlap policy.
   */
  readonly overlapKey: string;
  readonly trigger: JobTrigger;
  /** Already validated by the runner. Persist as JSON, or `null` when absent. */
  readonly input: unknown;
  /**
   * Epoch milliseconds from the runner's injected clock, recorded verbatim (S6).
   * The store additionally initialises the run's liveness watermark from its own
   * clock, which is the value `reapStale` compares against — see S6.
   */
  readonly startedAt: number;
  readonly serviceRevision?: string | null | undefined;
}

export interface JobRunClaim {
  readonly runId: string;
}

/**
 * Deliberately carries no timestamp: the liveness watermark is the store's own
 * clock (S6). A caller-supplied instant would sit on one of N runner clocks
 * while the reaper compares it on another — the one comparison that decides
 * whether a job body runs twice.
 */
export interface JobRunHeartbeatRequest {
  readonly runId: string;
  readonly progress?: JobSummary | undefined;
}

export interface JobRunCompleteRequest {
  readonly runId: string;
  readonly status: JobTerminalStatus;
  /** Epoch milliseconds from the runner's injected clock, recorded verbatim (S6). */
  readonly finishedAt: number;
  readonly durationMs: number;
  readonly summary?: JobSummary | undefined;
  /** Already truncated by the runner. Never returned to an HTTP caller. */
  readonly error?: string | undefined;
}

export interface JobRunSkippedRequest {
  readonly jobKey: string;
  readonly trigger: JobTrigger;
  readonly input: unknown;
  /** Epoch milliseconds from the runner's injected clock, recorded verbatim (S6). */
  readonly at: number;
  readonly reason: JobSkipReason;
  readonly serviceRevision?: string | null | undefined;
}

export interface JobRunReapRequest {
  /**
   * Liveness budget in milliseconds. A RUNNING row is abandoned when its
   * watermark is older than this **on the store's own clock** (S6): the runner
   * sends a duration, never an instant, because with N runner instances there
   * are N process clocks and exactly one store clock. The store also stamps the
   * reaped rows' `finishedAt` from that same clock.
   */
  readonly staleAfterMs: number;
  /**
   * Narrow to one job's rows. The runner uses this for `allow`-policy jobs,
   * whose overlap keys are minted per run and therefore match no existing row.
   */
  readonly jobKey?: string | undefined;
  /** Narrow to one overlap key — the key the runner is about to claim. */
  readonly overlapKey?: string | undefined;
  /** Upper bound on rows this call may move. */
  readonly limit?: number | undefined;
}

/**
 * Persistence port for job runs. The library owns no schema; a host maps these
 * five operations onto its own table. The concurrency obligations S1-S7 in this
 * file's documentation are part of the contract, and
 * `jobRunStoreContractCases()` from the `./testing` subpath checks them.
 */
export interface JobRunStore {
  /** Atomically take the overlap key. `null` means another run holds it. */
  claim(request: JobRunClaimRequest): Promise<JobRunClaim | null>;
  /** `false` means the run is no longer RUNNING and the claim is gone. */
  heartbeat(request: JobRunHeartbeatRequest): Promise<boolean>;
  /** `false` means the run was already settled; the stored outcome is unchanged. */
  complete(request: JobRunCompleteRequest): Promise<boolean>;
  /** Record a run that never executed. Returns the new run's id. */
  recordSkipped(request: JobRunSkippedRequest): Promise<JobRunClaim>;
  /** Abandon stale RUNNING rows as TIMED_OUT. Returns how many this call moved. */
  reapStale(request: JobRunReapRequest): Promise<number>;
}
```

#### 3.2.1 저장소가 지는 의무 (S1–S7) — 구현이 반드시 보장할 것

| # | 의무 | 정확한 뜻 | 준수 구현의 형태 |
|---|---|---|---|
| **S1** | **단일 claim (single-claimer)** | 같은 `overlapKey`에 대해 어느 순간에도 `RUNNING` 행은 **최대 1개**다. `claim`은 원자적 CAS여야 하며, "조회 후 없으면 삽입"으로 흉내 낼 수 없다. 경쟁에서 진 호출은 예외가 아니라 `null`을 돌려준다. **`null`로 바꿔도 되는 예외는 overlap 유니크 제약 위반 단 하나**이고, 그 밖의 제약 위반·연결 오류·직렬화 실패는 **반드시 다시 던진다**(러너가 `ERR_JOB_STORE` → 503으로 올린다) | `overlapKey`에 대한 **부분 유니크 인덱스**(`WHERE status='RUNNING'`) + 단일 `INSERT`. 위반을 잡을 때는 **제약을 지목해서** 좁힌다 — Prisma라면 `e.code === 'P2002' && e.meta?.target === 'job_run_overlap_key_running_idx'`. `P2002` 전체를 삼키면 아래 함정에 걸린다. Postgres 부분 유니크는 Prisma 스키마로 표현 불가라 raw 마이그레이션이 필요하다(소스가 실제로 그렇게 했다 `[소스 migration.sql:39]`) |
| **S2** | **단조 하트비트 (monotonic heartbeat)** | `heartbeat`은 대상 행이 `RUNNING`일 때만 liveness 워터마크를 **저장소 자기 시계의 현재 값으로 전진**시키고 `true`를 반환한다. 워터마크는 어떤 경우에도 **뒤로 가지 않는다**(DB 시계가 NTP step으로 되돌아가도). 대상 행이 `RUNNING`이 아니면 **아무것도 쓰지 않고** `false`를 반환한다 | `UPDATE … SET heartbeat_at = GREATEST(heartbeat_at, now()), summary = COALESCE($progress, summary) WHERE id = $id AND status = 'RUNNING'` — 영향 행 수가 곧 반환값이다. `now()`는 저장소의 시계다(S6) |
| **S3** | **멱등 완료 (idempotent completion)** | `complete`는 `RUNNING → terminal` 전이일 때만 쓰고 `true`를 반환한다. 이미 종료 상태인 행에는 **무엇도 쓰지 않고** `false`를 반환한다. 종료 상태는 최종이다 | `UPDATE … WHERE id = $id AND status = 'RUNNING'`. 이 한 줄이 §0.3-③(reaper와 마감의 경합)을 구조적으로 끝낸다 |
| **S4** | **원자적 reap** | `reapStale`은 워터마크가 `staleAfterMs`보다 오래된 `RUNNING` 행(선택적으로 `jobKey`·`overlapKey`로 좁힌 것)을 `TIMED_OUT`으로 **한 문장에** 전이시키고, **자신이 실제로 전이시킨 행 수만** 반환한다. 두 인스턴스가 동시에 reap해도 합계가 실제 행 수를 넘지 않는다. 전이 즉시 overlap key가 풀려야 한다 | PostgreSQL의 `UPDATE`에는 `LIMIT` 절이 **없다**. 서브쿼리로 고른다:<br>`UPDATE job_run SET status='TIMED_OUT', finished_at=now() WHERE id IN (SELECT id FROM job_run WHERE status='RUNNING' AND heartbeat_at < now() - ($staleAfterMs * interval '1 millisecond') [AND job_key=$jobKey] [AND overlap_key=$overlapKey] ORDER BY heartbeat_at LIMIT $limit FOR UPDATE SKIP LOCKED)` — 반환은 영향 행 수. `SKIP LOCKED`가 없으면 두 reaper가 같은 행을 기다렸다 각자 1을 세어 합계가 실제 행 수를 넘고, `SELECT` 후 별도 `UPDATE`로 나누면 "한 문장에"와 "실제로 전이시킨 행 수만"이 동시에 깨진다 |
| **S5** | **run id 유일성·안정성** | `claim`·`recordSkipped`가 돌려주는 `runId`는 전역 유일하고 행 수명 동안 불변이다 | PK(cuid/uuid). 러너는 이 값 외에 행을 식별하는 수단을 갖지 않는다 |
| **S6** | **시간축 분리 (clock axis split)** | 두 종류의 시각을 **다른 축**에 둔다. ⑴ **기록·표시용** — `startedAt`·`at`·`finishedAt`(epoch ms)은 러너의 주입 시계에서 온 값이고, 저장소는 이를 **그대로** 보존하며 자기 `now()`로 대체하지 않는다. ⑵ **liveness 판정용** — heartbeat 워터마크와 stale 컷오프는 **저장소 자기 시계**만 쓴다. `claim`은 행을 만들 때 워터마크를 자기 `now()`로 **반드시 초기화한다**(NULL 금지 — NULL이면 `heartbeat_at < 컷오프`가 NULL로 평가돼 그 행은 영원히 reap되지 않고 overlap key를 영구 점유한다). `heartbeat`이 자기 `now()`로 전진시키고, `reapStale`이 자기 `now() - staleAfterMs`로 비교한다. 러너는 이 축의 값을 만들지도 읽지도 않는다 | 기록용은 파라미터 바인딩(`to_timestamp($startedAt / 1000.0)`), liveness용은 `heartbeat_at timestamptz NOT NULL DEFAULT now()` + `now()` 비교. 인스턴스가 N개면 프로세스 시계도 N개이고, 어느 것도 **다른 인스턴스가 쓴 워터마크와 같은 축이 아니다** — "두 번 실행"을 가르는 비교식은 모두가 공유하는 시계 하나 위에 있어야 한다. `durationMs`는 러너가 자기 축 안에서만 계산하므로 축을 섞지 않는다 |
| **S7** | **입력·요약 왕복** | `input`·`summary`는 JSON 왕복 가능한 값으로 저장되고, 저장 실패(직렬화 불가 등)는 **예외로 알린다** — 조용히 버리지 않는다 | `jsonb` 컬럼. 순환 참조 등은 호스트가 판단 |

**S1에 붙는 함정 하나를 이름으로 부른다 — 과잉 유니크 인덱스.** "overlapKey에 유니크"라는 지시를 받은 호스트는 Prisma가 **표현할 수 있는** 것을 쓴다: `@@unique([overlapKey])`. 부분 조건이 빠진 이 인덱스에서는 첫 run이 종료된 뒤에도 그 행이 key를 영구 점유하고, 이후 모든 `claim`이 유니크 위반을 낸다. 위반을 제약 이름으로 좁히지 않고 삼키는 구현(§0.3의 소스가 그랬듯 `P2002` 전체 매칭)에서는 그 위반이 전부 `null` = SKIPPED가 되고, SKIPPED는 HTTP 200 · CLI exit 0 · 스케줄러 성공이다(§3.9.4·§3.9.5). **잡은 다시는 실행되지 않는데 모든 관측 표면이 초록이다.** 그래서 세 곳에 방어를 나눠 건다: ⑴ S1이 `null` 변환 범위를 overlap 제약 하나로 못 박고, ⑵ 러너가 **모든 SKIPPED에 경고 로그**를 남겨(경쟁 중인 key를 필드로) 영구 스킵이 관측 가능하게 하고, ⑶ 적합성 케이스 S1의 실패 메시지가 두 원인(부분 유니크 인덱스 없음 / 인덱스가 부분이 아님)을 **둘 다** 지목한다(§5.4·§7-3·§7-16).

#### 3.2.2 러너가 지는 의무 — 저장소가 **하지 않아도 되는** 것

저장소 구현자가 과잉 구현하지 않도록 경계를 명시한다.

- **overlap key 파생**: `forbid` → `job.key`, `allow` → `${job.key}#${newId()}`. 저장소는 이 규칙을 모른다.
- **reap 범위 선택**: `staleAfterMs`(= `staleRunAfterMs`)와 `limit`을 정하고, `forbid` 잡이면 `overlapKey`로 · `allow` 잡이면 `jobKey`로 좁힌다(`allow`의 key는 매 run 새로 만들어지므로 key로 좁히면 어떤 행도 못 잡는다 — §3.4.1-3). 저장소는 **컷오프 시각을 받지 않는다**(S6).
- **claim 시점 결정**: 입력 검증 → (선택) reap → claim 순서, 그리고 "검증 실패 시 행을 만들지 않는다"는 규칙.
- **하트비트 스케줄링과 실패 누적 감시**: 주기 타이머, `heartbeat`이 `false`면 즉시 abort, 그리고 **마지막으로 성공한 하트비트 이후 `staleRunAfterMs`가 지나면** 예외였든 `false`였든 가리지 않고 abort — 그 시점부터는 다른 인스턴스가 이 행을 reap할 자격이 있기 때문이다(§3.4.1-5).
- **타임아웃 판정과 종료 상태 선택**: `SUCCEEDED | FAILED | TIMED_OUT` 중 무엇으로 마감할지, `ok:false` 해석, `durationMs` 계산, 에러 텍스트 절단(기본 4000자). 분류는 **`signal.reason`으로만** 한다(§3.4.1-6).
- **정확히 한 번의 `complete`**: claim 하나당 종료 호출 1회. 저장소는 그것을 신뢰하지 않아도 되지만(S3이 방어한다), 러너는 그것을 어기지 않는다.
- **`complete` 실패의 처리와 그 사실의 보고**: 실패는 잡의 성패를 덮어쓰지 않고, 남은 `RUNNING` 행은 다음 reap이 마감한다. 다만 로그로만 끝내지 않고 반환값의 `recorded`에 실어 **호출자가 알 수 있게** 한다(§3.4).
- **모든 SKIPPED의 경고 로그**: SKIPPED는 성공 코드로 나가므로, 경쟁 중인 overlap key를 필드에 실은 경고가 유일한 관측 지점이다(§3.2.1 함정 문단).

#### 3.2.3 reap가 사는 대가 — 단일 실행 보장의 정확한 한계

**reap는 liveness를 위해 safety를 일부 판다.** 인스턴스가 SIGKILL로 죽으면 `RUNNING` 행이 영원히 남아 그 잡이 다시는 실행되지 않으므로, 라이브러리는 5분(기본) 하트비트 공백 뒤 그 행을 마감한다. 그러나 그 프로세스가 **죽지 않고 멈춰 있었을** 뿐이라면(장시간 GC, 네트워크 정지, 컨테이너 스로틀링) key가 풀린 뒤 두 번째 실행이 시작되고, 두 본문이 동시에 돈다.

라이브러리가 이 창을 좁히는 방법 4종과, 남는 것:

1. `staleRunAfterMs`(기본 300_000)가 `heartbeatIntervalMs`(기본 30_000)의 **10배**다 — 한 번의 하트비트 실패로는 절대 reap되지 않는다.
2. 하트비트가 `false`를 반환하면 러너가 즉시 `signal`을 abort하고 `ERR_JOB_ABORTED`로 마감한다.
3. **저장소가 아예 응답하지 않아도 같은 abort가 걸린다.** 이것이 없으면 완화책 2는 가장 필요한 순간에 꺼져 있다 — 워터마크가 멈추는 가장 흔한 원인이 바로 저장소 장애이고, 그 상태에서는 `false`를 받을 통로 자체가 없기 때문이다. 그래서 러너는 **마지막으로 성공한 하트비트 시각**을 들고 있다가 `clock.now() - lastOkHeartbeatAt >= staleRunAfterMs`가 되면 예외/`false`를 구분하지 않고 abort한다. 판정 기준이 다른 인스턴스의 reap 자격과 같은 값(`staleRunAfterMs`)이므로, 밀려나는 시점과 스스로 멈추는 시점이 설계상 같은 순간이다.
4. S3(멱등 완료)이 되살아난 실행의 마감 쓰기를 무효화한다 — 기록은 오염되지 않고, 그 사실이 반환값의 `recorded: 'superseded'`로 호출자에게도 보인다(§3.4).
5. **남는 것**: 두 본문의 부수효과가 겹치는 창. 상한은 **1 하트비트 주기 + 잡의 abort 반응 시간**이되, 저장소가 계속 죽어 있는 동안에는 완화책 3이 잡아 주는 **`staleRunAfterMs` + abort 반응 시간**이 상한이다(기본 300초 — 잡 타임아웃 600초보다는 짧다). 이 창을 0으로 만들 수 있는 것은 잡 자신의 도메인 레벨 멱등성뿐이다. README와 `OperationsJob.overlapPolicy`의 JSDoc이 이 문장을 그대로 싣는다. §7-1.

**시간축에 대해 한 가지 더.** 이 창의 계산이 성립하려면 워터마크와 컷오프가 **같은 시계**에서 나와야 한다. 그래서 S6이 liveness 축을 저장소 하나로 고정한다 — 러너 프로세스 시계로 컷오프를 만들면, 5분 앞선 시계를 가진 인스턴스 하나가 `execute`마다(기본 `reapScope: 'overlap-key'`는 claim 직전에 항상 reap한다) 건강한 `RUNNING` 행을 마감하고 두 번째 본문을 띄운다. 그것은 잡의 멱등성으로도 막을 수 없는 **상시** 이중 실행이고, 저장소 구현이 고칠 수도 없다(비교 대상이 호출자가 준 값뿐이므로). 남는 리스크는 저장소 시계 자체의 점프·읽기 복제본 지연이며 §7-5에 있다.

### 3.3 `./core` — 시계와 로거 (`src/core/clock.ts` · `logger.ts`)

```ts
/** Cancels a scheduled callback. Calling it twice is a no-op. */
export type JobTimerCancel = () => void;

/**
 * Injected time source. Every runner decision that depends on time — the
 * deadline, the heartbeat cadence, how long a failing heartbeat is tolerated,
 * and `durationMs` — reads this and nothing else. `now()` is epoch milliseconds
 * because that is what the store port carries, so no `Date` is ever constructed
 * outside this module. Staleness is not on this list: the cutoff belongs to the
 * store's clock, not the runner's (S6).
 * This is the only module in the package allowed to touch `Date` or timers.
 */
export interface JobClock {
  /** Epoch milliseconds. */
  now(): number;
  /** Fires once after `delayMs`. */
  after(delayMs: number, handler: () => void): JobTimerCancel;
  /** Fires repeatedly every `intervalMs`. */
  every(intervalMs: number, handler: () => void): JobTimerCancel;
}

/**
 * Node timers plus `Date.now()`. Timers are unref'd where the runtime supports
 * it, so a pending heartbeat never keeps a CLI process alive.
 */
export function systemJobClock(): JobClock;
```

`after`/`every`를 시계에 넣은 이유: vitest의 fake timer는 전역 패치라 다른 라이브러리의 타이머까지 함께 왜곡시키고, CJS/ESM 이중 로드에서 어느 쪽 전역을 패치했는지가 불확실하다. 시계 주입은 그 불확실성이 없고, `./testing`의 `fakeJobClock()`이 `advance(ms)` 한 줄로 "95초 동안 하트비트가 정확히 3번 발화했는가"를 결정적으로 검사한다(§5.1).

```ts
/**
 * Structured logging port. The argument order is fields-first, matching pino
 * and nestjs-pino, so a `PinoLogger` instance satisfies this port as-is.
 * Nest's own message-first `LoggerService` is adapted by `fromNestLogger`
 * on the `.` subpath.
 */
export interface JobLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

/** Drops everything. For tests that assert on the store rather than on logs. */
export function silentJobLogger(): JobLogger;
```

로거를 `createJobRunner`의 **required** 옵션으로 둔 이유는 §3.4의 옵션 표에 적힌 그대로다 — 하트비트 실패, reap 발생, `complete` 실패, orphan 정산은 전부 **결과에 나타나지 않고 로그에만 나타나는** 사건이다. 기본값을 무음으로 주면 이 패키지가 존재하는 이유인 관측성이 기본 설정에서 꺼진다. Nest 층은 `fromNestLogger(new Logger('OperationsJob'))`을 기본값으로 공급하므로 소비자 체감 비용은 0이다.

### 3.4 `./core` — 러너 (`src/core/runner.ts`)

```ts
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_STALE_RUN_AFTER_MS = 300_000;
export const DEFAULT_ERROR_TEXT_LIMIT = 4_000;

export type JobReapScope = 'overlap-key' | 'all' | 'off';

export interface JobRunnerOptions {
  readonly registry: JobRegistryView;
  readonly store: JobRunStore;
  /** Required: a silent runner hides exactly the failures this package exists to surface. */
  readonly logger: JobLogger;
  readonly clock?: JobClock | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  /**
   * Liveness budget, defaulting to {@link DEFAULT_STALE_RUN_AFTER_MS}. Sent to
   * the store as a duration on every reap, and used as the runner's own patience
   * for failing heartbeats: once nothing has been written for this long, the run
   * aborts itself rather than wait to be reaped by another instance.
   */
  readonly staleRunAfterMs?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  /** Defaults to `'overlap-key'`: only free the key this execution is about to claim. */
  readonly reapScope?: JobReapScope | undefined;
  readonly reapLimit?: number | undefined;
  /**
   * The deploying revision or build id, recorded on every run row so a failure
   * can be tied to what was deployed. The host reads it from wherever its
   * platform publishes it; this library reads no environment variable.
   */
  readonly serviceRevision?: string | null | undefined;
  readonly errorTextLimit?: number | undefined;
  /** Run-scoped id generator for overlap suffixes. Defaults to `crypto.randomUUID`. */
  readonly newId?: (() => string) | undefined;
}

export interface JobExecuteOptions {
  /** Aborts the job in addition to the deadline — e.g. graceful shutdown. */
  readonly signal?: AbortSignal | undefined;
}

/** Whether the returned `status` and the stored row agree. */
export type JobRunRecordOutcome =
  /** The completing write was accepted: the row says exactly what `status` says. */
  | 'settled'
  /** A reaper had already finalised the row as TIMED_OUT; `status` describes this body only. */
  | 'superseded'
  /** The completing write failed. The row is still RUNNING until the next reap. */
  | 'unrecorded';

interface JobExecutionBase {
  readonly runId: string;
  readonly jobKey: string;
  readonly durationMs: number;
  /**
   * `status` is always the truth about this runner's body; this says whether the
   * stored row agrees. Anything but `'settled'` means the record is not this
   * run's to trust, and — for `'superseded'` — that a second body may be running
   * under a different `runId`.
   */
  readonly recorded: JobRunRecordOutcome;
}

export type JobExecutionResult =
  | (JobExecutionBase & { readonly status: 'SUCCEEDED'; readonly summary?: JobSummary | undefined })
  | (JobExecutionBase & {
      readonly status: 'FAILED';
      readonly summary?: JobSummary | undefined;
      readonly error: OperationsJobsError;
    })
  | (JobExecutionBase & { readonly status: 'TIMED_OUT'; readonly error: OperationsJobsError })
  | (JobExecutionBase & { readonly status: 'SKIPPED'; readonly reason: JobSkipReason });

export interface JobRunner {
  /**
   * Run one job end to end.
   *
   * Throws only when this runner will not finalise a row: unknown key
   * (`ERR_JOB_UNKNOWN`), rejected input (`ERR_JOB_INPUT_INVALID` /
   * `ERR_JOB_INPUT_UNEXPECTED`) or a store failure while claiming
   * (`ERR_JOB_STORE`). The first two leave no row at all; a claim that committed
   * before its response was lost can leave an orphan RUNNING row that the next
   * reap settles. Every outcome that ran the body — including failure and
   * timeout — is returned, never thrown, with `recorded` saying whether the
   * stored row agrees with the returned `status`.
   */
  execute(jobKey: string, body: unknown, trigger: JobTrigger, options?: JobExecuteOptions): Promise<JobExecutionResult>;
  /**
   * Abandon stale RUNNING rows across every key, using the runner's
   * `staleRunAfterMs`. For a host-owned sweeper job: `execute` only reaps around
   * the key it is about to claim, so a job that is never triggered again needs
   * this to release its orphaned rows.
   */
  reapStaleRuns(options?: { readonly limit?: number | undefined }): Promise<number>;
}

export function createJobRunner(options: JobRunnerOptions): JobRunner;

/** Narrow a result to the success branch, throwing the recorded failure otherwise. */
export function assertJobSucceeded(
  result: JobExecutionResult,
): asserts result is Extract<JobExecutionResult, { status: 'SUCCEEDED' }>;
```

#### 3.4.1 파이프라인 (확정 순서)

1. **조회** — `registry.get(jobKey)`. 없으면 `ERR_JOB_UNKNOWN` throw. *(기록 없음)*
2. **입력 검증** — `inputSchema` 없음 + 비어 있지 않은 body → `ERR_JOB_INPUT_UNEXPECTED`. 있음 → 빈 body(`undefined`·`null`·`{}`)를 `{}`로 정규화한 뒤 `parse`. `parse`가 던지면 `ERR_JOB_INPUT_INVALID`(원인은 `cause`에 보존, HTTP 응답에는 코드만 나간다 — §0.2-⑪). *(기록 없음 — 소스 동작 유지 `[소스]`)*
3. **reap** — `reapScope`가 `'off'`면 건너뛴다. 그 외에는 항상 `staleAfterMs = staleRunAfterMs`와 `limit = reapLimit`을 보내고, 범위만 달라진다: `'overlap-key'`(기본)는 `forbid` 잡이면 `{ overlapKey }`, **`allow` 잡이면 `{ jobKey }`** — `allow`의 overlap key는 매 run 새로 만들어지므로(§3.2.2) 그 key로 좁히면 존재하지 않는 행을 찾게 되고, 죽은 `allow` run의 행은 어떤 트리거로도 마감되지 않는다. `'all'`은 범위 인자 없이 보낸다. 실패는 로그만 남기고 진행한다(reap은 안전망이지 전제가 아니다).
4. **claim** — `overlapPolicy`로 key를 정하고 `store.claim`. `null`이면 **경고 로그 1건**(경쟁 중인 `overlapKey`를 필드에 실어 — SKIPPED는 성공 코드로 나가므로 이 로그가 유일한 관측 지점이다, §3.2.1) 후 `store.recordSkipped` → `SKIPPED` 반환. 저장소 예외는 `ERR_JOB_STORE`로 감싸 throw. *(SKIPPED는 기록 있음. throw 쪽은 대개 기록이 없지만, INSERT가 커밋된 뒤 연결이 끊기면 본문을 한 줄도 돌리지 않은 고아 `RUNNING` 행이 남아 `staleRunAfterMs` 동안 key를 쥔다 — 그동안의 재시도는 SKIPPED/200이다. 러너가 그 행의 id를 모르므로 여기서 할 수 있는 일은 없고, §1-4의 문구와 §7-14가 이 창을 명시한다.)*
5. **실행** — 아래 5요소를 세운다.
   - `AbortController`. `options.signal`이 있으면 `addEventListener('abort', …)`로 연결하고 실행 종료 시 해제한다(리스너 누수 금지).
   - 마감 타이머: `clock.after(timeoutMs, …)` → `abort(ERR_JOB_TIMEOUT)`.
   - 하트비트 타이머: `clock.every(heartbeatIntervalMs, …)` → `store.heartbeat`. 반환 `false` → `abort(ERR_JOB_ABORTED)`. 저장소 예외 → 경고 로그. **성공한 하트비트만이 `lastOkHeartbeatAt`을 갱신하고**(초기값은 claim 성공 시각), 매 발화마다 `clock.now() - lastOkHeartbeatAt >= staleRunAfterMs`를 확인해 참이면 예외/`false`를 구분하지 않고 `abort(ERR_JOB_ABORTED)`한다 — 저장소가 죽어 있는 동안에는 `false`가 도착할 통로가 없으므로, 이 검사가 없으면 "하트비트 `false` → 즉시 abort"라는 완화책이 가장 필요한 순간에 꺼져 있다(§3.2.3-3).
   - `ctx.heartbeat` 클로저: 정산 전에는 저장소로, 정산 후에는 저장소를 건드리지 않고 `false`.
   - `Promise.race([본문, abort 프로미스])`. 본문이 동기 throw해도 같은 경로로 잡힌다.
6. **분류** — race가 정산된 뒤 **먼저 `controller.signal.aborted`를 본다**. 참이면 **던져진 값을 보지 않고** `signal.reason.code`로만 정한다: `ERR_JOB_TIMEOUT` → `TIMED_OUT`, `ERR_JOB_ABORTED` → `FAILED`. 거짓이면 본문의 결말로 정한다: 던졌으면 `FAILED`, 아니면 결과 요약이 객체가 아닐 때 `summary = undefined`로 접고 `summary.ok === false`(엄격 비교)면 `FAILED`, 그 외 `SUCCEEDED`. **던져진 값으로 분류하지 않는 이유**: `ctx.signal`을 `fetch`나 타이머에 그대로 넘긴 잡은 시한에 자기 `AbortError`로 reject하고, 그 rejection과 러너의 abort 프로미스 중 누가 race를 이기는지는 abort 리스너 등록 순서와 마이크로태스크 스케줄링이 정한다 — 러너가 소유하지 않은 상태다. 그대로 두면 **같은 타임아웃이 잡의 배선 방식에 따라 `TIMED_OUT`도 `FAILED`도 된다**(소스는 `error instanceof JobTimeoutError` 하나로만 판정했으므로 이 모호성이 없었다 `[소스 job-runner.ts:141]`). `signal.reason`은 러너가 직접 넣은 값이므로 판정이 결정적이다.
7. **마감** — 타이머 2개를 먼저 해제하고 `settled = true`로 표시한 뒤 `store.complete` 1회. 반환 `true` → `recorded: 'settled'`. `false`(이미 마감됨 = reaper 선점) → `recorded: 'superseded'` + 경고 로그. 예외 → `recorded: 'unrecorded'` + 에러 로그, 남은 `RUNNING` 행은 다음 reap이 마감한다. **어느 경우에도 `status`는 바꾸지 않는다** — `status`는 본문의 결말이고 `recorded`가 기록의 결말이다(§1-4).
8. **반환** — 판별 유니언. 어떤 경로에서도 예외로 나가지 않는다.

#### 3.4.2 시그널을 무시한 잡 — 계약과 검증

`Promise.race`가 시한에서 정산해도 본문 프로미스는 계속 산다. 이 상태(orphan)에 대한 라이브러리의 계약은 **정확히 셋**이다.

| 보장 | 근거 | 검증 |
|---|---|---|
| 마감 기록은 정확히 한 번 쓰인다 | 7단계의 단일 `complete` + S3 | unit: 시한 후 200ms에 성공 resolve하는 잡 → 행은 `TIMED_OUT`, `complete` 호출 1회 |
| orphan은 기록을 오염시킬 수 없다 | `settled` 플래그 + S2/S3 | unit: 시한 후 `ctx.heartbeat({ progress: 9 })` → `false` 반환, 저장소 호출 0회, 저장된 summary 불변 |
| orphan의 rejection이 프로세스를 죽이지 않는다 | `Promise.race`가 양쪽에 핸들러를 붙이므로 loser의 rejection은 소비된다. 추가로 러너가 본문에 진단용 `catch`를 붙여 **경고 로그**로 남긴다 | unit: 시한 후 reject하는 잡 → `process.on('unhandledRejection')` 스파이 0건 + `logger.warn` 1건(`job body settled after the run was recorded`) |

**보장하지 않는 것**: 부수효과 중단. 시그널을 읽지 않는 잡은 DB 쓰기·외부 호출을 계속한다. 이 문장은 `OperationsJobContext.signal`의 JSDoc, README의 "잡 작성 규칙", 그리고 위 표의 테스트 이름 세 곳에 동일하게 존재한다.

### 3.5 `./core` — 레지스트리 (`src/core/registry.ts`)

```ts
/** Read side used by the runner and by catalog projections. */
export interface JobRegistryView {
  get(key: string): AnyOperationsJob | undefined;
  /** Sorted by key, so catalogs and admin listings are stable. */
  list(): readonly AnyOperationsJob[];
}

export interface JobRegistry extends JobRegistryView {
  /** Rejects malformed keys, duplicate keys and malformed schedule metadata. */
  register(job: AnyOperationsJob): void;
}

/** `domain.action`: lower-case alphanumerics and hyphens on both sides of one dot. */
export const JOB_KEY_PATTERN: RegExp;
export const MAX_JOB_KEY_LENGTH = 100;

export function isJobKey(value: unknown): value is string;

/** Throws `ERR_JOB_SCHEDULE_INVALID` for a malformed cron shape or unknown IANA zone. */
export function assertJobSchedule(schedule: JobSchedule, jobKey: string): void;

export function createJobRegistry(jobs?: Iterable<AnyOperationsJob>): JobRegistry;
```

`register`의 거부 조건 전수: 키 형식 위반(`ERR_JOB_KEY_INVALID`), 길이 초과(동), 중복 키(`ERR_JOB_DUPLICATE_KEY`), `run`이 함수가 아님(`ERR_JOB_INVALID`), `timeoutMs`가 양의 유한수가 아님(동), `schedule`의 cron 필드 수가 5·6이 아니거나 시간대 이름을 `Intl`이 거부(`ERR_JOB_SCHEDULE_INVALID`). 전부 **부팅 실패**로 이어진다(§1-5). cron은 형태만 본다 — 의미 파싱은 스케줄러 소유이고, 여기서 잡으려는 것은 `"0 9 * * *"`를 `"0 9 * *"`로 적는 종류의 오타다.

### 3.6 `./core` — 카탈로그와 스케줄러 타깃 (`src/core/catalog.ts`)

`sync-scheduler.mjs`에서 **일반적인 부분만** 승격한 결과다(§0.4-③·§6-1). 전부 순수 함수 — I/O도, 자식 프로세스도, 클라우드 개념도 없다.

```ts
export interface JobCatalogEntry {
  readonly key: string;
  readonly description: string;
  readonly schedule: JobSchedule | null;
  readonly schedulerHttpSync: boolean;
  readonly overlapPolicy: JobOverlapPolicy;
  /** Effective timeout: the job's own value or the supplied default. */
  readonly timeoutMs: number;
  readonly acceptsInput: boolean;
}

/** Project registered jobs into the stable shape an admin API or sync tool consumes. */
export function jobCatalog(
  jobs: Iterable<AnyOperationsJob>,
  options?: { readonly defaultTimeoutMs?: number | undefined },
): readonly JobCatalogEntry[];

export interface SchedulerHttpTarget {
  readonly key: string;
  readonly description: string;
  /** `${baseUrl}/${routePrefix}/${key}/run` with duplicate slashes collapsed. */
  readonly uri: string;
  readonly httpMethod: 'POST';
  readonly cron: string;
  readonly timeZone: string;
  /** `min(ceil(timeoutMs / 1000) + margin, max)` — the job must finish first. */
  readonly attemptDeadlineSeconds: number;
}

export interface SchedulerHttpTargetOptions {
  /** Absolute http(s) origin, no trailing slash required. */
  readonly baseUrl: string;
  /** Defaults to `'internal/jobs'`; must match the trigger controller's path. */
  readonly routePrefix?: string | undefined;
  /** Defaults to 60_000. Head room between the job deadline and the HTTP deadline. */
  readonly attemptDeadlineMarginMs?: number | undefined;
  /** Defaults to 1_800 — Google Cloud Scheduler's documented maximum, in seconds. */
  readonly maxAttemptDeadlineSeconds?: number | undefined;
}

/** Entries with a schedule and `schedulerHttpSync !== false`, in catalog order. */
export function schedulerHttpTargets(
  catalog: Iterable<JobCatalogEntry>,
  options: SchedulerHttpTargetOptions,
): readonly SchedulerHttpTarget[];

/** `'storage.recurring-billing'` -> `'storage-recurring-billing'`. Prefix it yourself. */
export function jobKeySlug(key: string): string;

/** `'internal/jobs/storage.recurring-billing/run'`. */
export function jobTriggerPath(key: string, routePrefix?: string): string;
```

`schedulerHttpTargets`가 **잡 이름을 만들지 않는** 이유: 소스의 `memorylog-job-` 접두는 제품의 명명 규약이고, 이름 충돌은 클라우드 계정 전체에 걸친 문제다. 라이브러리가 이름을 정하면 두 서비스가 같은 라이브러리를 쓸 때 충돌한다. 슬러그 함수만 주고 접두는 호스트가 붙인다.

`maxAttemptDeadlineSeconds`의 기본값 1800은 GCP 숫자다 `[소스 sync-scheduler.mjs:attemptDeadline]`. 라이브러리가 GCP를 알아서가 아니라 **가장 흔한 상한이 기본값이면 편하기 때문**이며, 다른 스케줄러를 쓰는 호스트는 인자로 덮는다.

**"유일한 클라우드 흔적"이라고는 쓰지 않는다 — 목록으로 적는다.** 초안은 이 숫자를 유일한 흔적이라고 주장했지만 §3.9.4의 컨트롤러가 GCP 헤더를 기본값으로 읽고 있었으므로 그 주장은 거짓이었다. 남는 흔적의 전수는 **둘**이며, 하나는 덮을 수 있는 기본값이고 하나는 호스트가 켜야 켜지는 예시다:

| 흔적 | 위치 | 성격 |
|---|---|---|
| `maxAttemptDeadlineSeconds` 기본값 `1_800` | `src/core/catalog.ts` | Cloud Scheduler의 문서화된 상한. 다른 스케줄러 호스트는 인자로 덮는다 |
| `triggeredByHeader`의 **권장값** `'x-cloudscheduler-jobname'` | `src/nest/controller.ts`의 JSDoc 예시 — **기본값 아님**(§0.2-⑯) | 옵트인. 호스트가 넘기지 않으면 어떤 헤더도 읽지 않는다 |

어휘(`SchedulerHttpTarget`·`attemptDeadlineSeconds`·`httpMethod: 'POST'`)와 `keywords`의 `cloud-scheduler`는 흔적이 아니라 **이 표면이 겨냥하는 소비자를 말하는 이름**이다. 다만 §5.3의 no-product-strings 가드가 `cloudscheduler`를 세어 두 번째 헤더 이름이 조용히 늘어나지 못하게 상한을 건다.

### 3.7 `./core` — 인증 원시 함수와 verifier 포트 (`src/core/auth.ts`)

```ts
/** Extract the token from an `Authorization: Bearer <token>` header value. */
export function bearerToken(header: string | readonly string[] | null | undefined): string | undefined;

/**
 * Constant-time secret comparison.
 *
 * Both sides are SHA-256 hashed first, so the comparison cost never depends on
 * input length and a mismatched length cannot be observed through timing.
 * Non-string inputs return false.
 */
export function timingSafeSecretMatch(expected: string, presented: string): boolean;

/**
 * Cheap structural check for a compact JWS: three non-empty base64url segments.
 * Used to keep a mistyped shared secret from reaching a network verifier, which
 * would otherwise turn every bad request into an outbound token-info call.
 * It proves nothing about signature, issuer, audience or expiry.
 */
export function looksLikeJwt(token: string): boolean;

export interface JobTriggerIdentity {
  readonly method: 'secret' | 'token';
  /** Who the token proved the caller to be, e.g. a service account email. */
  readonly subject?: string | undefined;
}

/**
 * Host-provided token verification. The library ships no cloud SDK: an adapter
 * over `google-auth-library`'s `verifyIdToken` (Cloud Scheduler OIDC), a JWKS
 * client or an internal mTLS-derived identity all satisfy this port.
 *
 * Return `null` for "not authenticated". Throwing is reserved for verifier
 * outages, which the guard reports as 503 rather than 401.
 */
export interface JobTriggerTokenVerifier {
  verify(token: string): Promise<JobTriggerIdentity | null>;
}

export interface JobTriggerAuthOptions {
  /** Shared secret. At least 32 characters; shorter values are a construction error. */
  readonly secret?: string | undefined;
  readonly tokenVerifier?: JobTriggerTokenVerifier | undefined;
}

/**
 * Build the authenticator the guard delegates to.
 *
 * Throws `ERR_JOB_AUTH_MISCONFIGURED` when neither a secret nor a verifier is
 * supplied — an unauthenticated job trigger is never a valid configuration, and
 * this fails at wiring time rather than on the scheduler's first call.
 */
export function createJobTriggerAuthenticator(
  options: JobTriggerAuthOptions,
): (header: string | readonly string[] | null | undefined) => Promise<JobTriggerIdentity>;
```

**인증 순서 (확정)**: 헤더 → `bearerToken` (없으면 401) → 시크릿이 설정돼 있으면 `timingSafeSecretMatch` (일치 시 `{ method: 'secret' }`) → 아니면 `looksLikeJwt`가 참이고 verifier가 있을 때만 `verifier.verify` (`null`이 아니면 `{ method: 'token', subject }`) → 그 외 전부 401.

- **실패 메시지는 모든 분기에서 동일한 고정 문자열**이다 — 어느 검사에서 떨어졌는지 알려주지 않는다.
- **verifier는 JWT 형태일 때만 호출된다.** 오입력 시크릿이 매 요청 아웃바운드 검증을 유발하는 증폭 경로를 없앤다(소스가 이미 이 사전 검사를 갖고 있었다 `[소스 scheduler-oidc.verifier.ts:35]` — 3세그먼트 검사만 있던 것을 base64url 문자셋·빈 세그먼트까지 확장한다).
- **32자 하한**은 소스에 없던 규칙이다(§0.2 밖의 추가 — §7-4에 리스크로 올린다). 짧은 시크릿은 이 표면에서 가장 흔한 실질적 취약점이고, 조립 시점 에러는 remedy가 명확하다.

**README가 싣는 OIDC 어댑터**(라이브러리 밖, ~20줄):

```ts
import type { JobTriggerIdentity, JobTriggerTokenVerifier } from '@gj-kit/nest-operations-jobs/core';

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

이 블록은 `check:readme`가 **실제로 컴파일한다**(§5.6) — `declare const`가 어댑터의 형태를 고정하므로, 포트 시그니처가 바뀌면 README가 깨진다.

### 3.8 `./core` — 에러 (`src/core/errors.ts`)

```ts
export type OperationsJobsErrorCode =
  | 'ERR_JOB_UNKNOWN'              // no job registered under this key
  | 'ERR_JOB_REGISTRY_NOT_READY'   // jobs are still being collected (Nest bootstrap)
  | 'ERR_JOB_KEY_INVALID'          // malformed or over-long key (boot)
  | 'ERR_JOB_DUPLICATE_KEY'        // two jobs claim the same key (boot)
  | 'ERR_JOB_INVALID'              // malformed job object (boot)
  | 'ERR_JOB_SCHEDULE_INVALID'     // malformed cron shape or unknown time zone (boot)
  | 'ERR_JOB_INPUT_INVALID'        // the job's validator rejected the body
  | 'ERR_JOB_INPUT_UNEXPECTED'     // a body was sent to a job that takes none
  | 'ERR_JOB_TIMEOUT'              // the deadline passed
  | 'ERR_JOB_ABORTED'              // claim lost or unverifiable, or the caller's signal aborted
  | 'ERR_JOB_FAILED'               // the body threw, or reported `ok: false`
  | 'ERR_JOB_STORE'                // the run store failed
  | 'ERR_JOB_UNAUTHORIZED'         // trigger authentication failed
  | 'ERR_JOB_AUTH_MISCONFIGURED';  // no authentication configured (wiring)

export interface OperationsJobsErrorContext {
  readonly jobKey?: string | undefined;
  readonly runId?: string | undefined;
}

export class OperationsJobsError extends Error {
  readonly code: OperationsJobsErrorCode;
  readonly jobKey?: string | undefined;
  readonly runId?: string | undefined;
  constructor(
    code: OperationsJobsErrorCode,
    message: string,
    options?: OperationsJobsErrorContext & { readonly cause?: unknown },
  );
}

/**
 * Prefer this over `instanceof`: a CJS consumer can load `.` and `./core` as two
 * module instances, and `instanceof` across them is false for the same error.
 */
export function isOperationsJobsError(value: unknown): value is OperationsJobsError;
```

`message`에는 잡 키와 사유만 담는다. 소비자 데이터·스택·검증 라이브러리 원문은 `cause`에만 있고, HTTP 응답에는 `code`만 나간다(§0.2-⑪). AGENTS.md §2 — raw public error에 소비자 데이터 노출 금지.

### 3.9 `.` — NestJS 표면

#### 3.9.1 DI 토큰과 데코레이터 (`src/nest/inject.ts` · `decorator.ts`)

```ts
/** `Symbol.for` so ESM/CJS dual loads resolve to the same token (sibling precedent). */
export const JOB_RUNNER: unique symbol;
export const JOB_REGISTRY: unique symbol;
export const JOB_RUN_STORE: unique symbol;
export const JOB_CLOCK: unique symbol;
export const JOB_TRIGGER_AUTHENTICATOR: unique symbol;

export const InjectJobRunner: () => ParameterDecorator;
export const InjectJobRegistry: () => ParameterDecorator;
export const InjectJobRunStore: () => ParameterDecorator;

/**
 * Marks an `@Injectable()` provider as an operations job. The registry collects
 * it at bootstrap through `DiscoveryService`; no extra wiring per job.
 */
export function OperationsJobDefinition(): ClassDecorator;

/** Reflector metadata key. A plain string, so a dual-loaded copy still matches. */
export const OPERATIONS_JOB_METADATA = '@gj-kit/nest-operations-jobs:job';
```

토큰은 `Symbol.for`(형제 `toss-payments-nestjs/src/inject.ts` 근거 그대로 `[형제]`), 메타데이터 키는 **문자열**이다 — `Reflector.get`은 키의 값 동등성으로 동작하므로 문자열이면 이중 로드에서도 일치하고, `Symbol.for`보다 스택트레이스·디버깅에서 읽기 쉽다. 이 비대칭은 의도적이며 JSDoc에 그 이유를 적는다.

#### 3.9.2 모듈 (`src/nest/module.ts`)

```ts
export interface OperationsJobsModuleOptions {
  readonly store: JobRunStore;
  /** Required. Wiring a trigger surface with no authentication is a boot error. */
  readonly auth: JobTriggerAuthOptions;
  /**
   * Registers the trigger controller at this path (e.g. `'internal/jobs'`).
   * Omit it for CLI-only hosts or hosts that expose their own controllers.
   */
  readonly trigger?: { readonly path: string } | undefined;
  /** Defaults to the Nest logger under the `OperationsJob` context. */
  readonly logger?: JobLogger | undefined;
  readonly clock?: JobClock | undefined;
  readonly heartbeatIntervalMs?: number | undefined;
  readonly staleRunAfterMs?: number | undefined;
  readonly defaultTimeoutMs?: number | undefined;
  readonly reapScope?: JobReapScope | undefined;
  readonly serviceRevision?: string | null | undefined;
  /** Defaults to true — one runner per application is the natural unit. */
  readonly global?: boolean | undefined;
}

export interface OperationsJobsModuleAsyncOptions {
  readonly imports?: DynamicModule['imports'] | undefined;
  readonly inject?: readonly InjectionToken[] | undefined;
  readonly useFactory: (...deps: readonly any[]) => OperationsJobsModuleOptions | Promise<OperationsJobsModuleOptions>;
  readonly global?: boolean | undefined;
}

export class OperationsJobsModule {
  static forRoot(options: OperationsJobsModuleOptions): DynamicModule;
  static forRootAsync(options: OperationsJobsModuleAsyncOptions): DynamicModule;
}

/** Adapts Nest's `LoggerService` (message-first) to the `JobLogger` port (fields-first). */
export function fromNestLogger(logger: LoggerService, context?: string): JobLogger;
```

모듈은 `DiscoveryModule`을 import하고 `JOB_REGISTRY`·`JOB_RUNNER`·`JOB_RUN_STORE`·`JOB_TRIGGER_AUTHENTICATOR`를 바인딩한다. `trigger`가 있으면 `createOperationsJobsController({ path })`의 산출 클래스를 `controllers`에 넣는다. **`forRootAsync`에서도 `auth` 검증은 팩토리 실행 직후 즉시 수행된다** — 부팅 실패라는 성질이 async 경로에서 사라지면 §1-5가 무너진다.

#### 3.9.3 레지스트리 프로바이더 (`src/nest/registry.provider.ts`)

`OnApplicationBootstrap`에서 `discovery.getProviders()`를 훑어 `reflector.get(OPERATIONS_JOB_METADATA, wrapper.metatype) === true`인 것을 모아 `createJobRegistry()`에 넣는다. 소스 대비 추가되는 세 규칙(§0.3-⑤):

1. `wrapper.metatype`·`wrapper.instance`가 없으면 건너뛴다(소스 동일).
2. `wrapper.isDependencyTreeStatic() === false`(request/transient 스코프)면 **부팅 실패** — 스코프드 잡은 인스턴스가 부팅 시점에 존재하지 않으므로 조용히 건너뛰면 "등록했는데 404"가 된다. 에러 메시지가 클래스 이름과 해결책(`@Injectable()` 기본 스코프로 되돌리기)을 말한다.
3. **인스턴스 동일성 dedupe** — 같은 인스턴스가 여러 모듈 래퍼로 나타나면 1회만 등록한다. 서로 **다른** 인스턴스가 같은 키를 주장하면 그때는 `ERR_JOB_DUPLICATE_KEY`이며, 메시지가 두 클래스 이름을 모두 싣는다.

**코어와 Nest 사이의 생명주기 이음매를 명시한다** — `createJobRunner()`는 프로바이더 생성 시점에 `registry`를 받는데 수집은 그보다 늦은 `OnApplicationBootstrap`에서 끝나므로, 둘 중 어느 배선인지가 관측 가능한 차이를 만든다. 확정: **모듈이 프로바이더 시점에 빈 `JobRegistry` 하나를 만들고, 그 인스턴스를 `createJobRunner`에 그대로 넘긴 뒤, 부트스트랩 훅에서 채운다.** 러너를 부트스트랩 훅 안에서 만들면 `JOB_RUNNER`를 주입받는 다른 프로바이더가 생성될 수 없기 때문이다. 대신 `JOB_REGISTRY`로 공개되는 값과 러너가 보는 값은 **수집 완료 전까지 `get`/`list`가 `ERR_JOB_REGISTRY_NOT_READY`를 던지는 뷰**다 — 다른 프로바이더의 `onModuleInit`에서 `execute()`를 부르는 것은 호스트 배선 오류이고, "그 키의 잡이 없다"(`ERR_JOB_UNKNOWN`)로 보고되면 등록자가 원인을 영원히 못 찾는다. 에러 메시지가 "레지스트리가 아직 수집 중이다 — `onApplicationBootstrap` 이후에 실행하라"를 그대로 말한다.

이 배선에서 §1-5의 "중복 키는 부팅 실패"는 여전히 **부팅 실패**다: `onApplicationBootstrap`은 모든 모듈 초기화 뒤·리스닝 전에 돌므로 여기서 던지면 `app.listen()`이 해상되지 않는다. 다만 실패 시점이 프로바이더 생성이 아니라 부트스트랩 훅이라는 사실을 §5.1의 케이스가 고정한다.

#### 3.9.4 가드 · 컨트롤러 · HTTP 매핑 (`guard.ts` · `controller.ts` · `http.ts`)

```ts
/**
 * Authenticates every job trigger. Applied by the controller factory, so a
 * handler cannot forget it — the structural fix for per-handler assert calls.
 */
@Injectable()
export class OperationsJobsGuard implements CanActivate {
  canActivate(context: ExecutionContext): Promise<boolean>;
}

/**
 * Build the trigger controller. The host owns the route namespace, so the path
 * is an argument rather than a decorator constant baked into the library.
 *
 * `POST {path}/:jobKey/run` -> 200 with the execution result.
 */
export function createOperationsJobsController(options: {
  readonly path: string;
  /**
   * Request header naming the scheduler job that fired, recorded as
   * `trigger.triggeredBy`. No default: no header is read unless one is named.
   * Google Cloud Scheduler sends `'x-cloudscheduler-jobname'`.
   */
  readonly triggeredByHeader?: string | undefined;
}): Type<unknown>;

/** Single mapping table from library outcomes to HTTP. Nothing else maps status codes. */
export function toHttpException(input: OperationsJobsError | JobExecutionResult): HttpException | null;
```

| 결과 / 에러 코드 | HTTP | 스케줄러가 읽는 뜻 |
|---|---|---|
| `SUCCEEDED` | **200** + `{ runId, jobKey, status, durationMs, recorded, summary? }` | 성공 |
| `SKIPPED` | **200** + `{ runId, jobKey, status: 'SKIPPED', reason: 'overlap', recorded }` | 성공(재시도 금지 — 중복은 정상 동작이다) |
| `FAILED` | **500** + `{ runId, jobKey, status, recorded, error: { code } }` | 재시도 |
| `TIMED_OUT` | **504** + 동일 형태 | 재시도 (소스 408에서 변경 — §0.2-⑩) |
| `ERR_JOB_UNKNOWN` | 404 | 배선 오류 |
| `ERR_JOB_REGISTRY_NOT_READY` | 503 | 재시도 (부팅 중) |
| `ERR_JOB_INPUT_INVALID` · `ERR_JOB_INPUT_UNEXPECTED` | 400 | 호출자 오류 |
| `ERR_JOB_STORE` | 503 | 재시도 |
| `ERR_JOB_UNAUTHORIZED` | 401 (고정 메시지) | 설정 오류 |

**`recorded`가 본문에 항상 실린다.** 상태 코드는 `status`가 정하고(이 러너의 본문이 어떻게 끝났는가 — 그것이 스케줄러가 재시도 판단에 쓸 사실이다), 저장된 행이 그 말과 같은지는 `recorded`가 말한다. `'superseded'`인 200 응답은 "이 시도는 성공했지만 행은 reaper가 TIMED_OUT으로 마감했고 다른 `runId`로 두 번째 본문이 돌고 있을 수 있다"는 뜻이며, 그 상황에서 재시도는 도움이 되지 않으므로 코드는 200으로 둔다 — 대신 관리자 화면과 로그가 그 사실을 본다. `'unrecorded'`도 같은 원칙이다(§1-4·§3.4).

컨트롤러의 `triggeredByHeader`에는 **기본값이 없다**(§0.2-⑯). 옵션으로 헤더 이름을 넘긴 호스트만 그 헤더를 읽고, 없으면 `trigger.triggeredBy`는 `null`이다. GCP 호스트는 `'x-cloudscheduler-jobname'`을 넘긴다 — 라이브러리 기본값이 특정 클라우드의 헤더를 아는 것과, 호스트가 자기 스케줄러의 헤더를 지정하는 것은 다르다(§3.6).

#### 3.9.5 CLI (`src/nest/cli.ts`)

```ts
export const OPERATIONS_JOB_CLI_EXIT = { OK: 0, FAILED: 1, USAGE: 2 } as const;

export interface OperationsJobCliOptions {
  /**
   * The application context, or a factory that creates one. When a factory is
   * given the CLI owns `close()`; when an instance is given the caller does.
   */
  readonly context: INestApplicationContext | (() => Promise<INestApplicationContext>);
  readonly jobKey: string | undefined;
  /** Defaults to `{ source: 'CLI', triggeredBy: null }`. */
  readonly trigger?: JobTrigger | undefined;
  readonly usage?: string | undefined;
}

/**
 * Shared entry point for Cloud Run Jobs, Kubernetes CronJobs and manual runs.
 * The same runner as the HTTP trigger, so run records, overlap prevention and
 * timeouts apply identically.
 *
 * Returns the exit code instead of setting `process.exitCode`, and never calls
 * `process.exit`: the caller decides. A context the CLI created is always
 * closed, including on failure, so pooled database connections cannot leak.
 */
export function runOperationsJobCli(options: OperationsJobCliOptions): Promise<0 | 1 | 2>;
```

exit code 계약(스케줄러가 실제로 읽는다 — `test/jobs.run-job-cli.spec.ts`가 소스에서 이미 이것을 고정하고 있었다 `[소스]`): 잡 키 누락/빈 문자열 → **2**(앱을 부팅하지 않는다). `SUCCEEDED`·`SKIPPED` → **0**. `FAILED`·`TIMED_OUT`·throw → **1**. `SKIPPED`가 0인 이유는 HTTP에서 200인 이유와 같다 — 중복은 오류가 아니다. exit code는 HTTP와 같은 원칙으로 **`status`만** 본다. `recorded !== 'settled'`는 종료 코드를 바꾸지 않고 경고 로그 1건으로 나간다 — 기록이 이 실행의 것이 아니라는 사실은 운영자가 읽을 정보이지 스케줄러의 재시도 신호가 아니다(§1-4).

호스트의 진입 파일(README 레시피, 6줄):

```ts
import { NestFactory } from '@nestjs/core';
import { runOperationsJobCli } from '@gj-kit/nest-operations-jobs';

process.exitCode = await runOperationsJobCli({
  context: () => NestFactory.createApplicationContext(AppModule, { bufferLogs: true }),
  jobKey: process.argv[2],
});
```

소스가 `app.resolve(PinoLogger)`를 써야 했던 이유(transient 스코프)는 **호스트의 로거 사정**이다 `[소스 run-job.ts:29]`. 라이브러리 CLI는 컨테이너에서 `JOB_RUNNER` 하나만 꺼내므로 그 함정을 상속하지 않으며, README가 "transient 스코프 프로바이더는 `get`이 아니라 `resolve`"라는 사실을 로거 배선 절에 적는다.

### 3.10 `./testing`

```ts
export interface StoredJobRun {
  readonly runId: string;
  readonly jobKey: string;
  readonly overlapKey: string | null;
  readonly status: JobRunStatus;
  readonly trigger: JobTrigger;
  readonly input: unknown;
  readonly summary: JobSummary | undefined;
  readonly error: string | undefined;
  /** Epoch ms, exactly as the runner supplied it (S6, recording axis). */
  readonly startedAt: number;
  /**
   * Epoch ms on the **store's** clock (S6, liveness axis): set when the run is
   * claimed, advanced by every accepted heartbeat, compared by `reapStale`.
   * Never null — a null watermark is unreapable and holds the overlap key forever.
   */
  readonly heartbeatAt: number;
  /** Epoch ms. The runner's value for a completed run, the store's for a reaped one. */
  readonly finishedAt: number | undefined;
  readonly durationMs: number | undefined;
  readonly serviceRevision: string | null;
}

/**
 * In-memory `JobRunStore` honouring S1-S7. Single-process only: its atomicity
 * comes from the absence of `await` between read and write, which no networked
 * store can rely on. Never use it in production.
 */
export function memoryJobRunStore(options?: {
  readonly newId?: (() => string) | undefined;
  /**
   * The store's own clock — the liveness axis of S6. Defaults to
   * `systemJobClock()`. Pass the same `fakeJobClock` the runner uses to make
   * staleness deterministic, or a second one to simulate clock skew.
   */
  readonly clock?: JobClock | undefined;
}): JobRunStore & {
  /** Side-effect-free inspection; returns defensive copies. */
  runs(): readonly StoredJobRun[];
  runOf(runId: string): StoredJobRun | undefined;
};

/**
 * Deterministic clock. `advance` fires every timer due in the interval, in order.
 * `startMs` defaults to a fixed literal, never to `Date.now()`: this package
 * reads ambient time in `src/core/clock.ts` and nowhere else (§5.3).
 */
export function fakeJobClock(startMs?: number): JobClock & {
  advance(ms: number): Promise<void>;
  readonly pendingTimers: number;
};

export interface RecordedLogEntry {
  readonly level: 'info' | 'warn' | 'error';
  readonly fields: Record<string, unknown>;
  readonly message: string;
}

export function recordingJobLogger(): JobLogger & { readonly entries: readonly RecordedLogEntry[] };

export interface JobRunStoreContractCase {
  /** e.g. `'S1: a second claim on the same overlap key returns null'`. */
  readonly name: string;
  readonly obligation: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7';
  /** Throws with a message naming the violated obligation. */
  readonly run: (store: JobRunStore) => Promise<void>;
}

/**
 * The executable form of the S1-S7 obligations. Deliberately framework-free:
 * it returns cases instead of calling `describe`/`it`, so a host can drive them
 * from vitest, jest or `node:test` without this package depending on any of them.
 *
 * ```ts
 * for (const testCase of jobRunStoreContractCases()) {
 *   it(testCase.name, async () => { await testCase.run(await createStore()); });
 * }
 * ```
 */
export function jobRunStoreContractCases(options?: {
  /** Skip cases an implementation legitimately cannot support, with a reason. */
  readonly skip?: readonly JobRunStoreContractCase['obligation'][] | undefined;
  /**
   * Read one row back. `JobRunStore` has no reader, so the cases that can only
   * be observed through stored values — S6's recorded timestamps, S7's JSON
   * round-trip — are omitted unless a host supplies this. Everything else,
   * including all of S1-S4, is observable through the port alone.
   */
  readonly inspect?: ((runId: string) => Promise<StoredJobRun | undefined>) | undefined;
  /**
   * How many concurrent calls the S1 burst case issues. Defaults to 8. The host
   * must point this suite at a connection pool of at least 2: a single-connection
   * client serialises the burst and hides a non-atomic claim.
   */
  readonly concurrency?: number | undefined;
}): readonly JobRunStoreContractCase[];
```

`jobRunStoreContractCases()`가 이 패키지에서 가장 중요한 `./testing` 심볼이다. 스키마를 소유하지 않는 대가로 생기는 위험 — 호스트의 Prisma 구현이 계약을 어겨도 라이브러리가 모른다 — 를 **호스트의 테스트 스위트 안에서** 닫는 유일한 장치이기 때문이다. 우리 자신의 단위 테스트도 `memoryJobRunStore()`에 같은 케이스를 돌린다(§5.4).

---
## 4. 오용 차단

**검증 방법 열은 빈칸을 남기지 않는다.** 형제 문서에는 타입안전 대표 주장이 실측으로 거짓 판명된 전례가 두 건 있다 `[형제 — expo-media §0.3 V3, expo-workouts §0 V2]`. 아래는 **설계 시점의 예측**이며, `[검증필요]` 표시가 붙은 행은 구현 1단계에서 `typescript@^5` + 루트 `tsconfig.base.json` 플래그(strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)로 실제 픽스처를 돌려 확정한다. 소스가 실제로 저지른 오용(§0.3)에서 역산한 목록이다.

| # | 오용 시나리오 | 차단 장치 | 픽스처 · 검증 방법 |
|---|---|---|---|
| 1 | 저장소를 "대충" 구현 — 조회 후 삽입으로 claim | 타입으로는 불가능 → **적합성 케이스**가 런타임에 잡는다 | `jobRunStoreContractCases()` S1 버스트: 같은 overlapKey로 `Promise.all` **8회 동시** claim → 정확히 1개만 `JobRunClaim`, 7개는 `null`. **순차 2회로는 못 잡는다** — 조회 후 삽입 구현도 두 번째 호출에서 첫 RUNNING 행을 보고 `null`을 주기 때문이다. 호스트는 연결 2개 이상인 풀에 돌려야 한다(§5.4) `[검증: 구현 단계 unit]` |
| 2 | 마감된 run을 하트비트로 되살림(§0.3-②) | S2 + 러너의 `settled` 플래그 | unit: 시한 후 `ctx.heartbeat()` → `false`, 저장소 호출 0회 · 적합성 케이스 S2 |
| 3 | reaper와 러너가 같은 행을 두 번 마감(§0.3-③) | S3 (`WHERE status='RUNNING'`) | 적합성 케이스 S3: `complete` 2회 → 두 번째 `false`, 저장된 상태 불변 |
| 4 | 러너가 `Date.now()`·`process.env`를 몰래 읽음 | 가드 스캔 — `src/**`에서 `Date.now(`·`new Date(`·`setTimeout(`·`setInterval(`·`process.env`는 `src/core/clock.ts` 밖에서 금지. **포트 시각이 전부 `number`라서 변환 지점 자체가 없다**(§1-2) | `tests/unit/guards/ambient-clock.test.ts` — 소스 텍스트 + `dist/**` 양쪽 스캔. JSDoc·주석도 스캔 대상이다(§5.3) |
| 5 | 코어가 Nest를 끌고 들어옴 | peer-graph 가드 — `src/core/**` 소스와 `dist/core.{js,cjs}` 산출물에 `@nestjs`·`rxjs`·`reflect-metadata` 문자열 0 | `tests/unit/guards/peer-graph.test.ts` |
| 6 | 잡이 `run(input)`의 input을 도메인 서비스에 그대로 넘겨 `now`로 해석됨 | 타입으로 못 막는다 — **소비자 계약 테스트 레시피**가 막는다 | README + `./testing`: `billing-jobs.contract.spec.ts`가 실제로 단언하던 것(`toHaveBeenCalledWith()` 무인자)을 레시피로 문서화 `[소스]` |
| 7 | 잡 키 오타(`Storage.Recurring_Billing`) | `JOB_KEY_PATTERN` + 부팅 실패 | unit: 대문자·언더스코어·점 2개·점 0개·빈 문자열·101자 전수 거부 |
| 8 | 같은 키를 두 잡이 주장 | 부팅 실패 + 두 클래스 이름을 메시지에 노출 | unit: 서로 다른 인스턴스 2개 → `ERR_JOB_DUPLICATE_KEY`; 같은 인스턴스 2 래퍼 → 통과 |
| 9 | 인증 없이 트리거 컨트롤러를 노출 | `auth`가 required 필드 + 둘 다 비면 조립 시 throw | `@ts-expect-error`: `OperationsJobsModule.forRoot({ store })` (auth 누락) `[검증필요]` + unit: `forRoot({ store, auth: {} })` → `ERR_JOB_AUTH_MISCONFIGURED` |
| 10 | 짧은 공유 시크릿 | 32자 하한 — 조립 시 throw | unit: 31자 → throw, 32자 → 통과 |
| 11 | 오입력 시크릿이 매 요청 아웃바운드 검증 유발 | `looksLikeJwt` 사전 검사 | unit: 비-JWT 토큰 → verifier 스파이 호출 0회 |
| 12 | 실패 응답에 스택트레이스가 섞임 | `toHttpException`이 `{ code }`만 싣는다 | unit: 잡이 `new Error(secretish)` throw → 응답 본문에 그 문자열 없음, run 기록에는 있음 |
| 13 | `execute` 결과의 status를 `if (result.status === 'SUCCEEDED')`만 보고 나머지를 성공 취급 | 판별 유니언 — `summary`는 성공/실패 분기에만, `reason`은 SKIPPED에만 존재 | type: `result.reason` 접근이 SKIPPED 좁힘 없이는 컴파일 에러 `[검증필요]` · 닫힌 유니언 전수 스위치(source compatibility, AGENTS.md §2) |
| 14 | EOP 소비자가 `string \| undefined`를 옵셔널 필드에 전달 | 전 옵셔널 필드 `?: T \| undefined`(§1-8) | type: `serviceRevision: maybeRevision` 통과 `[검증필요]` |
| 15 | 소비자가 internal 모듈 deep import (`.../dist/nest/guard`) | exports 맵에 3 엔트리 + `./package.json`뿐 | `release-artifact.test.ts`가 exports 표면을 고정 |
| 16 | `.` 와 `./core`를 CJS로 동시에 require해 `instanceof`가 깨짐 | `isOperationsJobsError()` 타입 가드가 정본, README가 `instanceof`를 쓰지 않는다 | unit: 두 진입 경로에서 만든 에러가 모두 `isOperationsJobsError` 참 `[검증필요 — §2.5]` |
| 17 | 잡 `run`이 문자열/배열을 반환 | 타입은 `JobSummary \| void`로 좁힘 + 런타임은 `undefined`로 접음 | `@ts-expect-error`: `async run() { return 'done'; }` `[검증필요]` + unit: 배열 반환 → summary undefined |
| 18 | `ok`를 truthy로 판정해 `ok: 0`이 실패가 됨 | `=== false` 엄격 비교 | unit: `ok: 0` · `ok: ''` · `ok: undefined` · `ok: null` → 전부 SUCCEEDED, `ok: false`만 FAILED |
| 19 | 저장소가 liveness 워터마크를 초기화하지 않음(NULL) — 그 행은 영원히 reap되지 않고 잡이 영구 SKIPPED가 된다 | S6이 `claim`의 의무로 명시 + 적합성 케이스 | 적합성 케이스 S6-liveness: claim 직후 `reapStale({ staleAfterMs: 0, overlapKey })` → **정확히 1** 반환, 이어지는 claim 성공. NULL 워터마크 구현은 0을 반환해 떨어진다 |
| 20 | 유니크 위반 전체(`P2002`)를 `null`로 삼켜 잡이 영구 SKIPPED — 모든 관측 표면은 초록 | S1이 `null` 변환 범위를 overlap 제약 하나로 한정 + 러너가 SKIPPED마다 경고 로그 | 적합성 케이스 S1 "첫 run 마감 후 재claim → 성공"이 과잉 유니크 인덱스를 떨어뜨리고, 실패 메시지가 두 원인을 지목한다(§3.2.1). unit: SKIPPED 1회 → `logger.warn` 1건에 `overlapKey` 포함 |
| 21 | 반환된 `status`를 저장된 기록의 정본으로 취급 | `recorded` 필드 + §1-4의 권위 규칙 | unit: reaper가 선점한 run → 반환 `SUCCEEDED` + `recorded: 'superseded'`, 행은 `TIMED_OUT`. `complete` throw → `recorded: 'unrecorded'`, 행은 `RUNNING` 유지. type: `JobRunRecordOutcome` 전수 스위치 |
| 22 | 저장소 장애 중 하트비트가 계속 실패해 밀려난 사실을 러너가 영원히 모름 | `lastOkHeartbeatAt` 기준 자기 abort(§3.4.1-5) | unit: `store.heartbeat`가 계속 throw + 시계 `staleRunAfterMs` advance → `signal.aborted`, `FAILED(ERR_JOB_ABORTED)`, 본문 abort 관측 |
| 23 | 잡이 `ctx.signal`을 `fetch`에 넘겨 시한에 자기 `AbortError`로 reject → 같은 타임아웃이 실행마다 다른 상태로 기록됨 | 분류를 `signal.reason.code`로만 수행(§3.4.1-6) | unit: 시한에 자체 `AbortError`로 reject하는 잡 → `TIMED_OUT`(던져진 값 무시). 대조군: 시그널과 무관한 `AbortError` → `FAILED` |
| 24 | `allow` 잡의 죽은 RUNNING 행이 어떤 트리거로도 마감되지 않음 | `allow`는 `jobKey`로 reap 범위 지정(§3.4.1-3) | unit: `allow` 잡 실행 → `store.reapStale` 요청에 `jobKey`가 실리고 `overlapKey`는 없음. `forbid`는 반대 |
| 25 | 다른 프로바이더의 `onModuleInit`에서 `execute()` 호출 — 수집 전이라 "그런 잡 없음"으로 오진 | 수집 완료 전 뷰가 `ERR_JOB_REGISTRY_NOT_READY` throw(§3.9.3) | unit(Nest): `onModuleInit`에서 `execute()` → 그 코드 + 원인을 말하는 메시지, `ERR_JOB_UNKNOWN` 아님 |

`[검증필요]`가 6행 남아 있다는 사실 자체를 남긴다 — 형제 문서 두 건이 "타입으로 막힌다"는 미검증 주장으로 틀렸던 전례가 있으므로, 구현 착수 시 이 6개가 첫 작업 항목이다.

## 5. 테스트 전략

CLAUDE.md 3계층 중 **integration은 없다** — 네트워크·외부 시스템·DB가 0이다(저장소는 포트이고 인메모리 구현으로 검증한다). 대신 guard·store-contract·packed-consumer를 unit 계층과 릴리스 게이트에 둔다.

### 5.1 unit (`pnpm test`, 네트워크 0)

**러너 파이프라인 — 결말 5종 전수** (`fakeJobClock` + `memoryJobRunStore` + `recordingJobLogger`):

- `SUCCEEDED`: summary 왕복, `durationMs`가 주입 시계 기준, `complete` 1회, `recorded: 'settled'`.
- `FAILED` (본문 throw): 상태·에러 텍스트 절단(4001자 입력 → 4000자 저장), 결과의 `error.code === 'ERR_JOB_FAILED'`.
- `FAILED` (`ok:false`): summary **보존** + FAILED. §4-18의 `ok` 4종 반례 포함. §0.3-①의 회귀 테스트로 `InternalServerErrorException`을 던지는 잡도 정상 마감되는지 확인한다(코어는 Nest를 모르므로 "임의 예외"로 표현).
- `TIMED_OUT`: 시계 advance로 정확히 시한에 발화, `signal.aborted === true`, abort reason이 `ERR_JOB_TIMEOUT`. **분류 오라클 고정**: 시한에 본문이 자기 `AbortError`로 reject해도 `TIMED_OUT`(§4-23), 시그널과 무관한 `AbortError`는 `FAILED`.
- `SKIPPED`: 첫 claim 보유 중 두 번째 execute → `recordSkipped` 1회, 반환 `reason: 'overlap'`, 본문 실행 0회, **경고 로그 1건에 경쟁 `overlapKey` 포함**(§4-20).
- **기록 불일치 2종**: reaper 선점(`complete` → `false`) → 반환 status 유지 + `recorded: 'superseded'` + 경고 1건. `complete` throw → `recorded: 'unrecorded'` + 에러 1건, 저장된 행은 `RUNNING` 유지(§4-21).

**하트비트**:
- 95초 advance → `store.heartbeat` 정확히 3회(30·60·90초). 타이머 취소 후 추가 advance → 0회.
- `heartbeat`이 `false` → 러너가 `signal`을 abort하고 `FAILED`(`ERR_JOB_ABORTED`)로 마감.
- `heartbeat`이 throw 1회 → 경고 로그 1건, 실행은 계속, 결과 불변, `ctx.heartbeat`은 `true`.
- **`heartbeat`이 계속 throw + `staleRunAfterMs` 경과 → abort**(`ERR_JOB_ABORTED`, `FAILED`). 경계 2점을 모두 고정한다: `staleRunAfterMs - 1ms`에서는 실행 중, 그 시점에서는 abort. 중간에 한 번 성공하면 창이 리셋되는 것도 같은 테스트에서 확인(§3.4.1-5·§4-22).
- `ctx.heartbeat(progress)` → 저장소에 progress 전달, 반환 `true`.

**abort 무시 잡** — §3.4.2 표 3행 그대로.

**overlap policy**: `'allow'` → 두 execute가 서로 다른 overlapKey로 동시 claim 성공. `'forbid'`(기본) → 두 번째 SKIPPED.

**reap**: 모든 요청에 `staleAfterMs`(= `staleRunAfterMs`)와 `limit`이 실리고 **컷오프 시각은 실리지 않는다**(S6). 범위 3종: `reapScope: 'overlap-key'` 기본 + `forbid` 잡 → `overlapKey`만, 같은 기본값 + **`allow` 잡 → `jobKey`만**(§4-24), `'all'` → 둘 다 없음, `'off'` → 호출 0회. reap 예외 → 경고 로그 후 실행 계속. `memoryJobRunStore`에 러너와 **다른** `fakeJobClock`을 주입한 스큐 케이스로, 컷오프가 저장소 축에서 계산되므로 러너 시계를 5분 앞당겨도 신선한 행이 reap되지 않음을 확인한다(§3.2.3).

**입력 검증**: 스키마 없음 + `{a:1}` → `ERR_JOB_INPUT_UNEXPECTED` 및 **claim 0회**. 스키마 있음 + `undefined`/`null`/`{}` → `{}` 정규화. `parse` throw → `ERR_JOB_INPUT_INVALID` + `cause` 보존 + claim 0회.

**레지스트리**: §4-7·8 전수 + `list()` 정렬 + `assertJobSchedule`(cron 4/5/6/7 필드, 알 수 없는 시간대 `'Asia/Seoulll'`).

**카탈로그**: `jobCatalog` 기본값 채움(timeoutMs·overlapPolicy·schedulerHttpSync·acceptsInput), `schedulerHttpTargets` 필터(schedule null 제외, `schedulerHttpSync:false` 제외)·URI 조립(baseUrl 끝 슬래시 유무 2종)·deadline 계산(`600s → 660`, `1_740_000ms → 1800` 상한 절단)·`jobKeySlug`·`jobTriggerPath`. 전부 순수 함수이므로 입출력 표로 고정한다.

**인증**: `bearerToken`(없음·소문자 `bearer`·배열 헤더·접두 없음), `timingSafeSecretMatch`(동일·불일치·**길이 다름**·비문자열), `looksLikeJwt`(3세그먼트 정상 / 2·4세그먼트 / 빈 세그먼트 / `+/=` 포함 / 공백 포함), 인증자 순서(§3.7 5단계)·verifier 미호출 조건·고정 실패 메시지·verifier throw → 503 계열 에러.

**Nest 층**(`@nestjs/testing`): 모듈 조립(`forRoot`/`forRootAsync`), 디스커버리 수집(정상·스코프드 거부·인스턴스 dedupe·중복 키), **생명주기 순서**(§3.9.3 — ⑴ 다른 프로바이더의 `onModuleInit`에서 `execute()` → `ERR_JOB_REGISTRY_NOT_READY`, ⑵ `onApplicationBootstrap` 이후 같은 호출 → 정상 실행, ⑶ 중복 키 잡 2개 → `app.init()`이 reject하고 리스닝에 도달하지 못함), 가드(secret 경로·token 경로·401 3종), 컨트롤러(경로 파라미터·`triggeredByHeader` 미지정 시 `triggeredBy: null` / 지정 시 헤더값·HTTP 매핑 표 9행 전수·본문의 `recorded`), CLI(exit 0/1/2·`close()` 항상·팩토리 vs 인스턴스 소유권).

### 5.2 type (`pnpm test:types`)

`expectTypeOf` + `@ts-expect-error` 픽스처 — §4 표의 타입 항목 전부. 추가로:

- `inputSchema`의 `parse` 반환 타입이 `run(input, …)`의 `Input`으로 흐르는지(zod 유사 구조체로 검증 — zod를 devDependency로도 넣지 않는다).
- `inputSchema` 없는 잡의 `run(input: void, …)`.
- `JobRunStatus`·`JobTerminalStatus`·`JobSkipReason`·`JobRunRecordOutcome` 닫힌 유니언 전수 스위치.
- 포트 시각 필드가 전부 `number`임을 고정: `startedAt`·`finishedAt`·`at`에 `new Date()`를 넘기면 `@ts-expect-error`, `JobRunReapRequest`에 `staleBefore`가 **없음**(제거된 필드가 되살아나지 않게).
- `JobTriggerSource`가 `'SCHEDULER'`와 임의 문자열을 모두 받는지 + 리터럴 자동완성이 유지되는지.
- `JobRunStore` 구조적 적합: 5메서드 구현체는 통과, `heartbeat` 누락은 `@ts-expect-error`.
- `JobExecutionResult` 좁힘(§4-13).
- EOP 소비자 보호(§4-14).
- `.` 배럴이 코어 **런타임 값**을 재수출하지 않는지: `expectTypeOf<typeof import('../../src/index')>` 에 `createJobRunner`가 없음을 단언(§2.1의 단일 출처 규칙을 타입으로 고정).

### 5.3 guard (unit 계층 — 아키텍처 불변식의 정적 강제)

`format` §5.3 · `expo-workouts` §9.3 선례의 서버판 `[형제]`.

- **peer-graph**: `src/core/**` 소스 텍스트와 `dist/core.js`·`dist/core.cjs`에 `@nestjs`·`rxjs`·`reflect-metadata` 문자열이 없어야 한다. §1-1의 유일한 기계적 강제다.
- **ambient-clock**: `src/**`에서 `Date.now(`·`new Date(`·`setTimeout(`·`setInterval(`·`process.env`는 `src/core/clock.ts` 밖에서 금지. §1-2. **주석과 JSDoc도 스캔 대상**이므로 예시조차 `process.env.…`를 쓸 수 없다 — 이 가드가 실효적이려면 포트가 `Date`를 요구하지 않아야 하고, 그래서 §3.2의 시각 필드가 전부 `number`다. 가드를 약화시켜 러너의 `new Date(clock.now())`를 허용하는 선택지는 명시적으로 기각한다: 그러면 §1-2가 "기계적으로 강제되는 유일한 규칙"이라는 주장이 거짓이 된다.
- **no-product-strings**: `src/**`에 `memorylog`·`asia-northeast1`·`gcloud`·`K_REVISION` 문자열 **0회**. 승격 과정에서 제품 고유값이 딸려 오는 것을 막는다. `cloudscheduler`는 예외 하나를 **횟수로** 기록한다 — `src/nest/controller.ts`의 `triggeredByHeader` JSDoc 예시 **정확히 1회**, 그 밖의 파일 0회(§3.6의 흔적 인벤토리가 이 상한이다).
- **tsconfig-flags**: `tsconfig.json`이 `experimentalDecorators: true`와 `emitDecoratorMetadata: **false**`를 갖는지 확인한다(§2.5). 후자를 켜면 `design:paramtypes`에 의존하는 주입이 조용히 가능해지고, 그 의존은 메타데이터를 만들지 않는 SWC/esbuild 호스트에서만 깨져 우리 CI에서는 영원히 초록이다 — §7-11 완화책의 전제를 기계로 고정한다.
- **error-message-shape**: `src/nest/http.ts`가 만드는 본문에 `stack`·`cause`가 들어가지 않음(문자열 스캔 + 단위 테스트 이중).

### 5.4 store contract (unit 계층 — 포트 계약의 실행 가능한 형태)

`jobRunStoreContractCases()`를 `memoryJobRunStore()`에 돌린다. 케이스는 S1–S7 각각에 대해 최소 1개, 총 15개 내외. **모든 케이스는 포트만으로 관측 가능해야 한다** — `JobRunStore`에는 조회 메서드가 없으므로, 저장된 값을 봐야만 하는 케이스(S6-기록축·S7)는 `options.inspect`가 주어질 때만 생성된다(§3.10).

- **S1 (버스트, 이 스위트의 핵심)**: 같은 overlapKey로 `Promise.all` **8회 동시** claim → 정확히 1개만 `JobRunClaim`, 7개 `null`. **순차 2회는 이 결함을 못 잡는다**: 조회 후 삽입 구현도 두 번째 호출에서는 첫 RUNNING 행을 보고 `null`을 주므로 통과하고, 실제 Prisma에서 연결 2개가 동시에 들어오면 둘 다 행이 없다고 보고 둘 다 INSERT한다(§4-1). 그래서 케이스 이름과 README가 **연결 2개 이상인 풀**을 요구한다 — 단일 연결 클라이언트는 버스트를 직렬화해 결함을 다시 숨긴다. 실패 메시지는 두 원인을 모두 지목한다: "부분 유니크 인덱스가 없거나(`WHERE status='RUNNING'`), claim이 원자적 CAS가 아니다".
- **S1 (마감 후 재claim)**: 첫 run을 terminal로 마감한 뒤 같은 key로 claim → **성공**. 이 케이스가 반대쪽 함정인 **과잉 유니크 인덱스**(`@@unique([overlapKey])`)를 떨어뜨린다 — 그 인덱스에서는 여기서 유니크 위반이 나고, 위반을 제약 이름으로 좁히지 않은 구현은 `null`을 돌려 영구 SKIPPED가 된다. 실패 메시지가 "인덱스가 부분(partial)인지 확인하라"를 직접 말한다(§3.2.1·§7-3).
- **S1 (서로 다른 key)**: `allow` 계열 서로 다른 key 2개 → 둘 다 성공.
- **S2**: 마감된 run 하트비트 → `false`·무변경 / 연속 하트비트 2회 사이에 워터마크가 뒤로 가지 않음(두 번째 `reapStale({ staleAfterMs: 0 })` 전후로 관측).
- **S3**: `complete` 2회 → 두 번째 `false`+무변경 / reap 후 `complete` → `false`, 상태는 `TIMED_OUT` 유지.
- **S4 (동시 reap)**: stale 3건을 만들고 `reapStale`을 **동시 2회** → 두 반환값의 **합이 정확히 3**. `SELECT` 후 `UPDATE`로 나눈 구현은 합이 6이 되어 떨어진다. 실패 메시지가 `FOR UPDATE SKIP LOCKED`를 지목한다(§3.2.1 S4).
- **S4 (범위·상한)**: 신선한 RUNNING은 `staleAfterMs`가 클 때 reap되지 않음 / `overlapKey` 범위 reap이 다른 key의 stale 행을 건드리지 않음 / `jobKey` 범위 reap이 그 잡의 행만 마감 / `limit: 1`이면 stale 2건 중 1건만.
- **S5**: 두 claim의 `runId` 상이.
- **S6 (liveness 축 — `inspect` 없이 돈다)**: claim **직후** `reapStale({ staleAfterMs: 0, overlapKey })` → **정확히 1** 반환, 이어서 같은 key claim → 성공. 워터마크를 초기화하지 않는 구현(NULL)은 0을 반환해 떨어진다. 이것이 §0.3-⑥·§4-19를 닫는 케이스다. 이어지는 케이스: 하트비트 없이 `staleAfterMs`를 크게 주면 0건(살아 있는 행을 죽었다고 하지 않는다).
- **S6 (기록 축 — `inspect` 필요)**: 주입한 `startedAt`·`finishedAt`(epoch ms)이 **그대로** 조회된다. 저장소가 자기 `now()`로 갈아치우면 떨어진다.
- **S7 (`inspect` 필요)**: `input`·`summary` JSON 왕복 / 직렬화 불가 값은 예외(조용한 손실 금지).

**이 배열이 곧 호스트 Prisma 구현의 인수 조건이다.** README가 "호스트는 자기 스토어 테스트에 이 루프 6줄을 넣되, **연결 2개 이상인 실제 데이터베이스**를 향해 돌린다"를 명시하고, 핸드오프 문서가 그 실행 증거를 요구한다(AGENTS.md §4). 우리 릴리스 게이트가 검사할 수 있는 것은 `memoryJobRunStore`뿐이라는 한계는 §7-2에 그대로 남는다 — 이 스위트는 호스트가 돌려야 의미가 있고, 그래서 케이스 이름과 실패 메시지에 진단을 전부 실었다.

### 5.5 release artifact / packed consumer

- `tests/unit/guards/release-artifact.test.ts`: `files: ['dist']`, exports 3엔트리 + `./package.json`, `peerDependencies` 4종 정확 일치, `peerDependenciesMeta` **부재**, `dependencies` 필드 부재, `scripts.build`/`prepack` 배선, 루트 provenance 스크립트 존재(형제 복제 + 확장 `[형제]`).
- `scripts/check-nest-operations-jobs-consumer.mjs`(루트 신설 — §8): `npm pack` 후 Nest 10·11 픽스처에 설치해 ① ESM `import`와 CJS `require`로 `.`·`./core`·`./testing` 3엔트리 해석, ② 실제 `NestFactory.createApplicationContext`로 `OperationsJobsModule.forRoot` 부팅, ③ 인메모리 스토어로 잡 1건 실행해 `SUCCEEDED` 확인, ④ `dist/gj-kit-provenance.json` 존재 확인, ⑤ **peer 심볼의 import 출처 단언** — `DiscoveryService`·`DiscoveryModule`·`Reflector`는 `@nestjs/core`에서, `INestApplicationContext`는 `@nestjs/common`에서 해석된다(§2.2-3의 근거가 문장이 아니라 해상도로 서게 한다), ⑥ **Nest 없는 `./core` 로드** — 픽스처의 `node_modules/@nestjs`·`rxjs`·`reflect-metadata`를 지운 뒤 `require('@gj-kit/nest-operations-jobs/core')`로 러너를 만들어 잡 1건 실행. 이것이 §2.1의 "Nest 없는 워커·람다" 주장을 **모듈 그래프 계층에서** 증명하는 유일한 실행이며, 설치 계층의 비용(§7-13)은 이 테스트로도 없어지지 않는다. 형제 `check-toss-payments-consumer.mjs`의 구조를 그대로 복제한다 `[형제]`.

### 5.6 README (`check:readme`)

`format/scripts/check-readme.mjs`를 개조한다 `[형제]` — 다른 점은 `paths` 매핑이 3개(`@gj-kit/nest-operations-jobs`·`/core`·`/testing`)이고 `lib`에 `ES2022`만 주되 `types: ['node']`를 허용한다는 것(서버 패키지이므로 `process`·`crypto` 예제가 정당하다).

README 필수 내용:
1. 5분 배선 — 모듈 `forRoot` + 잡 1개 + 트리거 경로 + `serviceRevision`을 호스트 환경에서 읽는 한 줄(Cloud Run이면 `process.env.K_REVISION ?? null`). **제품·플랫폼 고유 값은 README에만 있고 `src/**`에는 없다** — §5.3의 두 가드가 그 경계를 지킨다.
2. **`JobRunStore` 구현 가이드** — S1–S7 표 재게재 + Postgres DDL(부분 유니크 인덱스 + `heartbeat_at timestamptz NOT NULL DEFAULT now()`) + Prisma 구현 40줄(유니크 위반을 **제약 이름으로** 좁히는 catch 포함) + S4의 `FOR UPDATE SKIP LOCKED` reap SQL + 적합성 케이스 루프 6줄과 **연결 2개 이상 요구**. 이 절이 README에서 가장 길어야 한다.
3. 잡 작성 규칙 — `signal` 확인, `ok:false` 규약, `heartbeat()`의 `false` 의미, 부수효과 멱등성 요구(§3.2.3).
4. 인증 배선 — 공유 시크릿, OIDC 어댑터 20줄(§3.7), 시크릿→OIDC 무중단 전환 순서.
5. 스케줄러 동기화 — `schedulerHttpTargets()` → gcloud 30줄 레시피(§6-1) + Terraform 변형 언급.
6. CLI 진입 파일 6줄 + exit code 표.
7. 관리자 카탈로그 — `jobCatalog()` + 호스트가 통계를 붙이는 지점.
8. 구 경로 호환 컨트롤러 10줄(§0.4-①).
9. `./core`만 쓰는 비-Nest 소비 예제 — §1-1이 마케팅이 아니라는 증거. 같은 절에 **설치 계층의 정직한 각주**를 단다: peer 4종은 required이므로 `./core`만 쓰는 프로젝트도 그것들을 설치하게 된다(로드는 하지 않는다 — §5.5-⑥이 증명). 이유와 대안은 §2.2-4·§7-13.

## 6. 의도적으로 뺀 것

### 6.1 `sync-scheduler.mjs` — 왜 이 패키지에 넣지 않는가

미션이 명시적으로 논증을 요구한 항목이다. 세 안을 놓고 판정한다.

| 안 | 내용 | 판정 |
|---|---|---|
| A | `bin` 또는 `./scheduler` 서브패스로 스크립트 전체 승격 | **기각** |
| B | GCP 어댑터를 optional peer(`google-auth-library`/`@google-cloud/scheduler`)로 | **기각** |
| C | 순수 카탈로그 투영만 승격, 동기화는 호스트 | **채택** |

**A 기각 근거 4종.**

1. **입력 3종이 제품 정책이다.** 349줄 중 실제로 일반적인 로직은 URI 조립·attemptDeadline 계산·필터 3개(합계 ~15줄)뿐이다. 나머지는 `DEFAULT_PROJECT = "memorylog-499511"`, `DEFAULT_REGION = "asia-northeast1"`, `memorylog-job-` 이름 접두, `ADMIN_ACCESS_SECRET`·`x-admin-access-secret` 헤더로 보호되는 **호스트 고유 관리자 엔드포인트에서 카탈로그를 fetch하는 부분**이다 `[소스]`. 마지막 항목이 특히 결정적이다 — 라이브러리 도구가 동작하려면 호스트가 특정 형태의 인증된 HTTP 엔드포인트를 우리 규격으로 노출해야 한다. 그것은 도구가 아니라 **두 번째 공개 프로토콜**이고, 이 패키지가 감당할 계약이 아니다.
2. **`gcloud` 서브프로세스는 검증할 수 없는 표면이다.** 스크립트는 `spawn('gcloud', …)`로 describe/create/update를 실행한다. CI에는 gcloud도 자격증명도 없으므로 이 코드 경로는 `verify:release`에서 **한 줄도 실행되지 않는다**. AGENTS.md §2는 새 의존성에 "검증 범위 문서화"를 요구하는데, 여기서 정직한 답은 "검증 0"이다. 릴리스 게이트가 통과했다는 사실이 이 표면에 대해 아무것도 보증하지 못하는 코드를 공개 계약에 넣지 않는다.
3. **CLI 플래그는 타입보다 약한 호환성 계약이다.** `--oidc-sa`를 `--oidc-service-account`로 고치는 것도, `--apply` 기본값을 바꾸는 것도 breaking change인데, 타입 시스템이 소비자에게 알려주지 못한다. 0.x에서 minor로 계속 깨야 하고, 그 비용이 얻는 편의보다 크다.
4. **prune 안 함 정책이 라이브러리 결정이 되어버린다.** 스크립트는 삭제를 하지 않는다 — 옳은 기본값이지만 **운영 정책**이다. 잡을 지운 뒤 스케줄러에 남은 고아를 어떻게 할지는 조직마다 다르고, 라이브러리가 "우리는 안 지운다"를 계약으로 못 박으면 지우고 싶은 조직은 우리 도구를 버리고 자기 것을 쓴다. 결국 C가 된다.

**B 기각 근거.** §0.4-④와 동일 — optional peer + dynamic import는 AGENTS.md §2가 금지하는 회피이고, `@google-cloud/scheduler`는 무거운 전이 의존성 트리를 가진다. 게다가 A의 근거 1·4는 B에서도 그대로 남는다(어댑터를 peer로 바꿔도 프로젝트·리전·이름·prune 정책은 여전히 우리 코드 안에 있다).

**C가 실제로 무엇을 남기는가.** 호스트가 쓰는 동기화 스크립트는 이 정도로 줄어든다(README 레시피, 요지):

```ts
import { jobCatalog, schedulerHttpTargets } from '@gj-kit/nest-operations-jobs/core';

const targets = schedulerHttpTargets(jobCatalog(registry.list()), {
  baseUrl: process.env.PUBLIC_BASE_URL!,
  routePrefix: 'internal/jobs',
});

for (const target of targets) {
  // gcloud scheduler jobs create/update http … 또는 Terraform 리소스 생성
}
```

즉 라이브러리는 **무엇을 스케줄해야 하는가**(순수 데이터, 타입으로 계약, 100% 테스트됨)를 소유하고, 호스트는 **어디에 어떻게 만드는가**(클라우드·명명·권한·prune)를 소유한다. 소스 스크립트에서 실제로 재사용 가치가 있던 부분은 전부 이 경계의 왼쪽에 있다.

**남는 손실과 완화**: 소스 스크립트의 plan-by-default·redacted 로그·`matchesDesired` diff 판정은 승격되지 않는다. 이 셋은 README 레시피에 **문장으로** 싣는다("`--apply` 없이는 계획만 출력할 것", "Authorization 헤더는 로그에서 마스킹할 것", "기존 잡과 diff 후 변경 시에만 update"). §7-6에 잔존 리스크로 올린다.

### 6.2 그 외 제외 목록

| # | 뺀 것 | 이유 |
|---|---|---|
| 1 | `sync-scheduler.mjs` 실행부 | §6.1 |
| 2 | Prisma 스키마·마이그레이션·`@prisma/client` 타입 | §0.4-⑤. `JobRun`은 호스트 소유 테이블이고 계약은 인덱스 하나다. DDL은 README |
| 3 | 관리자 조회 API(`runs`/`runDetail`/7일 통계) | 저장소 스키마를 아는 쪽이 소유한다. 라이브러리가 주는 것은 `jobCatalog()`(정의 측 투영)뿐이고, 실행 통계는 호스트의 groupBy다. 조회 포트를 만들면 `JobRunStore`가 5메서드에서 10메서드로 커지고 그 절반은 러너가 쓰지 않는다 |
| 4 | `JobRunsCleanupJob`(보존 정책) | §0.4-② |
| 5 | 재시도·백오프·큐·우선순위·동시성 제한 | §0.4-⑧. 재시도 소유자는 외부 스케줄러 하나여야 한다 |
| 6 | 분산 락(Redis·advisory lock) | §0.4-⑨. overlap 방지의 정본은 부분 유니크 인덱스 하나다 |
| 7 | zod·nestjs-pino·@nestjs/config 재수출 또는 peer | §0.2-①②·§0.4-⑥. 전부 구조적 포트로 흡수됐다 |
| 8 | 잡 진행률의 표준 스키마(`{ processed, total }` 등) | `JobSummary`는 자유 형식이고 `ok`만 예약어다. 진행률 표준화는 관리자 UI 요구가 실제로 생길 때 additive로 |
| 9 | 크론 표현식 파서·다음 실행 시각 계산 | 형태 검사만 한다(§3.5). 완전한 파서는 별도 관심사이고, 정확도가 스케줄러 구현마다 다르다 |
| 10 | 잡 간 의존성·DAG·체이닝 | 이 패키지의 단위는 "독립적으로 재시도 가능한 잡 1개"다. DAG는 다른 도구의 문제 영역 |
| 11 | OpenTelemetry·metrics 계측 | `JobLogger`가 구조화 필드를 내보내므로 호스트가 로그에서 파생시킬 수 있다. 두 번째 관측 표면은 요구가 생길 때 additive |
| 12 | 잡별 세분화 권한(RBAC) | 트리거 인증은 "스케줄러인가 아닌가" 하나다. 사람이 특정 잡만 실행하는 권한은 호스트 관리자 API의 문제 |
| 13 | **제품 잡 구현 전량**(`billing`·`drafts`·`storage`·`album-suggestions` 등) | 잡은 소비 앱의 도메인이고, 라이브러리가 소유하는 것은 `OperationsJob` 계약과 그것을 실행하는 파이프라인뿐이다(AGENTS.md §1). §6.2-4의 `JobRunsCleanupJob`은 "플랫폼 자기 관리 잡"이라 따로 이름을 불렀을 뿐, 같은 규칙의 한 사례다. README는 잡 구현을 **예제**로만 싣는다 |
| 14 | **구 경로 호환 컨트롤러와 라우트 네임스페이스** | §0.4-①(경로 9종이 제품 도메인이고 한시적 마이그레이션이다) + §0.2-⑧(경로는 컨트롤러 팩토리 인자로 호스트가 소유). 라이브러리가 남의 URL 네임스페이스를 점유하지 않는다. 위임 컨트롤러 10줄 레시피는 README(§5.6-8) |

## 7. 잔존 리스크

| # | 리스크 | 완화 |
|---|---|---|
| 1 | **reap가 단일 실행 보장을 판다** — 멈춰 있던 인스턴스가 깨어나면 두 본문이 겹쳐 돈다(§3.2.3) | staleAfter = heartbeat × 10, 하트비트 `false` → 즉시 abort, **저장소가 응답하지 않아 `false`조차 못 받는 동안에는 `lastOkHeartbeatAt` 기준 자기 abort**(§3.4.1-5), S3이 기록 오염 차단. 겹침 창의 상한은 정상 시 **1 하트비트 주기 + abort 반응 시간**, 저장소 장애가 지속되는 동안 **`staleRunAfterMs`(기본 300초) + abort 반응 시간**이다 — 잡 타임아웃(600초)이 상한이던 초안의 계산을 정정한다. 남는 창은 잡의 도메인 멱등성으로만 닫힌다 — README·JSDoc·`overlapPolicy` 문서 3곳에 같은 문장 |
| 2 | **호스트 저장소가 S1–S7을 어겨도 라이브러리는 모른다** — 스키마 비소유의 직접적 대가 | `jobRunStoreContractCases()`가 호스트 테스트 안에서 검사(§5.4). 핸드오프가 그 실행 증거를 요구. 그래도 "케이스를 안 돌린 호스트"는 막지 못한다 — README 최상단 경고 + `memoryJobRunStore` JSDoc의 "프로덕션 금지" |
| 3 | **부분 유니크 인덱스는 Prisma로 표현 불가 — 양쪽으로 틀릴 수 있다** `[소스 migration.sql:39가 실제로 raw SQL이다]`. ⑴ raw 마이그레이션을 **빠뜨리면** S1이 조용히 깨지고 증상은 "가끔 두 번 실행"이라는 가장 진단하기 어려운 형태다. ⑵ Prisma가 표현할 수 있는 것(`@@unique([overlapKey])`)으로 **대체하면** 첫 run이 key를 영구 점유해 그 잡이 다시는 실행되지 않는데, 위반을 넓게 삼킨 구현에서는 그것이 SKIPPED = HTTP 200 = exit 0으로 보인다 | README DDL을 복사 가능한 블록으로 제공 + 적합성 케이스 두 개가 양쪽을 각각 잡는다(S1 버스트 → ⑴, S1 마감 후 재claim → ⑵) + 실패 메시지가 두 원인을 지목 + S1이 `null` 변환을 overlap 제약 하나로 한정 + 러너가 SKIPPED마다 경고 로그(§3.2.1·§7-16) |
| 4 | **시크릿 32자 하한이 기존 호스트를 깬다** — memorylog2의 현재 `OPERATIONS_JOBS_SECRET` 길이 미확인 `[unverified — .env는 읽지 않는다]` | 조립 시점 에러 + remedy가 메시지에 있다(시크릿 재발급). 이관 절차의 첫 단계로 명시. 필요하면 0.2.0에서 `minSecretLength` 옵션을 additive로 추가 |
| 5 | **stale 판정은 이제 저장소 시계 하나에 걸려 있다** — 초안은 러너 프로세스 시계로 컷오프를 만들면서 "S6이 DB 시계를 금지해 한 시간축만 쓰게 한다"고 적었는데, 인스턴스가 N개면 **프로세스 축이 N개**이고 DB 축이 유일한 단일 축이므로 그 완화는 방향이 반대였다. 정정 후 남는 리스크는 저장소 시계 자체의 이상: NTP step으로 뒤로 점프하거나, 읽기 복제본·다중 라이터가 서로 다른 `now()`를 보는 배치 | 컷오프와 워터마크가 같은 문장 안에서 같은 `now()`를 쓴다(S4·S6). S2가 워터마크의 **뒤로 가기**를 금지해 시계가 뒤로 점프해도 살아 있는 행이 즉시 stale로 보이지 않는다. reap은 항상 라이터(프라이머리)에서 실행할 것을 README가 요구한다. `staleRunAfterMs`(기본 300초)가 시계 이상보다 크다는 전제는 그대로이며, 스큐가 문제인 배포는 그 값을 키운다 |
| 6 | **plan/diff/redaction이 승격되지 않았다**(§6.1) — 호스트가 동기화 스크립트를 처음부터 쓰다가 시크릿을 로그에 남기거나 매번 update를 때릴 수 있다 | README 레시피가 세 관행을 명시 + `SchedulerHttpTarget`이 비교 가능한 순수 값이라 diff 구현이 3줄이다 |
| 7 | **`.`/`./core` CJS 이중 로드** — 청크 분리가 CJS에 없어 코어 코드가 두 벌 로드될 수 있다 `[unverified — §2.5]` | `isOperationsJobsError()` 타입 가드를 정본화(§3.8), README가 `instanceof` 미사용, packed consumer가 CJS `require` 양 엔트리를 실제로 실행(§5.5). 실측 후 문제가 확인되면 `.`가 코어를 재수출하도록 바꾸는 것이 아니라 **에러 판정을 code 문자열 비교로 더 낮춘다** |
| 8 | **Nest 10과 11의 `DiscoveryService` 동작 차이** [unverified] — `getProviders()`의 래퍼 집합과 `isDependencyTreeStatic()` 의미가 메이저 간 동일한지 미확인 | packed consumer가 Nest 10·11 양쪽에서 실제 부팅 + 잡 수집까지 확인한다(§5.5). 차이가 발견되면 peer 범위를 `^11`로 좁히는 것이 정직한 대응이다(첫 릴리스이므로 비용이 가장 낮은 시점) |
| 9 | **`ok:false` 규약은 타입으로 강제되지 않는다** — `JobSummary`가 자유 형식이라 `{ ok: false }`와 `{ okay: false }`를 구분해 주지 못한다 | `ok`를 예약어로 문서화 + 단위 테스트 4반례(§4-18). 타입으로 좁히려면 `JobSummary`에 `ok?: boolean`을 넣어야 하는데, 그러면 `Record<string, unknown>`과의 호환이 깨져 기존 잡 전량이 수정 대상이 된다 — 0.x 초판에서 지불할 가치가 없다 |
| 10 | **에러 텍스트 4000자 절단이 스택을 잘라 원인을 가릴 수 있다** | 절단 위치를 앞에서부터로 두어 메시지와 최상단 프레임을 보존(소스 동일 `[소스]`). 한도는 `errorTextLimit`으로 조정 가능 |
| 11 | **컨트롤러 팩토리가 만드는 클래스는 Nest DI 데코레이터를 런타임에 붙인다** — SWC/esbuild 빌드의 `emitDecoratorMetadata` 유무에 따라 파라미터 주입이 달라질 수 있다 [unverified] | 형제 `toss-payments-nestjs`가 이미 해결한 형태를 따른다: 모든 주입을 **명시적 `@Inject(토큰)`**으로 하고 `design:paramtypes`를 읽지 않는다 `[형제 — inject.ts JSDoc]`. 그 완화의 전제인 컴파일러 플래그를 §2.5가 명시하고(`experimentalDecorators: true` / `emitDecoratorMetadata: **false**` — 루트 `tsconfig.base.json`은 둘 다 주지 않는다 `[형제]`), §5.3의 `tsconfig-flags` 가드가 값을 고정한다. packed consumer가 실제 부팅으로 확인 |
| 12 | **`schedule.timeZone` 검증이 `Intl`에 의존** — Node 20+ full-icu 전제 | `engines: node >=20` + small-icu 빌드에서는 `RangeError`가 아니라 통과할 수 있다. 검증 실패는 "잘못된 시간대를 못 잡는다"이지 오탐이 아니므로 안전한 방향의 실패다. README에 full-icu 권고 |
| 13 | **required peer 4종은 설치 계층에서 정직하지 않다** — `./core`만 쓰는 비-Nest 소비자도 `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`를 설치한다(npm 7+ 자동 설치, pnpm은 unmet 경고). §2.1이 파는 "Nest 없는 워커·람다"는 모듈 그래프에서는 참이지만 `node_modules`에서는 참이 아니다 | 기각한 대안을 함께 적는다: 형제 `toss-payments-postgresql`처럼 세 개를 `peerDependenciesMeta.optional`로 두고 `@nestjs/core`만 `.` 사용 시 required로 남기는 형태 `[형제]`. 고르지 않은 이유는 `.`이 이 패키지의 **주 표면**이고 그것은 Nest 없이 성립하지 않기 때문이다(§2.2). 대가의 크기는 §5.5-⑥이 실측한다(peer 디렉토리를 지운 픽스처에서 `./core`가 로드된다). 요구가 실제로 생기면 optional 전환은 **완화 방향의 breaking change**이므로 0.2.0에 minor로 낼 수 있다 |
| 14 | **모호한 claim** — INSERT가 커밋된 뒤 응답이 유실되면 `ERR_JOB_STORE`를 던지면서도 본문을 한 줄도 돌리지 않은 고아 `RUNNING` 행이 남고, 그 key는 `staleRunAfterMs`(기본 300초) 동안 잠긴다. 그동안의 재시도는 SKIPPED/200이다 | S5가 `runId`를 저장소에 맡기므로 러너에는 그 행을 지목할 손잡이가 없다. **선택지 둘 중 (a)를 골랐다**: (a) 불변식을 "throw = 이 러너가 어떤 행도 마감하지 않는다"로 정확히 적고 창을 문서화한다(§1-4·§3.4.1-4), (b) 러너가 `runId`를 만들어 보내고 S5를 "저장소가 준 id를 보존한다"로 완화해 `ON CONFLICT (id) DO NOTHING`으로 멱등화한다. (b)를 고르지 않은 이유는 재시도가 **새 HTTP 요청**이라 어차피 새 id를 만들고, 진짜 멱등성에는 호출자가 주는 idempotency key가 필요해 표면이 한 단계 더 커지기 때문이다. 창을 줄이려면 `staleRunAfterMs`를 낮춘다 |
| 15 | **reap는 트리거가 와야 돈다** — 기본 `reapScope: 'overlap-key'`는 `execute` 경로에서만 실행되므로, 다시는 트리거되지 않는 잡(스케줄에서 내렸거나 키를 바꾼 잡)의 고아 행은 영원히 `RUNNING`으로 남는다. `allow` 잡은 §3.4.1-3의 `jobKey` 범위로 마감되지만 그 역시 그 잡의 다음 트리거가 있어야 한다 | `JobRunner.reapStaleRuns()`가 이 목적의 공개 표면이고, README가 "호스트가 5분 주기 스윕 잡 하나를 등록한다"를 §5.6-2에 싣는다(잡 구현 예제 10줄). 관리자 화면에서 오래된 `RUNNING`을 세는 쿼리도 함께 제안한다 |
| 16 | **영구 SKIPPED는 성공처럼 보인다** — SKIPPED는 HTTP 200 · CLI exit 0 · 스케줄러 성공이므로, 잡이 영원히 스킵돼도 어떤 알림도 울리지 않는다(원인은 §7-3-⑵ 또는 고아 행) | 러너가 **모든 SKIPPED에 경고 로그**를 남기고 경쟁 중인 `overlapKey`를 필드에 싣는다(§3.2.2·§4-20). 라이브러리는 알림을 소유하지 않으므로 README가 "연속 SKIPPED N회 알림"을 호스트 관측 레시피로 싣는다. 카운터·메트릭 표면은 §6.2-11과 같은 이유로 additive 후보로 남긴다 |

---
## 8. 루트 배선 (오케스트레이터 적용 대상 — 이 문서 작성자는 건드리지 않았다)

CLAUDE.md·AGENTS.md의 릴리스 게이트에 새 패키지를 접합하는 데 필요한 **루트 변경 전량**이다. 순서는 무관하나 4·5는 3 이후에 의미가 있다.

| # | 파일 | 변경 | 근거 |
|---|---|---|---|
| 1 | `pnpm-workspace.yaml` | **변경 없음** — `packages: ["*"]`가 `nest-operations-jobs/package.json`을 자동 인식 | CLAUDE.md 구조 규칙 |
| 2 | 루트 `package.json` `build`·`typecheck`·`test`·`test:types` | **변경 없음** — 전부 `pnpm -r` | 형제와 동일 |
| 3 | 루트 `package.json` `check:readme` | 끝에 ` && corepack pnpm --filter @gj-kit/nest-operations-jobs check:readme` 추가 | README ts 블록 컴파일이 릴리스 계약(AGENTS.md §3) |
| 4 | `scripts/check-pack-contents.mjs` `packages` 배열 | `{ directory: 'nest-operations-jobs', requirePrepack: true, requireProvenance: true }` 1행 추가 | 03e4c50 선례와 동일 배선 |
| 5 | `scripts/publish-github-packages.mjs` `packageDirectories` | `'nest-operations-jobs'` 1행 추가 | 동 |
| 6 | `scripts/check-nest-operations-jobs-consumer.mjs` | **신설** — `check-toss-payments-consumer.mjs` 복제 개조(§5.5). Nest 10·11 픽스처는 `nest-operations-jobs/tests/fixtures/packed-consumer/` 아래에 패키지가 소유 | 새 required peer(`@nestjs/core`)가 실제 설치에서 해석되는지는 packed consumer만 증명한다 |
| 7 | 루트 `package.json` `verify:release` | ` && corepack pnpm run check:nest-operations-jobs-consumer` 추가 + 같은 이름의 스크립트 항목 신설 | 6번을 게이트에 넣는다 |
| 8 | `.env.example` | **변경 없음** — 이 패키지는 통합 테스트도 시크릿도 요구하지 않는다 | 저장소가 포트이므로 DB URL 불필요 |
| 9 | `.github/workflows/*` | **변경 없음** — CI가 `verify:release` 하나를 돌린다 | 현재 ci.yml/release.yml 확인함 `[형제]` |
| 10 | `.gitignore` | **변경 없음** — `.readme-check-*/`가 이미 있다 | check:readme 작업 디렉토리 |
| 11 | `README.md`(루트) | 패키지 목록에 1행 추가 | 문서 일관성 |
| 12 | `.changeset/nest-operations-jobs-v0-1.md` | **신설**(§2.7 본문 그대로) | 0.0.0 + minor → 0.1.0 |

## 부록 A. 근거 파일 경로 (재검증용)

- `[소스]` — memorylog2 `apps/server` 직접 판독:
  - `src/operations-jobs/{operations-job,job-registry,job-runner,operations-jobs.guard,scheduler-oidc.verifier,operations-jobs.controller,operations-jobs.module,legacy-job-routes.controller}.ts`
  - `src/operations-jobs/jobs/job-runs-cleanup.job.ts` · `src/jobs/run-job.ts`
  - `src/common/{bearer-token,timing-safe-equal}.ts` · `src/admin/admin-jobs.service.ts`
  - `scripts/sync-scheduler.mjs`
  - `prisma/schema.prisma:1080-1099`(model JobRun) · `prisma/migrations/20260815000000_add_job_run/migration.sql:36-39`(부분 유니크 인덱스 — Prisma 표현 불가 주석 포함)
  - `test/{jobs.run-job-cli.spec.ts,billing-jobs.contract.spec.ts}`
  - 줄 수는 `wc -l`로 실측
- `[형제]` — gj-kit 직접 판독:
  - `AGENTS.md`(§1 패키지 책임 · §2 공개 API/의존성 · §3 릴리스 · §4 handoff) · `CLAUDE.md`
  - `format/{package.json,tsup.config.ts,vitest.config.ts,tsconfig.json,scripts/*}` — 패키지 골격·provenance 래퍼·check-readme 원본
  - `toss-payments-nestjs/{package.json,tsup.config.ts,src/inject.ts,src/module.ts,tests/unit/release-artifact.test.ts,tests/fixtures/packed-consumer/*}` — Nest 어댑터 선례·peer 정책·packed consumer
  - `toss-payments-postgresql/package.json` — 서브패스 3분할(`.`/`./nestjs`/`./testing`)·optional peer 선례. **`./nestjs` 서브패스와 `peerDependenciesMeta.optional`(`@nestjs/common`·`reflect-metadata`·`rxjs`)이 함께 있다**는 사실이 §2.2-4의 근거다
  - 루트 `tsconfig.base.json` — `experimentalDecorators`·`emitDecoratorMetadata`를 **주지 않는다**(§2.5) · `toss-payments-nestjs/tsconfig.json` — 두 플래그와 그 이유 주석 · `docs/design/service-integration-v1.1.md` §4.1 — 같은 결정의 설계 기록
  - `@nestjs/common/index.d.ts:6` — `INestApplicationContext`가 `./interfaces`에서 재수출된다(§2.2-3의 정정 근거) · `@nestjs/core/index.d.ts` — `./discovery`·`./services` 재수출
  - `toss-payments/src/server/stores.ts` · `toss-payments/src/testing/stores.ts` — 포트 + 인메모리 구현의 문서화 관행(원자성 요구를 JSDoc에 적는 방식)
  - `scripts/{check-pack-contents,publish-github-packages,check-toss-payments-consumer}.mjs` · `.github/workflows/{ci,release}.yml` · 루트 `package.json`
  - `docs/design/format-api-surface.md` · `docs/design/expo-workouts-api-surface.md` — 문서 형식 기준
  - 커밋 `03e4c50` (toss-payments-postgresql 도입 — version 0.0.0 + minor changeset + 루트 배선 3종)
- `[unverified]` 표시가 붙은 주장 5건: §2.5 CJS 청크 이중 로드, §7-4 memorylog2 시크릿 길이, §7-8 Nest 10/11 DiscoveryService 동작 차이, §7-11 데코레이터 메타데이터, §7-12 small-icu. 전부 구현 또는 packed consumer 단계에서 닫힌다.
