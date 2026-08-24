// 가드 4/5 — `dist-peer-graph` (설계 문서 §2.2 표 · §5.3).
//
// 규칙: 빌드 산출물에서 엔트리별 외부 지정자 집합을 재귀 추출해 §2.2 표와 정확히 대조한다.
//       조건 3세트(browser/node/네이티브) × 모듈 2형식(ESM·CJS).
//
// README의 "웹 번들에 expo-secure-store가 포함되지 않습니다"는 소스를 읽어서는 확인할 수
// 없다 — exports 맵의 조건 라우팅과 tsup external·splitting:false가 함께 만드는 산출물의
// 성질이기 때문이다. 이 가드가 그 주장을 사실로 바꾼다.

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';

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

/** §2.2 표 전사 — "이 엔트리가 정적 import하는 peer" 열 그대로다. */
const TABLE: Record<
  string,
  Partial<Record<ConditionSet, readonly string[]>> & { readonly default: readonly string[] }
> = {
  '.': { default: [] },
  './storage': {
    default: ['expo-secure-store'], // 네이티브 분기
    browser: [], // 비네이티브 포크 — 공집합 (§2.2)
    node: [],
  },
  './testing': { default: [] },
};

function expectedFor(subpath: string, set: ConditionSet): readonly string[] {
  const row = TABLE[subpath];
  if (row === undefined) throw new Error(`§2.2 표에 ${subpath}가 없다`);
  return [...(row[set] ?? row.default)].sort();
}

describe('dist-peer-graph — §2.2 표 × 조건 3세트 × 형식 2', () => {
  const pkg = readPackageJson();

  it('dist가 빌드돼 있다', () => {
    expect(existsSync(`${PACKAGE_ROOT}/dist/index.js`), '먼저 `pnpm build`가 필요하다').toBe(true);
  });

  it('exports 맵의 공개 서브패스가 §2.2 표와 일치한다 (공개 3 + ./package.json)', () => {
    const subpaths = Object.keys(pkg.exports).filter((key) => key !== './package.json');
    expect(subpaths.sort()).toEqual(Object.keys(TABLE).sort());
  });

  for (const set of SETS) {
    for (const format of FORMATS) {
      for (const subpath of Object.keys(TABLE)) {
        it(`${subpath} · ${set} · ${format}`, () => {
          const file = resolveSubpath(pkg, subpath, set, format);
          expect(existsSync(file), `${rel(file)} 없음`).toBe(true);
          expect(externalSpecifiers(file)).toEqual(expectedFor(subpath, set));
        });
      }
    }
  }

  it('§2.2 불변식 — "."·"./testing"은 전 세트에서 peer 공집합', () => {
    for (const subpath of ['.', './testing']) {
      for (const set of SETS) {
        for (const format of FORMATS) {
          expect(externalSpecifiers(resolveSubpath(pkg, subpath, set, format))).toEqual([]);
        }
      }
    }
  });

  it('§2.3 — browser·node 양쪽에서 ./storage는 웹 포크로 해석되고 expo-secure-store를 끌어오지 않는다', () => {
    for (const set of ['browser', 'node'] as const) {
      for (const format of FORMATS) {
        const file = resolveSubpath(pkg, './storage', set, format);
        expect(file.includes('storage.web.'), `${set}/${format} → ${rel(file)}`).toBe(true);
        expect(externalSpecifiers(file)).toEqual([]);
      }
    }
  });

  it('bare react-native 조건 키 금지 (§2.3 — jest 덫) — 네이티브는 기본 경로를 받는다', () => {
    const storage = pkg.exports['./storage'];
    expect(storage).toBeDefined();
    expect(JSON.stringify(storage)).not.toContain('"react-native"');
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('조건 해석기가 세트별로 다른 파일을 고른다 (해석이 무너지면 전부 통과해 버린다)', () => {
    const storage = pkg.exports['./storage'];
    expect(storage).toBeDefined();
    if (storage === undefined) return;
    expect(resolveExport(storage, ['browser', 'import'])).toBe('./dist/storage.web.js');
    expect(resolveExport(storage, ['node', 'require'])).toBe('./dist/storage.web.cjs');
    expect(resolveExport(storage, ['react-native', 'import'])).toBe('./dist/storage.js');
    expect(resolveExport(storage, ['react-native', 'require'])).toBe('./dist/storage.cjs');
    expect(resolveExport(storage, ['browser', 'import'])).not.toContain('.d.ts');
  });

  it('추출기가 ESM·CJS 양쪽의 지정자를 실제로 본다 (0을 돌려주면 모든 대조가 공허하다)', () => {
    for (const format of FORMATS) {
      const externals = externalSpecifiers(resolveSubpath(pkg, './storage', 'native', format));
      expect(externals, `${format} 추출 실패`).toEqual(['expo-secure-store']);
    }
  });
});
