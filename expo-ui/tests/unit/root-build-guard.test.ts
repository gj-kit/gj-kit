/**
 * 루트 조건부 빌드 가드.
 *
 * browser와 Expo Router SSR(node)은 react-native-web 산출물을, React Native와
 * 조건 미지원 번들러는 기존 산출물을 받는다. 두 경로의 공개 값·타입 표면은 같다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

type ExportValue = string | ExportConditions;

interface ExportConditions {
  readonly [condition: string]: ExportValue;
}

interface PackageJson {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports: Readonly<Record<string, ExportValue>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly peerDependenciesMeta?: Readonly<Record<string, { readonly optional?: boolean }>>;
  readonly publishConfig?: { readonly access?: string };
  readonly scripts?: Readonly<Record<string, string>>;
}

const packageRoot = process.cwd();
const srcRoot = resolve(packageRoot, 'src');
const distRoot = resolve(packageRoot, 'dist');
const pkg = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as PackageJson;
const rootExport = pkg.exports['.'];

if (rootExport === undefined) throw new Error('package.json exports["."]가 없다');

function resolveExport(value: ExportValue, conditions: readonly string[]): string | null {
  if (typeof value === 'string') return value;
  for (const [condition, next] of Object.entries(value)) {
    if (condition === 'default' || conditions.includes(condition)) {
      const target = resolveExport(next, conditions);
      if (target !== null) return target;
    }
  }
  return null;
}

function entryReexports(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

function moduleSpecifiers(source: string): readonly string[] {
  return [...source.matchAll(/(?:from\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

function moduleGraphFiles(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) queue.push(resolve(dirname(file), specifier));
    }
  }
  return [...seen];
}

function externalModuleSpecifiers(entry: string): readonly string[] {
  const refs = new Set<string>();
  for (const file of moduleGraphFiles(entry)) {
    for (const specifier of moduleSpecifiers(readFileSync(file, 'utf8'))) {
      if (!specifier.startsWith('.')) refs.add(specifier);
    }
  }
  return [...refs].sort();
}

function runtimeExportNames(source: string, format: 'esm' | 'cjs'): readonly string[] {
  const names = new Set<string>();
  if (format === 'esm') {
    for (const block of source.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const item of (block[1] ?? '').split(',')) {
        const name = item.trim().split(/\s+as\s+/).at(-1);
        if (name !== undefined && name.length > 0) names.add(name);
      }
    }
  } else {
    for (const match of source.matchAll(/exports\.([A-Za-z_$][\w$]*)\s*=/g)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
    for (const match of source.matchAll(/Object\.defineProperty\(exports,\s*["']([A-Za-z_$][\w$]*)["']/g)) {
      if (match[1] !== undefined) names.add(match[1]);
    }
  }
  return [...names].sort();
}

function declarationExportNames(source: string): readonly string[] {
  const names = new Set<string>();
  for (const block of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of (block[1] ?? '').split(',')) {
      const name = item.trim().replace(/^type\s+/, '').split(/\s+as\s+/).at(-1);
      if (name !== undefined && name.length > 0) names.add(name);
    }
  }
  return [...names].sort();
}

const distFiles = {
  nativeEsm: resolve(distRoot, 'index.js'),
  nativeCjs: resolve(distRoot, 'index.cjs'),
  webEsm: resolve(distRoot, 'index.web.js'),
  webCjs: resolve(distRoot, 'index.web.cjs'),
} as const;
const declarationFiles = {
  nativeEsm: resolve(distRoot, 'index.d.ts'),
  nativeCjs: resolve(distRoot, 'index.d.cts'),
} as const;
const hasBuiltDist = [...Object.values(distFiles), ...Object.values(declarationFiles)].every(existsSync);

describe('root build guard — 소스·exports 계약', () => {
  it('native와 web 엔트리는 하나의 공유 공개 표면만 재export한다', () => {
    expect(entryReexports(resolve(srcRoot, 'index.ts'))).toEqual(['./index.shared']);
    expect(entryReexports(resolve(srcRoot, 'index.web.ts'))).toEqual(['./index.shared']);
    expect(existsSync(resolve(srcRoot, 'index.shared.ts'))).toBe(true);
    expect(existsSync(resolve(srcRoot, 'build/platform-resolution.native.ts'))).toBe(true);
    expect(existsSync(resolve(srcRoot, 'build/platform-resolution.web.ts'))).toBe(true);
  });

  it('공개 엔트리 5개를 정확히 유지한다', () => {
    expect(Object.keys(pkg.exports).filter((key) => key !== './package.json').sort()).toEqual([
      '.',
      './insets',
      './insets/pure',
      './tailwind',
      './theme',
    ]);
  });

  it('순수 inset 엔트리는 React·React Native·safe-area peer를 참조하지 않는다', () => {
    expect(externalModuleSpecifiers(resolve(srcRoot, 'insets', 'pure.ts'))).toEqual([]);
  });

  it('browser·node는 web, react-native·fallback은 native ESM/CJS를 고른다', () => {
    expect(resolveExport(rootExport, ['browser', 'import'])).toBe('./dist/index.web.js');
    expect(resolveExport(rootExport, ['browser', 'require'])).toBe('./dist/index.web.cjs');
    expect(resolveExport(rootExport, ['node', 'import'])).toBe('./dist/index.web.js');
    expect(resolveExport(rootExport, ['node', 'require'])).toBe('./dist/index.web.cjs');
    expect(resolveExport(rootExport, ['react-native', 'import'])).toBe('./dist/index.js');
    expect(resolveExport(rootExport, ['react-native', 'require'])).toBe('./dist/index.cjs');
    expect(resolveExport(rootExport, ['import'])).toBe('./dist/index.js');
    expect(resolveExport(rootExport, ['require'])).toBe('./dist/index.cjs');
  });

  it('모든 플랫폼 조건이 공용 ESM/CJS 선언 파일을 고른다', () => {
    for (const platform of ['browser', 'node', 'react-native'] as const) {
      expect(resolveExport(rootExport, [platform, 'import', 'types'])).toBe('./dist/index.d.ts');
      expect(resolveExport(rootExport, [platform, 'require', 'types'])).toBe('./dist/index.d.cts');
    }
    expect(resolveExport(rootExport, ['import', 'types'])).toBe('./dist/index.d.ts');
    expect(resolveExport(rootExport, ['require', 'types'])).toBe('./dist/index.d.cts');
  });

  it('react-native-web은 native 설치를 강제하지 않는 optional peer다', () => {
    expect(pkg.dependencies?.['react-native-web']).toBeUndefined();
    expect(pkg.dependencies?.['react-dom']).toBeUndefined();
    expect(pkg.peerDependencies?.['react-native-web']).toBe('>=0.21');
    expect(pkg.peerDependencies?.['react-dom']).toBeUndefined();
    expect(pkg.peerDependenciesMeta?.['react-native-web']?.optional).toBe(true);
  });

  it('공개 배포는 clean provenance stamp를 포함하고 public access를 선언한다', () => {
    expect(pkg.publishConfig?.access).toBe('public');
    expect(pkg.scripts?.build).toContain('scripts/stamp-provenance.mjs');
    expect(pkg.scripts?.prepack).toContain('scripts/check-provenance.mjs --require-clean');
    expect(existsSync(resolve(packageRoot, 'scripts', 'stamp-provenance.mjs'))).toBe(true);
    expect(existsSync(resolve(packageRoot, 'scripts', 'check-provenance.mjs'))).toBe(true);
  });
});

describe('root build guard — dist 산출물', () => {
  it.skipIf(!hasBuiltDist)('native/web × ESM/CJS의 런타임 export 집합이 정확히 같다', () => {
    const nativeEsm = runtimeExportNames(readFileSync(distFiles.nativeEsm, 'utf8'), 'esm');
    const nativeCjs = runtimeExportNames(readFileSync(distFiles.nativeCjs, 'utf8'), 'cjs');
    const webEsm = runtimeExportNames(readFileSync(distFiles.webEsm, 'utf8'), 'esm');
    const webCjs = runtimeExportNames(readFileSync(distFiles.webCjs, 'utf8'), 'cjs');

    expect(nativeEsm.length).toBeGreaterThan(40);
    expect(nativeCjs).toEqual(nativeEsm);
    expect(webEsm).toEqual(nativeEsm);
    expect(webCjs).toEqual(nativeEsm);
  });

  it.skipIf(!hasBuiltDist)('공용 ESM/CJS 선언 export 집합이 정확히 같다', () => {
    const nativeEsm = declarationExportNames(readFileSync(declarationFiles.nativeEsm, 'utf8'));
    const nativeCjs = declarationExportNames(readFileSync(declarationFiles.nativeCjs, 'utf8'));

    expect(nativeEsm.length).toBeGreaterThan(100);
    expect(nativeCjs).toEqual(nativeEsm);
  });

  it.skipIf(!hasBuiltDist)('각 조건 산출물에 해당 platform build marker가 남는다', () => {
    for (const file of [distFiles.nativeEsm, distFiles.nativeCjs]) {
      expect(readFileSync(file, 'utf8')).toContain('@gj-kit/expo-ui build: native');
    }
    for (const file of [distFiles.webEsm, distFiles.webCjs]) {
      expect(readFileSync(file, 'utf8')).toContain('@gj-kit/expo-ui build: web');
    }
  });

  it.skipIf(!hasBuiltDist)('native는 react-native, web은 react-native-web만 참조한다', () => {
    for (const file of [distFiles.nativeEsm, distFiles.nativeCjs]) {
      const refs = externalModuleSpecifiers(file);
      expect(refs).toContain('react-native');
      expect(refs).not.toContain('react-native-web');
      expect(refs).not.toContain('react-dom');
    }
    for (const file of [distFiles.webEsm, distFiles.webCjs]) {
      const refs = externalModuleSpecifiers(file);
      expect(refs).toContain('react-native-web');
      expect(refs).not.toContain('react-native');
      expect(refs).not.toContain('react-dom');
    }
  });

  it.skipIf(!hasBuiltDist)('web 산출물 그래프는 import 시점 DOM 전역을 참조하지 않는다', () => {
    for (const entry of [distFiles.webEsm, distFiles.webCjs]) {
      for (const file of moduleGraphFiles(entry)) {
        expect(readFileSync(file, 'utf8')).not.toMatch(/\b(?:document|window)\b/);
      }
    }
  });

  it.skipIf(!existsSync(resolve(distRoot, 'insets', 'pure.js')))('순수 inset 산출물은 peer를 참조하지 않는다', () => {
    const refs = externalModuleSpecifiers(resolve(distRoot, 'insets', 'pure.js'));
    expect(refs).toEqual([]);
  });

  it.skipIf(!hasBuiltDist)('Node 조건의 ESM·CJS self import는 주입 없이 DOM-free로 성공한다', () => {
    const esm = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "delete globalThis.window; delete globalThis.document; const m = await import('@gj-kit/expo-ui'); if (typeof window !== 'undefined' || typeof document !== 'undefined') process.exit(2); console.log(JSON.stringify(Object.keys(m).sort()));",
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    ).trim();
    const cjs = execFileSync(
      process.execPath,
      [
        '--eval',
        "delete global.window; delete global.document; const m = require('@gj-kit/expo-ui'); if (typeof window !== 'undefined' || typeof document !== 'undefined') process.exit(2); console.log(JSON.stringify(Object.keys(m).sort()));",
      ],
      { cwd: packageRoot, encoding: 'utf8' },
    ).trim();

    expect(JSON.parse(esm)).toEqual(JSON.parse(cjs));
    expect(JSON.parse(esm)).toHaveLength(runtimeExportNames(readFileSync(distFiles.webEsm, 'utf8'), 'esm').length);
  });
});
