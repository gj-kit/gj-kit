/**
 * 명령 계약 — 소스에서 유일하게 스스로 "Nest·Prisma·전송·도메인 free"를 선언하고 있던
 * 파일이다(설계 §0.1 · §3.4.1). 승격의 씨앗이고, 형태는 거의 그대로 옮긴다.
 */
import { NotificationsError } from './errors';

export type NotificationPriority = 'NORMAL' | 'ESSENTIAL';

export type NotificationJsonPrimitive = string | number | boolean | null;

export type NotificationJsonValue =
  | NotificationJsonPrimitive
  | readonly NotificationJsonValue[]
  | { readonly [key: string]: NotificationJsonValue };

/** The client-visible action is intentionally transport and domain agnostic. */
export type NotificationAction = {
  readonly href?: string | undefined;
  readonly [key: string]: NotificationJsonValue | undefined;
};

/**
 * An ISO instant rather than a Date, so a command stays JSON-serialisable while
 * it waits in a durable ingress outbox.
 */
export type NotificationTiming =
  | { readonly mode: 'IMMEDIATE' }
  | { readonly mode: 'SCHEDULED'; readonly at: string };

export interface NotificationBatch {
  readonly key: string;
  readonly label?: string | undefined;
  readonly itemCount?: number | undefined;
}

/**
 * One source recipient plus one stable event key is the idempotency boundary
 * (design 3.1 G1). `applicationKey` is server-owned configuration: API callers
 * must never choose it.
 *
 * Delivery order between two commands is never guaranteed (G8). Quiet-hours
 * holds, batch windows, scheduled timings, parallel workers and per-item retries
 * all reorder deliveries, so a domain that needs an order must put it in the
 * body.
 */
export interface NotificationCommand {
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef?: string | null | undefined;
  readonly targetRef?: string | null | undefined;
  readonly category: string;
  readonly priority: NotificationPriority;
  readonly title?: string | null | undefined;
  readonly body: string;
  readonly action?: NotificationAction | null | undefined;
  readonly eventKey: string;
  readonly batch?: NotificationBatch | null | undefined;
  readonly timing?: NotificationTiming | undefined;
}

export interface NotificationStageResult {
  /** Null only when the recipient lifecycle has already tombstoned this ref. */
  readonly id: string | null;
  readonly staged: boolean;
  readonly discarded?: boolean | undefined;
}

/**
 * The only port source-domain code needs. `Transaction` stays generic because
 * staging happens inside the host's own source transaction — this is the one
 * port in this package that takes a host transaction object (design 3.4.1).
 *
 * Implementations owe obligations I1-I3 (design 3.3.6): conflict-safe insert,
 * a liveness gate acquired before the insert, and a staging timestamp written
 * exactly once.
 */
export interface NotificationPublisher<Transaction = unknown> {
  stage(transaction: Transaction, command: NotificationCommand): Promise<NotificationStageResult>;
}

const PRIORITIES: readonly NotificationPriority[] = ['NORMAL', 'ESSENTIAL'];

function invalid(message: string): never {
  throw new NotificationsError('ERR_NOTIFICATION_COMMAND_INVALID', message);
}

function requireText(value: unknown, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`NotificationCommand.${field} must be a non-empty string.`);
  }
}

function assertTiming(timing: NotificationTiming | undefined): void {
  if (timing === undefined) return;
  if (timing.mode === 'IMMEDIATE') return;
  if (timing.mode !== 'SCHEDULED') invalid('NotificationCommand.timing.mode is unsupported.');
  if (typeof timing.at !== 'string' || Number.isNaN(Date.parse(timing.at))) {
    invalid('NotificationCommand.timing.at must be an ISO 8601 instant.');
  }
}

/**
 * Validates a command before it reaches a durable outbox.
 *
 * Throws {@link NotificationsError} with code `ERR_NOTIFICATION_COMMAND_INVALID`;
 * the source threw a bare `Error` (design 0.2-8).
 */
export function assertNotificationCommand(command: NotificationCommand): void {
  if (typeof command !== 'object' || command === null) {
    invalid('NotificationCommand must be an object.');
  }
  requireText(command.applicationKey, 'applicationKey');
  requireText(command.recipientRef, 'recipientRef');
  requireText(command.category, 'category');
  requireText(command.body, 'body');
  requireText(command.eventKey, 'eventKey');
  if (!PRIORITIES.includes(command.priority)) {
    invalid('NotificationCommand.priority must be NORMAL or ESSENTIAL.');
  }
  if (command.title !== undefined && command.title !== null && typeof command.title !== 'string') {
    invalid('NotificationCommand.title must be a string or null.');
  }
  const batch = command.batch;
  if (batch !== undefined && batch !== null) {
    requireText(batch.key, 'batch.key');
    if (
      batch.itemCount !== undefined &&
      (!Number.isInteger(batch.itemCount) || batch.itemCount < 1)
    ) {
      invalid('NotificationCommand.batch.itemCount must be a positive integer.');
    }
  }
  assertTiming(command.timing);
}

/**
 * Narrows a stored priority string. Stores hand back plain strings, so this
 * conversion still exists; unlike the source it throws a typed error rather than
 * a bare one, and the dispatcher lets that failure kill one delivery instead of
 * the page (design 3.3.4).
 */
export function notificationPriorityFrom(value: string): NotificationPriority {
  if (value === 'NORMAL' || value === 'ESSENTIAL') return value;
  throw new NotificationsError(
    'ERR_NOTIFICATION_PRIORITY_UNSUPPORTED',
    `Unsupported notification priority: ${value}`,
  );
}
