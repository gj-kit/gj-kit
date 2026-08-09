/**
 * token-guard — 설계 문서 §1 불변식 1, §9.
 *
 * 컴포넌트 스타일에 디자인 리터럴 금지: 모든 수치는 Theme 토큰에서 온다.
 * 리뷰가 아니라 테스트가 규칙을 지킨다(memorylog2 bottomSurfaceInsetGuard 기법).
 *
 * node:fs 사용은 테스트 파일 한정 예외 — 라이브러리 소스의 플랫폼 중립 규칙과 무관.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom 환경에서 import.meta.url은 file: 스킴이 아니다 — vitest root(패키지 루트) 기준 해석.
const componentsDir = resolve(process.cwd(), 'src/components');
const componentFiles = readdirSync(componentsDir).filter((name) => name.endsWith('.tsx'));

/** 파일별 라인 스캔 — 위반을 "파일:라인 내용" 형태로 수집(실패 메시지가 곧 위치). */
function violations(pattern: RegExp): string[] {
  const found: string[] = [];
  for (const name of componentFiles) {
    const lines = readFileSync(join(componentsDir, name), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        found.push(`${name}:${index + 1} ${line.trim()}`);
      }
    });
  }
  return found;
}

describe('§1 불변식 1 · §9 token-guard — 컴포넌트 소스 디자인 리터럴 금지', () => {
  it('스캔 대상 컴포넌트 파일이 존재한다 — 가드 공회전 방지', () => {
    expect(componentFiles.length).toBeGreaterThanOrEqual(9);
  });

  it('(a) 따옴표 안 hex 색상 리터럴이 없다 — 모든 색은 theme.colors에서', () => {
    // 따옴표 안 hex만 잡는다 — '✓' 같은 글리프 문자열은 허용.
    expect(violations(/['"`]#[0-9a-fA-F]{3,8}['"`]/)).toEqual([]);
  });

  it('(b) fontSize 숫자 리터럴이 없다 — 모든 크기는 theme.typography에서', () => {
    expect(violations(/fontSize:\s*\d/)).toEqual([]);
  });

  it("(c) fontWeight '숫자' 리터럴이 없다 — 모든 굵기는 theme.typography에서", () => {
    expect(violations(/fontWeight:\s*['"`]\d/)).toEqual([]);
  });
});
