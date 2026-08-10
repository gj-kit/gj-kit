// 가드 5/7 — `test-purity-guard` (설계 문서 §10.1 · §10.3).
//
// 규칙: `tests/unit/**`에 `expo-`·`react-native` import 0건.
//
// 목표 (a)("expo·react-native 모킹 0으로 전 파이프라인을 유닛 검증한다")가 문서 주장이 아니라
// **측정 가능한 사실**임을 보장한다. 전신 photo-kit의 결함이 정확히 여기였다 — 코어가
// `react-native`·`expo-*`에 직접 물려 있어 호스트 앱 jest 밖에서는 한 줄도 돌지 않았고,
// 290줄짜리 순수 EXIF 파서조차 그랬다(§1).
//
// 한 번 `jest.mock('expo-media-library')` 같은 것이 들어오면 그 다음부터는 전부 그렇게 쓰게 된다.
// 그래서 첫 한 건에서 막는다.
//
// ⚠ 검사 대상은 **모듈 지정자**다. 가드 테스트가 `'expo-media-library'`를 §2.2 기대표의
//   **데이터로** 담는 것은 위반이 아니다 — 위반은 그 모듈이 테스트 그래프에 들어오는 것이다.

import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import {
  PACKAGE_ROOT,
  isNativePeerSpecifier,
  listTsFiles,
  moduleRefs,
  parse,
  parseFile,
  rel,
} from '../../guards/ast';

const UNIT_DIR = join(PACKAGE_ROOT, 'tests', 'unit');

describe('test-purity-guard — tests/unit/**', () => {
  const files = listTsFiles(UNIT_DIR);

  it('유닛 테스트가 실제로 존재한다 (가드가 빈 집합을 통과시키지 않는다)', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('expo-* · react-native · react import 0건', () => {
    const violations = files.flatMap((file) =>
      moduleRefs(parseFile(file))
        .filter((ref) => isNativePeerSpecifier(ref.specifier))
        .map((ref) => `${rel(file)}:${ref.line} ${ref.kind} '${ref.specifier}'`),
    );
    expect(violations).toEqual([]);
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('판정 술어가 peer 지정자를 실제로 가른다', () => {
    for (const specifier of [
      'expo-media-library',
      'expo-media-library/legacy',
      'expo-file-system',
      'react-native',
      'react-native/Libraries/Utilities/Platform',
      'react',
    ]) {
      expect(isNativePeerSpecifier(specifier), specifier).toBe(true);
    }
    for (const specifier of ['vitest', 'node:fs', 'typescript', '../../src/core/errors', '../../guards/ast']) {
      expect(isNativePeerSpecifier(specifier), specifier).toBe(false);
    }
  });

  it('지정자 추출이 import 형태 전부를 본다', () => {
    const source = [
      "import * as ML from 'expo-media-library/legacy';",
      "export { x } from 'react-native';",
      "const p = import('expo-file-system');",
      "const q = require('react-native');",
      'export const z = 1;',
      '',
    ].join('\n');
    const specifiers = moduleRefs(parse('t.ts', source)).map((ref) => ref.specifier);
    expect(specifiers.filter(isNativePeerSpecifier).length).toBe(4);
  });
});
