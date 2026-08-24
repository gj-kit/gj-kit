/**
 * §5.3 ambient-clock — §1-2("암묵적 환경 읽기 금지")의 기계적 강제.
 * 주석·JSDoc도 스캔 대상이다: 예시조차 금지 토큰을 쓸 수 없다. 이 가드가 실효적이려면
 * 포트가 날짜 객체를 요구하지 않아야 하고, 그래서 §3.2의 시각 필드가 전부 number다.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { distRoot, readArtifactGraph, readSources, srcRoot } from './sources';

const CLOCK_FILE = 'src/core/clock.ts';
const FORBIDDEN = ['Date.now(', 'new Date(', 'setTimeout(', 'setInterval(', 'process.env'] as const;
const built = existsSync(join(distRoot, 'core.js'));

describe('§5.3 ambient-clock — 소스', () => {
  it('src/** 어디에서도 clock.ts 밖에서는 ambient 시계·타이머·환경을 읽지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(srcRoot)) {
      if (file.relative === CLOCK_FILE) continue;
      for (const token of FORBIDDEN) {
        if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('clock.ts는 실제로 그 토큰들을 쓴다 — 가드가 빈 집합을 검사하고 있지 않다는 대조군', () => {
    const [clock] = readSources(join(srcRoot, 'core')).filter(
      (file) => file.relative === CLOCK_FILE,
    );
    expect(clock).toBeDefined();
    expect(clock?.text).toContain('Date.now(');
    expect(clock?.text).toContain('setInterval(');
  });

});

// 시계·타이머는 clock.ts가 번들되므로 산출물에도 당연히 남는다. 산출물 층에서
// 기계적으로 검사할 수 있는 것은 "환경 변수를 읽지 않는다"뿐이고, 그것만 검사한다.
describe.skipIf(!built)('§5.3 ambient-clock — 산출물', () => {
  it('산출물 전량에 process.env가 없다 — 이 라이브러리는 환경 변수를 읽지 않는다', () => {
    for (const entry of ['index.js', 'index.cjs', 'core.js', 'core.cjs', 'testing.js', 'testing.cjs']) {
      const path = join(distRoot, entry);
      for (const file of readArtifactGraph(path)) {
        expect(file.text.includes('process.env'), `${file.relative}`).toBe(false);
      }
    }
  });
});
