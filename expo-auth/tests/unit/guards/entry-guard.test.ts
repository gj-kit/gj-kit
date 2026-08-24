// 가드 1/5 — `entry-guard` (설계 문서 §5.3 · §1 불변식 1·3).
//
// 규칙: ① `src/core/**`·`src/testing/**`에 react·react-native·expo-·window·document·
//        navigator·localStorage(·sessionStorage) 0건.
//       ② `expo-secure-store` import는 `src/storage.ts` 정확히 1파일.

import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import { PACKAGE_ROOT, listTsFiles, moduleRefs, parseFile, read, rel } from '../../guards/ast';
import { corePurityViolations } from '../../guards/detectors';

const PURE_DIRS = [join(PACKAGE_ROOT, 'src', 'core'), join(PACKAGE_ROOT, 'src', 'testing')];
const SRC_DIR = join(PACKAGE_ROOT, 'src');

describe('entry-guard — src/core/** · src/testing/** 순수성', () => {
  const files = PURE_DIRS.flatMap((dir) => listTsFiles(dir));

  it('코어·테스팅 소스가 실제로 존재한다 (가드가 빈 집합을 통과시키지 않는다)', () => {
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it('react·react-native·expo-*·DOM 전역 참조 0건', () => {
    const violations = files.flatMap((file) => corePurityViolations(rel(file), read(file)));
    expect(violations.map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });

  it('배럴(src/index.ts·src/testing.ts)도 peer·DOM 0건', () => {
    for (const entry of ['index.ts', 'testing.ts']) {
      const file = join(SRC_DIR, entry);
      expect(corePurityViolations(rel(file), read(file))).toEqual([]);
    }
  });

  it('expo-secure-store import는 src/storage.ts 정확히 1파일 (§1 불변식 3)', () => {
    const importers = listTsFiles(SRC_DIR)
      .filter((file) =>
        moduleRefs(parseFile(file)).some((ref) => ref.specifier.startsWith('expo-secure-store'))
      )
      .map(rel);
    expect(importers).toEqual(['src/storage.ts']);
  });

  // ── 가드가 실제로 잡는지 (통과만 하는 가드는 무가치하다) ───────────────────
  it('주입된 위반을 잡는다 — import·동적 지정자·DOM 전역·반사 우회', () => {
    const cases: readonly [string, string][] = [
      ['static import', "import { Platform } from 'react-native';\nexport const os = Platform.OS;\n"],
      ['type import', "import type { SecureStoreOptions } from 'expo-secure-store';\nexport type O = SecureStoreOptions;\n"],
      ['dynamic import', "export const load = () => import('expo-secure-store');\n"],
      ['require', "export const s = require('expo-secure-store');\n"],
      ['DOM 전역', 'export function leak(): string { return document.title; }\n'],
      ['globalThis 프로퍼티', 'export const n = globalThis.navigator;\n'],
      ["문자열 반사 우회 globalThis['localStorage']", "export const l = (globalThis as Record<string, unknown>)['localStorage'];\n"],
      ['window', 'export const w = window;\n'],
      ['sessionStorage', 'export const s = sessionStorage;\n'],
    ];
    for (const [label, source] of cases) {
      expect(
        corePurityViolations('src/core/__injected__.ts', source).length,
        `${label} 위반을 놓쳤다`
      ).toBeGreaterThan(0);
    }
  });

  it('주석 안의 금지 토큰은 위반이 아니다 (사고 이력 주석 보존 규율)', () => {
    const source = [
      '// 전신은 localStorage와 window.addEventListener·navigator.locks를 직접 물었다.',
      '/** `document`·`expo-secure-store`를 설명하는 JSDoc */',
      'export const answer = 42;',
      '',
    ].join('\n');
    expect(corePurityViolations('src/core/__injected__.ts', source)).toEqual([]);
  });
});
