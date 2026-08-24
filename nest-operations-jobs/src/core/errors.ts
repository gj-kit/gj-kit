/**
 * 에러 코드 체계 — HTTP 매핑(`src/nest/http.ts`)과 CLI exit code의 유일한 입력.
 * 코드는 공개 계약이므로 추가는 additive, 제거·의미 변경은 breaking change다.
 */

/** Stable error codes. Every failure this package reports carries exactly one. */
export type OperationsJobsErrorCode =
  /** No job registered under this key. */
  | 'ERR_JOB_UNKNOWN'
  /** Jobs are still being collected (Nest bootstrap has not finished). */
  | 'ERR_JOB_REGISTRY_NOT_READY'
  /** Malformed or over-long job key (boot). */
  | 'ERR_JOB_KEY_INVALID'
  /** Two jobs claim the same key (boot). */
  | 'ERR_JOB_DUPLICATE_KEY'
  /** Malformed job object (boot). */
  | 'ERR_JOB_INVALID'
  /** Malformed cron shape or unknown time zone (boot). */
  | 'ERR_JOB_SCHEDULE_INVALID'
  /** The job's validator rejected the body. */
  | 'ERR_JOB_INPUT_INVALID'
  /** A body was sent to a job that takes none. */
  | 'ERR_JOB_INPUT_UNEXPECTED'
  /** The deadline passed. */
  | 'ERR_JOB_TIMEOUT'
  /** Claim lost or unverifiable, or the caller's signal aborted. */
  | 'ERR_JOB_ABORTED'
  /** The body threw, or reported `ok: false`. */
  | 'ERR_JOB_FAILED'
  /** The run store failed. */
  | 'ERR_JOB_STORE'
  /** Trigger authentication failed. */
  | 'ERR_JOB_UNAUTHORIZED'
  /** No authentication configured (wiring). */
  | 'ERR_JOB_AUTH_MISCONFIGURED';

export interface OperationsJobsErrorContext {
  readonly jobKey?: string | undefined;
  readonly runId?: string | undefined;
}

/**
 * Brand carried on every instance so cross-module-instance detection works.
 *
 * A **registered** symbol: `Symbol.for` returns the identical symbol in every
 * module instance, which is the whole point (§7-7 CJS dual load). It is
 * deliberately not `Symbol.toStringTag` — overriding that one would change the
 * spec-level string tag of every error this package throws, so a host serializer
 * checking `Object.prototype.toString.call(value) === '[object Error]'` would
 * stop recognising them. The property is installed non-enumerably in the
 * constructor rather than declared as a class field, so it stays out of the
 * emitted declarations and out of `JSON.stringify`.
 */
const OPERATIONS_JOBS_ERROR_BRAND: unique symbol = Symbol.for(
  '@gj-kit/nest-operations-jobs:error',
);

/**
 * The only error type this package throws.
 *
 * `message` carries the job key and the reason and nothing else — consumer data,
 * stack traces and validation-library output live on `cause`, which never
 * reaches an HTTP response.
 */
export class OperationsJobsError extends Error {
  readonly code: OperationsJobsErrorCode;
  readonly jobKey?: string | undefined;
  readonly runId?: string | undefined;

  constructor(
    code: OperationsJobsErrorCode,
    message: string,
    options?: OperationsJobsErrorContext & { readonly cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'OperationsJobsError';
    this.code = code;
    if (options?.jobKey !== undefined) this.jobKey = options.jobKey;
    if (options?.runId !== undefined) this.runId = options.runId;
    // 클래스 필드가 아니라 여기서 심는다 — .d.ts에 브랜드가 새지 않고,
    // 열거 불가라 JSON 직렬화에도 나타나지 않는다.
    Object.defineProperty(this, OPERATIONS_JOBS_ERROR_BRAND, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

/**
 * Prefer this over `instanceof`: a CJS consumer can load `.` and `./core` as two
 * module instances, and `instanceof` across them is false for the same error.
 */
export function isOperationsJobsError(value: unknown): value is OperationsJobsError {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as { [OPERATIONS_JOBS_ERROR_BRAND]?: unknown; code?: unknown };
  return candidate[OPERATIONS_JOBS_ERROR_BRAND] === true && typeof candidate.code === 'string';
}
