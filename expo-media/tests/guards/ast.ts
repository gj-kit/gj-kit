// 가드 공용 스캐너 (설계 문서 §10.3).
//
// 왜 정규식이 아니라 TypeScript 컴파일러 API인가 — 이 저장소의 소스는 **주석이 본문만큼 길다**.
// 설계 규율 6("전신의 사고 이력을 주석으로 옮겨라") 때문에 `uploadAsync`·`expo-`·`document`
// 같은 금지 토큰이 **하드닝을 설명하는 주석 안에** 정당하게 등장한다. 정규식 스캔은 그것을
// 위반으로 오탐하고, 오탐을 피하려고 규칙을 느슨하게 하면 진짜 재등장을 놓친다.
// 스캐너로 트리비아(주석)를 제거하고 AST로 "표현식의 모양"을 보면 둘 다 피할 수 있다.
//
// ⚠ `src/**`가 아니라 테스트 전용 모듈이다 — 여기서 `node:fs`·`typescript`를 쓰는 것은
//   라이브러리의 런타임 의존성 0 규율과 무관하다(expo-ui `entry-guard` 선례).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

/** 패키지 루트(`expo-media/`). 이 파일 기준 두 단계 위. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 디렉토리를 재귀 순회해 조건에 맞는 파일 절대경로를 반환한다. 존재하지 않으면 빈 배열. */
export function listFiles(
  dir: string,
  accept: (path: string) => boolean,
): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listFiles(full, accept));
    } else if (accept(full)) {
      out.push(full);
    }
  }
  return out.sort();
}

/** `.ts` 소스 파일 전수(`.d.ts` 제외). */
export function listTsFiles(dir: string): readonly string[] {
  return listFiles(dir, (path) => path.endsWith('.ts') && !path.endsWith('.d.ts'));
}

/** 리포팅용 — 패키지 루트 기준 상대경로(POSIX 구분자). */
export function rel(path: string): string {
  return path.slice(PACKAGE_ROOT.length + 1).split('\\').join('/');
}

export function read(path: string): string {
  return readFileSync(path, 'utf8');
}

export function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

export function parseFile(path: string): ts.SourceFile {
  return parse(path, read(path));
}

/**
 * 주석을 **같은 길이의 공백으로 치환한** 소스 텍스트를 돌려준다.
 *
 * 지우지 않고 공백으로 덮는 이유: 오프셋과 줄 번호가 원본과 1:1로 유지돼야
 * `.upload(`·`SortBy.creationTime` 같은 **원문 그대로의 부분 문자열 검사**가 성립한다.
 * 토큰을 다시 이어 붙이면 `file.upload(`가 `file . upload (`가 되어 모든 검사가 헛돈다.
 *
 * **파서**를 쓰는 이유(실측): 독립 `ts.createScanner`는 치환이 있는 템플릿 리터럴
 * (`` `…${x}…` ``)을 혼자 처리하지 못한다 — 치환을 닫는 `}` 이후를 `reScanTemplateToken`
 * 없이 스캔하면 새 템플릿이 열린 것으로 보고 **다음 백틱까지 삼킨다**. 이 저장소의 주석은
 * 한국어 관행대로 식별자를 백틱으로 감싸므로, 그 순간 주석 수백 자가 "코드"로 둔갑해
 * `expo-file-system` 같은 토큰이 코드에 있는 것처럼 보였다(entry-guard 오탐으로 실제 발생).
 * 정규식 리터럴 안의 따옴표(`/[^\s<>"']+/` — `src/core/debug.ts`에 실제로 있다) 문제도 함께 사라진다.
 */
export function stripComments(text: string): string {
  const sf = parse('__strip__.ts', text);
  const full = sf.getFullText();
  const out = full.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i += 1) {
      // 줄바꿈은 남긴다 — 블록 주석을 통째로 공백으로 바꾸면 줄 번호가 어긋난다.
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
    }
  };
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sf);
    if (children.length === 0) {
      // 토큰 — 앞선 트리비아에 붙은 주석이 전부 여기 달린다(EOF 토큰까지 포함되므로 누락이 없다).
      // ⚠ leading**과** trailing 둘 다 필요하다: 앞 토큰과 **같은 줄**에 있는 주석
      //   (`sortBy: [...], // 최신 우선`)은 leading으로 잡히지 않는다.
      const start = node.getFullStart();
      for (const range of ts.getLeadingCommentRanges(full, start) ?? []) blank(range.pos, range.end);
      for (const range of ts.getTrailingCommentRanges(full, start) ?? []) blank(range.pos, range.end);
      return;
    }
    for (const child of children) visit(child);
  };
  visit(sf);
  return out.join('');
}

/** AST 전수 순회. */
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

export interface ModuleRef {
  readonly specifier: string;
  readonly line: number;
  readonly kind: 'import' | 'export' | 'dynamic-import' | 'require';
}

/**
 * 모듈 지정자 전수 추출 — static import/export, 동적 `import()`, `require()`.
 *
 * ⚠ 문자열 스캔이 아니라 지정자 추출인 것이 핵심이다. `dist-peer-graph`의 기대표나
 * 하드닝 설명 주석이 `'expo-media-library'`를 **데이터로** 담고 있어도 위반이 아니다 —
 * 위반은 그 모듈이 **그래프에 들어오는 것**이다(§3.2).
 */
export function moduleRefs(sf: ts.SourceFile): readonly ModuleRef[] {
  const out: ModuleRef[] = [];
  const push = (node: ts.Node, specifier: ts.Expression | undefined, kind: ModuleRef['kind']): void => {
    if (specifier === undefined || !ts.isStringLiteralLike(specifier)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ specifier: specifier.text, line: line + 1, kind });
  };
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node)) push(node, node.moduleSpecifier, 'import');
    else if (ts.isExportDeclaration(node)) push(node, node.moduleSpecifier, 'export');
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      push(node, node.moduleReference.expression, 'require');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        push(node, node.arguments[0], 'dynamic-import');
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
        push(node, node.arguments[0], 'require');
      }
    }
  });
  return out;
}

/** peer 지정자인가 — `react` / `react-native[/*]` / `expo-*[/*]`. */
export function isNativePeerSpecifier(specifier: string): boolean {
  return (
    specifier === 'react' ||
    specifier.startsWith('react/') ||
    specifier === 'react-native' ||
    specifier.startsWith('react-native/') ||
    specifier.startsWith('expo-')
  );
}

/** 상대 지정자인가. */
export function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

/**
 * 함수/메서드 본문 텍스트를 이름으로 찾아 돌려준다(주석 제거 후).
 *
 * `listAssets` 하드닝(⑤·⑦)이 요구하는 것은 "파일 어딘가"가 아니라 **그 메서드 구현부**다.
 * 파일 단위 스캔은 같은 파일의 다른 메서드(`getAssetInfo` 어댑터 메서드!)에 오탐한다.
 */
export function methodBodies(sf: ts.SourceFile, name: string): readonly string[] {
  const out: string[] = [];
  // ⚠ 주석 제거는 **파일 전체**에서 한 번 하고 위치로 잘라낸다. 메서드 본문 텍스트만 떼어
  //   다시 파싱하면 그 조각은 유효한 최상위 구문이 아니라 주석 범위 해석이 어긋난다.
  const stripped = stripComments(sf.getFullText());
  walk(sf, (node) => {
    let matches = false;
    if (ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) {
      matches = node.name !== undefined && node.name.getText(sf) === name;
    } else if (ts.isPropertyAssignment(node)) {
      matches =
        node.name.getText(sf) === name &&
        (ts.isFunctionExpression(node.initializer) || ts.isArrowFunction(node.initializer));
    }
    if (matches) out.push(stripped.slice(node.getStart(sf), node.getEnd()));
  });
  return out;
}
