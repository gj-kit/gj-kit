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
  it.each(['core', 'expo', 'testing'])(
    'src/%s/**는 Nest·rxjs·reflect-metadata 문자열을 한 번도 담지 않는다',
    (directory) => {
      const offenders: string[] = [];
      for (const file of readSources(join(srcRoot, directory))) {
        for (const token of FORBIDDEN) {
          if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
        }
      }
      expect(offenders).toEqual([]);
    },
  );

  // 배럴은 자기 주석에서 이 이름들을 **설명**해야 하므로 텍스트가 아니라 import 지정자를 본다.
  it.each(['core.ts', 'expo.ts', 'testing.ts'])('배럴 %s는 peer를 import하지 않는다', (barrel) => {
    const [file] = readSources(srcRoot).filter((entry) => entry.relative === `src/${barrel}`);
    expect(file).toBeDefined();
    const specifiers = [...(file?.text ?? '').matchAll(/from\s+'([^']+)'/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(specifiers.every((specifier) => specifier.startsWith('.'))).toBe(true);
  });

  it('src/index.ts는 반대로 @nestjs/common을 import한다 — 대조군', () => {
    const [file] = readSources(srcRoot).filter((entry) => entry.relative === 'src/index.ts');
    expect(file?.text.includes('./nest/module')).toBe(true);
  });
});

describe.skipIf(!built)('§5.3 peer-graph — 산출물', () => {
  it('dist/core·expo·testing 청크 전량에 peer 참조가 없다', () => {
    for (const entry of [
      'core.js',
      'core.cjs',
      'expo.js',
      'expo.cjs',
      'testing.js',
      'testing.cjs',
    ]) {
      const offenders: string[] = [];
      for (const file of readArtifactGraph(join(distRoot, entry))) {
        for (const token of FORBIDDEN) {
          if (file.text.includes(token)) offenders.push(`${file.relative}: ${token}`);
        }
      }
      expect(offenders, `${entry} 모듈 그래프`).toEqual([]);
    }
  });

  it('dist/index.js는 반대로 Nest를 참조한다 — 가드가 무언가를 보고 있다는 대조군', () => {
    const graph = readArtifactGraph(join(distRoot, 'index.js'));
    expect(graph.some((file) => file.text.includes('@nestjs'))).toBe(true);
  });
});
