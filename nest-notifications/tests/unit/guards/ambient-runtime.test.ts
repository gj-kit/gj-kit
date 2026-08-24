/**
 * §5.3 ambient-runtime — §1-2("정책은 전부 주입된다")의 기계적 강제.
 *
 * 주석·JSDoc도 스캔 대상이다: 예시조차 금지 토큰을 쓸 수 없다. 이 가드가 실효적이려면
 * `Date` 생성이 한 파일에 모여 있어야 하고, 그래서 `runtime.ts`가 내부용 `toInstant`까지
 * 소유한다. `process.env`는 **예외 파일 없이** 전면 금지다 — 이 런타임은 환경을 읽지 않는다.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { distRoot, readArtifactGraph, readSources, srcRoot } from './sources';

const RUNTIME_FILE = 'src/core/runtime.ts';
const RUNTIME_ONLY = ['Date.now(', 'new Date(', 'setTimeout(', 'setInterval(', 'randomUUID'] as const;
const built = existsSync(join(distRoot, 'core.js'));

describe('§5.3 ambient-runtime — 소스', () => {
  it('runtime.ts 밖에서는 ambient 시계·타이머·난수를 만들지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(srcRoot)) {
      if (file.relative === RUNTIME_FILE) continue;
      for (const token of RUNTIME_ONLY) {
        if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('runtime.ts는 실제로 그 토큰들을 쓴다 — 가드가 빈 집합을 검사하고 있지 않다는 대조군', () => {
    const [runtime] = readSources(srcRoot).filter((file) => file.relative === RUNTIME_FILE);
    expect(runtime).toBeDefined();
    for (const token of ['new Date(', 'setTimeout(', 'randomUUID']) {
      expect(runtime?.text.includes(token), token).toBe(true);
    }
  });

  it('process.env는 runtime.ts를 포함해 src/** 전역에 0이다 — 예외 파일 없음', () => {
    const offenders = readSources(srcRoot)
      .filter((file) => file.text.includes('process.env'))
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});

describe.skipIf(!built)('§5.3 ambient-runtime — 산출물', () => {
  it('산출물 전량에 process.env가 없다 — 이 라이브러리는 환경 변수를 읽지 않는다', () => {
    for (const entry of [
      'index.js',
      'index.cjs',
      'core.js',
      'core.cjs',
      'expo.js',
      'expo.cjs',
      'testing.js',
      'testing.cjs',
    ]) {
      for (const file of readArtifactGraph(join(distRoot, entry))) {
        expect(file.text.includes('process.env'), file.relative).toBe(false);
      }
    }
  });
});
