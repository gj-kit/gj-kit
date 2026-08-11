import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 사이트는 영어 우선 + 한국어 토글이다. 화면 문구를 JSX에 직접 박으면 로케일
 * 전환에서 그 줄만 한국어로 남는다. 로케일 카탈로그 밖에 한글 리터럴이 새로
 * 생기면 빌드를 멈춘다. (주석은 한국어로 쓰므로 검사 전에 제거한다.)
 */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const roots = ['app', 'src'];

/** 로케일 쌍을 정의하는 파일. 여기에는 한국어가 있어야 정상이다. */
const catalogFiles = new Set([
  path.join('src', 'site-strings.ts'),
  path.join('src', 'landing-strings.ts'),
  path.join('src', 'docs-hub-strings.ts'),
  path.join('src', 'pagination-live-example.tsx'),
  path.join('src', 'seo.tsx'),
]);

/** 언어 토글 버튼의 글리프. 두 로케일에서 모두 '한'으로 남는다. */
const ALLOWED_LITERALS = [/'한'/gu];

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/u;

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/([^:])\/\/.*$/gmu, '$1');
}

async function collect(dir) {
  const entries = await readdir(path.join(projectDir, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collect(relative)));
    } else if (/\.tsx?$/u.test(entry.name)) {
      files.push(relative);
    }
  }
  return files;
}

const violations = [];
for (const root of roots) {
  for (const file of await collect(root)) {
    if (catalogFiles.has(file)) continue;
    let source = stripComments(await readFile(path.join(projectDir, file), 'utf8'));
    for (const allowed of ALLOWED_LITERALS) source = source.replace(allowed, "''");
    source.split('\n').forEach((line, index) => {
      if (HANGUL.test(line)) {
        violations.push(`${file}:${index + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `한글 문구가 로케일 카탈로그 밖에 있습니다 (${violations.length}곳).\n` +
      'src/site-strings.ts · src/landing-strings.ts · src/docs-hub-strings.ts로 옮기고 로케일별 값을 채우세요.\n',
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Locale guard: 로케일 카탈로그 밖에 한글 문구 없음.');
