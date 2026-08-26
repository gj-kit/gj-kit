#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증 — expo-ui `scripts/check-readme.mjs`에서 복제(설계 문서 §10.5).
 *
 * README.md의 모든 ```ts 블록을 추출해 **dist 타입에 대해** tsc --noEmit로 검사한다.
 * 라이브러리 import는 tsconfig paths로 dist d.ts에 매핑하고(공개 서브패스 **4개** — §2.1 개수 정본), 예제가 가정하는 앱 소유 식별자는 ambient d.ts로 선언한다.
 *
 * 왜 소스가 아니라 dist인가: 소비자가 실제로 읽는 것이 `dist/*.d.ts`이기 때문이다.
 *
 * 그리고 이 스크립트는 설계 §10.6의 **문구 계약 3종**도 단언한다. 타입도 가드도 잡지 못하는
 * 것이 정확히 둘 있고(=`read: ['workouts']`의 의미 변화, `indoor`의 플랫폼 비대칭) 둘 다
 * **문구와 순서**로만 막힌다. 순서를 틀리면 "선택권"이 곧 함정이 된다.
 *
 * expo-media와 다른 점:
 * - 이 패키지에는 DOM 구현이 하나도 없다 → DOM 각인도, `./web` 서브패스도 없다.
 * - `lib`은 `["ES2022"]`만 준다.
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
const readmePath = join(pkgRoot, process.env.README_PATH ?? 'README.md');
const distDir = join(pkgRoot, 'dist');
if (!existsSync(join(distDir, 'index.d.ts'))) {
  console.error('dist/index.d.ts가 없습니다 — 먼저 pnpm build를 실행하세요.');
  process.exit(2);
}

// ── 1. ts 펜스 블록 추출 ────────────────────────────────────────────────────
const readmeLines = readFileSync(readmePath, 'utf8').split('\n');
const blocks = [];
for (let i = 0; i < readmeLines.length; i++) {
  if (!/^```ts\s*$/.test(readmeLines[i])) continue;
  const start = i + 1;
  let j = start;
  while (j < readmeLines.length && readmeLines[j].trim() !== '```') j++;
  blocks.push({ contentStartLine: start + 1, lines: readmeLines.slice(start, j) });
  i = j;
}
if (blocks.length === 0) {
  console.error('README에서 ts 코드 블록을 찾지 못했습니다.');
  process.exit(2);
}

// ── 2. 블록 → 컴파일 단위 파일 (.ts) ────────────────────────────────────────
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

// 작업 디렉토리는 패키지 루트 아래 — node_modules 해석을 자연스럽게 하기 위해서다
// (루트 .gitignore가 `.readme-check-*/`를 무시한다. 실패 시 보존되므로 그 규칙이 필요하다).
const work = mkdtempSync(join(pkgRoot, '.readme-check-'));
const blocksDir = join(work, 'blocks');
mkdirSync(blocksDir);

const fileMaps = new Map();

blocks.forEach((block, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fileName = `block-${n}.ts`;

  const preludeCount = splitPrelude(block.lines);
  const body = block.lines.slice(preludeCount);
  // `export`·`declare`가 있는 블록은 최상위여야 한다(함수 본문에서는 문법 에러).
  // 나머지는 `await`을 쓸 수 있도록 async 함수로 감싼다.
  const needsTopLevel = body.some((l) => /^(export|declare)\b/.test(l));

  const out = [];
  block.lines.slice(0, preludeCount).forEach((text, k) => {
    out.push({ text, srcLine: block.contentStartLine + k });
  });
  if (needsTopLevel) {
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
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
// 앱 소유 식별자(백엔드 클라이언트·UI 콜백·네이티브 파일 라이브러리)는 검증 대상이 아니므로
// 형태만 선언한다. 반면 **라이브러리 유래 식별자는 실타입**(`import(...)` 타입 구문)으로
// 선언해, 시그니처를 오용한 예제가 컴파일 에러가 되게 한다.
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.
//
// 라이브러리 유래 식별자는 **실타입**으로 선언해 시그니처를 오용한 예제가 컴파일 에러가 되게 하고,
// 앱 소유 식별자(로컬 저장소·UI 콜백)는 형태만 선언한다.

// ── 라이브러리 유래 (실타입) ──
declare const workouts: import('@gj-kit/expo-workouts/core').WorkoutsApi;

// ── 앱 소유 (검증 대상 아님) ──
declare const db: {
  readCursor(): Promise<string | null>;
  transaction<T>(run: (tx: {
    applyRekeys(rekeys: readonly { readonly fromId: string; readonly toId: string }[]): Promise<void>;
    upsert(workouts: readonly import('@gj-kit/expo-workouts/core').Workout[]): Promise<void>;
    deleteByIds(ids: readonly string[]): Promise<void>;
    writeCursor(cursor: string): Promise<void>;
  }) => Promise<T>): Promise<T>;
};
declare function showToast(message: string): void;
declare function renderMap(points: readonly import('@gj-kit/expo-workouts/core').RoutePoint[]): void;
`,
);

// ── 4. tsconfig — 라이브러리 import를 dist d.ts에 매핑 (공개 서브패스 4개) ────
const paths = {
  '@gj-kit/expo-workouts': [join(distDir, 'index.d.ts')],
  '@gj-kit/expo-workouts/core': [join(distDir, 'core.d.ts')],
  '@gj-kit/expo-workouts/testing': [join(distDir, 'testing.d.ts')],
  '@gj-kit/expo-workouts/plugin': [join(distDir, 'plugin.d.ts')],
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
        // Expo SDK 56's supported TypeScript 6 emits a deprecation diagnostic
        // for the path-mapping fixture's deliberate baseUrl setting.
        ignoreDeprecations: '6.0',
        noEmit: true,
        // 이 패키지에는 DOM 구현이 없다.
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

// ── 6. §10.6 문구 계약 3종 ──────────────────────────────────────────────────
// 문서가 유일한 방어인 지점이다. `read: ['workouts']`는 소유자 결정 ② 전후 모두 유효한 코드이고
// 결정 후 다른 일을 한다 — 컴파일러가 잡을 수 없는 유일한 종류의 breaking change다.
const readmeText = readFileSync(readmePath, 'utf8');
const wordingErrors = [];

if ((process.env.README_PATH ?? 'README.md') === 'README.ko.md') {
  const coarseRecipe = readmeText.indexOf("[...WORKOUT_TOTALS_SCOPES, 'routes']");
  const fineExplanation = readmeText.indexOf('Name the members individually');
  if (coarseRecipe < 0) {
    wordingErrors.push("§10.6-1: coarse 레시피 `read: [...WORKOUT_TOTALS_SCOPES, 'routes']`가 README에 없습니다.");
  } else if (fineExplanation >= 0 && coarseRecipe > fineExplanation) {
    wordingErrors.push('§10.6-1: coarse 레시피가 fine 설명보다 **뒤에** 있습니다. 순서가 곧 방어입니다.');
  }

  if (!readmeText.includes("`'workouts'` is the session list. It does not include totals.")) {
    wordingErrors.push(
      "§10.6-2: \"`'workouts'` is the session list. It does not include totals.\" 문장이 README에 없습니다.",
    );
  }

  if (!/^#{2,3}\s.*`indoor`.*asymmetr/im.test(readmeText)) {
    wordingErrors.push('§10.6-추가: `indoor`의 플랫폼 비대칭은 표 각주가 아니라 **자기 절**을 가져야 합니다.');
  }
}

if (run.status === 0 && errors.length === 0 && wordingErrors.length === 0) {
  rmSync(work, { recursive: true, force: true });
  console.log(`README 코드 블록 ${blocks.length}개 — 전부 컴파일 통과. 문구 계약 3종도 통과.`);
  process.exit(0);
}

if (wordingErrors.length > 0) {
  console.error('README 문구 계약 위반:\n');
  for (const message of wordingErrors) console.error(`  ${message}`);
}

console.error(`README 코드 블록 ${blocks.length}개 중 컴파일 에러 발견:\n`);
for (const e of errors) console.error(`  ${e.raw}`);
console.error(`\n작업 디렉토리 보존: ${work}`);
process.exit(1);
