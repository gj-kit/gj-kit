/**
 * §3.9.4 가드·컨트롤러·HTTP 매핑. 실제 HTTP 서버를 띄워 매핑 표를 통째로 확인한다 —
 * 응답 본문에 잡의 원문 에러가 새지 않는다는 것(§4-12)이 이 파일의 두 번째 단언이다.
 */
import 'reflect-metadata';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AnyOperationsJob, JobSummary } from '../../src/core/job';
import { OperationsJobsError } from '../../src/core/errors';
import { silentJobLogger } from '../../src/core/logger';
import {
  createOperationsJobsController,
  OperationsJobDefinition,
  OperationsJobsModule,
  toHttpException,
} from '../../src/index';
import { fakeJobClock } from '../../src/testing/fake-clock';
import { memoryJobRunStore } from '../../src/testing/memory-store';

const SECRET = 'h'.repeat(32);
const LEAKED = 'super-secret-connection-string';

@Injectable()
@OperationsJobDefinition()
class OkJob implements AnyOperationsJob {
  readonly key = 'http.ok';
  readonly description = 'ok';
  async run(): Promise<JobSummary> {
    return { processed: 1 };
  }
}

@Injectable()
@OperationsJobDefinition()
class BoomJob implements AnyOperationsJob {
  readonly key = 'http.boom';
  readonly description = 'boom';
  async run(): Promise<JobSummary> {
    throw new Error(LEAKED);
  }
}

@Injectable()
@OperationsJobDefinition()
class InputJob implements AnyOperationsJob {
  readonly key = 'http.no-input';
  readonly description = 'no input';
  async run(): Promise<JobSummary> {
    return {};
  }
}

describe('§3.9.4 트리거 컨트롤러 (실제 HTTP)', () => {
  let app: INestApplication;
  let base: string;
  const store = memoryJobRunStore({ clock: fakeJobClock() });

  beforeAll(async () => {
    @Module({
      imports: [
        OperationsJobsModule.forRoot({
          store,
          auth: { secret: SECRET },
          logger: silentJobLogger(),
          clock: fakeJobClock(),
          trigger: { path: 'internal/jobs', triggeredByHeader: 'x-scheduler-jobname' },
        }),
      ],
      providers: [OkJob, BoomJob, InputJob],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const post = async (
    key: string,
    init: { auth?: string | null; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<{ status: number; body: any }> => {
    const response = await fetch(`${base}/internal/jobs/${key}/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(init.auth === null ? {} : { authorization: init.auth ?? `Bearer ${SECRET}` }),
        ...init.headers,
      },
      body: JSON.stringify(init.body ?? {}),
    });
    return { status: response.status, body: await response.json() };
  };

  it('200 — SUCCEEDED 본문은 runId·jobKey·status·durationMs·recorded·summary', async () => {
    const { status, body } = await post('http.ok');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      jobKey: 'http.ok',
      status: 'SUCCEEDED',
      recorded: 'settled',
      summary: { processed: 1 },
    });
    expect(typeof body.runId).toBe('string');
    expect(typeof body.durationMs).toBe('number');
  });

  it('200 — SKIPPED도 성공 코드다 (중복은 정상 동작이다)', async () => {
    const held = await store.claim({
      jobKey: 'http.ok',
      overlapKey: 'http.ok',
      trigger: { source: 'CLI' },
      input: null,
      startedAt: 1,
    });
    const { status, body } = await post('http.ok');
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'SKIPPED', reason: 'overlap', recorded: 'settled' });
    await store.complete({
      runId: held?.runId ?? '',
      status: 'SUCCEEDED',
      finishedAt: 2,
      durationMs: 1,
    });
  });

  it('§4-12 500 — 실패 응답은 코드만 싣고 잡의 원문 에러는 실행 기록에만 남는다', async () => {
    const { status, body } = await post('http.boom');
    expect(status).toBe(500);
    expect(body).toMatchObject({ jobKey: 'http.boom', status: 'FAILED', error: { code: 'ERR_JOB_FAILED' } });
    expect(JSON.stringify(body)).not.toContain(LEAKED);
    expect(JSON.stringify(body)).not.toContain('stack');
    const failed = store.runs().find((row) => row.jobKey === 'http.boom');
    expect(failed?.error).toContain(LEAKED);
  });

  it('404 — 없는 잡 키', async () => {
    const { status, body } = await post('http.missing');
    expect(status).toBe(404);
    expect(body.error).toEqual({ code: 'ERR_JOB_UNKNOWN' });
  });

  it('400 — 입력을 받지 않는 잡에 body를 보내면 ERR_JOB_INPUT_UNEXPECTED', async () => {
    const { status, body } = await post('http.no-input', { body: { limit: 1 } });
    expect(status).toBe(400);
    expect(body.error).toEqual({ code: 'ERR_JOB_INPUT_UNEXPECTED' });
  });

  it('401 — 시크릿 없음·틀린 시크릿 모두 같은 고정 본문', async () => {
    const missing = await post('http.ok', { auth: null });
    const wrong = await post('http.ok', { auth: 'Bearer nope' });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.body.error).toEqual({ code: 'ERR_JOB_UNAUTHORIZED' });
    expect(wrong.body.error).toEqual(missing.body.error);
  });

  it('triggeredByHeader를 지정한 호스트는 그 헤더 값을 trigger.triggeredBy로 기록한다', async () => {
    await post('http.ok', { headers: { 'x-scheduler-jobname': 'nightly-ok' } });
    const rows = store.runs().filter((row) => row.jobKey === 'http.ok');
    expect(rows.at(-1)?.trigger.triggeredBy).toBe('nightly-ok');
  });
});

describe('§0.2-⑯ triggeredByHeader 미지정 — 어떤 헤더도 읽지 않는다', () => {
  it('trigger.triggeredBy는 null이다', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });

    @Module({
      imports: [
        OperationsJobsModule.forRoot({
          store,
          auth: { secret: SECRET },
          logger: silentJobLogger(),
          clock: fakeJobClock(),
          trigger: { path: 'ops' },
        }),
      ],
      providers: [OkJob],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const base = await app.getUrl();

    const response = await fetch(`${base}/ops/http.ok/run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${SECRET}`,
        'x-scheduler-jobname': 'ignored',
      },
      body: '{}',
    });
    expect(response.status).toBe(200);
    expect(store.runs()[0]?.trigger.triggeredBy).toBeNull();
    await app.close();
  });
});

describe('§3.9.4 toHttpException 매핑 표 전수', () => {
  it.each([
    ['ERR_JOB_UNKNOWN', 404],
    ['ERR_JOB_REGISTRY_NOT_READY', 503],
    ['ERR_JOB_INPUT_INVALID', 400],
    ['ERR_JOB_INPUT_UNEXPECTED', 400],
    ['ERR_JOB_STORE', 503],
    ['ERR_JOB_UNAUTHORIZED', 401],
    ['ERR_JOB_TIMEOUT', 504],
    ['ERR_JOB_FAILED', 500],
    ['ERR_JOB_AUTH_MISCONFIGURED', 500],
  ] as const)('%s → %d', (code, status) => {
    const exception = toHttpException(new OperationsJobsError(code, 'x', { jobKey: 'a.b' }));
    expect(exception?.getStatus()).toBe(status);
    expect(exception?.getResponse()).toEqual({ jobKey: 'a.b', error: { code } });
  });

  it('결과 매핑 — SUCCEEDED/SKIPPED는 null, FAILED는 500, TIMED_OUT은 504', () => {
    const base = { runId: 'r', jobKey: 'a.b', durationMs: 1, recorded: 'settled' } as const;
    expect(toHttpException({ ...base, status: 'SUCCEEDED' })).toBeNull();
    expect(toHttpException({ ...base, status: 'SKIPPED', reason: 'overlap' })).toBeNull();

    const failed = toHttpException({
      ...base,
      status: 'FAILED',
      error: new OperationsJobsError('ERR_JOB_FAILED', 'x'),
    });
    expect(failed?.getStatus()).toBe(500);
    expect(failed?.getResponse()).toEqual({
      runId: 'r',
      jobKey: 'a.b',
      status: 'FAILED',
      recorded: 'settled',
      error: { code: 'ERR_JOB_FAILED' },
    });

    const timedOut = toHttpException({
      ...base,
      status: 'TIMED_OUT',
      error: new OperationsJobsError('ERR_JOB_TIMEOUT', 'x'),
    });
    expect(timedOut?.getStatus()).toBe(504);
  });
});

describe('§3.9.4 가드 — verifier 장애는 401이 아니라 503', () => {
  it('verifier가 던지면 503, null이면 401', async () => {
    const store = memoryJobRunStore({ clock: fakeJobClock() });
    const verify = vi.fn(async (token: string) => {
      if (token.startsWith('outage')) throw new Error('token endpoint unreachable');
      return null;
    });

    @Module({
      imports: [
        OperationsJobsModule.forRoot({
          store,
          auth: { tokenVerifier: { verify } },
          logger: silentJobLogger(),
          clock: fakeJobClock(),
          trigger: { path: 'ops' },
        }),
      ],
      providers: [OkJob],
    })
    class AppModule {}

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.listen(0);
    const base = await app.getUrl();

    const call = (token: string): Promise<Response> =>
      fetch(`${base}/ops/http.ok/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: '{}',
      });

    const outage = await call('outage.bbb.ccc');
    expect(outage.status).toBe(503);
    // 코드만으로는 401과 구분되지 않는다 — 본문의 discriminator가 그 일을 한다.
    expect(await outage.json()).toMatchObject({
      error: { code: 'ERR_JOB_UNAUTHORIZED' },
      reason: 'verifier_unavailable',
    });

    const rejected = await call('aaa.bbb.ccc');
    expect(rejected.status).toBe(401);
    const rejectedBody = (await rejected.json()) as Record<string, unknown>;
    expect(rejectedBody['error']).toEqual({ code: 'ERR_JOB_UNAUTHORIZED' });
    expect(rejectedBody['reason']).toBeUndefined();
    await app.close();
  });
});

describe('§0.2-⑧ 컨트롤러 팩토리', () => {
  it('경로는 인자로 들어오고 팩토리는 매번 새 클래스를 만든다', () => {
    const first = createOperationsJobsController({ path: 'a' });
    const second = createOperationsJobsController({ path: 'b' });
    expect(typeof first).toBe('function');
    expect(first).not.toBe(second);
  });
});
