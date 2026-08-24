/**
 * §5.3 no-product-strings — 승격 과정에서 제품 고유값이 딸려 오는 것을 막는다.
 *
 * 비ASCII 검사의 **스캔 대상은 문자열 리터럴뿐**이다. §1-9가 `src/**` 전역에 한국어 설계
 * 주석을 요구하므로, 이 한정이 없으면 가드가 자기 소스를 잡는다. 정규식으로 주석을 지우는
 * 방식은 문자열 안의 `//`에서 틀리고 토큰 스캐너는 템플릿 리터럴 재스캔이 필요하므로,
 * TypeScript **AST**를 걸어 리터럴 노드만 읽는다.
 */
import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { readSources, srcRoot } from './sources';

const FORBIDDEN = ['memorylog', 'Asia/Seoul', 'KST', 'EXPO_ACCESS_TOKEN'] as const;

/** 코드포인트 > U+007F. NUL 구분자(U+0000)는 ASCII 범위이므로 통과한다. */
const NON_ASCII = /[^\u0000-\u007F]/u;

function literalsOf(source: string, fileName: string): string[] {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const found: string[] = [];
  const walk = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(tree);
  return found;
}

describe('§5.3 no-product-strings', () => {
  it.each(FORBIDDEN)('src/**에 "%s"가 한 번도 없다 — 주석까지 포함해서', (token) => {
    const offenders = readSources(srcRoot)
      .filter((file) => file.text.toLowerCase().includes(token.toLowerCase()))
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it('문자열 리터럴에 비ASCII 문자가 하나도 없다 — 라이브러리는 어떤 언어의 카피도 만들지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(srcRoot)) {
      for (const literal of literalsOf(file.text, file.relative)) {
        if (NON_ASCII.test(literal)) offenders.push(`${file.relative}: ${literal.slice(0, 40)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('그래도 소스에는 한국어 설계 주석이 있다 — 가드가 주석을 보고 있지 않다는 대조군', () => {
    const files = readSources(srcRoot).filter((file) => NON_ASCII.test(file.text));
    expect(files.length).toBeGreaterThan(10);
  });
});
