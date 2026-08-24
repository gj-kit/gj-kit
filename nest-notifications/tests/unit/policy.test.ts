/**
 * §5.1 정책 — 이 패키지에서 가장 촘촘해야 할 곳.
 *
 * 모든 결정이 **주입된 시계 + IANA 벽시계 산술**에서 나오므로 DST 경계 테스트가 결정적이다.
 * 고정 offset 산술이었다면 아래 갭/중복/비정시 offset 케이스가 전부 틀린 답을 냈을 것이다.
 */
import { describe, expect, it } from 'vitest';

import { isNotificationsError } from '../../src/core/errors';
import {
  createQuietHoursPolicy,
  DEFAULT_BATCH_WINDOW_MS,
  notificationBatchPolicyKey,
  notificationFollowUpBatchPolicyKey,
} from '../../src/core/policy';
import type { NotificationTiming } from '../../src/core/contracts';

const SEOUL = 'Asia/Seoul';
const NEW_YORK = 'America/New_York';
const KATHMANDU = 'Asia/Kathmandu';
const LORD_HOWE = 'Australia/Lord_Howe';

function iso(value: string): Date {
  return new Date(Date.parse(value));
}

function seoulPolicy() {
  return createQuietHoursPolicy({
    timeZone: SEOUL,
    quietHours: { startHour: 22, endHour: 8 },
    batchWindowMs: 600_000,
  });
}

function resolve(
  policy: ReturnType<typeof createQuietHoursPolicy>,
  now: Date,
  overrides?: {
    readonly priority?: 'NORMAL' | 'ESSENTIAL';
    readonly timing?: NotificationTiming | undefined;
  },
): Date {
  return policy.resolveDeliveryAt({
    priority: overrides?.priority ?? 'NORMAL',
    timing: overrides?.timing,
    now,
    recipientRef: 'recipient-1',
    category: 'general',
  });
}

describe('이관 회귀 — 소스와 같은 지역·같은 창에서 같은 답', () => {
  const policy = seoulPolicy();

  it('조용시간 시작 직후의 NORMAL은 다음 아침 08:00에 나간다', () => {
    // KST 22:00 = 소스 스펙의 대표 케이스.
    expect(resolve(policy, iso('2026-08-18T13:00:00Z')).toISOString()).toBe(
      '2026-08-18T23:00:00.000Z',
    );
  });

  it('조용시간 한가운데의 NORMAL도 같은 아침으로 모인다', () => {
    // KST 03:00 → 같은 날 08:00.
    expect(resolve(policy, iso('2026-08-18T18:00:00Z')).toISOString()).toBe(
      '2026-08-18T23:00:00.000Z',
    );
  });

  it('조용시간 밖의 NORMAL은 즉시다', () => {
    const now = iso('2026-08-18T03:00:00Z'); // KST 12:00
    expect(resolve(policy, now).getTime()).toBe(now.getTime());
  });

  it('조용시간 한가운데의 ESSENTIAL은 홀드되지 않는다', () => {
    const now = iso('2026-08-18T18:00:00Z');
    expect(resolve(policy, now, { priority: 'ESSENTIAL' }).getTime()).toBe(now.getTime());
  });

  it('과거 SCHEDULED는 now로 접힌다', () => {
    const now = iso('2026-08-18T03:00:00Z');
    const at = resolve(policy, now, { timing: { mode: 'SCHEDULED', at: '2020-01-01T00:00:00Z' } });
    expect(at.getTime()).toBe(now.getTime());
  });

  it('미래 SCHEDULED가 조용시간이면 그 시각 기준으로 다시 홀드된다', () => {
    const now = iso('2026-08-18T03:00:00Z');
    const at = resolve(policy, now, { timing: { mode: 'SCHEDULED', at: '2026-08-18T14:00:00Z' } });
    // 요청 시각 KST 23:00 → 다음 아침 08:00 KST.
    expect(at.toISOString()).toBe('2026-08-18T23:00:00.000Z');
  });

  it('10분 창이 epoch 격자와 비트 동일하다 — 이 지역에서는 로컬 자정이 격자에 정렬된다', () => {
    const at = iso('2026-08-18T03:07:31Z');
    const window = policy.batchWindow(at);
    expect(window.startedAt.getTime()).toBe(Math.floor(at.getTime() / 600_000) * 600_000);
    expect(window.endsAt.getTime() - window.startedAt.getTime()).toBe(600_000);
  });

  it('isQuietHours는 자정을 넘는 구간을 양쪽에서 참으로 본다', () => {
    expect(policy.isQuietHours(iso('2026-08-18T13:00:00Z'))).toBe(true); // 22:00
    expect(policy.isQuietHours(iso('2026-08-18T22:30:00Z'))).toBe(true); // 07:30 다음날
    expect(policy.isQuietHours(iso('2026-08-18T23:00:00Z'))).toBe(false); // 08:00 정각은 밖
  });
});

describe('DST — 고정 offset이었다면 틀렸을 케이스', () => {
  it('봄 전진 갭에 삼켜진 종료 시각은 갭 직후 첫 존재하는 순간으로 릴리스된다', () => {
    const policy = createQuietHoursPolicy({
      timeZone: NEW_YORK,
      quietHours: { startHour: 22, endHour: 2 },
    });
    // 2026-03-08 01:00 EST. 그날 02:00은 존재하지 않는다.
    const at = resolve(policy, iso('2026-03-08T06:00:00Z'));
    expect(at.toISOString()).toBe('2026-03-08T07:00:00.000Z'); // 03:00 EDT
  });

  it('가을 후퇴로 두 번 존재하는 종료 시각은 이른 쪽이다', () => {
    const policy = createQuietHoursPolicy({
      timeZone: NEW_YORK,
      quietHours: { startHour: 22, endHour: 1 },
    });
    // 2026-11-01 00:30 EDT. 01:00은 EDT와 EST 두 번 존재한다.
    const at = resolve(policy, iso('2026-11-01T04:30:00Z'));
    expect(at.toISOString()).toBe('2026-11-01T05:00:00.000Z'); // 01:00 EDT (이른 쪽)
  });

  it('비정시 offset(+05:45)에서 10분 창이 로컬 자정에 정렬된다 — epoch 격자였다면 :20이었다', () => {
    const policy = createQuietHoursPolicy({ timeZone: KATHMANDU, quietHours: null });
    const at = iso('2026-08-18T18:20:00Z'); // 로컬 00:05
    const window = policy.batchWindow(at);
    expect(window.startedAt.toISOString()).toBe('2026-08-18T18:15:00.000Z');
    expect(Math.floor(at.getTime() / 600_000) * 600_000).not.toBe(window.startedAt.getTime());
  });

  it('30분 DST 지역에서도 창의 startedAt이 단조 증가한다', () => {
    const policy = createQuietHoursPolicy({
      timeZone: LORD_HOWE,
      quietHours: null,
      batchWindowMs: 3_600_000,
    });
    let previous = -Infinity;
    // 전환일을 사이에 두고 48시간을 30분 간격으로 훑는다.
    for (let offset = 0; offset <= 48 * 60; offset += 30) {
      const at = new Date(Date.UTC(2026, 3, 4, 0, 0, 0) + offset * 60_000);
      const startedAt = policy.batchWindow(at).startedAt.getTime();
      expect(startedAt).toBeGreaterThanOrEqual(previous);
      previous = startedAt;
    }
  });

  it('23시간이 된 날의 마지막 6시간 창만 짧아지고 자정을 넘지 않는다', () => {
    const policy = createQuietHoursPolicy({
      timeZone: NEW_YORK,
      quietHours: null,
      batchWindowMs: 21_600_000,
    });
    const lastWindow = policy.batchWindow(iso('2026-03-09T00:00:00Z')); // 19:00 EST 당일
    expect(lastWindow.endsAt.toISOString()).toBe('2026-03-09T04:00:00.000Z'); // 다음 로컬 자정
    expect(lastWindow.endsAt.getTime() - lastWindow.startedAt.getTime()).toBeLessThan(21_600_000);
  });
});

describe('조립 시점 검증 — 설정 오류는 부팅에서 죽는다', () => {
  it('알 수 없는 시간대는 ERR_NOTIFICATION_TIMEZONE_INVALID', () => {
    try {
      createQuietHoursPolicy({ timeZone: 'Mars/Olympus_Mons' });
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe('ERR_NOTIFICATION_TIMEZONE_INVALID');
    }
  });

  it.each([0, -1, 7 * 60_000, 1.5, Number.MAX_SAFE_INTEGER])(
    '24시간을 나누어떨어지지 않는 창 %s는 거부된다',
    (batchWindowMs) => {
      expect(() => createQuietHoursPolicy({ timeZone: 'UTC', batchWindowMs })).toThrow();
    },
  );

  it.each([600_000, 3_600_000, 21_600_000, 86_400_000])('%s는 통과한다', (batchWindowMs) => {
    expect(() => createQuietHoursPolicy({ timeZone: 'UTC', batchWindowMs })).not.toThrow();
  });

  it.each([
    { startHour: 22, endHour: 22 },
    { startHour: -1, endHour: 8 },
    { startHour: 22, endHour: 24 },
    { startHour: 22.5, endHour: 8 },
  ])('잘못된 조용시간 %o는 ERR_NOTIFICATION_POLICY_INVALID', (quietHours) => {
    try {
      createQuietHoursPolicy({ timeZone: 'UTC', quietHours });
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe('ERR_NOTIFICATION_POLICY_INVALID');
    }
  });

  it('quietHours: null은 조용시간을 완전히 끈다', () => {
    const policy = createQuietHoursPolicy({ timeZone: 'UTC', quietHours: null });
    const now = iso('2026-01-01T23:30:00Z');
    expect(policy.isQuietHours(now)).toBe(false);
    expect(resolve(policy, now).getTime()).toBe(now.getTime());
  });

  it('holdPriorities로 ESSENTIAL도 홀드할 수 있다', () => {
    const policy = createQuietHoursPolicy({
      timeZone: 'UTC',
      quietHours: { startHour: 22, endHour: 8 },
      holdPriorities: ['NORMAL', 'ESSENTIAL'],
    });
    const now = iso('2026-01-01T23:00:00Z');
    expect(resolve(policy, now, { priority: 'ESSENTIAL' }).toISOString()).toBe(
      '2026-01-02T08:00:00.000Z',
    );
  });

  it('DEFAULT_BATCH_WINDOW_MS는 10분이다', () => {
    expect(DEFAULT_BATCH_WINDOW_MS).toBe(600_000);
  });
});

describe('배치 라우트 키', () => {
  const immediate: NotificationTiming = { mode: 'IMMEDIATE' };
  const scheduled: NotificationTiming = { mode: 'SCHEDULED', at: '2026-08-18T13:00:00Z' };

  it('카테고리·우선순위·타이밍 4조합이 전부 다른 키다', () => {
    const keys = new Set([
      notificationBatchPolicyKey('a', 'NORMAL', immediate),
      notificationBatchPolicyKey('a', 'ESSENTIAL', immediate),
      notificationBatchPolicyKey('b', 'NORMAL', immediate),
      notificationBatchPolicyKey('a', 'NORMAL', scheduled),
    ]);
    expect(keys.size).toBe(4);
  });

  it('JSON 인코딩이라 구분자를 담은 카테고리 이름이 키를 충돌시키지 않는다', () => {
    // 불투명한 카테고리 이름이 어떤 구분자를 담고 있어도 왕복이 정확하다 = 인코딩이 단사다.
    for (const category of ['a:NORMAL:IMMEDIATE', 'a","x', 'a]', '']) {
      const key = notificationBatchPolicyKey(category, 'NORMAL', immediate);
      expect((JSON.parse(key) as readonly unknown[])[0]).toBe(category);
    }
    expect(notificationBatchPolicyKey('a:NORMAL:IMMEDIATE', 'NORMAL', immediate)).not.toBe(
      notificationBatchPolicyKey('a', 'NORMAL', immediate),
    );
  });

  it('follow-up 키는 소스 행마다 다르고 원래 키와도 다르다', () => {
    const base = notificationBatchPolicyKey('a', 'NORMAL', immediate);
    const first = notificationFollowUpBatchPolicyKey(base, 'outbox-1');
    const second = notificationFollowUpBatchPolicyKey(base, 'outbox-2');
    expect(new Set([base, first, second]).size).toBe(3);
  });
});
