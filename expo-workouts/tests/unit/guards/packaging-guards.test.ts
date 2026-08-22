// 가드 6 — 패키징·명명·상수·프라이버시·테스트 순수성 (설계 §9.3 · §10.1).
//
// 여기 모인 것은 전부 "조용히 깨지는 것"이다. `files` 목록에서 한 줄이 빠지면 autolinking이
// 조용히 실패한 타르볼이 나가고, `ROUTE_CHUNK_POINTS`가 export되면 1000 -> 2000 조정이 breaking이
// 되고, `app.plugin.js`가 로드되지 않으면 소비자 앱의 prebuild에서야 발견된다.

import { describe, expect, it } from 'vitest';

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, listTsFiles, moduleRefs, parse, read, rel } from '../../guards/ast';
import { constantValue, errorMessageViolations } from '../../guards/detectors';

const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  readonly name: string;
  readonly version: string;
  readonly type?: string;
  readonly files: readonly string[];
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies: Record<string, string>;
  readonly peerDependenciesMeta: Record<string, { optional?: boolean }>;
  readonly devDependencies: Record<string, string>;
  readonly scripts: Record<string, string>;
  readonly sideEffects?: boolean;
};

describe('package.json — 하드 규칙', () => {
  it('런타임 의존성이 **0**이다', () => {
    expect(manifest.dependencies).toBeUndefined();
  });

  it('`"type": "module"`이 없다 (설계 §2.4-A — T9 미측정 위험을 안고 가지 않는다)', () => {
    expect(manifest.type).toBeUndefined();
  });

  it('peer는 optional한 expo 하나이고 범위는 >=56 <58이다', () => {
    expect(Object.keys(manifest.peerDependencies)).toEqual(['expo']);
    expect(manifest.peerDependencies['expo']).toBe('>=56.0.0 <58.0.0');
    expect(manifest.peerDependenciesMeta['expo']?.optional).toBe(true);
  });

  it('expo와 expo-modules-core가 devDependency로 있다 (V12 — 없으면 typecheck가 미해결 모듈에서 죽는다)', () => {
    expect(manifest.devDependencies['expo']).toMatch(/^~56\./);
    expect(manifest.devDependencies['expo-modules-core']).toMatch(/^~56\./);
  });

  it('sideEffects: false', () => {
    expect(manifest.sideEffects).toBe(false);
  });

  it('files 목록이 네이티브 산출물을 전부 담고 example·tests·android 빌드물을 담지 않는다', () => {
    for (const required of [
      'dist',
      'ios',
      'android/build.gradle',
      'android/src/main',
      'expo-module.config.json',
      'app.plugin.js',
      'plugin/build',
    ]) {
      expect(manifest.files, `${required}가 files에 없다`).toContain(required);
    }
    for (const forbidden of ['example', 'tests', 'android/build', 'android/gradle.properties', 'src']) {
      expect(manifest.files.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))).toBe(
        false,
      );
    }
  });

  it('스크립트가 expo-media 선례를 따른다', () => {
    for (const script of ['build', 'prepack', 'typecheck', 'test', 'test:types', 'check:readme']) {
      expect(manifest.scripts[script], `${script} 스크립트가 없다`).toBeDefined();
    }
    // typecheck는 tsconfig **3종** 전부를 돈다.
    for (const project of ['tsconfig.json', 'tsconfig.core.json', 'tsconfig.tests.json']) {
      expect(manifest.scripts['typecheck']).toContain(project);
    }
  });
});

describe('naming-guard — 네이티브 이름이 미션 §4.1과 일치한다', () => {
  const config = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'expo-module.config.json'), 'utf8')) as {
    readonly platforms: readonly string[];
    readonly ios?: { readonly modules?: readonly string[] };
    readonly android?: { readonly modules?: readonly string[] };
  };

  it('platforms는 granular ios + android다 (tvOS/macOS 없음)', () => {
    expect(config.platforms).toEqual(['ios', 'android']);
    expect(config.platforms).not.toContain('apple');
  });

  it('모듈 클래스 이름이 GjKitWorkoutsModule / kit.gj.workouts.GjKitWorkoutsModule이다', () => {
    expect(config.ios?.modules).toEqual(['GjKitWorkoutsModule']);
    expect(config.android?.modules).toEqual(['kit.gj.workouts.GjKitWorkoutsModule']);
  });

  it("네이티브 모듈 문자열 'GjKitWorkouts'가 src/native.ts에 있다", () => {
    expect(read(join(PACKAGE_ROOT, 'src', 'native.ts'))).toContain("'GjKitWorkouts'");
  });
});

describe('t9-plugin-loader — app.plugin.js가 실제로 로드된다', () => {
  // T9는 Phase 0에서 실행되지 않았다. 세 줄짜리 Node 테스트가 그 미검증 전제를 `pnpm test`
  // 안으로 끌어온다 — packed-consumer 게이트까지 미루지 않는다.
  it('require("./app.plugin.js")가 함수(또는 .default가 함수인 객체)를 준다', () => {
    const requireFromPackage = createRequire(join(PACKAGE_ROOT, 'package.json'));
    const loaded = requireFromPackage('./app.plugin.js') as unknown;
    const isFunction =
      typeof loaded === 'function' ||
      typeof (loaded as { default?: unknown } | null)?.default === 'function';
    expect(isFunction).toBe(true);
  });

  it('app.plugin.js는 순수 CJS다 — import/export 구문이 없다', () => {
    const source = read(join(PACKAGE_ROOT, 'app.plugin.js'));
    expect(source).toContain('module.exports');
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
  });

  it('plugin/build가 빌드돼 있다 (packing 대상이다)', () => {
    expect(existsSync(join(PACKAGE_ROOT, 'plugin', 'build', 'index.js'))).toBe(true);
  });
});

describe('chunk-constant-guard — ROUTE_CHUNK_POINTS (f78 · D8)', () => {
  const routeFile = join(PACKAGE_ROOT, 'src', 'core', 'route.ts');

  it('값이 1000이다', () => {
    expect(constantValue(rel(routeFile), read(routeFile), 'ROUTE_CHUNK_POINTS')).toBe(1000);
  });

  it('공개 표면에서 도달 불가하다 — export하면 1000 -> 2000 조정이 breaking이 된다', () => {
    for (const file of ['core.d.ts', 'core.d.mts', 'index.d.ts', 'testing.d.ts']) {
      expect(read(join(PACKAGE_ROOT, 'dist', file)), file).not.toContain('ROUTE_CHUNK_POINTS');
    }
  });
});

describe('redaction-guard — 에러 메시지에 건강값이 보간되지 않는다', () => {
  it('src 전체에서 new WorkoutsError(…)의 메시지가 리터럴/상수다', () => {
    const files = listTsFiles(join(PACKAGE_ROOT, 'src'));
    const violations = files.flatMap((file) => errorMessageViolations(rel(file), read(file)));
    expect(violations.map((entry) => `${entry.file}:${String(entry.line)} ${entry.detail}`)).toEqual([]);
  });

  it('가드가 실제로 잡는다 — 좌표를 보간한 메시지', () => {
    const injected = [
      'const lat = 37.5;',
      "throw new WorkoutsError('invalidArgument', `bad point at ${lat}`);",
      '',
    ].join('\n');
    expect(errorMessageViolations('src/core/__injected__.ts', injected).length).toBeGreaterThan(0);
  });

  it('가드가 안전한 템플릿은 통과시킨다 — 상수 이름 보간', () => {
    const safe = [
      'const field = "fromMs";',
      "throw new WorkoutsError('invalidArgument', `${field} must be an integer.`);",
      '',
    ].join('\n');
    expect(errorMessageViolations('src/core/__injected__.ts', safe)).toEqual([]);
  });
});

describe('test-purity-guard — tests/unit에 expo·react-native 모킹이 0건이다', () => {
  it('단위 테스트가 peer를 import하지 않는다 (§9.1의 "모킹 0"이 문서 주장이 아니게)', () => {
    const files = listTsFiles(join(PACKAGE_ROOT, 'tests', 'unit'));
    expect(files.length).toBeGreaterThan(5);
    const offenders = files.filter((file) =>
      moduleRefs(parse(file, read(file))).some(
        (entry) =>
          entry.specifier === 'expo' ||
          entry.specifier.startsWith('expo-') ||
          entry.specifier === 'react-native',
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });
});
