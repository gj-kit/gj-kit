/** §5.2 코어 표면의 타입 계약 — 판별 유니언·닫힌 유니언·포트 시각 타입. */
import { describe, expectTypeOf, it } from 'vitest';

import type {
  AnyOperationsJob,
  JobExecutionResult,
  JobInputValidator,
  JobRunClaimRequest,
  JobRunCompleteRequest,
  JobRunReapRequest,
  JobRunRecordOutcome,
  JobRunSkippedRequest,
  JobRunStatus,
  JobRunStore,
  JobSkipReason,
  JobSummary,
  JobTerminalStatus,
  JobTriggerSource,
  OperationsJob,
  OperationsJobContext,
} from '../../src/core';

interface Parsed {
  readonly limit: number;
}

// zod의 ZodType은 이 형태를 구조적으로 만족한다 — 라이브러리는 zod를 모른다.
declare const schema: JobInputValidator<Parsed>;
declare const result: JobExecutionResult;
declare const maybeRevision: string | undefined;
declare const maybeLimit: number | undefined;

describe('§3.1 잡 계약', () => {
  it('inputSchema의 parse 반환 타입이 run의 Input으로 흐른다 (zod 유사 구조체로 검증)', () => {
    const job: OperationsJob<Parsed> = {
      key: 'a.b',
      description: 'd',
      inputSchema: schema,
      run: async (input, context) => {
        expectTypeOf(input).toEqualTypeOf<Parsed>();
        expectTypeOf(context).toEqualTypeOf<OperationsJobContext>();
        expectTypeOf(context.deadlineAt).toEqualTypeOf<number>();
        expectTypeOf(context.heartbeat).returns.toEqualTypeOf<Promise<boolean>>();
        return { processed: input.limit };
      },
    };
    expectTypeOf(job.key).toEqualTypeOf<string>();
  });

  it('inputSchema 없는 잡의 run은 void 입력을 받는다', () => {
    const job: OperationsJob = {
      key: 'a.b',
      description: 'd',
      run: async (input) => {
        expectTypeOf(input).toEqualTypeOf<void>();
      },
    };
    expectTypeOf(job.run).returns.toEqualTypeOf<Promise<JobSummary | void>>();
  });

  it('§4-17 run이 문자열을 반환하면 컴파일 에러다', () => {
    const job: OperationsJob = {
      key: 'a.b',
      description: 'd',
      // @ts-expect-error — JobSummary | void만 허용된다
      run: async () => 'done',
    };
    expectTypeOf(job).toExtend<AnyOperationsJob>();
  });
});

describe('§5.2 닫힌 유니언 전수 스위치 (source compatibility)', () => {
  it('JobRunStatus', () => {
    const describeStatus = (status: JobRunStatus): string => {
      switch (status) {
        case 'RUNNING':
          return 'running';
        case 'SUCCEEDED':
          return 'succeeded';
        case 'FAILED':
          return 'failed';
        case 'TIMED_OUT':
          return 'timed out';
        case 'SKIPPED':
          return 'skipped';
        default: {
          const exhaustive: never = status;
          return exhaustive;
        }
      }
    };
    expectTypeOf(describeStatus).returns.toEqualTypeOf<string>();
    expectTypeOf<JobTerminalStatus>().toEqualTypeOf<
      'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'SKIPPED'
    >();
    expectTypeOf<JobSkipReason>().toEqualTypeOf<'overlap'>();
  });

  it('JobRunRecordOutcome', () => {
    const describeRecord = (recorded: JobRunRecordOutcome): string => {
      switch (recorded) {
        case 'settled':
          return 'settled';
        case 'superseded':
          return 'superseded';
        case 'unrecorded':
          return 'unrecorded';
        default: {
          const exhaustive: never = recorded;
          return exhaustive;
        }
      }
    };
    expectTypeOf(describeRecord).returns.toEqualTypeOf<string>();
  });

  it('JobTriggerSource는 개방 유니언 — 리터럴 자동완성은 주되 호스트 값을 막지 않는다', () => {
    expectTypeOf<'SCHEDULER'>().toExtend<JobTriggerSource>();
    expectTypeOf<'CLI'>().toExtend<JobTriggerSource>();
    expectTypeOf<'BACKFILL_TOOL'>().toExtend<JobTriggerSource>();
    expectTypeOf<string>().toExtend<JobTriggerSource>();
  });
});

describe('§4-13 JobExecutionResult 판별 유니언', () => {
  it('좁히지 않은 reason·error·summary 접근은 컴파일 에러다', () => {
    // @ts-expect-error — reason은 SKIPPED 분기에만 있다
    void result.reason;
    // @ts-expect-error — error는 FAILED·TIMED_OUT 분기에만 있다
    void result.error;
    // @ts-expect-error — summary는 TIMED_OUT·SKIPPED 분기에 없다
    void result.summary;
    // 공통 필드는 좁히지 않아도 읽힌다
    expectTypeOf(result.runId).toEqualTypeOf<string>();
    expectTypeOf(result.recorded).toEqualTypeOf<JobRunRecordOutcome>();
  });

  it('좁힌 뒤에는 분기별 필드가 열린다', () => {
    if (result.status === 'SKIPPED') {
      expectTypeOf(result.reason).toEqualTypeOf<JobSkipReason>();
    } else if (result.status === 'TIMED_OUT') {
      expectTypeOf(result.error.code).toExtend<string>();
    } else if (result.status === 'FAILED') {
      expectTypeOf(result.summary).toEqualTypeOf<JobSummary | undefined>();
    } else {
      expectTypeOf(result.status).toEqualTypeOf<'SUCCEEDED'>();
    }
  });
});

describe('§1-2 포트 시각 필드는 전부 number다', () => {
  it('날짜 객체를 넘기면 컴파일 에러', () => {
    const claim: JobRunClaimRequest = {
      jobKey: 'a.b',
      overlapKey: 'a.b',
      trigger: { source: 'CLI' },
      input: null,
      // @ts-expect-error — epoch ms만 받는다
      startedAt: new Date(),
    };
    void claim;

    const complete: JobRunCompleteRequest = {
      runId: 'r',
      status: 'SUCCEEDED',
      // @ts-expect-error — epoch ms만 받는다
      finishedAt: new Date(),
      durationMs: 1,
    };
    void complete;

    const skipped: JobRunSkippedRequest = {
      jobKey: 'a.b',
      trigger: { source: 'CLI' },
      input: null,
      // @ts-expect-error — epoch ms만 받는다
      at: new Date(),
      reason: 'overlap',
    };
    void skipped;
  });

  it('reap 요청은 기간만 받는다 — 제거된 staleBefore가 되살아나지 않게 고정한다', () => {
    expectTypeOf<JobRunReapRequest>().toHaveProperty('staleAfterMs');
    expectTypeOf<keyof JobRunReapRequest>().toEqualTypeOf<
      'staleAfterMs' | 'jobKey' | 'overlapKey' | 'limit'
    >();
    const request: JobRunReapRequest = {
      staleAfterMs: 1,
      // @ts-expect-error — 컷오프 시각은 저장소의 것이지 호출자의 것이 아니다
      staleBefore: 2,
    };
    void request;
  });
});

describe('§5.2 JobRunStore 구조적 적합', () => {
  it('5메서드 구현체는 통과하고 누락은 컴파일 에러다', () => {
    const complete: JobRunStore = {
      claim: async () => null,
      heartbeat: async () => true,
      complete: async () => true,
      recordSkipped: async () => ({ runId: 'r' }),
      reapStale: async () => 0,
    };
    expectTypeOf(complete).toExtend<JobRunStore>();

    // @ts-expect-error — heartbeat 누락
    const partial: JobRunStore = {
      claim: async () => null,
      complete: async () => true,
      recordSkipped: async () => ({ runId: 'r' }),
      reapStale: async () => 0,
    };
    void partial;
  });
});

describe('§1-8 EOP 소비자 보호', () => {
  it('옵셔널 필드에 `T | undefined`를 그대로 넘길 수 있다', () => {
    const claim: JobRunClaimRequest = {
      jobKey: 'a.b',
      overlapKey: 'a.b',
      trigger: { source: 'CLI', triggeredBy: undefined },
      input: null,
      startedAt: 0,
      serviceRevision: maybeRevision,
    };
    const reap: JobRunReapRequest = { staleAfterMs: 1, limit: maybeLimit, jobKey: undefined };
    void claim;
    void reap;
  });
});
