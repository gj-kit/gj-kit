/**
 * browser 내부 공용 헬퍼 — index.ts에서 재export하지 않는다 (공개 표면 아님).
 *
 * SDK 로드는 반드시 동적 import: `@tosspayments/tosspayments-sdk`는 optional peer라
 * 정적 import를 쓰면 미설치 환경에서 이 엔트리의 로드 자체가 깨진다.
 */
import { err, ok, type Result } from '../core/result';
import type { SdkError } from './widgets';

/** SDK 모듈 타입 — 타입 질의만 사용(런타임 참조 없음, 정적 import 금지 유지). */
export type TossSdkModule = typeof import('@tosspayments/tosspayments-sdk');

export interface SdkLoadFailure {
  readonly kind: 'load-failed';
  readonly cause: unknown;
}

/** optional peer 동적 로드 — 미설치/번들 제외 시 여기서 실패를 Result로 회수한다. */
export async function importSdk(): Promise<Result<TossSdkModule, SdkLoadFailure>> {
  try {
    return ok(await import('@tosspayments/tosspayments-sdk'));
  } catch (cause) {
    return err({ kind: 'load-failed', cause });
  }
}

/**
 * SDK가 던진 예외 → SdkError. SDK 공개 에러는 {code, message} 형태이므로 둘을 추출하고,
 * 형태가 다르면 code 'UNKNOWN'으로 원문 메시지만 보존한다.
 */
export function toSdkError(cause: unknown): SdkError {
  let code = 'UNKNOWN';
  let message = cause instanceof Error ? cause.message : String(cause);
  if (typeof cause === 'object' && cause !== null) {
    if ('code' in cause && typeof cause.code === 'string' && cause.code !== '') {
      code = cause.code;
    }
    if ('message' in cause && typeof cause.message === 'string') {
      message = cause.message;
    }
  }
  return { kind: 'sdk', code, message };
}

/**
 * 사용자 취소 코드 판별 — USER_CANCEL(SDK UserCancelError) / PAY_PROCESS_CANCELED(failUrl 계열).
 * 사용자 취소는 에러가 아니라 정상 outcome variant로 다룬다 (설계 §3.5).
 */
export function asUserCancelCode(code: string): 'USER_CANCEL' | 'PAY_PROCESS_CANCELED' | null {
  return code === 'USER_CANCEL' || code === 'PAY_PROCESS_CANCELED' ? code : null;
}

/** SDK 호출 예외를 Err(SdkError)로 회수하는 공통 골격. */
export async function callSdk<T>(run: () => Promise<T>): Promise<Result<T, SdkError>> {
  try {
    return ok(await run());
  } catch (cause) {
    return err(toSdkError(cause));
  }
}
