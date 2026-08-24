/** §3.6 카탈로그 투영 — 전부 순수 함수이므로 입출력 표로 고정한다. */
import { describe, expect, it } from 'vitest';

import {
  jobCatalog,
  jobKeySlug,
  jobTriggerPath,
  schedulerHttpTargets,
} from '../../src/core/catalog';
import { isOperationsJobsError } from '../../src/core/errors';
import type { AnyOperationsJob } from '../../src/core/job';

const job = (key: string, extra: Partial<AnyOperationsJob> = {}): AnyOperationsJob =>
  ({ key, description: `${key} description`, run: async () => ({}), ...extra }) as AnyOperationsJob;

describe('jobCatalog', () => {
  it('기본값을 전부 채운다', () => {
    const [entry] = jobCatalog([job('storage.purge')]);
    expect(entry).toEqual({
      key: 'storage.purge',
      description: 'storage.purge description',
      schedule: null,
      schedulerHttpSync: true,
      overlapPolicy: 'forbid',
      timeoutMs: 600_000,
      acceptsInput: false,
    });
  });

  it('잡 자신의 값과 주입한 defaultTimeoutMs를 존중한다', () => {
    const [entry] = jobCatalog(
      [
        job('a.b', {
          timeoutMs: 1_000,
          overlapPolicy: 'allow',
          schedulerHttpSync: false,
          schedule: { cron: '0 9 * * *', timeZone: 'Asia/Seoul' },
          inputSchema: { parse: (value: unknown) => value },
        }),
      ],
      { defaultTimeoutMs: 5 },
    );
    expect(entry?.timeoutMs).toBe(1_000);
    expect(entry?.overlapPolicy).toBe('allow');
    expect(entry?.schedulerHttpSync).toBe(false);
    expect(entry?.acceptsInput).toBe(true);
    expect(entry?.schedule).toEqual({ cron: '0 9 * * *', timeZone: 'Asia/Seoul' });

    const [fallback] = jobCatalog([job('c.d')], { defaultTimeoutMs: 5 });
    expect(fallback?.timeoutMs).toBe(5);
  });
});

describe('schedulerHttpTargets', () => {
  const scheduled = job('storage.recurring-billing', {
    timeoutMs: 600_000,
    schedule: { cron: '0 9 * * *', timeZone: 'Asia/Seoul' },
  });

  it('스케줄 없는 잡과 schedulerHttpSync:false 잡을 걸러낸다', () => {
    const catalog = jobCatalog([
      scheduled,
      job('a.unscheduled'),
      job('b.external', {
        schedule: { cron: '0 1 * * *', timeZone: 'UTC' },
        schedulerHttpSync: false,
      }),
    ]);
    const targets = schedulerHttpTargets(catalog, { baseUrl: 'https://api.example.com' });
    expect(targets.map((target) => target.key)).toEqual(['storage.recurring-billing']);
  });

  it.each([['https://api.example.com'], ['https://api.example.com/']])(
    'baseUrl %s의 끝 슬래시 유무와 무관하게 URI를 조립한다',
    (baseUrl) => {
      const [target] = schedulerHttpTargets(jobCatalog([scheduled]), { baseUrl });
      expect(target?.uri).toBe(
        'https://api.example.com/internal/jobs/storage.recurring-billing/run',
      );
      expect(target?.httpMethod).toBe('POST');
    },
  );

  it('routePrefix를 바꾸면 URI도 따라간다', () => {
    const [target] = schedulerHttpTargets(jobCatalog([scheduled]), {
      baseUrl: 'https://api.example.com',
      routePrefix: '/ops/jobs/',
    });
    expect(target?.uri).toBe('https://api.example.com/ops/jobs/storage.recurring-billing/run');
  });

  it('attemptDeadlineSeconds = ceil(timeoutMs/1000) + margin', () => {
    const [normal] = schedulerHttpTargets(jobCatalog([scheduled]), {
      baseUrl: 'https://x.test',
    });
    expect(normal?.attemptDeadlineSeconds).toBe(660);

    // 상한 바로 아래는 그대로 나간다 — 절단이 아니라 계산 결과다.
    const [edge] = schedulerHttpTargets(
      jobCatalog([
        job('a.b', { timeoutMs: 1_740_000, schedule: { cron: '* * * * *', timeZone: 'UTC' } }),
      ]),
      { baseUrl: 'https://x.test' },
    );
    expect(edge?.attemptDeadlineSeconds).toBe(1_800);
  });

  it('상한이 잡의 시한보다 짧으면 모순된 타깃을 내는 대신 ERR_JOB_INVALID로 죽는다', () => {
    // 절단하면 스케줄러는 30분에 포기하는데 러너는 60분까지 돌린다 — deadline-exceeded
    // 실패 + 재시도가 매 실행 기록되고, forbid 잡의 재시도는 SKIPPED/200으로 초록이다.
    const hourLong = jobCatalog([
      job('billing.monthly-close', {
        timeoutMs: 3_600_000,
        schedule: { cron: '0 3 1 * *', timeZone: 'Asia/Seoul' },
      }),
    ]);

    let captured: unknown;
    try {
      schedulerHttpTargets(hourLong, { baseUrl: 'https://x.test' });
    } catch (error) {
      captured = error;
    }
    expect(isOperationsJobsError(captured)).toBe(true);
    expect((captured as { code: string }).code).toBe('ERR_JOB_INVALID');
    expect((captured as { jobKey?: string }).jobKey).toBe('billing.monthly-close');
    expect((captured as Error).message).toMatch(/maxAttemptDeadlineSeconds/u);

    // 상한을 플랫폼 실제 값으로 올리면 그대로 통과한다.
    const [raised] = schedulerHttpTargets(hourLong, {
      baseUrl: 'https://x.test',
      maxAttemptDeadlineSeconds: 3_660,
    });
    expect(raised?.attemptDeadlineSeconds).toBe(3_660);
  });
});

describe('jobKeySlug · jobTriggerPath', () => {
  it('슬러그는 점을 하이픈으로 바꾼다 — 접두는 호스트가 붙인다', () => {
    expect(jobKeySlug('storage.recurring-billing')).toBe('storage-recurring-billing');
  });

  it('트리거 경로는 기본 접두를 쓰고 중복 슬래시를 접는다', () => {
    expect(jobTriggerPath('storage.purge')).toBe('internal/jobs/storage.purge/run');
    expect(jobTriggerPath('storage.purge', '/ops//jobs/')).toBe('ops/jobs/storage.purge/run');
    expect(jobTriggerPath('storage.purge', '')).toBe('storage.purge/run');
  });
});
