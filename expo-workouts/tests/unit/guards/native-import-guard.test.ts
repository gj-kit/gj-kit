// 가드 3 — `single-native-import` + `export-parity` (설계 §3.1 · §2.4-D · §9.3).
//
// 규칙 A: `src/**` 전체에서 `expo`를 import하는 파일이 **정확히 하나**이고 그것은 `src/native.ts`다.
// 규칙 B: `dist/index.d.ts`와 `dist/index.unsupported.d.ts`의 export 이름 집합이 **동일**하다.
//
// 왜 B가 필요한가: 한쪽에만 함수를 추가하면 web/Node 호출자는 typed `unavailable`이 아니라
// `undefined is not a function`을 받는다. 구현이 하나(`createWorkoutsApi`)라 차이는 구조분해
// 목록뿐이고, 그 목록은 사람이 두 번 쓰므로 반드시 표류한다.

import { describe, expect, it } from 'vitest';

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

import { PACKAGE_ROOT, listTsFiles, moduleRefs, parse, read, rel } from '../../guards/ast';
import { nativeRequireSites } from '../../guards/detectors';

const SRC = join(PACKAGE_ROOT, 'src');

describe('single-native-import — expo import 지점은 정확히 1개다', () => {
  const files = listTsFiles(SRC);

  it('src에 소스가 존재한다', () => {
    expect(files.length).toBeGreaterThan(12);
  });

  it("`expo`를 import하는 파일은 src/native.ts 하나뿐이다", () => {
    const importers = files.filter((file) =>
      moduleRefs(parse(file, read(file))).some(
        (entry) => entry.specifier === 'expo' || entry.specifier.startsWith('expo/'),
      ),
    );
    expect(importers.map(rel)).toEqual(['src/native.ts']);
  });

  it('`requireOptionalNativeModule` 호출도 그 파일 하나에만 있다', () => {
    const sites = files.flatMap((file) => nativeRequireSites(rel(file), read(file)));
    expect(sites.map((site) => site.file)).toEqual(['src/native.ts']);
  });

  it('`src/index.unsupported.ts`는 `./native`를 import하지 않는다 (포크의 존재 이유)', () => {
    const specifiers = moduleRefs(
      parse('src/index.unsupported.ts', read(join(SRC, 'index.unsupported.ts'))),
    ).map((entry) => entry.specifier);
    expect(specifiers).not.toContain('./native');
    expect(specifiers).toContain('./core');
  });

  it('`expo-modules-core`는 소스 어디에서도 import되지 않는다 (devDependency일 뿐이다)', () => {
    const importers = files.filter((file) =>
      moduleRefs(parse(file, read(file))).some((entry) => entry.specifier.startsWith('expo-modules-core')),
    );
    expect(importers.map(rel)).toEqual([]);
  });

  // -- 가드가 실제로 잡는지 -------------------------------------------------
  it('주입된 두 번째 import 지점을 잡는다', () => {
    const injected = "import { requireNativeModule } from 'expo';\nexport const m = requireNativeModule('X');\n";
    expect(nativeRequireSites('src/core/__injected__.ts', injected).length).toBe(1);
    expect(
      moduleRefs(parse('x.ts', injected)).some((entry) => entry.specifier === 'expo'),
    ).toBe(true);
  });
});

/** `.d.ts`의 export 이름 집합 — `export { a, b as c }` 형태를 전부 모은다. */
function exportedNames(file: string): readonly string[] {
  const sf = parse(file, read(file));
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isExportDeclaration(node) && node.exportClause !== undefined) {
      if (ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) names.add(element.name.text);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return [...names].sort();
}

describe('export-parity — `.`의 두 브랜치가 같은 심볼 집합을 낸다 (§2.4-D)', () => {
  const nativeDts = join(PACKAGE_ROOT, 'dist', 'index.d.ts');
  const unsupportedDts = join(PACKAGE_ROOT, 'dist', 'index.unsupported.d.ts');

  it('두 d.ts가 빌드돼 있다', () => {
    expect(existsSync(nativeDts) && existsSync(unsupportedDts), '먼저 `pnpm build`').toBe(true);
  });

  it('export 이름 집합이 동일하다', () => {
    expect(exportedNames(nativeDts)).toEqual(exportedNames(unsupportedDts));
  });

  it('12개 함수 이름이 양쪽에 전부 있다', () => {
    const twelve = [
      'getAvailability',
      'requestAuthorization',
      'getAuthorizationState',
      'listWorkouts',
      'syncWorkouts',
      'getRoute',
      'readHeartRate',
      'readSteps',
      'saveWorkout',
      'deleteWorkout',
      'openSettings',
      'openStoreListing',
    ];
    for (const file of [nativeDts, unsupportedDts]) {
      const names = exportedNames(file);
      for (const fn of twelve) expect(names, `${rel(file)}에 ${fn}이 없다`).toContain(fn);
      expect(names).toContain('workouts');
    }
  });

  it('두 소스의 구조분해 목록이 글자 그대로 같다 (표류의 발원지를 직접 본다)', () => {
    const extract = (file: string): string => {
      const text = read(join(SRC, file));
      const start = text.indexOf('export const {');
      expect(start, `${file}에 구조분해 export가 없다`).toBeGreaterThan(-1);
      return text.slice(start, text.indexOf('} = workouts;', start));
    };
    expect(extract('index.ts')).toBe(extract('index.unsupported.ts'));
  });
});
