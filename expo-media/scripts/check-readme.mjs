#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증 — expo-ui `scripts/check-readme.mjs`에서 복제(설계 문서 §10.5).
 *
 * README.md의 모든 ```ts 블록을 추출해 **dist 타입에 대해** tsc --noEmit로 검사한다.
 * 라이브러리 import는 tsconfig paths로 dist d.ts에 매핑하고(공개 서브패스 **9개** — §2.1 개수
 * 정본), 예제가 가정하는 앱 소유 식별자는 ambient d.ts로 선언한다.
 *
 * 왜 소스가 아니라 dist인가: 소비자가 실제로 읽는 것이 `dist/*.d.ts`이기 때문이다.
 * `./web`의 DOM 각인(§2.4 · scripts/stamp-dom-reference.mjs)처럼 **빌드 후처리로만 생기는
 * 성질**은 소스 검사로는 절대 발화하지 않는다 — 이 스크립트가 각인의 실제 소비자 시험이다.
 *
 * expo-ui와 다른 점:
 * - 예제에 JSX가 없다(이 패키지는 UI가 아니다) → 블록 파일은 `.tsx`가 아니라 `.ts`이고
 *   `jsx` 옵션도 없다. JSX 프래그먼트 래핑 분기 역시 통째로 뺐다.
 * - `lib`은 `["ES2022"]`만 준다. DOM 전역은 `dist/web.d.ts` 상단의 `/// <reference lib="dom" />`
 *   각인을 통해서만 프로그램에 들어온다 — 즉 **각인이 사라지면 `./web` 예제가 컴파일에서 죽는다**.
 *   무DOM 규율(§2.4)을 README 검증이 한 번 더 떠받치는 구조다.
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

// ── 앱 소유 도메인 타입 — 킷의 \`TAsset\` 자리에 들어가는 호스트 자산 ──
type Photo = { readonly id: string; readonly url: string };

// ── 라이브러리 유래 (실타입) ──
declare const api: import('@gj-kit/expo-media').MediaUploadApi<Photo>;
declare const media: import('@gj-kit/expo-media').MediaKit<Photo>;

// ── 앱 소유 (검증 대상 아님) ──
declare const isExpoGo: boolean;
declare const assetUri: string;
/** 웹 드롭존이 넘겨주는 DOM File 배열. \`NamedBinarySource\`를 구조적으로 만족한다. */
declare const droppedFiles: readonly File[];
declare function openPermissionSettings(): void;
declare function promptICloudDownload(): void;
declare function showToast(message: string): void;
declare function setICloudBanner(downloading: boolean): void;
declare function trackClientActivity(input: unknown, run: unknown): any;
declare function beginClientActivity(input: unknown): any;

/** bare RN 예제가 쓰는 네이티브 파일 라이브러리(react-native-fs 형태). */
declare const rnfs: {
  readonly CachesDirectoryPath: string;
  stat(path: string): Promise<{ isFile(): boolean; size: number }>;
  copyFile(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
  read(path: string, length: number, position: number, encoding: 'base64'): Promise<string>;
  uploadFiles(input: {
    readonly toUrl: string;
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly files: readonly { readonly filepath: string }[];
  }): { readonly promise: Promise<{ readonly statusCode: number }> };
};

// ── expo peer — 예제가 직접 import하는 경우를 위한 ambient 선언 ──
// (dist d.ts는 expo-* 타입을 공개 시그니처에 노출하지 않으므로 여기서만 쓰인다.)
declare module 'expo-constants' {
  const Constants: { readonly appOwnership: string | null };
  export default Constants;
}
`,
);

// ── 4. tsconfig — 라이브러리 import를 dist d.ts에 매핑 (공개 서브패스 9개) ───
const paths = {
  '@gj-kit/expo-media': [join(distDir, 'index.d.ts')],
  '@gj-kit/expo-media/core': [join(distDir, 'core.d.ts')],
  '@gj-kit/expo-media/picker': [join(distDir, 'picker.d.ts')],
  '@gj-kit/expo-media/device': [join(distDir, 'device.d.ts')],
  '@gj-kit/expo-media/save': [join(distDir, 'save.d.ts')],
  '@gj-kit/expo-media/video': [join(distDir, 'video.d.ts')],
  '@gj-kit/expo-media/web': [join(distDir, 'web.d.ts')],
  '@gj-kit/expo-media/testing': [join(distDir, 'testing.d.ts')],
  '@gj-kit/expo-media/storage': [join(distDir, 'storage.d.ts')],
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
        // DOM은 여기서 주지 않는다 — `dist/web.d.ts`의 각인으로만 들어온다(파일 헤더 참고).
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
