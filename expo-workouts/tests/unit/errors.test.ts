// 에러 클래스 · 가드 · 네이티브 매핑 (설계 §5.6 · §5.7 · §2.4-C).

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT } from '../guards/ast';
import {
  NATIVE_ERROR_CODES,
  WORKOUTS_ERROR_CODES,
  WorkoutsError,
  assertNeverWorkoutsCode,
  isWorkoutsError,
  nativeErrorCodeFor,
  workoutsErrorCode,
  workoutsExceptionClassName,
  type WorkoutsErrorCode,
} from '../../src/core';
import { mapNativeError } from '../../src/core/mapErrors';

describe('WorkoutsError — 14코드 닫힌 유니언', () => {
  it('코드가 정확히 14종이고 중복이 없다', () => {
    expect(WORKOUTS_ERROR_CODES.length).toBe(14);
    expect(new Set(WORKOUTS_ERROR_CODES).size).toBe(14);
  });

  it('code · message · retryAfterMs · nativeMessage · cause를 싣는다', () => {
    const cause = new Error('platform');
    const error = new WorkoutsError('rateLimited', 'Budget exhausted.', {
      cause,
      retryAfterMs: 1234,
      nativeMessage: 'HealthConnectException(7)',
    });
    expect(error.code).toBe('rateLimited');
    expect(error.message).toBe('Budget exhausted.');
    expect(error.retryAfterMs).toBe(1234);
    expect(error.nativeMessage).toBe('HealthConnectException(7)');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('WorkoutsError');
    expect(error instanceof Error).toBe(true);
  });

  it('isWorkoutsError / workoutsErrorCode는 남의 에러에 false·null이다', () => {
    expect(isWorkoutsError(new Error('nope'))).toBe(false);
    expect(isWorkoutsError(null)).toBe(false);
    expect(isWorkoutsError(undefined)).toBe(false);
    expect(isWorkoutsError({ code: 'unavailable' })).toBe(false);
    expect(workoutsErrorCode('unavailable')).toBeNull();
  });

  it('assertNeverWorkoutsCode는 internal로 던진다 — switch default의 안전망이다', () => {
    try {
      assertNeverWorkoutsCode('nope' as never);
      throw new Error('던졌어야 한다');
    } catch (error) {
      expect(workoutsErrorCode(error)).toBe('internal');
    }
  });

  it('14코드 전수 switch가 컴파일되고 assertNever에 닿지 않는다', () => {
    const seen: string[] = [];
    for (const code of WORKOUTS_ERROR_CODES) {
      const value: WorkoutsErrorCode = code;
      switch (value) {
        case 'unavailable':
        case 'updateRequired':
        case 'notAuthorized':
        case 'consentRequired':
        case 'historyRequired':
        case 'rateLimited':
        case 'busy':
        case 'invalidArgument':
        case 'routeTooLarge':
        case 'staleVersion':
        case 'storeLocked':
        case 'cancelled':
        case 'io':
        case 'internal':
          seen.push(value);
          break;
        default:
          assertNeverWorkoutsCode(value);
      }
    }
    expect(seen.length).toBe(14);
  });
});

describe('WorkoutsError — 엔트리 사본 간 인식 (§2.4-C)', () => {
  // `splitting:false`가 엔트리마다 코어를 복제하므로 `.`과 `./core`는 **다른 클래스 객체**를
  // 갖는다. `instanceof`가 깨지는 것이 정상이고, `Symbol.for` 태그가 그것을 상쇄한다.
  it('dist의 두 사본이 서로의 에러를 인식한다 (instanceof는 깨지는 것이 정상)', async () => {
    const coreFile = join(PACKAGE_ROOT, 'dist', 'core.mjs');
    const unsupportedFile = join(PACKAGE_ROOT, 'dist', 'index.unsupported.mjs');
    if (!existsSync(coreFile) || !existsSync(unsupportedFile)) {
      throw new Error('먼저 `pnpm build`가 필요하다 — 이 가드는 산출물을 실제로 로드한다.');
    }
    const core = (await import(coreFile)) as typeof import('../../src/core');
    const entry = (await import(unsupportedFile)) as typeof import('../../src/index.unsupported');

    const fromCore = new core.WorkoutsError('busy', 'from core');
    const fromEntry = new entry.WorkoutsError('busy', 'from entry');

    expect(core.isWorkoutsError(fromEntry)).toBe(true);
    expect(entry.isWorkoutsError(fromCore)).toBe(true);
    expect(core.workoutsErrorCode(fromEntry)).toBe('busy');
    // 사본이 정말 둘이라는 직접 증거 — 이것이 참이라 태그가 필요하다.
    expect(core.WorkoutsError).not.toBe(entry.WorkoutsError);
    expect(fromEntry instanceof core.WorkoutsError).toBe(false);
  });
});

describe('ERR_WORKOUTS_* 유도 (미션 §4.1 · error-code-parity의 TS 쪽 정본)', () => {
  it('세 이름이 하나의 유니언에서 기계적으로 유도된다', () => {
    expect(nativeErrorCodeFor('routeTooLarge')).toBe('ERR_WORKOUTS_ROUTE_TOO_LARGE');
    expect(nativeErrorCodeFor('io')).toBe('ERR_WORKOUTS_IO');
    expect(nativeErrorCodeFor('unavailable')).toBe('ERR_WORKOUTS_UNAVAILABLE');
    expect(workoutsExceptionClassName('unavailable')).toBe('WorkoutsUnavailableException');
    expect(workoutsExceptionClassName('routeTooLarge')).toBe('WorkoutsRouteTooLargeException');
  });

  it('역방향 표가 14종 전수이고 1:1이다', () => {
    expect(Object.keys(NATIVE_ERROR_CODES).length).toBe(14);
    for (const code of WORKOUTS_ERROR_CODES) {
      expect(NATIVE_ERROR_CODES[nativeErrorCodeFor(code)]).toBe(code);
    }
  });
});

describe('mapNativeError — §5.7 매핑표의 대표 행들', () => {
  it('우리 에러는 그대로 통과한다', () => {
    const original = new WorkoutsError('busy', 'busy');
    expect(mapNativeError(original)).toBe(original);
  });

  it('ERR_WORKOUTS_* 코드를 그대로 접는다', () => {
    expect(mapNativeError({ code: 'ERR_WORKOUTS_NOT_AUTHORIZED' }).code).toBe('notAuthorized');
    expect(mapNativeError({ code: 'ERR_WORKOUTS_CONSENT_REQUIRED' }).code).toBe('consentRequired');
  });

  it('예외 클래스 이름으로도 역산한다 (Expo 런타임이 이름에서 코드를 만든다)', () => {
    expect(mapNativeError({ exceptionClass: 'WorkoutsStaleVersionException' }).code).toBe('staleVersion');
  });

  it('HealthConnectException 7은 메시지가 판별자다 (f99 · f101)', () => {
    expect(mapNativeError({ platformCode: 7, message: 'rate limit' }).code).toBe('rateLimited');
    expect(
      mapNativeError({
        platformCode: 7,
        message: 'Record size exceeded the single record size limit: 1000000, was: 1000004',
      }).code,
    ).toBe('routeTooLarge');
  });

  it('8은 busy, 9는 internal이다 (idx f39)', () => {
    expect(mapNativeError({ platformCode: 8 }).code).toBe('busy');
    expect(mapNativeError({ platformCode: 9 }).code).toBe('internal');
  });

  it('모르는 것은 internal이고 원문은 nativeMessage로만 간다', () => {
    const mapped = mapNativeError({ message: 'weird', platformCode: 424242 }, 'The store failed.');
    expect(mapped.code).toBe('internal');
    expect(mapped.message).toBe('The store failed.');
    expect(mapped.nativeMessage).toBe('weird');
  });

  it('문자열·null 같은 비객체도 접는다', () => {
    expect(mapNativeError('boom').code).toBe('internal');
    expect(mapNativeError(null).code).toBe('internal');
  });
});
