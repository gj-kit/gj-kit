// 공개 에러 — 코드 14종 (설계 §5.6).
//
// ⚠ `instanceof`는 신뢰할 수 없다: tsup `splitting:false`가 엔트리마다 코어를 복제하므로
//   `.`과 `./core`는 **서로 다른 클래스 객체**를 갖는다. 판정은 `Symbol.for` 태그로 한다.

export const WORKOUTS_ERROR_CODES = [
  /** No usable health store in this runtime: web, Node, SSR, Expo Go, iPad, Android < 28. Hide the feature. */
  'unavailable',
  /** Android 9–13 without the Play Health Connect provider. Call `openStoreListing()`. */
  'updateRequired',
  /** The platform positively refused for lack of permission. NEVER thrown by an iOS read. */
  'notAuthorized',
  /** A route EXISTS but is not readable now. Retry with `{ consent: 'prompt' }` from the foreground. */
  'consentRequired',
  /** Android: the window reaches past the 30-day history wall and READ_HEALTH_DATA_HISTORY is absent. */
  'historyRequired',
  /** Read quota exhausted. `retryAfterMs` is OUR budget's estimate — the platform publishes none. */
  'rateLimited',
  /** The store is busy (data-sync in progress), or a UI-bound operation is already in flight. */
  'busy',
  /** Caller input the library refused before touching the platform. A programming error; fix the call. */
  'invalidArgument',
  /** Android: the serialised record would exceed the 1 000 000-byte single-record ceiling. */
  'routeTooLarge',
  /** The stored version is newer than the one supplied. Re-read your own state and retry. */
  'staleVersion',
  /** iOS: protected data is unavailable (device locked). Retry after unlock. */
  'storeLocked',
  /** A UI-bound operation was terminated by activity/process lifecycle before it could answer. */
  'cancelled',
  /** The platform failed to deliver: IPC failure, database failure, a route insert that errored. */
  'io',
  /** A platform outcome this library does not model. Always a bug report. */
  'internal',
] as const;

export type WorkoutsErrorCode = (typeof WORKOUTS_ERROR_CODES)[number];

export interface WorkoutsErrorOptions {
  readonly cause?: unknown;
  /** Only meaningful with code 'rateLimited'. */
  readonly retryAfterMs?: number | undefined;
  /**
   * A short, TEMPLATE-BUILT diagnostic string from the native layer: exception class name, platform
   * error code, and a bounded reason token. NEVER coordinates, heart rates, distances, energies,
   * step counts, titles or notes — a source-scan guard enforces this.
   */
  readonly nativeMessage?: string | undefined;
}

/**
 * 엔트리 사본 간 인식 태그. `splitting:false`가 만든 클래스 복제를 이 심볼 하나가 상쇄한다.
 * 문자열은 **절대 바꾸지 않는다** — 바꾸는 순간 소비자의 `catch`가 조용히 실패한다.
 */
const WORKOUTS_ERROR_TAG: unique symbol = Symbol.for('gj-kit.workouts.error');

export class WorkoutsError extends Error {
  readonly code: WorkoutsErrorCode;
  readonly retryAfterMs?: number | undefined;
  readonly nativeMessage?: string | undefined;
  /** 사본 인식 태그 — `isWorkoutsError`의 유일한 판정 근거다. */
  readonly [WORKOUTS_ERROR_TAG]: true = true;

  constructor(code: WorkoutsErrorCode, message: string, options?: WorkoutsErrorOptions) {
    super(message, options !== undefined && 'cause' in options ? { cause: options.cause } : undefined);
    this.name = 'WorkoutsError';
    this.code = code;
    this.retryAfterMs = options?.retryAfterMs;
    this.nativeMessage = options?.nativeMessage;
  }
}

/**
 * `instanceof` is unreliable across entries (see the file header). This guard uses the
 * `Symbol.for('gj-kit.workouts.error')` tag, which every copy of the class shares.
 */
export function isWorkoutsError(error: unknown): error is WorkoutsError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as Record<symbol, unknown>)[WORKOUTS_ERROR_TAG] === true
  );
}

/** `null` for anything that is not one of ours. */
export function workoutsErrorCode(error: unknown): WorkoutsErrorCode | null {
  return isWorkoutsError(error) ? error.code : null;
}

/**
 * Call it from a `switch` default so a future code becomes a compile error for you.
 * ⚠ This is only honest because the code union is CLOSED for 1.x: adding a code is a major.
 */
export function assertNeverWorkoutsCode(code: never): never {
  throw new WorkoutsError('internal', `Unhandled workouts error code: ${String(code)}`);
}
