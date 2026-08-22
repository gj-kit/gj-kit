// 결함 A — **타입 있는 에러 계약이 브리지를 건너 살아남는가** (설계 §5.6 · §5.7 · 미션 D9).
//
// 이 파일의 페이로드는 상상이 아니라 설치본을 읽고 만든 것이다:
//   iOS   `expo-modules-core/ios/Core/Functions/ConcurrentFunctionDefinition.swift`가
//         `FunctionCallException(name).causedBy(error)`를 던지고,
//         `AnyFunctionDefinition.swift`의 `FunctionCallException.code`가 cause의 code를 승계하며,
//         `Exception.debugDescription`이 `"<이름>: <이유> (at <파일>:<줄>)"`에 `"→ Caused by: …"`를
//         이어 붙인다. 그 문자열이 `JavaScriptError.init(_:from:)`을 통해 JS `Error.message`가 된다.
//   Android `expo/modules/kotlin/exception/CodedException.kt`의 `DecoratedException`이 cause의
//         code를 승계하고 메시지를 `"Call to function 'M.f' has been rejected.\n→ Caused by: …"`로
//         만들며, `JavaCallback.cpp`의 `makeCodedError`가 JS `CodedError(code, message)`를 만든다.
//
// example 앱에서 실제로 관측된 두 문자열이 아래 `IOS_WRAPPED`·`ANDROID_WRAPPED`의 본문이다.

import { describe, expect, it } from 'vitest';

import { isWorkoutsError, WorkoutsError } from '../../src/core/errors';
import { mapNativeError, nativeErrorCodeFor, workoutsExceptionClassName } from '../../src/core/mapErrors';

/** Android 쪽 JS 표현. `expo-modules-core/src/errors/CodedError.ts`와 같은 모양이다. */
class CodedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CodedError';
  }
}

/** iOS 쪽 JS 표현: 평범한 `Error` + 나중에 붙는 `code` 프로퍼티. */
function iosError(message: string, code?: string): Error {
  const error = new Error(message);
  if (code !== undefined) (error as Error & { code?: string }).code = code;
  return error;
}

const IOS_WRAPPED = [
  "FunctionCallException: Calling the 'takeCheckpoint' function has failed",
  ' (at ExpoModulesCore/ConcurrentFunctionDefinition.swift:88)',
  '\n→ Caused by: WorkoutsConsentRequiredException: Route consent required: foreign session',
  ' (at GjKitWorkouts/WorkoutsExceptions.swift:71)',
].join('');

const ANDROID_WRAPPED = [
  "Call to function 'GjKitWorkouts.takeCheckpoint' has been rejected.",
  '\n→ Caused by: Internal: changesToken is a Phase 2 stub; Phase 3 implements it',
].join('');

/**
 * **NEGATIVE CONTROL.** Phase 2의 매핑을 그대로 재현한 것 — 최상위 `code`만 보고, `cause` 체인도
 * 메시지 텍스트도 보지 않는다. 아래 테스트들은 이것과 실제 구현이 **다른 답을 낸다**는 것을
 * 단언하므로, 언랩을 되돌리면 그 테스트들이 즉시 실패한다.
 */
function phase2Map(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'internal';
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return 'internal';
  return code === nativeErrorCodeFor('consentRequired')
    ? 'consentRequired'
    : code === nativeErrorCodeFor('internal')
      ? 'internal'
      : 'internal';
}

describe('mapNativeError — iOS 래퍼 모양', () => {
  it('브리지가 code를 실어 보낸 경우 그대로 산다', () => {
    const mapped = mapNativeError(iosError(IOS_WRAPPED, nativeErrorCodeFor('consentRequired')));
    expect(mapped.code).toBe('consentRequired');
    expect(isWorkoutsError(mapped)).toBe(true);
  });

  it('code가 유실돼도 메시지 안의 클래스 이름에서 회수한다 — negative control이 함께 증명한다', () => {
    const raw = iosError(IOS_WRAPPED);
    expect(mapNativeError(raw).code).toBe('consentRequired');
    // 언랩이 없으면 이 값은 'internal'이다. 즉 이 한 줄이 회수 로직의 존재를 증명한다.
    expect(phase2Map(raw)).toBe('internal');
  });

  it('공개 message는 언제나 우리 문장이고, 네이티브 원문은 진단 필드로만 간다', () => {
    const mapped = mapNativeError(iosError(IOS_WRAPPED), 'Taking the sync checkpoint failed.');
    expect(mapped.message).toBe('Taking the sync checkpoint failed.');
    expect(mapped.message).not.toContain('ConcurrentFunctionDefinition');
    expect(mapped.nativeMessage).toContain('WorkoutsConsentRequiredException');
    expect(mapped.cause).toBe(mapped.cause);
  });
});

describe('mapNativeError — Android 래퍼 모양', () => {
  it('DecoratedException이 승계한 code를 읽는다', () => {
    const mapped = mapNativeError(new CodedError(nativeErrorCodeFor('internal'), ANDROID_WRAPPED));
    expect(mapped.code).toBe('internal');
    expect(mapped.nativeMessage).toContain('has been rejected');
  });

  it('UnexpectedException으로 떨어진 경우 FQCN에서 회수한다', () => {
    // `UnexpectedException(throwable)`의 메시지는 `throwable.toString()`이다.
    const raw = new CodedError('ERR_UNEXPECTED', 'kit.gj.workouts.WorkoutsIoException: I/O failure: insertRecords');
    expect(mapNativeError(raw).code).toBe('io');
    expect(phase2Map(raw)).toBe('internal');
  });

  it('errorCode 7은 메시지가 판별자다 (f99 · f101)', () => {
    expect(
      mapNativeError({ platformCode: 7, message: 'Record size exceeded the single record size limit: 1000000' }).code,
    ).toBe('routeTooLarge');
    expect(mapNativeError({ platformCode: 7, message: 'API call quota exceeded' }).code).toBe('rateLimited');
    expect(mapNativeError({ platformCode: 8 }).code).toBe('busy');
    expect(mapNativeError({ platformCode: 9 }).code).toBe('internal');
  });
});

describe('mapNativeError — cause 체인', () => {
  it('중첩된 cause의 code를 찾아낸다', () => {
    const inner = new CodedError(nativeErrorCodeFor('routeTooLarge'), 'Route too large');
    const outer = new Error('outer wrapper');
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(mapNativeError(outer).code).toBe('routeTooLarge');
    expect(phase2Map(outer)).toBe('internal');
  });

  it('세 겹까지 내려가고 가장 가까운 아는 코드를 고른다', () => {
    const deepest = { code: nativeErrorCodeFor('staleVersion'), message: 'stale' };
    const middle = { code: 'ERR_UNEXPECTED', message: 'middle', cause: deepest };
    const top = { code: 'ERR_UNEXPECTED', message: 'top', cause: middle };
    expect(mapNativeError(top).code).toBe('staleVersion');
  });

  it('cause가 순환해도 끝난다', () => {
    const a: Record<string, unknown> = { message: 'a' };
    const b: Record<string, unknown> = { message: 'b', cause: a };
    a['cause'] = b;
    expect(mapNativeError(a).code).toBe('internal');
  });

  it('이미 WorkoutsError면 그대로 통과시킨다 — cause에 묻혀 있어도', () => {
    const ours = new WorkoutsError('busy', 'busy');
    expect(mapNativeError(ours)).toBe(ours);
    const wrapped = new Error('bridge');
    (wrapped as Error & { cause?: unknown }).cause = ours;
    expect(mapNativeError(wrapped)).toBe(ours);
  });
});

describe('mapNativeError — 알 수 없는 것과 Error가 아닌 것', () => {
  it('모르는 코드는 internal이고 원문은 nativeMessage에만 남는다', () => {
    const mapped = mapNativeError({ code: 'ERR_SOMETHING_WE_DO_NOT_MODEL', message: 'boom' });
    expect(mapped.code).toBe('internal');
    expect(mapped.nativeMessage).toBe('boom');
    expect(mapped.message).not.toContain('boom');
  });

  it('Error가 아닌 reject도 던지지 않고 접힌다', () => {
    for (const raw of ['a bare string', 42, null, undefined, true, Symbol.iterator]) {
      const mapped = mapNativeError(raw);
      expect(isWorkoutsError(mapped)).toBe(true);
      expect(mapped.code).toBe('internal');
    }
    expect(mapNativeError('a bare string').nativeMessage).toBe('a bare string');
  });

  it('nativeMessage는 상한이 있다 — 무한 길이 문자열이 로그로 새지 않는다', () => {
    const mapped = mapNativeError(new Error('x'.repeat(5000)));
    expect((mapped.nativeMessage ?? '').length).toBeLessThanOrEqual(600);
  });
});

describe('세 이름은 하나의 유니언에서 유도된다 — 손으로 유지하는 표가 없다', () => {
  it('14종 전부가 왕복한다', () => {
    for (const code of [
      'unavailable',
      'updateRequired',
      'notAuthorized',
      'consentRequired',
      'historyRequired',
      'rateLimited',
      'busy',
      'invalidArgument',
      'routeTooLarge',
      'staleVersion',
      'storeLocked',
      'cancelled',
      'io',
      'internal',
    ] as const) {
      expect(mapNativeError({ code: nativeErrorCodeFor(code) }).code, code).toBe(code);
      // 클래스 이름만 메시지에 있어도 회수된다 — iOS에서 code가 유실된 경우의 경로다.
      expect(
        mapNativeError(new Error(`FunctionCallException: failed\n→ Caused by: ${workoutsExceptionClassName(code)}: x`))
          .code,
        code,
      ).toBe(code);
    }
  });
});
