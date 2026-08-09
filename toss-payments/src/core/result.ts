/**
 * Result — plain 판별 유니언 + 자유 함수 콤비네이터.
 * 메서드 클래스 금지(직렬화 안전) — 값은 어디서든 plain 객체다.
 */
export type Result<T, E> = Ok<T> | Err<E>;

export interface Ok<out T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<out E> {
  readonly ok: false;
  readonly error: E;
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}

/** 성공 값만 변환 — 실패는 그대로 통과한다. */
export function map<T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> {
  return r.ok ? ok(f(r.value)) : r;
}

/** 실패 값만 변환 — 성공은 그대로 통과한다. */
export function mapErr<T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> {
  return r.ok ? r : err(f(r.error));
}

/** 성공 시 다음 Result 연산으로 연결 — 에러 타입은 합집합으로 누적된다. */
export function andThen<T, U, E, F>(
  r: Result<T, E>,
  f: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return r.ok ? f(r.value) : r;
}

/** 실패 시 대체 값을 반환한다. */
export function unwrapOr<T, E>(r: Result<T, E>, fallback: T): T {
  return r.ok ? r.value : fallback;
}

/**
 * 유일한 throw 탈출구 — **부팅 시 설정 파싱(키 로드) 전용**.
 *
 * 요청 처리 경로에서는 사용하지 말 것: 이 라이브러리의 모든 공개 작업은 Result를
 * 반환하며, 요청 경로의 실패는 판별자 내로잉(`if (!r.ok)`)으로 다뤄야 한다.
 * 메서드가 아닌 자유 함수인 이유: Result 값은 어디서든 plain 객체로 직렬화 안전해야 한다.
 *
 * @param context - 던지는 Error 메시지 앞에 붙는 식별 문맥 (예: 'TOSS_SECRET_KEY')
 * @throws Error - 실패 변형일 때. `cause`에 원본 에러 값을 보존한다.
 */
export function orThrow<T, E>(r: Result<T, E>, context?: string): T {
  if (r.ok) return r.value;
  const detail = describeError(r.error);
  throw new Error(context === undefined ? `orThrow: ${detail}` : `${context}: ${detail}`, {
    cause: r.error,
  });
}

function describeError(error: unknown): string {
  try {
    // JSON.stringify는 undefined/함수 입력에서 undefined를 반환할 수 있다 (타입은 string)
    const json: string | undefined = JSON.stringify(error);
    return json ?? String(error);
  } catch {
    return String(error);
  }
}
