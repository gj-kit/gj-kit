/**
 * §5.3 peer-graph — §1-1("코어는 Nest를 한 줄도 import하지 않는다")의 유일한 기계적 강제.
 * 소스 텍스트와 산출물 양쪽을 본다: 산출물 쪽이 빠지면 tsup external 설정이 바뀌어도 모른다.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { distRoot, readArtifactGraph, readSources, srcRoot } from './sources';

const FORBIDDEN = ['@nestjs', 'rxjs', 'reflect-metadata'] as const;
// dist가 없으면(빌드 전 fresh 체크아웃) 산출물 스캔은 스킵한다 — 형제 관행.
// 릴리스 게이트는 build → test 순서이므로 그 경로에서는 반드시 실행된다.
const built = existsSync(join(distRoot, 'core.js'));

describe('§5.3 peer-graph — 소스', () => {
  it('src/core/**는 Nest·rxjs·reflect-metadata 문자열을 한 번도 담지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(join(srcRoot, 'core'))) {
      for (const token of FORBIDDEN) {
        if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('src/testing/**도 마찬가지다 — 인메모리 저장소는 코어 위에만 선다', () => {
    const offenders: string[] = [];
    for (const file of readSources(join(srcRoot, 'testing'))) {
      for (const token of FORBIDDEN) {
        if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
      }
    }
    expect(offenders).toEqual([]);
  });

});

describe.skipIf(!built)('§5.3 peer-graph — 산출물', () => {
  it('dist/core.js·core.cjs와 그 청크 전량에도 peer 참조가 없다', () => {
    for (const entry of ['core.js', 'core.cjs', 'testing.js', 'testing.cjs']) {
      const path = join(distRoot, entry);
      const offenders: string[] = [];
      for (const file of readArtifactGraph(path)) {
        for (const token of FORBIDDEN) {
          if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
        }
      }
      expect(offenders, `${entry} 모듈 그래프`).toEqual([]);
    }
  });

  it('dist/index.js는 반대로 Nest를 참조한다 — 가드가 실제로 무언가를 보고 있다는 대조군', () => {
    const graph = readArtifactGraph(join(distRoot, 'index.js'));
    expect(graph.some((file) => file.text.includes('@nestjs'))).toBe(true);
  });
});
