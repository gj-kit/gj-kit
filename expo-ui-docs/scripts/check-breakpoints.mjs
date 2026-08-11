import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * 반응형 분기점은 src/breakpoints.ts 하나에서만 온다.
 *
 * 전에는 랜딩·문서 허브·문서 셸이 각자 숫자를 들고 있어(560/600/680/720/760/
 * 960/980) 같은 폭에서 헤더와 본문이 서로 다른 배치가 되는 구간이 있었다.
 * 화면 폭을 숫자 리터럴과 직접 비교하는 코드가 다시 생기면 빌드를 멈춘다.
 */

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const roots = ['app', 'src'];
const sourceOfTruth = path.join('src', 'breakpoints.ts');

/** `width >= 960`, `width < 680`, `windowWidth <= 1024` 같은 비교. */
const LITERAL_COMPARE = /\b\w*[Ww]idth\s*(?:>=|<=|>|<)\s*\d{3,}/gu;

async function collect(dir) {
  const entries = await readdir(path.join(projectDir, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(relative)));
    else if (/\.tsx?$/u.test(entry.name)) files.push(relative);
  }
  return files;
}

const violations = [];
for (const root of roots) {
  for (const file of await collect(root)) {
    if (file === sourceOfTruth) continue;
    const lines = (await readFile(path.join(projectDir, file), 'utf8')).split('\n');
    lines.forEach((line, index) => {
      // 주석에 적힌 예전 값 설명까지 잡을 필요는 없다.
      if (/^\s*(\/\/|\*|\/\*)/u.test(line)) return;
      for (const match of line.match(LITERAL_COMPARE) ?? []) {
        violations.push(`${file}:${index + 1}  ${match.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `화면 폭을 숫자와 직접 비교하는 곳이 있습니다 (${violations.length}곳).\n` +
      'src/breakpoints.ts의 BREAKPOINTS를 쓰세요 — 새 값이 필요하면 거기에 이름을 붙여 추가합니다.\n',
  );
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log('Breakpoint guard: 분기점은 src/breakpoints.ts 하나에서만 온다.');
