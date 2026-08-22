// 가드 4·5 — `nodom/pure-source-guard`와 `pure-dist-guard` (설계 §2.4-B · §0.3 V15).
//
// 소스 가드와 산출물 가드는 **겹치지 않는다.** 소스가 깨끗해도 dts 롤업이 DOM 타입이나 peer
// 타입을 끌어올 수 있고, 그때 소비자에게 일어나는 일은 조용한 붕괴다:
//   `lib:["ES2022"]` + `skipLibCheck:true` -> `.d.ts` 내부의 TS2304가 **억제되고 파라미터가 any로
//   붕괴**해 잘못된 호출이 통과한다. 그래서 산출물 가드는 `skipLibCheck:false`로 돈다.

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, read } from '../../guards/ast';
import { runTsc } from '../../guards/tsc';

describe('pure-source-guard — tsconfig.core.json', () => {
  it('프로젝트 설정이 무DOM·무peer 조건을 유지한다 (가드의 전제)', () => {
    const config = read(join(PACKAGE_ROOT, 'tsconfig.core.json'));
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    expect(config).toMatch(/"noEmit"\s*:\s*true/);
  });

  it('tsc --noEmit -p tsconfig.core.json 이 성공한다', () => {
    const result = runTsc('tsconfig.core.json');
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }, 240_000);
});

describe('pure-dist-guard — dist d.ts를 skipLibCheck:false로 실제 컴파일한다', () => {
  const GUARD_TSCONFIG = 'tests/guards/tsconfig.pure.json';
  /** peer 0을 약속한 엔트리 4개. `dist/index.d.ts`(네이티브 브랜치)는 일부러 제외한다. */
  const PURE_ENTRIES = ['core', 'testing', 'plugin', 'index.unsupported'] as const;

  it('픽스처가 skipLibCheck:false와 types:[]를 유지한다 (둘 중 하나만 풀려도 가드가 무력해진다)', () => {
    const config = read(join(PACKAGE_ROOT, GUARD_TSCONFIG));
    expect(config).toMatch(/"skipLibCheck"\s*:\s*false/);
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    // `types: []`가 없으면 @types/node 등이 딸려 들어와 `Buffer`·`process`가 우연히 해석된다.
    expect(config).toMatch(/"types"\s*:\s*\[\s*\]/);
  });

  it('입력 목록이 순수 엔트리 4개이고 네이티브 브랜치를 포함하지 않는다', () => {
    const entries = read(join(PACKAGE_ROOT, 'tests/guards/pure-entries.ts'));
    for (const entry of PURE_ENTRIES) {
      expect(entries).toContain(`'@gj-kit/expo-workouts/${entry}.js'`);
    }
    expect(entries).not.toContain("/index.js'");
    expect(entries.match(/@gj-kit\/expo-workouts\//g)?.length).toBe(PURE_ENTRIES.length);
  });

  it('4개 엔트리의 d.ts가 전부 빌드돼 있다 (없으면 가드가 공집합을 통과시킨다)', () => {
    for (const entry of PURE_ENTRIES) {
      const path = join(PACKAGE_ROOT, 'dist', `${entry}.d.ts`);
      expect(existsSync(path), `${entry}.d.ts 없음 — 먼저 \`pnpm build\``).toBe(true);
    }
  });

  it('어떤 순수 엔트리의 d.ts도 DOM lib 각인을 갖지 않는다', () => {
    for (const entry of PURE_ENTRIES) {
      for (const ext of ['d.ts', 'd.mts']) {
        expect(
          read(join(PACKAGE_ROOT, 'dist', `${entry}.${ext}`)),
          `${entry}.${ext}에 DOM 각인이 있다 — 각인을 늘리지 말고 소스를 고쳐야 한다`,
        ).not.toContain('reference lib="dom"');
      }
    }
  });

  it('tsc --noEmit -p tests/guards/tsconfig.pure.json 이 성공한다', () => {
    const result = runTsc(GUARD_TSCONFIG);
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }, 240_000);
});
