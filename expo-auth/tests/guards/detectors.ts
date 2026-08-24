// 가드의 판정 로직 — 순수 함수로 분리한다 (설계 문서 §5.3 · expo-media 선례).
// 판정이 순수 함수면 각 가드 테스트가 ① 실제 src/** ② 합성 위반 스니펫을 같은 함수에 먹여
// "잡아야 할 것을 실제로 잡는다"를 CI에서 상시 증명할 수 있다.

import * as ts from 'typescript';

import { isNativePeerSpecifier, moduleRefs, parse, stripComments, walk } from './ast';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

function at(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

// ── entry-guard (§5.3 1행 · §1 불변식 1) ────────────────────────────────────

const DOM_GLOBAL_PATTERN = /\b(window|document|navigator|localStorage|sessionStorage)\b/g;

/**
 * `src/core/**`·`src/testing/**`의 순수성 위반:
 *  1. 모듈 지정자 — `react`/`react-native`/`expo-*`가 그래프에 들어오는가.
 *  2. DOM 전역 문자열 — 주석 제거 후 코드 텍스트에 `window`/`document`/`navigator`/
 *     `localStorage`/`sessionStorage`가 등장하는가 (`globalThis['localStorage']` 반사 우회까지
 *     문자열 수준에서 잡는다 — 설계 §1 "entry-guard가 grep").
 */
export function corePurityViolations(file: string, source: string): readonly Violation[] {
  const out: Violation[] = [];
  const sf = parse(file, source);
  for (const ref of moduleRefs(sf)) {
    if (isNativePeerSpecifier(ref.specifier)) {
      out.push({ file, line: ref.line, detail: `peer import '${ref.specifier}'` });
    }
  }
  const code = stripComments(source);
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    for (const match of line.matchAll(DOM_GLOBAL_PATTERN)) {
      out.push({ file, line: i + 1, detail: `DOM 전역 참조 '${match[0]}'` });
    }
  }
  return out;
}

// ── token-guard (§4.2 3규칙) ────────────────────────────────────────────────

const TOKEN_IDENTIFIERS = new Set(['accessToken', 'refreshToken']);
const AUTH_ERROR_CODES = new Set(['invalid-key-prefix', 'session-disposed']);
/** 키 조립 상수(`.accessToken`/`.refreshToken` 리터럴 텍스트)의 유일한 허용 파일 (§4.2). */
const KEY_ASSEMBLY_ALLOWLIST = new Set(['src/storage/shared.ts']);

function isTokenValuedExpression(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return TOKEN_IDENTIFIERS.has(expression.text);
  if (ts.isPropertyAccessExpression(expression)) return TOKEN_IDENTIFIERS.has(expression.name.text);
  if (ts.isElementAccessExpression(expression)) {
    const argument = expression.argumentExpression;
    return ts.isStringLiteralLike(argument) && TOKEN_IDENTIFIERS.has(argument.text);
  }
  return false;
}

function textContainsTokenWord(text: string): boolean {
  return /accessToken|refreshToken/.test(text);
}

/**
 * §4.2의 3규칙:
 *  1. `console.` 호출 0건 (라이브러리는 로거가 없다 — 통지는 전부 typed outcome).
 *  2. 템플릿 리터럴·문자열 연결에 accessToken/refreshToken **값 식별자** 등장 0건 +
 *     토큰 단어를 담은 리터럴 텍스트는 키 조립 파일에서만.
 *  3. `new AuthError(` 인자는 errors.ts 코드 테이블의 문자열 리터럴만.
 */
export function tokenLeakViolations(file: string, source: string): readonly Violation[] {
  const out: Violation[] = [];
  const sf = parse(file, source);
  walk(sf, (node) => {
    // 규칙 1 — console.* 호출.
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'console'
    ) {
      out.push({ file, line: at(sf, node), detail: `console.${node.expression.name.text}() 호출` });
    }
    // 규칙 2a — 템플릿 치환에 토큰 값 식별자.
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        if (isTokenValuedExpression(span.expression)) {
          out.push({ file, line: at(sf, node), detail: '템플릿 치환에 토큰 값 식별자' });
        }
      }
      const literalText = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join('');
      if (textContainsTokenWord(literalText) && !KEY_ASSEMBLY_ALLOWLIST.has(file)) {
        out.push({ file, line: at(sf, node), detail: '토큰 단어를 담은 템플릿 텍스트 (키 조립 허용 목록 밖)' });
      }
    }
    if (
      ts.isNoSubstitutionTemplateLiteral(node) &&
      textContainsTokenWord(node.text) &&
      !KEY_ASSEMBLY_ALLOWLIST.has(file)
    ) {
      out.push({ file, line: at(sf, node), detail: '토큰 단어를 담은 템플릿 텍스트 (키 조립 허용 목록 밖)' });
    }
    // 규칙 2b — `+` 연결의 피연산자에 토큰 값 식별자.
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (isTokenValuedExpression(node.left) || isTokenValuedExpression(node.right))
    ) {
      out.push({ file, line: at(sf, node), detail: '문자열 연결에 토큰 값 식별자' });
    }
    // 규칙 3 — new AuthError(코드 리터럴) 형태만.
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'AuthError'
    ) {
      const argument = node.arguments?.[0];
      if (
        argument === undefined ||
        !ts.isStringLiteralLike(argument) ||
        !AUTH_ERROR_CODES.has(argument.text)
      ) {
        out.push({
          file,
          line: at(sf, node),
          detail: 'new AuthError()의 인자가 errors.ts 코드 테이블의 리터럴이 아니다',
        });
      }
    }
  });
  return out;
}
