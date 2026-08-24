// 가드 5/5 — `nodom-dist-guard` (설계 문서 §2.4 · §5.3).
//
// 규칙: `tests/guards/tsconfig.nodom.json`(`lib:["ES2022"]` + **skipLibCheck:false** +
//       types:[])으로 공개 서브패스 **3개 전부**의 d.ts를 실컴파일한다.
//
// 소스가 깨끗해도 dts 롤업이 DOM/node 타입을 끌어올 수 있고, 그때 소비자에게 일어나는 일은
// "TS2304 억제 + 파라미터 any 붕괴"다(expo-media §2.4 실측) — 소비자는 조용히 깨진다.
// 이 패키지는 DOM 각인 예외 엔트리가 하나도 없다는 것 자체가 계약이다 (§2.4).

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, read } from '../../guards/ast';
import { runTsc } from '../../guards/tsc';

const GUARD_TSCONFIG = 'tests/guards/tsconfig.nodom.json';
const NODOM_ENTRIES = ['index', 'storage', 'testing'] as const;

describe('nodom-dist-guard — dist d.ts 무DOM 컴파일 (서브패스 3/3)', () => {
  it('픽스처가 skipLibCheck:false·types:[]·lib ES2022를 유지한다 (느슨해지면 가드가 무력해진다)', () => {
    const config = read(join(PACKAGE_ROOT, GUARD_TSCONFIG));
    expect(config).toMatch(/"skipLibCheck"\s*:\s*false/);
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    expect(config).toMatch(/"types"\s*:\s*\[\s*\]/);
  });

  it('엔트리 목록이 공개 서브패스 3개 전부다 — 예외 없음', () => {
    const entries = read(join(PACKAGE_ROOT, 'tests/guards/nodom-entries.ts'));
    for (const entry of NODOM_ENTRIES) {
      expect(entries).toContain(`'@gj-kit/expo-auth/${entry}.js'`);
    }
    expect(entries.match(/@gj-kit\/expo-auth\//g)?.length).toBe(NODOM_ENTRIES.length);
  });

  it('3개 엔트리의 d.ts가 모두 빌드돼 있다 (없으면 가드가 공집합을 통과시킨다)', () => {
    for (const entry of NODOM_ENTRIES) {
      const path = join(PACKAGE_ROOT, 'dist', `${entry}.d.ts`);
      expect(existsSync(path), `${entry}.d.ts 없음 — 먼저 \`pnpm build\`가 필요하다`).toBe(true);
    }
  });

  it('어떤 d.ts에도 DOM 각인이 없다 (이 패키지는 각인 예외 엔트리가 0이다 — §2.4)', () => {
    for (const entry of NODOM_ENTRIES) {
      for (const ext of ['d.ts', 'd.cts']) {
        expect(
          read(join(PACKAGE_ROOT, 'dist', `${entry}.${ext}`)),
          `${entry}.${ext}에 DOM 각인이 있다 — 각인을 만들지 말고 소스를 고쳐야 한다`
        ).not.toContain('reference lib="dom"');
      }
    }
  });

  it('tsc --noEmit -p tests/guards/tsconfig.nodom.json 이 성공한다', () => {
    const result = runTsc(GUARD_TSCONFIG);
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }, 240_000);
});
