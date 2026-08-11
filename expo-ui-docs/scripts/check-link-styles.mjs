/**
 * expo-router `<Link asChild>` + 함수형 Pressable style 조합을 막는 가드.
 *
 * Radix Slot이 style을 객체 스프레드로 병합하므로 `style={({ pressed }) => [...]}`는
 * `{}`로 붕괴한다. 배경·패딩·라운드가 조용히 사라지고 빌드는 통과한다.
 * 링크형 Pressable은 src/site-link.tsx의 LinkPressable만 사용한다.
 */
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const scanRoots = ['app', 'src'];
const allowlist = new Set([path.join('src', 'site-link.tsx')]);

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return collectFiles(full);
      return /\.tsx?$/u.test(entry.name) ? [full] : [];
    }),
  );
  return files.flat();
}

/** `<Link` 여는 태그부터 그 자식 Pressable의 style prop까지를 한 덩어리로 본다. */
const LINK_BLOCK = /<Link\b[^>]*\basChild\b[\s\S]{0,600}?<Pressable\b[\s\S]{0,400}?style=\{\s*\(/gu;

const violations = [];

for (const root of scanRoots) {
  const files = await collectFiles(path.join(projectDir, root));
  for (const file of files) {
    const relative = path.relative(projectDir, file);
    if (allowlist.has(relative)) continue;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(LINK_BLOCK)) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${relative}:${line}`);
    }
  }
}

if (violations.length > 0) {
  console.error(
    [
      '<Link asChild> 안의 Pressable에 함수형 style이 있습니다.',
      'Radix Slot의 객체 스프레드에서 스타일이 통째로 유실됩니다.',
      'src/site-link.tsx의 LinkPressable을 사용하세요.',
      '',
      ...violations.map((entry) => `  - ${entry}`),
      '',
    ].join('\n'),
  );
  process.exit(1);
}

console.log('Link style guard: 함수형 style을 쓰는 <Link asChild> 없음.');
