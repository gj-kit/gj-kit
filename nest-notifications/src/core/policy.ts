/**
 * 스케줄링 정책 — 조용시간·배달 시각·배치 창·배치 라우트 키(설계 §3.2).
 *
 * 소스는 `class NotificationSchedulingPolicy`에 지역 상수 3종을 하드코딩했다. 여기서는
 * **인터페이스 + 팩토리**다(설계 §0.2-③): 수신자별 시간대는 새 필드가 아니라 다른 구현체로
 * 들어오므로 breaking change 없이 확장된다.
 */
import { NotificationsError } from './errors';
import type { NotificationPriority, NotificationTiming } from './contracts';
import { toInstant } from './runtime';
import {
  assertUsableTimeZone,
  localDateAt,
  startOfLocalDay,
  startOfNextLocalDay,
  wallClockIn,
} from './zone';

const DAY_MS = 86_400_000;

/** Half-open local-clock window `[startHour, endHour)`. `start > end` wraps midnight. */
export interface NotificationQuietHours {
  /** 0-23, inclusive. */
  readonly startHour: number;
  /** 0-23, exclusive. */
  readonly endHour: number;
}

export interface QuietHoursPolicyOptions {
  /**
   * IANA time zone name (for example `'Europe/Paris'`), or `'UTC'`.
   * The library holds no regional default: this field is required.
   */
  readonly timeZone: string;
  /** `null` disables quiet hours entirely. */
  readonly quietHours?: NotificationQuietHours | null | undefined;
  /** Aggregation window length. Must divide 24h evenly. Defaults to {@link DEFAULT_BATCH_WINDOW_MS}. */
  readonly batchWindowMs?: number | undefined;
  /** Priorities held during quiet hours. Defaults to `['NORMAL']`. */
  readonly holdPriorities?: readonly NotificationPriority[] | undefined;
}

/** Ten minutes. The source constant, with the region dropped from its name. */
export const DEFAULT_BATCH_WINDOW_MS = 600_000;

/** Half-open aggregation bucket `[startedAt, endsAt)`. Never spans a local midnight. */
export interface NotificationBatchWindow {
  readonly startedAt: Date;
  readonly endsAt: Date;
}

export interface ResolveDeliveryInput {
  readonly priority: NotificationPriority;
  readonly timing: NotificationTiming | undefined;
  readonly now: Date;
  /** Present so a host implementation can vary policy per recipient or category. */
  readonly recipientRef: string;
  readonly category: string;
}

/**
 * Pure scheduling decisions. Implement this interface to vary policy per
 * recipient (their own zone) or per category; {@link createQuietHoursPolicy} is
 * the built-in single-zone implementation.
 */
export interface NotificationSchedulingPolicy {
  /** True when `at` falls inside the configured quiet window. */
  isQuietHours(at: Date): boolean;
  /** Earliest instant this command may be delivered. Never earlier than `now`. */
  resolveDeliveryAt(input: ResolveDeliveryInput): Date;
  /** Aggregation bucket that contains `at`. */
  batchWindow(at: Date): NotificationBatchWindow;
}

function policyInvalid(message: string): never {
  throw new NotificationsError('ERR_NOTIFICATION_POLICY_INVALID', message);
}

function assertQuietHours(quietHours: NotificationQuietHours): void {
  for (const [field, value] of [
    ['startHour', quietHours.startHour],
    ['endHour', quietHours.endHour],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 23) {
      policyInvalid(`quietHours.${field} must be an integer in 0..23.`);
    }
  }
  if (quietHours.startHour === quietHours.endHour) {
    // 같은 값은 "빈 구간"과 "종일 침묵" 중 어느 쪽인지 알 수 없다. 조용히 하나를 고르면
    // 그 선택이 계약이 되고, 틀린 쪽을 고른 호스트는 알림이 영원히 안 나가는 것을 본다.
    policyInvalid('quietHours.startHour and endHour must differ; use null to disable quiet hours.');
  }
}

function assertBatchWindow(batchWindowMs: number): void {
  if (!Number.isInteger(batchWindowMs) || batchWindowMs <= 0) {
    policyInvalid('batchWindowMs must be a positive integer number of milliseconds.');
  }
  if (batchWindowMs > DAY_MS || DAY_MS % batchWindowMs !== 0) {
    // 나누어떨어지지 않으면 마지막 버킷 길이가 매일 달라지고 `batchWindowStartedAt`이
    // 유니크 키로서 의미를 잃는다(설계 §3.2.4).
    policyInvalid('batchWindowMs must divide 24h evenly (for example 600000, 3600000, 21600000).');
  }
}

/**
 * Single-zone quiet-hours policy.
 *
 * Every decision is wall-clock arithmetic over an IANA zone, so a DST boundary
 * or a non-hourly offset such as +05:45 stays correct. Three interpretation
 * rules are part of the contract (design 3.2.3):
 *
 * 1. A release instant that does not exist (spring-forward gap) releases at the
 *    first instant after the gap.
 * 2. A release instant that exists twice (autumn fall-back) releases at the
 *    earlier one.
 * 3. A computed release at or before `now` advances a day and recomputes; with
 *    no valid solution inside 48 hours it delivers immediately, because an
 *    unbounded hold is indistinguishable from a lost notification.
 *
 * Assembly-time validation throws `ERR_NOTIFICATION_TIMEZONE_INVALID` or
 * `ERR_NOTIFICATION_POLICY_INVALID`, so a misconfigured deployment fails to boot
 * rather than mis-delivering quietly.
 */
export function createQuietHoursPolicy(
  options: QuietHoursPolicyOptions,
): NotificationSchedulingPolicy {
  const timeZone = options.timeZone;
  assertUsableTimeZone(timeZone);

  const quietHours = options.quietHours ?? null;
  if (quietHours !== null) assertQuietHours(quietHours);

  const batchWindowMs = options.batchWindowMs ?? DEFAULT_BATCH_WINDOW_MS;
  assertBatchWindow(batchWindowMs);

  const holdPriorities = new Set<NotificationPriority>(options.holdPriorities ?? ['NORMAL']);

  const inQuietHours = (epochMs: number): boolean => {
    if (quietHours === null) return false;
    const hour = wallClockIn(epochMs, timeZone).hour;
    if (quietHours.startHour < quietHours.endHour) {
      return hour >= quietHours.startHour && hour < quietHours.endHour;
    }
    return hour >= quietHours.startHour || hour < quietHours.endHour;
  };

  const releaseAfterQuietHours = (fromMs: number): number => {
    if (quietHours === null) return fromMs;
    // 오늘·내일·모레의 종료 시각을 차례로 본다 — 규칙 3의 48시간 상한이 이 루프다.
    for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
      const candidate = localDateAt(fromMs, timeZone, dayOffset, quietHours.endHour);
      if (candidate.epochMs > fromMs) return candidate.epochMs;
    }
    return fromMs;
  };

  return {
    isQuietHours: (at) => inQuietHours(at.getTime()),

    resolveDeliveryAt: (input) => {
      const nowMs = input.now.getTime();
      let requestedMs = nowMs;
      const timing = input.timing;
      if (timing !== undefined && timing.mode === 'SCHEDULED') {
        const parsed = Date.parse(timing.at);
        if (Number.isNaN(parsed)) {
          throw new NotificationsError(
            'ERR_NOTIFICATION_COMMAND_INVALID',
            'timing.at is not an ISO 8601 instant.',
          );
        }
        // 과거로 예약된 명령은 즉시로 접힌다(소스 동작).
        requestedMs = Math.max(parsed, nowMs);
      }
      if (!holdPriorities.has(input.priority)) return toInstant(requestedMs);
      if (!inQuietHours(requestedMs)) return toInstant(requestedMs);
      return toInstant(releaseAfterQuietHours(requestedMs));
    },

    batchWindow: (at) => {
      const atMs = at.getTime();
      // 로컬 자정 기준 버킷 — epoch 격자가 아니다(설계 §0.2-⑪). 창 경계는 하루를 넘지 않고,
      // DST로 23시간이 된 날의 마지막 버킷만 짧아진다(경계가 뒤로 가는 일은 없다).
      const dayStart = startOfLocalDay(atMs, timeZone);
      const nextMidnight = startOfNextLocalDay(atMs, timeZone);
      const index = Math.max(0, Math.floor((atMs - dayStart) / batchWindowMs));
      const startedAt = dayStart + index * batchWindowMs;
      const endsAt = Math.min(startedAt + batchWindowMs, nextMidnight);
      return { startedAt: toInstant(startedAt), endsAt: toInstant(Math.max(endsAt, startedAt)) };
    },
  };
}

/**
 * Route key for one batch identity.
 *
 * JSON array encoding rather than a delimiter join: a category name is opaque to
 * this library and could contain whatever separator we picked (source rationale,
 * kept verbatim).
 */
export function notificationBatchPolicyKey(
  category: string,
  priority: NotificationPriority,
  timing: NotificationTiming,
): string {
  return JSON.stringify([
    category,
    priority,
    timing.mode,
    timing.mode === 'SCHEDULED' ? timing.at : null,
  ]);
}

/**
 * Route key for a follow-up delivery: an item that arrived after its batch was
 * claimed gets its own delivery rather than disappearing (design 3.1 F10).
 * Including the source outbox id keeps every follow-up unique.
 */
export function notificationFollowUpBatchPolicyKey(
  batchPolicyKey: string,
  sourceOutboxId: string,
): string {
  return JSON.stringify(['follow-up', batchPolicyKey, sourceOutboxId]);
}
