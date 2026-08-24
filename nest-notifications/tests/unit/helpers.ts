/** 유닛 테스트 공용 픽스처. */
import { createQuietHoursPolicy } from '../../src/core/policy';
import type { NotificationSchedulingPolicy } from '../../src/core/policy';
import type { NotificationCommand } from '../../src/core/contracts';
import type {
  NotificationPushEndpoint,
  NotificationPushGateway,
  NotificationPushPayload,
  NotificationPushResult,
} from '../../src/core/push';
import { fakeNotificationRuntime } from '../../src/testing/fake-runtime';
import type { FakeNotificationRuntime } from '../../src/testing/fake-runtime';
import { memoryNotificationStores } from '../../src/testing/memory-stores';
import type { MemoryNotificationStores } from '../../src/testing/memory-stores';

export const APP = 'test-app';
export const RECIPIENT = 'recipient-1';
export const CATEGORY = 'general';
export const PROVIDER = 'test-provider';

/** 22:00–08:00 quiet hours in a fixed-offset zone that never observes DST. */
export const FIXED_ZONE = 'Etc/GMT-9';

export function command(
  overrides: Partial<NotificationCommand> & { eventKey: string },
): NotificationCommand {
  return {
    applicationKey: APP,
    recipientRef: RECIPIENT,
    category: CATEGORY,
    priority: 'NORMAL',
    body: 'body text',
    ...overrides,
  };
}

export interface Harness {
  readonly runtime: FakeNotificationRuntime;
  readonly stores: MemoryNotificationStores;
  readonly policy: NotificationSchedulingPolicy;
}

export function harness(options?: {
  readonly now?: Date | undefined;
  readonly timeZone?: string | undefined;
  readonly quietHours?: { readonly startHour: number; readonly endHour: number } | null | undefined;
  readonly batchWindowMs?: number | undefined;
}): Harness {
  const runtime = fakeNotificationRuntime({
    now: options?.now ?? new Date(Date.UTC(2026, 7, 18, 3, 0, 0)),
  });
  return {
    runtime,
    stores: memoryNotificationStores(runtime),
    policy: createQuietHoursPolicy({
      timeZone: options?.timeZone ?? FIXED_ZONE,
      quietHours: options?.quietHours === undefined ? { startHour: 22, endHour: 8 } : options.quietHours,
      batchWindowMs: options?.batchWindowMs ?? 600_000,
    }),
  };
}

export interface RecordingGateway extends NotificationPushGateway {
  readonly sends: readonly {
    readonly endpoints: readonly NotificationPushEndpoint[];
    readonly payload: NotificationPushPayload;
  }[];
}

/** 기록 전송 — 테스트가 payload와 endpoint 집합을 그대로 단언한다. */
export function recordingGateway(
  result?: (payload: NotificationPushPayload) => NotificationPushResult | Promise<NotificationPushResult>,
): RecordingGateway {
  const sends: {
    endpoints: readonly NotificationPushEndpoint[];
    payload: NotificationPushPayload;
  }[] = [];
  return {
    sends,
    isValidEndpoint: () => true,
    async send(endpoints, payload) {
      sends.push({ endpoints: [...endpoints], payload });
      if (result === undefined) {
        return { accepted: true, invalidEndpointIds: [], rejectedEndpointIds: [] };
      }
      return result(payload);
    },
  };
}
