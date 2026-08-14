#!/usr/bin/env node
/**
 * README ts/tsx 코드블록 컴파일 검증 — toss-payments scripts/check-readme.mjs 패턴 계승.
 *
 * README.md의 모든 ```ts / ```tsx 블록을 추출해 dist 타입에 대해 tsc --noEmit로
 * 검사한다. 라이브러리 import는 tsconfig paths로 dist d.ts에 매핑하고, 예제가
 * 가정하는 앱 소유 식별자는 ambient d.ts(any)로 선언한다.
 *
 * expo-ui 특성:
 * - 예제가 JSX를 포함하므로 블록 파일은 .tsx, jsx: react-jsx로 검사한다.
 * - 예제가 react/react-native를 import하므로 작업 디렉토리를 패키지 루트 아래에
 *   만들어 node_modules 해석이 자연스럽게 되게 한다(tmpdir이면 resolve 실패).
 *
 * 사용: node scripts/check-readme.mjs [패키지루트]
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pkgRoot = process.argv[2]
  ? resolve(process.argv[2])
  : dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(pkgRoot, 'README.md');
const distDir = join(pkgRoot, 'dist');
if (!existsSync(join(distDir, 'index.d.ts'))) {
  console.error('dist/index.d.ts가 없습니다 — 먼저 pnpm build를 실행하세요.');
  process.exit(2);
}

// ── 1. ts/tsx 펜스 블록 추출 ────────────────────────────────────────────────
const readmeLines = readFileSync(readmePath, 'utf8').split('\n');
const blocks = [];
for (let i = 0; i < readmeLines.length; i++) {
  if (!/^```(ts|tsx)\s*$/.test(readmeLines[i])) continue;
  const start = i + 1;
  let j = start;
  while (j < readmeLines.length && readmeLines[j].trim() !== '```') j++;
  blocks.push({ contentStartLine: start + 1, lines: readmeLines.slice(start, j) });
  i = j;
}
if (blocks.length === 0) {
  console.error('README에서 ts/tsx 코드 블록을 찾지 못했습니다.');
  process.exit(2);
}

// ── 2. 블록 → 컴파일 단위 파일 (.tsx) ───────────────────────────────────────
function splitPrelude(lines) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*\/\//.test(line)) {
      i++;
      continue;
    }
    if (/^import\b/.test(line)) {
      while (i < lines.length && !/;\s*$/.test(lines[i])) i++;
      i++;
      continue;
    }
    break;
  }
  return i;
}

// 작업 디렉토리는 패키지 루트 아래 — react/react-native 해석을 위해 (파일 헤더 주석 참고)
const work = mkdtempSync(join(pkgRoot, '.readme-check-'));
const blocksDir = join(work, 'blocks');
mkdirSync(blocksDir);

const fileMaps = new Map();

blocks.forEach((block, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fileName = `block-${n}.tsx`;

  const preludeCount = splitPrelude(block.lines);
  const body = block.lines.slice(preludeCount);
  const hasTopLevelExport = body.some((l) => /^export\b/.test(l));
  // JSX 프래그먼트 블록(최상위가 <...>로 시작)은 컴포넌트 함수로 감싼다.
  const isJsxFragment = body.some((l) => /^\s*<[A-Z]/.test(l)) && !hasTopLevelExport &&
    !body.some((l) => /^(function|const|let|class|type|interface)\b/.test(l.trim()));

  const out = [];
  block.lines.slice(0, preludeCount).forEach((text, k) => {
    out.push({ text, srcLine: block.contentStartLine + k });
  });
  if (hasTopLevelExport) {
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
  } else if (isJsxFragment) {
    out.push({ text: 'function __ReadmeBlock() { return (<>', srcLine: null });
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
    out.push({ text: '</>); }', srcLine: null });
    out.push({ text: 'void __ReadmeBlock;', srcLine: null });
    out.push({ text: 'export {};', srcLine: null });
  } else {
    out.push({ text: 'async function __readmeBlock() {', srcLine: null });
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
    out.push({ text: '}', srcLine: null });
    out.push({ text: 'void __readmeBlock;', srcLine: null });
    out.push({ text: 'export {};', srcLine: null });
  }

  writeFileSync(join(blocksDir, fileName), out.map((l) => l.text).join('\n') + '\n');
  fileMaps.set(`blocks/${fileName}`, out.map((l) => l.srcLine));
});

// ── 3. ambient 선언 ─────────────────────────────────────────────────────────
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.
// 앱 소유 식별자는 any — 검증 대상이 아니다. 라이브러리 유래 식별자는 실제
// 타입(typeof import)으로 선언해 시그니처 오용이 컴파일 에러가 되게 한다.

declare module '@expo/vector-icons' {
  export const Feather: any;
}

// 앱 소유 (상태·핸들러·아이콘)
declare const Feather: any;
declare function useAppColorSchemeSetting(): 'light' | 'dark' | 'system';
declare function save(): void;
declare function remove(): void;
declare function more(): void;
declare function openSettings(): void;
declare function setTitle(value: string): void;
declare function setQuery(value: string): void;
declare function create(): void;
declare function refetch(): void;
declare function close(): void;
declare function confirmDelete(): void;
declare const deleting: boolean;
declare const confirmVisible: boolean;
declare const title: string;
declare const titleError: string | undefined;
declare const query: string;

// 라이브러리 유래 — JSX 프래그먼트 블록이 스코프에 있다고 가정하는 값들 (실타입)
declare const Text: typeof import('@gj-kit/expo-ui').Text;
declare const Button: typeof import('@gj-kit/expo-ui').Button;
declare const IconButton: typeof import('@gj-kit/expo-ui').IconButton;
declare const TextField: typeof import('@gj-kit/expo-ui').TextField;
declare const SearchField: typeof import('@gj-kit/expo-ui').SearchField;
declare const EmptyState: typeof import('@gj-kit/expo-ui').EmptyState;
declare const ErrorState: typeof import('@gj-kit/expo-ui').ErrorState;
declare const Dialog: typeof import('@gj-kit/expo-ui').Dialog;
declare const DialogPanel: typeof import('@gj-kit/expo-ui').DialogPanel;
declare const ConfirmActionRow: typeof import('@gj-kit/expo-ui').ConfirmActionRow;
`,
);

// README 예제의 앱 테마 모듈('../src/theme', './src/theme')은 상대 경로라
// ambient declare module로 해석되지 않는다 — 실제 스텁 파일로 해석시킨다.
const appThemeStub = `import { createThemes } from '@gj-kit/expo-ui/theme';\nexport const themes = createThemes();\n`;
mkdirSync(join(work, 'src'), { recursive: true });
writeFileSync(join(work, 'src', 'theme.ts'), appThemeStub);
mkdirSync(join(blocksDir, 'src'), { recursive: true });
writeFileSync(join(blocksDir, 'src', 'theme.ts'), appThemeStub);

// ── 4. tsconfig — 라이브러리 import를 dist d.ts에 매핑 ──────────────────────
const paths = {
  '@gj-kit/expo-ui': [join(distDir, 'index.d.ts')],
  '@gj-kit/expo-ui/theme': [join(distDir, 'theme.d.ts')],
  '@gj-kit/expo-ui/insets': [join(distDir, 'insets.d.ts')],
  '@gj-kit/expo-ui/insets/pure': [join(distDir, 'insets/pure.d.ts')],
  '@gj-kit/expo-ui/tailwind': [join(distDir, 'tailwind.d.ts')],
};

writeFileSync(
  join(work, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
        noEmit: true,
        jsx: 'react-jsx',
        // DOM lib 제외 — 예제는 RN 앱 코드이고, DOM의 전역 Text가 라이브러리
        // Text의 ambient 선언과 충돌한다.
        lib: ['ES2022'],
        baseUrl: work,
        paths,
      },
      include: ['blocks', 'globals.d.ts'],
    },
    null,
    2,
  ),
);

// ── 5. tsc 실행 + README 행 번호 역매핑 ─────────────────────────────────────
const requireFromPkg = createRequire(join(pkgRoot, 'package.json'));
const tscJs = requireFromPkg.resolve('typescript/lib/tsc.js');
const run = spawnSync(process.execPath, [tscJs, '-p', work, '--pretty', 'false'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const errors = [];
for (const line of output.split('\n')) {
  const m = /^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/.exec(line.trim());
  if (m === null) {
    if (line.trim().length > 0 && !/^\s/.test(line)) errors.push({ raw: line.trim() });
    continue;
  }
  const [, file, lineNoRaw, colRaw, message] = m;
  const rel = file.replaceAll('\\', '/').replace(/^.*\/blocks\//, 'blocks/');
  const map = fileMaps.get(rel);
  const lineNo = Number(lineNoRaw);
  if (map !== undefined) {
    const srcLine = map[lineNo - 1] ?? null;
    errors.push({ raw: `README.md:${srcLine ?? '?'} (${rel}:${lineNo}:${colRaw}) ${message}` });
  } else {
    errors.push({ raw: `${file}(${lineNoRaw},${colRaw}): ${message}` });
  }
}

if (run.status === 0 && errors.length === 0) {
  rmSync(work, { recursive: true, force: true });
  console.log(`README 코드 블록 ${blocks.length}개 — 전부 컴파일 통과.`);
  process.exit(0);
}

console.error(`README 코드 블록 ${blocks.length}개 중 컴파일 에러 발견:\n`);
for (const e of errors) console.error(`  ${e.raw}`);
console.error(`\n작업 디렉토리 보존: ${work}`);
process.exit(1);
