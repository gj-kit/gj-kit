// 가드 4/7 — `dist-peer-graph` (설계 문서 §2.2 표 · §3.2 · §8.2 케이스 H · §10.3).
//
// 규칙: 빌드 산출물에서 엔트리별 외부 지정자 집합을 재귀 추출해 **§2.2 표와 정확히 대조**한다.
//       **조건 3세트 × 모듈 2형식** = `browser`/`node`/네이티브 × ESM(`.js`)·CJS(`.cjs`).
//
// 이 가드가 문서 주장을 사실로 바꾸는 지점이다. README의 "웹 번들에 expo-media-library가
// 포함되지 않습니다"는 소스를 읽어서는 확인할 수 없다 — exports 맵의 조건 라우팅과 tsup의
// `external`·`splitting:false`가 함께 만들어내는 **산출물의 성질**이기 때문이다.
//
// 조건 세트가 3인 이유(§8.2 케이스 H): `browser`만 검사하면 `node` 브랜치 누락을 못 잡고,
// 그때 SSR·RSC 번들이 네이티브 포크를 끌어와 빌드 실패 또는 하이드레이션 불일치가 된다.

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

/**
 * §2.2 표 전사(轉寫). "이 엔트리가 정적 import하는 peer" 열 그대로다.
 *
 * `./device`·`./save`만 조건에 따라 갈린다 — 나머지 6개는 세 세트에서 같은 파일이다.
 */
const TABLE: Record<string, Partial<Record<ConditionSet, readonly string[]>> & { readonly default: readonly string[] }> = {
  '.': { default: ['expo-file-system', 'expo-file-system/legacy', 'react-native'] },
  './core': { default: [] },
  './picker': { default: ['expo-image-picker', 'react-native'] },
  './device': {
    default: ['expo-media-library/legacy', 'react-native'],
    // 비네이티브 포크 — **공집합**(§8.5). 이 두 줄이 `web-export-guard`가 실기로 확인한 것을
    // CI에서 상시화한다.
    browser: [],
    node: [],
  },
  './save': {
    default: ['expo-media-library/legacy', 'react-native'],
    browser: [],
    node: [],
  },
  './video': { default: ['expo-video-thumbnails'] },
  './web': { default: [] },
  './testing': { default: [] },
  './storage': { default: ['expo-file-system'] },
};

/**
 * 표에는 있으나 **현재 산출물에는 없는** 지정자.
 *
 * ⚠ 문서 결함이지 구현 결함이 아니다 — §2.2 표는 `./picker`·`./device`에 `react-native`를
 * 적었지만 두 어댑터는 `Platform`을 쓸 일이 없어 실제로 import하지 않는다(`src/picker/expo.ts`는
 * 옵션 상수만, `src/device/expo.ts`는 네이티브 응답 매핑만 한다). peer가 **줄어드는** 방향은
 * 소비자에게 이득이므로 없는 import를 만들어 표를 맞추지 않는다. 결과 보고의 deviations 참조.
 *
 * 이 목록은 "빼도 되는 것"이 아니라 **"현재 없음이 확인된 것"**이다 — 아래 테스트가 정말로
 * 없는지도 함께 단언하므로, 누군가 import를 되살리면 여기를 갱신하라고 실패한다.
 */
const ABSENT_FROM_BUILD: Record<string, readonly string[]> = {
  './picker': ['react-native'],
  './device': ['react-native'],
};

function expectedFor(subpath: string, set: ConditionSet): readonly string[] {
  const row = TABLE[subpath];
  if (row === undefined) throw new Error(`§2.2 표에 ${subpath}가 없다`);
  const listed = row[set] ?? row.default;
  // 부재는 조건 세트가 아니라 **엔트리의 성질**이다 — `./picker`는 세 세트에서 같은 파일이다.
  const absent = ABSENT_FROM_BUILD[subpath] ?? [];
  return [...listed].filter((peer) => !absent.includes(peer)).sort();
}

describe('dist-peer-graph — §2.2 표 × 조건 3세트 × 형식 2', () => {
  const pkg = readPackageJson();

  it('dist가 빌드돼 있다', () => {
    expect(existsSync(`${PACKAGE_ROOT}/dist/index.js`), '먼저 `pnpm build`가 필요하다').toBe(true);
  });

  it('exports 맵의 공개 서브패스가 §2.2 표와 일치한다', () => {
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

  it('§2.2 불변식 — "."은 picker·device·save·video·web의 peer를 끌어오지 않는다', () => {
    // 단방향 규칙의 직접 증거. 골든패스를 쓰는 동기화 앱이 피커·기기 라이브러리·썸네일
    // peer를 설치하지 않아도 되어야 한다(§2.2 소비자 시나리오표 1행).
    for (const set of SETS) {
      for (const format of FORMATS) {
        const externals = externalSpecifiers(resolveSubpath(pkg, '.', set, format));
        for (const forbidden of ['expo-image-picker', 'expo-media-library', 'expo-video-thumbnails']) {
          expect(externals.some((s) => s.startsWith(forbidden)), `${set}/${format}`).toBe(false);
        }
      }
    }
  });

  it('§2.2 불변식 — ./core · ./web · ./testing 은 peer 0', () => {
    for (const subpath of ['./core', './web', './testing']) {
      for (const set of SETS) {
        for (const format of FORMATS) {
          expect(externalSpecifiers(resolveSubpath(pkg, subpath, set, format))).toEqual([]);
        }
      }
    }
  });

  it('§8.2 케이스 H — browser·node 양쪽에서 ./device·./save 는 expo-media-library를 끌어오지 않는다', () => {
    for (const subpath of ['./device', './save']) {
      for (const set of ['browser', 'node'] as const) {
        for (const format of FORMATS) {
          const file = resolveSubpath(pkg, subpath, set, format);
          expect(file.includes('.web.'), `${subpath}/${set}/${format} → ${rel(file)}`).toBe(true);
          expect(externalSpecifiers(file)).toEqual([]);
        }
      }
    }
  });

  it('표에 있으나 산출물에 없는 지정자가 정말로 없다 (되살아나면 표를 갱신하라고 실패한다)', () => {
    for (const [subpath, absent] of Object.entries(ABSENT_FROM_BUILD)) {
      for (const format of FORMATS) {
        const externals = externalSpecifiers(resolveSubpath(pkg, subpath, 'native', format));
        for (const peer of absent) {
          expect(
            externals.includes(peer),
            `${subpath}가 다시 ${peer}를 import한다 — §2.2 표가 맞았다는 뜻이니 ABSENT_FROM_BUILD에서 지워라`,
          ).toBe(false);
        }
      }
    }
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('조건 해석기가 세트별로 다른 파일을 고른다 (해석이 무너지면 전부 통과해 버린다)', () => {
    const device = pkg.exports['./device'];
    expect(device).toBeDefined();
    if (device === undefined) return;
    expect(resolveExport(device, ['browser', 'import'])).toBe('./dist/device.web.js');
    expect(resolveExport(device, ['node', 'require'])).toBe('./dist/device.web.cjs');
    expect(resolveExport(device, ['react-native', 'import'])).toBe('./dist/device.js');
    expect(resolveExport(device, ['react-native', 'require'])).toBe('./dist/device.cjs');
    // `types`는 활성 조건이 아니다 — 섞이면 `.d.ts`가 실행 대상으로 잡혀 그래프가 어긋난다.
    expect(resolveExport(device, ['browser', 'import'])).not.toContain('.d.ts');
  });

  it('추출기가 ESM·CJS 양쪽의 지정자를 실제로 본다', () => {
    // 골든패스는 세 peer를 정적 import한다 — 추출기가 0을 돌려주면 모든 대조가 공허해진다.
    for (const format of FORMATS) {
      const externals = externalSpecifiers(resolveSubpath(pkg, '.', 'native', format));
      expect(externals.length, `${format} 추출 실패`).toBe(3);
    }
  });
});
