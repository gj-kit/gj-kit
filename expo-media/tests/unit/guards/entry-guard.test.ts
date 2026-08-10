// 가드 1/7 — `entry-guard` (설계 문서 §10.3 · §1-1).
//
// 규칙: `src/core/**`에 `react`·`react-native`·`expo-`·`document`·`window` 0건.
//
// 왜 이것이 첫 가드인가 — 코어의 순수성은 이 라이브러리의 **목표 (a)** 자체다.
// "expo·react-native 모킹 0으로 전 파이프라인을 유닛 검증한다"는 주장은 코어가 정말로
// 그 셋을 참조하지 않을 때에만 사실이며, 참조가 하나 새는 순간 조용히 거짓이 된다
// (타입도 빌드도 그것을 잡지 못한다 — tsup은 `dist/core.d.ts`에 그대로 방출한다, §2.4).

import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT, listTsFiles, read, rel, stripComments } from '../../guards/ast';
import { corePurityViolations } from '../../guards/detectors';
import { join } from 'node:path';

const CORE_DIR = join(PACKAGE_ROOT, 'src', 'core');

describe('entry-guard — src/core/** 순수성', () => {
  const files = listTsFiles(CORE_DIR);

  it('코어 소스가 실제로 존재한다 (가드가 빈 집합을 통과시키지 않는다)', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('react·react-native·expo-*·DOM 전역 참조 0건', () => {
    const violations = files.flatMap((file) => corePurityViolations(rel(file), read(file)));
    expect(violations.map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });

  // ── 가드가 실제로 잡는지 (§10.3 "통과만 하는 가드는 무가치하다") ──────────
  it('주입된 위반을 잡는다 — import·동적 지정자·DOM 전역', () => {
    const cases: readonly [string, string][] = [
      ['static import', `import { Platform } from 'react-native';\nexport const os = Platform.OS;\n`],
      ['type import', `import type { Asset } from 'expo-media-library';\nexport type A = Asset;\n`],
      ['dynamic import', `export const load = () => import('expo-file-system');\n`],
      ['require', `export const fs = require('expo-file-system');\n`],
      ['DOM 전역', `export function leak(): string { return document.title; }\n`],
      ['globalThis 우회', `export const d = globalThis.document;\n`],
      ['window', `export const w = window.innerWidth;\n`],
      // 지정자 추출을 우회하려는 형태 — 텍스트 스캔이 받아낸다.
      ['간접 지정자', `const m = 'expo-media-library';\nexport const load = () => import(m);\n`],
    ];
    for (const [label, source] of cases) {
      expect(
        corePurityViolations('src/core/__injected__.ts', source).length,
        `${label} 위반을 놓쳤다`,
      ).toBeGreaterThan(0);
    }
  });

  it('주석 안의 금지 토큰은 위반이 아니다 (설계 규율 6 — 사고 이력 주석 보존)', () => {
    const source = [
      '// 전신은 `FileSystem.uploadAsync`와 `react-native`의 Platform을 직접 물었다.',
      '/* expo-media-library / document / window 를 설명하는 주석 */',
      'export const answer = 42;',
      '',
    ].join('\n');
    expect(corePurityViolations('src/core/__injected__.ts', source)).toEqual([]);
  });

  // ── 공용 스캐너 회귀 (가드 7종이 전부 이 함수 위에 서 있다) ──────────────
  it('stripComments — 주석만 지우고 코드는 글자 그대로 남는다', () => {
    const source = [
      '// 앞줄 주석 uploadAsync',
      '/** JSDoc `expo-media-library` */',
      "const a = file.upload(url); // 같은 줄 주석 document",
      '/* 블록\n   주석 window */',
      'const b = `template`;',
      '',
    ].join('\n');
    const code = stripComments(source);
    // 코드는 **붙어 있던 그대로** 남아야 한다 — 토큰을 다시 이어 붙이면 `.upload(`가
    // `. upload (`가 되어 하드닝 가드 ①·⑥의 부분 문자열 검사가 전부 헛돈다.
    expect(code).toContain('file.upload(url)');
    expect(code).toContain('const b = `template`;');
    for (const token of ['uploadAsync', 'expo-media-library', 'document', 'window', 'JSDoc']) {
      expect(code, `주석의 ${token}이 남았다`).not.toContain(token);
    }
    // 줄 수가 보존돼야 위반 보고의 줄 번호가 원본과 맞는다.
    expect(code.split('\n').length).toBe(source.split('\n').length);
  });

  it('stripComments — 치환 템플릿 뒤의 주석도 지운다 (실측 회귀)', () => {
    // 독립 스캐너로 구현했을 때 실제로 났던 오탐이다: `${…}`를 닫는 `}` 이후를
    // 새 템플릿 시작으로 오인해 **다음 백틱까지 삼키고**, 그 사이 주석이 코드로 둔갑했다.
    // 이 저장소의 주석은 식별자를 백틱으로 감싸므로 백틱은 어디에나 있다.
    const source = [
      'const msg = `Unhandled: ${String(code)} end`;',
      '// ⚠ `expo-file-system`의 web 셰이프는 no-op다',
      'const ok = 1;',
      '',
    ].join('\n');
    const code = stripComments(source);
    expect(code).toContain('`Unhandled: ${String(code)} end`');
    expect(code).not.toContain('expo-file-system');
    expect(corePurityViolations('src/core/x.ts', source)).toEqual([]);
  });

  it('§5.2 MediaError 사본 인식 태그는 유일한 명시 예외다', () => {
    const source = `const TAG: unique symbol = Symbol.for('@gj-kit/expo-media#MediaError');\nexport type T = typeof TAG;\n`;
    expect(corePurityViolations('src/core/errors.ts', source)).toEqual([]);
    // 예외가 태그 하나로 좁혀져 있다는 직접 증거 — 다른 `expo-` 문자열은 여전히 위반이다.
    const widened = `export const p = '@gj-kit/expo-media#MediaError' + 'expo-file-system';\n`;
    expect(corePurityViolations('src/core/errors.ts', widened).length).toBeGreaterThan(0);
  });
});
