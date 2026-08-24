// `tsc --noEmit -p <project>`를 실제로 돌리는 공용 러너 — expo-media 복제 (설계 문서 §5.3).
// 가드가 지켜야 하는 것은 "우리가 조립한 Program"이 아니라 소비자가 실제로 실행하는 명령이다.

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
    timeout: 240_000,
  });
  return {
    status: result.status ?? -1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
  };
}
