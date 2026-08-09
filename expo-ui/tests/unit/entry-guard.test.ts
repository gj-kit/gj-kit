/**
 * entry-guard — 설계 문서 §2, §9.
 *
 * src/theme/**·src/tailwind/**(+배럴 theme.ts/tailwind.ts)는 react·react-native를
 * import하지 않는다 — tailwind.config(Node 평가)와 비-React 코드가 "./theme"·
 * "./tailwind" 엔트리를 안전하게 로드하기 위한 물리적 격리.
 *
 * dist가 존재하면 theme.js·tailwind.js와 그 공유 chunk 그래프에도 react-native
 * 문자열이 없음을 단언한다(빌드 시 격리가 유지됐는지 — 없으면 skip).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom 환경에서 import.meta.url은 file: 스킴이 아니다 — vitest root(패키지 루트) 기준 해석.
const srcDir = resolve(process.cwd(), 'src');
const distDir = resolve(process.cwd(), 'dist');

/** 디렉터리를 재귀로 훑어 .ts/.tsx 파일 절대 경로를 모은다. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** import/export-from/require/동적 import의 모듈 지정자를 추출한다. */
function moduleSpecifiers(source: string): string[] {
  const re = /(?:from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)['"]([^'"]+)['"]/gm;
  const specs: string[] = [];
  for (const match of source.matchAll(re)) {
    if (match[1] !== undefined) specs.push(match[1]);
  }
  return specs;
}

/** react 본체·react-dom·react-native 계열(react-native-web 등 포함) 전부 금지. */
const FORBIDDEN = /^react(\/|$)|^react-native(\/|-|$)|^react-dom(\/|$)/;

function reactImportViolations(files: readonly string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const specs = moduleSpecifiers(readFileSync(file, 'utf8'));
    for (const spec of specs.filter((s) => FORBIDDEN.test(s))) {
      found.push(`${relative(srcDir, file)} → ${spec}`);
    }
  }
  return found;
}

describe('§2 · §9 entry-guard — theme/tailwind 소스의 Node 로드 안전성', () => {
  const themeFiles = [...walk(join(srcDir, 'theme')), join(srcDir, 'theme.ts')];
  const tailwindFiles = [...walk(join(srcDir, 'tailwind')), join(srcDir, 'tailwind.ts')];

  it('스캔 대상 소스가 존재한다 — 가드 공회전 방지', () => {
    // theme: brand/tokens/palettes/createTheme + 배럴, tailwind: preset + 배럴
    expect(themeFiles.length).toBeGreaterThanOrEqual(5);
    expect(tailwindFiles.length).toBeGreaterThanOrEqual(2);
  });

  it('src/theme/** 와 배럴에 react/react-native import가 없다', () => {
    expect(reactImportViolations(themeFiles)).toEqual([]);
  });

  it('src/tailwind/** 와 배럴에 react/react-native import가 없다', () => {
    expect(reactImportViolations(tailwindFiles)).toEqual([]);
  });
});

describe('§2 entry-guard — dist 산출물 (빌드가 있을 때만)', () => {
  const hasDist =
    existsSync(join(distDir, 'theme.js')) && existsSync(join(distDir, 'tailwind.js'));

  it.skipIf(!hasDist)(
    'dist/theme.js·dist/tailwind.js와 공유 chunk 그래프에 react-native 문자열이 없다',
    () => {
      // 두 엔트리에서 상대 import를 따라가며(공유 chunk 포함) 전 파일을 검사한다.
      const visited = new Set<string>();
      const queue = ['theme.js', 'tailwind.js'];
      while (queue.length > 0) {
        const rel = queue.pop();
        if (rel === undefined || visited.has(rel)) continue;
        visited.add(rel);
        const source = readFileSync(join(distDir, rel), 'utf8');
        expect(
          source.includes('react-native'),
          `${rel}에 react-native 문자열이 존재한다`,
        ).toBe(false);
        for (const match of source.matchAll(/(?:from\s*|\bimport\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
          if (match[1] !== undefined) queue.push(match[1]);
        }
      }
      // 엔트리 2개 + 공유 chunk 최소 1개를 실제로 훑었는지 확인
      expect(visited.size).toBeGreaterThanOrEqual(3);
    },
  );
});
