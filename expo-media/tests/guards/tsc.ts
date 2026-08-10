// `tsc --noEmit -p <project>`를 실제로 돌리는 공용 러너 (설계 문서 §2.4 무DOM 가드 2종).
//
// 왜 프로그램 API가 아니라 CLI인가 — 가드가 지켜야 하는 것은 "우리가 조립한 Program"이 아니라
// **소비자가 실제로 실행하는 명령**이다. 옵션 병합·`paths`·`skipLibCheck` 해석 중 하나라도
// CLI와 달라지면 가드는 통과하면서 소비자는 깨진다.

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { PACKAGE_ROOT } from './ast';

export interface TscResult {
  readonly status: number;
  readonly output: string;
}

export function runTsc(project: string): TscResult {
  const bin = join(PACKAGE_ROOT, 'node_modules', '.bin', 'tsc');
  const result = spawnSync(bin, ['--noEmit', '-p', project], {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    // 타입 검사는 초 단위다. vitest 기본 타임아웃(5s)보다 길 수 있어 테스트에서 늘려 둔다.
    timeout: 240_000,
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}
