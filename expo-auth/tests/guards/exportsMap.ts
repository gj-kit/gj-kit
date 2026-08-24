// package.json `exports` 조건 해석 + dist 그래프의 외부 지정자 추출 — expo-media
// tests/guards/exportsMap.ts에서 복제 (설계 문서 §5.3 dist-peer-graph 행).
//
// 왜 조건 **3세트**인가 — `browser` 조건만 검사하면 `node` 브랜치 누락(SSR 번들이 네이티브
// 포크를 끌어오는 사고 — expo-media §8.2 케이스 H)을 영원히 못 잡는다.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { PACKAGE_ROOT, isRelative, moduleRefs, parse } from './ast';

export type ConditionSet = 'browser' | 'node' | 'native';
export type ModuleFormat = 'esm' | 'cjs';

/**
 * 조건 세트별 활성 조건. `native`는 Metro의 세트다 — 이 패키지는 bare `react-native` 조건
 * 키를 쓰지 않으므로(§2.3 — jest 덫) 네이티브는 "조건이 붙지 않은 기본 경로"를 받는다.
 */
const PLATFORM_CONDITIONS: Record<ConditionSet, readonly string[]> = {
  browser: ['browser'],
  node: ['node'],
  native: ['react-native'],
};

type ExportsValue = string | { readonly [key: string]: ExportsValue };

interface PackageJson {
  readonly exports: Readonly<Record<string, ExportsValue>>;
}

export function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as PackageJson;
}

/**
 * 조건 분기를 선언 순서대로 해석한다 — Node의 exports 해석 규칙 그대로.
 * ⚠ `types`는 활성 조건이 아니다 — 섞이면 `.d.ts`가 실행 대상으로 잡힌다.
 */
export function resolveExport(
  value: ExportsValue,
  conditions: readonly string[]
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
  format: ModuleFormat
): string {
  const entry = pkg.exports[subpath];
  if (entry === undefined) throw new Error(`exports에 ${subpath}가 없다`);
  const conditions = [...PLATFORM_CONDITIONS[set], format === 'esm' ? 'import' : 'require'];
  const resolved = resolveExport(entry, conditions);
  if (resolved === null) throw new Error(`${subpath}가 ${set}/${format}에서 해석되지 않는다`);
  return resolve(PACKAGE_ROOT, resolved);
}

/**
 * 한 산출물 파일에서 시작해 상대 지정자를 재귀 추적하며 외부(bare) 지정자를 모은다.
 * splitting:false라 현재는 자기완결이지만, 재귀는 그 설정이 바뀌는 날을 위한 보험이다.
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
