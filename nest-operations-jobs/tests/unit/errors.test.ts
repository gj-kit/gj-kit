/** §3.8 에러 — CJS 이중 로드에서도 판정이 성립해야 한다(§4-16). */
import { describe, expect, it } from 'vitest';

import { isOperationsJobsError, OperationsJobsError } from '../../src/core/errors';
import * as coreBarrel from '../../src/core';

describe('OperationsJobsError', () => {
  it('code·jobKey·runId·cause를 싣고 message에는 코드와 사유만 남는다', () => {
    const cause = new Error('inner');
    const error = new OperationsJobsError('ERR_JOB_FAILED', 'operations job "a.b" threw', {
      jobKey: 'a.b',
      runId: 'run-1',
      cause,
    });
    expect(error.code).toBe('ERR_JOB_FAILED');
    expect(error.jobKey).toBe('a.b');
    expect(error.runId).toBe('run-1');
    expect(error.cause).toBe(cause);
    expect(error.name).toBe('OperationsJobsError');
    expect(error).toBeInstanceOf(Error);
  });

  it('미지정 컨텍스트는 undefined로 남고 cause도 만들지 않는다', () => {
    const error = new OperationsJobsError('ERR_JOB_UNKNOWN', 'x');
    expect(error.jobKey).toBeUndefined();
    expect(error.runId).toBeUndefined();
    expect(error.cause).toBeUndefined();
  });

  it('§4-16 isOperationsJobsError는 모듈 인스턴스를 건너서도 참이다', () => {
    const fromModule = new OperationsJobsError('ERR_JOB_STORE', 'x');
    const fromBarrel = new coreBarrel.OperationsJobsError('ERR_JOB_STORE', 'x');
    expect(isOperationsJobsError(fromModule)).toBe(true);
    expect(isOperationsJobsError(fromBarrel)).toBe(true);
    expect(coreBarrel.isOperationsJobsError(fromModule)).toBe(true);

    // 다른 realm에서 온 복제본(구조만 같은 값)도 통과해야 한다 — instanceof였다면 실패한다.
    // Symbol.for는 realm을 건너 같은 심볼이므로 브랜드가 그대로 성립한다.
    const structural = Object.assign(Object.create(Error.prototype) as Error, {
      code: 'ERR_JOB_STORE',
      [Symbol.for('@gj-kit/nest-operations-jobs:error')]: true,
    });
    expect(isOperationsJobsError(structural)).toBe(true);
  });

  it('브랜드가 Error의 문자열 태그를 바꾸지 않는다 — 직렬화기의 [object Error] 판정 보존', () => {
    const error = new OperationsJobsError('ERR_JOB_STORE', 'boom');
    expect(Object.prototype.toString.call(error)).toBe('[object Error]');
    // 브랜드는 열거 불가 — JSON에도, Object.keys에도 새지 않는다.
    expect(Object.keys(error)).not.toContain('@gj-kit/nest-operations-jobs:error');
    expect(
      Object.getOwnPropertySymbols(error).includes(
        Symbol.for('@gj-kit/nest-operations-jobs:error'),
      ),
    ).toBe(true);
    expect(
      Object.propertyIsEnumerable.call(error, Symbol.for('@gj-kit/nest-operations-jobs:error')),
    ).toBe(false);
  });

  it('무관한 값은 전부 false', () => {
    for (const value of [null, undefined, 'ERR_JOB_STORE', 42, {}, new Error('plain')]) {
      expect(isOperationsJobsError(value)).toBe(false);
    }
  });
});
