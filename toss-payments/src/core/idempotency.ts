// 멱등키 유도·재생 창·조회 우선 판정 — 환경 중립 순수 함수.
//
// 소비 앱마다 손으로 굴리던 provider 지식(15일 TTL, 결정적 키 + attempt 접미사,
// "이 에러 뒤에는 조회부터") 을 라이브러리 계약으로 올린다. 네트워크·저장소 접근 없음.
//
// 내부 근거 문서(의도적으로 `//` 주석 — d.ts로 배포되지 않는다. 공개 JSDoc은 npm 소비자가
// 열 수 있는 공식 문서만 인용한다): docs/research/toss-payments-v2.md —
// "열린 질문 7개의 확정 답 › 1. 멱등키 헤더 이름"(공식 레퍼런스 전사: 최대 300자, 처음 사용일부터
// 15일, 모든 POST), "멱등키 — 에러 응답도 멱등 재생됨"(4xx 재생 실측), "라이브러리 설계
// 시사점"(15일 뒤 재사용은 새 요청으로 처리될 *수 있음* — 명시 서술은 확인 못함).
import type { TossApiFailure, TransportFailure } from './errors';
import { idempotencyKey, type IdempotencyKey, type InvalidInput } from './ids';
import { err, type Result } from './result';

/**
 * How long Toss binds an `Idempotency-Key` to its first response: **15 days from first use**,
 * in milliseconds.
 *
 * Source: Toss Payments API reference, "Using the API › Authorization", `Idempotency-Key`
 * section (docs.tosspayments.com/reference/using-api/authorization): max 300 characters, valid
 * for 15 days from the first use, applies to every POST. What happens to a key reused *after*
 * the window is not explicitly documented; treat it as unsafe — the same key **may be executed
 * as a brand-new request** — so a long-lived retry queue must stop resubmitting with the same
 * key once the window has passed and fall back to a lookup.
 *
 * Measured against the test environment: 4xx error responses are bound to the key for the same
 * window, so a key that received a definitive 4xx cannot be "fixed" by resending — derive a new
 * attempt instead (see {@link deriveIdempotencyKey}).
 */
export const TOSS_IDEMPOTENCY_KEY_TTL_MS = 15 * 24 * 60 * 60 * 1000;

/**
 * Conservative replay window used by {@link isWithinIdempotencyReplayWindow} when no explicit
 * window is given: **14 days** — one full day of margin below {@link TOSS_IDEMPOTENCY_KEY_TTL_MS}.
 *
 * Two regimes split at this boundary:
 *
 * - **Replay within the window** — resending the *same* key with the *same* body is safe: if the
 *   first request reached Toss, the original response is replayed byte-for-byte and nothing is
 *   executed twice; if it never arrived, it runs once now.
 * - **New attempt after the window** — the same key may be executed as a brand-new request.
 *   Do **not** resubmit. The only safe automatic action is to look the outcome up
 *   (`getPaymentByOrderId` / `getPayment`) and decide from the durable state; a genuinely new
 *   charge needs a new key (a new `attempt`) and an explicit decision.
 *
 * Why a day of margin: the provider states the window at day granularity ("15 days from first
 * use") without specifying the boundary or time zone, so the real cutoff may land earlier than
 * 15 × 24 h after the first request; and the caller's clock and the provider's clock drift. A
 * whole day absorbs both without guessing. The precondition this relies on is that `issuedAt`
 * was recorded **no later than** the first network attempt — then it is a lower bound on the
 * provider's first-use time and a window measured from it can only be conservative. The
 * library's own `CancelRetryTicket` expires on this same 14-day window.
 */
export const DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Separator between `operation` and each element of `parts` in a derived key.
 * Excluded from every segment, which is what makes the encoding injective.
 */
const SEGMENT_SEPARATOR = ':';
/**
 * Marker that introduces the `attempt` suffix in a derived key. Excluded from every segment, so
 * a derived key contains it exactly once when an attempt was given and never otherwise.
 */
const ATTEMPT_MARKER = '#';
/** Same header-safe set as the `idempotencyKey` parser (visible ASCII, no whitespace). */
const SEGMENT_CHARSET = /^[\x21-\x7E]+$/;

/** Input for {@link deriveIdempotencyKey}. */
export interface DeriveIdempotencyKeyInput {
  /** Logical operation name, e.g. `'billing_initial_charge'` or `'subscription_renewal'`. */
  readonly operation: string;
  /**
   * Identity of the logical business event — ids and period markers that make the key
   * deterministic (subscription id, period start epoch, quote id, …). Never put raw
   * billing/auth keys, card or account numbers here: the key travels in request headers and
   * audit logs.
   */
  readonly parts: readonly string[];
  /**
   * Optional attempt discriminator. Omit it for the first submission; supply a fresh value
   * (e.g. a UUID) for a *new* attempt after a definitive 4xx, because Toss replays the original
   * 4xx for the same key for 15 days. Keep it **absent** when you intend a replay
   * (transport failure, `IDEMPOTENT_REQUEST_PROCESSING`).
   */
  readonly attempt?: string | undefined;
}

/**
 * Deterministically derives an `Idempotency-Key` from a logical operation identity.
 *
 * Format: `<operation>:<part>:<part>…` (segments joined by `:`; with no `parts` the key is just
 * `<operation>`), plus `#<attempt>` when `attempt` is given. Example:
 * `subscription_renewal:sub_01:1756652400000` and, for a new attempt,
 * `subscription_renewal:sub_01:1756652400000#7c9e…`. The same input always yields the same key,
 * so a crash-recovered worker reproduces the key it submitted before and gets Toss's replay
 * instead of a second execution.
 *
 * **The encoding is injective — distinct inputs never derive the same key.** Every segment
 * (`operation`, each element of `parts`, `attempt`) must be non-empty (`reason: 'empty'`) and
 * must consist of visible ASCII **excluding** the two delimiters `:` and `#`
 * (`reason: 'bad-charset'`). Because no segment can contain a delimiter, a key contains `#`
 * exactly once iff an attempt was given, and the prefix splits on `:` back into exactly
 * `operation` + `parts`. Underscores, dots, `@`, `=`, `-` and the like are fine, so the ids the
 * library already validates (`orderId`, `customerKey`, `cancelRequestId`, UUIDs, epoch strings)
 * all pass unchanged; ISO timestamps with `:` do not — use an epoch or a date-only marker.
 *
 * The assembled key then runs through the public {@link idempotencyKey} parser so the provider
 * length limit (1–300 chars, otherwise 400 `INVALID_IDEMPOTENCY_KEY` — `reason: 'too-long'`) and
 * the header-safe charset are enforced in exactly one place: an `Ok` result is always sendable.
 *
 * This is an **explicit** helper: the library never derives keys behind your back, because a
 * deterministic key combined with 4xx replay is a trap the caller must consciously manage with
 * the `attempt` field.
 */
export function deriveIdempotencyKey(
  input: DeriveIdempotencyKeyInput,
): Result<IdempotencyKey, InvalidInput<'idempotencyKey'>> {
  const segments = [input.operation, ...input.parts];
  if (input.attempt !== undefined) segments.push(input.attempt);
  for (const segment of segments) {
    if (segment.length === 0) return invalid('empty');
    if (
      !SEGMENT_CHARSET.test(segment) ||
      segment.includes(SEGMENT_SEPARATOR) ||
      segment.includes(ATTEMPT_MARKER)
    ) {
      return invalid('bad-charset');
    }
  }
  const base = [input.operation, ...input.parts].join(SEGMENT_SEPARATOR);
  const raw = input.attempt === undefined ? base : `${base}${ATTEMPT_MARKER}${input.attempt}`;
  return idempotencyKey(raw);
}

function invalid(
  reason: InvalidInput<'idempotencyKey'>['reason'],
): Result<never, InvalidInput<'idempotencyKey'>> {
  return err({ source: 'library', kind: 'invalid-input', field: 'idempotencyKey', reason });
}

/**
 * Whether a key first used at `issuedAt` may still be **replayed** (same key, same body) at `now`.
 *
 * Exact semantics: returns `true` when `now - issuedAt < windowMs` — elapsed time strictly less
 * than the window. At exactly `windowMs` the window has closed and the result is `false`.
 * A negative elapsed time (`issuedAt` after `now`, e.g. clock skew) counts as within the window;
 * reject implausible future timestamps separately if your flow needs to. Any non-finite operand
 * (invalid `Date`, `NaN`, `±Infinity` — in `issuedAt`, `now`, or `windowMs`) yields `false`, the
 * side that never resubmits.
 *
 * `windowMs` defaults to {@link DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS}; pass
 * {@link TOSS_IDEMPOTENCY_KEY_TTL_MS} only if you deliberately want the provider's full window
 * with no safety margin.
 */
export function isWithinIdempotencyReplayWindow(
  issuedAt: Date | number,
  now: Date | number,
  windowMs: number = DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS,
): boolean {
  const issuedAtMs = toMillis(issuedAt);
  const nowMs = toMillis(now);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(windowMs)) {
    return false;
  }
  return nowMs - issuedAtMs < windowMs;
}

function toMillis(value: Date | number): number {
  return typeof value === 'number' ? value : value.getTime();
}

/**
 * Toss error codes after which the caller **must look the outcome up** (`getPaymentByOrderId`
 * / `getPayment`) before retrying with a new key or marking the operation failed — the provider
 * may have completed (or be completing) the operation even though the response is an error.
 * Marking such an operation FAILED without a lookup is how "money left, user told it failed"
 * incidents happen.
 *
 * Membership reasons (classification from `classifyTossErrorCode`):
 *
 * - `ALREADY_PROCESSED_PAYMENT` (400, STATE, not retryable) — a confirm for this paymentKey was
 *   already completed, typically by a refreshed page or a duplicate worker. The outcome
 *   *exists*; fetch it and treat it as success rather than failure.
 * - `IDEMPOTENT_REQUEST_PROCESSING` (409, CONCURRENCY) — the original request with this key is
 *   still in flight. Documented instruction: request again and read the result.
 * - `FORBIDDEN_CONSECUTIVE_REQUEST` (403, CONCURRENCY) — a back-to-back request on the same
 *   resource was refused; the earlier one may have succeeded.
 * - `PROVIDER_ERROR` (400, TRANSIENT) — the upstream institution (card company/bank) failed
 *   mid-flight; Toss may hold a partially recorded state. 400 but retryable, which is why the
 *   HTTP status must never drive this decision.
 * - `FAILED_INTERNAL_SYSTEM_PROCESSING`, `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING`,
 *   `COMMON_ERROR` (500, TRANSIENT) — Toss-side processing failed after the request was accepted;
 *   whether the ledger moved is unknown.
 * - `FAILED_REFUND_PROCESS`, `FAILED_METHOD_HANDLING_CANCEL`, `FAILED_PARTIAL_REFUND`
 *   (500, TRANSIENT) — cancel/refund failed on bank latency or method handling; the bank may have
 *   executed the refund. Re-fetch the payment and compare `balanceAmount`/`cancels`.
 * - `FAILED_BILLING_AUTO_CANCEL` (500, TRANSIENT) — the automatic reversal of a billing charge
 *   failed transiently; the charge and/or its reversal may exist.
 * - `FAILED_BILL_KEY_AUTH_CREATION` (500, TRANSIENT) — billing-key issuance failed mid-way.
 *   Toss has no billing-key lookup API, so the "lookup" here is your own `BillingKeyStore`:
 *   check whether a key was already persisted for the customer before issuing again.
 *
 * Invariant kept by this table: every code the library marks `retryable: true` is in this set,
 * because `retryable` means "worth retrying with a **new** key after judgment" (README §5) and
 * that judgment is exactly an outcome lookup. The unit suite checks it against
 * `CLASSIFIED_TOSS_ERROR_CODES` (the code table's own keys), so adding a retryable code to the
 * table without adding it here fails CI. Deliberately **excluded**:
 * `NOT_MATCHES_REFUNDABLE_AMOUNT` (measured: the cancel was not executed — re-fetch to recompute
 * the amount, but there is no outcome uncertainty), every REJECTED/AUTH/REQUEST/AMOUNT/DEADLINE
 * code (definitive refusals), and unregistered codes (the library cannot vouch for them; apply
 * your own policy for unknown 5xx responses).
 */
export const OUTCOME_QUERY_FIRST_ERROR_CODES: readonly string[] = Object.freeze([
  'ALREADY_PROCESSED_PAYMENT',
  'IDEMPOTENT_REQUEST_PROCESSING',
  'FORBIDDEN_CONSECUTIVE_REQUEST',
  'PROVIDER_ERROR',
  'FAILED_INTERNAL_SYSTEM_PROCESSING',
  'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
  'COMMON_ERROR',
  'FAILED_REFUND_PROCESS',
  'FAILED_METHOD_HANDLING_CANCEL',
  'FAILED_PARTIAL_REFUND',
  'FAILED_BILLING_AUTO_CANCEL',
  'FAILED_BILL_KEY_AUTH_CREATION',
]);

const OUTCOME_QUERY_FIRST_SET: ReadonlySet<string> = new Set(OUTCOME_QUERY_FIRST_ERROR_CODES);

/**
 * `true` when the caller must look the payment/billing outcome up before retrying or failing
 * the operation, because the provider may have completed it:
 *
 * - every `TransportFailure` (`NETWORK_ERROR` / `TIMEOUT`) — the request may have reached Toss
 *   and the response was lost;
 * - every `TossApiFailure` whose `code` is in {@link OUTCOME_QUERY_FIRST_ERROR_CODES}.
 *
 * Decided by `source` and `code` only — never by HTTP status (`PROVIDER_ERROR` is a 400 that
 * belongs here; `REFUND_REJECTED` is a 400 that does not). `false` means the error is a
 * definitive refusal as far as the library can tell; unregistered codes return `false`.
 *
 * The lookup itself stays with the caller: for confirm use `resolveConfirmFailure`, for cancel
 * and billing approve re-fetch the payment by orderId and compare against your ledger. Note the
 * two CONCURRENCY codes are special among the `true` cases: the *original* request may still be
 * running, so a lookup that finds nothing (`NOT_FOUND_PAYMENT`) does **not** prove it never
 * happened — replay the same key after a delay instead of minting a new attempt.
 */
export function mustQueryOutcomeBeforeRetry(failure: TossApiFailure | TransportFailure): boolean {
  if (failure.source === 'network') return true;
  return OUTCOME_QUERY_FIRST_SET.has(failure.code);
}
