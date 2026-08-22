// 가드 2 — `dist-peer-graph` (설계 §2.2 표 · §2.3 · §9.3).
//
// 규칙: 빌드 산출물에서 엔트리별 외부 지정자 집합을 재귀 추출해 **§2.2 표와 정확히 대조**한다.
//       **조건 3세트 × 모듈 2형식** = `browser`/`node`/네이티브 × ESM(`.mjs`) · CJS(`.js`).
//
// 이 가드가 문서 주장을 사실로 바꾸는 지점이다. README의 "웹 번들에 expo가 포함되지 않습니다"는
// 소스를 읽어서는 확인할 수 없다 — exports 맵의 조건 라우팅과 tsup의 `external`·`splitting:false`가
// 함께 만들어내는 **산출물의 성질**이기 때문이다.

import { describe, expect, it } from 'vitest';

import { existsSync, readFileSync } from 'node:fs';

import { PACKAGE_ROOT, rel } from '../../guards/ast';
import {
  type ConditionSet,
  type ModuleFormat,
  externalSpecifiers,
  readPackageJson,
  resolveExport,
  resolveSubpath,
} from '../../guards/exportsMap';

const SETS: readonly ConditionSet[] = ['browser', 'node', 'native'];
const FORMATS: readonly ModuleFormat[] = ['esm', 'cjs'];

/**
 * §2.2 표 전사(轉寫). "이 엔트리가 정적 import하는 peer" 열 그대로다.
 *
 * `.`만 조건에 따라 갈린다 — node/browser는 **공집합**, 네이티브는 정확히 `{"expo"}`.
 */
const TABLE: Record<
  string,
  Partial<Record<ConditionSet, readonly string[]>> & { readonly default: readonly string[] }
> = {
  '.': { default: ['expo'], node: [], browser: [] },
  './core': { default: [] },
  './testing': { default: [] },
  './plugin': { default: [] },
};

describe('dist-peer-graph — §2.2 표 × 조건 3세트 × 형식 2', () => {
  const pkg = readPackageJson();

  it('dist가 빌드돼 있다', () => {
    expect(existsSync(`${PACKAGE_ROOT}/dist/index.js`), '먼저 `pnpm build`가 필요하다').toBe(true);
  });

  it('exports 맵의 공개 서브패스가 §2.2 표와 일치한다', () => {
    const subpaths = Object.keys(pkg.exports).filter(
      (key) => key !== './package.json' && key !== './app.plugin.js',
    );
    expect(subpaths.sort()).toEqual(Object.keys(TABLE).sort());
  });

  for (const set of SETS) {
    for (const format of FORMATS) {
      for (const subpath of Object.keys(TABLE)) {
        it(`${subpath} · ${set} · ${format}`, () => {
          const row = TABLE[subpath];
          expect(row).toBeDefined();
          if (row === undefined) return;
          const file = resolveSubpath(pkg, subpath, set, format);
          expect(existsSync(file), `${rel(file)} 없음`).toBe(true);
          expect(externalSpecifiers(file)).toEqual([...(row[set] ?? row.default)].sort());
        });
      }
    }
  }

  it('§2.2 불변식 — ./core · ./testing · ./plugin은 세 세트 전부에서 peer 0이다', () => {
    for (const subpath of ['./core', './testing', './plugin']) {
      for (const set of SETS) {
        for (const format of FORMATS) {
          expect(externalSpecifiers(resolveSubpath(pkg, subpath, set, format)), `${subpath}/${set}/${format}`).toEqual([]);
        }
      }
    }
  });

  it('§2.2 불변식 — `.`의 네이티브 브랜치가 정적 import하는 외부 지정자는 **정확히 {expo}**다', () => {
    for (const format of FORMATS) {
      expect(externalSpecifiers(resolveSubpath(pkg, '.', 'native', format))).toEqual(['expo']);
    }
  });

  it('§2.3 규칙 2 — node·browser 브랜치는 index.unsupported로 라우팅되고 그래프에 expo가 없다', () => {
    for (const set of ['browser', 'node'] as const) {
      for (const format of FORMATS) {
        const file = resolveSubpath(pkg, '.', set, format);
        expect(file.includes('index.unsupported'), `${set}/${format} -> ${rel(file)}`).toBe(true);
        expect(externalSpecifiers(file)).toEqual([]);
      }
    }
  });

  it('`.`은 `./testing`을 끌어오지 않는다 (단방향)', () => {
    for (const set of SETS) {
      for (const format of FORMATS) {
        const file = resolveSubpath(pkg, '.', set, format);
        expect(externalSpecifiers(file).some((s) => s.includes('testing'))).toBe(false);
      }
    }
  });

  // -- 가드가 실제로 잡는지 -------------------------------------------------
  it('조건 해석기가 세트별로 다른 파일을 고른다 (해석이 무너지면 전부 통과해 버린다)', () => {
    const root = pkg.exports['.'];
    expect(root).toBeDefined();
    if (root === undefined) return;
    expect(resolveExport(root, ['browser', 'import'])).toBe('./dist/index.unsupported.mjs');
    expect(resolveExport(root, ['node', 'require'])).toBe('./dist/index.unsupported.js');
    expect(resolveExport(root, ['react-native', 'import'])).toBe('./dist/index.mjs');
    expect(resolveExport(root, ['react-native', 'require'])).toBe('./dist/index.js');
    // `types`는 활성 조건이 아니다 — 섞이면 `.d.ts`가 실행 대상으로 잡혀 그래프가 어긋난다.
    expect(resolveExport(root, ['browser', 'import'])).not.toContain('.d.');
  });

  it('추출기가 ESM·CJS 양쪽의 지정자를 실제로 본다 (0을 돌려주면 모든 대조가 공허해진다)', () => {
    for (const format of FORMATS) {
      expect(externalSpecifiers(resolveSubpath(pkg, '.', 'native', format)).length, format).toBe(1);
    }
  });

  it('`"type": "module"`이 없다 — 따라서 .js = CJS, .mjs = ESM이다 (설계 §2.4-A)', () => {
    const manifest = JSON.parse(
      readFileSync(`${PACKAGE_ROOT}/package.json`, 'utf8'),
    ) as Record<string, unknown>;
    expect(manifest['type']).toBeUndefined();
  });
});
