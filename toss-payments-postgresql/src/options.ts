/**
 * @internal aggregate 옵션 검증 — PostgreSQL aggregate와 `./testing`의 인메모리 대역이 같은
 * fail-fast 규칙을 공유한다. 기본값도 여기서 한 번만 정의한다.
 */

/** completed dedupe 행 TTL 기본 5일 — 코어 TSDoc "토스 최장 재전송 기간보다 긴 TTL, 권장 5일". */
export const DEFAULT_COMPLETED_TTL_SECONDS = 432_000;
/** cancel_retries 보존 기본 15일 — 토스 멱등키 유효기간과 일치. */
export const DEFAULT_CANCEL_RETRY_DAYS = 15;
/** processing dedupe 행의 crash-recovery lease 기본 60초. */
export const DEFAULT_LEASE_SECONDS = 60;

export function assertPositiveFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`[@gj-kit/toss-payments-postgresql] ${label}은(는) 양의 유한 숫자여야 합니다.`);
  }
}

/**
 * `make_interval(days => $1)`의 days 파라미터는 PostgreSQL **integer**다 —
 * secs(double precision)와 달리 소수(예: 0.5)를 주면 조립 시점이 아니라 첫
 * cleanup() 호출에서야 드라이버 캐스트 에러로 터진다. fail-fast 원칙대로
 * 조립 시점에 정수를 강제한다.
 */
export function assertPositiveInteger(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`[@gj-kit/toss-payments-postgresql] ${label}은(는) 양의 정수여야 합니다.`);
  }
}
