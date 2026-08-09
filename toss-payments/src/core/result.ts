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

// Phase 3에서 구현: map / mapErr / andThen / unwrapOr / orThrow(부팅 전용 탈출구)
