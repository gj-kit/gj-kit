// platform neutral 가드 — 설계 문서 §1-5 · §2.2 (expo-media `nodom-source-guard` 선례).
//
// 규칙: `tsc --noEmit -p tsconfig.src.json`(`types: []` · `lib: ["ES2022"]`)이 성공한다.
//
// 왜 문자열 스캔(source-guard)으로 충분하지 않은가 — 유출은 식별자 하나가 아니다.
// `Blob`·`URL`·`TextEncoder`·`AbortController`처럼 목록에 없는 전역이 얼마든지 들어올 수 있고,
// 금지 목록을 손으로 유지하는 대신 **타입 체커에게 물어보는** 것이 유일하게 새지 않는 방법이다.
// 그리고 tsup은 이 유출을 전혀 잡지 못한다 — `platform: 'neutral'`은 번들러의 해석 전략일 뿐
// 타입 검사가 아니라서, `process.env.TZ`를 읽는 소스도 종료코드 0으로 빌드된다.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('nodom-source-guard — tsconfig.src.json', () => {
  it('프로젝트 설정이 platform neutral 조건을 유지한다 (가드의 전제)', () => {
    // 주석 포함 JSONC라 파서 없이 형태만 확인한다 — 확인하려는 것은 값 두 개뿐이다.
    const config = readFileSync(join(PACKAGE_ROOT, 'tsconfig.src.json'), 'utf8');
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    expect(config).toMatch(/"types"\s*:\s*\[\s*\]/);
    expect(config).toMatch(/"include"\s*:\s*\[\s*"src"\s*\]/);
  });

  it('tsc --noEmit -p tsconfig.src.json 이 성공한다', () => {
    const requireFromPackage = createRequire(join(PACKAGE_ROOT, 'package.json'));
    const tsc = requireFromPackage.resolve('typescript/lib/tsc.js');
    const result = spawnSync(
      process.execPath,
      [tsc, '--noEmit', '-p', 'tsconfig.src.json', '--pretty', 'false'],
      { cwd: PACKAGE_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
    );
    expect(`${result.stdout ?? ''}${result.stderr ?? ''}`.trim()).toBe('');
    expect(result.status).toBe(0);
  }, 240_000);
});
