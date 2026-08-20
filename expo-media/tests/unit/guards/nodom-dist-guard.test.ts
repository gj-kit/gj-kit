// 가드 3/7 — `nodom-dist-guard` (설계 문서 §2.4 무DOM 가드 2 · §10.3).
//
// 규칙: `tests/guards/tsconfig.nodom.json`(`lib:["ES2022"]` + **`skipLibCheck:false`**)으로
//       DOM 전용 `./web`과 RN peer 전용 `./image`을 제외한 **공개 서브패스 9개**의 `.d.ts`를 실제로 컴파일한다.
//
// 소스 가드(가드 2)와 겹치지 않는다. 소스가 깨끗해도 `dts` 롤업이 DOM 타입을 끌어올 수 있고,
// 그때 소비자에게 일어나는 일이 §2.4 실측표의 두 번째 행이다:
//   `lib:["ES2022"]` + `skipLibCheck:true` → TS2304가 **억제되고 파라미터가 any로 붕괴**해
//   `createBrowserSaveTarget({ document: 'nope' })`가 **통과한다**.
// 즉 소비자는 "조용히" 깨진다 — §6의 강제 원칙이 정확히 겨냥하는 실패 모드다.
//
// 실측(이 가드 작성 시 재현): `dist/core.d.ts`에
// `declare function __leak(d: Document): typeof fetch;`를 덧붙이면 TS2304 2건으로 실패한다.

import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT, read } from '../../guards/ast';
import { runTsc } from '../../guards/tsc';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const GUARD_TSCONFIG = 'tests/guards/tsconfig.nodom.json';
/** `./web`·`./image`을 제외한 공개 서브패스 9개 — `nodom-entries.ts` 전문과 같은 목록. */
const NODOM_ENTRIES = ['core', 'index', 'picker', 'image/pure', 'device', 'save', 'video', 'testing', 'storage'] as const;

describe('nodom-dist-guard — dist d.ts 무DOM 컴파일', () => {
  it('픽스처가 skipLibCheck:false를 유지한다 (이 값이 true면 가드가 무력해진다)', () => {
    const config = read(join(PACKAGE_ROOT, GUARD_TSCONFIG));
    expect(config).toMatch(/"skipLibCheck"\s*:\s*false/);
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    // `types: []`가 없으면 @types/node 등이 딸려 들어와 `fetch`·`URL`이 우연히 해석된다.
    expect(config).toMatch(/"types"\s*:\s*\[\s*\]/);
  });

  it('엔트리 목록이 ./web·./image 제외 9개다', () => {
    const entries = read(join(PACKAGE_ROOT, 'tests/guards/nodom-entries.ts'));
    for (const entry of NODOM_ENTRIES) {
      expect(entries).toContain(`'@gj-kit/expo-media/${entry}.js'`);
    }
    // `./web`은 DOM 각인 대상, `./image`는 React Native peer 전용이라 무DOM 입력에서 의도적으로 뺀다.
    expect(entries).not.toContain("/web.js'");
    expect(entries.match(/@gj-kit\/expo-media\//g)?.length).toBe(NODOM_ENTRIES.length);
  });

  it('9개 엔트리의 d.ts가 모두 빌드돼 있다 (없으면 가드가 공집합을 통과시킨다)', () => {
    for (const entry of NODOM_ENTRIES) {
      const path = join(PACKAGE_ROOT, 'dist', `${entry}.d.ts`);
      expect(existsSync(path), `${entry}.d.ts 없음 — 먼저 \`pnpm build\`가 필요하다`).toBe(true);
    }
  });

  it('./web 의 d.ts에만 DOM lib 요구가 각인돼 있다', () => {
    // `scripts/stamp-dom-reference.mjs`의 산출물 검증(§2.4). 각인이 없으면 무DOM 소비자에게서
    // `Document` 파라미터가 any로 붕괴한다.
    for (const file of ['web.d.ts', 'web.d.cts']) {
      expect(read(join(PACKAGE_ROOT, 'dist', file)).startsWith('/// <reference lib="dom" />')).toBe(
        true,
      );
    }
    for (const entry of NODOM_ENTRIES) {
      for (const ext of ['d.ts', 'd.cts']) {
        expect(
          read(join(PACKAGE_ROOT, 'dist', `${entry}.${ext}`)),
          `${entry}.${ext}에 DOM 각인이 있다 — 각인을 늘리지 말고 소스를 고쳐야 한다(§2.4 파생 규칙)`,
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
