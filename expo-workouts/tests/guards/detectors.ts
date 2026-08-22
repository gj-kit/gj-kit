// 가드의 판정 로직 — **순수 함수**로 분리한다 (설계 §9.3, expo-media 선례).
//
// 왜 분리하는가: "통과만 하고 아무것도 안 잡는 가드는 무가치하다". 판정이 순수 함수면 각 가드
// 테스트가 ① 실제 `src/**` ② **합성 위반 스니펫**을 같은 함수에 먹여 "잡아야 할 것을 실제로
// 잡는다"를 CI에서 상시 증명할 수 있다.

import * as ts from 'typescript';

import { isNativePeerSpecifier, moduleRefs, parse, stripComments, walk } from './ast';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

// -- entry-guard (설계 §1-6 · §2.2 불변식) -----------------------------------

/**
 * 순수 엔트리(`src/core/**` · `src/core.ts` · `src/testing.ts` · `src/plugin-types.ts` ·
 * `src/index.unsupported.ts`)의 순수성 위반.
 *
 * 두 겹으로 본다:
 *  1. **모듈 지정자** — `expo`/`expo-*`/`react-native`/`react`가 그래프에 들어오는가.
 *  2. **코드 텍스트**(주석 제외) — 동적 지정자(`const m = 'expo'; await import(m)`)처럼 1을
 *     우회하는 형태를 막는다. 검사 대상은 `'expo'`·`"expo"` 같은 **따옴표에 싸인** 형태와
 *     `requireNativeModule` 계열 식별자다.
 *
 * ⚠ DOM 전역(`document`/`window`)은 **여기서 문자열로 검사하지 않는다.** 이 패키지의 공개 표면에
 *   `readHeartRate(window: TimeWindow)`와 `TimeWindow`가 있어 토큰 스캔이 구조적으로 오탐한다.
 *   DOM 유출의 강제자는 `tsconfig.core.json`(`lib: ["ES2022"]`)의 `nodom-source-guard`와 산출물
 *   레벨의 `pure-dist-guard`이며, 그 둘은 식별자 목록을 손으로 유지하지 않으므로 새지 않는다.
 */
export function purityViolations(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];

  for (const ref of moduleRefs(sf)) {
    if (isNativePeerSpecifier(ref.specifier)) {
      out.push({ file, line: ref.line, detail: `${ref.kind} '${ref.specifier}'` });
    }
  }

  const code = stripComments(text);
  const tokens = [
    "'expo'",
    '"expo"',
    "'expo-",
    '"expo-',
    "'react-native'",
    '"react-native"',
    'requireNativeModule',
    'requireOptionalNativeModule',
  ] as const;
  for (const token of tokens) {
    let index = code.indexOf(token);
    while (index >= 0) {
      out.push({
        file,
        line: 0,
        detail: `코드에 금지 토큰 ${token} — …${code.slice(Math.max(0, index - 40), index + 40)}…`,
      });
      index = code.indexOf(token, index + token.length);
    }
  }
  return out;
}

// -- single-native-import (설계 §3.1) ----------------------------------------

/** `requireNativeModule` 계열 식별자를 **실제로 호출**하는 지점. */
export function nativeRequireSites(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : '';
    if (name !== 'requireNativeModule' && name !== 'requireOptionalNativeModule') return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    out.push({ file, line: line + 1, detail: `${name}(…)` });
  });
  return out;
}

// -- redaction-guard (미션 §4.2 프라이버시 · AGENTS.md §2) --------------------

/** `new WorkoutsError(code, message)`의 **두 번째 인자**가 리터럴/템플릿-상수인지. */
export function errorMessageViolations(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];
  /** 개인정보가 될 수 있는 식별자 — 이 이름들이 메시지에 보간되면 위반이다. */
  const forbidden = /^(lat|lon|latitude|longitude|bpm|kcal|distance|distanceM|steps|title|notes|point|points|route)$/i;

  const check = (node: ts.Expression, report: (why: string) => void): void => {
    if (ts.isStringLiteralLike(node) && !ts.isTemplateExpression(node)) return;
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        walk(span.expression, (inner) => {
          if (ts.isIdentifier(inner) && forbidden.test(inner.text)) {
            report(`템플릿에 \`${inner.text}\`가 보간된다`);
          }
          if (ts.isPropertyAccessExpression(inner) && forbidden.test(inner.name.text)) {
            report(`템플릿에 \`${inner.getText(sf)}\`가 보간된다`);
          }
        });
      }
      return;
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) return;
    if (ts.isConditionalExpression(node)) {
      check(node.whenTrue, report);
      check(node.whenFalse, report);
      return;
    }
    report(`\`${node.getText(sf)}\` — 리터럴도 상수도 아니다`);
  };

  walk(sf, (node) => {
    if (!ts.isNewExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'WorkoutsError') return;
    const args = node.arguments ?? ts.factory.createNodeArray<ts.Expression>([]);
    const messageArg = args[1];
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (messageArg === undefined) {
      out.push({ file, line: line + 1, detail: 'new WorkoutsError(…)에 두 번째 인자가 없다' });
      return;
    }
    check(messageArg, (why) => {
      out.push({ file, line: line + 1, detail: `new WorkoutsError(…) — ${why}` });
    });
  });
  return out;
}

// -- chunk-constant-guard (f78 · D8) -----------------------------------------

/** `const NAME = <숫자>` 형태의 상수를 정적으로 읽는다(단순 산술 포함). */
export function constantValue(file: string, text: string, name: string): number | null {
  const sf = parse(file, text);
  let found: number | null = null;
  const evaluate = (node: ts.Expression): number | null => {
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isParenthesizedExpression(node)) return evaluate(node.expression);
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
      const inner = evaluate(node.operand);
      return inner === null ? null : -inner;
    }
    if (ts.isBinaryExpression(node)) {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (left === null || right === null) return null;
      switch (node.operatorToken.kind) {
        case ts.SyntaxKind.AsteriskToken:
          return left * right;
        case ts.SyntaxKind.PlusToken:
          return left + right;
        case ts.SyntaxKind.MinusToken:
          return left - right;
        default:
          return null;
      }
    }
    return null;
  };
  walk(sf, (node) => {
    if (!ts.isVariableDeclaration(node)) return;
    if (!ts.isIdentifier(node.name) || node.name.text !== name) return;
    if (node.initializer !== undefined) found = evaluate(node.initializer);
  });
  return found;
}
