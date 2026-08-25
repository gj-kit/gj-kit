// package.json `exports` 조건 해석 + dist 그래프의 외부 지정자 추출 (설계 문서 §2.2 · §10.3).
//
// 왜 조건 **3세트**인가 — ESM/CJS 2세트만으로는 §8.2 케이스 H(SSR 누수)를 잡지 못한다.
// `browser` 조건만 두고 `node`를 빠뜨리면 `web.output:"static"|"server"` 소비자의 **SSR 번들**이
// 네이티브 포크를 끌어와 빌드 실패 또는 하이드레이션 불일치가 된다. 그 사고는 클라이언트 번들만
// 보는 검사로는 영원히 보이지 않는다.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { PACKAGE_ROOT, isRelative, moduleRefs, parse } from './ast';

export type ConditionSet = 'browser' | 'node' | 'native';
export type ModuleFormat = 'esm' | 'cjs';

/**
 * 조건 세트별 **활성 조건**.
 *
 * `native`는 Metro가 쓰는 세트다 — `react-native` 조건 키가 없으므로 `import`/`require`로
 * 떨어진다. 그것이 이 패키지의 의도다(§8.4): 포크 라우팅은 `browser`/`node` 두 조건만 쓰고,
 * 네이티브는 "조건이 붙지 않은 기본 경로"를 받는다.
 */
const PLATFORM_CONDITIONS: Record<ConditionSet, readonly string[]> = {
  browser: ['browser'],
  node: ['node'],
  native: ['react-native'],
};

type ExportsValue = string | { readonly [key: string]: ExportsValue };

interface PackageJson {
  readonly exports: Readonly<Record<string, ExportsValue>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<
    Record<string, { readonly optional?: boolean }>
  >;
}

export function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/**
 * 조건 분기를 **선언 순서대로** 해석한다 — Node의 exports 해석 규칙 그대로.
 *
 * ⚠ `types`는 활성 조건이 아니다. 런타임 해석에 섞으면 `.d.ts`가 실행 대상으로 잡혀
 * 그래프가 통째로 어긋난다.
 */
export function resolveExport(
  value: ExportsValue,
  conditions: readonly string[],
): string | null {
  if (typeof value === 'string') return value;
  for (const [key, next] of Object.entries(value)) {
    if (key === 'types') continue;
    if (key === 'default' || conditions.includes(key)) {
      const resolved = resolveExport(next, conditions);
      if (resolved !== null) return resolved;
    }
  }
  return null;
}

export function resolveSubpath(
  pkg: PackageJson,
  subpath: string,
  set: ConditionSet,
  format: ModuleFormat,
): string {
  const entry = pkg.exports[subpath];
  if (entry === undefined) throw new Error(`exports에 ${subpath}가 없다`);
  const conditions = [...PLATFORM_CONDITIONS[set], format === 'esm' ? 'import' : 'require'];
  const resolved = resolveExport(entry, conditions);
  if (resolved === null) throw new Error(`${subpath}가 ${set}/${format}에서 해석되지 않는다`);
  return resolve(PACKAGE_ROOT, resolved);
}

/**
 * 한 산출물 파일에서 시작해 **상대 지정자를 재귀 추적**하며 외부(bare) 지정자를 모은다.
 *
 * `splitting:false`라 현재는 엔트리마다 자기완결이지만, 재귀는 그 설정이 바뀌는 날을 위한
 * 보험이다 — 코드 스플리팅이 켜지면 확장자 포함 chunk import가 생기고 그 안에 peer가 숨는다
 * (§0.4 기각 10이 지적한 바로 그 형태).
 */
export function externalSpecifiers(entryFile: string): readonly string[] {
  const seen = new Set<string>();
  const externals = new Set<string>();
  const queue: string[] = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    const sf = parse(file, readFileSync(file, 'utf8'));
    for (const ref of moduleRefs(sf)) {
      if (isRelative(ref.specifier)) {
        queue.push(resolve(dirname(file), ref.specifier));
      } else {
        externals.add(ref.specifier);
      }
    }
  }
  return [...externals].sort();
}
