#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증 — expo-media `scripts/check-readme.mjs`에서 복제
 * (설계 문서 §5.4 · expo-ui 원류).
 *
 * README.md의 모든 ```ts 블록을 추출해 **dist 타입에 대해** tsc --noEmit로 검사한다.
 * 라이브러리 import는 tsconfig paths로 dist d.ts에 매핑하고(공개 서브패스 **3개** — §2.1 개수
 * 정본), 예제가 가정하는 앱 소유 식별자는 ambient d.ts로 선언한다.
 *
 * 왜 소스가 아니라 dist인가: 소비자가 실제로 읽는 것이 `dist/*.d.ts`이기 때문이다.
 *
 * expo-media와 다른 점:
 * - `lib`은 `["ES2022"]`만 준다. 이 패키지는 DOM 각인 자체가 없다(§2.4) — README의 어떤
 *   블록도 DOM lib 없이 컴파일돼야 하고, `./storage`가 조건 무관 단일 d.ts이므로 각인 분기 불요.
 * - `types: []` — node 전역이 우연히 예제를 통과시키지 않게 한다.
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
// 앱 소유 식별자(HTTP 스택·화면 전환·telemetry)는 검증 대상이 아니므로 형태만 선언한다.
// 반면 **라이브러리 유래 식별자는 실타입**(`import(...)` 타입 구문)으로 선언해,
// 시그니처를 오용한 예제가 컴파일 에러가 되게 한다.
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.

// ── 라이브러리 유래 (실타입) ──
type __TokenPair = import('@gj-kit/expo-auth').TokenPair;
declare const session: import('@gj-kit/expo-auth').AuthSession;

// ── 앱 소유 (검증 대상 아님) ──
/** 앱 HTTP 스택의 refresh 엔드포인트 호출. */
declare function postRefresh(refreshToken: string): Promise<
  | { readonly kind: 'rotated'; readonly tokens: __TokenPair; readonly expiresIn: number }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'transport' }
>;
/** 로그인 API 응답. */
declare const loginResponse: { readonly tokens: __TokenPair; readonly expiresIn: number };
declare const stayLoggedIn: boolean;
/** 웹 visibilitychange / 네이티브 AppState change를 감싼 앱 소유 배선 지점. */
declare function onAppForeground(listener: () => void): void;
declare function fetchMe(accessToken: string | null): Promise<{ readonly id: string }>;
declare function isApiError(error: unknown): error is { readonly status: number };
declare function showSignInScreen(): void;
declare function reconfirmSubject(): Promise<void>;
declare function sendTelemetry(event: string, data: Readonly<Record<string, unknown>>): void;
/** 커스텀 storage 예제가 가정하는 앱 소유 key-value 계층. */
declare const kv: {
  read(): Promise<__TokenPair | null>;
  write(
    tokens: __TokenPair,
    persistence: import('@gj-kit/expo-auth').TokenPersistence | undefined,
  ): Promise<void>;
  clear(): Promise<void>;
};
`,
);

// ── 4. tsconfig — 라이브러리 import를 dist d.ts에 매핑 (공개 서브패스 3개) ───
const paths = {
  '@gj-kit/expo-auth': [join(distDir, 'index.d.ts')],
  '@gj-kit/expo-auth/storage': [join(distDir, 'storage.d.ts')],
  '@gj-kit/expo-auth/testing': [join(distDir, 'testing.d.ts')],
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
        // TypeScript 6은 픽스처의 의도적 baseUrl 사용에 deprecation 진단을 낸다.
        ignoreDeprecations: '6.0',
        noEmit: true,
        // DOM도 node도 주지 않는다 — 이 패키지의 d.ts와 README 예제는 전부 무DOM이다(§2.4).
        lib: ['ES2022'],
        types: [],
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
