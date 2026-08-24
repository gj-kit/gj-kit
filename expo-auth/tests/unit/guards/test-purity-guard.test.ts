// 가드 3/5 — `test-purity-guard` (설계 문서 §5.2 · §5.3).
//
// 규칙: `tests/unit/**`에 expo-·react-native(·react) import 0건 (alias 지점은 tests/native).
// "모킹 0 — 전 시나리오가 './testing' 페이크 4종으로 돈다"가 문서 주장이 아니라 측정
// 가능한 사실임을 보장한다.

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

  it('유닛 테스트가 실제로 존재한다', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it('expo-* · react-native · react import 0건', () => {
    const violations = files.flatMap((file) =>
      moduleRefs(parseFile(file))
        .filter((ref) => isNativePeerSpecifier(ref.specifier))
        .map((ref) => `${rel(file)}:${ref.line} ${ref.kind} '${ref.specifier}'`)
    );
    expect(violations).toEqual([]);
  });

  it('vi.mock 호출 0건 — 페이크 주입만 허용된다', () => {
    for (const file of files) {
      expect(parseFile(file).getFullText()).not.toMatch(/\bvi\.mock\(/);
    }
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('판정 술어가 peer 지정자를 실제로 가른다', () => {
    for (const specifier of [
      'expo-secure-store',
      'expo-secure-store/build/SecureStore',
      'react-native',
      'react-native/Libraries/Utilities/Platform',
      'react',
    ]) {
      expect(isNativePeerSpecifier(specifier), specifier).toBe(true);
    }
    for (const specifier of ['vitest', 'node:fs', 'typescript', '../../src/core/errors']) {
      expect(isNativePeerSpecifier(specifier), specifier).toBe(false);
    }
  });

  it('지정자 추출이 import 형태 전부를 본다', () => {
    const source = [
      "import * as S from 'expo-secure-store';",
      "export { x } from 'react-native';",
      "const p = import('expo-secure-store');",
      "const q = require('react-native');",
      'export const z = 1;',
      '',
    ].join('\n');
    const specifiers = moduleRefs(parse('t.ts', source)).map((ref) => ref.specifier);
    expect(specifiers.filter(isNativePeerSpecifier).length).toBe(4);
  });
});
