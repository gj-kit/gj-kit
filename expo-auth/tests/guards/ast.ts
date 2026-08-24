// 가드 공용 스캐너 — expo-media tests/guards/ast.ts에서 복제·축약 (설계 문서 §5.3).
//
// 왜 정규식이 아니라 TypeScript 컴파일러 API인가 — 이 저장소의 소스는 주석이 본문만큼 길고,
// 설계 규율("전신의 사고 이력을 주석으로 옮겨라") 때문에 `localStorage`·`expo-` 같은 금지
// 토큰이 하드닝을 설명하는 주석 안에 정당하게 등장한다. 트리비아(주석)를 제거하고 AST로
// "표현식의 모양"을 보면 오탐과 누락을 둘 다 피할 수 있다.
//
// ⚠ 테스트 전용 모듈이다 — 여기서 `node:fs`·`typescript`를 쓰는 것은 라이브러리의
//   런타임 의존성 0 규율과 무관하다.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

/** 패키지 루트(`expo-auth/`). 이 파일 기준 두 단계 위. */
export const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function listFiles(dir: string, accept: (path: string) => boolean): readonly string[] {
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
 * 주석을 **같은 길이의 공백으로 치환한** 소스 텍스트를 돌려준다 — 오프셋·줄 번호가 원본과
 * 1:1로 유지된다. 독립 스캐너 대신 파서를 쓰는 이유(치환 템플릿·정규식 리터럴 오탐)는
 * expo-media 원본 주석 참조.
 */
export function stripComments(text: string): string {
  const sf = parse('__strip__.ts', text);
  const full = sf.getFullText();
  const out = full.split('');
  const blank = (start: number, end: number): void => {
    for (let i = start; i < end; i += 1) {
      if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
    }
  };
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(sf);
    if (children.length === 0) {
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

/** 모듈 지정자 전수 추출 — static import/export, 동적 `import()`, `require()`. */
export function moduleRefs(sf: ts.SourceFile): readonly ModuleRef[] {
  const out: ModuleRef[] = [];
  const push = (
    node: ts.Node,
    specifier: ts.Expression | undefined,
    kind: ModuleRef['kind']
  ): void => {
    if (specifier === undefined || !ts.isStringLiteralLike(specifier)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ specifier: specifier.text, line: line + 1, kind });
  };
  walk(sf, (node) => {
    if (ts.isImportDeclaration(node)) push(node, node.moduleSpecifier, 'import');
    else if (ts.isExportDeclaration(node)) push(node, node.moduleSpecifier, 'export');
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
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
