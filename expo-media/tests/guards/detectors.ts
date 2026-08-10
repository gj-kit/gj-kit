// 가드의 판정 로직 — **순수 함수**로 분리한다 (설계 문서 §10.3).
//
// 왜 분리하는가: "통과만 하고 아무것도 안 잡는 가드는 무가치하다". 판정이 순수 함수면
// 각 가드 테스트가 ① 실제 `src/**` ② **합성 위반 스니펫**을 같은 함수에 먹여
// "잡아야 할 것을 실제로 잡는다"를 CI에서 상시 증명할 수 있다. 위반 주입을 수동으로 한 번
// 해보는 것과 달리, 이 방식은 판정이 나중에 느슨해지면 그 순간 실패한다.

import * as ts from 'typescript';

import { moduleRefs, parse, stripComments, walk } from './ast';

export interface Violation {
  readonly file: string;
  readonly line: number;
  readonly detail: string;
}

function at(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

// ── entry-guard (§1-1) ──────────────────────────────────────────────────────

/**
 * `src/core/**`의 순수성 위반.
 *
 * 세 겹으로 본다:
 *  1. **모듈 지정자** — `react`/`react-native`/`expo-*`가 그래프에 들어오는가(§3.2).
 *  2. **DOM 전역 식별자** — `document`/`window`. `globalThis.document`도 잡아야 하므로
 *     프로퍼티 접근의 이름까지 본다.
 *  3. **코드 텍스트**(주석 제외) — 설계 문서 §10.3의 문자열 규칙 그대로. 동적 지정자
 *     (`const m = 'expo-media-library'; await import(m)`)처럼 1·2를 우회하는 형태를 막는다.
 */
export function corePurityViolations(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];

  for (const ref of moduleRefs(sf)) {
    if (
      ref.specifier === 'react' ||
      ref.specifier.startsWith('react/') ||
      ref.specifier === 'react-native' ||
      ref.specifier.startsWith('react-native/') ||
      ref.specifier.startsWith('expo-')
    ) {
      out.push({ file, line: ref.line, detail: `${ref.kind} '${ref.specifier}'` });
    }
  }

  walk(sf, (node) => {
    if (!ts.isIdentifier(node)) return;
    if (node.text !== 'document' && node.text !== 'window') return;
    // 선언 이름·프로퍼티 키는 DOM 전역 **참조**가 아니다. 참조만 잡는다.
    const parent = node.parent as ts.Node | undefined;
    if (parent && ts.isPropertyAssignment(parent) && parent.name === node) return;
    if (parent && (ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) && parent.name === node) return;
    out.push({ file, line: at(sf, node), detail: `DOM 전역 참조 \`${node.text}\`` });
  });

  // §5.2가 지정한 사본 인식 태그. 패키지명(`@gj-kit/expo-media`)이 `expo-`로 시작하는 것은
  // 불가피하며, 이 문자열 하나가 `MediaError`의 엔트리 간 `instanceof` 붕괴를 막는다.
  // **유일한 명시 예외**다 — 이 리터럴을 지우고 나머지 전부를 스캔한다.
  const MEDIA_ERROR_TAG = "'@gj-kit/expo-media#MediaError'";
  const code = stripComments(text).split(MEDIA_ERROR_TAG).join("''");
  for (const token of ['react', 'expo-', 'document', 'window'] as const) {
    let index = code.indexOf(token);
    while (index >= 0) {
      out.push({ file, line: 0, detail: `코드에 금지 토큰 \`${token}\` — …${code.slice(Math.max(0, index - 40), index + 40)}…` });
      index = code.indexOf(token, index + token.length);
    }
  }
  return out;
}

// ── string-guard (§4 · §10.3) ───────────────────────────────────────────────

/**
 * `new MediaError(code, message)`의 **두 번째 인자**가 주입 문구에서 오는지.
 *
 * 표현식의 "모양"을 본다 — 문자열 리터럴 유무로 판정하면 안 된다. 실제 코드의 절반은
 * `input.kind === 'video' ? strings.videoUploadFailed : strings.imageUploadFailed`처럼
 * **분기 조건에 리터럴이 들어 있고 결과값은 전부 strings**다. 결과가 될 수 있는 잎만 검사한다.
 */
export function mediaErrorMessageViolations(
  file: string,
  text: string,
  exempt: (input: { readonly file: string; readonly code: string }) => boolean = () => false,
): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];

  const unwrap = (node: ts.Expression): ts.Expression => {
    let current = node;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
    }
    return current;
  };

  /** `strings.x` · `enMediaStrings.x` · `input.strings.x` — 주입 문구 멤버 접근인가. */
  const isStringsAccess = (node: ts.Expression): boolean => {
    if (!ts.isPropertyAccessExpression(node)) return false;
    const base = node.expression;
    if (ts.isIdentifier(base)) return /strings$/i.test(base.text);
    if (ts.isPropertyAccessExpression(base)) return /strings$/i.test(base.name.text);
    return false;
  };

  const check = (node: ts.Expression, report: (node: ts.Node, why: string) => void): void => {
    const expr = unwrap(node);
    if (ts.isConditionalExpression(expr)) {
      // 조건은 보지 않는다 — 결과만이 사용자에게 보이는 문구다.
      check(expr.whenTrue, report);
      check(expr.whenFalse, report);
      return;
    }
    if (
      ts.isBinaryExpression(expr) &&
      (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        expr.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    ) {
      check(expr.left, report);
      check(expr.right, report);
      return;
    }
    // `strings.fileTooLarge({ maxBytes, kind })` — 값이 섞이는 유일한 키가 함수다(§4).
    if (ts.isCallExpression(expr)) {
      if (isStringsAccess(expr.expression)) return;
      report(expr, `호출 \`${expr.getText(sf)}\`의 대상이 \`strings.\` 멤버가 아니다`);
      return;
    }
    if (isStringsAccess(expr)) return;
    // 소비자 주입 override — `MediaUploadLimit.message`(§5.4). 라이브러리가 지은 문구가 아니라
    // 호스트가 넘긴 문구이므로 `strings`를 경유하지 않는 것이 정상이다.
    if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'message') return;
    report(expr, `\`${expr.getText(sf)}\` — \`strings.\` 멤버 접근이 아니다`);
  };

  walk(sf, (node) => {
    if (!ts.isNewExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'MediaError') return;
    const args = node.arguments ?? ts.factory.createNodeArray<ts.Expression>([]);
    const codeArg = args[0];
    const messageArg = args[1];
    const code = codeArg !== undefined && ts.isStringLiteralLike(codeArg) ? codeArg.text : '';
    if (exempt({ file, code })) return;
    if (messageArg === undefined) {
      out.push({ file, line: at(sf, node), detail: '두 번째 인자가 없다' });
      return;
    }
    check(messageArg, (bad, why) => {
      out.push({ file, line: at(sf, bad), detail: `new MediaError('${code}', …) — ${why}` });
    });
  });
  return out;
}

// ── hardening-guard ③ (§7 하드닝 8) ─────────────────────────────────────────

/**
 * 로거 인자에 uri/url **원문**을 넘기는 지점.
 *
 * iOS URLSession 실패 메시지는 서명 URL 전문(임시 자격증명 포함)을 에코한다. `summarizeUri(`를
 * 경유하지 않은 전달은 그 자체로 유출 경로다. 프로퍼티 **키**는 검사하지 않는다 —
 * `{ uri: summarizeUri(asset.uri) }`가 정답 형태이고 그 키 이름이 `uri`인 것은 정상이다.
 */
export function loggerUriViolations(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];

  const isSummarize = (node: ts.Node): boolean =>
    ts.isCallExpression(node) &&
    ((ts.isIdentifier(node.expression) && node.expression.text === 'summarizeUri') ||
      (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'summarizeUri'));

  const looksLikeUri = (name: string): boolean => /(^|[a-z])(uri|url)$/i.test(name);

  const scan = (node: ts.Node): void => {
    if (isSummarize(node)) return; // 경유했다 — 그 안은 안전하다.
    if (ts.isPropertyAssignment(node)) {
      scan(node.initializer);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (looksLikeUri(node.name.text)) {
        out.push({ file, line: at(sf, node), detail: `로거 인자에 원문 \`${node.getText(sf)}\`` });
        return;
      }
      scan(node.expression);
      return;
    }
    if (ts.isShorthandPropertyAssignment(node)) {
      if (looksLikeUri(node.name.text)) {
        out.push({ file, line: at(sf, node), detail: `로거 인자에 원문 \`${node.name.text}\`` });
      }
      return;
    }
    if (ts.isIdentifier(node)) {
      if (looksLikeUri(node.text)) {
        out.push({ file, line: at(sf, node), detail: `로거 인자에 원문 \`${node.text}\`` });
      }
      return;
    }
    node.forEachChild(scan);
  };

  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee)) return;
    if (callee.name.text !== 'log' && callee.name.text !== 'error') return;
    const receiver = callee.expression;
    if (!ts.isIdentifier(receiver) || !/(debug|logger)/i.test(receiver.text)) return;
    for (const argument of node.arguments) scan(argument);
  });
  return out;
}

// ── hardening-guard ② (§7 하드닝 5) ─────────────────────────────────────────

/**
 * `get/requestPermissionsAsync(` 호출에 granular 목록 인자가 있는가.
 *
 * Android 13+에서 목록을 생략하면 매니페스트의 **모든** 권한이 대상이 되어, 거부된
 * READ_MEDIA_AUDIO 하나가 유효한 사진·동영상 허용을 거부처럼 보이게 만든다.
 * 크래시가 아니라 **오판정**으로 나타나므로 런타임 테스트로는 절대 잡히지 않는다.
 */
export function granularPermissionViolations(file: string, text: string): readonly Violation[] {
  const sf = parse(file, text);
  const out: Violation[] = [];
  walk(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : '';
    if (name !== 'getPermissionsAsync' && name !== 'requestPermissionsAsync') return;
    const list = node.arguments[1];
    if (list === undefined) {
      out.push({ file, line: at(sf, node), detail: `${name}(…)에 granular 목록 인자가 없다` });
      return;
    }
    if (ts.isArrayLiteralExpression(list) && list.elements.length === 0) {
      out.push({ file, line: at(sf, node), detail: `${name}(…)의 granular 목록이 빈 배열이다` });
    }
  });
  return out;
}

// ── hardening-guard ④ (§7 하드닝 9) ─────────────────────────────────────────

/** `export const HASH_CHUNK_BYTES = 3 * 256 * 1024` 같은 산술 상수를 정적으로 계산한다. */
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
