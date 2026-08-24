/**
 * 타입드 에러와 에러 코드 축약.
 *
 * 소스는 `new Error(문자열)`과 Nest 예외를 섞어 던졌다(설계 §0.2-⑧). AGENTS.md §2가
 * 요구하는 것은 안정적인 code 유니언과 type guard이고, 이 파일이 그 둘을 소유한다.
 */

/** Stable, closed set of error codes this package throws. */
export type NotificationsErrorCode =
  | 'ERR_NOTIFICATION_COMMAND_INVALID'
  | 'ERR_NOTIFICATION_APPLICATION_KEY_INVALID'
  | 'ERR_NOTIFICATION_RECIPIENT_KEY_INPUT'
  | 'ERR_NOTIFICATION_POLICY_INVALID'
  | 'ERR_NOTIFICATION_TIMEZONE_INVALID'
  | 'ERR_NOTIFICATION_PRIORITY_UNSUPPORTED'
  | 'ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED'
  | 'ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE'
  | 'ERR_NOTIFICATION_CONFIG_INVALID';

/**
 * Brand read by {@link isNotificationsError}. A global symbol on purpose: a dual
 * CJS/ESM load can produce two distinct classes, and `instanceof` then fails for
 * an error the other copy threw (design 2.5).
 */
const NOTIFICATIONS_ERROR_BRAND: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:error',
);

/** Error thrown by every public entry point of this package. */
export class NotificationsError extends Error {
  /** Stable code. Compare against this, never against `message`. */
  readonly code: NotificationsErrorCode;

  constructor(
    code: NotificationsErrorCode,
    message: string,
    options?: { readonly cause?: unknown },
  ) {
    super(message);
    this.name = 'NotificationsError';
    this.code = code;
    if (options !== undefined && options.cause !== undefined) this.cause = options.cause;
    Object.defineProperty(this, NOTIFICATIONS_ERROR_BRAND, {
      value: true,
      enumerable: false,
    });
  }
}

/**
 * Prefer this over `instanceof`: dual CJS/ESM loads can produce two classes, and
 * the brand survives that (design 2.5).
 */
export function isNotificationsError(value: unknown): value is NotificationsError {
  if (value instanceof NotificationsError) return true;
  if (typeof value !== 'object' || value === null) return false;
  return (value as Record<PropertyKey, unknown>)[NOTIFICATIONS_ERROR_BRAND] === true;
}

/** Default cap for {@link safeErrorCode}. */
const DEFAULT_ERROR_CODE_LIMIT = 120;

function rawCode(error: unknown): string {
  if (isNotificationsError(error)) return error.code;
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { readonly code?: unknown; readonly name?: unknown };
    if (typeof candidate.code === 'string' && candidate.code.length > 0) return candidate.code;
    if (typeof candidate.name === 'string' && candidate.name.length > 0) return candidate.name;
  }
  return 'unknown-error';
}

/**
 * Shortens any thrown value to a stable, secret-free code.
 *
 * The exception message is never part of the result: it can carry recipient
 * data, connection strings or tokens, and the value produced here is written to
 * the host's store and to logs (design 3.4.6).
 */
export function safeErrorCode(error: unknown, limit: number = DEFAULT_ERROR_CODE_LIMIT): string {
  const code = rawCode(error);
  const bound = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_ERROR_CODE_LIMIT;
  return code.length <= bound ? code : code.slice(0, bound);
}
