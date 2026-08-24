/** §5.3 error-message-shape — HTTP 본문에 스택·원인이 섞이지 않는다. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { OperationsJobsError } from '../../../src/core/errors';
import { toHttpException } from '../../../src/nest/http';
import { packageRoot } from './sources';

describe('§5.3 error-message-shape', () => {
  it('src/nest/http.ts는 stack·cause를 아예 언급하지 않는다', () => {
    const text = readFileSync(join(packageRoot, 'src/nest/http.ts'), 'utf8');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('cause');
  });

  it('본문에는 코드와 식별자만 남는다 — 메시지·cause·스택은 실리지 않는다', () => {
    const error = new OperationsJobsError('ERR_JOB_FAILED', 'leaky message with a secret', {
      jobKey: 'a.b',
      runId: 'run-1',
      cause: new Error('inner detail'),
    });
    const body = toHttpException(error)?.getResponse();
    expect(body).toEqual({ jobKey: 'a.b', runId: 'run-1', error: { code: 'ERR_JOB_FAILED' } });
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain('leaky message');
    expect(serialised).not.toContain('inner detail');
  });
});
