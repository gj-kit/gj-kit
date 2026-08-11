/**
 * jsdoc-language-guard — 공개 API 문서의 언어.
 *
 * JSDoc은 .d.ts에 실려 나가 소비자의 IDE 호버와 문서 사이트의 props 표에
 * 그대로 나타난다. 국제 배포 패키지이므로 JSDoc은 영어여야 한다.
 * 구현 주석(`//`)은 이 규칙과 무관하다 — 저장소 관례대로 한국어로 쓴다.
 *
 * node:fs 사용은 token-guard와 같은 테스트 한정 예외다.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceDir = resolve(process.cwd(), 'src');

/** 한글 음절·자모. 소스 어디에 새 JSDoc이 생겨도 걸리도록 재귀 스캔한다. */
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;
const JSDOC_BLOCK = /\/\*\*[\s\S]*?\*\//gu;

/**
 * 한국어 문구를 커스터마이즈하는 방법을 보여주는 코드 예제라 한글이 남아야
 * 의미가 있다. 예외는 이 하나뿐이며, 늘어나면 규칙이 무너진다.
 */
const ALLOWED_KOREAN_SNIPPETS = ["{ ...koStrings, retry: '다시 시도' }"];

function walkSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(fullPath);
    return /\.tsx?$/u.test(entry.name) ? [fullPath] : [];
  });
}

const sourceFiles = walkSourceFiles(sourceDir);

function koreanJsdocBlocks(): string[] {
  const found: string[] = [];
  for (const file of sourceFiles) {
    const source = readFileSync(file, 'utf8');
    for (const block of source.match(JSDOC_BLOCK) ?? []) {
      let remainder = block;
      for (const allowed of ALLOWED_KOREAN_SNIPPETS) remainder = remainder.split(allowed).join('');
      if (HANGUL.test(remainder)) {
        found.push(`${relative(sourceDir, file)} ${remainder.trim().slice(0, 120)}`);
      }
    }
  }
  return found;
}

describe('공개 JSDoc 언어 가드 — .d.ts로 나가는 문서는 영어', () => {
  it('스캔 대상 소스 파일이 존재한다 — 가드 공회전 방지', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(30);
  });

  it('JSDoc 블록이 충분히 잡힌다 — 정규식 무력화 방지', () => {
    const blocks = sourceFiles.flatMap((file) => readFileSync(file, 'utf8').match(JSDOC_BLOCK) ?? []);
    expect(blocks.length).toBeGreaterThanOrEqual(300);
  });

  it('한국어 JSDoc이 없다', () => {
    expect(koreanJsdocBlocks()).toEqual([]);
  });
});
