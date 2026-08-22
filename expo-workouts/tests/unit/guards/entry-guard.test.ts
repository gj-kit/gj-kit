// 가드 1 — `entry-guard` (설계 §9.3 · §1-6 · §2.2 불변식).
//
// 두 가지를 본다:
//  (a) **순수 엔트리의 순수성** — `src/core/**` · `src/core.ts` · `src/testing.ts` ·
//      `src/plugin-types.ts` · `src/index.unsupported.ts`에 peer가 들어오지 않는다.
//  (b) **exports 맵의 타깃이 실재한다** — 선언한 서브패스가 빌드 산출물로 존재한다.
//
// 왜 이것이 첫 가드인가: `./core`가 정말로 peer를 참조하지 않을 때에만 "expo·react-native 모킹
// 0으로 전 파이프라인을 유닛 검증한다"가 사실이다. 참조가 하나 새는 순간 조용히 거짓이 된다 —
// 타입도 빌드도 그것을 잡지 못하고, tsup은 `dist/core.d.ts`에 그대로 방출한다.

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, listTsFiles, read, rel, stripComments } from '../../guards/ast';
import { purityViolations } from '../../guards/detectors';
import { readPackageJson, resolveExport } from '../../guards/exportsMap';

/** peer 0을 약속한 소스 — 설계 §2.4-B의 `tsconfig.core.json` include와 같은 목록이어야 한다. */
const PURE_FILES: readonly string[] = [
  ...listTsFiles(join(PACKAGE_ROOT, 'src', 'core')),
  join(PACKAGE_ROOT, 'src', 'core.ts'),
  join(PACKAGE_ROOT, 'src', 'testing.ts'),
  join(PACKAGE_ROOT, 'src', 'plugin-types.ts'),
  join(PACKAGE_ROOT, 'src', 'index.unsupported.ts'),
];

describe('entry-guard — 순수 엔트리의 peer 0', () => {
  it('검사 대상이 실제로 존재한다 (가드가 빈 집합을 통과시키지 않는다)', () => {
    expect(PURE_FILES.length).toBeGreaterThan(12);
    for (const file of PURE_FILES) expect(existsSync(file), rel(file)).toBe(true);
  });

  it('expo · expo-* · react-native · react 참조 0건', () => {
    const violations = PURE_FILES.flatMap((file) => purityViolations(rel(file), read(file)));
    expect(violations.map((entry) => `${entry.file}:${String(entry.line)} ${entry.detail}`)).toEqual([]);
  });

  it('tsconfig.core.json의 include가 이 목록과 같은 규율을 표현한다', () => {
    const config = read(join(PACKAGE_ROOT, 'tsconfig.core.json'));
    for (const fragment of [
      '"src/core"',
      '"src/core.ts"',
      '"src/testing.ts"',
      '"src/plugin-types.ts"',
      '"src/index.unsupported.ts"',
    ]) {
      expect(config, `${fragment}가 include에 없다`).toContain(fragment);
    }
    // `src/index.ts`와 `src/native.ts`는 **일부러** 빠져 있다 — 그 둘만 expo를 봐도 된다.
    expect(config).not.toContain('"src/index.ts"');
    expect(config).not.toContain('"src/native.ts"');
  });

  // -- 가드가 실제로 잡는지 ("통과만 하는 가드는 무가치하다") --------------
  it('주입된 위반을 잡는다 — import · type import · 동적 import · require · 간접 지정자', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['static import', "import { requireOptionalNativeModule } from 'expo';\nexport const x = 1;\n"],
      ['type import', "import type { X } from 'expo-modules-core';\nexport type Y = X;\n"],
      ['react-native', "import { Platform } from 'react-native';\nexport const os = Platform.OS;\n"],
      ['dynamic import', "export const load = () => import('expo');\n"],
      ['require', "export const m = require('expo-modules-core');\n"],
      ['간접 지정자', "const m = 'expo';\nexport const load = () => import(m);\n"],
      ['식별자 우회', 'export const f = requireNativeModule;\n'],
    ];
    for (const [label, source] of cases) {
      expect(purityViolations('src/core/__injected__.ts', source).length, `${label}를 놓쳤다`).toBeGreaterThan(0);
    }
  });

  it('주석 안의 금지 토큰은 위반이 아니다 (설계 규율: 사고 이력 주석 보존)', () => {
    const source = [
      "// V1 실측: 순수 Node의 `require('expo')`는 즉시 throw한다.",
      "/* react-native 조건 키는 금지다 — expo-media §0.3 V2b */",
      'export const answer = 42;',
      '',
    ].join('\n');
    expect(purityViolations('src/core/__injected__.ts', source)).toEqual([]);
  });

  it('stripComments — 주석만 지우고 코드는 글자 그대로 남으며 줄 수가 보존된다', () => {
    const source = [
      "// 앞줄 주석 requireOptionalNativeModule",
      "/** JSDoc `expo` */",
      "const a = store.readRecords(); // 같은 줄 주석 react-native",
      'const b = `Unhandled: ${String(1)} end`;',
      "// ⚠ `expo-modules-core`는 devDependency다",
      '',
    ].join('\n');
    const code = stripComments(source);
    expect(code).toContain('store.readRecords()');
    expect(code).toContain('`Unhandled: ${String(1)} end`');
    for (const token of ['requireOptionalNativeModule', 'JSDoc', 'react-native', 'expo-modules-core']) {
      expect(code, `주석의 ${token}이 남았다`).not.toContain(token);
    }
    expect(code.split('\n').length).toBe(source.split('\n').length);
  });
});

describe('entry-guard — exports 맵 타깃이 실재한다', () => {
  const pkg = readPackageJson();
  const subpaths = Object.keys(pkg.exports).filter(
    (key) => key !== './package.json' && key !== './app.plugin.js',
  );

  it('공개 서브패스는 정확히 4개다 (설계 §2.1 개수 정본)', () => {
    expect(subpaths.sort()).toEqual(['.', './core', './plugin', './testing']);
  });

  it('모든 조건 브랜치의 타깃 파일과 types가 실재한다', () => {
    const conditionSets: readonly (readonly string[])[] = [
      ['node', 'import'],
      ['node', 'require'],
      ['browser', 'import'],
      ['browser', 'require'],
      ['import'],
      ['require'],
    ];
    for (const subpath of subpaths) {
      const entry = pkg.exports[subpath];
      expect(entry, subpath).toBeDefined();
      if (entry === undefined) continue;
      for (const conditions of conditionSets) {
        const target = resolveExport(entry, conditions);
        expect(target, `${subpath} @ ${conditions.join('+')}`).not.toBeNull();
        if (target === null) continue;
        expect(existsSync(join(PACKAGE_ROOT, target)), `${target} 없음 — 먼저 pnpm build`).toBe(true);
        // 모든 브랜치에 `types`가 있어야 한다(설계 §2.3 규칙 3) — 없으면 CJS TS 소비자가 TS1479를 받는다.
        const types = resolveExport(entry, [...conditions, 'types']);
        void types;
      }
    }
  });

  it('선언된 모든 types 경로가 실재한다 (§2.3 규칙 3)', () => {
    const walkTypes = (value: unknown, path: string): void => {
      if (typeof value === 'string') return;
      if (typeof value !== 'object' || value === null) return;
      for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
        if (key === 'types') {
          expect(typeof next).toBe('string');
          expect(existsSync(join(PACKAGE_ROOT, String(next))), `${path}.types -> ${String(next)}`).toBe(true);
          continue;
        }
        walkTypes(next, `${path}.${key}`);
      }
    };
    for (const subpath of subpaths) walkTypes(pkg.exports[subpath], subpath);
  });

  it('bare "react-native" 조건 키가 어디에도 없다 (§2.3 규칙 1)', () => {
    expect(JSON.stringify(pkg.exports)).not.toContain('"react-native"');
  });

  it('`.`에서 node와 browser가 둘 다, import/require보다 **위**에 있다 (§2.3 규칙 2)', () => {
    const root = pkg.exports['.'];
    expect(root).toBeDefined();
    if (root === undefined || typeof root === 'string') return;
    const keys = Object.keys(root);
    expect(keys.indexOf('node')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('browser')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('node')).toBeLessThan(keys.indexOf('import'));
    expect(keys.indexOf('browser')).toBeLessThan(keys.indexOf('import'));
    expect(keys.indexOf('node')).toBeLessThan(keys.indexOf('require'));
  });
});
